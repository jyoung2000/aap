"""Import / export round-trips."""
from __future__ import annotations

import io
import json

from tests.conftest import csrf_headers


def test_profile_export_and_jobs_import(client):
    client.post("/api/auth/signup", json={"email": "io@x.com", "password": "password123"})
    h = csrf_headers(client)

    client.post("/api/profile/custom-fields", json={"label": "Clearance", "type": "text", "value": "Secret"}, headers=h)
    client.post("/api/profile/saved-answers", json={"question": "Fav lang?", "answer": "Python"}, headers=h)
    client.post("/api/profile/experience", json={"title": "Engineer", "company": "Acme"}, headers=h)

    prof = client.get("/api/export/profile.json").json()
    assert prof["custom_fields"][0]["label"] == "Clearance"
    assert prof["saved_answers"][0]["answer"] == "Python"
    assert prof["work_experience"][0]["company"] == "Acme"

    # Import a job list (JSON) with default column names.
    jobs = [{"title": "Data Scientist", "company": "BetaCorp", "location": "Remote", "url": "https://betacorp/jobs/9"}]
    payload = io.BytesIO(json.dumps(jobs).encode())
    r = client.post("/api/import/jobs", files={"file": ("jobs.json", payload, "application/json")}, data={"mapping": "{}"}, headers=h)
    assert r.status_code == 200 and r.json()["imported"] == 1

    listed = client.get("/api/jobs").json()
    assert any(j["title"] == "Data Scientist" for j in listed)

    # Re-importing the same list dedupes (0 new).
    payload2 = io.BytesIO(json.dumps(jobs).encode())
    r = client.post("/api/import/jobs", files={"file": ("jobs.json", payload2, "application/json")}, data={"mapping": "{}"}, headers=h)
    assert r.json()["imported"] == 0


def test_profile_import_preview_then_apply(client):
    client.post("/api/auth/signup", json={"email": "io2@x.com", "password": "password123"})
    h = csrf_headers(client)
    data = {
        "personal": {"first_name": "Grace", "last_name": "Hopper", "city": "Arlington"},
        "work_experience": [{"title": "Rear Admiral", "company": "US Navy"}],
        "custom_fields": [{"label": "Rank", "type": "text", "value": "Admiral"}],
        "saved_answers": [{"question": "Relocate?", "answer": "Yes"}],
    }
    blob = io.BytesIO(json.dumps(data).encode())

    # Preview only.
    r = client.post("/api/import/profile", files={"file": ("p.json", blob, "application/json")}, data={"apply": "false"}, headers=h)
    body = r.json()
    assert body["applied"] is False
    assert body["preview"]["work_experience"] == 1

    # Apply.
    blob2 = io.BytesIO(json.dumps(data).encode())
    r = client.post("/api/import/profile", files={"file": ("p.json", blob2, "application/json")}, data={"apply": "true"}, headers=h)
    assert r.json()["applied"] is True

    prof = client.get("/api/profile").json()
    assert prof["first_name"] == "Grace"
    exps = client.get("/api/profile/experience").json()
    assert any(e["company"] == "US Navy" for e in exps)


def test_export_endpoints_return_files(client):
    client.post("/api/auth/signup", json={"email": "io3@x.com", "password": "password123"})
    for path, ctype in [
        ("/api/export/jobs.csv", "text/csv"),
        ("/api/export/jobs.json", "application/json"),
        ("/api/export/profile.json", "application/json"),
        ("/api/export/applications.csv", "text/csv"),
        ("/api/export/all.zip", "application/zip"),
    ]:
        r = client.get(path)
        assert r.status_code == 200, path
        assert ctype in r.headers.get("content-type", "")
