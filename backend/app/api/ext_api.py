"""Extension-facing API (device-token auth). The extension pulls queue items,
resolves fields, raises interventions, and reports results here."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.deps import get_device_user
from ..core.orchestration import raise_blocker, record_saved_answer, resolve_fields, velocity_ok
from ..core.scoping import get_owned
from ..core.state_machine import transition
from ..db import get_db, utcnow
from ..models import (
    FAILED,
    FILLING,
    NEEDS_HUMAN,
    QUEUED,
    SKIPPED,
    SUBMITTED,
    Application,
    Device,
    Intervention,
    Job,
    User,
)
from ..redis_bus import publish_sync
from ..schemas.applications import (
    FieldResolveRequest,
    InterventionAnswer,
    ResultReport,
)

router = APIRouter(prefix="/api/ext", tags=["extension"])


@router.get("/ping")
def ping(du: tuple[Device, User] = Depends(get_device_user)):
    device, user = du
    return {"ok": True, "user_id": user.id, "device_id": device.id, "humanized_default": user.humanized_input}


@router.get("/queue/next")
def next_queued(du: tuple[Device, User] = Depends(get_device_user), db: Session = Depends(get_db)):
    """Hand the extension the next queued application, one at a time, honoring the
    submission velocity cap."""
    device, user = du
    ok, remaining = velocity_ok(db, user)
    if not ok:
        return {"application": None, "reason": "rate_limited", "retry_after": 300, "remaining": remaining}
    app = db.scalar(
        select(Application).where(
            Application.user_id == user.id,
            Application.status == QUEUED,
            Application.executor == "extension",
        ).order_by(Application.created_at.asc())
    )
    if not app:
        return {"application": None, "reason": "empty"}
    app.device_id = device.id
    transition(db, app, FILLING, note="Picked up by extension")
    job = db.get(Job, app.job_id)
    return {
        "application": {
            "id": app.id, "job_id": app.job_id, "apply_url": job.apply_url if job else "",
            "title": job.title if job else "", "company": job.company if job else "",
            "source": job.source if job else "", "mode": app.mode,
            "humanized": app.humanized, "review_first": app.review_first,
        },
        "remaining_this_hour": remaining,
    }


@router.post("/applications/{app_id}/resolve-fields")
def ext_resolve_fields(
    app_id: str, payload: FieldResolveRequest, du: tuple[Device, User] = Depends(get_device_user), db: Session = Depends(get_db)
):
    device, user = du
    app = get_owned(db, Application, app_id, user.id)
    result = resolve_fields(db, user, app, [f.model_dump() for f in payload.fields])
    if result["interventions"] and app.status != NEEDS_HUMAN:
        transition(db, app, NEEDS_HUMAN, note="Awaiting human input")
    return result


@router.post("/applications/{app_id}/intervention")
def ext_raise_blocker(
    app_id: str, kind: str = "captcha", screenshot: str = "", question: str = "",
    du: tuple[Device, User] = Depends(get_device_user), db: Session = Depends(get_db),
):
    """The extension hit a CAPTCHA / login wall and needs a human."""
    device, user = du
    app = get_owned(db, Application, app_id, user.id)
    iv = raise_blocker(db, user, app, kind, screenshot=screenshot, question=question)
    if app.status != NEEDS_HUMAN:
        transition(db, app, NEEDS_HUMAN, note=f"Blocked: {kind}")
    return {"intervention_id": iv.id}


@router.get("/interventions")
def ext_list_interventions(
    application_id: str | None = None, du: tuple[Device, User] = Depends(get_device_user), db: Session = Depends(get_db)
):
    device, user = du
    stmt = select(Intervention).where(Intervention.user_id == user.id, Intervention.resolved.is_(False))
    if application_id:
        stmt = stmt.where(Intervention.application_id == application_id)
    ivs = db.scalars(stmt.order_by(Intervention.created_at.desc())).all()
    return [
        {
            "id": iv.id, "application_id": iv.application_id, "kind": iv.kind,
            "label": iv.field_label, "field_type": iv.field_type, "options": iv.options,
            "question": iv.question, "screenshot": iv.screenshot,
        }
        for iv in ivs
    ]


@router.post("/interventions/{iv_id}/answer")
def ext_answer_intervention(
    iv_id: str, payload: InterventionAnswer, du: tuple[Device, User] = Depends(get_device_user), db: Session = Depends(get_db)
):
    """Answer an intervention locally from the extension popup."""
    device, user = du
    iv = get_owned(db, Intervention, iv_id, user.id)
    iv.answer = payload.answer
    iv.resolved = True
    iv.resolved_at = utcnow()
    iv.save_to_kb = payload.save_to_kb
    db.commit()
    if payload.save_to_kb and iv.kind == "field" and iv.field_label:
        record_saved_answer(db, user, iv.field_label, payload.answer)
    app = db.get(Application, iv.application_id)
    if app and app.status == NEEDS_HUMAN and not [i for i in app.interventions if not i.resolved]:
        transition(db, app, FILLING, note="Human input received (local)")
    # Notify the web UI it was resolved elsewhere.
    publish_sync(user.id, {"type": "intervention.resolved", "target": "web", "intervention_id": iv.id, "application_id": iv.application_id})
    return {"ok": True}


@router.post("/applications/{app_id}/result")
def ext_report_result(
    app_id: str, payload: ResultReport, du: tuple[Device, User] = Depends(get_device_user), db: Session = Depends(get_db)
):
    """The extension reports the outcome of an application run."""
    device, user = du
    app = get_owned(db, Application, app_id, user.id)
    target = {"submitted": SUBMITTED, "failed": FAILED, "needs_human": NEEDS_HUMAN, "skipped": SKIPPED}.get(payload.status)
    if not target:
        return Response(status_code=400)
    if payload.field_snapshot:
        app.field_snapshot = payload.field_snapshot
    if payload.confirmation_screenshot:
        app.confirmation_screenshot = payload.confirmation_screenshot
    if payload.error:
        app.error = payload.error
    db.commit()
    transition(db, app, target, note=f"Extension reported {payload.status}")
    return {"ok": True, "status": app.status}
