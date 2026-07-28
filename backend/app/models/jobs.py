"""Job search and listing models."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

# --- Search status values ---
SEARCH_QUEUED = "queued"
SEARCH_RUNNING = "running"
SEARCH_DONE = "done"
SEARCH_FAILED = "failed"


class JobSearch(Base):
    """A user-initiated discovery run. Executes as a background job with live progress."""

    __tablename__ = "job_searches"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    keywords: Mapped[str] = mapped_column(String(512), default="")
    location: Mapped[str] = mapped_column(String(255), default="")
    remote_only: Mapped[bool] = mapped_column(default=False)
    filters: Mapped[dict] = mapped_column(JSON, default=dict)  # salary_floor, education, posted_within, sources
    status: Mapped[str] = mapped_column(String(16), default=SEARCH_QUEUED, index=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1
    message: Mapped[str] = mapped_column(String(512), default="")
    found_count: Mapped[int] = mapped_column(Integer, default=0)
    new_count: Mapped[int] = mapped_column(Integer, default=0)
    source_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str] = mapped_column(Text, default="")


class Job(Base):
    """A normalized, enriched job listing scoped to a user."""

    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_job_user_dedupe"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    search_id: Mapped[str | None] = mapped_column(
        ForeignKey("job_searches.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Raw / normalized fields
    external_id: Mapped[str] = mapped_column(String(255), default="")
    title: Mapped[str] = mapped_column(String(512), default="")
    company: Mapped[str] = mapped_column(String(512), default="")
    location: Mapped[str] = mapped_column(String(512), default="")
    remote: Mapped[bool] = mapped_column(default=False)

    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[str] = mapped_column(String(8), default="")
    salary_period: Mapped[str] = mapped_column(String(16), default="")
    salary_text: Mapped[str] = mapped_column(String(128), default="Not listed")

    education_level: Mapped[str] = mapped_column(String(128), default="")
    post_date: Mapped[str] = mapped_column(String(64), default="")
    source: Mapped[str] = mapped_column(String(64), default="", index=True)
    canonical_url: Mapped[str] = mapped_column(String(1024), default="")
    apply_url: Mapped[str] = mapped_column(String(1024), default="")
    description: Mapped[str] = mapped_column(Text, default="")

    # Enrichment (LLM or heuristic)
    summary: Mapped[str] = mapped_column(Text, default="")
    requirements: Mapped[list] = mapped_column(JSON, default=list)
    match_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    match_rationale: Mapped[str] = mapped_column(String(512), default="")
    enriched: Mapped[bool] = mapped_column(default=False)

    # Dedupe & lifecycle
    dedupe_key: Mapped[str] = mapped_column(String(255), index=True, default="")
    # Whether the listing routes to the no-browser Playwright executor.
    server_apply_capable: Mapped[bool] = mapped_column(default=False)


class OrgSlug(Base):
    """Growing shared cache of ATS org slugs discovered via search-engine dorks."""

    __tablename__ = "org_slugs"
    __table_args__ = (UniqueConstraint("source", "slug", name="uq_orgslug"),)

    source: Mapped[str] = mapped_column(String(64), index=True)  # greenhouse|lever|ashby|workable...
    slug: Mapped[str] = mapped_column(String(255), index=True)
    discovered_via: Mapped[str] = mapped_column(String(64), default="seed")
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hits: Mapped[int] = mapped_column(Integer, default=0)
