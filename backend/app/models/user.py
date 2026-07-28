"""User, auth session, and extension device models."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Per-user preferences
    theme: Mapped[str] = mapped_column(String(16), default="system")  # system | light | dark
    humanized_input: Mapped[bool] = mapped_column(Boolean, default=True)
    max_applications_per_hour: Mapped[int] = mapped_column(Integer, default=15)
    how_heard_default: Mapped[str] = mapped_column(String(255), default="Job board")
    notify_webhook_url: Mapped[str] = mapped_column(String(1024), default="")
    onboarding_done: Mapped[bool] = mapped_column(Boolean, default=False)

    sessions: Mapped[list["SessionToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    devices: Mapped[list["Device"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class SessionToken(Base):
    """Server-side session record, referenced by an httpOnly cookie. Revocable."""

    __tablename__ = "session_tokens"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    csrf_secret: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_agent: Mapped[str] = mapped_column(String(512), default="")
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class Device(Base):
    """A paired browser (extension instance) bound to a user via a device token."""

    __tablename__ = "devices"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), default="Browser")
    browser: Mapped[str] = mapped_column(String(64), default="")  # chrome | firefox
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capabilities: Mapped[str] = mapped_column(Text, default="")  # e.g. "debugger"

    user: Mapped[User] = relationship(back_populates="devices")


class PairingCode(Base):
    """Short-lived 6-digit code shown in Settings, exchanged by the extension for a token."""

    __tablename__ = "pairing_codes"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    code: Mapped[str] = mapped_column(String(6), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
