"""Application state-machine transition tests."""
from __future__ import annotations

import uuid

import pytest

from app.core.state_machine import InvalidTransition, can_transition, transition
from app.db import SessionLocal
from app.models import (
    FAILED,
    FILLING,
    NEEDS_HUMAN,
    QUEUED,
    SUBMITTED,
    Application,
    Job,
    User,
)


def _mk(db):
    uid = uuid.uuid4().hex
    user = User(email=f"sm-{uid}@x.com", password_hash="x")
    db.add(user)
    db.flush()
    job = Job(user_id=user.id, title="Engineer", company="Acme", dedupe_key=f"k{uid}")
    db.add(job)
    db.flush()
    app = Application(user_id=user.id, job_id=job.id, status=QUEUED)
    db.add(app)
    db.commit()
    return user, app


def test_allowed_graph():
    assert can_transition(QUEUED, FILLING)
    assert can_transition(FILLING, NEEDS_HUMAN)
    assert can_transition(NEEDS_HUMAN, FILLING)
    assert can_transition(FILLING, SUBMITTED)
    assert can_transition(FAILED, QUEUED)  # re-queueable
    assert not can_transition(SUBMITTED, FILLING)  # terminal
    assert not can_transition(QUEUED, SUBMITTED)  # must fill first


def test_happy_path_records_timestamped_events():
    db = SessionLocal()
    try:
        _, app = _mk(db)
        transition(db, app, FILLING, notify=False)
        transition(db, app, NEEDS_HUMAN, notify=False)
        transition(db, app, FILLING, notify=False)
        transition(db, app, SUBMITTED, notify=False)
        db.refresh(app)
        assert app.status == SUBMITTED
        assert app.submitted_at is not None
        states = [(e.from_state, e.to_state) for e in app.events]
        assert states == [
            (QUEUED, FILLING),
            (FILLING, NEEDS_HUMAN),
            (NEEDS_HUMAN, FILLING),
            (FILLING, SUBMITTED),
        ]
        assert all(e.at is not None for e in app.events)
    finally:
        db.close()


def test_invalid_transition_raises():
    db = SessionLocal()
    try:
        _, app = _mk(db)
        transition(db, app, FILLING, notify=False)
        transition(db, app, SUBMITTED, notify=False)
        with pytest.raises(InvalidTransition):
            transition(db, app, FILLING, notify=False)  # terminal -> filling not allowed
    finally:
        db.close()
