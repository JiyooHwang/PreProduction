"""TransNetV2 (TensorFlow) 기반 컷 감지.

공식 레포(soCzech/TransNetV2)의 inference 모듈을 그대로 사용한다.
환경변수 TRANSNET_PATH 로 레포 위치를 지정 (기본: 프로젝트 옆 폴더).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from .detect import DetectedScene


def _default_transnet_path() -> Path:
    # 프로젝트 루트의 부모 폴더 (프로젝트가 E:\Claude\preproduction 이면 E:\Claude)
    return Path(__file__).resolve().parent.parent.parent / "TransNetV2"


_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model

    base = Path(os.environ.get("TRANSNET_PATH", str(_default_transnet_path())))
    inference_dir = base / "inference"
    weights_dir = inference_dir / "transnetv2-weights"

    if not weights_dir.exists():
        raise RuntimeError(
            f"TransNetV2 가중치를 찾을 수 없습니다: {weights_dir}\n"
            "TRANSNET_PATH 환경변수에 레포 경로를 지정하거나, "
            "프로젝트 옆에 git clone https://github.com/soCzech/TransNetV2.git"
        )

    if str(inference_dir) not in sys.path:
        sys.path.insert(0, str(inference_dir))

    from transnetv2 import TransNetV2  # type: ignore

    _model = TransNetV2(str(weights_dir))
    return _model


def _video_fps(video_path: Path) -> float:
    """영상 원본 fps. TransNetV2 는 원본 fps 그대로 디코딩하므로 필요."""
    import ffmpeg

    probe = ffmpeg.probe(str(video_path))
    stream = next(s for s in probe["streams"] if s["codec_type"] == "video")
    num, den = stream["r_frame_rate"].split("/")
    return float(num) / float(den)


def detect_shots_transnet(
    video_path: Path,
    threshold: float = 0.5,
) -> list[DetectedScene]:
    """TransNetV2 로 컷 감지. threshold 는 0~1 (기본 0.5)."""
    model = _load_model()

    _, single_predictions, _ = model.predict_video(str(video_path))
    scenes_arr = model.predictions_to_scenes(single_predictions, threshold=threshold)

    fps = _video_fps(video_path)

    result: list[DetectedScene] = []
    for start_frame, end_frame in scenes_arr:
        start = float(start_frame) / fps
        end = float(end_frame + 1) / fps
        if end - start < 0.05:
            continue
        result.append(DetectedScene(start_seconds=start, end_seconds=end, fps=fps))
    return result
