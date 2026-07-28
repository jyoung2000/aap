from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SearchCreate(BaseModel):
    keywords: str = ""
    location: str = ""
    remote_only: bool = False
    salary_floor: int | None = None
    education_level: str = ""
    posted_within_days: int | None = None
    sources: list[str] = Field(default_factory=list)  # empty = all


class SearchOut(BaseModel):
    id: str
    keywords: str
    location: str
    remote_only: bool
    filters: dict
    status: str
    progress: float
    message: str
    found_count: int
    new_count: int
    source_breakdown: dict
    error: str
    created_at: datetime

    model_config = {"from_attributes": True}


class JobOut(BaseModel):
    id: str
    search_id: str | None
    title: str
    company: str
    location: str
    remote: bool
    salary_min: int | None
    salary_max: int | None
    salary_currency: str
    salary_period: str
    salary_text: str
    education_level: str
    post_date: str
    source: str
    canonical_url: str
    apply_url: str
    description: str
    summary: str
    requirements: list
    match_score: int | None
    match_rationale: str
    enriched: bool
    server_apply_capable: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class JobListItem(BaseModel):
    id: str
    title: str
    company: str
    location: str
    remote: bool
    salary_text: str
    education_level: str
    post_date: str
    source: str
    match_score: int | None
    server_apply_capable: bool
    has_application: bool = False

    model_config = {"from_attributes": True}


class BulkJobAction(BaseModel):
    job_ids: list[str]
    mode: str = "auto"  # auto | reviewed | manual
    executor: str = "extension"  # extension | playwright
    humanized: bool | None = None
    review_first: bool = False
