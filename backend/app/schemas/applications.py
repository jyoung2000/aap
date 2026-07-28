from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ApplicationCreate(BaseModel):
    job_ids: list[str]
    mode: str = "auto"  # auto | reviewed | manual
    executor: str = "extension"  # extension | playwright
    humanized: bool | None = None
    review_first: bool = False


class EventOut(BaseModel):
    from_state: str
    to_state: str
    at: datetime
    note: str
    model_config = {"from_attributes": True}


class ApplicationOut(BaseModel):
    id: str
    job_id: str
    job_title: str = ""
    job_company: str = ""
    job_source: str = ""
    apply_url: str = ""
    status: str
    mode: str
    executor: str
    humanized: bool
    review_first: bool
    field_snapshot: dict
    confirmation_screenshot: str
    error: str
    submitted_at: datetime | None
    funnel_status: str
    created_at: datetime
    updated_at: datetime
    events: list[EventOut] = Field(default_factory=list)
    open_interventions: int = 0

    model_config = {"from_attributes": True}


class InterventionOut(BaseModel):
    id: str
    application_id: str
    kind: str
    field_label: str
    field_type: str
    options: list
    question: str
    screenshot: str
    answer: str
    resolved: bool
    save_to_kb: bool
    created_at: datetime
    # denormalized job context for the queue UI
    job_title: str = ""
    job_company: str = ""

    model_config = {"from_attributes": True}


class InterventionAnswer(BaseModel):
    answer: str
    save_to_kb: bool = True


class FieldDescriptor(BaseModel):
    label: str
    type: str = "text"
    options: list[str] = Field(default_factory=list)
    screenshot: str = ""


class FieldResolveRequest(BaseModel):
    fields: list[FieldDescriptor]


class ResultReport(BaseModel):
    status: str  # submitted | failed | needs_human | skipped
    field_snapshot: dict = Field(default_factory=dict)
    confirmation_screenshot: str = ""
    error: str = ""


class FunnelUpdate(BaseModel):
    funnel_status: str
