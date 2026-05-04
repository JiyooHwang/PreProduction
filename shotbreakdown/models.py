"""샷 데이터 모델."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field


class ShotAnalysis(BaseModel):
    """비전 모델이 채우는 샷 분석 결과."""

    shot_size: Optional[str] = Field(None, description="ECU/CU/MCU/MS/MLS/LS/ELS")
    camera_movement: Optional[str] = Field(None, description="FIX/PAN/TRACK/ZOOM/TILT 등")
    characters: list[str] = Field(default_factory=list)
    background: Optional[str] = None
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
