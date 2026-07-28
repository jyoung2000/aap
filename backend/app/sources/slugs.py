"""Seed ATS org slugs. The list grows at runtime via search-engine discovery
(stored in the OrgSlug table). These are known public boards used to make the
first search non-empty."""
from __future__ import annotations

SEED_SLUGS: dict[str, list[str]] = {
    "greenhouse": [
        "anthropic", "stripe", "airbnb", "coinbase", "databricks", "figma",
        "gitlab", "robinhood", "dropbox", "instacart", "discord", "brex",
        "gusto", "plaid", "ramp", "airtable", "notion", "retool", "vercel",
        "asana", "benchling", "cloudflare", "twilio", "reddit",
    ],
    "lever": [
        "netflix", "spotify", "leantechniques", "voleon", "match", "plaid",
        "palantir", "kong", "chan-zuckerberg-initiative",
    ],
    "ashby": [
        "openai", "linear", "vanta", "replit", "clerk", "runway", "ramp",
        "mistral", "cohere", "hex", "posthog", "deel", "notion",
    ],
    "workable": [],
    "smartrecruiters": ["Visa", "Bosch", "Ubisoft"],
    "recruitee": [],
}
