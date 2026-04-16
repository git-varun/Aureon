"""Broker provider factory.

Maps broker names to real AssetSource implementations.
Gate mock mode via USE_MOCK_BROKER=true env flag (dev / CI only).
"""

import os
from typing import List

from app.shared.interfaces import AssetSource

SUPPORTED_BROKERS: frozenset = frozenset({"zerodha", "groww", "binance", "coinbase", "custom_equity"})


def get_broker_provider(broker: str) -> AssetSource:
    """Return the real (or mock) provider for *broker*.

    Raises ValueError for unknown broker names.
    """
    key = broker.lower()
    if key not in SUPPORTED_BROKERS:
        raise ValueError(
            f"An unsupported broker '{broker}'. Supported: {sorted(SUPPORTED_BROKERS)}"
        )

    if os.getenv("USE_MOCK_BROKER", "").lower() == "true":
        from app.modules.assets.providers.mock_broker import MockBrokerProvider
        return MockBrokerProvider(key)

    if key == "zerodha":
        from app.modules.portfolio.providers.zerodha import ZerodhaSync
        return ZerodhaSync()
    if key == "groww":
        from app.modules.portfolio.providers.groww import GrowwSync
        return GrowwSync()
    if key == "coinbase":
        from app.modules.portfolio.providers.coinbase import CoinbaseSync
        return CoinbaseSync()
    if key == "custom_equity":
        from app.modules.portfolio.providers.custom_equity import CustomEquitySync
        return CustomEquitySync()
    # binance
    from app.modules.portfolio.providers.binance import BinanceIntelligenceClient
    return BinanceIntelligenceClient()


def list_supported_brokers() -> List[str]:
    return sorted(SUPPORTED_BROKERS)
