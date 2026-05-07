"""시나리오 분석 백그라운드 잡."""
from __future__ import annotations

import logging
import threading
from datetime import datetime
from queue import Queue

from sqlalchemy.orm import Session

from shotbreakdown.scenario import analyze_scenario

from .config import settings
from .database import SessionLocal
from .models import JobStatus, Scenario, User


logger = logging.getLogger(__name__)


_queue: "Queue[int]" = Queue()
_workers_started = False
_lock = threading.Lock()


def start_scenario_workers() -> None:
    global _workers_started
    with _lock:
        if _workers_started:
            return
        for i in range(max(1, settings.max_concurrent_jobs)):
            t = threading.Thread(target=_loop, name=f"scenario-worker-{i+1}", daemon=True)
            t.start()
        _workers_started = True
        logger.info("시나리오 워커 %d개 시작", settings.max_concurrent_jobs)


def enqueue_scenario(scenario_id: int) -> None:
    _queue.put(scenario_id)


def _loop() -> None:
    while True:
        sid = _queue.get()
        try:
            _run(sid)
        except Exception:
            logger.exception("시나리오 %s 실패 (워커 루프)", sid)
        finally:
            _queue.task_done()


def _run(scenario_id: int) -> None:
    db: Session = SessionLocal()
    try:
        sc = db.get(Scenario, scenario_id)
        if sc is None:
            return

        # 사용자가 시작 전에 취소했을 수 있음
        if sc.status == JobStatus.FAILED.value and sc.error:
            return

        user = db.get(User, sc.owner_id)
        if user is None or not user.gemini_api_key:
            sc.status = JobStatus.FAILED.value
            sc.error = "Gemini API 키가 없습니다."
            sc.finished_at = datetime.utcnow()
            db.commit()
            return

        sc.status = JobStatus.RUNNING.value
        db.commit()

        result = analyze_scenario(sc.source_text, api_key=user.gemini_api_key)

        # 큐에서 워커가 실행 중인 동안 사용자가 취소했는지 다시 확인
        db.refresh(sc)
        if sc.status == JobStatus.FAILED.value and "중단" in (sc.error or ""):
            return

        sc.characters = result.get("characters") or []
        sc.locations = result.get("locations") or []
        sc.props = result.get("props") or []
        sc.fx = result.get("fx") or []
        sc.shots = result.get("shots") or []
        sc.dialogues = result.get("dialogues") or []
        sc.status = JobStatus.DONE.value
        sc.finished_at = datetime.utcnow()
        if "_parse_error" in result:
            sc.error = f"파싱 일부 실패: {result['_parse_error'][:200]}"
        db.commit()

    except Exception as e:
        logger.exception("시나리오 %s 실패", scenario_id)
        try:
            sc = db.get(Scenario, scenario_id)
            if sc is not None:
                sc.status = JobStatus.FAILED.value
                sc.error = str(e)
                sc.finished_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()
