"""Configuration from environment variables."""

import logging
import sys
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"

logger = logging.getLogger("app.core.config")


class Settings(BaseSettings):
    """App configuration loaded from env."""

    # Database
    database_url: str = "postgresql://admin:admin@localhost/investment_os"
    enable_db_init: bool = True

    # Redis
    redis_url: str | None = None

    # Celery
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    # API
    api_title: str = "Investment OS API"
    api_version: str = "7.0"
    api_docs_url: str = "/docs"
    api_redoc_url: str = "/redoc"
    port: int = 8001

    # CORS
    cors_origins: list = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8001"]

    # Security
    secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Timezone
    timezone: str = "Asia/Kolkata"

    # Debug
    debug: bool = False
    log_level: str = "INFO"

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        """PostgreSQL is mandatory for all environments."""
        normalized = value.strip()
        if not normalized:
            raise ValueError("DATABASE_URL is required and cannot be empty")
        if not normalized.startswith(("postgresql://", "postgresql+psycopg2://")):
            raise ValueError(
                f"DATABASE_URL must start with 'postgresql://' or 'postgresql+psycopg2://', "
                f"got: {normalized[:40]}"
            )
        return normalized

    model_config = SettingsConfigDict(extra='ignore')


def _load_settings() -> Settings:
    """Instantiate and return the Settings singleton.

    Logs a warning when the .env file is absent. Re-raises any exception from
    Settings() after printing a FATAL line to stderr so startup failures are
    always visible even when the log system isn't configured yet.
    """
    if not _ENV_FILE.exists():
        logger.warning(".env file not found at %s — relying on environment variables", _ENV_FILE)

    try:
        return Settings()
    except Exception as exc:
        print(f"FATAL: failed to load configuration: {exc}", file=sys.stderr)
        raise


settings = _load_settings()
