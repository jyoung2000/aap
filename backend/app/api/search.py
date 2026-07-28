"""Job discovery API: launch searches (background) and browse results."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..core.scoping import get_owned
from ..db import get_db
from ..models import Application, Job, JobSearch, User
from ..queue import enqueue
from ..schemas.jobs import JobListItem, JobOut, SearchCreate, SearchOut

router = APIRouter(prefix="/api", tags=["search"])


@router.post("/search", response_model=SearchOut, status_code=202)
async def create_search(
    payload: SearchCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    search = JobSearch(
        user_id=user.id,
        keywords=payload.keywords,
        location=payload.location,
        remote_only=payload.remote_only,
        filters={
            "salary_floor": payload.salary_floor,
            "education_level": payload.education_level,
            "posted_within_days": payload.posted_within_days,
            "sources": payload.sources,
        },
    )
    db.add(search)
    db.commit()
    await enqueue("run_search_task", user.id, search.id)
    return search


@router.get("/search", response_model=list[SearchOut])
def list_searches(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(JobSearch).where(JobSearch.user_id == user.id).order_by(JobSearch.created_at.desc()).limit(50)
    ).all()
    return list(rows)


@router.get("/search/{search_id}", response_model=SearchOut)
def get_search(search_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_owned(db, JobSearch, search_id, user.id)


@router.get("/jobs", response_model=list[JobListItem])
def list_jobs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    search_id: str | None = None,
    source: str | None = None,
    min_match: int | None = None,
    q: str | None = None,
    remote_only: bool = False,
    sort: str = Query("match", pattern="^(match|date|salary|company|title)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(100, le=500),
    offset: int = 0,
):
    stmt = select(Job).where(Job.user_id == user.id)
    if search_id:
        stmt = stmt.where(Job.search_id == search_id)
    if source:
        stmt = stmt.where(Job.source == source)
    if min_match is not None:
        stmt = stmt.where(Job.match_score >= min_match)
    if remote_only:
        stmt = stmt.where(Job.remote.is_(True))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Job.title).ilike(like) | func.lower(Job.company).ilike(like))

    sort_col = {
        "match": Job.match_score,
        "date": Job.post_date,
        "salary": Job.salary_max,
        "company": Job.company,
        "title": Job.title,
    }[sort]
    stmt = stmt.order_by(sort_col.desc().nullslast() if order == "desc" else sort_col.asc().nullsfirst())
    stmt = stmt.limit(limit).offset(offset)
    jobs = db.scalars(stmt).all()

    applied_ids = set(
        db.scalars(select(Application.job_id).where(Application.user_id == user.id)).all()
    )
    result = []
    for j in jobs:
        item = JobListItem.model_validate(j)
        item.has_application = j.id in applied_ids
        result.append(item)
    return result


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_owned(db, Job, job_id, user.id)


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Job, job_id, user.id))
    db.commit()
    return Response(status_code=204)
