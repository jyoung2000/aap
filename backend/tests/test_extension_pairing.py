"""Extension pairing + device-scoped queue endpoints."""
from __future__ import annotations

from app.db import SessionLocal
from app.models import Application, Job
from tests.conftest import csrf_headers


def test_pair_and_pull_queue(client):
    user = client.post("/api/auth/signup", json={"email": "pair@x.com", "password": "password123"}).json()

    # Generate a pairing code (authenticated).
    pc = client.post("/api/extension/pairing-code", headers=csrf_headers(client)).json()
    assert len(pc["code"]) == 6
    assert pc["pair_url"].endswith(pc["code"])

    # Exchange the code for a device token (unauthenticated endpoint the extension calls).
    pair = client.post("/api/extension/pair", json={"code": pc["code"], "name": "Test Chrome", "browser": "chrome"}).json()
    token = pair["device_token"]
    assert token
    assert pair["ws_url"].endswith("/ws/ext")
    auth = {"Authorization": f"Bearer {token}"}

    # The device can identify itself and belongs to the right user.
    ping = client.get("/api/ext/ping", headers=auth).json()
    assert ping["ok"] is True
    assert ping["user_id"] == user["id"]

    # It shows up in the user's device list.
    devices = client.get("/api/extension/devices").json()
    assert len(devices) == 1 and devices[0]["browser"] == "chrome"

    # Queue a job for the extension executor and pull it.
    db = SessionLocal()
    try:
        job = Job(user_id=user["id"], title="Engineer", company="Acme", apply_url="https://x/apply", dedupe_key="pairjob")
        db.add(job)
        db.flush()
        db.add(Application(user_id=user["id"], job_id=job.id, executor="extension", status="queued"))
        db.commit()
    finally:
        db.close()

    nxt = client.get("/api/ext/queue/next", headers=auth).json()
    assert nxt["application"] is not None
    assert nxt["application"]["title"] == "Engineer"

    # Pulling again returns empty (the item is now 'filling', not 'queued').
    nxt2 = client.get("/api/ext/queue/next", headers=auth).json()
    assert nxt2["application"] is None

    # Revoke the device -> its token stops working.
    client.delete(f"/api/extension/devices/{devices[0]['id']}", headers=csrf_headers(client))
    assert client.get("/api/ext/ping", headers=auth).status_code == 401


def test_invalid_pairing_code_rejected(client):
    client.post("/api/auth/signup", json={"email": "pair2@x.com", "password": "password123"})
    r = client.post("/api/extension/pair", json={"code": "000000", "name": "X", "browser": "firefox"})
    assert r.status_code == 400


def test_device_token_required(client):
    assert client.get("/api/ext/queue/next").status_code == 401
    assert client.get("/api/ext/ping", headers={"Authorization": "Bearer nope"}).status_code == 401
