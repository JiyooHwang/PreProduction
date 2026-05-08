"""컷 감지 → 프레임 추출 → 분석 → 샷 리스트 생성 파이프라인."""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Callable, Optional

from .detect import detect_shots
from .extract import ensure_ffmpeg, extract_frame
from .models import Shot
from .providers.base import VisionProvider
from .timecode import seconds_to_tc


def _get_request_interval() -> float:
    # Gemini 무료 한도(분당 15회)를 안 넘기려면 최소 4초 간격 필요. 기본 5초.
    try:
        return max(0.0, float(os.environ.get("GEMINI_REQUEST_INTERVAL", "5.0")))
    except ValueError:
        return 5.0


def _run_detection(video_path: Path, threshold: float):
    """DETECTOR 환경변수로 디텍터 선택. 기본은 PySceneDetect."""
    detector = os.environ.get("DETECTOR", "scenedetect").lower()
    if detector == "transnet":
        from .detect_transnet import detect_shots_transnet

        try:
            t = float(os.environ.get("TRANSNET_THRESHOLD", "0.5"))
        except ValueError:
            t = 0.5
        return detect_shots_transnet(video_path, threshold=t)
    return detect_shots(video_path, threshold=threshold)


ProgressCb = Callable[[int, int, str], None]


def build_shot_list(
    video_path: Path,
    output_dir: Path,
    threshold: float = 27.0,
    vision: Optional[VisionProvider] = None,
    on_progress: Optional[ProgressCb] = None,
) -> list[Shot]:
    """전체 파이프라인을 실행하고 Shot 리스트를 반환."""
    ensure_ffmpeg()

    if on_progress:
        on_progress(0, 1, "컷 감지 중...")
    scenes = _run_detection(video_path, threshold=threshold)
    if not scenes:
        return []

    frames_dir = output_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    fps = scenes[0].fps
    shots: list[Shot] = []
    total = len(scenes)
    request_interval = _get_request_interval() if vision is not None else 0.0

    for i, scene in enumerate(scenes, start=1):
        if on_progress:
            on_progress(i - 1, total, f"샷 {i}/{total} 처리 중")

        start, end = scene.start_seconds, scene.end_seconds
        duration = max(end - start, 0.0)
        mid = start + duration / 2

        thumb = frames_dir / f"shot_{i:04d}_thumb.jpg"
        extract_frame(video_path, mid, thumb)

        frame_paths: list[Path] = []
        analysis = None

        if vision is not None:
            start_frame = frames_dir / f"shot_{i:04d}_start.jpg"
            mid_frame = frames_dir / f"shot_{i:04d}_mid.jpg"
            end_frame = frames_dir / f"shot_{i:04d}_end.jpg"

            extract_frame(video_path, start + min(0.05, duration / 4), start_frame)
            extract_frame(video_path, mid, mid_frame)
            extract_frame(video_path, max(end - 0.1, start), end_frame)
            frame_paths = [start_frame, mid_frame, end_frame]

            try:
                analysis = vision.analyze_shot(frame_paths)
            except Exception as e:  # provider 호출 실패는 한 컷만 비워두고 계속
                from .models import ShotAnalysis

                analysis = ShotAnalysis(notes=f"분석 실패: {e}")

            if request_interval > 0 and i < total:
                time.sleep(request_interval)

        shots.append(
            Shot(
                index=i,
                start_seconds=start,
                end_seconds=end,
                fps=fps,
                start_tc=seconds_to_tc(start, fps),
                end_tc=seconds_to_tc(end, fps),
                duration_seconds=duration,
                duration_frames=int(round(duration * fps)),
                thumbnail_path=thumb,
                frame_paths=frame_paths,
                analysis=analysis,
            )
        )

    if on_progress:
        on_progress(total, total, "완료")

    return shots
