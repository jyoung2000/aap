"""Pytest fixtures. Uses an isolated SQLite DB and a real TestClient so auth,
CSRF, and per-user isolation are exercised end to end."""
from __future__ import annotations

import os
import tempfile

# Configure the app for tests BEFORE importing it.
_tmp = tempfile.mkdtemp(prefix="jobpilot-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["DATA_DIR"] = _tmp
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["ANTHROPIC_API_KEY"] = ""  # force heuristic fallbacks
os.environ["SERVER_EXECUTOR_MODE"] = "simulate"  # no browser launches in tests

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app import models  # noqa: F401,E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def register(client: TestClient, email: str, password: str = "password123") -> dict:
    """Sign up and return a client-bound session (cookies + CSRF header helper)."""
    r = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def csrf_headers(client: TestClient) -> dict:
    token = client.cookies.get("jp_csrf")
    return {"x-csrf-token": token} if token else {}
