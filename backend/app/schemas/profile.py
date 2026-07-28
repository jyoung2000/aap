from __future__ import annotations

from pydantic import BaseModel, Field


class ProfileOut(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    address: str
    city: str
    state: str
    postal_code: str
    country: str
    linkedin_url: str
    portfolio_url: str
    github_url: str
    website_url: str
    work_authorized: str
    requires_sponsorship: str
    work_model_preference: str
    willing_to_relocate: str
    salary_expectation_amount: int | None
    salary_expectation_currency: str
    salary_expectation_period: str
    current_comp_amount: int | None
    current_comp_currency: str
    earliest_start_date: str
    notice_period: str
    years_experience: int | None
    skill_years: dict
    previously_worked_here: str
    referral_name: str
    over_18: str
    background_check_consent: str
    drug_screen_consent: str
    security_clearance: str
    agree_privacy_policy: bool
    veteran_status: str
    disability_status: str
    gender: str
    race_ethnicity: str
    parsed_resume: dict

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None
    github_url: str | None = None
    website_url: str | None = None
    work_authorized: str | None = None
    requires_sponsorship: str | None = None
    work_model_preference: str | None = None
    willing_to_relocate: str | None = None
    salary_expectation_amount: int | None = None
    salary_expectation_currency: str | None = None
    salary_expectation_period: str | None = None
    current_comp_amount: int | None = None
    current_comp_currency: str | None = None
    earliest_start_date: str | None = None
    notice_period: str | None = None
    years_experience: int | None = None
    skill_years: dict | None = None
    previously_worked_here: str | None = None
    referral_name: str | None = None
    over_18: str | None = None
    background_check_consent: str | None = None
    drug_screen_consent: str | None = None
    security_clearance: str | None = None
    agree_privacy_policy: bool | None = None
    veteran_status: str | None = None
    disability_status: str | None = None
    gender: str | None = None
    race_ethnicity: str | None = None
    parsed_resume: dict | None = None


class WorkExperienceIn(BaseModel):
    title: str = ""
    company: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    current: bool = False
    bullets: list[str] = Field(default_factory=list)
    order: int = 0


class WorkExperienceOut(WorkExperienceIn):
    id: str
    model_config = {"from_attributes": True}


class EducationIn(BaseModel):
    degree: str = ""
    field_of_study: str = ""
    school: str = ""
    graduation_year: str = ""
    gpa: str = ""
    order: int = 0


class EducationOut(EducationIn):
    id: str
    model_config = {"from_attributes": True}


class RecommendationIn(BaseModel):
    name: str = ""
    title: str = ""
    relationship_to: str = ""
    contact: str = ""
    quote: str = ""
    file_id: str | None = None
    order: int = 0


class RecommendationOut(RecommendationIn):
    id: str
    model_config = {"from_attributes": True}


class CustomFieldIn(BaseModel):
    label: str = ""
    type: str = "text"
    options: list[str] = Field(default_factory=list)
    value: str = ""
    file_id: str | None = None
    order: int = 0


class CustomFieldOut(CustomFieldIn):
    id: str
    model_config = {"from_attributes": True}


class SavedAnswerIn(BaseModel):
    question: str
    answer: str


class SavedAnswerOut(BaseModel):
    id: str
    question: str
    answer: str
    source: str
    model_config = {"from_attributes": True}


class ProfileFileOut(BaseModel):
    id: str
    kind: str
    filename: str
    mime: str
    size_bytes: int
    is_default: bool
    model_config = {"from_attributes": True}


class ReorderIn(BaseModel):
    ordered_ids: list[str]
