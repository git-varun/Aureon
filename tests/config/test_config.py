"""Tests for app/modules/config/services.py."""
import json
from unittest.mock import MagicMock, patch

import pytest

from app.modules.config.services import ConfigService


def _mock_db():
    return MagicMock()


def _mock_provider(name="zerodha", ptype="broker", enabled=True, key_names=None, encrypted_keys=None):
    p = MagicMock()
    p.provider_name = name
    p.provider_type = ptype
    p.enabled = enabled
    p.key_names = json.dumps(key_names or ["api_key", "api_secret"])
    p.encrypted_keys = json.dumps(encrypted_keys or {})
    return p


def _mock_job(name="sync_portfolio", enabled=True, cron="0 9 * * 1-5"):
    j = MagicMock()
    j.job_name = name
    j.enabled = enabled
    j.cron_expression = cron
    j.last_run_at = None
    j.next_run_at = None
    j.config = "{}"
    return j


# ─────────────────────────────────────────────────────────────────────────────
# Providers
# ─────────────────────────────────────────────────────────────────────────────

class TestGetAllProviders:
    def test_returns_list(self):
        db = _mock_db()
        db.query.return_value.all.return_value = [_mock_provider()]
        svc = ConfigService(db)
        result = svc.get_all_providers()
        assert isinstance(result, list)
        assert len(result) == 1

    def test_does_not_expose_plaintext_keys(self):
        db = _mock_db()
        provider = _mock_provider(encrypted_keys={"api_key": "encrypted_value"})
        db.query.return_value.all.return_value = [provider]
        svc = ConfigService(db)
        result = svc.get_all_providers()
        # keys_status should have boolean values, not the raw encrypted strings
        keys_status = result[0].get("keys_status", {})
        for v in keys_status.values():
            assert isinstance(v, bool), f"Expected bool, got {type(v)}: {v}"

    def test_provider_dict_shape(self):
        db = _mock_db()
        db.query.return_value.all.return_value = [_mock_provider()]
        svc = ConfigService(db)
        result = svc.get_all_providers()
        p = result[0]
        assert "provider_name" in p
        assert "provider_type" in p
        assert "enabled" in p
        assert "key_names" in p
        assert "keys_status" in p


class TestUpdateProvider:
    def test_toggle_enabled(self):
        db = _mock_db()
        provider = _mock_provider(enabled=True)
        db.query.return_value.filter_by.return_value.first.return_value = provider
        # get_all_providers will be called after update
        db.query.return_value.all.return_value = [provider]

        svc = ConfigService(db)
        result = svc.update_provider("zerodha", enabled=False)

        assert provider.enabled == False
        db.commit.assert_called()
        assert result is not None

    def test_returns_none_for_unknown_provider(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = None
        svc = ConfigService(db)
        result = svc.update_provider("nonexistent")
        assert result is None


class TestSetProviderKey:
    def test_encrypts_and_stores_key(self):
        db = _mock_db()
        provider = _mock_provider()
        db.query.return_value.filter_by.return_value.first.return_value = provider

        svc = ConfigService(db)
        with patch("app.modules.config.services._encrypt", return_value="encrypted_val"):
            ok = svc.set_provider_key("zerodha", "api_key", "my_key")

        assert ok is True
        db.commit.assert_called()

    def test_returns_false_for_unknown_provider(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = None
        svc = ConfigService(db)
        result = svc.set_provider_key("nonexistent", "api_key", "val")
        assert result is False


class TestSetProviderKeysBulk:
    def test_stores_multiple_keys(self):
        db = _mock_db()
        provider = _mock_provider()
        db.query.return_value.filter_by.return_value.first.return_value = provider

        svc = ConfigService(db)
        with patch("app.modules.config.services._encrypt", side_effect=lambda v: f"enc_{v}"):
            ok = svc.set_provider_keys_bulk("zerodha", {"api_key": "k1", "api_secret": "k2"})

        assert ok is True
        db.commit.assert_called()


# ─────────────────────────────────────────────────────────────────────────────
# Jobs
# ─────────────────────────────────────────────────────────────────────────────

class TestGetAllJobs:
    def test_returns_list(self):
        db = _mock_db()
        db.query.return_value.all.return_value = [_mock_job()]
        svc = ConfigService(db)
        result = svc.get_all_jobs()
        assert isinstance(result, list)
        assert len(result) == 1

    def test_job_dict_shape(self):
        db = _mock_db()
        db.query.return_value.all.return_value = [_mock_job()]
        svc = ConfigService(db)
        result = svc.get_all_jobs()
        j = result[0]
        assert "job_name" in j
        assert "enabled" in j
        assert "cron_schedule" in j


class TestUpdateJob:
    def test_updates_cron_and_enabled(self):
        db = _mock_db()
        job = _mock_job()
        db.query.return_value.filter_by.return_value.first.return_value = job
        db.query.return_value.all.return_value = [job]

        svc = ConfigService(db)
        result = svc.update_job("sync_portfolio", enabled=False, cron_expression="0 10 * * *")

        assert job.enabled == False
        assert job.cron_expression == "0 10 * * *"
        db.commit.assert_called()
        assert result is not None

    def test_returns_none_for_unknown_job(self):
        db = _mock_db()
        db.query.return_value.filter_by.return_value.first.return_value = None
        svc = ConfigService(db)
        result = svc.update_job("nonexistent")
        assert result is None
