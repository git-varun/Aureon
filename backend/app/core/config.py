from typing import Any

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Aureon API"
    DEBUG: bool = True

    DATABASE_URL: str
    DATABASE_ECHO: bool = False
    REDIS_URL: str

    # Test isolation: when TESTING=true (set by tests/conftest.py before any app import),
    # DATABASE_URL is forced to TEST_DATABASE_URL. There is no fallback — if TEST_DATABASE_URL
    # is unset while TESTING=true, startup fails loudly rather than risking the dev/prod database.
    TESTING: bool = False
    TEST_DATABASE_URL: str | None = None

    @field_validator("DATABASE_URL", "TEST_DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_url(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

    @model_validator(mode="after")
    def select_test_database(self) -> "Settings":
        if self.TESTING:
            if not self.TEST_DATABASE_URL:
                raise ValueError(
                    "TESTING=true but TEST_DATABASE_URL is not set. Refusing to fall back to "
                    "DATABASE_URL — set TEST_DATABASE_URL to a dedicated test database."
                )
            self.DATABASE_URL = self.TEST_DATABASE_URL
        return self

    FINNHUB_API_KEY: str | None = None
    POLYGON_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    GROQ_API_KEY: str | None = None

    API_PORT: int | None = None
    FRONTEND_PORT: int | None = None

    SLA_QUOTE_MAX_AGE_SEC: int = 300
    SLA_FUNDAMENTALS_MAX_AGE_SEC: int = 86400
    SLA_NEWS_MAX_AGE_SEC: int = 3600
    SLA_SIGNAL_MAX_AGE_SEC: int = 3600

    # Auth & security settings
    SECRET_KEY: str = "a7ab7603b94dfe3dd6c0fa505548081fc5cda3bc340ac80e0f37aaf2f05623fa"

    # Public frontend URL — where the backend sends the browser AFTER it has already
    # completed the Zerodha token exchange, i.e. {FRONTEND_BASE_URL}/profile?zerodha=connected|error
    # (see core/api/config.py's oauth/callback route). This is NOT the redirect_uri to
    # register in Zerodha's Kite Developer Console — that must be the backend's own
    # callback endpoint (.../api/v1/config/providers/zerodha/oauth/callback), since Kite
    # redirects the browser there directly to deliver the request_token.
    FRONTEND_BASE_URL: str = "http://localhost:3000"

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

