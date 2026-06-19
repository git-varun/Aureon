from typing import Any

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Aureon API"
    DEBUG: bool = True

    DATABASE_URL: str
    DATABASE_ECHO: bool = False
    REDIS_URL: str

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_url(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

    FINNHUB_API_KEY: str | None = None
    POLYGON_API_KEY: str | None = None

    SLA_QUOTE_MAX_AGE_SEC: int = 300
    SLA_FUNDAMENTALS_MAX_AGE_SEC: int = 86400
    SLA_NEWS_MAX_AGE_SEC: int = 3600
    SLA_SIGNAL_MAX_AGE_SEC: int = 3600

    # Auth & security settings
    SECRET_KEY: str = "a7ab7603b94dfe3dd6c0fa505548081fc5cda3bc340ac80e0f37aaf2f05623fa"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    GOOGLE_CLIENT_ID: str | None = None

    # CORS Configuration
    CORS_ALLOWED_ORIGINS: list[str] = []
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: list[str] = ["*"]
    CORS_ALLOW_HEADERS: list[str] = ["*"]

    @field_validator("CORS_ALLOWED_ORIGINS", "CORS_ALLOW_METHODS", "CORS_ALLOW_HEADERS", mode="before")
    @classmethod
    def parse_env_list(cls, v: Any) -> list[str]:
        if not v:
            return []
        if isinstance(v, str):
            try:
                import json
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed]
            except json.JSONDecodeError:
                pass
            return [x.strip() for x in v.split(",") if x.strip()]
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []

    @model_validator(mode="after")
    def validate_secrets_and_cors(self) -> "Settings":
        DEFAULT_DEV_SECRET = "a7ab7603b94dfe3dd6c0fa505548081fc5cda3bc340ac80e0f37aaf2f05623fa"
        if not self.DEBUG:
            # Check secret key safety
            if self.SECRET_KEY == DEFAULT_DEV_SECRET:
                raise ValueError("SECRET_KEY must be changed from the default development key in production (DEBUG=False).")
            if not self.SECRET_KEY or len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be a cryptographically secure string of at least 32 characters in production.")

            # Check CORS allowed origins
            if "*" in self.CORS_ALLOWED_ORIGINS:
                raise ValueError("CORS_ALLOWED_ORIGINS cannot contain wildcard '*' in production mode (DEBUG=False).")
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()  # type: ignore

