"""CoinMarketCap price provider — requires CMC_API_KEY."""
import logging

import requests

from app.shared.interfaces import PricePayload, PriceProvider

logger = logging.getLogger("providers.coinmarketcap")

_BASE_URL = "https://pro-api.coinmarketcap.com/v1"
_TIMEOUT = 10


class CoinMarketCapProvider(PriceProvider):
    provider_name = "coinmarketcap"

    def __init__(self, api_key: str):
        self._api_key = api_key

    def get_price(self, symbol: str, asset_type: str) -> PricePayload | None:
        if asset_type.upper() != "CRYPTO":
            return None
        if not self._api_key:
            return None

        base = symbol.upper().split("-")[0].replace("USDT", "") or symbol.upper()

        try:
            resp = requests.get(
                f"{_BASE_URL}/cryptocurrency/quotes/latest",
                headers={"X-CMC_PRO_API_KEY": self._api_key, "Accept": "application/json"},
                params={"symbol": base, "convert": "USD"},
                timeout=_TIMEOUT,
            )
            if resp.status_code == 200:
                data = resp.json()
                entry = data.get("data", {}).get(base)
                if entry:
                    # CMC may return a list or dict depending on symbol uniqueness
                    if isinstance(entry, list):
                        entry = entry[0]
                    price = entry["quote"]["USD"]["price"]
                    if price:
                        return PricePayload(
                            symbol=symbol,
                            price=float(price),
                            currency="USD",
                            provider=self.provider_name,
                        )
        except Exception as e:
            logger.debug("CoinMarketCap fetch failed for %s: %s", base, e)

        return None
