"""Password hashing, session token creation/verification, CSRF helpers."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from ..config import settings
from ..db import utcnow

_ph = PasswordHasher()

SESSION_COOKIE = "jp_session"
CSRF_COOKIE = "jp_csrf"
CSRF_HEADER = "x-csrf-token"
DEVICE_HEADER = "authorization"  # "Bearer <device-token>"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _ph.check_needs_rehash(password_hash)
    except Exception:
        return False


def generate_token() -> str:
    """Return a high-entropy opaque token (shown once to the client)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Deterministic hash for storage/lookup. Tokens are already high-entropy."""
    return hashlib.sha256(f"{settings.secret_key}:{token}".encode()).hexdigest()


def generate_csrf_secret() -> str:
    return secrets.token_urlsafe(24)


def csrf_matches(header_value: str | None, cookie_value: str | None, session_secret: str) -> bool:
    """Double-submit: header must equal the cookie AND the server-side session secret."""
    if not header_value or not cookie_value:
        return False
    return (
        hmac.compare_digest(header_value, session_secret)
        and hmac.compare_digest(cookie_value, session_secret)
    )


def session_expiry():
    return utcnow() + timedelta(days=settings.session_ttl_days)


def cookie_kwargs(max_age_days: int | None = None) -> dict:
    """Common cookie settings. Secure only in production (behind HTTPS)."""
    kwargs = {
        "httponly": True,
        "samesite": "lax",
        "secure": settings.is_production,
        "path": "/",
    }
    if max_age_days is not None:
        kwargs["max_age"] = max_age_days * 24 * 3600
    return kwargs
