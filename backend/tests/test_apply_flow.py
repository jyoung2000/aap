"""End-to-end apply flow with a remote (web) human-in-the-loop answer.

Exercises the definition-of-done demo path without a browser or network:
queue -> server executor -> pause at a screening question -> answer from the web
UI -> knowledge base saves it -> resume -> submitted -> visible in analytics.
"""
from __future__ import annotations

import asyncio

from app.db import SessionLocal
from app.models import Job
from app.worker.tasks import run_server_apply_task
from tests.conftest import csrf_headers


def _make_job(user_id: str) -> str:
    db = SessionLocal()
    try:
        job = Job(
            user_id=user_id, title="Backend Engineer", company="Acme",
            source="greenhouse", apply_url="https://boards.greenhouse.io/acme/jobs/1",
            server_apply_capable=True, dedupe_key=f"flow-{user_id}",
            description="We build with Python and FastAPI.",
        )
        db.add(job)
        db.commit()
        return job.id
    finally:
        db.close()


def test_remote_hitl_apply_flow(client):
    user = client.post("/api/auth/signup", json={"email": "flow@x.com", "password": "password123"}).json()
    # Fill enough profile so standard fields resolve deterministically.
    client.patch("/api/profile", json={
        "first_name": "Ada", "last_name": "Lovelace", "email": "ada@x.com",
        "phone": "+1 555 0100", "city": "London", "years_experience": 8,
    }, headers=csrf_headers(client))

    job_id = _make_job(user["id"])

    # Queue via the real API (server-side / Playwright executor).
    r = client.post("/api/applications", json={
        "job_ids": [job_id], "mode": "auto", "executor": "playwright",
    }, headers=csrf_headers(client))
    assert r.status_code == 201, r.text
    app_id = r.json()[0]["id"]
    assert r.json()[0]["executor"] == "playwright"

    # Worker picks it up (run inline since Redis/arq isn't up in tests).
    asyncio.run(run_server_apply_task(None, user["id"], app_id))
    body = client.get(f"/api/applications/{app_id}").json()
    assert body["status"] == "needs_human", body

    # The pause surfaces in the Apply Queue as an intervention (the screening question).
    queue = client.get("/api/queue").json()
    assert len(queue) == 1
    iv = queue[0]
    assert "why do you want to work here" in iv["question"].lower()

    # Answer it remotely from the web UI, saving to the knowledge base.
    r = client.post(f"/api/interventions/{iv['id']}/answer",
                    json={"answer": "I admire your mission and the team.", "save_to_kb": True},
                    headers=csrf_headers(client))
    assert r.status_code == 200

    # It was written to the knowledge base so it is never asked again.
    kb = client.get("/api/profile/saved-answers").json()
    assert any("mission" in a["answer"] for a in kb)

    # Resume the run — the saved answer now resolves the question and it submits.
    asyncio.run(run_server_apply_task(None, user["id"], app_id))
    body = client.get(f"/api/applications/{app_id}").json()
    assert body["status"] == "submitted", body
    assert body["confirmation_screenshot"]
    assert body["submitted_at"]

    # Analytics reflects the submitted application with its timestamp.
    dash = client.get("/api/analytics/dashboard").json()
    assert dash["cards"]["total_applications"] >= 1

    # The application log carries the timestamped transition trail.
    events = body["events"]
    trail = [(e["from_state"], e["to_state"]) for e in events]
    assert ("queued", "filling") in trail
    assert ("filling", "needs_human") in trail
    assert (any(t == ("filling", "submitted") for t in trail))
