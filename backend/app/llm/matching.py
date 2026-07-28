"""Job enrichment: 3-sentence summary, key requirements, 0-100 match score.

Uses the LLM when available; otherwise a transparent keyword-overlap heuristic
so the results UI always has a score and rationale.
"""
from __future__ import annotations

import re

from .client import complete_json

_STOP = {
    "the", "and", "for", "with", "you", "our", "are", "will", "have", "this", "that", "from",
    "your", "who", "all", "job", "role", "team", "work", "years", "experience", "including",
    "ability", "strong", "using", "must", "should", "requirements", "responsibilities",
}


def _keywords(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z+#.\-]{2,}", (text or "").lower())
    return {w for w in words if w not in _STOP and len(w) > 2}


def enrich_job(*, title: str, company: str, description: str, profile_text: str) -> dict:
    """Return {summary, requirements[list], match_score int, match_rationale}."""
    desc = (description or "").strip()
    result = complete_json(
        system=(
            "You evaluate job listings for a candidate. Be concise and factual. "
            "Return JSON: {summary: 3-sentence string, requirements: [up to 6 short strings], "
            "match_score: integer 0-100, match_rationale: one sentence}. "
            "Score reflects fit between the candidate profile and the role."
        ),
        prompt=(
            f"Candidate profile:\n{profile_text[:4000]}\n\n"
            f"Job: {title} at {company}\n\nDescription:\n{desc[:8000]}"
        ),
        max_tokens=900,
    )
    if isinstance(result, dict) and "match_score" in result:
        try:
            score = int(result.get("match_score", 0))
        except (TypeError, ValueError):
            score = 0
        return {
            "summary": str(result.get("summary", ""))[:1200],
            "requirements": [str(r)[:200] for r in (result.get("requirements") or [])][:6],
            "match_score": max(0, min(100, score)),
            "match_rationale": str(result.get("match_rationale", ""))[:400],
        }
    return _heuristic_enrich(title, company, desc, profile_text)


def _heuristic_enrich(title: str, company: str, desc: str, profile_text: str) -> dict:
    job_kw = _keywords(f"{title} {desc}")
    prof_kw = _keywords(profile_text)
    if job_kw:
        overlap = job_kw & prof_kw
        score = int(round(100 * len(overlap) / max(12, len(job_kw) * 0.5)))
        score = max(5, min(97, score))
    else:
        overlap = set()
        score = 50
    # First 3 sentences of the description as a stand-in summary.
    sentences = re.split(r"(?<=[.!?])\s+", desc)
    summary = " ".join(sentences[:3])[:600] or f"{title} at {company}."
    # Requirement-ish lines from the description.
    reqs = []
    for line in desc.splitlines():
        line = line.strip(" -•*\t")
        low = line.lower()
        if 8 < len(line) < 160 and any(k in low for k in ("experience", "years", "degree", "proficient", "knowledge", "required", "familiar")):
            reqs.append(line)
        if len(reqs) >= 6:
            break
    top = ", ".join(sorted(overlap)[:4]) or "general profile keywords"
    return {
        "summary": summary,
        "requirements": reqs,
        "match_score": score,
        "match_rationale": f"Heuristic overlap on {top}.",
    }
