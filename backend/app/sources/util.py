"""Shared parsing helpers for connectors."""
from __future__ import annotations

import html
import re


def strip_html(raw: str) -> str:
    if not raw:
        return ""
    try:
        from selectolax.parser import HTMLParser

        text = HTMLParser(raw).text(separator="\n")
    except Exception:
        text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def is_remote(*parts: str) -> bool:
    blob = " ".join(p for p in parts if p).lower()
    return any(w in blob for w in ("remote", "anywhere", "distributed", "work from home", "wfh"))


def clip(text: str, n: int = 12000) -> str:
    return (text or "")[:n]
