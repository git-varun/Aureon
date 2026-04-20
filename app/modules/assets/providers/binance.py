"""Binance price provider — public ticker endpoint, no API key required."""
import logging

import requests

from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import PricePayload, PriceProvider

logger = logging.getLogger("providers.binance")

_BASE_URL = "https://api.binance.com/api/v3/ticker/price"
_TIMEOUT = 5


class BinanceProvider(PriceProvider):
    provider_name = "binance"

    def __init__(self, cred_manager: CredentialManager):
        pass  # public endpoint, no credentials required

    def get_price(self, symbol: str, asset_type: str) -> PricePayload | None:
        if asset_type.upper() != "CRYPTO":
            return None

        # Extract base coin from "BTC-USD" or "BTC"
        base = symbol.upper().split("-")[0].replace("USDT", "") or symbol.upper()

        for quote in ("USDT", "BUSD", "USD"):
            pair = f"{base}{quote}"
            try:
                resp = requests.get(_BASE_URL, params={"symbol": pair}, timeout=_TIMEOUT)
                if resp.status_code == 200:
                    price = float(resp.json()["price"])
                    if price > 0:
                        return PricePayload(
                            symbol=symbol,
                            price=price,
                            currency="USD",
                            provider=self.provider_name,
                        )
            except Exception as e:
                logger.debug("Binance fetch failed for %s: %s", pair, e)

        return None
