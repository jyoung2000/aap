"""Profile and related tables — the user's 'work identity'. All user-scoped."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class Profile(Base):
    """One-to-one with a user. Holds the personal block + the standard 2026 ATS field library."""

    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )

    # --- Personal / contact block ---
    first_name: Mapped[str] = mapped_column(String(120), default="")
    last_name: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(320), default="")
    phone: Mapped[str] = mapped_column(String(64), default="")
    address: Mapped[str] = mapped_column(String(255), default="")
    city: Mapped[str] = mapped_column(String(120), default="")
    state: Mapped[str] = mapped_column(String(120), default="")
    postal_code: Mapped[str] = mapped_column(String(32), default="")
    country: Mapped[str] = mapped_column(String(120), default="United States")
    linkedin_url: Mapped[str] = mapped_column(String(512), default="")
    portfolio_url: Mapped[str] = mapped_column(String(512), default="")
    github_url: Mapped[str] = mapped_column(String(512), default="")
    website_url: Mapped[str] = mapped_column(String(512), default="")

    # --- Standard 2026 application-field library (structured defaults) ---
    work_authorized: Mapped[str] = mapped_column(String(16), default="Yes")  # Yes | No
    requires_sponsorship: Mapped[str] = mapped_column(String(16), default="No")  # Yes | No
    work_model_preference: Mapped[str] = mapped_column(String(16), default="Remote")  # Remote|Hybrid|Onsite
    willing_to_relocate: Mapped[str] = mapped_column(String(16), default="No")
    salary_expectation_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_expectation_currency: Mapped[str] = mapped_column(String(8), default="USD")
    salary_expectation_period: Mapped[str] = mapped_column(String(16), default="year")  # year|hour
    # Current compensation — NEVER auto-filled if blank.
    current_comp_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_comp_currency: Mapped[str] = mapped_column(String(8), default="USD")
    earliest_start_date: Mapped[str] = mapped_column(String(64), default="")
    notice_period: Mapped[str] = mapped_column(String(64), default="2 weeks")
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # per-skill experience: {"Python": 6, "React": 4}
    skill_years: Mapped[dict] = mapped_column(JSON, default=dict)
    previously_worked_here: Mapped[str] = mapped_column(String(16), default="No")
    referral_name: Mapped[str] = mapped_column(String(255), default="")
    over_18: Mapped[str] = mapped_column(String(16), default="Yes")
    background_check_consent: Mapped[str] = mapped_column(String(16), default="Yes")
    drug_screen_consent: Mapped[str] = mapped_column(String(16), default="Yes")
    security_clearance: Mapped[str] = mapped_column(String(64), default="None")
    agree_privacy_policy: Mapped[bool] = mapped_column(Boolean, default=True)

    # --- US EEO voluntary self-ID. Default is always "Decline to self-identify". ---
    veteran_status: Mapped[str] = mapped_column(String(64), default="Decline to self-identify")
    disability_status: Mapped[str] = mapped_column(String(64), default="Decline to self-identify")
    gender: Mapped[str] = mapped_column(String(64), default="Decline to self-identify")
    race_ethnicity: Mapped[str] = mapped_column(String(64), default="Decline to self-identify")

    # Raw structured JSON produced by the LLM resume parse, kept for review/override.
    parsed_resume: Mapped[dict] = mapped_column(JSON, default=dict)


class WorkExperience(Base):
    __tablename__ = "work_experiences"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(255), default="")
    company: Mapped[str] = mapped_column(String(255), default="")
    location: Mapped[str] = mapped_column(String(255), default="")
    start_date: Mapped[str] = mapped_column(String(32), default="")  # YYYY-MM
    end_date: Mapped[str] = mapped_column(String(32), default="")
    current: Mapped[bool] = mapped_column(Boolean, default=False)
    bullets: Mapped[list] = mapped_column(JSON, default=list)  # list[str]


class Education(Base):
    __tablename__ = "educations"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    degree: Mapped[str] = mapped_column(String(255), default="")
    field_of_study: Mapped[str] = mapped_column(String(255), default="")
    school: Mapped[str] = mapped_column(String(255), default="")
    graduation_year: Mapped[str] = mapped_column(String(16), default="")
    gpa: Mapped[str] = mapped_column(String(16), default="")


class Recommendation(Base):
    __tablename__ = "recommendations"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(255), default="")
    title: Mapped[str] = mapped_column(String(255), default="")
    relationship_to: Mapped[str] = mapped_column(String(255), default="")
    contact: Mapped[str] = mapped_column(String(255), default="")
    quote: Mapped[str] = mapped_column(Text, default="")
    file_id: Mapped[str | None] = mapped_column(
        ForeignKey("profile_files.id", ondelete="SET NULL"), nullable=True
    )


class ProfileFile(Base):
    """Uploaded documents: resumes, cover letters, certifications, portfolio files."""

    __tablename__ = "profile_files"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), default="resume")  # resume|cover_letter|certification|portfolio
    filename: Mapped[str] = mapped_column(String(512), default="")
    stored_path: Mapped[str] = mapped_column(String(1024), default="")
    mime: Mapped[str] = mapped_column(String(128), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    extracted_text: Mapped[str] = mapped_column(Text, default="")


class CustomField(Base):
    """User-defined first-class fields (e.g. Security clearance, Driver's license class)."""

    __tablename__ = "custom_fields"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str] = mapped_column(String(255), default="")
    type: Mapped[str] = mapped_column(String(32), default="text")  # text|number|date|boolean|select|file
    options: Mapped[list] = mapped_column(JSON, default=list)  # for select
    value: Mapped[str] = mapped_column(Text, default="")
    file_id: Mapped[str | None] = mapped_column(
        ForeignKey("profile_files.id", ondelete="SET NULL"), nullable=True
    )


class SavedAnswer(Base):
    """Knowledge base: question->answer pairs accumulated from human-in-the-loop prompts."""

    __tablename__ = "saved_answers"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question: Mapped[str] = mapped_column(Text, default="")
    answer: Mapped[str] = mapped_column(Text, default="")
    # normalized form of the question for fast lookup / dedupe
    question_key: Mapped[str] = mapped_column(String(512), index=True, default="")
    source: Mapped[str] = mapped_column(String(32), default="hitl")  # hitl | manual
