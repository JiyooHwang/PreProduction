"""Gemini 비전 provider."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Optional

from PIL import Image
from pydantic import ValidationError

from ..models import ShotAnalysis


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
    ) -> ShotAnalysis:
        if not frame_paths:
            return ShotAnalysis()

        images = [Image.open(p) for p in frame_paths]
        prompt = ANALYSIS_PROMPT
        if dialogue:
            prompt += f"\n\n참고 대사:\n{dialogue}"

        from google.genai import types

        response = self._client.models.generate_content(
            model=self._model,
            contents=[*images, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        text = (response.text or "").strip()
        return _parse_analysis(text)


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
