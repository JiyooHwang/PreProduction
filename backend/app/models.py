"""SQLAlchemy ORM 모델."""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    picture: Mapped[str | None] = mapped_column(String(512), nullable=True)
    gemini_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    projects: Mapped[list["Project"]] = relationship(back_populates="owner")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    owner: Mapped[User] = relationship(back_populates="projects")
    jobs: Mapped[list["Job"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    shots: Mapped[list["Shot"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    video_filename: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(32), default=JobStatus.PENDING.value)
    progress_done: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)
    progress_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    threshold: Mapped[float] = mapped_column(Float, default=27.0)
    skip_analysis: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project] = relationship(back_populates="jobs")


class Shot(Base):
    __tablename__ = "shots"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    start_seconds: Mapped[float] = mapped_column(Float)
    end_seconds: Mapped[float] = mapped_column(Float)
    fps: Mapped[float] = mapped_column(Float)
    start_tc: Mapped[str] = mapped_column(String(32))
    end_tc: Mapped[str] = mapped_column(String(32))
    duration_seconds: Mapped[float] = mapped_column(Float)
    duration_frames: Mapped[int] = mapped_column(Integer)
    thumbnail_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    shot_size: Mapped[str | None] = mapped_column(String(16), nullable=True)
    camera_movement: Mapped[str | None] = mapped_column(String(64), nullable=True)
    characters: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    background: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[str | None] = mapped_column(Text, nullable=True)
    dialogue: Mapped[str | None] = mapped_column(Text, nullable=True)
    fx: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped[Project] = relationship(back_populates="shots")


class Scenario(Base):
    """시나리오(대본) 분석 결과를 저장."""

    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    source_text: Mapped[str] = mapped_column(Text)  # 원본 시나리오 텍스트
    status: Mapped[str] = mapped_column(String(32), default=JobStatus.PENDING.value)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 분석 결과 (Gemini 가 채움)
    characters: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{name, description, notes}]
    locations: Mapped[list | None] = mapped_column(JSON, nullable=True)   # [{name, time_of_day, description}]
    props: Mapped[list | None] = mapped_column(JSON, nullable=True)       # [{name, description}]
    fx: Mapped[list | None] = mapped_column(JSON, nullable=True)          # [{name, description}]
    shots: Mapped[list | None] = mapped_column(JSON, nullable=True)       # [{shot_size, camera, action, ...}]
    dialogues: Mapped[list | None] = mapped_column(JSON, nullable=True)   # [{character, line}]

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
