"""Query-layer user isolation helpers. Every read/write goes through these so no
user can ever touch another user's rows."""
from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

T = TypeVar("T")


def owned_query(model: type[T], user_id: str):
    """A select() already filtered to the owner."""
    return select(model).where(model.user_id == user_id)


def list_owned(db: Session, model: type[T], user_id: str, order_by=None) -> list[T]:
    stmt = owned_query(model, user_id)
    if order_by is not None:
        stmt = stmt.order_by(order_by)
    return list(db.scalars(stmt).all())


def get_owned(db: Session, model: type[T], obj_id: str, user_id: str) -> T:
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "user_id", None) != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj
