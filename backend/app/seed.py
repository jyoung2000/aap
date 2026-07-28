"""Seed script — demo user, sample profile, and a live pull from real ATS boards
so the first run is never empty. Run with:  python -m app.seed

Safe to run repeatedly (idempotent on the demo user's email).
"""
from __future__ import annotations

import logging

from sqlalchemy import select

from .core.security import hash_password
from .db import SessionLocal, init_db, utcnow
from .llm.matching import enrich_job
from .models import (
    CustomField,
    Education,
    Job,
    JobSearch,
    Profile,
    SavedAnswer,
    SEARCH_DONE,
    User,
    WorkExperience,
)
from .sources.base import SourceQuery
from .sources.registry import dedupe_key, run_discovery

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("jobpilot.seed")

DEMO_EMAIL = "demo@jobpilot.local"
DEMO_PASSWORD = "demo12345"

# Curated fallback listings so the results screen is populated even on a locked-down
# network. On an open network the live pull below adds many more real listings.
SAMPLE_JOBS = [
    {
        "title": "Senior Backend Engineer (Python)", "company": "Acme Cloud",
        "location": "Remote - US", "remote": True, "salary_text": "$160,000 - $200,000",
        "salary_min": 160000, "salary_max": 200000, "salary_currency": "USD", "salary_period": "year",
        "education_level": "Bachelor's", "source": "greenhouse", "server_apply_capable": True,
        "apply_url": "https://boards.greenhouse.io/example/jobs/1000001",
        "description": "We are hiring a Senior Backend Engineer to build distributed systems in Python and FastAPI. "
                       "5+ years of experience with Postgres, Redis, and cloud infrastructure required. You will design APIs, "
                       "own services end to end, and mentor engineers.",
    },
    {
        "title": "Full-Stack Engineer", "company": "Northwind Labs",
        "location": "New York, NY", "remote": False, "salary_text": "$140,000 - $175,000",
        "salary_min": 140000, "salary_max": 175000, "salary_currency": "USD", "salary_period": "year",
        "education_level": "Bachelor's", "source": "lever", "server_apply_capable": True,
        "apply_url": "https://jobs.lever.co/example/2000002",
        "description": "Join our product team building React + TypeScript frontends and Python backends. "
                       "Experience with modern web tooling, REST APIs, and a passion for great UX.",
    },
    {
        "title": "Platform Engineer", "company": "Helios Data",
        "location": "Remote", "remote": True, "salary_text": "Not listed",
        "education_level": "", "source": "ashby", "server_apply_capable": True,
        "apply_url": "https://jobs.ashbyhq.com/example/3000003",
        "description": "Own our Kubernetes platform and developer tooling. Strong Go or Python, Terraform, and CI/CD experience.",
    },
    {
        "title": "Data Engineer", "company": "BlueSky Analytics",
        "location": "Austin, TX (Hybrid)", "remote": False, "salary_text": "$150,000+",
        "salary_min": 150000, "salary_currency": "USD", "salary_period": "year",
        "education_level": "Master's", "source": "workable", "server_apply_capable": False,
        "apply_url": "https://apply.workable.com/example/j/ABCDEF/",
        "description": "Build data pipelines with Python, dbt, and Snowflake. SQL expertise and streaming experience a plus.",
    },
    {
        "title": "Site Reliability Engineer", "company": "Orbit Payments",
        "location": "Remote - US", "remote": True, "salary_text": "$165,000 - $210,000",
        "salary_min": 165000, "salary_max": 210000, "salary_currency": "USD", "salary_period": "year",
        "education_level": "Bachelor's", "source": "smartrecruiters", "server_apply_capable": False,
        "apply_url": "https://jobs.smartrecruiters.com/example/4000004",
        "description": "Keep our payment systems reliable at scale. On-call, observability, Python/Go, and incident response.",
    },
]

DEMO_RESUME_TEXT = (
    "Alex Morgan — Senior Software Engineer. Python, FastAPI, React, TypeScript, Postgres, Redis, AWS, Kubernetes. "
    "8 years building backend services and full-stack products. Led platform teams, designed APIs, mentored engineers."
)


