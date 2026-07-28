"""Aggregator API connectors. Free ones always run; keyed ones activate when
their env keys are present (see .env.example)."""
from __future__ import annotations

from ..config import settings
from .base import JobSource, RawListing, SourceQuery, matches_terms, parse_salary
from .util import is_remote, strip_html


class RemotiveSource(JobSource):
    name = "remotive"  # free, remote-only board

    def search(self, query: SourceQuery) -> list[RawListing]:
        url = "https://remotive.com/api/remote-jobs"
        params = {"limit": query.limit_per_source}
        if query.keywords:
            params["search"] = query.keywords
        data = self.client.get(url, params=params).json()
        out = []
        for job in data.get("jobs", []):
            smin, smax, cur, per, disp = parse_salary(job.get("salary", ""))
            out.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("id", "")),
                    title=job.get("title", ""),
                    company=job.get("company_name", ""),
                    location=job.get("candidate_required_location", "Remote"),
                    remote=True,
                    salary_min=smin, salary_max=smax, salary_currency=cur, salary_period=per, salary_text=disp,
                    post_date=str(job.get("publication_date", ""))[:10],
                    canonical_url=job.get("url", ""),
                    apply_url=job.get("url", ""),
                    description=strip_html(job.get("description", "")),
                )
            )
        return out


class ArbeitnowSource(JobSource):
    name = "arbeitnow"  # free EU/remote board

    def search(self, query: SourceQuery) -> list[RawListing]:
        data = self.client.get("https://www.arbeitnow.com/api/job-board-api").json()
        out = []
        for job in data.get("data", []):
            title = job.get("title", "")
            desc = strip_html(job.get("description", ""))
            if not matches_terms(f"{title} {desc} {' '.join(job.get('tags', []))}", query.terms):
                continue
            out.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("slug", "")),
                    title=title,
                    company=job.get("company_name", ""),
                    location=job.get("location", ""),
                    remote=bool(job.get("remote")),
                    post_date=str(job.get("created_at", ""))[:10],
                    canonical_url=job.get("url", ""),
                    apply_url=job.get("url", ""),
                    description=desc,
                )
            )
            if len(out) >= query.limit_per_source:
                break
        return out


class TheMuseSource(JobSource):
    name = "themuse"

    def search(self, query: SourceQuery) -> list[RawListing]:
        params = {"page": 0}
        if settings.themuse_api_key:
            params["api_key"] = settings.themuse_api_key
        if query.location:
            params["location"] = query.location
        data = self.client.get("https://www.themuse.com/api/public/jobs", params=params).json()
        out = []
        for job in data.get("results", []):
            title = job.get("name", "")
            if not matches_terms(title, query.terms):
                continue
            locs = ", ".join(l.get("name", "") for l in job.get("locations", []))
            out.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("id", "")),
                    title=title,
                    company=(job.get("company") or {}).get("name", ""),
                    location=locs,
                    remote=is_remote(locs),
                    post_date=str(job.get("publication_date", ""))[:10],
                    canonical_url=(job.get("refs") or {}).get("landing_page", ""),
                    apply_url=(job.get("refs") or {}).get("landing_page", ""),
                    description=strip_html(job.get("contents", "")),
                )
            )
            if len(out) >= query.limit_per_source:
                break
        return out


