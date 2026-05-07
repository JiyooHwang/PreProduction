"""시나리오(대본) → 캐릭터/장소/소품/샷/FX/대사 자동 추출."""
from __future__ import annotations

import json
import os
import re
from typing import Optional


SCENARIO_PROMPT = """당신은 영상 프리프로덕션 어시스턴트입니다. 아래 시나리오/대본을 읽고
다음 카테고리로 분류해 추출하세요.

반드시 아래 스키마의 **순수 JSON**만 출력하세요. 마크다운 코드블록 금지.

{
  "characters": [
    {"name": "캐릭터 이름", "description": "외형/성격 묘사", "notes": "역할 등 비고"}
  ],
  "locations": [
    {"name": "장소", "time_of_day": "낮/밤/새벽/일몰 등", "description": "묘사"}
  ],
  "props": [
    {"name": "소품/에셋", "description": "용도/외형"}
  ],
  "fx": [
    {"name": "특수효과 명칭", "description": "어떤 효과인지"}
  ],
  "shots": [
    {
      "scene_number": "씬 번호 (있으면)",
      "shot_size": "ECU | CU | MCU | MS | MLS | LS | ELS",
      "camera_movement": "FIX | PAN | TRACK | ZOOM IN | ZOOM OUT | TILT | HANDHELD",
      "characters": ["등장 캐릭터"],
      "location": "장소",
      "action": "액션/연기 한 줄",
      "dialogue": "대사 (없으면 null)",
      "fx": "특수효과 (없으면 null)",
      "notes": "비고"
    }
  ],
  "dialogues": [
    {"character": "캐릭터", "line": "대사 내용", "scene_number": "씬 번호"}
  ]
}

지침:
- 캐릭터는 중복 제거 후 한 번씩만 (같은 인물이 여러 씬 나와도 한 번만 등록).
- 장소도 마찬가지. 같은 장소가 다른 시간대면 별도 항목으로 분리.
- 샷은 시나리오 흐름대로 추정. 명시 안 된 샷사이즈/카메라무빙은 합리적으로 추정.
- 모든 텍스트는 한국어로.
- 비어있는 카테고리는 빈 배열 [].
"""


class ScenarioBreakdown(dict):
    """시나리오 분석 결과 딕셔너리 (JSON serializable)."""


def analyze_scenario(text: str, api_key: Optional[str] = None, model: Optional[str] = None) -> ScenarioBreakdown:
    """Gemini 로 시나리오를 분석해 카테고리별 결과 반환."""
    from google import genai
    from google.genai import types

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY 가 설정되지 않았습니다.")

    client = genai.Client(api_key=key)
    model_name = model or os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

    prompt = SCENARIO_PROMPT + "\n\n=== 시나리오 ===\n" + text

    response = client.models.generate_content(
        model=model_name,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    raw = (response.text or "").strip()
    return _parse(raw)


def _parse(text: str) -> ScenarioBreakdown:
    if not text:
        return ScenarioBreakdown(_empty())

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
        empty = _empty()
        empty["_parse_error"] = text[:500]
        return ScenarioBreakdown(empty)

    # 누락된 키는 빈 배열로 채움
    for k in ("characters", "locations", "props", "fx", "shots", "dialogues"):
        if k not in data or data[k] is None:
            data[k] = []
    return ScenarioBreakdown(data)


def _empty() -> dict:
    return {
        "characters": [],
        "locations": [],
        "props": [],
        "fx": [],
        "shots": [],
        "dialogues": [],
    }
