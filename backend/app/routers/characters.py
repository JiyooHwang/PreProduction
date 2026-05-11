"""사용자 캐릭터 디자인 라이브러리 라우터.

모든 시나리오에서 재사용 가능한 캐릭터 참조 이미지를 관리한다.
이미지는 storage_dir/users/{user_id}/characters/{char_id}.{ext} 에 저장.
"""
from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..models import CharacterDesign, User
from ..schemas import CharacterDesignOut, CharacterDesignUpdate


router = APIRouter(prefix="/api/me/characters", tags=["characters"])


# 5MB 제한, PNG / JPG 만
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_MIME = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg"}


def _character_dir(user_id: int) -> Path:
    d = settings.storage_dir / "users" / str(user_id) / "characters"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _ext_for_mime(mime: str) -> str:
    return ALLOWED_MIME.get(mime, "png")


async def _save_image(user_id: int, char_id: int, file: UploadFile) -> tuple[str, str]:
    """이미지 검증 + 저장. (상대경로, mime) 반환."""
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"PNG 또는 JPG 만 업로드 가능합니다. (현재: {mime or 'unknown'})",
        )
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"이미지는 최대 {MAX_IMAGE_BYTES // (1024*1024)}MB 까지 업로드 가능합니다.",
        )
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="빈 파일은 업로드할 수 없습니다.")

    ext = _ext_for_mime(mime)
    # 기존 파일 정리 (다른 확장자로 바뀌었을 수 있음)
    cdir = _character_dir(user_id)
    for old in cdir.glob(f"{char_id}.*"):
        try:
            old.unlink()
        except OSError:
            pass

    target = cdir / f"{char_id}.{ext}"
    target.write_bytes(data)
    rel = str(target.relative_to(settings.storage_dir))
    return rel, mime


@router.get("", response_model=list[CharacterDesignOut])
def list_characters(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CharacterDesignOut]:
    rows = (
        db.query(CharacterDesign)
        .filter(CharacterDesign.owner_id == user.id)
        .order_by(desc(CharacterDesign.updated_at))
        .all()
    )
    return [CharacterDesignOut.model_validate(r) for r in rows]


@router.post("", response_model=CharacterDesignOut, status_code=status.HTTP_201_CREATED)
async def create_character(
    name: Annotated[str, Form()],
    image: Annotated[UploadFile, File()],
    description: Annotated[str, Form()] = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CharacterDesignOut:
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="이름을 입력하세요.")

    # 같은 이름 중복 체크 (대소문자 무시)
    existing = (
        db.query(CharacterDesign)
        .filter(CharacterDesign.owner_id == user.id)
        .filter(CharacterDesign.name.ilike(name))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"'{name}' 이름의 캐릭터가 이미 있습니다. 다른 이름을 쓰거나 기존 캐릭터를 수정하세요.",
        )

    # 일단 DB에 row 만들고 (id 발급) 그 id 로 파일명 결정
    cd = CharacterDesign(
        owner_id=user.id,
        name=name,
        description=(description or "").strip() or None,
        image_path="",  # 곧 채움
        image_mime="image/png",
    )
    db.add(cd)
    db.flush()  # id 발급

    rel, mime = await _save_image(user.id, cd.id, image)
    cd.image_path = rel
    cd.image_mime = mime
    db.commit()
    db.refresh(cd)
    return CharacterDesignOut.model_validate(cd)


@router.get("/{char_id}", response_model=CharacterDesignOut)
def get_character(
    char_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CharacterDesignOut:
    cd = db.get(CharacterDesign, char_id)
    if not cd or cd.owner_id != user.id:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")
    return CharacterDesignOut.model_validate(cd)


@router.patch("/{char_id}", response_model=CharacterDesignOut)
def update_character(
    char_id: int,
    payload: CharacterDesignUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CharacterDesignOut:
    cd = db.get(CharacterDesign, char_id)
    if not cd or cd.owner_id != user.id:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="이름은 비울 수 없습니다.")
        if new_name.lower() != cd.name.lower():
            dup = (
                db.query(CharacterDesign)
                .filter(CharacterDesign.owner_id == user.id)
                .filter(CharacterDesign.id != char_id)
                .filter(CharacterDesign.name.ilike(new_name))
                .first()
            )
            if dup:
                raise HTTPException(
                    status_code=400, detail=f"'{new_name}' 이름의 캐릭터가 이미 있습니다."
                )
        cd.name = new_name
    if payload.description is not None:
        cd.description = payload.description.strip() or None

    db.commit()
    db.refresh(cd)
    return CharacterDesignOut.model_validate(cd)


@router.put("/{char_id}/image", response_model=CharacterDesignOut)
async def replace_character_image(
    char_id: int,
    image: Annotated[UploadFile, File()],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CharacterDesignOut:
    cd = db.get(CharacterDesign, char_id)
    if not cd or cd.owner_id != user.id:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    rel, mime = await _save_image(user.id, cd.id, image)
    cd.image_path = rel
    cd.image_mime = mime
    db.commit()
    db.refresh(cd)
    return CharacterDesignOut.model_validate(cd)


@router.delete("/{char_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_character(
    char_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    cd = db.get(CharacterDesign, char_id)
    if not cd or cd.owner_id != user.id:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    # 파일도 삭제
    if cd.image_path:
        try:
            (settings.storage_dir / cd.image_path).unlink(missing_ok=True)
        except OSError:
            pass

    db.delete(cd)
    db.commit()


@router.get("/{char_id}/image")
def get_character_image(
    char_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cd = db.get(CharacterDesign, char_id)
    if not cd or cd.owner_id != user.id:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")
    full = settings.storage_dir / cd.image_path
    if not full.exists():
        raise HTTPException(status_code=404, detail="이미지 파일이 없습니다.")
    return FileResponse(str(full), media_type=cd.image_mime)
