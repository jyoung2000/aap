"""arq background tasks: run a discovery search, and drive the server-side executor."""
from __future__ import annotations

import logging

from sqlalchemy import select

from ..db import SessionLocal, utcnow
from ..models import (
    FILLING,
    NEEDS_HUMAN,
    QUEUED,
    SUBMITTED,
    TERMINAL_STATES,
    Application,
    Job,
    JobSearch,
    OrgSlug,
    Profile,
    ProfileFile,
    SEARCH_DONE,
    SEARCH_FAILED,
    SEARCH_RUNNING,
    User,
    WorkExperience,
)
from ..redis_bus import publish_sync
from ..sources.base import SourceQuery
from ..sources.registry import default_slug_provider, run_discovery
from ..sources.slugs import SEED_SLUGS

log = logging.getLogger("jobpilot.worker")


def _profile_text(db, user_id: str) -> str:
    prof = db.scalar(select(Profile).where(Profile.user_id == user_id))
    exps = db.scalars(select(WorkExperience).where(WorkExperience.user_id == user_id)).all()
    resume = db.scalar(select(ProfileFile).where(ProfileFile.user_id == user_id, ProfileFile.kind == "resume"))
    parts = []
    if prof:
        parts.append(f"{prof.first_name} {prof.last_name}. {prof.city}, {prof.country}.")
        parts.append(f"Years experience: {prof.years_experience}. Skills: {prof.skill_years}.")
    for e in exps:
        parts.append(f"{e.title} at {e.company}: " + " ".join(e.bullets or []))
    if resume and resume.extracted_text:
        parts.append(resume.extracted_text[:3000])
    return "\n".join(parts)


async def run_search_task(ctx, user_id: str, search_id: str):
    db = SessionLocal()
    try:
        search = db.get(JobSearch, search_id)
        if not search or search.user_id != user_id:
            return
        search.status = SEARCH_RUNNING
        search.progress = 0.0
        db.commit()

        f = search.filters or {}
        query = SourceQuery(
            keywords=search.keywords, location=search.location, remote_only=search.remote_only,
            salary_floor=f.get("salary_floor"), education_level=f.get("education_level", ""),
            posted_within_days=f.get("posted_within_days"),
        )
        enabled_sources = f.get("sources") or None

        def slug_provider(source: str) -> list[str]:
            seeds = default_slug_provider(source)
            db_slugs = [r.slug for r in db.scalars(select(OrgSlug).where(OrgSlug.source == source)).all()]
            return list(dict.fromkeys(seeds + db_slugs))

        def slug_recorder(source: str, slug: str, via: str) -> None:
            exists = db.scalar(select(OrgSlug).where(OrgSlug.source == source, OrgSlug.slug == slug))
            if not exists:
                db.add(OrgSlug(source=source, slug=slug, discovered_via=via, first_seen=utcnow()))
                db.commit()

        def progress_cb(frac: float, msg: str) -> None:
            search.progress = frac
            search.message = msg
            db.commit()
            publish_sync(user_id, {"type": "search.progress", "target": "web", "search_id": search_id, "progress": frac, "message": msg})

        listings = run_discovery(
            query, enabled_sources=enabled_sources,
            slug_provider=slug_provider, slug_recorder=slug_recorder, progress_cb=progress_cb,
        )

        profile_text = _profile_text(db, user_id)
        new_count = 0
        from ..llm.matching import enrich_job

        source_breakdown: dict[str, int] = {}
        for i, l in enumerate(listings):
            dedupe = l.extra.get("dedupe_key") or l.apply_url or l.canonical_url
            existing = db.scalar(select(Job).where(Job.user_id == user_id, Job.dedupe_key == dedupe))
            if existing:
                continue
            job = Job(
                user_id=user_id, search_id=search_id, external_id=l.external_id, title=l.title,
                company=l.company, location=l.location, remote=l.remote, salary_min=l.salary_min,
                salary_max=l.salary_max, salary_currency=l.salary_currency, salary_period=l.salary_period,
                salary_text=l.salary_text, education_level=l.education_level, post_date=l.post_date,
                source=l.source, canonical_url=l.canonical_url, apply_url=l.apply_url,
                description=l.description, dedupe_key=dedupe, server_apply_capable=l.server_apply_capable,
            )
            # Enrichment (bounded to keep runs responsive).
            if i < 60:
                enrich = enrich_job(title=l.title, company=l.company, description=l.description, profile_text=profile_text)
                job.summary = enrich["summary"]
                job.requirements = enrich["requirements"]
                job.match_score = enrich["match_score"]
                job.match_rationale = enrich["match_rationale"]
                job.enriched = True
            db.add(job)
            new_count += 1
            source_breakdown[l.source] = source_breakdown.get(l.source, 0) + 1
        db.commit()

        search.status = SEARCH_DONE
        search.found_count = len(listings)
        search.new_count = new_count
        search.source_breakdown = source_breakdown
        search.progress = 1.0
        search.message = f"Found {len(listings)} listings ({new_count} new)"
        db.commit()
        publish_sync(user_id, {"type": "search.done", "target": "web", "search_id": search_id, "found": len(listings), "new": new_count})
    except Exception as exc:
        log.exception("search task failed")
        search = db.get(JobSearch, search_id)
        if search:
            search.status = SEARCH_FAILED
            search.error = str(exc)[:500]
            db.commit()
            publish_sync(user_id, {"type": "search.failed", "target": "web", "search_id": search_id, "error": str(exc)[:200]})
    finally:
        db.close()


async def run_server_apply_task(ctx, user_id: str, application_id: str, retry: int = 0):
    """Re-entrant server-side apply. Pauses at human-in-the-loop and resumes when
    the answer arrives (the web answer endpoint re-enqueues this task)."""
    from ..core.orchestration import resolve_fields
    from ..core.state_machine import transition
    from . import executor

    db = SessionLocal()
    try:
        app = db.get(Application, application_id)
        if not app or app.user_id != user_id or app.status in TERMINAL_STATES:
            return
        user = db.get(User, user_id)
        job = db.get(Job, app.job_id)
        if app.status == QUEUED:
            transition(db, app, FILLING, note="Server executor started")

        # Playwright uses the sync API; run it off the worker's event loop thread.
        import asyncio

        fields = await asyncio.to_thread(executor.detect_fields, job)
        result = resolve_fields(db, user, app, fields)

        if result["interventions"]:
            if app.status != NEEDS_HUMAN:
                transition(db, app, NEEDS_HUMAN, note="Awaiting human input (server executor)")
            _notify_pause(user, app, job, result["interventions"])
            return  # resumed when the user answers from the web UI

        snapshot = {r["label"]: r["value"] for r in result["resolved"] if r["value"]}
        confirmation = await asyncio.to_thread(executor.submit, job, snapshot, humanized=app.humanized)
        app.field_snapshot = snapshot
        app.confirmation_screenshot = confirmation
        transition(db, app, SUBMITTED, note="Submitted by server executor")
    except Exception as exc:
        log.exception("server apply failed")
        app = db.get(Application, application_id)
        if app:
            app.error = str(exc)[:500]
            app.retry_count += 1
            db.commit()
            from ..models import FAILED
            from ..core.state_machine import transition as _t
            try:
                _t(db, app, FAILED, note=f"Error: {str(exc)[:120]}")
            except Exception:
                pass
    finally:
        db.close()


def _notify_pause(user, app, job, interventions):
    from ..core.notify import send_pause_notification

    q = interventions[0].get("question") if interventions else "input needed"
    send_pause_notification(user, f"JobPilot needs you: {q}", app_id=app.id, job=(job.title if job else ""))
