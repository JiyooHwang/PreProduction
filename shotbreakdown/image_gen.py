"""Imagen 으로 샷 이미지 생성."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


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
    """Imagen 으로 이미지 생성. 실패 시 예외."""
    from google import genai
    from google.genai import types

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY 가 설정되지 않았습니다.")

    client = genai.Client(api_key=key)
    model_name = model or os.environ.get("IMAGEN_MODEL", "imagen-3.0-generate-002")

    response = client.models.generate_images(
        model=model_name,
        prompt=prompt,
        config=types.GenerateImagesConfig(
            number_of_images=1,
            aspect_ratio="16:9",
        ),
    )

    if not response.generated_images:
        raise RuntimeError("이미지 생성 결과가 비어있습니다.")

    img_bytes = response.generated_images[0].image.image_bytes
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(img_bytes)
    return output_path
