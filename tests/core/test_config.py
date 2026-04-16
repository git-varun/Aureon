"""Tests for app/core/config.py — Settings loading, validation, and env-var overrides."""
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from pydantic_settings import SettingsConfigDict

from app.core.config import Settings, _load_settings


# ── Isolation helper ──────────────────────────────────────────────────────────

class _IsolatedSettings(Settings):
    """Settings subclass with .env loading disabled.

    Use this in tests that drive behaviour through environment variables so
    that any real .env file on disk cannot interfere with the assertions.
    """

    model_config = SettingsConfigDict(
        env_file=None,
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )


# Minimal valid DATABASE_URL used throughout
_VALID_DB_URL = "postgresql://user:pass@localhost/testdb"


# ── DATABASE_URL field_validator ──────────────────────────────────────────────

class TestDatabaseUrlValidator:
    """Exercises the validate_database_url @field_validator directly."""

    def test_valid_postgresql_scheme(self):
        s = Settings(database_url="postgresql://user:pass@localhost/mydb")
        assert s.database_url == "postgresql://user:pass@localhost/mydb"

    def test_valid_psycopg2_scheme(self):
        s = Settings(database_url="postgresql+psycopg2://user:pass@localhost/mydb")
        assert s.database_url.startswith("postgresql+psycopg2://")

    def test_strips_leading_and_trailing_whitespace(self):
        s = Settings(database_url="  postgresql://user:pass@localhost/mydb  ")
        assert s.database_url == "postgresql://user:pass@localhost/mydb"

    def test_empty_string_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(database_url="")
        assert "required and cannot be empty" in str(exc_info.value)

    def test_whitespace_only_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(database_url="   ")
        assert "required and cannot be empty" in str(exc_info.value)

    def test_sqlite_scheme_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(database_url="sqlite:///./local.db")
        assert "must start with" in str(exc_info.value)

    def test_mysql_scheme_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(database_url="mysql://user:pass@localhost/mydb")
        assert "must start with" in str(exc_info.value)

    def test_mssql_scheme_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(database_url="mssql+pyodbc://user:pass@server/mydb")
        assert "must start with" in str(exc_info.value)

    def test_partial_prefix_raises(self):
        """'post' is not a valid prefix."""
        with pytest.raises(ValidationError):
            Settings(database_url="post://user:pass@localhost/db")

    def test_error_message_includes_truncated_url(self):
        """Error message shows (up to 40 chars of) the bad value for diagnostics."""
        bad_url = "sqlite:///./local.db"
        with pytest.raises(ValidationError) as exc_info:
            Settings(database_url=bad_url)
        assert "sqlite" in str(exc_info.value)

    def test_psycopg2_with_query_params(self):
        url = "postgresql+psycopg2://user:pass@localhost:5432/mydb?sslmode=require"
        s = Settings(database_url=url)
        assert s.database_url == url


# ── Default field values ──────────────────────────────────────────────────────

