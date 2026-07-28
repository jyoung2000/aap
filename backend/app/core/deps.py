"""FastAPI dependencies: current user, CSRF enforcement, device auth, per-user scoping."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import as_aware, get_db, utcnow
from ..models import Device, SessionToken, User
from .security import (
    CSRF_COOKIE,
    CSRF_HEADER,
    SESSION_COOKIE,
    csrf_matches,
    hash_token,
)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


def _load_session(request: Request, db: Session) -> SessionToken | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    row = db.scalar(select(SessionToken).where(SessionToken.token_hash == hash_token(token)))
    if not row:
        return None
    if as_aware(row.expires_at) <= utcnow():
        db.delete(row)
        db.commit()
        return None
    return row


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve the authenticated user from the session cookie and enforce CSRF on writes."""
    session = _load_session(request, db)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if request.method.upper() not in SAFE_METHODS:
        header = request.headers.get(CSRF_HEADER)
        cookie = request.cookies.get(CSRF_COOKIE)
        if not csrf_matches(header, cookie, session.csrf_secret):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF check failed")

    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive account")

    session.last_seen = utcnow()
    db.commit()
    return user


def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> User | None:
    try:
        return get_current_user(request, db)
    except HTTPException:
        return None


def get_device(request: Request, db: Session = Depends(get_db)) -> Device:
    """Authenticate the browser extension via its Bearer device token."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing device token")
    token = auth.split(" ", 1)[1].strip()
    device = db.scalar(select(Device).where(Device.token_hash == hash_token(token)))
    if not device or device.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid device token")
    device.last_seen = utcnow()
    db.commit()
    return device


def get_device_user(device: Device = Depends(get_device), db: Session = Depends(get_db)) -> tuple[Device, User]:
    user = db.get(User, device.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive account")
    return device, user
