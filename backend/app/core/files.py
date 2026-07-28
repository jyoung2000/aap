"""File storage and text extraction (PDF / DOCX) for uploaded documents."""
from __future__ import annotations

import os
import uuid

from ..config import settings


def save_upload(user_id: str, filename: str, content: bytes) -> tuple[str, int]:
    """Persist bytes under the user's upload dir. Returns (stored_path, size)."""
    user_dir = os.path.join(settings.upload_dir, user_id)
    os.makedirs(user_dir, exist_ok=True)
    safe = f"{uuid.uuid4().hex}_{os.path.basename(filename)}"[:200]
    path = os.path.join(user_dir, safe)
    with open(path, "wb") as f:
        f.write(content)
    return path, len(content)


def extract_text(path: str, mime: str, filename: str) -> str:
    name = (filename or "").lower()
    try:
        if name.endswith(".pdf") or "pdf" in mime:
            return _extract_pdf(path)
        if name.endswith(".docx") or "word" in mime or "officedocument" in mime:
            return _extract_docx(path)
        if name.endswith(".txt") or mime.startswith("text/"):
            with open(path, "r", errors="ignore") as f:
                return f.read()
    except Exception:
        return ""
    return ""


def _extract_pdf(path: str) -> str:
    from pypdf import PdfReader

    reader = PdfReader(path)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _extract_docx(path: str) -> str:
    import docx

    doc = docx.Document(path)
    return "\n".join(p.text for p in doc.paragraphs)


def delete_file(path: str) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass
