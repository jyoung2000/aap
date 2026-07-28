"""Stubs for boards we deliberately do NOT scrape.

LinkedIn, Indeed, and Monster prohibit automated scraping in their Terms of
Service and actively block it. JobPilot does not implement scrapers for them.
Users can still find these listings through the ToS-safe methods (public ATS
APIs, aggregator APIs, JSON-LD on the employer's own careers page), which is
where most of these roles are ultimately hosted anyway.
"""
from __future__ import annotations

from .base import JobSource, RawListing, SourceQuery


class _ToSStub(JobSource):
    def enabled(self) -> bool:
        return False

    def search(self, query: SourceQuery) -> list[RawListing]:
        # Intentionally returns nothing. See module docstring.
        return []


class LinkedInStub(_ToSStub):
    name = "linkedin"


class IndeedStub(_ToSStub):
    name = "indeed"


class MonsterStub(_ToSStub):
    name = "monster"


STUB_SOURCES = {"linkedin": LinkedInStub, "indeed": IndeedStub, "monster": MonsterStub}
