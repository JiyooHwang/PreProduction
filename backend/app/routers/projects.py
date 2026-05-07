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
from ..config import settings
from ..database import get_db
from ..jobs import enqueue
from ..models import Job, JobStatus, Project, Shot, User
from ..schemas import JobOut, ProjectCreate, ProjectOut


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
