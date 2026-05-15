"""샷 데이터 모델."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field


class ShotAnalysis(BaseModel):
    """비전 모델이 채우는 샷 분석 결과."""

    shot_size: Optional[str] = Field(None, description="ECU/CU/MCU/MS/MLS/LS/ELS")
    camera_movement: Optional[str] = Field(None, description="FIX/PAN/TRACK/ZOOM/TILT 등")
    camera_angle: Optional[str] = Field(None, description="EYE LEVEL/HIGH/LOW/BIRD'S EYE 등")
    lens_mm: Optional[str] = Field(None, description="wide / normal / tele 추정")
    time_of_day: Optional[str] = Field(None, description="dawn / morning / day / sunset / evening / night")
    lighting: Optional[str] = Field(None, description="조명 무드 (자유 텍스트)")
    characters: list[str] = Field(default_factory=list)
    background: Optional[str] = None
    props_used: list[str] = Field(default_factory=list)
    fx_used: list[str] = Field(default_factory=list)
    action: Optional[str] = None
    fx: Optional[str] = None
    notes: Optional[str] = None


class Shot(BaseModel):
    """단일 샷(컷) 정보."""

    index: int
    start_seconds: float
    end_seconds: float
    fps: float
    start_tc: str
    end_tc: str
    duration_seconds: float
    duration_frames: int
    thumbnail_path: Optional[Path] = None
    frame_paths: list[Path] = Field(default_factory=list)
    dialogue: Optional[str] = None
    analysis: Optional[ShotAnalysis] = None
    # 시퀀스/샷 번호 (production code, 4자리 표시, 10단위 증가)
    sequence_number: Optional[int] = None
    shot_number: Optional[int] = None


def format_shot_code(sequence_number: Optional[int], shot_number: Optional[int]) -> str:
    """시퀀스/샷 번호를 'S0010_C0010' 형식으로 포맷.

    None 이면 빈 문자열 반환.
    """
    if sequence_number is None or shot_number is None:
        return ""
    return f"S{sequence_number:04d}_C{shot_number:04d}"


def compute_asset_usage(
    assets: list[dict],
    shots: list[dict],
    *,
    shot_field: str,
    name_key: str = "name",
) -> None:
    """에셋 리스트에 등장 빈도와 등장 샷 코드 리스트를 in-place 로 채움.

    각 에셋 dict 에 다음 필드 추가:
    - appearance_count: int  (등장한 샷 수)
    - shot_codes: list[str]  ['S0010_C0010', 'S0010_C0020', ...]

    shot_field: 샷 dict 에서 이름들을 가져올 키.
      - 'characters' (list of strings)
      - 'location' (string, 단일)
      - 'props_used' (list)
      - 'fx_used' (list)
    """
    if not assets:
        return

    # 이름(lower) → 등장 샷 코드 리스트
    usage: dict[str, list[str]] = {}
    for sh in shots:
        seq = sh.get("sequence_number")
        sn = sh.get("shot_number")
        code = (
            f"S{seq:04d}_C{sn:04d}"
            if isinstance(seq, int) and isinstance(sn, int)
            else ""
        )
        if not code:
            continue
        val = sh.get(shot_field)
        if val is None:
            continue
        names: list[str] = []
        if isinstance(val, list):
            names = [str(x).strip() for x in val if x]
        elif isinstance(val, str) and val.strip():
            names = [val.strip()]
        for n in names:
            usage.setdefault(n.lower(), []).append(code)

    for asset in assets:
        name = str(asset.get(name_key) or "").strip()
        codes = usage.get(name.lower(), [])
        asset["appearance_count"] = len(codes)
        asset["shot_codes"] = codes


def assign_shot_codes(
    items: list,
    *,
    scene_key: str = "scene_number",
    increment: int = 10,
    start: int = 10,
) -> None:
    """샷 리스트에 시퀀스/샷 번호를 자동 채번.

    - `scene_key` 필드가 있는 dict 리스트면 같은 scene_number → 같은 sequence_number
      (scene_number * increment = sequence_number)
    - 그 외에는 모든 샷을 sequence 10 에 모두 넣고, 샷 번호만 10씩 증가
    - 각 시퀀스 내 샷 번호는 등장 순서대로 10, 20, 30, ...

    items 가 ORM 객체 리스트면 attribute 로, dict 리스트면 key 로 접근/할당.
    수정은 in-place. 반환 없음.
    """
    if not items:
        return

    is_dict = isinstance(items[0], dict)

    def get(o, k, default=None):
        return o.get(k, default) if is_dict else getattr(o, k, default)

    def set_(o, k, v):
        if is_dict:
            o[k] = v
        else:
            setattr(o, k, v)

    # scene_number 별로 그룹핑 (없으면 None)
    scene_to_shots: dict = {}
    for it in items:
        sn = get(it, scene_key)
        # 정수형 변환 (string 으로 올 수도 있음)
        try:
            sn_int = int(sn) if sn is not None and str(sn).strip() != "" else None
        except (TypeError, ValueError):
            sn_int = None
        scene_to_shots.setdefault(sn_int, []).append(it)

    # scene_number 가 None 인 그룹만 있다면 모두 sequence 10 에 배치
    if list(scene_to_shots.keys()) == [None]:
        for i, it in enumerate(items, start=1):
            set_(it, "sequence_number", start)
            set_(it, "shot_number", i * increment)
        return

    # scene_number 가 있는 그룹은 그 번호 * increment 를 sequence_number 로
    for scene_num, shots in scene_to_shots.items():
        if scene_num is None:
            seq = start  # scene 미정 그룹은 sequence 10
        else:
            seq = max(scene_num * increment, start)
        for i, it in enumerate(shots, start=1):
            set_(it, "sequence_number", seq)
            set_(it, "shot_number", i * increment)
