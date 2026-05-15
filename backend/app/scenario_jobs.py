"""시나리오 분석 + 스토리보드 백그라운드 잡."""
from __future__ import annotations

import logging
import threading
from datetime import datetime
from queue import Queue

from sqlalchemy.orm import Session

from shotbreakdown.image_gen import ReferenceImage, build_prompt, generate_image
from shotbreakdown.models import assign_shot_codes, compute_asset_usage
from shotbreakdown.scenario import analyze_scenario

from .config import settings
from .database import SessionLocal
from .models import CharacterDesign, JobStatus, Scenario, User


logger = logging.getLogger(__name__)


_queue: "Queue[int]" = Queue()
_storyboard_queue: "Queue[int]" = Queue()
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
        # 스토리보드는 한 워커만 (Imagen rate limit 보호)
        sb = threading.Thread(target=_storyboard_loop, name="storyboard-worker", daemon=True)
        sb.start()
        _workers_started = True
        logger.info("시나리오 워커 %d개 + 스토리보드 워커 1개 시작", settings.max_concurrent_jobs)


def enqueue_scenario(scenario_id: int) -> None:
    _queue.put(scenario_id)


def enqueue_storyboard(scenario_id: int) -> None:
    _storyboard_queue.put(scenario_id)


def _loop() -> None:
    while True:
        sid = _queue.get()
        try:
            _run(sid)
        except Exception:
            logger.exception("시나리오 %s 실패 (워커 루프)", sid)
        finally:
            _queue.task_done()


def _storyboard_loop() -> None:
    while True:
        sid = _storyboard_queue.get()
        try:
            _run_storyboard(sid)
        except Exception:
            logger.exception("스토리보드 %s 실패 (워커 루프)", sid)
        finally:
            _storyboard_queue.task_done()


def storyboard_dir(scenario_id: int) -> "object":
    """반환 타입은 Path. 라우터에서도 동일 규칙 사용."""
    return settings.storage_dir / f"scenario_{scenario_id}" / "storyboard"


def resolve_character_references(
    db: Session,
    owner_id: int,
    character_names: list[str],
) -> list[ReferenceImage]:
    """샷에 등장하는 캐릭터 이름과 일치하는 라이브러리 항목을 찾아 ReferenceImage 로 반환.

    이름 매칭은 대소문자 무시 + 정확히 일치. 일치 항목이 없으면 빈 리스트.
    """
    if not character_names:
        return []
    names = [n for n in character_names if isinstance(n, str) and n.strip()]
    if not names:
        return []

    rows = (
        db.query(CharacterDesign)
        .filter(CharacterDesign.owner_id == owner_id)
        .all()
    )
    by_name_lower = {r.name.lower(): r for r in rows}

    out: list[ReferenceImage] = []
    seen: set[int] = set()
    for n in names:
        cd = by_name_lower.get(n.lower())
        if cd is None or cd.id in seen:
            continue
        seen.add(cd.id)
        try:
            data = (settings.storage_dir / cd.image_path).read_bytes()
        except OSError:
            continue
        out.append(ReferenceImage(data=data, mime_type=cd.image_mime, label=cd.name))
    return out


def resolve_character_descriptions(
    db: Session,
    owner_id: int,
    character_names: list[str],
) -> list[dict]:
    """라이브러리 매칭 캐릭터의 외형 묘사 텍스트만 반환 (이미지 없음, 구도 영향 없음).

    카메라 앵글 바꿀 때도 외형 일관성을 텍스트로 유지하는 용도.
    반환: [{name, description}, ...]
    """
    if not character_names:
        return []
    names = [n for n in character_names if isinstance(n, str) and n.strip()]
    if not names:
        return []
    rows = (
        db.query(CharacterDesign)
        .filter(CharacterDesign.owner_id == owner_id)
        .all()
    )
    by_name_lower = {r.name.lower(): r for r in rows}
    out: list[dict] = []
    seen: set[int] = set()
    for n in names:
        cd = by_name_lower.get(n.lower())
        if cd is None or cd.id in seen:
            continue
        seen.add(cd.id)
        if cd.description and cd.description.strip():
            out.append({"name": cd.name, "description": cd.description.strip()})
    return out