class USAJobsSource(JobSource):
    name = "usajobs"
    requires_keys = True

    def enabled(self) -> bool:
        return bool(settings.usajobs_api_key and settings.usajobs_user_agent)

    def search(self, query: SourceQuery) -> list[RawListing]:
        headers = {
            "Authorization-Key": settings.usajobs_api_key,
            "User-Agent": settings.usajobs_user_agent,
            "Host": "data.usajobs.gov",
        }
        params = {"Keyword": query.keywords, "ResultsPerPage": min(query.limit_per_source, 50)}
        if query.location:
            params["LocationName"] = query.location
        data = self.client.get("https://data.usajobs.gov/api/search", params=params, headers=headers).json()
        out = []
        for item in data.get("SearchResult", {}).get("SearchResultItems", []):
            d = item.get("MatchedObjectDescriptor", {})
            remun = (d.get("PositionRemuneration") or [{}])[0]
            smin = _to_int(remun.get("MinimumRange"))
            smax = _to_int(remun.get("MaximumRange"))
            apply_uri = (d.get("ApplyURI") or [d.get("PositionURI", "")])[0]
            out.append(
                RawListing(
                    source=self.name,
                    external_id=str(d.get("PositionID", "")),
                    title=d.get("PositionTitle", ""),
                    company=d.get("OrganizationName", ""),
                    location=d.get("PositionLocationDisplay", ""),
                    salary_min=smin, salary_max=smax, salary_currency="USD",
                    salary_period="year", salary_text=(f"${smin:,}-${smax:,}" if smin and smax else "Not listed"),
                    post_date=str(d.get("PublicationStartDate", ""))[:10],
                    canonical_url=d.get("PositionURI", ""),
                    apply_url=apply_uri,
                    description=strip_html(((d.get("UserArea") or {}).get("Details") or {}).get("JobSummary", "")),
                )
            )
        return out


class AdzunaSource(JobSource):
    name = "adzuna"
    requires_keys = True

    def enabled(self) -> bool:
        return bool(settings.adzuna_app_id and settings.adzuna_app_key)

    def search(self, query: SourceQuery) -> list[RawListing]:
        country = "us"
        params = {
            "app_id": settings.adzuna_app_id,
            "app_key": settings.adzuna_app_key,
            "what": query.keywords,
            "results_per_page": min(query.limit_per_source, 50),
            "content-type": "application/json",
        }
        if query.location:
            params["where"] = query.location
        if query.salary_floor:
            params["salary_min"] = query.salary_floor
        url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
        data = self.client.get(url, params=params).json()
        out = []
        for job in data.get("results", []):
            out.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("id", "")),
                    title=job.get("title", ""),
                    company=(job.get("company") or {}).get("display_name", ""),
                    location=(job.get("location") or {}).get("display_name", ""),
                    salary_min=_to_int(job.get("salary_min")),
                    salary_max=_to_int(job.get("salary_max")),
                    salary_currency="USD", salary_period="year",
                    salary_text=(f"${_to_int(job.get('salary_min')):,}+" if job.get("salary_min") else "Not listed"),
                    post_date=str(job.get("created", ""))[:10],
                    canonical_url=job.get("redirect_url", ""),
                    apply_url=job.get("redirect_url", ""),
                    description=strip_html(job.get("description", "")),
                )
            )
        return out


class JoobleSource(JobSource):
    name = "jooble"
    requires_keys = True

    def enabled(self) -> bool:
        return bool(settings.jooble_api_key)

    def search(self, query: SourceQuery) -> list[RawListing]:
        url = f"https://jooble.org/api/{settings.jooble_api_key}"
        body = {"keywords": query.keywords, "location": query.location}
        data = self.client.post(url, json=body).json()
        out = []
        for job in data.get("jobs", []):
            smin, smax, cur, per, disp = parse_salary(job.get("salary", ""))
            out.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("id", "")),
                    title=job.get("title", ""),
                    company=job.get("company", ""),
                    location=job.get("location", ""),
                    salary_min=smin, salary_max=smax, salary_currency=cur, salary_period=per, salary_text=disp,
                    post_date=str(job.get("updated", ""))[:10],
                    canonical_url=job.get("link", ""),
                    apply_url=job.get("link", ""),
                    description=strip_html(job.get("snippet", "")),
                )
            )
        return out


def _to_int(v) -> int | None:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


AGGREGATOR_SOURCES = {
    "remotive": RemotiveSource,
    "arbeitnow": ArbeitnowSource,
    "themuse": TheMuseSource,
    "usajobs": USAJobsSource,
    "adzuna": AdzunaSource,
    "jooble": JoobleSource,
}
