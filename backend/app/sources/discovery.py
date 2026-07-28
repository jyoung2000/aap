"""Method 3 (search-engine discovery) + Method 4 (JSON-LD JobPosting extraction).

Discovery finds new ATS org slugs and careers-page URLs via search dorks. It
prefers SerpAPI/Brave when keys exist and otherwise falls back to DuckDuckGo's
HTML endpoint. JSON-LD extraction parses schema.org/JobPosting from any page —
the same structured data Google Jobs indexes, and the most reliable generic scrape.
"""
from __future__ import annotations

import json
import re
from urllib.parse import parse_qs, unquote, urlparse

from ..config import settings
from .base import RawListing, SourceQuery, log, parse_salary
from .util import is_remote, strip_html

# host -> (source name, regex capturing the slug)
_SLUG_PATTERNS = {
    "greenhouse": (r"(?:boards|job-boards)\.greenhouse\.io/([a-z0-9\-]+)", "boards.greenhouse.io"),
    "lever": (r"jobs\.lever\.co/([a-z0-9\-]+)", "jobs.lever.co"),
    "ashby": (r"jobs\.ashbyhq\.com/([a-z0-9\-]+)", "jobs.ashbyhq.com"),
    "workable": (r"apply\.workable\.com/([a-z0-9\-]+)", "apply.workable.com"),
    "smartrecruiters": (r"jobs\.smartrecruiters\.com/([a-z0-9\-]+)", "jobs.smartrecruiters.com"),
}


def _dork(source: str, host: str, query: SourceQuery) -> str:
    title = query.keywords or "engineer"
    loc = f" {query.location}" if query.location and not query.remote_only else ""
    return f'site:{host} "{title}"{loc}'


def _ddg_search(client, dork: str, limit: int = 15) -> list[str]:
    """Return result URLs from DuckDuckGo's HTML endpoint."""
    try:
        resp = client.post(
            "https://html.duckduckgo.com/html/",
            data={"q": dork},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        html = resp.text
    except Exception as exc:
        log.info("ddg search failed: %s", exc)
        return []
    urls: list[str] = []
    for m in re.finditer(r'href="(https?://[^"]+|//duckduckgo\.com/l/\?[^"]+)"', html):
        href = m.group(1)
        if href.startswith("//duckduckgo.com/l/"):
            qs = parse_qs(urlparse("https:" + href).query)
            target = qs.get("uddg", [""])[0]
            href = unquote(target) if target else ""
        if href and "duckduckgo.com" not in href:
            urls.append(href)
        if len(urls) >= limit:
            break
    return urls


def _serpapi_search(client, dork: str, limit: int = 15) -> list[str]:
    try:
        resp = client.get(
            "https://serpapi.com/search.json",
            params={"q": dork, "api_key": settings.serpapi_key, "num": limit},
        )
        data = resp.json()
        return [r.get("link", "") for r in data.get("organic_results", []) if r.get("link")]
    except Exception as exc:
        log.info("serpapi failed: %s", exc)
        return []


def _brave_search(client, dork: str, limit: int = 15) -> list[str]:
    try:
        resp = client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": dork, "count": limit},
            headers={"X-Subscription-Token": settings.brave_api_key, "Accept": "application/json"},
        )
        data = resp.json()
        return [r.get("url", "") for r in data.get("web", {}).get("results", []) if r.get("url")]
    except Exception as exc:
        log.info("brave failed: %s", exc)
        return []


def _search_urls(client, dork: str) -> list[str]:
    if settings.serpapi_key:
        urls = _serpapi_search(client, dork)
        if urls:
            return urls
    if settings.brave_api_key:
        urls = _brave_search(client, dork)
        if urls:
            return urls
    return _ddg_search(client, dork)


def discover(client, query: SourceQuery) -> tuple[dict[str, set[str]], list[str]]:
    """Return (slugs_by_source, listing_urls) discovered via search dorks."""
    slugs: dict[str, set[str]] = {k: set() for k in _SLUG_PATTERNS}
    listing_urls: list[str] = []
    for source, (pattern, host) in _SLUG_PATTERNS.items():
        dork = _dork(source, host, query)
        for url in _search_urls(client, dork):
            m = re.search(pattern, url)
            if m:
                slug = m.group(1).lower()
                if slug not in ("jobs", "careers", "www", "api"):
                    slugs[source].add(slug)
                listing_urls.append(url)
    return slugs, listing_urls


def extract_jsonld_job(client, url: str) -> RawListing | None:
    """Fetch a page and parse the first schema.org/JobPosting JSON-LD block."""
    try:
        html = client.get(url).text
    except Exception:
        return None
    for block in re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        for node in _iter_nodes(data):
            if _node_type(node) == "JobPosting":
                return _jsonld_to_listing(node, url)
    return None


def _iter_nodes(data):
    if isinstance(data, list):
        for item in data:
            yield from _iter_nodes(item)
    elif isinstance(data, dict):
        if "@graph" in data:
            yield from _iter_nodes(data["@graph"])
        else:
            yield data


def _node_type(node: dict) -> str:
    t = node.get("@type", "")
    if isinstance(t, list):
        return "JobPosting" if "JobPosting" in t else (t[0] if t else "")
    return t


def _jsonld_to_listing(node: dict, url: str) -> RawListing:
    org = node.get("hiringOrganization")
    company = org.get("name", "") if isinstance(org, dict) else (org or "")
    loc = ""
    jl = node.get("jobLocation")
    if isinstance(jl, list):
        jl = jl[0] if jl else {}
    if isinstance(jl, dict):
        addr = jl.get("address", {})
        if isinstance(addr, dict):
            loc = ", ".join(
                x for x in (addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")) if isinstance(x, str) and x
            )
    salary_text = ""
    bs = node.get("baseSalary")
    if isinstance(bs, dict):
        val = bs.get("value", {})
        if isinstance(val, dict):
            lo, hi = val.get("minValue"), val.get("maxValue")
            unit = val.get("unitText", "year")
            cur = bs.get("currency", "USD")
            if lo:
                salary_text = f"{cur} {lo}-{hi}/{unit}" if hi else f"{cur} {lo}/{unit}"
    smin, smax, cur, per, disp = parse_salary(salary_text)
    desc = strip_html(node.get("description", ""))
    remote = str(node.get("jobLocationType", "")).upper() == "TELECOMMUTE" or is_remote(loc, node.get("title", ""))
    return RawListing(
        source="jsonld",
        external_id=str(node.get("identifier", {}).get("value", "") if isinstance(node.get("identifier"), dict) else node.get("identifier", "")),
        title=node.get("title", ""),
        company=company,
        location=loc or ("Remote" if remote else ""),
        remote=remote,
        salary_min=smin, salary_max=smax, salary_currency=cur, salary_period=per, salary_text=disp,
        education_level=_education_from(node),
        post_date=str(node.get("datePosted", ""))[:10],
        canonical_url=url,
        apply_url=node.get("url", url),
        description=desc,
    )


def _education_from(node: dict) -> str:
    req = node.get("educationRequirements")
    if isinstance(req, dict):
        return req.get("credentialCategory", "") or req.get("name", "")
    if isinstance(req, str):
        return req
    return ""
