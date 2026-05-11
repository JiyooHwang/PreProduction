"""Gemini 비전 provider."""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Optional, Sequence

from PIL import Image
from pydantic import ValidationError

from ..models import ShotAnalysis
from .base import CharacterRef


def _is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "429" in msg or "rate" in msg or "quota" in msg or "resource_exhausted" in msg


def _get_max_retries() -> int:
    try:
        return max(0, int(os.environ.get("GEMINI_MAX_RETRIES", "3")))
    except ValueError:
        return 3


ANALYSIS_PROMPT = """당신은 애니메이션 프리프로덕션 어시스턴트입니다. 한 컷에서 추출한 \
프레임들(첫 / 중간 / 끝 순서)을 보고 해당 샷을 분석하세요.

반드시 아래 스키마의 **순수 JSON**만 출력하세요. 마크다운 코드블록이나 설명 문장 금지.

{
  "shot_size": "ECU | CU | MCU | MS | MLS | LS | ELS 중 하나",
  "camera_movement": "FIX | PAN | TRACK | ZOOM IN | ZOOM OUT | TILT | HANDHELD 등",
  "characters": ["등장 캐릭터 (이름을 모르면 외형으로 짧게 묘사)"],
  "background": "배경 (한 줄)",
  "action": "액션/연기 (한 줄)",
  "fx": "특수효과 (없으면 null)",
  "notes": "기타 비고 (없으면 null)"
}

샷 사이즈 가이드:
- ECU: 익스트림 클로즈업 (눈/입 등 부분)
- CU: 클로즈업 (얼굴 위주)
- MCU: 미디엄 클로즈업 (가슴 위)
- MS: 미디엄 샷 (허리 위)
- MLS: 미디엄 롱 샷 (무릎 위)
- LS: 롱 샷 (전신)
- ELS: 익스트림 롱 샷 (전신 + 풍경)

카메라 무빙은 첫/중간/끝 프레임의 차이를 보고 판정하세요.
모든 텍스트는 한국어로 작성하세요.
"""


def _build_character_ref_block(refs: Sequence[CharacterRef]) -> str:
    """참조 캐릭터를 프롬프트에 안내하는 한국어 블록."""
    lines = [
        "",
        "=== 등장인물 참조 가이드 (먼저 첨부된 이미지들) ===",
        "이 작품에는 다음 등장인물들이 있습니다. 첫 N장의 이미지가 이 인물들의 디자인입니다 "
        "(아래 분석 대상 프레임은 그 다음입니다):",
    ]
    for i, r in enumerate(refs, start=1):
        line = f"{i}. {r.name}"
        if r.description:
            line += f" — {r.description.strip()}"
        lines.append(line)
    lines.extend([
        "",
        "분석 대상 프레임에 위 인물 중 하나가 보이면 'characters' 필드에 **정확히 그 이름을 그대로**(예: '수진') 넣으세요.",
        "위 목록에 없는 새 인물이면 외형으로 짧게 묘사하세요 (예: '검은 양복 남자').",
        "같은 인물이 여러 샷에 등장할 때 매번 같은 이름을 쓰는 것이 중요합니다.",
        "=== 참조 가이드 끝 ===",
        "",
    ])
    return "\n".join(lines)


class GeminiProvider:
    """Google Gemini Vision으로 샷을 분석."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> None:
        # 지연 import: 패키지 미설치 환경에서도 모듈 로드는 가능하게
        from google import genai

        key = api_key or os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError(
                "GEMINI_API_KEY가 설정되지 않았습니다. .env에 키를 넣거나 환경변수로 지정하세요."
            )
        self._client = genai.Client(api_key=key)
        self._model = model or os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

    def analyze_shot(
        self,
        frame_paths: list[Path],
        dialogue: str | None = None,
        character_refs: Optional[Sequence[CharacterRef]] = None,
    ) -> ShotAnalysis:
        if not frame_paths:
            return ShotAnalysis()

        from google.genai import types

        refs = list(character_refs or [])

        # 프롬프트 구성: 참조 가이드 → 기본 분석 지시 → 대사
        ref_block = _build_character_ref_block(refs) if refs else ""
        prompt = ANALYSIS_PROMPT + ref_block
        if dialogue:
            prompt += f"\n\n참고 대사:\n{dialogue}"

        # contents 구성:
        # [참조 캐릭터 이미지들...] + [분석 대상 프레임들...] + [프롬프트 텍스트]
        contents: list = []
        for r in refs:
            contents.append(
                types.Part.from_bytes(data=r.image_data, mime_type=r.image_mime)
            )
        for p in frame_paths:
            contents.append(Image.open(p))
        contents.append(prompt)

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )

        max_retries = _get_max_retries()
        last_exc: Optional[Exception] = None
        for attempt in range(max_retries + 1):
            try:
                response = self._client.models.generate_content(
                    model=self._model,
                    contents=contents,
                    config=config,
                )
                text = (response.text or "").strip()
                return _parse_analysis(text)
            except Exception as exc:
                last_exc = exc
                if attempt >= max_retries or not _is_rate_limit_error(exc):
                    raise
                # 지수 백오프: 10s, 20s, 40s. 분당 한도 회복까지 대기.
                time.sleep(10 * (2 ** attempt))

        assert last_exc is not None
        raise last_exc


def _parse_analysis(text: str) -> ShotAnalysis:
    """모델 응답에서 JSON을 파싱. 코드블록/잡음에 관대하게."""
    if not text:
        return ShotAnalysis()

    candidate = text
    fence = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.DOTALL)
    if fence:
        candidate = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            candidate = brace.group(0)

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return ShotAnalysis(notes=f"파싱 실패: {text[:200]}")

    chars = data.get("characters")
    if isinstance(chars, str):
        data["characters"] = [chars]
    elif chars is None:
        data["characters"] = []

    try:
        return ShotAnalysis(**data)
    except ValidationError as e:
        return ShotAnalysis(notes=f"검증 실패: {e}")