class TestSettingsDefaults:
    """Verify that all declared defaults are correct when no env overrides are present."""

    @pytest.fixture(autouse=True)
    def settings(self):
        # Use _IsolatedSettings so the real .env file on disk cannot override
        # defaults for API-key fields (gemini_api_key, telegram_bot_token, etc.)
        self.s = _IsolatedSettings(database_url=_VALID_DB_URL)

    def test_enable_db_init_default(self):
        assert self.s.enable_db_init is True

    def test_redis_url_default_is_none(self):
        assert self.s.redis_url is None

    def test_celery_broker_url_default_is_none(self):
        assert self.s.celery_broker_url is None

    def test_celery_result_backend_default_is_none(self):
        assert self.s.celery_result_backend is None

    def test_api_title_default(self):
        assert self.s.api_title == "Investment OS API"

    def test_api_version_default(self):
        assert self.s.api_version == "7.0"

    def test_api_docs_url_default(self):
        assert self.s.api_docs_url == "/docs"

    def test_api_redoc_url_default(self):
        assert self.s.api_redoc_url == "/redoc"

    def test_port_default(self):
        assert self.s.port == 8001

    def test_cors_origins_is_list(self):
        assert isinstance(self.s.cors_origins, list)

    def test_cors_origins_contains_vite_dev_server(self):
        assert "http://localhost:5173" in self.s.cors_origins

    def test_cors_origins_contains_frontend_default(self):
        assert "http://localhost:3000" in self.s.cors_origins

    def test_gemini_api_key_default_is_empty(self):
        assert self.s.gemini_api_key == ""

    def test_telegram_bot_token_default_is_empty(self):
        assert self.s.telegram_bot_token == ""

    def test_telegram_chat_id_default_is_empty(self):
        assert self.s.telegram_chat_id == ""

    def test_binance_api_key_default_is_empty(self):
        assert self.s.binance_api_key == ""

    def test_binance_api_secret_default_is_empty(self):
        assert self.s.binance_api_secret == ""

    def test_zerodha_api_key_default_is_empty(self):
        assert self.s.zerodha_api_key == ""

    def test_zerodha_api_secret_default_is_empty(self):
        assert self.s.zerodha_api_secret == ""

    def test_zerodha_access_token_default_is_empty(self):
        assert self.s.zerodha_access_token == ""

    def test_groww_email_default_is_empty(self):
        assert self.s.groww_email == ""

    def test_groww_password_default_is_empty(self):
        assert self.s.groww_password == ""

    def test_finnhub_api_key_default_is_empty(self):
        assert self.s.finnhub_api_key == ""

    def test_secret_key_default(self):
        assert self.s.secret_key == "change-me"

    def test_jwt_algorithm_default(self):
        assert self.s.jwt_algorithm == "HS256"

    def test_access_token_expire_minutes_default(self):
        assert self.s.access_token_expire_minutes == 60

    def test_timezone_default(self):
        assert self.s.timezone == "Asia/Kolkata"

    def test_debug_default_is_false(self):
        assert self.s.debug is False

    def test_log_level_default(self):
        assert self.s.log_level == "INFO"


# ── Environment variable overrides ────────────────────────────────────────────

class TestEnvVarOverrides:
    """Environment variables override defaults (uses _IsolatedSettings so .env is absent)."""

    def test_database_url_from_env(self, monkeypatch):
        url = "postgresql://env_user:env_pass@db-host/env_db"
        monkeypatch.setenv("DATABASE_URL", url)
        s = _IsolatedSettings()
        assert s.database_url == url

    def test_port_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", _VALID_DB_URL)
        monkeypatch.setenv("PORT", "9999")
        s = _IsolatedSettings()
        assert s.port == 9999

    def test_debug_true_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", _VALID_DB_URL)
        monkeypatch.setenv("DEBUG", "true")
        s = _IsolatedSettings()
        assert s.debug is True

    def test_debug_false_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", _VALID_DB_URL)
        monkeypatch.setenv("DEBUG", "false")
        s = _IsolatedSettings()
        assert s.debug is False

    def test_log_level_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", _VALID_DB_URL)
        monkeypatch.setenv("LOG_LEVEL", "DEBUG")
        s = _IsolatedSettings()
        assert s.log_level == "DEBUG"

    def test_secret_key_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", _VALID_DB_URL)
        monkeypatch.setenv("SECRET_KEY", "super-secret-test-key")
        s = _IsolatedSettings()
        assert s.secret_key == "super-secret-test-key"

    def test_access_token_expire_minutes_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", _VALID_DB_URL)
        monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120")
        s = _IsolatedSettings()
        assert s.access_token_expire_minutes == 120

    def test_redis_url_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", _VALID_DB_URL)
        monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
        s = _IsolatedSettings()
        assert s.redis_url == "redis://localhost:6379/0"

    def test_gemini_api_key_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", _VALID_DB_URL)
        monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
        s = _IsolatedSettings()
        assert s.gemini_api_key == "test-gemini-key"

    def test_init_value_overrides_env_var(self, monkeypatch):
        """Explicit constructor argument beats env var (pydantic-settings priority)."""
        monkeypatch.setenv("PORT", "9999")
        s = _IsolatedSettings(database_url=_VALID_DB_URL, port=1234)
        assert s.port == 1234

    def test_invalid_database_url_from_env_raises(self, monkeypatch):
        """ValidationError is raised even when a bad URL comes from an env var."""
        monkeypatch.setenv("DATABASE_URL", "sqlite:///./env.db")
        with pytest.raises(ValidationError):
            _IsolatedSettings()