def _run_storyboard(scenario_id: int) -> None:
    import time
    db: Session = SessionLocal()
    try:
        sc = db.get(Scenario, scenario_id)
        if sc is None:
            return
        user = db.get(User, sc.owner_id)
        if user is None or not user.gemini_api_key:
            sc.storyboard_status = JobStatus.FAILED.value
            sc.storyboard_error = "Gemini API 키가 없습니다."
            db.commit()
            return

        shots = sc.shots or []
        if not shots:
            sc.storyboard_status = JobStatus.FAILED.value
            sc.storyboard_error = "분석된 샷이 없습니다."
            db.commit()
            return

        out_dir = storyboard_dir(scenario_id)
        out_dir.mkdir(parents=True, exist_ok=True)  # type: ignore[attr-defined]

        sc.storyboard_status = JobStatus.RUNNING.value
        sc.storyboard_progress_total = len(shots)
        sc.storyboard_progress_done = 0
        sc.storyboard_error = None
        db.commit()

        first_error: str | None = None
        for i, shot in enumerate(shots):
            # 사용자가 중간에 취소했는지 확인
            db.refresh(sc)
            if sc.storyboard_status == JobStatus.FAILED.value and "중단" in (sc.storyboard_error or ""):
                return

            try:
                prompt = build_prompt(shot)
                target = out_dir / f"shot_{i:04d}.png"  # type: ignore[operator]

                # 이 샷에 등장하는 캐릭터의 라이브러리 이미지 + 외형 묘사 매칭
                shot_chars = shot.get("characters") or []
                if isinstance(shot_chars, str):
                    shot_chars = [shot_chars]
                refs = resolve_character_references(db, user.id, shot_chars)
                descs = resolve_character_descriptions(db, user.id, shot_chars)

                generate_image(
                    prompt,
                    target,
                    api_key=user.gemini_api_key,
                    reference_images=refs,
                    character_descriptions=descs,
                )
                logger.info(
                    "시나리오 %s 샷 %s 이미지 생성 OK (refs=%d, descs=%d)",
                    scenario_id, i, len(refs), len(descs),
                )
            except Exception as e:
                logger.warning("시나리오 %s 샷 %s 이미지 생성 실패: %s", scenario_id, i, e)
                if first_error is None:
                    first_error = str(e)[:300]

            sc.storyboard_progress_done = i + 1
            db.commit()

            # rate limit 회피용 짧은 sleep
            time.sleep(1.0)

        # 한 장도 생성 못했으면 에러 메시지 노출
        from pathlib import Path as _P
        any_image = any(
            (_P(str(out_dir)) / f"shot_{i:04d}.png").exists() for i in range(len(shots))
        )
        if not any_image and first_error:
            sc.storyboard_status = JobStatus.FAILED.value
            sc.storyboard_error = f"이미지 생성 실패. 첫 에러: {first_error}"
            db.commit()
            return

        sc.storyboard_status = JobStatus.DONE.value
        if first_error and not any_image:
            sc.storyboard_error = first_error
        db.commit()

    except Exception as e:
        logger.exception("스토리보드 %s 실패", scenario_id)
        try:
            sc = db.get(Scenario, scenario_id)
            if sc is not None:
                sc.storyboard_status = JobStatus.FAILED.value
                sc.storyboard_error = str(e)
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


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

        chars_list = result.get("characters") or []
        locs_list = result.get("locations") or []
        props_list = result.get("props") or []
        fx_list = result.get("fx") or []
        shots_list = result.get("shots") or []

        # scene_number 기반으로 시퀀스/샷 번호 자동 채번 (in-place)
        assign_shot_codes(shots_list)

        # 에셋별 등장 빈도 + 샷 코드 리스트 자동 집계
        compute_asset_usage(chars_list, shots_list, shot_field="characters")
        compute_asset_usage(locs_list, shots_list, shot_field="location")
        compute_asset_usage(props_list, shots_list, shot_field="props_used")
        compute_asset_usage(fx_list, shots_list, shot_field="fx_used")

        sc.characters = chars_list
        sc.locations = locs_list
        sc.props = props_list
        sc.fx = fx_list
        sc.shots = shots_list
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
