"""Connector contract: `JobSource.search(query) -> list[RawListing]`."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

import httpx

log = logging.getLogger("jobpilot.sources")

USER_AGENT = "JobPilot/1.0 (+https://github.com/jyoung2000/aap; self-hosted job search)"

DEFAULT_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


@dataclass
class SourceQuery:
    keywords: str = ""
    location: str = ""
    remote_only: bool = False
    salary_floor: int | None = None
    education_level: str = ""
    posted_within_days: int | None = None
    limit_per_source: int = 40

    @property
    def terms(self) -> list[str]:
        return [t for t in re.split(r"[\s,]+", self.keywords.lower()) if t]


@dataclass
class RawListing:
    source: str
    external_id: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    remote: bool = False
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str = ""
    salary_period: str = ""
    salary_text: str = "Not listed"
    education_level: str = ""
    post_date: str = ""
    canonical_url: str = ""
    apply_url: str = ""
    description: str = ""
    server_apply_capable: bool = False
    extra: dict = field(default_factory=dict)


class JobSource:
    """Base connector. Subclasses implement `search`."""

    name: str = "base"
    requires_keys: bool = False

    def __init__(self, client: httpx.Client):
        self.client = client

    def enabled(self) -> bool:
        return True

    def search(self, query: SourceQuery) -> list[RawListing]:  # pragma: no cover - interface
        raise NotImplementedError


def make_client() -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=DEFAULT_TIMEOUT,
        follow_redirects=True,
    )


def matches_terms(text: str, terms: list[str]) -> bool:
    """A listing matches if any query term appears (OR semantics keeps recall high)."""
    if not terms:
        return True
    low = (text or "").lower()
    return any(t in low for t in terms)


def matches_location(listing_location: str, query: SourceQuery) -> bool:
    if query.remote_only:
        return True  # remote filtering handled by the `remote` flag upstream
    if not query.location:
        return True
    return query.location.lower().split(",")[0].strip() in (listing_location or "").lower()


def parse_salary(text: str) -> tuple[int | None, int | None, str, str, str]:
    """Best-effort parse of a salary string into (min, max, currency, period, display)."""
    if not text:
        return None, None, "", "", "Not listed"
    raw = text
    currency = "USD" if ("$" in text or "usd" in text.lower()) else ("EUR" if "€" in text else ("GBP" if "£" in text else ""))
    period = "year"
    low = text.lower()
    if any(w in low for w in ("hour", "/hr", "per hour", "hourly")):
        period = "hour"
    nums = re.findall(r"(\d[\d,\.]{2,})\s*(k)?", low)
    values: list[int] = []
    for num, k in nums:
        try:
            val = float(num.replace(",", ""))
        except ValueError:
            continue
        if k:
            val *= 1000
        values.append(int(val))
    values = [v for v in values if v >= 1000 or period == "hour"]
    if not values:
        return None, None, currency, period, raw.strip()[:120] or "Not listed"
    lo = min(values)
    hi = max(values)
    disp = raw.strip()[:120]
    return lo, (hi if hi != lo else None), currency, period, disp
