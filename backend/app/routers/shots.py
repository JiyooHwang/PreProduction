"""샷 조회 + 인라인 편집."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Shot, User
from ..schemas import ShotOut, ShotUpdate


router = APIRouter(prefix="/api/projects/{project_id}/shots", tags=["shots"])


@router.get("", response_model=list[ShotOut])
def list_shots(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ShotOut]:
    shots = (
        db.query(Shot)
        .filter(Shot.project_id == project_id)
        .order_by(Shot.index)
        .all()
    )
    return [ShotOut.model_validate(s) for s in shots]


@router.patch("/{shot_id}", response_model=ShotOut)
def update_shot(
    project_id: int,
    shot_id: int,
    payload: ShotUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ShotOut:
    shot = db.get(Shot, shot_id)
    if shot is None or shot.project_id != project_id:
        raise HTTPException(status_code=404, detail="샷을 찾을 수 없습니다.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(shot, field, value)
    db.commit()
    db.refresh(shot)
    return ShotOut.model_validate(shot)
