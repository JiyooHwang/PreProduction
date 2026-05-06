"""PySceneDetect 기반 컷 감지."""
from __future__ import annotations

import os
from pathlib import Path
from typing import NamedTuple

from scenedetect import detect, ContentDetector, AdaptiveDetector


class DetectedScene(NamedTuple):
    start_seconds: float
    end_seconds: float
    fps: float


def detect_shots(video_path: Path, threshold: float = 27.0) -> list[DetectedScene]:
    """영상에서 컷을 감지해 (start, end, fps) 리스트 반환.

    기본은 ContentDetector + AdaptiveDetector 결합으로 누락 줄임.
    너무 잘게 쪼개지면 ENABLE_ADAPTIVE_DETECTOR=false 로 끄거나
    MIN_SCENE_LEN_FRAMES, ADAPTIVE_THRESHOLD 를 올려 둔감하게 조절.

    threshold: ContentDetector 임계값. 22~27 권장.
    """
    min_scene_len = int(os.environ.get("MIN_SCENE_LEN_FRAMES", "12"))
    adaptive_threshold = float(os.environ.get("ADAPTIVE_THRESHOLD", "3.0"))
    use_adaptive = os.environ.get("ENABLE_ADAPTIVE_DETECTOR", "true").lower() != "false"

    cd_scenes = detect(
        str(video_path),
        ContentDetector(threshold=threshold, min_scene_len=min_scene_len),
    )
    ad_scenes = []
    if use_adaptive:
        try:
            ad_scenes = detect(
                str(video_path),
                AdaptiveDetector(
                    adaptive_threshold=adaptive_threshold,
                    min_scene_len=min_scene_len,
                ),
            )
        except Exception:
            ad_scenes = []

    if not cd_scenes and not ad_scenes:
        return []

    fps = (cd_scenes[0][0].framerate if cd_scenes else ad_scenes[0][0].framerate)

    # 두 결과의 cut 시점(=각 scene 의 start)을 합쳐 중복 제거.
    # 0.3초(=약 7~9프레임) 이내 동일 컷으로 간주.
    cut_points: list[float] = []
    for scenes in (cd_scenes, ad_scenes):
        for start, _end in scenes:
            cut_points.append(start.get_seconds())

    cut_points.sort()
    merged: list[float] = []
    for t in cut_points:
        if not merged or t - merged[-1] > 0.3:
            merged.append(t)

    # video 끝 시간(마지막 scene 의 end)
    end_candidates = []
    if cd_scenes:
        end_candidates.append(cd_scenes[-1][1].get_seconds())
    if ad_scenes:
        end_candidates.append(ad_scenes[-1][1].get_seconds())
    video_end = max(end_candidates)

    # cut_points 를 (start, end) 페어로 변환
    result: list[DetectedScene] = []
    for i, start in enumerate(merged):
        end = merged[i + 1] if i + 1 < len(merged) else video_end
        if end - start < 0.05:  # 너무 짧은 건 스킵
            continue
        result.append(DetectedScene(start_seconds=start, end_seconds=end, fps=fps))

    return result
