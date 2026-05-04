"""타임코드 변환."""
from __future__ import annotations


def seconds_to_tc(seconds: float, fps: float) -> str:
    """초 단위를 HH:MM:SS:FF 타임코드로 변환."""
    if seconds < 0:
        seconds = 0.0
    fps_int = max(int(round(fps)), 1)
    total_frames = int(round(seconds * fps_int))
    h, rem = divmod(total_frames, fps_int * 3600)
    m, rem = divmod(rem, fps_int * 60)
    s, f = divmod(rem, fps_int)
    return f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"
