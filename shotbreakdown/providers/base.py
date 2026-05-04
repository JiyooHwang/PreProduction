"""비전 provider 추상 인터페이스."""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from ..models import ShotAnalysis


class VisionProvider(Protocol):
    """샷 분석 provider 인터페이스. Gemini/Claude 등이 구현."""

    def analyze_shot(
        self,
        frame_paths: list[Path],
        dialogue: str | None = None,
    ) -> ShotAnalysis:
        ...
