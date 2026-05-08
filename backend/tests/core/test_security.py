"""Tests for app/core/security.py — JWT creation correctness.

python-jose may not be installed in CI/test environments, so we stub the
`jose` module and verify that create_access_token() assembles the right
payload and delegates to jose.jwt.encode correctly.
"""

import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, call, patch

import pytest

# ── Stub python-jose so the module can be imported without the package ────────
if "jose" not in sys.modules:
    _jose_stub = types.ModuleType("jose")
    _jose_stub.jwt = MagicMock()
    sys.modules["jose"] = _jose_stub

from app.core.security import create_access_token  # noqa: E402


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _patch_settings_and_jose():
    """Isolate settings and capture calls to jose.jwt.encode."""
    import jose  # the stubbed module
    jose.jwt.encode = MagicMock(return_value="mocked.jwt.token")

    with patch("app.core.security.settings") as mock_settings:
        mock_settings.secret_key = "test-secret"
        mock_settings.jwt_algorithm = "HS256"
        mock_settings.access_token_expire_minutes = 60
        yield mock_settings, jose.jwt.encode


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCreateAccessToken:
    def test_returns_value_from_jose_encode(self, _patch_settings_and_jose):
        _, mock_encode = _patch_settings_and_jose
        token = create_access_token("user-1")
        assert token == "mocked.jwt.token"

    def test_calls_encode_with_correct_secret(self, _patch_settings_and_jose):
        # jose.jwt.encode(claims, key, algorithm=...) — key is 2nd positional arg
        _, mock_encode = _patch_settings_and_jose
        create_access_token("user-1")
        args, kwargs = mock_encode.call_args
        secret = args[1] if len(args) >= 2 else kwargs.get("key")
        assert secret == "test-secret"

    def test_calls_encode_with_correct_algorithm(self, _patch_settings_and_jose):
        _, mock_encode = _patch_settings_and_jose
        create_access_token("user-1")
        args, kwargs = mock_encode.call_args
        algorithm = args[2] if len(args) >= 3 else kwargs.get("algorithm")
        assert algorithm == "HS256"

    def test_payload_contains_sub(self, _patch_settings_and_jose):
        _, mock_encode = _patch_settings_and_jose
        create_access_token("user-42")
        payload = mock_encode.call_args[0][0]
        assert payload["sub"] == "user-42"

    def test_payload_contains_exp(self, _patch_settings_and_jose):
        _, mock_encode = _patch_settings_and_jose
        create_access_token("user-1")
        payload = mock_encode.call_args[0][0]
        assert "exp" in payload

    def test_default_expiry_is_60_minutes_from_now(self, _patch_settings_and_jose):
        _, mock_encode = _patch_settings_and_jose
        before = datetime.now(timezone.utc)
        create_access_token("user-1")
        payload = mock_encode.call_args[0][0]
        exp: datetime = payload["exp"]
        delta_minutes = (exp - before).total_seconds() / 60
        assert 59 <= delta_minutes <= 61

    def test_custom_expires_minutes_overrides_default(self, _patch_settings_and_jose):
        _, mock_encode = _patch_settings_and_jose
        before = datetime.now(timezone.utc)
        create_access_token("user-1", expires_minutes=120)
        payload = mock_encode.call_args[0][0]
        exp: datetime = payload["exp"]
        delta_minutes = (exp - before).total_seconds() / 60
        assert 119 <= delta_minutes <= 121

    def test_exp_is_timezone_aware(self, _patch_settings_and_jose):
        _, mock_encode = _patch_settings_and_jose
        create_access_token("user-1")
        payload = mock_encode.call_args[0][0]
        assert payload["exp"].tzinfo is not None
