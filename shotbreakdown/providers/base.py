"""비전 provider 추상 인터페이스."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol, Sequence

from ..models import ShotAnalysis


@dataclass
class CharacterRef:
    """비전 분석 시 참조용 캐릭터. 같은 작품 내 캐릭터 이름을 일관되게 식별하는 데 사용."""
    name: str
    image_data: bytes
    image_mime: str = "image/png"
    description: Optional[str] = None  # 외형 설명 (선택)


class VisionProvider(Protocol):
    """샷 분석 provider 인터페이스. Gemini/Claude 등이 구현."""

    def analyze_shot(
        self,
        frame_paths: list[Path],
        dialogue: str | None = None,
        character_refs: Optional[Sequence[CharacterRef]] = None,
    ) -> ShotAnalysis:
        ...
