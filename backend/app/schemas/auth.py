from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class SignUpIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class SignInIn(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class UserOut(BaseModel):
    id: str
    email: str
    theme: str
    humanized_input: bool
    max_applications_per_hour: int
    how_heard_default: str
    notify_webhook_url: str
    onboarding_done: bool

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    theme: str | None = None
    humanized_input: bool | None = None
    max_applications_per_hour: int | None = Field(default=None, ge=1, le=200)
    how_heard_default: str | None = None
    notify_webhook_url: str | None = None
    onboarding_done: bool | None = None
