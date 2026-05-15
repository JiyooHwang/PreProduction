"""프로젝트 + 작업 + 업로드 + 다운로드."""
from __future__ import annotations

import io
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from shotbreakdown.export import export_excel
from shotbreakdown.models import Shot as CoreShot
from shotbreakdown.models import ShotAnalysis as CoreAnalysis

from ..auth import get_current_user
from ..budget import aggregate_project_assets, calculate as calculate_budget
from ..config import settings
from ..database import get_db
from ..jobs import enqueue
from ..models import Job, JobStatus, Project, Shot, User
from ..schemas import JobOut, ProjectCreate, ProjectOut, ScenarioBudgetIn


router = APIRouter(prefix="/api/projects", tags=["projects"])


def _to_project_out(project: Project, db: Session) -> ProjectOut:
    shot_count = db.query(Shot).filter(Shot.project_id == project.id).count()
    latest_job = (
        db.query(Job)
        .filter(Job.project_id == project.id)
        .order_by(desc(Job.created_at))
        .first()
    )
    return ProjectOut(
        id=project.id,
        title=project.title,
        description=project.description,
        created_at=project.created_at,
        owner_email=project.owner.email if project.owner else None,
        shot_count=shot_count,
        latest_job_status=latest_job.status if latest_job else None,
        budget=project.budget,
    )


def _get_project_or_404(project_id: int, db: Session) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    return project


