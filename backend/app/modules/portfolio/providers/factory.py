"""Broker provider factory.

Maps broker names to real AssetSource implementations.
Gate mock mode via USE_MOCK_BROKER=true env flag (dev / CI only).
"""

import os
from typing import List, Optional

from sqlalchemy.orm import Session
from app.shared.interfaces import AssetSource
from app.modules.portfolio.providers.credential_manager import CredentialManager

SUPPORTED_BROKERS: frozenset = frozenset({"zerodha", "groww", "binance", "coinbase", "custom_equity"})


def get_broker_provider(broker: str, session: Optional[Session] = None) -> AssetSource:
    """Return the real (or mock) provider for *broker*.

    Raises ValueError for unknown broker names.

    Args:
        broker: Broker name (zerodha, groww, binance, coinbase, custom_equity)
        session: Optional SQLAlchemy session for database credential access
    """
    key = broker.lower()
    if key not in SUPPORTED_BROKERS:
        raise ValueError(
            f"An unsupported broker '{broker}'. Supported: {sorted(SUPPORTED_BROKERS)}"
        )

    # Create credential manager with optional session
    cred_manager = CredentialManager(session)

    if os.getenv("USE_MOCK_BROKER", "").lower() == "true":
        from app.modules.assets.providers.mock_broker import MockBrokerProvider
        return MockBrokerProvider(key)

    if key == "zerodha":
        from app.modules.portfolio.providers.zerodha import ZerodhaSync
        return ZerodhaSync(cred_manager=cred_manager)
    if key == "groww":
        from app.modules.portfolio.providers.groww import GrowwSync
        return GrowwSync(cred_manager=cred_manager)
    if key == "coinbase":
        from app.modules.portfolio.providers.coinbase import CoinbaseSync
        return CoinbaseSync(cred_manager=cred_manager)
    if key == "custom_equity":
        from app.modules.portfolio.providers.custom_equity import CustomEquitySync
        return CustomEquitySync(cred_manager=cred_manager)
    # binance
    from app.modules.portfolio.providers.binance import BinanceIntelligenceClient
    return BinanceIntelligenceClient(cred_manager=cred_manager)


def list_supported_brokers() -> List[str]:
    return sorted(SUPPORTED_BROKERS)
