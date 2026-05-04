"""사용자 / 인증 / Gemini 키 관리."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import GeminiKeyIn, UserOut


router = APIRouter(prefix="/api/me", tags=["me"])


def _to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        has_gemini_key=bool(user.gemini_api_key),
    )


@router.get("", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return _to_out(user)


@router.put("/gemini-key", response_model=UserOut)
def set_gemini_key(
    payload: GeminiKeyIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    user.gemini_api_key = payload.api_key.strip() or None
    db.commit()
    db.refresh(user)
    return _to_out(user)


@router.delete("/gemini-key", response_model=UserOut)
def delete_gemini_key(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    user.gemini_api_key = None
    db.commit()
    db.refresh(user)
    return _to_out(user)