@router.get("", response_model=list[ProjectOut])
def list_projects(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ProjectOut]:
    """팀 내부 도구이므로 모든 사용자의 프로젝트를 모두에게 노출."""
    projects = db.query(Project).order_by(desc(Project.created_at)).all()
    return [_to_project_out(p, db) for p in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = Project(owner_id=user.id, title=payload.title, description=payload.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_project_out(project, db)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = _get_project_or_404(project_id, db)
    return _to_project_out(project, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    project = _get_project_or_404(project_id, db)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="본인 프로젝트만 삭제 가능합니다.")

    # 업로드된 영상 파일 정리 (재분석 위해 보존하던 파일들)
    jobs = db.query(Job).filter(Job.project_id == project_id).all()
    for j in jobs:
        try:
            f = settings.upload_dir / f"job_{j.id}_{j.video_filename}"
            if f.exists():
                f.unlink()
        except Exception:
            pass

    db.delete(project)
    db.commit()


@router.post("/{project_id}/jobs", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    project_id: int,
    threshold: Annotated[float, Form()] = 27.0,
    skip_analysis: Annotated[bool, Form()] = False,
    video: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobOut:
    project = _get_project_or_404(project_id, db)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="본인 프로젝트에만 업로드할 수 있습니다.")

    if not skip_analysis and not user.gemini_api_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API 키가 등록되지 않았습니다. 프로필에서 먼저 키를 입력하세요.",
        )

    job = Job(
        project_id=project_id,
        video_filename=Path(video.filename or "video").name,
        threshold=threshold,
        skip_analysis=skip_analysis,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    target = settings.upload_dir / f"job_{job.id}_{job.video_filename}"
    with target.open("wb") as f:
        while chunk := await video.read(1024 * 1024):
            f.write(chunk)

    enqueue(job.id)

    return JobOut.model_validate(job)


@router.post("/{project_id}/jobs/{job_id}/cancel", response_model=JobOut)
def cancel_job(
    project_id: int,
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobOut:
    project = _get_project_or_404(project_id, db)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="본인 프로젝트만 중단할 수 있습니다.")
    job = db.get(Job, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    if job.status not in (JobStatus.PENDING.value, JobStatus.RUNNING.value):
        return JobOut.model_validate(job)
    job.status = JobStatus.FAILED.value
    job.error = "사용자가 분석을 중단했습니다."
    db.commit()
    db.refresh(job)
    return JobOut.model_validate(job)


@router.post(
    "/{project_id}/jobs/rerun",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
)
def rerun_job(
    project_id: int,
    threshold: Annotated[float, Form()] = 27.0,
    skip_analysis: Annotated[bool, Form()] = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobOut:
    """기존에 업로드된 영상을 새 threshold/옵션으로 재분석."""
    project = _get_project_or_404(project_id, db)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="본인 프로젝트만 재분석할 수 있습니다.")

    if not skip_analysis and not user.gemini_api_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API 키가 등록되지 않았습니다. 프로필에서 먼저 키를 입력하세요.",
        )

    # 가장 최근부터 거꾸로 훑어서 실제로 파일이 남아있는 job 을 찾는다
    all_jobs = (
        db.query(Job)
        .filter(Job.project_id == project_id)
        .order_by(desc(Job.created_at))
        .all()
    )
    if not all_jobs:
        raise HTTPException(
            status_code=400,
            detail="재분석할 영상이 없습니다. 먼저 영상을 업로드하세요.",
        )

    src_path: Path | None = None
    last_job: Job | None = None
    for j in all_jobs:
        candidate = settings.upload_dir / f"job_{j.id}_{j.video_filename}"
        if candidate.exists():
            src_path = candidate
            last_job = j
            break

    if src_path is None or last_job is None:
        raise HTTPException(
            status_code=400,
            detail="원본 영상 파일을 찾을 수 없습니다. 다시 업로드해주세요.",
        )

    new_job = Job(
        project_id=project_id,
        video_filename=last_job.video_filename,
        threshold=threshold,
        skip_analysis=skip_analysis,
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    # 새 job 용 파일 경로로 복사 (같은 영상 재사용)
    target = settings.upload_dir / f"job_{new_job.id}_{new_job.video_filename}"
    target.write_bytes(src_path.read_bytes())

    enqueue(new_job.id)

    return JobOut.model_validate(new_job)


@router.get("/{project_id}/jobs", response_model=list[JobOut])
def list_jobs(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[JobOut]:
    _get_project_or_404(project_id, db)
    jobs = (
        db.query(Job)
        .filter(Job.project_id == project_id)
        .order_by(desc(Job.created_at))
        .all()
    )
    return [JobOut.model_validate(j) for j in jobs]


@router.get("/{project_id}/jobs/latest", response_model=JobOut | None)
def latest_job(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobOut | None:
    _get_project_or_404(project_id, db)
    job = (
        db.query(Job)
        .filter(Job.project_id == project_id)
        .order_by(desc(Job.created_at))
        .first()
    )
    return JobOut.model_validate(job) if job else None


@router.get("/{project_id}/export.xlsx")
def export_xlsx(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    project = _get_project_or_404(project_id, db)
    shots_db = (
        db.query(Shot)
        .filter(Shot.project_id == project_id)
        .order_by(Shot.index)
        .all()
    )
    if not shots_db:
        raise HTTPException(status_code=404, detail="샷이 아직 없습니다.")

    shots_core = [
        CoreShot(
            index=s.index,
            start_seconds=s.start_seconds,
            end_seconds=s.end_seconds,
            fps=s.fps,
            start_tc=s.start_tc,
            end_tc=s.end_tc,
            duration_seconds=s.duration_seconds,
            duration_frames=s.duration_frames,
            thumbnail_path=Path(s.thumbnail_path) if s.thumbnail_path else None,
            dialogue=s.dialogue,
            analysis=CoreAnalysis(
                shot_size=s.shot_size,
                camera_movement=s.camera_movement,
                characters=s.characters or [],
                background=s.background,
                action=s.action,
                fx=s.fx,
                notes=s.notes,
            ),
        )
        for s in shots_db
    ]

    tmp = settings.storage_dir / f"project_{project_id}" / f"{project.title}_shotlist.xlsx"
    export_excel(shots_core, tmp)

    def iterfile():
        with tmp.open("rb") as f:
            yield from f

    filename = f"{project.title}_shotlist.xlsx".replace(" ", "_")
    return StreamingResponse(
        iterfile(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{project_id}/thumbnails/{shot_index}")
def get_thumbnail(
    project_id: int,
    shot_index: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    shot = (
        db.query(Shot)
        .filter(Shot.project_id == project_id, Shot.index == shot_index)
        .first()
    )
    if shot is None or not shot.thumbnail_path:
        raise HTTPException(status_code=404, detail="썸네일 없음")
    path = Path(shot.thumbnail_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="파일 없음")
    return FileResponse(path, media_type="image/jpeg")


@router.put("/{project_id}/budget", response_model=ProjectOut)
def set_project_budget(
    project_id: int,
    payload: ScenarioBudgetIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = _get_project_or_404(project_id, db)
    if payload.budget is None:
        project.budget = None
    else:
        if payload.budget < 0:
            raise HTTPException(status_code=400, detail="예산은 0 이상이어야 합니다.")
        project.budget = float(payload.budget)
    db.commit()
    db.refresh(project)
    return _to_project_out(project, db)


@router.get("/{project_id}/budget-analysis")
def get_project_budget_analysis(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """프로젝트(영상 분석)의 예산 분석.

    1) 샷에서 캐릭터/소품/FX 자동 집계
    2) 사용자 임계값으로 등급 자동 분류
    3) 단가 곱해서 비용 계산 + 예산 대비 제안
    """
    from shotbreakdown.models import (
        compute_asset_grades,
        compute_character_grades,
    )

    project = _get_project_or_404(project_id, db)
    shots_db = (
        db.query(Shot)
        .filter(Shot.project_id == project_id)
        .order_by(Shot.index)
        .all()
    )

    aggregated = aggregate_project_assets(shots_db)
    total_shots = len(shots_db)

    # 사용자 임계값 적용해서 등급 자동 분류
    from ..scenario_jobs import _user_grade_thresholds

    thresholds = _user_grade_thresholds(user)
    compute_character_grades(aggregated["characters"], total_shots, thresholds=thresholds)
    compute_asset_grades(aggregated["props"], total_shots, thresholds=thresholds)
    compute_asset_grades(aggregated["fx"], total_shots, thresholds=thresholds)

    analysis = calculate_budget(
        characters=aggregated["characters"],
        locations=aggregated["locations"],
        props=aggregated["props"],
        fx=aggregated["fx"],
        shots=[{} for _ in shots_db],  # 샷 수만 필요
        prices=user.unit_prices or {},
        budget=project.budget,
    )

    # 분석 결과에 집계된 에셋 리스트도 함께 반환 (UI 표시용)
    analysis["assets"] = aggregated
    return analysis


@router.post("/{project_id}/merge-assets")
def merge_project_assets(
    project_id: int,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """프로젝트(영상)의 샷에서 같은 에셋을 하나로 통합.

    payload:
    {
      "asset_type": "characters" | "props" | "fx",
      "source_names": ["갈색 머리 여자", "긴 머리 여자"],
      "target_name": "수진"
    }
    """
    project = _get_project_or_404(project_id, db)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="본인 프로젝트만 수정 가능합니다.")

    asset_type = payload.get("asset_type")
    if asset_type not in ("characters", "props", "fx"):
        raise HTTPException(status_code=400, detail="asset_type 은 characters / props / fx 중 하나.")

    sources = payload.get("source_names") or []
    target = (payload.get("target_name") or "").strip()
    if not isinstance(sources, list) or not sources or not target:
        raise HTTPException(status_code=400, detail="source_names 와 target_name 필수.")

    src_lower = {str(s).strip().lower() for s in sources if str(s).strip()}
    if not src_lower:
        raise HTTPException(status_code=400, detail="유효한 source_names 가 필요.")

    shot_field = {
        "characters": "characters",
        "props": "props_used",
        "fx": "fx_used",
    }[asset_type]

    shots = db.query(Shot).filter(Shot.project_id == project_id).all()
    affected = 0
    for shot in shots:
        current = getattr(shot, shot_field) or []
        if not isinstance(current, list):
            continue
        new_list: list[str] = []
        was_merged = False
        for c in current:
            cs = str(c).strip()
            if cs.lower() in src_lower:
                was_merged = True
                if target not in new_list:
                    new_list.append(target)
            elif cs not in new_list:
                new_list.append(cs)
        if was_merged:
            setattr(shot, shot_field, new_list)
            affected += 1

    db.commit()
    return {"ok": True, "affected_shots": affected, "merged": len(src_lower), "target": target}
