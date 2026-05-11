"""Imagen / Gemini 로 샷 이미지 생성."""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence


_RATE_LIMIT_BACKOFFS = (8, 20, 40)  # 초 단위; 합계 ~68초


@dataclass
class ReferenceImage:
    """캐릭터 디자인 등 참조 이미지 1장. Gemini 멀티모달 입력으로 전달."""
    data: bytes
    mime_type: str = "image/png"
    label: Optional[str] = None  # 예: 캐릭터 이름. 프롬프트 보강용


IMAGE_PROMPT_TEMPLATE = """Create a storyboard sketch for an animation scene.

Shot: {shot_size} {camera}
Characters: {characters}
Location: {location}
Action: {action}
{extra}

Style: clean storyboard sketch, black and white pencil drawing, clear composition,
single panel, professional pre-production storyboard. No text or labels."""


def build_prompt(shot: dict) -> str:
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
    reference_images: Optional[Sequence[ReferenceImage]] = None,
) -> Path:
    """이미지 생성. Imagen 실패 시 Gemini image generation 으로 폴백.

    reference_images 가 제공되면 Gemini 멀티모달 입력으로 함께 전달돼
    캐릭터 룩의 일관성을 유지한다 (Imagen 후보는 참조 미지원이라 스킵).
    """
    from google import genai

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY 가 설정되지 않았습니다.")

    client = genai.Client(api_key=key)
    refs = list(reference_images or [])

    # 명시 모델이 있으면 그걸로만 시도
    if model:
        return _try_generate(client, model, prompt, output_path, refs)

    # 기본 우선순위: env 의 IMAGEN_MODEL → 폴백 후보들
    primary = os.environ.get("IMAGEN_MODEL")
    candidates: list[str] = []
    if primary:
        candidates.append(primary)
    candidates.extend([
        "gemini-2.5-flash-image",
        "gemini-2.0-flash-preview-image-generation",
        "gemini-2.0-flash-exp-image-generation",
        "gemini-2.0-flash-exp",
        "imagen-3.0-generate-002",
        "imagen-3.0-fast-generate-001",
    ])

    # 참조 이미지가 있으면 멀티모달 지원하는 Gemini 계열만 시도 (imagen 은 제외)
    if refs:
        candidates = [m for m in candidates if not m.startswith("imagen")]

    errors: list[str] = []
    seen: set = set()
    for m in candidates:
        if m in seen:
            continue
        seen.add(m)
        try:
            return _try_generate_with_backoff(client, m, prompt, output_path, refs)
        except Exception as e:
            errors.append(f"{m}: {str(e)[:160]}")
            continue

    msg = "모든 이미지 생성 모델 호출 실패. 시도 내역:\n" + "\n".join(errors)
    raise RuntimeError(msg)


def _is_rate_limit_error(err: Exception) -> bool:
    s = str(err)
    return "429" in s or "RESOURCE_EXHAUSTED" in s or "rate limit" in s.lower()


def _try_generate_with_backoff(
    client,
    model: str,
    prompt: str,
    output_path: Path,
    refs: list[ReferenceImage],
) -> Path:
    """429 만나면 지수 백오프 후 재시도. 다른 에러는 즉시 전파."""
    last_err: Optional[Exception] = None
    for _, wait in enumerate((0,) + _RATE_LIMIT_BACKOFFS):
        if wait:
            time.sleep(wait)
        try:
            return _try_generate(client, model, prompt, output_path, refs)
        except Exception as e:
            last_err = e
            if not _is_rate_limit_error(e):
                raise
    assert last_err is not None
    raise last_err


def _try_generate(
    client,
    model: str,
    prompt: str,
    output_path: Path,
    refs: list[ReferenceImage],
) -> Path:
    """모델 종류에 따라 적절한 API 호출."""
    from google.genai import types

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if model.startswith("imagen"):
        # Imagen 은 텍스트 프롬프트만. 참조 이미지가 있어도 무시 (호출 측에서 보통 제외됨)
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

    # Gemini 멀티모달: 참조 이미지를 먼저 넣고 그 다음 텍스트 프롬프트
    parts: list = []
    if refs:
        # 어떤 이미지가 누구인지 살짝 라벨링
        labels = [r.label for r in refs if r.label]
        if labels:
            parts.append(
                types.Part.from_text(
                    text=(
                        "Use the following character design references to keep visual consistency. "
                        f"Characters: {', '.join(labels)}."
                    )
                )
            )
        for r in refs:
            parts.append(types.Part.from_bytes(data=r.data, mime_type=r.mime_type))
    parts.append(types.Part.from_text(text=prompt))

    contents = [types.Content(role="user", parts=parts)]
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )
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
