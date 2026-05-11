"""시나리오(대본) 분석 라우터."""
from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from shotbreakdown.image_gen import build_prompt, generate_image
from shotbreakdown.scenario_export import export_scenario_excel

from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..models import CharacterDesign, JobStatus, Scenario, User
from ..schemas import (
    CharacterDesignOut,
    ScenarioCreate,
    ScenarioListItem,
    ScenarioOut,
    ShotRegenerateIn,
)
from ..scenario_jobs import (
    enqueue_scenario,
    enqueue_storyboard,
    resolve_character_references,
    storyboard_dir,
)


router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.get("", response_model=list[ScenarioListItem])
def list_scenarios(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ScenarioListItem]:
    rows = (
        db.query(Scenario)
        .filter(Scenario.owner_id == user.id)
        .order_by(desc(Scenario.created_at))
        .all()
    )
    return [ScenarioListItem.model_validate(r) for r in rows]


@router.post("", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    title: Annotated[str, Form()],
    source_text: Annotated[str, Form()] = "",
    file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioOut:
    if not user.gemini_api_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API 키가 등록되지 않았습니다. 설정 페이지에서 먼저 키를 입력하세요.",
        )

    text = source_text or ""
    if file is not None and file.filename:
        content = await file.read()
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            try:
                text = content.decode("cp949")
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail="텍스트 파일 인코딩을 인식할 수 없습니다. UTF-8 또는 CP949 로 저장 후 시도하세요.",
                )

    if not text.strip():
        raise HTTPException(status_code=400, detail="시나리오 내용이 비어있습니다.")

    sc = Scenario(
        owner_id=user.id,
        title=title.strip() or "제목 없음",
        source_text=text,
        status=JobStatus.PENDING.value,
    )
    db.add(sc)
    db.commit()
    db.refresh(sc)

    enqueue_scenario(sc.id)

    return ScenarioOut.model_validate(sc)


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(
    scenario_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioOut:
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    return ScenarioOut.model_validate(sc)


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    db.delete(sc)
    db.commit()


@router.post("/{scenario_id}/cancel", response_model=ScenarioOut)
def cancel_scenario(
    scenario_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioOut:
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    if sc.status not in (JobStatus.PENDING.value, JobStatus.RUNNING.value):
        return ScenarioOut.model_validate(sc)
    sc.status = JobStatus.FAILED.value
    sc.error = "사용자가 분석을 중단했습니다."
    sc.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(sc)
    return ScenarioOut.model_validate(sc)


@router.post("/{scenario_id}/storyboard", response_model=ScenarioOut)
def start_storyboard(
    scenario_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioOut:
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    if sc.status != JobStatus.DONE.value:
        raise HTTPException(status_code=400, detail="먼저 시나리오 분석을 완료해주세요.")
    if not sc.shots:
        raise HTTPException(status_code=400, detail="분석된 샷이 없습니다.")
    if sc.storyboard_status == JobStatus.RUNNING.value:
        return ScenarioOut.model_validate(sc)

    sc.storyboard_status = JobStatus.PENDING.value
    sc.storyboard_progress_done = 0
    sc.storyboard_progress_total = len(sc.shots)
    sc.storyboard_error = None
    db.commit()

    enqueue_storyboard(scenario_id)
    db.refresh(sc)
    return ScenarioOut.model_validate(sc)


@router.post("/{scenario_id}/storyboard/cancel", response_model=ScenarioOut)
def cancel_storyboard(
    scenario_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioOut:
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    if sc.storyboard_status not in (JobStatus.PENDING.value, JobStatus.RUNNING.value):
        return ScenarioOut.model_validate(sc)
    sc.storyboard_status = JobStatus.FAILED.value
    sc.storyboard_error = "사용자가 스토리보드 생성을 중단했습니다."
    db.commit()
    db.refresh(sc)
    return ScenarioOut.model_validate(sc)


@router.get("/{scenario_id}/storyboard/{shot_index}")
def get_storyboard_image(
    scenario_id: int,
    shot_index: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    img = Path(str(storyboard_dir(scenario_id))) / f"shot_{shot_index:04d}.png"
    if not img.exists():
        raise HTTPException(status_code=404, detail="이미지 없음")
    return FileResponse(str(img), media_type="image/png")


@router.post("/{scenario_id}/storyboard/{shot_index}/regenerate")
def regenerate_storyboard_shot(
    scenario_id: int,
    shot_index: int,
    payload: ShotRegenerateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """단일 샷 이미지 재생성. payload.prompt 가 있으면 그 프롬프트로, 없으면 기본 프롬프트로."""
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    if not user.gemini_api_key:
        raise HTTPException(status_code=400, detail="Gemini API 키가 없습니다.")

    shots = sc.shots or []
    if shot_index < 0 or shot_index >= len(shots):
        raise HTTPException(status_code=404, detail="샷 인덱스 범위 밖.")
    shot = shots[shot_index]

    prompt = (payload.prompt or "").strip() or build_prompt(shot)

    # 이 샷에 등장하는 캐릭터들의 참조 이미지 로드
    references: list = []
    if payload.use_references:
        char_names = shot.get("characters") or []
        if isinstance(char_names, str):
            char_names = [char_names]
        references = resolve_character_references(db, user.id, char_names)

    out_dir = Path(str(storyboard_dir(scenario_id)))
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"shot_{shot_index:04d}.png"

    try:
        generate_image(
            prompt,
            target,
            api_key=user.gemini_api_key,
            reference_images=references,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 생성 실패: {str(e)[:300]}")

    return {"ok": True, "shot_index": shot_index, "prompt": prompt}


@router.get("/{scenario_id}/storyboard/{shot_index}/prompt")
def get_shot_prompt(
    scenario_id: int,
    shot_index: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """기본 프롬프트 미리보기 (수정용)."""
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    shots = sc.shots or []
    if shot_index < 0 or shot_index >= len(shots):
        raise HTTPException(status_code=404, detail="샷 인덱스 범위 밖.")
    return {"prompt": build_prompt(shots[shot_index])}


@router.get("/{scenario_id}/export.xlsx")
def export_scenario(
    scenario_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sc = db.get(Scenario, scenario_id)
    if not sc or sc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
    if sc.status != JobStatus.DONE.value:
        raise HTTPException(status_code=400, detail="분석이 완료된 시나리오만 다운로드할 수 있습니다.")

    out = settings.storage_dir / f"scenario_{scenario_id}" / "scenario.xlsx"
    sb_dir = Path(str(storyboard_dir(scenario_id)))
    export_scenario_excel(
        title=sc.title,
        characters=sc.characters or [],
        locations=sc.locations or [],
        props=sc.props or [],
        fx=sc.fx or [],
        shots=sc.shots or [],
        dialogues=sc.dialogues or [],
        storyboard_dir=sb_dir if sb_dir.exists() else None,
        output_path=out,
    )
    return FileResponse(
        str(out),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"{sc.title}.xlsx",
    )
