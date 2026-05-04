"""PySceneDetect 기반 컷 감지."""
from __future__ import annotations

from pathlib import Path
from typing import NamedTuple

from scenedetect import detect, ContentDetector


class DetectedScene(NamedTuple):
    start_seconds: float
    end_seconds: float
    fps: float


def detect_shots(video_path: Path, threshold: float = 27.0) -> list[DetectedScene]:
    """영상에서 컷을 감지해 (start, end, fps) 리스트 반환.

    threshold: ContentDetector 임계값. 낮을수록 컷이 더 많이 감지됨.
    애니메이션은 27 부근이 무난하나, 디졸브가 많으면 22~25로 낮춰 시도.
    """
    scene_list = detect(str(video_path), ContentDetector(threshold=threshold))
    if not scene_list:
        return []

    fps = scene_list[0][0].framerate
    return [
        DetectedScene(
            start_seconds=start.get_seconds(),
            end_seconds=end.get_seconds(),
            fps=fps,
        )
        for start, end in scene_list
    ]
