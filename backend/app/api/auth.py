"""Sign up / sign in / sign out, current user, and account settings."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..core.deps import get_current_user
from ..core.security import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    cookie_kwargs,
    generate_csrf_secret,
    generate_token,
    hash_password,
    hash_token,
    needs_rehash,
    session_expiry,
    verify_password,
)
from ..db import get_db
from ..models import Profile, SessionToken, User
from ..schemas.auth import (
    ChangePasswordIn,
    SignInIn,
    SignUpIn,
    UserOut,
    UserSettingsUpdate,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_session(response: Response, db: Session, user: User, user_agent: str = "") -> None:
    token = generate_token()
    csrf_secret = generate_csrf_secret()
    st = SessionToken(
        user_id=user.id,
        token_hash=hash_token(token),
        csrf_secret=csrf_secret,
        expires_at=session_expiry(),
        user_agent=user_agent[:512],
    )
    db.add(st)
    db.commit()
    response.set_cookie(SESSION_COOKIE, token, **cookie_kwargs(settings.session_ttl_days))
    # CSRF cookie is readable by JS (double-submit); not httpOnly.
    csrf_kwargs = cookie_kwargs(settings.session_ttl_days)
    csrf_kwargs["httponly"] = False
    response.set_cookie(CSRF_COOKIE, csrf_secret, **csrf_kwargs)


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(payload: SignUpIn, request: Request, response: Response, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        humanized_input=settings.humanized_input_default,
        max_applications_per_hour=settings.max_applications_per_hour,
    )
    db.add(user)
    db.flush()
    # Auto-create the profile with the personal block seeded from the account email.
    db.add(Profile(user_id=user.id, email=user.email))
    db.commit()
    _issue_session(response, db, user, request.headers.get("user-agent", ""))
    return user


@router.post("/signin", response_model=UserOut)
def signin(payload: SignInIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        db.commit()
    _issue_session(response, db, user, request.headers.get("user-agent", ""))
    return user


@router.post("/signout", status_code=status.HTTP_204_NO_CONTENT)
def signout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        row = db.scalar(select(SessionToken).where(SessionToken.token_hash == hash_token(token)))
        if row:
            db.delete(row)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_settings(
    payload: UserSettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is wrong")
    user.password_hash = hash_password(payload.new_password)
    # Revoke all other sessions on password change.
    for st in list(user.sessions):
        db.delete(st)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cascading delete of the account and all of the user's data."""
    db.delete(user)  # ON DELETE CASCADE clears every user-scoped table
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
