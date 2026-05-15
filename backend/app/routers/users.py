"""사용자 / 인증 / Gemini 키 관리."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..budget import normalize_prices
from ..database import get_db
from ..models import User
from ..schemas import GeminiKeyIn, GradeThresholdsIn, UnitPricesIn, UserOut


router = APIRouter(prefix="/api/me", tags=["me"])


DEFAULT_GRADE_THRESHOLDS = {"s": 0.70, "aa": 0.30, "a": 0.05}


def _to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        has_gemini_key=bool(user.gemini_api_key),
        grade_thresholds=user.grade_thresholds or DEFAULT_GRADE_THRESHOLDS,
        unit_prices=normalize_prices(user.unit_prices),
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


@router.put("/grade-thresholds", response_model=UserOut)
def set_grade_thresholds(
    payload: GradeThresholdsIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """난이도 등급 분류 임계값 저장.
    s/aa/a 모두 0~1 사이여야 하고, s >= aa >= a 순서 권장.
    """
    for k, v in (("s", payload.s), ("aa", payload.aa), ("a", payload.a)):
        if not (0 < v < 1):
            raise HTTPException(
                status_code=400,
                detail=f"{k} 임계값은 0보다 크고 1보다 작아야 합니다. (현재: {v})",
            )
    if not (payload.s >= payload.aa >= payload.a):
        raise HTTPException(
            status_code=400,
            detail="임계값은 S >= AA >= A 순서여야 합니다.",
        )
    user.grade_thresholds = {"s": payload.s, "aa": payload.aa, "a": payload.a}
    db.commit()
    db.refresh(user)
    return _to_out(user)


@router.delete("/grade-thresholds", response_model=UserOut)
def reset_grade_thresholds(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """임계값을 기본값으로 되돌림."""
    user.grade_thresholds = None
    db.commit()
    db.refresh(user)
    return _to_out(user)


@router.put("/unit-prices", response_model=UserOut)
def set_unit_prices(
    payload: UnitPricesIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """등급별 단가 저장.

    구조: {"currency": "KRW",
           "assets": {"characters": {"S":.., "AA":.., "A":.., "C":..}, ...},
           "shot_unit": <샷 단가>}
    음수 값은 0으로 보정. 다른 비숫자 값은 무시.
    """
    normalized = normalize_prices(
        {
            "currency": payload.currency,
            "assets": payload.assets,
            "shot_unit": payload.shot_unit,
        }
    )
    user.unit_prices = normalized
    db.commit()
    db.refresh(user)
    return _to_out(user)


@router.delete("/unit-prices", response_model=UserOut)
def reset_unit_prices(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """단가를 초기화 (모두 0)."""
    user.unit_prices = None
    db.commit()
    db.refresh(user)
    return _to_out(user)