# ── _load_settings() behaviour ────────────────────────────────────────────────

class TestLoadSettings:
    """Tests for the _load_settings() helper (startup logic, error propagation)."""

    def test_returns_settings_instance(self):
        """_load_settings() with a valid env should return a Settings object."""
        with patch("app.core.config.Settings", return_value=Settings(database_url=_VALID_DB_URL)):
            result = _load_settings()
        assert isinstance(result, Settings)

    def test_propagates_validation_error(self):
        """ValidationError from Settings() must not be swallowed — it must re-raise."""
        exc = ValidationError.from_exception_data(
            title="Settings",
            input_type="python",
            line_errors=[],
        )
        with patch("app.core.config.Settings", side_effect=exc):
            with pytest.raises(ValidationError):
                _load_settings()

    def test_propagates_arbitrary_exception(self):
        """Any unexpected exception from Settings() must also re-raise."""
        with patch("app.core.config.Settings", side_effect=RuntimeError("boom")):
            with pytest.raises(RuntimeError, match="boom"):
                _load_settings()

    def test_logs_warning_when_env_file_missing(self, tmp_path, caplog):
        """A warning is emitted when the .env file does not exist."""
        import logging

        missing_path = tmp_path / "nonexistent.env"
        # Patch _ENV_FILE so the code sees it as non-existent.
        with patch("app.core.config._ENV_FILE", missing_path):
            with patch("app.core.config.Settings", return_value=Settings(database_url=_VALID_DB_URL)):
                with caplog.at_level(logging.WARNING, logger="app.core.config"):
                    _load_settings()

        assert any(".env file not found" in r.message for r in caplog.records)

    def test_no_warning_when_env_file_exists(self, tmp_path, caplog):
        """No 'not found' warning when the .env file exists."""
        import logging

        existing_env = tmp_path / ".env"
        existing_env.write_text("")  # empty but present

        with patch("app.core.config._ENV_FILE", existing_env):
            with patch("app.core.config.Settings", return_value=Settings(database_url=_VALID_DB_URL)):
                with caplog.at_level(logging.WARNING, logger="app.core.config"):
                    _load_settings()

        assert not any(".env file not found" in r.message for r in caplog.records)

    def test_prints_to_stderr_on_fatal_error(self, capsys):
        """On failure, a FATAL message is printed to stderr before re-raising."""
        with patch("app.core.config.Settings", side_effect=RuntimeError("config broke")):
            with pytest.raises(RuntimeError):
                _load_settings()

        captured = capsys.readouterr()
        assert "FATAL" in captured.err
        assert "config broke" in captured.err


# ── CORS origins sanity ────────────────────────────────────────────────────────

class TestCorsOriginsDefault:
    def test_default_has_three_entries(self):
        s = _IsolatedSettings(database_url=_VALID_DB_URL)
        assert len(s.cors_origins) == 3

    def test_all_entries_are_strings(self):
        s = _IsolatedSettings(database_url=_VALID_DB_URL)
        assert all(isinstance(o, str) for o in s.cors_origins)

    def test_all_entries_start_with_http(self):
        s = _IsolatedSettings(database_url=_VALID_DB_URL)
        assert all(o.startswith("http") for o in s.cors_origins)


# ── Security settings ─────────────────────────────────────────────────────────

class TestSecuritySettings:
    def test_jwt_algorithm_is_hs256(self):
        s = _IsolatedSettings(database_url=_VALID_DB_URL)
        assert s.jwt_algorithm == "HS256"

    def test_token_expiry_is_positive(self):
        s = _IsolatedSettings(database_url=_VALID_DB_URL)
        assert s.access_token_expire_minutes > 0

    def test_secret_key_is_string(self):
        s = _IsolatedSettings(database_url=_VALID_DB_URL)
        assert isinstance(s.secret_key, str)
        assert len(s.secret_key) > 0
