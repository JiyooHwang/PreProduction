"""SQLAlchemy 세션."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


# Railway 등 일부 호스팅이 postgres:// 형태로 주는 경우 SQLAlchemy 호환 형식으로 변환
_db_url = settings.database_url
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(_db_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """앱 기동 시 호출. 작은 앱이라 alembic 대신 create_all 사용."""
    from . import models  # noqa: F401  ORM import side-effect

    Base.metadata.create_all(bind=engine)
    _apply_lightweight_migrations()


def _apply_lightweight_migrations() -> None:
    """기존 DB 에 새 컬럼 추가 (idempotent). alembic 도입 전 임시 처리."""
    from sqlalchemy import text

    statements = [
        # 시나리오 스토리보드 관련
        "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS storyboard_status VARCHAR(32)",
        "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS storyboard_progress_done INTEGER DEFAULT 0",
        "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS storyboard_progress_total INTEGER DEFAULT 0",
        "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS storyboard_error TEXT",
        # 캐릭터 라이브러리 인덱스 (create_all 이 인덱스도 만들지만 안전망)
        "CREATE INDEX IF NOT EXISTS ix_character_designs_owner_id ON character_designs(owner_id)",
        "CREATE INDEX IF NOT EXISTS ix_character_designs_name ON character_designs(name)",
        # 샷 시퀀스/샷 번호 (production code, 4자리 표시)
        "ALTER TABLE shots ADD COLUMN IF NOT EXISTS sequence_number INTEGER",
        "ALTER TABLE shots ADD COLUMN IF NOT EXISTS shot_number INTEGER",
        # 샷 브렉다운 강화 필드
        "ALTER TABLE shots ADD COLUMN IF NOT EXISTS camera_angle VARCHAR(64)",
        "ALTER TABLE shots ADD COLUMN IF NOT EXISTS lens_mm VARCHAR(32)",
        "ALTER TABLE shots ADD COLUMN IF NOT EXISTS time_of_day VARCHAR(32)",
        "ALTER TABLE shots ADD COLUMN IF NOT EXISTS lighting TEXT",
        "ALTER TABLE shots ADD COLUMN IF NOT EXISTS props_used JSON",
        "ALTER TABLE shots ADD COLUMN IF NOT EXISTS fx_used JSON",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception:
                # 테이블이 아직 없거나 이미 컬럼이 있는 경우 무시
                pass
