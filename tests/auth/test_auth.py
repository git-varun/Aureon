"""Tests for app/modules/auth/services.py."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.modules.auth.schemas import LoginRequest, RegisterRequest
from app.modules.auth.services import login_user, logout_user, refresh_access_token, register_user
from app.shared.exceptions import ConflictError, ValidationError


def _mock_db():
    return MagicMock()


def _mock_user(is_active=True, password_hash="hashed"):
    u = MagicMock()
    u.id = 1
    u.email = "test@example.com"
    u.password_hash = password_hash
    u.is_active = is_active
    u.first_name = "Test"
    u.last_name = "User"
    return u


# ─────────────────────────────────────────────────────────────────────────────
# register_user
# ─────────────────────────────────────────────────────────────────────────────

class TestRegisterUser:
    def test_happy_path_returns_tokens(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = None  # no existing user

        req = RegisterRequest(email="new@example.com", password="secret", first_name="New")
        with (
            patch("app.modules.auth.services.hash_password", return_value="hashed"),
            patch("app.modules.auth.services.create_access_token", return_value="access"),
            patch("app.modules.auth.services._create_refresh_token", return_value="refresh"),
        ):
            access, refresh, user_id = register_user(req, db)

        assert access == "access"
        assert refresh == "refresh"
        db.add.assert_called_once()
        db.commit.assert_called()

    def test_duplicate_email_raises_conflict(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = _mock_user()

        req = RegisterRequest(email="existing@example.com", password="secret")
        with pytest.raises(ConflictError):
            register_user(req, db)


# ─────────────────────────────────────────────────────────────────────────────
# login_user
# ─────────────────────────────────────────────────────────────────────────────

class TestLoginUser:
    def test_valid_credentials_returns_tokens(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = _mock_user()

        req = LoginRequest(email="test@example.com", password="correct")
        with (
            patch("app.modules.auth.services.verify_password", return_value=True),
            patch("app.modules.auth.services.create_access_token", return_value="access"),
            patch("app.modules.auth.services._create_refresh_token", return_value="refresh"),
        ):
            access, refresh, user_id = login_user(req, db)

        assert access == "access"
        assert refresh == "refresh"

    def test_wrong_password_raises_validation_error(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = _mock_user()

        req = LoginRequest(email="test@example.com", password="wrong")
        with (
            patch("app.modules.auth.services.verify_password", return_value=False),
            pytest.raises(ValidationError),
        ):
            login_user(req, db)

    def test_unknown_email_raises_validation_error(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = None

        req = LoginRequest(email="nobody@example.com", password="any")
        with pytest.raises(ValidationError):
            login_user(req, db)

    def test_inactive_user_raises_validation_error(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = _mock_user(is_active=False)

        req = LoginRequest(email="test@example.com", password="correct")
        with (
            patch("app.modules.auth.services.verify_password", return_value=True),
            pytest.raises(ValidationError),
        ):
            login_user(req, db)


# ─────────────────────────────────────────────────────────────────────────────
# refresh_access_token
# ─────────────────────────────────────────────────────────────────────────────

class TestRefreshAccessToken:
    def _mock_token_record(self, expired=False):
        record = MagicMock()
        record.user_id = 1
        offset = -1 if expired else 1
        record.expires_at = datetime.now(timezone.utc) + timedelta(days=offset)
        return record

    def test_valid_token_returns_new_access_token(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = self._mock_token_record()

        with patch("app.modules.auth.services.create_access_token", return_value="new_access"):
            token = refresh_access_token("valid_refresh", db)

        assert token == "new_access"

    def test_unknown_token_raises_validation_error(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = None

        with pytest.raises(ValidationError):
            refresh_access_token("invalid_token", db)

    def test_expired_token_raises_validation_error(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = self._mock_token_record(expired=True)

        with pytest.raises(ValidationError):
            refresh_access_token("expired_token", db)

    def test_expired_token_is_deleted(self):
        db = _mock_db()
        record = self._mock_token_record(expired=True)
        db.query.return_value.filter_by.return_value.first.return_value = record

        with pytest.raises(ValidationError):
            refresh_access_token("expired_token", db)

        db.delete.assert_called_once_with(record)


# ─────────────────────────────────────────────────────────────────────────────
# logout_user
# ─────────────────────────────────────────────────────────────────────────────

class TestLogoutUser:
    def test_deletes_existing_refresh_token(self):
        db = _mock_db()
        record = MagicMock()
        db.query.return_value.filter_by.return_value.first.return_value = record

        logout_user("valid_token", db)

        db.delete.assert_called_once_with(record)
        db.commit.assert_called()

    def test_noop_on_unknown_token(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = None

        logout_user("unknown_token", db)

        db.delete.assert_not_called()
