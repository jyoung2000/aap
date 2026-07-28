"""Orchestrates all connectors for a single search: discovery -> ATS -> aggregators
-> JSON-LD, then dedupes and normalizes. DB-agnostic (takes callables) so it is
unit-testable with recorded fixtures."""
from __future__ import annotations

import re
from collections.abc import Callable
from difflib import SequenceMatcher
from urllib.parse import urlparse

from .aggregators import AGGREGATOR_SOURCES
from .ats import ATS_SOURCES
from .base import RawListing, SourceQuery, make_client
from .discovery import discover, extract_jsonld_job
from .slugs import SEED_SLUGS
from .stubs import STUB_SOURCES

ALL_SOURCE_NAMES = list(ATS_SOURCES) + list(AGGREGATOR_SOURCES) + ["jsonld"] + list(STUB_SOURCES)

ProgressCb = Callable[[float, str], None]
SlugProvider = Callable[[str], list[str]]
SlugRecorder = Callable[[str, str, str], None]

MAX_JSONLD_FETCHES = 12


def default_slug_provider(source: str) -> list[str]:
    return list(SEED_SLUGS.get(source, []))


def _noop_recorder(source: str, slug: str, via: str) -> None:
    return None


def run_discovery(
    query: SourceQuery,
    *,
    enabled_sources: list[str] | None = None,
    slug_provider: SlugProvider = default_slug_provider,
    slug_recorder: SlugRecorder = _noop_recorder,
    progress_cb: ProgressCb | None = None,
    client=None,
    do_search_discovery: bool = True,
) -> list[RawListing]:
    owns_client = client is None
    client = client or make_client()
    enabled = set(enabled_sources) if enabled_sources else set(ALL_SOURCE_NAMES)

    def report(frac: float, msg: str) -> None:
        if progress_cb:
            progress_cb(max(0.0, min(1.0, frac)), msg)

    listings: list[RawListing] = []
    discovered_urls: list[str] = []

    try:
        # Method 3: search-engine discovery to grow the slug list.
        if do_search_discovery and any(s in enabled for s in ATS_SOURCES):
            report(0.05, "Discovering job boards via search…")
            try:
                slugs_by_source, discovered_urls = discover(client, query)
                for source, slugs in slugs_by_source.items():
                    for slug in slugs:
                        slug_recorder(source, slug, "search")
            except Exception:
                pass

        # Methods 1 & 2: public ATS board APIs.
        ats_names = [s for s in ATS_SOURCES if s in enabled]
        for i, name in enumerate(ats_names):
            report(0.15 + 0.4 * (i / max(1, len(ats_names))), f"Searching {name} boards…")
            slugs = slug_provider(name)
            if not slugs:
                continue
            src = ATS_SOURCES[name](client, slugs=slugs)
            if not src.enabled():
                continue
            try:
                listings.extend(src.search(query))
            except Exception:
                continue

        # Aggregator APIs (free + keyed).
        agg_names = [s for s in AGGREGATOR_SOURCES if s in enabled]
        for i, name in enumerate(agg_names):
            report(0.55 + 0.25 * (i / max(1, len(agg_names))), f"Searching {name}…")
            src = AGGREGATOR_SOURCES[name](client)
            if not src.enabled():
                continue
            try:
                listings.extend(src.search(query))
            except Exception:
                continue

        # Method 4: JSON-LD extraction on discovered careers URLs.
        if "jsonld" in enabled and discovered_urls:
            report(0.85, "Extracting structured job data…")
            seen_hosts: set[str] = set()
            fetched = 0
            for url in discovered_urls:
                if fetched >= MAX_JSONLD_FETCHES:
                    break
                host = urlparse(url).netloc
                if (host, url) in seen_hosts:
                    continue
                seen_hosts.add((host, url))
                listing = extract_jsonld_job(client, url)
                if listing and listing.title:
                    listings.append(listing)
                fetched += 1

        report(0.95, "Normalizing and deduplicating…")
        deduped = dedupe(listings)
        report(1.0, f"Found {len(deduped)} listings")
        return deduped
    finally:
        if owns_client:
            client.close()


def normalize_url(url: str) -> str:
    if not url:
        return ""
    p = urlparse(url)
    host = p.netloc.lower().removeprefix("www.")
    path = p.path.rstrip("/")
    return f"{host}{path}"


def dedupe_key(listing: RawListing) -> str:
    url = normalize_url(listing.apply_url or listing.canonical_url)
    if url:
        return url
    company = re.sub(r"[^a-z0-9]", "", (listing.company or "").lower())
    title = re.sub(r"[^a-z0-9]", "", (listing.title or "").lower())
    return f"{listing.source}:{company}:{title}"


def dedupe(listings: list[RawListing]) -> list[RawListing]:
    """Exact dedupe by canonical URL, then fuzzy dedupe by (company, title)."""
    by_key: dict[str, RawListing] = {}
    for l in listings:
        key = dedupe_key(l)
        l.extra["dedupe_key"] = key
        existing = by_key.get(key)
        if not existing or len(l.description) > len(existing.description):
            by_key[key] = l

    result: list[RawListing] = []
    seen_pairs: list[tuple[str, str]] = []
    for l in by_key.values():
        company = (l.company or "").lower().strip()
        title = (l.title or "").lower().strip()
        dup = False
        for c, t in seen_pairs:
            if c == company and SequenceMatcher(None, t, title).ratio() >= 0.92:
                dup = True
                break
        if not dup:
            seen_pairs.append((company, title))
            result.append(l)
    return result
