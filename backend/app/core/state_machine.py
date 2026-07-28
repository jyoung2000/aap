"""Application state machine. Every transition is validated, timestamped, stored
as an ApplicationEvent, and pushed to the user's web UI in real time."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..db import utcnow
from ..models import ALLOWED_TRANSITIONS, SUBMITTED, Application, ApplicationEvent
from ..redis_bus import publish_sync


class InvalidTransition(ValueError):
    pass


def can_transition(from_state: str, to_state: str) -> bool:
    if from_state == to_state:
        return True
    return to_state in ALLOWED_TRANSITIONS.get(from_state, set())


def transition(
    db: Session, app: Application, to_state: str, note: str = "", *, notify: bool = True
) -> Application:
    """Move an application to `to_state`, enforcing the allowed graph."""
    from_state = app.status
    if not can_transition(from_state, to_state):
        raise InvalidTransition(f"Cannot move {from_state} -> {to_state}")

    now = utcnow()
    if from_state != to_state:
        app.status = to_state
        db.add(ApplicationEvent(application_id=app.id, from_state=from_state, to_state=to_state, at=now, note=note))
    if to_state == SUBMITTED and app.submitted_at is None:
        app.submitted_at = now
    db.commit()

    if notify:
        publish_sync(app.user_id, {
            "type": "application.update",
            "target": "web",
            "application_id": app.id,
            "job_id": app.job_id,
            "status": app.status,
            "note": note,
        })
    return app
