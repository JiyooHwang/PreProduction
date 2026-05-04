"""FFmpeg를 통한 프레임 추출."""
from __future__ import annotations

import subprocess
from pathlib import Path
from shutil import which


class FFmpegNotFoundError(RuntimeError):
    pass


def ensure_ffmpeg() -> None:
    if which("ffmpeg") is None:
        raise FFmpegNotFoundError(
            "ffmpeg를 찾을 수 없습니다. https://ffmpeg.org/download.html 에서 설치 후 PATH에 추가하세요."
        )


def extract_frame(video_path: Path, time_seconds: float, output_path: Path) -> Path:
    """지정 시각의 프레임을 JPEG로 저장."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel", "error",
        "-ss", f"{max(time_seconds, 0):.3f}",
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", "2",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return output_path
