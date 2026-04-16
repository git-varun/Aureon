"""Tests for app/core/dependencies.py — auth guards and DI wrappers."""

import sys
import types
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

# PyJWT (imported as `jwt` in dependencies.py) may not be installed.
if "jwt" not in sys.modules:
    _jwt_stub = types.ModuleType("jwt")
    _jwt_stub.decode = MagicMock()
    sys.modules["jwt"] = _jwt_stub


# ── get_session passthrough ───────────────────────────────────────────────────

class TestGetSession:
    def test_delegates_to_db_get_session(self):
        from app.core.dependencies import get_session

        mock_session = MagicMock()
        with patch("app.core.dependencies._get_session", return_value=iter([mock_session])):
            gen = get_session()
            assert next(gen) is mock_session


# ── get_cache passthrough ─────────────────────────────────────────────────────

class TestGetCache:
    def test_delegates_to_cache_get_cache(self):
        from app.core.dependencies import get_cache
        from app.core.cache import CacheManager

        fake_cache = MagicMock(spec=CacheManager)
        with patch("app.core.dependencies._get_cache", return_value=fake_cache):
            assert get_cache() is fake_cache


# ── get_current_user ──────────────────────────────────────────────────────────

class TestGetCurrentUser:
    def _call(self, credentials, db):
        from app.core.dependencies import get_current_user
        # get_current_user is a regular function (not a generator); call directly.
        return get_current_user(credentials=credentials, db=db)

    def test_returns_none_when_no_credentials(self):
        result = self._call(credentials=None, db=MagicMock())
        assert result is None

    def test_raises_401_on_invalid_token(self):
        """A decode error in the jwt module must surface as HTTP 401."""
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad.token")
        # Make jwt.decode raise so the except branch fires
        sys.modules["jwt"].decode.side_effect = Exception("bad token")
        with pytest.raises(HTTPException) as exc_info:
            self._call(credentials=creds, db=MagicMock())
        sys.modules["jwt"].decode.side_effect = None
        assert exc_info.value.status_code == 401

    def test_raises_401_when_user_not_found(self):
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="any.token")
        mock_db = MagicMock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = None
        sys.modules["jwt"].decode.side_effect = None
        sys.modules["jwt"].decode.return_value = {"sub": "99"}

        with pytest.raises(HTTPException) as exc_info:
            self._call(credentials=creds, db=mock_db)
        assert exc_info.value.status_code == 401

    def test_returns_user_when_token_valid(self):
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="any.token")
        fake_user = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = fake_user
        sys.modules["jwt"].decode.side_effect = None
        sys.modules["jwt"].decode.return_value = {"sub": "1"}

        result = self._call(credentials=creds, db=mock_db)
        assert result is fake_user


# ── require_auth ──────────────────────────────────────────────────────────────

class TestRequireAuth:
    def test_returns_user_when_present(self):
        from app.core.dependencies import require_auth
        fake_user = MagicMock()
        assert require_auth(user=fake_user) is fake_user

    def test_raises_401_when_user_is_none(self):
        from app.core.dependencies import require_auth
        with pytest.raises(HTTPException) as exc_info:
            require_auth(user=None)
        assert exc_info.value.status_code == 401
        assert "Authentication required" in exc_info.value.detail
