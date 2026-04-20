"""CoinGecko price provider — free public API, optional Pro key for higher rate limits."""
import logging

import requests

from app.shared.interfaces import PricePayload, PriceProvider

logger = logging.getLogger("providers.coingecko")

_BASE_URL = "https://api.coingecko.com/api/v3"
_TIMEOUT = 10

# Symbol → CoinGecko coin ID for common assets.
# Used as a fast-path before falling back to the search endpoint.
_SYMBOL_ID_MAP: dict[str, str] = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "USDT": "tether",
    "USDC": "usd-coin",
    "BNB": "binancecoin",
    "SOL": "solana",
    "LINK": "chainlink",
    "ATOM": "cosmos",
    "AAVE": "aave",
    "MATIC": "matic-network",
    "POL": "matic-network",
    "UNI": "uniswap",
    "CRV": "curve-dao-token",
    "SUI": "sui",
    "ROSE": "oasis-network",
    "RENDER": "render-token",
    "FIL": "filecoin",
    "DOT": "polkadot",
    "ADA": "cardano",
    "AVAX": "avalanche-2",
    "NEAR": "near",
    "INJ": "injective-protocol",
    "ARB": "arbitrum",
    "OP": "optimism",
    "APT": "aptos",
    "TIA": "celestia",
    "SEI": "sei-network",
    "PEPE": "pepe",
    "WIF": "dogwifcoin",
    "BONK": "bonk",
    "SKY": "sky",
    "SXT": "space-and-time",
    "SONIC": "sonic-3",
    "A2Z": "a2z-dao",
}


class CoinGeckoProvider(PriceProvider):
    provider_name = "coingecko"

    def __init__(self, api_key: str = ""):
        self._api_key = api_key
        self._search_cache: dict[str, str] = {}  # symbol → coin_id

    def _headers(self) -> dict:
        if self._api_key:
            return {"x-cg-pro-api-key": self._api_key}
        return {}

    def _base(self) -> str:
        if self._api_key:
            return "https://pro-api.coingecko.com/api/v3"
        return _BASE_URL

    def _resolve_coin_id(self, base: str) -> str | None:
        """Return CoinGecko coin ID for a ticker symbol, using cache + search fallback."""
        if base in _SYMBOL_ID_MAP:
            return _SYMBOL_ID_MAP[base]
        if base in self._search_cache:
            return self._search_cache[base]

        try:
            resp = requests.get(
                f"{self._base()}/search",
                params={"query": base},
                headers=self._headers(),
                timeout=_TIMEOUT,
            )
            if resp.status_code == 200:
                coins = resp.json().get("coins", [])
                # Prefer exact symbol match with highest market_cap_rank
                for coin in coins:
                    if coin.get("symbol", "").upper() == base:
                        coin_id = coin["id"]
                        self._search_cache[base] = coin_id
                        return coin_id
        except Exception as e:
            logger.debug("CoinGecko search failed for %s: %s", base, e)

        return None

    def get_price(self, symbol: str, asset_type: str) -> PricePayload | None:
        if asset_type.upper() != "CRYPTO":
            return None

        base = symbol.upper().split("-")[0].replace("USDT", "") or symbol.upper()
        coin_id = self._resolve_coin_id(base)
        if not coin_id:
            logger.debug("CoinGecko: no coin ID found for %s", base)
            return None

        try:
            resp = requests.get(
                f"{self._base()}/simple/price",
                params={"ids": coin_id, "vs_currencies": "usd"},
                headers=self._headers(),
                timeout=_TIMEOUT,
            )
            if resp.status_code == 200:
                data = resp.json()
                price = data.get(coin_id, {}).get("usd")
                if price:
                    return PricePayload(
                        symbol=symbol,
                        price=float(price),
                        currency="USD",
                        provider=self.provider_name,
                    )
        except Exception as e:
            logger.debug("CoinGecko price fetch failed for %s (%s): %s", symbol, coin_id, e)

        return None
