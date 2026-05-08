import logging

from app.core.context_cache import smart_cache, TTL_ALT_DATA


class FearGreedProvider:
    """Fallback provider for crypto Fear & Greed Index."""

    def fetch(self) -> dict:
        return {
            "index": 50,
            "signal": "neutral",
            "source": "fallback"
        }


class DXYProvider:
    """Fallback provider for DXY and liquidity proxy."""

    def fetch(self) -> dict:
        return {
            "dxy": 105.0,
            "trend": "flat",
            "source": "fallback"
        }


class AltDataEngine:
    """Alternative Data: Fear & Greed, Liquidity Drains (DXY), and Institutional Flow Proxies."""

    def __init__(self):
        self.logger = logging.getLogger("AltData")
        self.fear_greed_provider = FearGreedProvider()
        self.dxy_provider = DXYProvider()

    def get_crypto_fear_greed(self) -> dict:
        """Fear & Greed fetched via provider."""
        return self.fear_greed_provider.fetch()

    def get_fii_liquidity_proxy(self) -> dict:
        """DXY and FII flow data fetched via provider."""
        return self.dxy_provider.fetch()

    def fetch_all_alt_data(self) -> dict:
        """Bundles all alt-data. Heavily cached to prevent rate-limiting."""
        # 1. Check Cache
        cached_data = smart_cache.get("global_alt_data")
        if cached_data:
            self.logger.info("⚡ Served Alt Data from Smart Cache.")
            return cached_data

        # 2. Fetch if missing or expired
        self.logger.info("🌍 Fetching fresh Alt Data via providers...")
        fresh_data = {
            "fear_and_greed": self.get_crypto_fear_greed(),
            "fii_proxy": self.get_fii_liquidity_proxy()
        }

        # 3. Store with 4-Hour TTL
        smart_cache.set("global_alt_data", fresh_data, expire=TTL_ALT_DATA)
        return fresh_data