def _ensure_demo_user(db) -> User:
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user:
        return user
    user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD), humanized_input=True, onboarding_done=True)
    db.add(user)
    db.flush()
    db.add(Profile(
        user_id=user.id, first_name="Alex", last_name="Morgan", email=DEMO_EMAIL,
        phone="+1 555 0142", city="Denver", state="CO", country="United States",
        linkedin_url="https://linkedin.com/in/alexmorgan", github_url="https://github.com/alexmorgan",
        work_authorized="Yes", requires_sponsorship="No", work_model_preference="Remote",
        willing_to_relocate="No", salary_expectation_amount=180000, years_experience=8,
        skill_years={"Python": 8, "React": 5, "AWS": 4, "Kubernetes": 3},
        notice_period="2 weeks", earliest_start_date="Immediately",
    ))
    db.add(WorkExperience(
        user_id=user.id, order=0, title="Senior Software Engineer", company="Vertex Systems",
        location="Remote", start_date="2021-03", end_date="", current=True,
        bullets=["Designed and shipped a high-throughput API platform in FastAPI",
                 "Cut p99 latency 40% by redesigning the caching layer",
                 "Mentored 4 engineers and led the on-call rotation"],
    ))
    db.add(WorkExperience(
        user_id=user.id, order=1, title="Software Engineer", company="Cobalt Apps",
        location="Denver, CO", start_date="2017-06", end_date="2021-02", current=False,
        bullets=["Built React + TypeScript dashboards used by 10k+ users",
                 "Introduced CI/CD and cut deploy time from hours to minutes"],
    ))
    db.add(Education(
        user_id=user.id, order=0, degree="B.S.", field_of_study="Computer Science",
        school="University of Colorado", graduation_year="2017", gpa="3.8",
    ))
    db.add(CustomField(user_id=user.id, order=0, label="Security clearance", type="select",
                       options=["None", "Confidential", "Secret", "Top Secret"], value="None"))
    db.add(CustomField(user_id=user.id, order=1, label="Driver's license class", type="text", value="Class C"))
    db.add(SavedAnswer(user_id=user.id, question="How did you hear about this role?",
                       answer="Job board", question_key="how did you hear about this role", source="manual"))
    db.commit()
    log.info("Created demo user %s", DEMO_EMAIL)
    return user


def _seed_jobs(db, user: User) -> int:
    profile_text = DEMO_RESUME_TEXT
    search = JobSearch(
        user_id=user.id, keywords="software engineer python", location="Remote",
        remote_only=True, status=SEARCH_DONE, progress=1.0, message="Seeded search",
    )
    db.add(search)
    db.flush()

    inserted = 0

    # 1) Attempt a live pull from real public ATS boards (works on an open network).
    try:
        query = SourceQuery(keywords="engineer", location="", remote_only=True, limit_per_source=15)
        listings = run_discovery(query, enabled_sources=["greenhouse", "lever", "ashby", "remotive", "arbeitnow"], do_search_discovery=False)
        log.info("Live pull returned %d listings", len(listings))
        for l in listings[:40]:
            key = l.extra.get("dedupe_key") or dedupe_key(l)
            if db.scalar(select(Job).where(Job.user_id == user.id, Job.dedupe_key == key)):
                continue
            enr = enrich_job(title=l.title, company=l.company, description=l.description, profile_text=profile_text)
            db.add(Job(
                user_id=user.id, search_id=search.id, title=l.title, company=l.company, location=l.location,
                remote=l.remote, salary_min=l.salary_min, salary_max=l.salary_max, salary_currency=l.salary_currency,
                salary_period=l.salary_period, salary_text=l.salary_text, education_level=l.education_level,
                post_date=l.post_date, source=l.source, canonical_url=l.canonical_url, apply_url=l.apply_url,
                description=l.description, dedupe_key=key, server_apply_capable=l.server_apply_capable,
                summary=enr["summary"], requirements=enr["requirements"], match_score=enr["match_score"],
                match_rationale=enr["match_rationale"], enriched=True,
            ))
            inserted += 1
    except Exception as exc:
        log.warning("Live pull skipped/failed (%s) — using curated samples", exc)

    # 2) Always ensure a populated results screen with curated samples.
    for s in SAMPLE_JOBS:
        key = dedupe_key(type("L", (), {"apply_url": s["apply_url"], "canonical_url": s["apply_url"], "source": s["source"], "company": s["company"], "title": s["title"]})())
        if db.scalar(select(Job).where(Job.user_id == user.id, Job.dedupe_key == key)):
            continue
        enr = enrich_job(title=s["title"], company=s["company"], description=s["description"], profile_text=profile_text)
        db.add(Job(
            user_id=user.id, search_id=search.id, title=s["title"], company=s["company"], location=s["location"],
            remote=s["remote"], salary_min=s.get("salary_min"), salary_max=s.get("salary_max"),
            salary_currency=s.get("salary_currency", ""), salary_period=s.get("salary_period", ""),
            salary_text=s["salary_text"], education_level=s["education_level"], source=s["source"],
            canonical_url=s["apply_url"], apply_url=s["apply_url"], description=s["description"],
            dedupe_key=key, server_apply_capable=s["server_apply_capable"],
            summary=enr["summary"], requirements=enr["requirements"], match_score=enr["match_score"],
            match_rationale=enr["match_rationale"], enriched=True,
        ))
        inserted += 1

    search.found_count = inserted
    search.new_count = inserted
    db.commit()
    return inserted


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        user = _ensure_demo_user(db)
        existing = db.scalar(select(Job).where(Job.user_id == user.id))
        if existing:
            log.info("Demo user already has jobs; skipping job seed.")
        else:
            n = _seed_jobs(db, user)
            log.info("Seeded %d jobs", n)
        print("\n" + "=" * 60)
        print("  JobPilot seed complete")
        print(f"  Demo login:  {DEMO_EMAIL}  /  {DEMO_PASSWORD}")
        print("  Open http://localhost:1456 and sign in.")
        print("=" * 60 + "\n")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
