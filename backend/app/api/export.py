"""Import / export: job lists (CSV/JSON), full profile (JSON), application history
(CSV), and a zip bundle including uploaded files."""
from __future__ import annotations

import csv
import io
import json
import os
import zipfile

from fastapi import APIRouter, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..db import get_db
from ..models import (
    CustomField,
    Education,
    Job,
    Profile,
    ProfileFile,
    Recommendation,
    SavedAnswer,
    User,
    WorkExperience,
    Application,
)

router = APIRouter(prefix="/api", tags=["import-export"])


def _profile_dict(db: Session, user: User) -> dict:
    prof = db.scalar(select(Profile).where(Profile.user_id == user.id))
    exp = db.scalars(select(WorkExperience).where(WorkExperience.user_id == user.id).order_by(WorkExperience.order)).all()
    edu = db.scalars(select(Education).where(Education.user_id == user.id).order_by(Education.order)).all()
    recs = db.scalars(select(Recommendation).where(Recommendation.user_id == user.id)).all()
    customs = db.scalars(select(CustomField).where(CustomField.user_id == user.id)).all()
    saved = db.scalars(select(SavedAnswer).where(SavedAnswer.user_id == user.id)).all()
    files = db.scalars(select(ProfileFile).where(ProfileFile.user_id == user.id)).all()

    def cols(obj, drop=("id", "user_id", "stored_path", "extracted_text", "created_at", "updated_at", "file_id")):
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns if c.name not in drop}

    return {
        "version": 1,
        "personal": cols(prof) if prof else {},
        "work_experience": [cols(e) for e in exp],
        "education": [cols(e) for e in edu],
        "recommendations": [cols(r) for r in recs],
        "custom_fields": [cols(c) for c in customs],
        "saved_answers": [{"question": s.question, "answer": s.answer} for s in saved],
        "files": [{"kind": f.kind, "filename": f.filename, "is_default": f.is_default} for f in files],
    }


