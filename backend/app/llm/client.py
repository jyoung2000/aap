"""Thin Anthropic wrapper with a graceful no-key fallback.

Every call returns structured data. When ANTHROPIC_API_KEY is unset the app
still runs — callers fall back to heuristics — so `docker compose up` works
out of the box without a key.
"""
from __future__ import annotations

import json
import logging

from ..config import settings

log = logging.getLogger("jobpilot.llm")

_client = None


def llm_available() -> bool:
    return settings.llm_enabled


def _get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def complete_json(system: str, prompt: str, max_tokens: int | None = None) -> dict | list | None:
    """Ask the model for JSON and parse it. Returns None on any failure."""
    if not llm_available():
        return None
    try:
        client = _get_client()
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=max_tokens or settings.anthropic_max_tokens,
            system=system + "\n\nReply with ONLY valid JSON, no prose, no markdown fences.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in msg.content if getattr(block, "type", None) == "text")
        return _extract_json(text)
    except Exception as exc:  # network, auth, rate limit, parse — degrade gracefully
        log.warning("LLM call failed, falling back to heuristics: %s", exc)
        return None


def complete_text(system: str, prompt: str, max_tokens: int | None = None) -> str | None:
    if not llm_available():
        return None
    try:
        client = _get_client()
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=max_tokens or settings.anthropic_max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(
            block.text for block in msg.content if getattr(block, "type", None) == "text"
        ).strip()
    except Exception as exc:
        log.warning("LLM text call failed: %s", exc)
        return None


def _extract_json(text: str) -> dict | list | None:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    # Find the first { or [ and matching last } or ]
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        end = text.rfind(closer)
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None
