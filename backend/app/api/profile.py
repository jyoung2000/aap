"""Profile editor API: personal block, work/education/recommendations, files,
custom fields, and saved answers. All strictly user-scoped."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..core.files import delete_file, extract_text, save_upload
from ..core.scoping import get_owned, list_owned
from ..db import get_db
from ..llm.resume import parse_resume
from ..models import (
    CustomField,
    Education,
    Profile,
    ProfileFile,
    Recommendation,
    SavedAnswer,
    User,
    WorkExperience,
)
from ..schemas.profile import (
    CustomFieldIn,
    CustomFieldOut,
    EducationIn,
    EducationOut,
    ProfileFileOut,
    ProfileOut,
    ProfileUpdate,
    RecommendationIn,
    RecommendationOut,
    ReorderIn,
    SavedAnswerIn,
    SavedAnswerOut,
    WorkExperienceIn,
    WorkExperienceOut,
)

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _get_profile(db: Session, user: User) -> Profile:
    prof = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if not prof:
        prof = Profile(user_id=user.id, email=user.email)
        db.add(prof)
        db.commit()
    return prof


# ---------------- Personal / standard-field block ----------------
@router.get("", response_model=ProfileOut)
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_profile(db, user)


@router.patch("", response_model=ProfileOut)
def update_profile(
    payload: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    prof = _get_profile(db, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prof, field, value)
    db.commit()
    return prof


# ---------------- Work experience ----------------
@router.get("/experience", response_model=list[WorkExperienceOut])
def list_experience(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_owned(db, WorkExperience, user.id, order_by=WorkExperience.order)


@router.post("/experience", response_model=WorkExperienceOut, status_code=201)
def add_experience(payload: WorkExperienceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = WorkExperience(user_id=user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    return row


@router.put("/experience/{item_id}", response_model=WorkExperienceOut)
def update_experience(item_id: str, payload: WorkExperienceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_owned(db, WorkExperience, item_id, user.id)
    for f, v in payload.model_dump().items():
        setattr(row, f, v)
    db.commit()
    return row


@router.delete("/experience/{item_id}", status_code=204)
def delete_experience(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, WorkExperience, item_id, user.id))
    db.commit()
    return Response(status_code=204)


@router.post("/experience/reorder", status_code=204)
def reorder_experience(payload: ReorderIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for i, item_id in enumerate(payload.ordered_ids):
        row = get_owned(db, WorkExperience, item_id, user.id)
        row.order = i
    db.commit()
    return Response(status_code=204)


# ---------------- Education ----------------
@router.get("/education", response_model=list[EducationOut])
def list_education(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_owned(db, Education, user.id, order_by=Education.order)


@router.post("/education", response_model=EducationOut, status_code=201)
def add_education(payload: EducationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = Education(user_id=user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    return row


@router.put("/education/{item_id}", response_model=EducationOut)
def update_education(item_id: str, payload: EducationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_owned(db, Education, item_id, user.id)
    for f, v in payload.model_dump().items():
        setattr(row, f, v)
    db.commit()
    return row


@router.delete("/education/{item_id}", status_code=204)
def delete_education(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Education, item_id, user.id))
    db.commit()
    return Response(status_code=204)


# ---------------- Recommendations ----------------
@router.get("/recommendations", response_model=list[RecommendationOut])
def list_recommendations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_owned(db, Recommendation, user.id, order_by=Recommendation.order)


@router.post("/recommendations", response_model=RecommendationOut, status_code=201)
def add_recommendation(payload: RecommendationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = Recommendation(user_id=user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    return row


@router.put("/recommendations/{item_id}", response_model=RecommendationOut)
def update_recommendation(item_id: str, payload: RecommendationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_owned(db, Recommendation, item_id, user.id)
    for f, v in payload.model_dump().items():
        setattr(row, f, v)
    db.commit()
    return row


@router.delete("/recommendations/{item_id}", status_code=204)
def delete_recommendation(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Recommendation, item_id, user.id))
    db.commit()
    return Response(status_code=204)


# ---------------- Custom fields ----------------
@router.get("/custom-fields", response_model=list[CustomFieldOut])
def list_custom_fields(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_owned(db, CustomField, user.id, order_by=CustomField.order)


@router.post("/custom-fields", response_model=CustomFieldOut, status_code=201)
def add_custom_field(payload: CustomFieldIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = CustomField(user_id=user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    return row


@router.put("/custom-fields/{item_id}", response_model=CustomFieldOut)
def update_custom_field(item_id: str, payload: CustomFieldIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_owned(db, CustomField, item_id, user.id)
    for f, v in payload.model_dump().items():
        setattr(row, f, v)
    db.commit()
    return row


@router.delete("/custom-fields/{item_id}", status_code=204)
def delete_custom_field(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, CustomField, item_id, user.id))
    db.commit()
    return Response(status_code=204)


# ---------------- Saved answers (knowledge base) ----------------
@router.get("/saved-answers", response_model=list[SavedAnswerOut])
def list_saved_answers(q: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(SavedAnswer).where(SavedAnswer.user_id == user.id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(SavedAnswer.question.ilike(like), SavedAnswer.answer.ilike(like)))
    return list(db.scalars(stmt.order_by(SavedAnswer.created_at.desc())).all())


@router.post("/saved-answers", response_model=SavedAnswerOut, status_code=201)
def add_saved_answer(payload: SavedAnswerIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..core.resolver import normalize_question

    row = SavedAnswer(
        user_id=user.id, question=payload.question, answer=payload.answer,
        question_key=normalize_question(payload.question), source="manual",
    )
    db.add(row)
    db.commit()
    return row


@router.put("/saved-answers/{item_id}", response_model=SavedAnswerOut)
def update_saved_answer(item_id: str, payload: SavedAnswerIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..core.resolver import normalize_question

    row = get_owned(db, SavedAnswer, item_id, user.id)
    row.question = payload.question
    row.answer = payload.answer
    row.question_key = normalize_question(payload.question)
    db.commit()
    return row


@router.delete("/saved-answers/{item_id}", status_code=204)
def delete_saved_answer(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, SavedAnswer, item_id, user.id))
    db.commit()
    return Response(status_code=204)


# ---------------- Files ----------------
@router.get("/files", response_model=list[ProfileFileOut])
def list_files(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_owned(db, ProfileFile, user.id, order_by=ProfileFile.created_at)


@router.post("/files", response_model=ProfileFileOut, status_code=201)
async def upload_file(
    kind: str = Form("resume"),
    is_default: bool = Form(False),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (15MB max)")
    path, size = save_upload(user.id, file.filename or "upload", content)
    text = extract_text(path, file.content_type or "", file.filename or "")
    if is_default and kind == "resume":
        for other in list_owned(db, ProfileFile, user.id):
            if other.kind == "resume":
                other.is_default = False
    row = ProfileFile(
        user_id=user.id, kind=kind, filename=file.filename or "upload",
        stored_path=path, mime=file.content_type or "", size_bytes=size,
        is_default=is_default, extracted_text=text,
    )
    db.add(row)
    db.commit()
    return row


@router.post("/files/{file_id}/default", response_model=ProfileFileOut)
def set_default_file(file_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_owned(db, ProfileFile, file_id, user.id)
    for other in list_owned(db, ProfileFile, user.id):
        if other.kind == row.kind:
            other.is_default = False
    row.is_default = True
    db.commit()
    return row


@router.post("/files/{file_id}/parse")
def parse_resume_file(file_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Parse a resume file into structured JSON for user review/correction."""
    row = get_owned(db, ProfileFile, file_id, user.id)
    parsed = parse_resume(row.extracted_text)
    prof = _get_profile(db, user)
    prof.parsed_resume = parsed
    db.commit()
    return {"parsed": parsed, "review_required": True}


