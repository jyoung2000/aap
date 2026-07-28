"""LLM-assisted form-field mapping and screening-question drafting.

These are the *last* resort in the resolution order (profile -> custom fields ->
saved answers -> LLM). The functions return a confidence so the orchestrator can
decide whether to auto-fill or trigger a human-in-the-loop prompt.
"""
from __future__ import annotations

from .client import complete_json, complete_text, llm_available


def map_field(*, label: str, field_type: str, options: list[str], profile_context: str) -> dict:
    """Map a single form field to a value using the profile as ground truth.

    Returns {value, confidence 0..1, source: 'llm'}. Never guesses knockout facts:
    if the profile doesn't support an answer, confidence is low.
    """
    if not llm_available():
        return {"value": "", "confidence": 0.0, "source": "llm_unavailable"}
    result = complete_json(
        system=(
            "You map a single job-application form field to the best answer using ONLY the "
            "candidate profile provided. If the profile does not clearly support an answer, "
            "return an empty value and low confidence — never invent facts, licenses, or "
            "certifications. For select fields, choose exactly one of the given options. "
            'Return JSON: {"value": string, "confidence": number 0..1}.'
        ),
        prompt=(
            f"Field label: {label}\n"
            f"Field type: {field_type}\n"
            f"Options: {options}\n\n"
            f"Candidate profile:\n{profile_context[:5000]}"
        ),
        max_tokens=400,
    )
    if isinstance(result, dict) and "value" in result:
        try:
            conf = float(result.get("confidence", 0))
        except (TypeError, ValueError):
            conf = 0.0
        return {"value": str(result.get("value", "")), "confidence": max(0.0, min(1.0, conf)), "source": "llm"}
    return {"value": "", "confidence": 0.0, "source": "llm"}


def draft_screening_answer(*, question: str, resume_text: str, job_description: str) -> dict:
    """Draft a free-text screening answer from the resume + JD. Returns {value, confidence}."""
    if not llm_available():
        return {"value": "", "confidence": 0.0, "source": "llm_unavailable"}
    text = complete_text(
        system=(
            "You draft concise, specific, first-person answers to job-application screening "
            "questions using the candidate's resume and the job description. 60-120 words, no "
            "fabrication, professional tone."
        ),
        prompt=f"Question: {question}\n\nResume:\n{resume_text[:4000]}\n\nJob description:\n{job_description[:4000]}",
        max_tokens=400,
    )
    if text:
        # Free-text drafts are always surfaced for review in auto mode when confidence is modest.
        return {"value": text, "confidence": 0.6, "source": "llm"}
    return {"value": "", "confidence": 0.0, "source": "llm"}
