"""Form-field resolution pipeline.

Resolution order (first confident hit wins):
    1. Structured profile fields (personal block + standard 2026 ATS library)
    2. User custom fields
    3. Saved answers (knowledge base)
    4. LLM mapping / screening draft

Knockout questions (certifications, licenses, clearance, shift availability) are
NEVER guessed by the LLM — if steps 1-3 can't answer, they go to a human.
Current compensation is never auto-filled when the profile leaves it blank.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from ..llm.fields import draft_screening_answer, map_field
from ..models import CustomField, Profile, SavedAnswer

# Confidence at/above this is auto-filled without human review.
CONFIDENCE_THRESHOLD = 0.8

CONF_PROFILE = 0.97
CONF_CUSTOM = 0.92
CONF_SAVED = 0.9


@dataclass
class Resolution:
    value: str = ""
    confidence: float = 0.0
    source: str = "unresolved"
    needs_human: bool = False
    is_knockout: bool = False
    options_matched: bool = True
    note: str = ""

    @property
    def auto_fillable(self) -> bool:
        return (
            not self.needs_human
            and self.value != ""
            and self.confidence >= CONFIDENCE_THRESHOLD
            and self.options_matched
        )


def normalize_question(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[\*\:\?\.]+$", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _has(label: str, *needles: str) -> bool:
    return any(n in label for n in needles)


def _word(label: str, *words: str) -> bool:
    """Whole-word match — avoids 'state' matching inside 'united states'."""
    return any(re.search(rf"\b{re.escape(w)}\b", label) for w in words)


def _fuzzy(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


KNOCKOUT_HINTS = (
    "certif", "licen", "clearance", "shift availability", "are you able to work",
    "do you have a", "eligible", "endorsement",
)


def _is_knockout(label: str) -> bool:
    return any(h in label for h in KNOCKOUT_HINTS)


def _match_option(value: str, options: list[str]) -> tuple[str, bool]:
    """Map a resolved value to one of the provided select options."""
    if not options:
        return value, True
    v = value.strip().lower()
    for opt in options:
        if opt.strip().lower() == v:
            return opt, True
    # substring / fuzzy
    best, best_score = value, 0.0
    for opt in options:
        score = max(_fuzzy(v, opt.lower()), 1.0 if v and v in opt.lower() else 0.0)
        if score > best_score:
            best, best_score = opt, score
    if best_score >= 0.6:
        return best, True
    return value, False


def _profile_answer(label: str, profile: Profile) -> tuple[str, bool] | None:
    """Return (value, is_blank_skip) if the label maps to a structured profile field."""
    full_name = f"{profile.first_name} {profile.last_name}".strip()

    # --- Contact block ---
    if _has(label, "first name", "given name"):
        return profile.first_name, False
    if _has(label, "last name", "surname", "family name"):
        return profile.last_name, False
    if _has(label, "full name", "your name", "legal name") or label.strip() == "name":
        return full_name, False
    if _has(label, "e-mail", "email"):
        return profile.email, False
    if _has(label, "phone", "mobile", "telephone"):
        return profile.phone, False
    if _has(label, "street", "address line", "address") and not _has(label, "email"):
        return profile.address, False
    if _has(label, "city", "town"):
        return profile.city, False
    if _word(label, "state", "province", "region") and not _has(label, "united states", "authorized", "sponsor"):
        return profile.state, False
    if _has(label, "zip", "postal"):
        return profile.postal_code, False
    if _has(label, "country"):
        return profile.country, False
    if _has(label, "location") and not _has(label, "relocat"):
        return ", ".join(x for x in (profile.city, profile.state, profile.country) if x), False

    # --- URLs ---
    if _has(label, "linkedin"):
        return profile.linkedin_url, False
    if _has(label, "github"):
        return profile.github_url, False
    if _has(label, "portfolio"):
        return profile.portfolio_url, False
    if _has(label, "website", "personal site", "url") and not _has(label, "linkedin", "github", "portfolio"):
        return profile.website_url, False

    # --- Authorization / sponsorship ---
    if _has(label, "authorized to work", "legally authorized", "work authorization", "right to work"):
        return profile.work_authorized, False
    if _has(label, "sponsor", "visa"):
        return profile.requires_sponsorship, False

    # --- Work model / relocation / commute ---
    if _has(label, "remote", "work model", "hybrid", "onsite", "on-site", "work arrangement"):
        return profile.work_model_preference, False
    if _has(label, "relocat"):
        return profile.willing_to_relocate, False
    if _has(label, "commute", "able to commute"):
        return ("Yes" if profile.work_model_preference in ("Onsite", "Hybrid") else profile.willing_to_relocate), False

    # --- Compensation ---
    if _has(label, "salary expect", "expected salary", "desired salary", "compensation expect", "salary requirement"):
        if profile.salary_expectation_amount:
            return f"{profile.salary_expectation_amount} {profile.salary_expectation_currency}/{profile.salary_expectation_period}", False
        return "", True
    if _has(label, "current salary", "current compensation", "current pay"):
        # Never auto-fill current compensation when blank.
        if profile.current_comp_amount:
            return f"{profile.current_comp_amount} {profile.current_comp_currency}", False
        return "", True

    # --- Timing ---
    if _has(label, "start date", "available to start", "availability date", "earliest"):
        return profile.earliest_start_date, profile.earliest_start_date == ""
    if _has(label, "notice period", "notice"):
        return profile.notice_period, False

    # --- Experience ---
    if _has(label, "years of experience", "years experience", "total experience"):
        m = re.search(r"(python|java|react|node|aws|sql|kubernetes|go|rust|typescript|c\+\+|c#)", label)
        if m and profile.skill_years:
            for skill, yrs in profile.skill_years.items():
                if skill.lower() == m.group(1).lower():
                    return str(yrs), False
        return (str(profile.years_experience) if profile.years_experience is not None else ""), profile.years_experience is None

    # --- Prior relationship / referral ---
    if _has(label, "previously worked", "worked for us", "former employee"):
        return profile.previously_worked_here, False
    if _has(label, "know anyone", "referral", "referred by", "employee referral"):
        return profile.referral_name, profile.referral_name == ""
    if _has(label, "how did you hear", "how you heard", "source"):
        return "", False  # filled from user setting by the orchestrator; blank here

    # --- Consents / age ---
    if "18" in label and _has(label, "older", "age", "over", "at least"):
        return profile.over_18, False
    if _has(label, "background check"):
        return profile.background_check_consent, False
    if _has(label, "drug screen", "drug test"):
        return profile.drug_screen_consent, False
    if _has(label, "privacy policy", "terms and conditions", "i agree to the privacy"):
        return ("Yes" if profile.agree_privacy_policy else "No"), False

    # --- Security clearance ---
    if _has(label, "security clearance", "clearance level"):
        return profile.security_clearance, False

    # --- EEO voluntary self-ID (always fill exactly the stored choice) ---
    if _has(label, "veteran", "protected veteran"):
        return profile.veteran_status, False
    if _has(label, "disab"):
        return profile.disability_status, False
    if _has(label, "gender", "sex"):
        return profile.gender, False
    if _has(label, "race", "ethnic"):
        return profile.race_ethnicity, False

    return None


def resolve_field(
    *,
    label: str,
    field_type: str,
    options: list[str],
    profile: Profile,
    custom_fields: list[CustomField],
    saved_answers: list[SavedAnswer],
    how_heard_default: str = "Job board",
    resume_text: str = "",
    job_description: str = "",
    use_llm: bool = True,
) -> Resolution:
    """Resolve a single field through the ordered pipeline."""
    label_n = normalize_question(label)
    options = options or []
    knockout = _is_knockout(label_n)

    # Special-case: "how did you hear" uses the per-user default.
    if _has(label_n, "how did you hear", "how you heard"):
        val, matched = _match_option(how_heard_default, options)
        return Resolution(value=val, confidence=CONF_PROFILE, source="setting", options_matched=matched)

    # 1) Structured profile (authoritative for its known fields)
    prof = _profile_answer(label_n, profile)
    profile_matched = prof is not None
    if prof is not None:
        value, blank = prof
        if value and not blank:
            v, matched = _match_option(value, options)
            return Resolution(value=v, confidence=CONF_PROFILE, source="profile", is_knockout=knockout, options_matched=matched)
        # Current compensation is a hard skip when blank — never auto-filled, never asked.
        if _has(label_n, "current salary", "current compensation", "current pay"):
            return Resolution(value="", confidence=0.0, source="profile_blank", note="current comp left blank")
        # Other blanks: fall through to custom/saved; if still nothing it's a known
        # optional field the user left blank, so skip it rather than guess or ask.

    # 2) Custom fields
    for cf in custom_fields:
        if not cf.label:
            continue
        if _fuzzy(label_n, cf.label.lower()) >= 0.82 or cf.label.lower() in label_n:
            if cf.value:
                v, matched = _match_option(cf.value, options)
                return Resolution(value=v, confidence=CONF_CUSTOM, source="custom_field", is_knockout=knockout, options_matched=matched)

    # 3) Saved answers (knowledge base)
    for sa in saved_answers:
        key = sa.question_key or normalize_question(sa.question)
        if not key:
            continue
        if key == label_n or _fuzzy(key, label_n) >= 0.85 or (len(key) > 12 and key in label_n):
            if sa.answer:
                v, matched = _match_option(sa.answer, options)
                return Resolution(value=v, confidence=CONF_SAVED, source="saved_answer", is_knockout=knockout, options_matched=matched)

    # A known standard field left blank in the profile -> skip quietly.
    if profile_matched:
        return Resolution(value="", confidence=0.0, source="profile_blank", note="known field left blank")

    # Knockout with no deterministic answer -> human, never a guess.
    if knockout:
        return Resolution(source="unresolved", needs_human=True, is_knockout=True, note="knockout needs human")

    if not use_llm:
        return Resolution(source="unresolved", needs_human=True)

    # 4) LLM — free-text screening question vs. a mappable field.
    is_freetext = field_type in ("textarea", "long_text") or _has(
        label_n, "why do you", "describe", "tell us", "cover letter", "what interests", "motivat"
    )
    profile_context = _profile_context(profile, custom_fields)
    if is_freetext:
        out = draft_screening_answer(question=label, resume_text=resume_text, job_description=job_description)
    else:
        out = map_field(label=label, field_type=field_type, options=options, profile_context=profile_context)

    value = str(out.get("value", ""))
    conf = float(out.get("confidence", 0.0))
    if value:
        v, matched = _match_option(value, options)
        needs_human = conf < CONFIDENCE_THRESHOLD or not matched
        return Resolution(
            value=v, confidence=conf, source=out.get("source", "llm"),
            needs_human=needs_human, options_matched=matched,
            note="low confidence" if needs_human else "",
        )
    return Resolution(source="unresolved", needs_human=True, note="llm could not resolve")


def _profile_context(profile: Profile, custom_fields: list[CustomField]) -> str:
    parts = [
        f"Name: {profile.first_name} {profile.last_name}",
        f"Email: {profile.email}",
        f"Phone: {profile.phone}",
        f"Location: {profile.city}, {profile.state}, {profile.country}",
        f"LinkedIn: {profile.linkedin_url}",
        f"GitHub: {profile.github_url}",
        f"Work authorized: {profile.work_authorized}; Needs sponsorship: {profile.requires_sponsorship}",
        f"Work model: {profile.work_model_preference}; Relocate: {profile.willing_to_relocate}",
        f"Years experience: {profile.years_experience}",
        f"Skill years: {profile.skill_years}",
        f"Notice period: {profile.notice_period}; Start: {profile.earliest_start_date}",
        f"Security clearance: {profile.security_clearance}",
    ]
    for cf in custom_fields:
        if cf.label and cf.value:
            parts.append(f"{cf.label}: {cf.value}")
    return "\n".join(parts)