@router.post("/parsed/apply", response_model=ProfileOut)
def apply_parsed_resume(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Merge the reviewed parsed-resume JSON into the structured profile."""
    prof = _get_profile(db, user)
    parsed = prof.parsed_resume or {}
    mapping = {
        "first_name": "first_name", "last_name": "last_name", "email": "email",
        "phone": "phone", "city": "city", "state": "state", "country": "country",
        "linkedin_url": "linkedin_url", "github_url": "github_url", "portfolio_url": "portfolio_url",
        "years_experience": "years_experience",
    }
    for src, dst in mapping.items():
        if parsed.get(src):
            setattr(prof, dst, parsed[src])
    # Work experience / education
    for i, we in enumerate(parsed.get("work_experience", []) or []):
        db.add(WorkExperience(
            user_id=user.id, order=i, title=we.get("title", ""), company=we.get("company", ""),
            location=we.get("location", ""), start_date=we.get("start_date", ""),
            end_date=we.get("end_date", ""), current=bool(we.get("current")), bullets=we.get("bullets", []),
        ))
    for i, ed in enumerate(parsed.get("education", []) or []):
        db.add(Education(
            user_id=user.id, order=i, degree=ed.get("degree", ""), field_of_study=ed.get("field_of_study", ""),
            school=ed.get("school", ""), graduation_year=str(ed.get("graduation_year", "")), gpa=str(ed.get("gpa", "")),
        ))
    db.commit()
    return prof


@router.delete("/files/{file_id}", status_code=204)
def delete_profile_file(file_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_owned(db, ProfileFile, file_id, user.id)
    delete_file(row.stored_path)
    db.delete(row)
    db.commit()
    return Response(status_code=204)
