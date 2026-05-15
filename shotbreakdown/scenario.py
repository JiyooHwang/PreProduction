"""시나리오(대본) → 캐릭터/장소/소품/샷/FX/대사 자동 추출."""
from __future__ import annotations

import json
import os
import re
from typing import Optional


SCENARIO_PROMPT = """당신은 영상 프리프로덕션 어시스턴트입니다. 아래 시나리오/대본을 읽고
다음 카테고리로 분류해 추출하세요. 에셋과 샷 정보를 가능한 상세하게 채워주세요.

반드시 아래 스키마의 **순수 JSON**만 출력하세요. 마크다운 코드블록 금지.

{
  "characters": [
    {
      "name": "캐릭터 이름",
      "category": "main | supporting | extra",
      "description": "외형/성격 묘사 (구체적으로: 나이대, 헤어, 의상 등)",
      "notes": "역할/관계 등 비고"
    }
  ],
  "locations": [
    {
      "name": "장소",
      "category": "indoor | outdoor | abstract",
      "time_of_day": "dawn | morning | day | sunset | evening | night",
      "description": "분위기/특징 묘사 (실내 가구, 야외 풍경 등 구체적으로)"
    }
  ],
  "props": [
    {
      "name": "소품/에셋",
      "category": "key_prop | minor_prop",
      "description": "용도/외형/크기"
    }
  ],
  "fx": [
    {
      "name": "특수효과 명칭",
      "category": "vfx | sfx | practical",
      "description": "어떤 효과인지, 어떻게 보일지"
    }
  ],
  "shots": [
    {
      "scene_number": 1,
      "shot_size": "ECU | CU | MCU | MS | MLS | LS | ELS",
      "camera_movement": "FIX | PAN | TRACK | ZOOM IN | ZOOM OUT | TILT | HANDHELD | DOLLY IN | DOLLY OUT",
      "camera_angle": "EYE LEVEL | HIGH ANGLE | LOW ANGLE | BIRD'S EYE | WORM'S EYE | DUTCH",
      "lens_mm": "wide(24mm) | normal(50mm) | tele(85mm+) 중 하나, 추정 가능하면 구체 mm",
      "time_of_day": "dawn | morning | day | sunset | evening | night",
      "lighting": "조명 무드 (예: bright daylight, low-key dramatic, neon, candlelight, soft ambient)",
      "characters": ["등장 캐릭터 이름"],
      "location": "장소",
      "props_used": ["이 샷에서 사용되는 소품"],
      "fx_used": ["이 샷에 들어가는 FX"],
      "action": "액션/연기 한 줄",
      "dialogue": "대사 (없으면 null)",
      "fx": "특수효과 짧게 (호환용; fx_used 와 중복 OK)",
      "notes": "촬영/연출 비고"
    }
  ],
  "dialogues": [
    {"character": "캐릭터", "line": "대사 내용", "scene_number": 1}
  ]
}

지침:
- scene_number 는 정수로 출력 (1, 2, 3...). 명시 없으면 시나리오 흐름 순서대로 부여.
- 에셋(캐릭터/장소/소품/FX)은 중복 제거 후 한 번씩만 등록. 같은 장소도 시간대 다르면 별도.
- 캐릭터 category 분류 기준:
    main: 시나리오에서 주인공/이야기 중심. 통상 1~2명.
    supporting: 이름 있는 조연. 여러 씬 등장.
    extra: 이름 없는 군중, 단역. 짧게 나옴.
- 샷 정보는 시나리오 흐름과 캐릭터 감정/액션에서 합리적으로 추정.
  - 명시되지 않은 카메라/렌즈/조명도 분위기에 맞춰 자연스럽게 추정 (예: 격투 장면 → low angle + tele lens, 회상 → soft warm lighting).
- props_used, fx_used 는 빈 배열 가능.
- 모든 텍스트는 한국어로 (단, category/time_of_day 같은 enum 값은 영문 그대로).
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
