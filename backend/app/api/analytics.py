"""Dashboard metrics, time series, and funnel breakdowns."""
from __future__ import annotations

from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..db import as_aware, get_db, utcnow
from ..models import SUBMITTED, Application, Intervention, Job, JobSearch, User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

RESPONSE_STATUSES = {"recruiter_reply", "interview", "offer"}


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    found_today = db.scalar(
        select(func.count(Job.id)).where(Job.user_id == user.id, Job.created_at >= today)
    ) or 0
    applied_week = db.scalar(
        select(func.count(Application.id)).where(
            Application.user_id == user.id, Application.status == SUBMITTED, Application.submitted_at >= week_ago
        )
    ) or 0
    apps = list(db.scalars(select(Application).where(Application.user_id == user.id)).all())
    responses = sum(1 for a in apps if a.funnel_status in RESPONSE_STATUSES)
    interviews = sum(1 for a in apps if a.funnel_status == "interview")
    offers = sum(1 for a in apps if a.funnel_status == "offer")
    pending = db.scalar(
        select(func.count(Intervention.id)).where(Intervention.user_id == user.id, Intervention.resolved.is_(False))
    ) or 0

    # Applications over time (submitted, last 30 days).
    thirty = now - timedelta(days=30)
    buckets: Counter = Counter()
    for a in apps:
        sub = as_aware(a.submitted_at)
        if sub and sub >= thirty:
            buckets[sub.date().isoformat()] += 1
    series = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).date().isoformat()
        series.append({"date": day, "count": buckets.get(day, 0)})

    # Per-source & per-search breakdowns.
    job_by_id = {j.id: j for j in db.scalars(select(Job).where(Job.user_id == user.id)).all()}
    per_source: Counter = Counter()
    for a in apps:
        j = job_by_id.get(a.job_id)
        if j:
            per_source[j.source] += 1
    searches = db.scalars(select(JobSearch).where(JobSearch.user_id == user.id)).all()
    per_search = [
        {"id": s.id, "keywords": s.keywords or "(all)", "location": s.location, "found": s.found_count}
        for s in searches
    ][:10]

    status_counts: Counter = Counter(a.status for a in apps)

    return {
        "cards": {
            "found_today": found_today,
            "applied_this_week": applied_week,
            "responses": responses,
            "interviews": interviews,
            "offers": offers,
            "pending_interventions": pending,
            "total_applications": len(apps),
            "total_jobs": len(job_by_id),
        },
        "applications_over_time": series,
        "per_source": [{"source": k, "count": v} for k, v in per_source.most_common()],
        "per_search": per_search,
        "status_breakdown": [{"status": k, "count": v} for k, v in status_counts.items()],
    }


@router.get("/funnel")
def funnel(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    apps = list(db.scalars(select(Application).where(Application.user_id == user.id)).all())
    submitted = sum(1 for a in apps if a.status == SUBMITTED)
    counts = Counter(a.funnel_status or "no_status" for a in apps if a.status == SUBMITTED)
    stages = [
        {"stage": "Submitted", "count": submitted},
        {"stage": "No response", "count": counts.get("no_response", 0)},
        {"stage": "Recruiter reply", "count": counts.get("recruiter_reply", 0)},
        {"stage": "Interview", "count": counts.get("interview", 0)},
        {"stage": "Offer", "count": counts.get("offer", 0)},
        {"stage": "Rejected", "count": counts.get("rejected", 0)},
    ]
    return {"stages": stages}
