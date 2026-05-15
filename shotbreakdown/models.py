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


# 등급 정의 (기본 임계값, 사용자 설정 시 override):
# S  = 주인공: main 카테고리 또는 전체 샷의 70%+ 등장
# AA = 자주 등장하는 조연: 30~70% 등장 (이름 있는 주요 인물)
# A  = 조연: 5~30% 등장 (이름 있고 대사 있음)
# C  = 엑스트라: extra 카테고리 또는 5% 미만 등장
GRADE_S = "S"
GRADE_AA = "AA"
GRADE_A = "A"
GRADE_C = "C"

DEFAULT_GRADE_THRESHOLDS = {"s": 0.70, "aa": 0.30, "a": 0.05}


def _normalize_thresholds(thresholds: dict | None) -> dict:
    """임계값 dict 검증 + 기본값 보강. 0~1 범위, S>=AA>=A 순."""
    out = dict(DEFAULT_GRADE_THRESHOLDS)
    if isinstance(thresholds, dict):
        for k in ("s", "aa", "a"):
            v = thresholds.get(k)
            if isinstance(v, (int, float)) and 0 < v < 1:
                out[k] = float(v)
    # 순서 보장 (사용자가 이상하게 넣어도 안전하게)
    s, aa, a = out["s"], out["aa"], out["a"]
    if not (s >= aa >= a):
        out["s"], out["aa"], out["a"] = sorted((s, aa, a), reverse=True)
    return out


def _compute_one_grade(category: str | None, ratio: float, thresholds: dict) -> str:
    """카테고리 + 등장 비율 + 임계값으로 단일 등급 결정."""
    cat = (category or "").lower().strip()
    if cat == "main":
        return GRADE_S
    if cat == "extra":
        return GRADE_C
    if ratio >= thresholds["s"]:
        return GRADE_S
    if ratio >= thresholds["aa"]:
        return GRADE_AA
    if ratio >= thresholds["a"]:
        return GRADE_A
    return GRADE_C


def compute_character_grades(
    characters: list[dict],
    total_shots: int,
    *,
    thresholds: dict | None = None,
) -> None:
    """캐릭터 리스트에 grade 필드를 자동 채움 (in-place).

    이미 사용자가 grade 를 지정했다면 (grade_locked=True) 그대로 둠.
    thresholds: {"s": 0.7, "aa": 0.3, "a": 0.05} 형식. 미지정 시 기본값.
    """
    if not characters:
        return
    t = _normalize_thresholds(thresholds)
    total = max(total_shots, 1)
    for c in characters:
        if c.get("grade_locked"):
            continue  # 수동 지정된 등급은 보존
        count = int(c.get("appearance_count") or 0)
        ratio = count / total
        c["grade"] = _compute_one_grade(c.get("category"), ratio, t)


def compute_asset_grades(
    assets: list[dict],
    total_shots: int,
    *,
    thresholds: dict | None = None,
    main_categories: tuple[str, ...] = ("key_prop",),
    extra_categories: tuple[str, ...] = ("minor_prop",),
) -> None:
    """소품/장소/FX 등 캐릭터 외 에셋의 grade 자동 채움.

    main_categories → S 또는 등장 비율 기반.
    extra_categories → C.
    그 외엔 등장 비율로 분류.
    """
    if not assets:
        return
    t = _normalize_thresholds(thresholds)
    total = max(total_shots, 1)
    for a in assets:
        if a.get("grade_locked"):
            continue
        cat = (a.get("category") or "").lower().strip()
        count = int(a.get("appearance_count") or 0)
        ratio = count / total
        if cat in main_categories:
            a["grade"] = _compute_one_grade(
                "main" if ratio >= t["a"] else "supporting", ratio, t
            )
            if ratio < t["a"]:
                a["grade"] = GRADE_A  # key 인데 1~2번만 → A
        elif cat in extra_categories:
            a["grade"] = GRADE_C
        else:
            a["grade"] = _compute_one_grade(None, ratio, t)


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
