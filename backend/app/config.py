"""환경설정."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://shotbreakdown:shotbreakdown@localhost:5432/shotbreakdown"

    # 데모 모드: true면 Google OAuth 검증 건너뛰고 단일 demo 계정으로 동작 (팀 데모용)
    demo_mode: bool = False

    # Google OAuth
    google_client_id: str = ""
    allowed_email_domain: str = ""  # 예: company.com (비워두면 모든 도메인 허용)

    # 파일 저장
    storage_dir: Path = Path("/app/storage")
    upload_dir: Path = Path("/app/uploads")

    # 작업 큐
    max_concurrent_jobs: int = 2

    # CORS
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
