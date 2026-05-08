"""Imagen / Gemini 로 샷 이미지 생성."""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional


_RATE_LIMIT_BACKOFFS = (8, 20, 40)  # 초 단위; 합계 ~68초


IMAGE_PROMPT_TEMPLATE = """Create a storyboard sketch for an animation scene.

Shot: {shot_size} {camera}
Characters: {characters}
Location: {location}
Action: {action}
{extra}

Style: clean storyboard sketch, black and white pencil drawing, clear composition,
single panel, professional pre-production storyboard. No text or labels."""


def build_prompt(shot: dict) -> str:
    parts = []
    extra_lines = []
    if shot.get("fx"):
        extra_lines.append(f"Special effects: {shot['fx']}")
    if shot.get("notes"):
        extra_lines.append(f"Notes: {shot['notes']}")

    chars = shot.get("characters") or []
    if isinstance(chars, list):
        chars_str = ", ".join(chars) if chars else "no characters"
    else:
        chars_str = str(chars)

    return IMAGE_PROMPT_TEMPLATE.format(
        shot_size=shot.get("shot_size") or "MS",
        camera=shot.get("camera_movement") or "FIX",
        characters=chars_str,
        location=shot.get("location") or "unspecified",
        action=shot.get("action") or "scene continues",
        extra="\n".join(extra_lines),
    )


def generate_image(
    prompt: str,
    output_path: Path,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> Path:
    """이미지 생성. Imagen 실패 시 Gemini image generation 으로 폴백."""
    from google import genai

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY 가 설정되지 않았습니다.")

    client = genai.Client(api_key=key)

    # 명시 모델이 있으면 그걸로만 시도
    if model:
        return _try_generate(client, model, prompt, output_path)

    # 기본 우선순위: env 의 IMAGEN_MODEL → 폴백 후보들
    primary = os.environ.get("IMAGEN_MODEL")
    candidates = []
    if primary:
        candidates.append(primary)
    # Gemini Developer API 키로 동작 가능한 후보들 (2024~2026 기준)
    # 1) Gemini native image generation (response_modalities=IMAGE)
    # 2) Imagen (대부분 Vertex AI 전용이라 Developer key 로는 404)
    candidates.extend([
        "gemini-2.5-flash-image",
        "gemini-2.0-flash-preview-image-generation",
        "gemini-2.0-flash-exp-image-generation",
        "gemini-2.0-flash-exp",
        "imagen-3.0-generate-002",
        "imagen-3.0-fast-generate-001",
    ])

    errors: list[str] = []
    seen: set = set()
    for m in candidates:
        if m in seen:
            continue
        seen.add(m)
        try:
            return _try_generate_with_backoff(client, m, prompt, output_path)
        except Exception as e:
            errors.append(f"{m}: {str(e)[:160]}")
            continue

    msg = "모든 이미지 생성 모델 호출 실패. 시도 내역:\n" + "\n".join(errors)
    raise RuntimeError(msg)


def _is_rate_limit_error(err: Exception) -> bool:
    s = str(err)
    return "429" in s or "RESOURCE_EXHAUSTED" in s or "rate limit" in s.lower()


def _try_generate_with_backoff(client, model: str, prompt: str, output_path: Path) -> Path:
    """429 만나면 지수 백오프 후 재시도. 다른 에러는 즉시 전파."""
    last_err: Optional[Exception] = None
    for attempt, wait in enumerate((0,) + _RATE_LIMIT_BACKOFFS):
        if wait:
            time.sleep(wait)
        try:
            return _try_generate(client, model, prompt, output_path)
        except Exception as e:
            last_err = e
            if not _is_rate_limit_error(e):
                raise
            # 마지막 시도면 루프 탈출 후 raise
    assert last_err is not None
    raise last_err


def _try_generate(client, model: str, prompt: str, output_path: Path) -> Path:
    """모델 종류에 따라 적절한 API 호출."""
    from google.genai import types

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if model.startswith("imagen"):
        response = client.models.generate_images(
            model=model,
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="16:9",
            ),
        )
        if not response.generated_images:
            raise RuntimeError(f"{model}: 이미지 결과 비어있음")
        img_bytes = response.generated_images[0].image.image_bytes
        output_path.write_bytes(img_bytes)
        return output_path

    # Gemini 계열 (gemini-2.x-flash-image 등)
    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=prompt)],
        ),
    ]
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )
    # 응답에서 inline_data(image/png) 추출
    for cand in (response.candidates or []):
        content = cand.content
        if not content or not content.parts:
            continue
        for part in content.parts:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                output_path.write_bytes(inline.data)
                return output_path
    raise RuntimeError(f"{model}: inline image data 가 응답에 없음")

