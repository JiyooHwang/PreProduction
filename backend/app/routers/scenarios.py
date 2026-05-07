"""시나리오(대본) 분석 라우터."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import JobStatus, Scenario, User
from ..schemas import ScenarioCreate, ScenarioListItem, ScenarioOut
from ..scenario_jobs import enqueue_scenario


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