def _jobs_rows(db: Session, user: User) -> list[dict]:
    jobs = db.scalars(select(Job).where(Job.user_id == user.id)).all()
    return [
        {
            "title": j.title, "company": j.company, "location": j.location, "remote": j.remote,
            "salary": j.salary_text, "education_level": j.education_level, "post_date": j.post_date,
            "source": j.source, "match_score": j.match_score, "apply_url": j.apply_url,
            "canonical_url": j.canonical_url, "summary": j.summary,
        }
        for j in jobs
    ]


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _json_response(data, filename: str) -> StreamingResponse:
    payload = json.dumps(data, indent=2, default=str)
    return StreamingResponse(
        iter([payload]), media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/jobs.csv")
def export_jobs_csv(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _csv_response(_jobs_rows(db, user), "jobpilot-jobs.csv")


@router.get("/export/jobs.json")
def export_jobs_json(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _json_response(_jobs_rows(db, user), "jobpilot-jobs.json")


@router.get("/export/profile.json")
def export_profile_json(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _json_response(_profile_dict(db, user), "jobpilot-profile.json")


@router.get("/export/applications.csv")
def export_applications_csv(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    apps = db.scalars(select(Application).where(Application.user_id == user.id)).all()
    job_by_id = {j.id: j for j in db.scalars(select(Job).where(Job.user_id == user.id)).all()}
    rows = []
    for a in apps:
        j = job_by_id.get(a.job_id)
        rows.append({
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else "",
            "created_at": a.created_at.isoformat(),
            "job_title": j.title if j else "", "company": j.company if j else "",
            "source": j.source if j else "", "mode": a.mode, "executor": a.executor,
            "status": a.status, "funnel_status": a.funnel_status,
            "confirmation_screenshot": a.confirmation_screenshot,
        })
    return _csv_response(rows, "jobpilot-applications.csv")


@router.get("/export/all.zip")
def export_all_zip(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("profile.json", json.dumps(_profile_dict(db, user), indent=2, default=str))
        zf.writestr("jobs.json", json.dumps(_jobs_rows(db, user), indent=2, default=str))
        # application history CSV
        apps = db.scalars(select(Application).where(Application.user_id == user.id)).all()
        job_by_id = {j.id: j for j in db.scalars(select(Job).where(Job.user_id == user.id)).all()}
        sbuf = io.StringIO()
        w = csv.writer(sbuf)
        w.writerow(["submitted_at", "job_title", "company", "source", "status", "funnel_status"])
        for a in apps:
            j = job_by_id.get(a.job_id)
            w.writerow([a.submitted_at, j.title if j else "", j.company if j else "", j.source if j else "", a.status, a.funnel_status])
        zf.writestr("applications.csv", sbuf.getvalue())
        # include uploaded files
        for f in db.scalars(select(ProfileFile).where(ProfileFile.user_id == user.id)).all():
            if f.stored_path and os.path.exists(f.stored_path):
                zf.write(f.stored_path, arcname=f"files/{f.kind}/{f.filename}")
    mem.seek(0)
    return StreamingResponse(
        mem, media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=jobpilot-export.zip"},
    )


# ---------------- Import ----------------
@router.post("/import/profile")
async def import_profile(
    apply: bool = Form(False),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw = await file.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "Invalid JSON"}

    preview = {
        "personal_fields": len(data.get("personal", {})),
        "work_experience": len(data.get("work_experience", [])),
        "education": len(data.get("education", [])),
        "custom_fields": len(data.get("custom_fields", [])),
        "saved_answers": len(data.get("saved_answers", [])),
    }
    if not apply:
        return {"preview": preview, "applied": False}

    prof = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if prof and data.get("personal"):
        valid = {c.name for c in Profile.__table__.columns}
        for k, v in data["personal"].items():
            if k in valid and k not in ("id", "user_id"):
                setattr(prof, k, v)
    for i, we in enumerate(data.get("work_experience", [])):
        db.add(WorkExperience(user_id=user.id, order=i, **{k: we.get(k) for k in ("title", "company", "location", "start_date", "end_date", "current", "bullets") if k in we}))
    for i, ed in enumerate(data.get("education", [])):
        db.add(Education(user_id=user.id, order=i, **{k: ed.get(k) for k in ("degree", "field_of_study", "school", "graduation_year", "gpa") if k in ed}))
    for cf in data.get("custom_fields", []):
        db.add(CustomField(user_id=user.id, **{k: cf.get(k) for k in ("label", "type", "options", "value", "order") if k in cf}))
    from ..core.resolver import normalize_question
    for sa in data.get("saved_answers", []):
        db.add(SavedAnswer(user_id=user.id, question=sa.get("question", ""), answer=sa.get("answer", ""), question_key=normalize_question(sa.get("question", "")), source="manual"))
    db.commit()
    return {"preview": preview, "applied": True}


@router.post("/import/jobs")
async def import_jobs(
    mapping: str = Form("{}"),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import external job lists (CSV or JSON) with a column mapping."""
    raw = (await file.read()).decode("utf-8", errors="ignore")
    try:
        colmap = json.loads(mapping)
    except json.JSONDecodeError:
        colmap = {}

    items: list[dict] = []
    name = (file.filename or "").lower()
    if name.endswith(".json"):
        parsed = json.loads(raw)
        items = parsed if isinstance(parsed, list) else parsed.get("jobs", [])
    else:
        items = list(csv.DictReader(io.StringIO(raw)))

    def field(row, key, default=""):
        src = colmap.get(key, key)
        return row.get(src, default)

    from ..sources.registry import dedupe_key
    from ..sources.base import RawListing

    count = 0
    for row in items:
        title = field(row, "title")
        if not title:
            continue
        listing = RawListing(
            source="import", title=title, company=field(row, "company"),
            location=field(row, "location"), apply_url=field(row, "apply_url") or field(row, "url"),
            canonical_url=field(row, "canonical_url") or field(row, "url"),
            salary_text=field(row, "salary", "Not listed"), description=field(row, "description"),
        )
        key = dedupe_key(listing)
        existing = db.scalar(select(Job).where(Job.user_id == user.id, Job.dedupe_key == key))
        if existing:
            continue
        db.add(Job(
            user_id=user.id, source="import", title=listing.title, company=listing.company,
            location=listing.location, apply_url=listing.apply_url, canonical_url=listing.canonical_url,
            salary_text=listing.salary_text, description=listing.description, dedupe_key=key,
        ))
        count += 1
    db.commit()
    return {"imported": count}
