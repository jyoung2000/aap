"""Apply queue + human-in-the-loop API (web/session side)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..core.orchestration import record_saved_answer, resolve_fields
from ..core.scoping import get_owned
from ..core.state_machine import transition
from ..db import get_db, utcnow
from ..models import (
    FILLING,
    MODE_MANUAL,
    NEEDS_HUMAN,
    QUEUED,
    SKIPPED,
    Application,
    Intervention,
    Job,
    User,
)
from ..queue import enqueue
from ..redis_bus import publish
from ..schemas.applications import (
    ApplicationCreate,
    ApplicationOut,
    FieldResolveRequest,
    FunnelUpdate,
    InterventionAnswer,
    InterventionOut,
)

router = APIRouter(prefix="/api", tags=["applications"])


def serialize_application(db: Session, app: Application, with_events: bool = False) -> ApplicationOut:
    job = db.get(Job, app.job_id)
    open_iv = len([i for i in app.interventions if not i.resolved])
    out = ApplicationOut(
        id=app.id, job_id=app.job_id,
        job_title=job.title if job else "", job_company=job.company if job else "",
        job_source=job.source if job else "", apply_url=job.apply_url if job else "",
        status=app.status, mode=app.mode, executor=app.executor, humanized=app.humanized,
        review_first=app.review_first, field_snapshot=app.field_snapshot,
        confirmation_screenshot=app.confirmation_screenshot, error=app.error,
        submitted_at=app.submitted_at, funnel_status=app.funnel_status,
        created_at=app.created_at, updated_at=app.updated_at,
        events=app.events if with_events else [], open_interventions=open_iv,
    )
    return out


@router.post("/applications", response_model=list[ApplicationOut], status_code=201)
async def create_applications(
    payload: ApplicationCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    humanized = user.humanized_input if payload.humanized is None else payload.humanized
    created: list[Application] = []
    for job_id in payload.job_ids:
        job = db.get(Job, job_id)
        if not job or job.user_id != user.id:
            continue
        # Skip if already queued/active for this job.
        existing = db.scalar(
            select(Application).where(Application.user_id == user.id, Application.job_id == job_id)
        )
        executor = payload.executor
        if executor == "playwright" and not job.server_apply_capable:
            executor = "extension"  # only bot-friendly boards route to the server executor
        app = existing or Application(user_id=user.id, job_id=job_id)
        app.mode = payload.mode
        app.executor = executor
        app.humanized = humanized
        app.review_first = payload.review_first
        if app.status not in (QUEUED,):
            # reset re-queued items
            app.status = QUEUED
            app.error = ""
        db.add(app)
        db.flush()
        created.append(app)
    db.commit()

    # Kick off the run.
    playwright_apps = [a for a in created if a.executor == "playwright"]
    extension_apps = [a for a in created if a.executor == "extension"]
    for a in playwright_apps:
        await enqueue("run_server_apply_task", user.id, a.id)
    if extension_apps:
        await publish(user.id, {"type": "run.start", "target": "ext", "count": len(extension_apps)})
    await publish(user.id, {"type": "queue.updated", "target": "web"})
    return [serialize_application(db, a) for a in created]


@router.get("/applications", response_model=list[ApplicationOut])
def list_applications(
    status: str | None = None,
    funnel: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Application).where(Application.user_id == user.id)
    if status:
        stmt = stmt.where(Application.status == status)
    if funnel:
        stmt = stmt.where(Application.funnel_status == funnel)
    apps = db.scalars(stmt.order_by(Application.updated_at.desc()).limit(500)).all()
    return [serialize_application(db, a) for a in apps]


@router.get("/applications/{app_id}", response_model=ApplicationOut)
def get_application(app_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    app = get_owned(db, Application, app_id, user.id)
    return serialize_application(db, app, with_events=True)


@router.post("/applications/{app_id}/retry", response_model=ApplicationOut)
async def retry_application(app_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    app = get_owned(db, Application, app_id, user.id)
    transition(db, app, QUEUED, note="Re-queued by user")
    app.error = ""
    db.commit()
    if app.executor == "playwright":
        await enqueue("run_server_apply_task", user.id, app.id)
    else:
        await publish(user.id, {"type": "run.start", "target": "ext", "count": 1})
    return serialize_application(db, app)


@router.post("/applications/{app_id}/skip", response_model=ApplicationOut)
def skip_application(app_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    app = get_owned(db, Application, app_id, user.id)
    transition(db, app, SKIPPED, note="Skipped by user")
    return serialize_application(db, app)


@router.patch("/applications/{app_id}/funnel", response_model=ApplicationOut)
def update_funnel(app_id: str, payload: FunnelUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    app = get_owned(db, Application, app_id, user.id)
    app.funnel_status = payload.funnel_status
    db.commit()
    return serialize_application(db, app)


@router.post("/applications/{app_id}/resolve-fields")
def resolve_application_fields(
    app_id: str, payload: FieldResolveRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Preview resolution for a set of fields (used by the web UI / Playwright)."""
    app = get_owned(db, Application, app_id, user.id)
    return resolve_fields(db, user, app, [f.model_dump() for f in payload.fields])


# ---------------- Human-in-the-loop queue ----------------
@router.get("/queue", response_model=list[InterventionOut])
def get_queue(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """All open interventions across the user's applications, newest first."""
    ivs = db.scalars(
        select(Intervention).where(Intervention.user_id == user.id, Intervention.resolved.is_(False)).order_by(Intervention.created_at.desc())
    ).all()
    out = []
    for iv in ivs:
        app = db.get(Application, iv.application_id)
        job = db.get(Job, app.job_id) if app else None
        item = InterventionOut.model_validate(iv)
        item.job_title = job.title if job else ""
        item.job_company = job.company if job else ""
        out.append(item)
    return out


@router.post("/interventions/{iv_id}/answer", response_model=InterventionOut)
async def answer_intervention_web(
    iv_id: str, payload: InterventionAnswer, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Answer an intervention from the web UI (remote intervention flow)."""
    iv = get_owned(db, Intervention, iv_id, user.id)
    app = db.get(Application, iv.application_id)
    executor = app.executor if app else "extension"
    result = _apply_answer(db, user, iv, payload.answer, payload.save_to_kb)
    # Relay the answer to the executor (extension or Playwright) to continue the live form.
    await publish(user.id, {
        "type": "intervention.answered", "target": "all",
        "application_id": iv.application_id, "intervention_id": iv.id,
        "label": iv.field_label, "answer": payload.answer, "kind": iv.kind,
    })
    # For the Playwright executor, re-enqueue the (re-entrant) apply task to continue.
    app = db.get(Application, iv.application_id)
    if executor == "playwright" and app and app.status in (FILLING, QUEUED):
        await enqueue("run_server_apply_task", user.id, app.id)
    return result


def _apply_answer(db: Session, user: User, iv: Intervention, answer: str, save_to_kb: bool) -> InterventionOut:
    iv.answer = answer
    iv.resolved = True
    iv.resolved_at = utcnow()
    iv.save_to_kb = save_to_kb
    db.commit()
    if save_to_kb and iv.kind == "field" and iv.field_label:
        record_saved_answer(db, user, iv.field_label, answer)
    # If no more open interventions, move the application back to filling.
    app = db.get(Application, iv.application_id)
    if app and app.status == NEEDS_HUMAN:
        remaining = [i for i in app.interventions if not i.resolved]
        if not remaining:
            transition(db, app, FILLING, note="Human input received")
    return InterventionOut.model_validate(iv)
