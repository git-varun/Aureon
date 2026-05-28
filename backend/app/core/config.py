"""Configuration from environment variables."""

import logging
import sys
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Keep env discovery anchored at repository root so backend commands work both
# from project root and from `backend/` without duplicating env files.
_ENV_FILE = Path(__file__).resolve().parent.parent.parent.parent / ".env"
_ENV_FILE_STR = str(_ENV_FILE) if _ENV_FILE.exists() else None

logger = logging.getLogger("app.core.config")


class Settings(BaseSettings):
    """App configuration loaded from env."""

    # Database
    database_url: str
    enable_db_init: bool = True

    # Redis
    redis_url: str | None = None

    # Celery
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    # API
    api_title: str = "Aureon API"
    api_version: str = "7.0"
    enable_api_docs: bool = False
    port: int = 8001

    # CORS
    cors_origins: list = ["http://localhost:3000", "http://localhost:8001"]

    # Security — SECRET_KEY is required; no default to prevent accidental insecure deploys
    secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Timezone
    timezone: str = "Asia/Kolkata"

    # Debug — safe production defaults
    debug: bool = False
    log_level: str = "INFO"

    # Frontend URL — used for magic link construction; defaults to local dev
    frontend_url: str = "http://localhost:3000"

    # Email (SMTP) — all optional; if unset, OTPs/links are printed to logs (dev mode)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@aureon.app"

    # SMS providers — Fast2SMS takes priority over Textbelt when both are set.
    # FAST2SMS_API_KEY: from fast2sms.com dashboard (works with Indian numbers)
    # TEXTBELT_API_KEY: "textbelt" = free tier (1/day, US only); paid key for international
    # If neither is set, OTP is printed to logs (dev mode).
    fast2sms_api_key: str | None = None
    textbelt_url: str = "https://textbelt.com/text"
    textbelt_api_key: str | None = None

    # Google OAuth — optional; if unset, Google auth raises ConfigError
    google_client_id: str | None = None

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        if len(value.encode()) < 32:
            raise ValueError(
                f"SECRET_KEY must be at least 32 bytes (got {len(value.encode())}). "
                "Generate one with: python3 -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return value

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.startswith(("postgresql://", "postgresql+psycopg2://")):
            raise ValueError(
                f"DATABASE_URL must use postgresql:// or postgresql+psycopg2://, "
                f"got: {normalized[:40]}"
            )
        return normalized

    model_config = SettingsConfigDict(extra='ignore', env_file=_ENV_FILE_STR, env_file_encoding='utf-8')


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
