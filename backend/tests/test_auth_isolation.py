"""Multi-user isolation + CSRF tests through the real HTTP layer."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import csrf_headers


def _signup(c: TestClient, email: str):
    r = c.post("/api/auth/signup", json={"email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    return r.json()


def test_user_cannot_read_another_users_jobs():
    with TestClient(app) as ca, TestClient(app) as cb:
        _signup(ca, "alice-iso@x.com")
        _signup(cb, "bob-iso@x.com")

        # Alice adds a work experience entry.
        r = ca.post("/api/profile/experience", json={"title": "Secret Role", "company": "AliceCorp"}, headers=csrf_headers(ca))
        assert r.status_code == 201, r.text
        exp_id = r.json()["id"]

        # Bob lists his experience — must not see Alice's.
        r = cb.get("/api/profile/experience")
        assert r.status_code == 200
        assert all(item["id"] != exp_id for item in r.json())

        # Bob tries to fetch Alice's experience by guessing the id -> 404.
        r = cb.put(f"/api/profile/experience/{exp_id}", json={"title": "hacked"}, headers=csrf_headers(cb))
        assert r.status_code == 404

        r = cb.delete(f"/api/profile/experience/{exp_id}", headers=csrf_headers(cb))
        assert r.status_code == 404


def test_saved_answers_are_scoped():
    with TestClient(app) as ca, TestClient(app) as cb:
        _signup(ca, "alice-kb@x.com")
        _signup(cb, "bob-kb@x.com")
        ca.post("/api/profile/saved-answers", json={"question": "Q?", "answer": "AlicesAnswer"}, headers=csrf_headers(ca))
        r = cb.get("/api/profile/saved-answers")
        assert r.status_code == 200
        assert all(a["answer"] != "AlicesAnswer" for a in r.json())


def test_requires_auth():
    with TestClient(app) as c:
        assert c.get("/api/profile").status_code == 401
        assert c.get("/api/jobs").status_code == 401


def test_csrf_required_on_writes():
    with TestClient(app) as c:
        _signup(c, "csrf@x.com")
        # Missing CSRF header on a write -> 403.
        r = c.post("/api/profile/experience", json={"title": "X"})
        assert r.status_code == 403
        # With header -> ok.
        r = c.post("/api/profile/experience", json={"title": "X"}, headers=csrf_headers(c))
        assert r.status_code == 201


def test_change_password_and_relogin():
    with TestClient(app) as c:
        _signup(c, "pw@x.com")
        r = c.post("/api/auth/change-password", json={"current_password": "password123", "new_password": "newpass1234"}, headers=csrf_headers(c))
        assert r.status_code == 204
        # Old session revoked; sign in again with the new password.
        r = c.post("/api/auth/signin", json={"email": "pw@x.com", "password": "newpass1234"})
        assert r.status_code == 200


def test_delete_account_cascades():
    with TestClient(app) as c:
        _signup(c, "del@x.com")
        c.post("/api/profile/experience", json={"title": "X"}, headers=csrf_headers(c))
        r = c.request("DELETE", "/api/auth/me", headers=csrf_headers(c))
        assert r.status_code == 204
        # Cannot sign in anymore.
        r = c.post("/api/auth/signin", json={"email": "del@x.com", "password": "password123"})
        assert r.status_code == 401
