"""백그라운드 작업 큐 - 동시 실행 N개 제한."""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime
from pathlib import Path
from queue import Queue

from sqlalchemy.orm import Session

from shotbreakdown.models import ShotAnalysis as CoreAnalysis
from shotbreakdown.pipeline import build_shot_list
from shotbreakdown.providers import build_provider
from shotbreakdown.providers.base import CharacterRef

from .config import settings
from .database import SessionLocal
from .models import CharacterDesign, Job, JobStatus, Shot


logger = logging.getLogger(__name__)


def _should_delete_video_after() -> bool:
    # 기본은 보존(=재분석 가능). 디스크 절약하려면 env 로 켜면 됨.
    return os.environ.get("DELETE_VIDEO_AFTER_PROCESSING", "false").lower() == "true"


_queue: "Queue[int]" = Queue()
_workers_started = False
_worker_lock = threading.Lock()


def start_workers() -> None:
    """앱 기동 시 워커 스레드 N개 띄움."""
    global _workers_started
    with _worker_lock:
        if _workers_started:
            return
        for i in range(settings.max_concurrent_jobs):
            t = threading.Thread(target=_worker_loop, name=f"job-worker-{i+1}", daemon=True)
            t.start()
        _workers_started = True
        logger.info("작업 워커 %d개 시작", settings.max_concurrent_jobs)


def enqueue(job_id: int) -> None:
    _queue.put(job_id)


def _worker_loop() -> None:
    while True:
        job_id = _queue.get()
        try:
            _run_job(job_id)
        except Exception:
            logger.exception("작업 %s 실패 (워커 루프)", job_id)
        finally:
            _queue.task_done()


def _run_job(job_id: int) -> None:
    db: Session = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if job is None:
            logger.warning("작업 %s 를 찾을 수 없음", job_id)
            return
        owner = job.project.owner

        job.status = JobStatus.RUNNING.value
        job.progress_message = "시작"
        db.commit()

        video_path = settings.upload_dir / f"job_{job_id}_{job.video_filename}"
        if not video_path.exists():
            raise FileNotFoundError(f"업로드 파일 없음: {video_path}")

        output_dir = settings.storage_dir / f"project_{job.project_id}"
        output_dir.mkdir(parents=True, exist_ok=True)

        vision = None
        character_refs: list[CharacterRef] = []
        if not job.skip_analysis:
            if not owner.gemini_api_key:
                raise RuntimeError(
                    "Gemini API 키가 설정되지 않았습니다. 프로필 설정에서 키를 등록하세요."
                )
            vision = build_provider("gemini", api_key=owner.gemini_api_key)

            # 사용자 캐릭터 라이브러리를 비전 분석 참조로 자동 첨부
            # → 같은 작품 내 캐릭터 이름이 일관되게 라벨링됨
            library = (
                db.query(CharacterDesign)
                .filter(CharacterDesign.owner_id == owner.id)
                .all()
            )
            for cd in library:
                try:
                    data = (settings.storage_dir / cd.image_path).read_bytes()
                except OSError:
                    continue
                character_refs.append(
                    CharacterRef(
                        name=cd.name,
                        image_data=data,
                        image_mime=cd.image_mime,
                        description=cd.description or None,
                    )
                )
            if character_refs:
                logger.info(
                    "작업 %s: 캐릭터 라이브러리 %d개를 비전 분석 참조로 첨부",
                    job_id, len(character_refs),
                )

        def on_progress(done: int, total: int, msg: str) -> None:
            db.refresh(job)
            if job.status == JobStatus.FAILED.value and (job.error or "").startswith("사용자"):
                # 사용자가 중단 요청
                raise RuntimeError("사용자가 분석을 중단했습니다.")
            job.progress_done = done
            job.progress_total = total
            job.progress_message = msg
            db.commit()

        shots_core = build_shot_list(
            video_path=video_path,
            output_dir=output_dir,
            threshold=job.threshold,
            vision=vision,
            on_progress=on_progress,
            character_refs=character_refs or None,
        )

        # 기존 샷 제거 후 재삽입 (재실행 대비)
        db.query(Shot).filter(Shot.project_id == job.project_id).delete()
        for s in shots_core:
            a: CoreAnalysis = s.analysis or CoreAnalysis()
            db.add(
                Shot(
                    project_id=job.project_id,
                    index=s.index,
                    start_seconds=s.start_seconds,
                    end_seconds=s.end_seconds,
                    fps=s.fps,
                    start_tc=s.start_tc,
                    end_tc=s.end_tc,
                    duration_seconds=s.duration_seconds,
                    duration_frames=s.duration_frames,
                    thumbnail_path=str(s.thumbnail_path) if s.thumbnail_path else None,
                    sequence_number=s.sequence_number,
                    shot_number=s.shot_number,
                    shot_size=a.shot_size,
                    camera_movement=a.camera_movement,
                    camera_angle=a.camera_angle,
                    lens_mm=a.lens_mm,
                    time_of_day=a.time_of_day,
                    lighting=a.lighting,
                    characters=a.characters or None,
                    background=a.background,
                    props_used=a.props_used or None,
                    fx_used=a.fx_used or None,
                    action=a.action,
                    fx=a.fx,
                    notes=a.notes,
                )
            )

        job.status = JobStatus.DONE.value
        job.progress_message = f"{len(shots_core)}컷 완료"
        job.finished_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        logger.exception("작업 %s 실패", job_id)
        try:
            job = db.get(Job, job_id)
            if job is not None:
                job.status = JobStatus.FAILED.value
                job.error = str(e)
                job.finished_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
    finally:
        # 기본은 영상 보존(=재분석 가능).
        # DELETE_VIDEO_AFTER_PROCESSING=true 일 때만 삭제(디스크 절약용).
        if _should_delete_video_after():
            try:
                j = db.get(Job, job_id)
                if j is not None:
                    video_path = settings.upload_dir / f"job_{job_id}_{j.video_filename}"
                    if video_path.exists():
                        video_path.unlink()
            except Exception:
                pass
        db.close()
