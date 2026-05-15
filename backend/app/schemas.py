"""Pydantic 입출력 스키마."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    picture: Optional[str] = None
    has_gemini_key: bool = False


class GeminiKeyIn(BaseModel):
    api_key: str


class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: Optional[str] = None
    created_at: datetime
    owner_email: Optional[str] = None
    shot_count: int = 0
    latest_job_status: Optional[str] = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    video_filename: str
    status: str
    progress_done: int
    progress_total: int
    progress_message: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None


class ShotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    index: int
    sequence_number: Optional[int] = None
    shot_number: Optional[int] = None
    start_tc: str
    end_tc: str
    duration_seconds: float
    duration_frames: int
    thumbnail_path: Optional[str] = None
    shot_size: Optional[str] = None
    camera_movement: Optional[str] = None
    camera_angle: Optional[str] = None
    lens_mm: Optional[str] = None
    time_of_day: Optional[str] = None
    lighting: Optional[str] = None
    characters: Optional[list[str]] = None
    background: Optional[str] = None
    props_used: Optional[list[str]] = None
    fx_used: Optional[list[str]] = None
    action: Optional[str] = None
    dialogue: Optional[str] = None
    fx: Optional[str] = None
    notes: Optional[str] = None


class ShotUpdate(BaseModel):
    sequence_number: Optional[int] = None
    shot_number: Optional[int] = None
    shot_size: Optional[str] = None
    camera_movement: Optional[str] = None
    camera_angle: Optional[str] = None
    lens_mm: Optional[str] = None
    time_of_day: Optional[str] = None
    lighting: Optional[str] = None
    characters: Optional[list[str]] = None
    background: Optional[str] = None
    props_used: Optional[list[str]] = None
    fx_used: Optional[list[str]] = None
    action: Optional[str] = None
    dialogue: Optional[str] = None
    fx: Optional[str] = None
    notes: Optional[str] = None


class ScenarioCreate(BaseModel):
    title: str
    source_text: str


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    status: str
    error: Optional[str] = None
    characters: Optional[list] = None
    locations: Optional[list] = None
    props: Optional[list] = None
    fx: Optional[list] = None
    shots: Optional[list] = None
    dialogues: Optional[list] = None
    storyboard_status: Optional[str] = None
    storyboard_progress_done: int = 0
    storyboard_progress_total: int = 0
    storyboard_error: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None


class ScenarioListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    status: str
    created_at: datetime
    finished_at: Optional[datetime] = None


class CharacterDesignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    image_mime: str = "image/png"
    created_at: datetime
    updated_at: datetime


class CharacterDesignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ShotRegenerateIn(BaseModel):
    """샷 재생성 요청. prompt 가 비어있으면 기본 프롬프트로 재생성."""
    prompt: Optional[str] = None
    # 캐릭터 라이브러리 참조 이미지를 사용할지. 기본 True.
    # 카메라 앵글을 바꾸고 싶을 때는 False 로 보내면 참조 영향 없이 시점 변경이 잘 됨.
    use_references: bool = True
