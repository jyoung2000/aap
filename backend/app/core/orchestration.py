"""Apply orchestration service: resolve detected form fields through the pipeline,
raise human-in-the-loop interventions, enforce the submission velocity cap, and
persist knowledge-base answers."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import utcnow
from ..models import (
    SUBMITTED,
    Application,
    CustomField,
    Intervention,
    Job,
    Profile,
    SavedAnswer,
    User,
    WorkExperience,
)
from ..redis_bus import publish_sync
from .resolver import normalize_question, resolve_field

# A canonical slice of the standard 2026 ATS field library. Used by the Playwright
# executor and demos when no live DOM is available; the extension sends the real
# detected fields instead.
STANDARD_FIELDS: list[dict] = [
    {"label": "First name", "type": "text", "options": []},
    {"label": "Last name", "type": "text", "options": []},
    {"label": "Email", "type": "email", "options": []},
    {"label": "Phone", "type": "tel", "options": []},
    {"label": "Location (City)", "type": "text", "options": []},
    {"label": "LinkedIn Profile", "type": "url", "options": []},
    {"label": "GitHub", "type": "url", "options": []},
    {"label": "Are you legally authorized to work in the United States?", "type": "select", "options": ["Yes", "No"]},
    {"label": "Will you now or in the future require sponsorship?", "type": "select", "options": ["Yes", "No"]},
    {"label": "Preferred work model", "type": "select", "options": ["Remote", "Hybrid", "Onsite"]},
    {"label": "Are you willing to relocate?", "type": "select", "options": ["Yes", "No"]},
    {"label": "Desired salary", "type": "text", "options": []},
    {"label": "Earliest start date", "type": "date", "options": []},
    {"label": "Years of experience", "type": "number", "options": []},
    {"label": "How did you hear about this role?", "type": "text", "options": []},
    {"label": "Are you 18 years or older?", "type": "select", "options": ["Yes", "No"]},
    {"label": "Veteran status", "type": "select", "options": ["I am a veteran", "I am not a veteran", "Decline to self-identify"]},
    {"label": "Disability status", "type": "select", "options": ["Yes", "No", "Decline to self-identify"]},
    {"label": "Gender", "type": "select", "options": ["Male", "Female", "Non-binary", "Decline to self-identify"]},
    {"label": "Race/Ethnicity", "type": "select", "options": ["Asian", "Black", "Hispanic", "White", "Two or more races", "Decline to self-identify"]},
    {"label": "I agree to the privacy policy", "type": "boolean", "options": ["Yes", "No"]},
    {"label": "Why do you want to work here?", "type": "textarea", "options": []},
]


def _profile_bundle(db: Session, user: User) -> tuple[Profile, list[CustomField], list[SavedAnswer]]:
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    customs = list(db.scalars(select(CustomField).where(CustomField.user_id == user.id)).all())
    saved = list(db.scalars(select(SavedAnswer).where(SavedAnswer.user_id == user.id)).all())
    return profile, customs, saved


def _resume_text(db: Session, user: User) -> str:
    from ..models import ProfileFile

    row = db.scalar(
        select(ProfileFile).where(ProfileFile.user_id == user.id, ProfileFile.kind == "resume", ProfileFile.is_default.is_(True))
    )
    if not row:
        row = db.scalar(select(ProfileFile).where(ProfileFile.user_id == user.id, ProfileFile.kind == "resume"))
    return (row.extracted_text if row else "") or ""


def resolve_fields(db: Session, user: User, application: Application, fields: list[dict]) -> dict:
    """Resolve a batch of detected fields. Auto-fillable ones return values; anything
    unresolved/low-confidence/knockout becomes a human-in-the-loop Intervention."""
    profile, customs, saved = _profile_bundle(db, user)
    job = db.get(Job, application.job_id)
    resume_text = _resume_text(db, user)
    use_llm = application.mode != "manual"

    resolved: list[dict] = []
    interventions: list[dict] = []

    for f in fields:
        label = f.get("label", "")
        ftype = f.get("type", "text")
        options = f.get("options", []) or []
        r = resolve_field(
            label=label, field_type=ftype, options=options,
            profile=profile, custom_fields=customs, saved_answers=saved,
            how_heard_default=user.how_heard_default,
            resume_text=resume_text,
            job_description=(job.description if job else ""),
            use_llm=use_llm,
        )
        entry = {
            "label": label, "type": ftype, "value": r.value,
            "confidence": round(r.confidence, 2), "source": r.source,
            "needs_human": r.needs_human, "is_knockout": r.is_knockout,
        }
        # In review-first or auto mode, low-confidence LLM drafts are surfaced for review.
        if r.needs_human or (application.review_first and r.source == "llm"):
            iv = _raise_intervention(db, user, application, r, label, ftype, options, f.get("screenshot", ""))
            interventions.append(iv)
            entry["intervention_id"] = iv["id"]
        elif r.auto_fillable or r.value:
            resolved.append(entry)

    return {"resolved": resolved, "interventions": interventions}


def _raise_intervention(db, user, application, r, label, ftype, options, screenshot="") -> dict:
    kind = "field"
    question = label
    iv = Intervention(
        user_id=user.id, application_id=application.id, kind=kind,
        field_label=label, field_type=ftype, options=options,
        question=question, screenshot=screenshot, save_to_kb=True,
    )
    db.add(iv)
    db.commit()
    # Push to the web UI (Apply Queue) AND the extension in real time.
    publish_sync(user.id, {
        "type": "intervention.new", "target": "all",
        "application_id": application.id, "intervention_id": iv.id,
        "kind": kind, "label": label, "field_type": ftype, "options": options,
        "question": question, "screenshot": screenshot, "is_knockout": r.is_knockout,
    })
    return {
        "id": iv.id, "kind": kind, "label": label, "field_type": ftype,
        "options": options, "question": question, "is_knockout": r.is_knockout,
    }


def raise_blocker(db: Session, user: User, application: Application, kind: str, screenshot: str = "", question: str = "") -> Intervention:
    """Raise a CAPTCHA / login-wall intervention (never auto-solved)."""
    iv = Intervention(
        user_id=user.id, application_id=application.id, kind=kind,
        field_label="", field_type="text", options=[],
        question=question or ("Solve the CAPTCHA to continue" if kind == "captcha" else "Sign in to continue"),
        screenshot=screenshot, save_to_kb=False,
    )
    db.add(iv)
    db.commit()
    publish_sync(user.id, {
        "type": "intervention.new", "target": "all",
        "application_id": application.id, "intervention_id": iv.id,
        "kind": kind, "question": iv.question, "screenshot": screenshot,
    })
    return iv


def record_saved_answer(db: Session, user: User, question: str, answer: str) -> None:
    """Write a HITL answer to the knowledge base so it's never asked again."""
    key = normalize_question(question)
    existing = db.scalar(
        select(SavedAnswer).where(SavedAnswer.user_id == user.id, SavedAnswer.question_key == key)
    )
    if existing:
        existing.answer = answer
    else:
        db.add(SavedAnswer(user_id=user.id, question=question, answer=answer, question_key=key, source="hitl"))
    db.commit()


def applications_in_last_hour(db: Session, user: User) -> int:
    cutoff = utcnow() - timedelta(hours=1)
    rows = db.scalars(
        select(Application).where(
            Application.user_id == user.id,
            Application.status == SUBMITTED,
            Application.submitted_at >= cutoff,
        )
    ).all()
    return len(list(rows))


def velocity_ok(db: Session, user: User) -> tuple[bool, int]:
    """Return (allowed, remaining) against the per-user submissions/hour cap."""
    cap = max(1, user.max_applications_per_hour or 15)
    used = applications_in_last_hour(db, user)
    return used < cap, max(0, cap - used)
