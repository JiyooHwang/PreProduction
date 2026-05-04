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
