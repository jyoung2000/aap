"""Public ATS board API connectors — no keys required, ToS-safe.

Each iterates the org slugs it was constructed with and filters listings by the
query terms. Greenhouse / Lever / Ashby are flagged `server_apply_capable` so
the orchestrator can offer the no-browser Playwright executor for them.
"""
from __future__ import annotations

from .base import JobSource, RawListing, SourceQuery, log, matches_terms, parse_salary
from .util import is_remote, strip_html


class _SlugSource(JobSource):
    def __init__(self, client, slugs: list[str] | None = None):
        super().__init__(client)
        self.slugs = slugs or []

    def search(self, query: SourceQuery) -> list[RawListing]:
        out: list[RawListing] = []
        for slug in self.slugs:
            try:
                out.extend(self.search_org(slug, query))
            except Exception as exc:  # a bad slug must not kill the whole search
                log.info("%s: org %s failed: %s", self.name, slug, exc)
            if len(out) >= query.limit_per_source:
                break
        return out[: query.limit_per_source]

    def search_org(self, slug: str, query: SourceQuery) -> list[RawListing]:  # pragma: no cover
        raise NotImplementedError


class GreenhouseSource(_SlugSource):
    name = "greenhouse"

    def search_org(self, slug: str, query: SourceQuery) -> list[RawListing]:
        url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
        data = self.client.get(url).json()
        results = []
        for job in data.get("jobs", []):
            title = job.get("title", "")
            loc = (job.get("location") or {}).get("name", "")
            desc = strip_html(job.get("content", ""))
            if not matches_terms(f"{title} {desc}", query.terms):
                continue
            results.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("id", "")),
                    title=title,
                    company=slug.replace("-", " ").title(),
                    location=loc,
                    remote=is_remote(loc, title),
                    post_date=(job.get("updated_at") or "")[:10],
                    canonical_url=job.get("absolute_url", ""),
                    apply_url=job.get("absolute_url", ""),
                    description=desc,
                    server_apply_capable=True,
                    extra={"slug": slug},
                )
            )
        return results


class LeverSource(_SlugSource):
    name = "lever"

    def search_org(self, slug: str, query: SourceQuery) -> list[RawListing]:
        url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
        data = self.client.get(url).json()
        results = []
        for job in data:
            title = job.get("text", "")
            cats = job.get("categories") or {}
            loc = cats.get("location", "")
            desc = job.get("descriptionPlain") or strip_html(job.get("description", ""))
            if not matches_terms(f"{title} {desc}", query.terms):
                continue
            results.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("id", "")),
                    title=title,
                    company=slug.replace("-", " ").title(),
                    location=loc,
                    remote=is_remote(loc, job.get("workplaceType", ""), title),
                    post_date=str(job.get("createdAt", ""))[:10],
                    canonical_url=job.get("hostedUrl", ""),
                    apply_url=job.get("applyUrl") or job.get("hostedUrl", ""),
                    description=desc,
                    server_apply_capable=True,
                    extra={"slug": slug},
                )
            )
        return results


class AshbySource(_SlugSource):
    name = "ashby"

    def search_org(self, slug: str, query: SourceQuery) -> list[RawListing]:
        url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true"
        data = self.client.get(url).json()
        results = []
        for job in data.get("jobs", []):
            title = job.get("title", "")
            loc = job.get("location", "")
            desc = job.get("descriptionPlain") or strip_html(job.get("descriptionHtml", ""))
            if not matches_terms(f"{title} {desc}", query.terms):
                continue
            comp = job.get("compensation") or {}
            salary_text = ""
            if isinstance(comp, dict):
                summary = comp.get("compensationTierSummary")
                if summary:
                    salary_text = summary
            smin, smax, cur, per, disp = parse_salary(salary_text)
            results.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("id", "")),
                    title=title,
                    company=job.get("organizationName") or slug.title(),
                    location=loc,
                    remote=bool(job.get("isRemote")) or is_remote(loc),
                    salary_min=smin, salary_max=smax, salary_currency=cur, salary_period=per, salary_text=disp,
                    post_date=str(job.get("publishedAt", ""))[:10],
                    canonical_url=job.get("jobUrl", ""),
                    apply_url=job.get("applyUrl") or job.get("jobUrl", ""),
                    description=desc,
                    server_apply_capable=True,
                    extra={"slug": slug},
                )
            )
        return results


