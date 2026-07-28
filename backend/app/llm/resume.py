"""Resume parsing into structured JSON (LLM with a heuristic fallback)."""
from __future__ import annotations

import re

from .client import complete_json

RESUME_SCHEMA_HINT = {
    "first_name": "",
    "last_name": "",
    "email": "",
    "phone": "",
    "city": "",
    "state": "",
    "country": "",
    "linkedin_url": "",
    "github_url": "",
    "portfolio_url": "",
    "years_experience": 0,
    "skills": ["skill1", "skill2"],
    "work_experience": [
        {
            "title": "",
            "company": "",
            "location": "",
            "start_date": "YYYY-MM",
            "end_date": "YYYY-MM or empty",
            "current": False,
            "bullets": ["accomplishment"],
        }
    ],
    "education": [
        {"degree": "", "field_of_study": "", "school": "", "graduation_year": "", "gpa": ""}
    ],
}


def parse_resume(text: str) -> dict:
    """Return structured resume data. Falls back to regex extraction without an LLM."""
    text = (text or "").strip()
    if not text:
        return {}
    result = complete_json(
        system=(
            "You are a precise resume parser. Extract structured data from the resume text. "
            "Do not invent facts; leave fields blank/empty if not present."
        ),
        prompt=f"Return JSON shaped exactly like this schema:\n{RESUME_SCHEMA_HINT}\n\nResume:\n{text[:12000]}",
        max_tokens=2500,
    )
    if isinstance(result, dict) and result:
        return result
    return _heuristic_parse(text)


_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"(\+?\d[\d\-\s().]{7,}\d)")
_LINKEDIN_RE = re.compile(r"(https?://)?(www\.)?linkedin\.com/in/[\w\-/]+", re.I)
_GITHUB_RE = re.compile(r"(https?://)?(www\.)?github\.com/[\w\-]+", re.I)


def _heuristic_parse(text: str) -> dict:
    email = _EMAIL_RE.search(text)
    phone = _PHONE_RE.search(text)
    linkedin = _LINKEDIN_RE.search(text)
    github = _GITHUB_RE.search(text)
    # Guess a name from the first non-empty line if it looks like a name.
    first_name = last_name = ""
    for line in text.splitlines():
        line = line.strip()
        if line and len(line.split()) in (2, 3) and "@" not in line and not any(c.isdigit() for c in line):
            parts = line.split()
            first_name, last_name = parts[0], parts[-1]
            break
    return {
        "first_name": first_name,
        "last_name": last_name,
        "email": email.group(0) if email else "",
        "phone": phone.group(0).strip() if phone else "",
        "linkedin_url": linkedin.group(0) if linkedin else "",
        "github_url": github.group(0) if github else "",
        "skills": [],
        "work_experience": [],
        "education": [],
        "_parsed_by": "heuristic",
    }
