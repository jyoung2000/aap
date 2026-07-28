"""Application state machine, transition log, and human-in-the-loop interventions."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

# --- Application state machine ---
QUEUED = "queued"
FILLING = "filling"
NEEDS_HUMAN = "needs_human"
SUBMITTED = "submitted"
FAILED = "failed"
SKIPPED = "skipped"

TERMINAL_STATES = {SUBMITTED, FAILED, SKIPPED}

# Allowed transitions for the per-application state machine.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    QUEUED: {FILLING, SKIPPED, FAILED},
    FILLING: {NEEDS_HUMAN, SUBMITTED, FAILED, SKIPPED},
    NEEDS_HUMAN: {FILLING, SUBMITTED, FAILED, SKIPPED},
    SUBMITTED: set(),
    FAILED: {QUEUED},  # failed items are re-queueable
    SKIPPED: {QUEUED},
}

# --- Apply modes & executors ---
MODE_AUTO = "auto"
MODE_REVIEWED = "reviewed"
MODE_MANUAL = "manual"

EXECUTOR_EXTENSION = "extension"
EXECUTOR_PLAYWRIGHT = "playwright"

# --- Manual funnel statuses ---
FUNNEL_CHOICES = [
    "no_response",
    "rejected",
    "recruiter_reply",
    "interview",
    "offer",
]


class Application(Base):
    __tablename__ = "applications"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[str] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    device_id: Mapped[str | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(String(32), default=QUEUED, index=True)
    mode: Mapped[str] = mapped_column(String(16), default=MODE_AUTO)
    executor: Mapped[str] = mapped_column(String(16), default=EXECUTOR_EXTENSION)
    humanized: Mapped[bool] = mapped_column(Boolean, default=True)
    review_first: Mapped[bool] = mapped_column(Boolean, default=False)

    # Snapshot of the final field values that were entered.
    field_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    confirmation_screenshot: Mapped[str] = mapped_column(String(1024), default="")
    error: Mapped[str] = mapped_column(Text, default="")
    error_screenshot: Mapped[str] = mapped_column(String(1024), default="")
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Manual funnel status set by the user afterwards.
    funnel_status: Mapped[str] = mapped_column(String(32), default="")

    events: Mapped[list["ApplicationEvent"]] = relationship(
        back_populates="application", cascade="all, delete-orphan", order_by="ApplicationEvent.at"
    )
    interventions: Mapped[list["Intervention"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )


class ApplicationEvent(Base):
    """Timestamped record of every state-machine transition."""

    __tablename__ = "application_events"

    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True, nullable=False
    )
    from_state: Mapped[str] = mapped_column(String(32), default="")
    to_state: Mapped[str] = mapped_column(String(32), default="")
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="")

    application: Mapped[Application] = relationship(back_populates="events")


class Intervention(Base):
    """A human-in-the-loop request raised during a run (unknown field, CAPTCHA, login wall)."""

    __tablename__ = "interventions"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), default="field")  # field | captcha | login | confirm
    field_label: Mapped[str] = mapped_column(Text, default="")
    field_type: Mapped[str] = mapped_column(String(32), default="text")
    options: Mapped[list] = mapped_column(JSON, default=list)
    question: Mapped[str] = mapped_column(Text, default="")
    screenshot: Mapped[str] = mapped_column(String(1024), default="")
    answer: Mapped[str] = mapped_column(Text, default="")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    save_to_kb: Mapped[bool] = mapped_column(Boolean, default=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    application: Mapped[Application] = relationship(back_populates="interventions")