class WorkableSource(_SlugSource):
    name = "workable"

    def search_org(self, slug: str, query: SourceQuery) -> list[RawListing]:
        url = f"https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true"
        data = self.client.get(url).json()
        results = []
        for job in data.get("jobs", []):
            title = job.get("title", "")
            loc_obj = job.get("location") or {}
            loc = ", ".join(x for x in (loc_obj.get("city"), loc_obj.get("country")) if x) if isinstance(loc_obj, dict) else str(loc_obj)
            desc = strip_html(job.get("description", ""))
            if not matches_terms(f"{title} {desc}", query.terms):
                continue
            apply_url = job.get("application_url") or job.get("url") or job.get("shortlink", "")
            results.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("shortcode") or job.get("id", "")),
                    title=title,
                    company=data.get("name") or slug.title(),
                    location=loc,
                    remote=bool(job.get("remote")) or bool(job.get("telecommuting")) or is_remote(loc),
                    post_date=str(job.get("published_on") or job.get("created_at", ""))[:10],
                    canonical_url=job.get("url", apply_url),
                    apply_url=apply_url,
                    description=desc,
                    extra={"slug": slug},
                )
            )
        return results


class SmartRecruitersSource(_SlugSource):
    name = "smartrecruiters"

    def search_org(self, slug: str, query: SourceQuery) -> list[RawListing]:
        q = f"&q={query.keywords}" if query.keywords else ""
        url = f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100{q}"
        data = self.client.get(url).json()
        results = []
        for job in data.get("content", []):
            title = job.get("name", "")
            loc_obj = job.get("location") or {}
            loc = ", ".join(x for x in (loc_obj.get("city"), loc_obj.get("country")) if x)
            company = (job.get("company") or {}).get("name") or slug.title()
            jid = job.get("id", "")
            if not matches_terms(title, query.terms):
                continue
            apply_url = f"https://jobs.smartrecruiters.com/{slug}/{jid}"
            results.append(
                RawListing(
                    source=self.name,
                    external_id=str(jid),
                    title=title,
                    company=company,
                    location=loc,
                    remote=bool(loc_obj.get("remote")) or is_remote(loc),
                    post_date=str(job.get("releasedDate", ""))[:10],
                    canonical_url=apply_url,
                    apply_url=apply_url,
                    description="",  # detail endpoint required; kept light
                    extra={"slug": slug},
                )
            )
        return results


class RecruiteeSource(_SlugSource):
    name = "recruitee"

    def search_org(self, slug: str, query: SourceQuery) -> list[RawListing]:
        url = f"https://{slug}.recruitee.com/api/offers/"
        data = self.client.get(url).json()
        results = []
        for job in data.get("offers", []):
            title = job.get("title", "")
            loc = job.get("location") or ", ".join(x for x in (job.get("city"), job.get("country")) if x)
            desc = strip_html(job.get("description", ""))
            if not matches_terms(f"{title} {desc}", query.terms):
                continue
            results.append(
                RawListing(
                    source=self.name,
                    external_id=str(job.get("id", "")),
                    title=title,
                    company=job.get("company_name") or slug.title(),
                    location=loc,
                    remote=is_remote(loc, job.get("remote", "")),
                    post_date=str(job.get("published_at", ""))[:10],
                    canonical_url=job.get("careers_url", ""),
                    apply_url=job.get("careers_apply_url") or job.get("careers_url", ""),
                    description=desc,
                    extra={"slug": slug},
                )
            )
        return results


ATS_SOURCES = {
    "greenhouse": GreenhouseSource,
    "lever": LeverSource,
    "ashby": AshbySource,
    "workable": WorkableSource,
    "smartrecruiters": SmartRecruitersSource,
    "recruitee": RecruiteeSource,
}
