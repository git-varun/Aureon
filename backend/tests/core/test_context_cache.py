"""Tests for app/core/context_cache.py — disk-cache TTL constants and clear helper."""

import pytest


class TestTTLConstants:
    """TTL values guard latency/freshness trade-offs — wrong values break data pipelines."""

    def test_prices_ttl_is_60_seconds(self):
        from app.core.context_cache import TTL_PRICES
        assert TTL_PRICES == 60

    def test_quant_math_ttl_is_5_minutes(self):
        from app.core.context_cache import TTL_QUANT_MATH
        assert TTL_QUANT_MATH == 300

    def test_fundamentals_ttl_is_1_hour(self):
        from app.core.context_cache import TTL_FUNDAMENTALS
        assert TTL_FUNDAMENTALS == 3600

    def test_alt_data_ttl_is_4_hours(self):
        from app.core.context_cache import TTL_ALT_DATA
        assert TTL_ALT_DATA == 14400

    def test_mf_nav_ttl_is_6_hours(self):
        from app.core.context_cache import TTL_MF_NAV
        assert TTL_MF_NAV == 21600


class TestClearSystemCache:
    def test_clear_calls_cache_clear(self):
        from unittest.mock import patch
        from app.core import context_cache

        with patch.object(context_cache.smart_cache, "clear") as mock_clear:
            context_cache.clear_system_cache()
        mock_clear.assert_called_once()

    def test_clear_does_not_raise(self):
        from unittest.mock import patch
        from app.core import context_cache

        with patch.object(context_cache.smart_cache, "clear"):
            context_cache.clear_system_cache()  # must not raise


class TestSmartCacheInstance:
    def test_smart_cache_is_not_none(self):
        from app.core.context_cache import smart_cache
        assert smart_cache is not None

    def test_smart_cache_has_get_method(self):
        from app.core.context_cache import smart_cache
        assert callable(getattr(smart_cache, "get", None))

    def test_smart_cache_has_set_method(self):
        from app.core.context_cache import smart_cache
        assert callable(getattr(smart_cache, "set", None))
