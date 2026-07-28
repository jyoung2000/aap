"""Connector parsing tests using recorded fixtures (no network)."""
from __future__ import annotations

from app.sources.ats import AshbySource, GreenhouseSource, LeverSource
from app.sources.base import RawListing, SourceQuery
from app.sources.registry import dedupe, dedupe_key

GREENHOUSE = {
    "jobs": [
        {
            "id": 101,
            "title": "Senior Python Engineer",
            "location": {"name": "Remote - US"},
            "content": "<p>We build with <b>Python</b> and FastAPI.</p>",
            "absolute_url": "https://boards.greenhouse.io/acme/jobs/101",
            "updated_at": "2026-07-01T12:00:00Z",
        },
        {
            "id": 102,
            "title": "Marketing Manager",
            "location": {"name": "New York"},
            "content": "<p>Own campaigns.</p>",
            "absolute_url": "https://boards.greenhouse.io/acme/jobs/102",
            "updated_at": "2026-06-15T12:00:00Z",
        },
    ]
}

LEVER = [
    {
        "id": "abc-123",
        "text": "Backend Engineer",
        "categories": {"location": "San Francisco", "team": "Platform"},
        "descriptionPlain": "Python and Postgres.",
        "hostedUrl": "https://jobs.lever.co/acme/abc-123",
        "applyUrl": "https://jobs.lever.co/acme/abc-123/apply",
        "createdAt": 1700000000000,
        "workplaceType": "remote",
    }
]

ASHBY = {
    "jobs": [
        {
            "id": "x1",
            "title": "Data Engineer",
            "location": "Remote",
            "descriptionPlain": "SQL, Python, dbt.",
            "jobUrl": "https://jobs.ashbyhq.com/acme/x1",
            "isRemote": True,
            "publishedAt": "2026-06-01",
            "compensation": {"compensationTierSummary": "$150,000 - $190,000"},
        }
    ]
}


class FakeResp:
    def __init__(self, data=None, text=""):
        self._data = data
        self.text = text
        self.status_code = 200

    def json(self):
        return self._data


class FakeClient:
    def __init__(self, mapping):
        self.mapping = mapping

    def get(self, url, params=None, headers=None):
        for key, data in self.mapping.items():
            if key in url:
                return FakeResp(data)
        return FakeResp({})

    def post(self, url, json=None, data=None, headers=None):
        return FakeResp({})

    def close(self):
        pass


def test_greenhouse_parsing_and_filtering():
    src = GreenhouseSource(FakeClient({"greenhouse.io": GREENHOUSE}), slugs=["acme"])
    results = src.search(SourceQuery(keywords="python"))
    assert len(results) == 1
    job = results[0]
    assert job.title == "Senior Python Engineer"
    assert job.source == "greenhouse"
    assert job.remote is True
    assert "Python" in job.description and "FastAPI" in job.description
    assert job.server_apply_capable is True
    assert job.apply_url.endswith("/jobs/101")


def test_lever_parsing():
    src = LeverSource(FakeClient({"lever.co": LEVER}), slugs=["acme"])
    results = src.search(SourceQuery(keywords="backend"))
    assert len(results) == 1
    assert results[0].title == "Backend Engineer"
    assert results[0].apply_url.endswith("/apply")
    assert results[0].remote is True


def test_ashby_parsing_with_salary():
    src = AshbySource(FakeClient({"ashbyhq.com": ASHBY}), slugs=["acme"])
    results = src.search(SourceQuery(keywords="data"))
    assert len(results) == 1
    job = results[0]
    assert job.title == "Data Engineer"
    assert job.salary_min == 150000
    assert job.salary_max == 190000
    assert job.salary_currency == "USD"


def test_dedupe_by_url_and_fuzzy_title():
    a = RawListing(source="greenhouse", title="Senior Python Engineer", company="Acme", apply_url="https://x.com/1")
    b = RawListing(source="lever", title="Senior Python Engineer", company="Acme", apply_url="https://x.com/1")  # same url
    c = RawListing(source="ashby", title="Senior  Python  Engineer!", company="Acme", apply_url="https://y.com/2")  # fuzzy dup
    d = RawListing(source="ashby", title="Product Manager", company="Acme", apply_url="https://z.com/3")
    out = dedupe([a, b, c, d])
    titles = sorted(x.title for x in out)
    # a/b collapse (same URL); c is a fuzzy dup of a; d survives
    assert len(out) == 2
    assert "Product Manager" in titles


def test_dedupe_key_normalizes_url():
    l = RawListing(source="s", apply_url="https://WWW.Example.com/jobs/5/")
    assert dedupe_key(l) == "example.com/jobs/5"
