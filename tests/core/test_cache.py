"""Tests for app/core/cache.py — CacheManager behaviour without a real Redis."""

from unittest.mock import MagicMock, patch

import pytest

from app.core.cache import CacheManager, get_cache


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_manager(redis_client=None, redis_url="redis://localhost:6379/0"):
    """Return a CacheManager whose redis client is pre-set (bypasses __init__ network call)."""
    manager = object.__new__(CacheManager)
    manager.client = redis_client
    return manager


# ── No-Redis (client=None) graceful degradation ───────────────────────────────

class TestNoRedis:
    """When no redis_url is configured the manager must never raise."""

    @pytest.fixture(autouse=True)
    def _manager(self):
        self.mgr = _make_manager(redis_client=None)

    def test_get_returns_default_when_no_client(self):
        assert self.mgr.get("key", default="fallback") == "fallback"

    def test_get_returns_none_default_when_no_client(self):
        assert self.mgr.get("key") is None

    def test_set_does_not_raise_when_no_client(self):
        self.mgr.set("key", "value")  # must not raise

    def test_delete_does_not_raise_when_no_client(self):
        self.mgr.delete("key")  # must not raise

    def test_clear_pattern_does_not_raise_when_no_client(self):
        self.mgr.clear_pattern("prefix:*")  # must not raise


# ── Redis present — get() ──────────────────────────────────────────────────────

class TestGetWithRedis:
    @pytest.fixture(autouse=True)
    def _redis(self):
        self.redis = MagicMock()
        self.mgr = _make_manager(redis_client=self.redis)

    def test_returns_parsed_json_dict(self):
        self.redis.get.return_value = '{"a": 1}'
        assert self.mgr.get("key") == {"a": 1}

    def test_returns_parsed_json_list(self):
        self.redis.get.return_value = '[1, 2, 3]'
        assert self.mgr.get("key") == [1, 2, 3]

    def test_returns_raw_string_when_not_json(self):
        self.redis.get.return_value = "plain-string"
        assert self.mgr.get("key") == "plain-string"

    def test_returns_default_when_key_missing(self):
        self.redis.get.return_value = None
        assert self.mgr.get("key", default="nope") == "nope"

    def test_returns_default_on_redis_exception(self):
        self.redis.get.side_effect = Exception("connection reset")
        assert self.mgr.get("key", default="safe") == "safe"


# ── Redis present — set() ──────────────────────────────────────────────────────

class TestSetWithRedis:
    @pytest.fixture(autouse=True)
    def _redis(self):
        self.redis = MagicMock()
        self.mgr = _make_manager(redis_client=self.redis)

    def test_calls_setex_with_correct_ttl(self):
        self.mgr.set("key", "value", ttl=120)
        self.redis.setex.assert_called_once_with("key", 120, "value")

    def test_serializes_dict_to_json(self):
        self.mgr.set("key", {"x": 1})
        args = self.redis.setex.call_args[0]
        assert args[2] == '{"x": 1}'

    def test_serializes_list_to_json(self):
        self.mgr.set("key", [1, 2])
        args = self.redis.setex.call_args[0]
        assert args[2] == '[1, 2]'

    def test_does_not_raise_on_redis_exception(self):
        self.redis.setex.side_effect = Exception("timeout")
        self.mgr.set("key", "value")  # must not propagate


# ── Redis present — delete() ──────────────────────────────────────────────────

class TestDeleteWithRedis:
    @pytest.fixture(autouse=True)
    def _redis(self):
        self.redis = MagicMock()
        self.mgr = _make_manager(redis_client=self.redis)

    def test_calls_delete_with_correct_key(self):
        self.mgr.delete("mykey")
        self.redis.delete.assert_called_once_with("mykey")

    def test_does_not_raise_on_redis_exception(self):
        self.redis.delete.side_effect = Exception("timeout")
        self.mgr.delete("key")  # must not propagate


# ── Redis present — clear_pattern() ──────────────────────────────────────────

class TestClearPatternWithRedis:
    @pytest.fixture(autouse=True)
    def _redis(self):
        self.redis = MagicMock()
        self.mgr = _make_manager(redis_client=self.redis)

    def test_deletes_each_matched_key(self):
        self.redis.scan_iter.return_value = ["a:1", "a:2"]
        self.mgr.clear_pattern("a:*")
        self.redis.delete.assert_any_call("a:1")
        self.redis.delete.assert_any_call("a:2")
        assert self.redis.delete.call_count == 2

    def test_does_not_raise_on_redis_exception(self):
        self.redis.scan_iter.side_effect = Exception("timeout")
        self.mgr.clear_pattern("*")  # must not propagate


# ── Initialization: redis_url absent ─────────────────────────────────────────

class TestCacheManagerInit:
    def test_client_is_none_when_no_redis_url(self):
        with patch("app.core.cache.settings") as mock_settings:
            mock_settings.redis_url = None
            mgr = CacheManager()
        assert mgr.client is None

    def test_client_is_none_when_redis_unreachable(self):
        with patch("app.core.cache.settings") as mock_settings, \
             patch("app.core.cache.redis.from_url") as mock_from_url:
            mock_settings.redis_url = "redis://unreachable:9999/0"
            mock_from_url.return_value.ping.side_effect = Exception("refused")
            mgr = CacheManager()
        assert mgr.client is None


# ── get_cache() dependency ────────────────────────────────────────────────────

class TestGetCacheDependency:
    def test_returns_cache_manager_instance(self):
        result = get_cache()
        assert isinstance(result, CacheManager)
