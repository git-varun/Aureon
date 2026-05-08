"""Tests for app/core/db.py — engine creation and session lifecycle."""

from unittest.mock import MagicMock, patch

import pytest


class TestEngineCreation:
    def test_engine_uses_configured_database_url(self):
        """Engine URL host/db must match settings.database_url (SQLAlchemy masks passwords)."""
        from app.core.db import engine
        from app.core.config import settings
        # SQLAlchemy renders passwords as '***'; compare the rendered URL against
        # a similarly-masked version of the configured URL to avoid the mismatch.
        import re
        masked_settings = re.sub(r":([^:@]+)@", ":***@", settings.database_url)
        assert str(engine.url) == masked_settings

    def test_engine_has_pool_pre_ping_enabled(self):
        from app.core.db import engine
        assert engine.pool._pre_ping is True


class TestGetSession:
    def test_yields_session_and_closes_it(self):
        """get_session() must yield exactly once and close the session on exit."""
        from app.core import db as db_module

        mock_session = MagicMock()
        with patch.object(db_module, "SessionLocal", return_value=mock_session):
            gen = db_module.get_session()
            session = next(gen)
            assert session is mock_session
            with pytest.raises(StopIteration):
                next(gen)
        mock_session.close.assert_called_once()

    def test_session_closed_even_on_exception(self):
        """Session.close() must be called even if the caller raises."""
        from app.core import db as db_module

        mock_session = MagicMock()
        with patch.object(db_module, "SessionLocal", return_value=mock_session):
            gen = db_module.get_session()
            next(gen)
            try:
                gen.throw(RuntimeError("caller blew up"))
            except RuntimeError:
                pass

        mock_session.close.assert_called_once()


class TestBase:
    def test_base_is_declarative_base(self):
        from app.core.db import Base
        from sqlalchemy.orm import DeclarativeBase
        # Either classic (has metadata) or new-style
        assert hasattr(Base, "metadata")

    def test_session_local_is_not_autocommit(self):
        from app.core.db import SessionLocal
        assert SessionLocal.kw.get("autocommit") is False

    def test_session_local_is_not_autoflush(self):
        from app.core.db import SessionLocal
        assert SessionLocal.kw.get("autoflush") is False
