"""CoinGecko price provider — free public API, optional Pro key for higher rate limits."""
import logging
import time
from datetime import datetime, timezone

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

    def get_ohlcv(self, base: str, days: int) -> list[dict]:
        """Fetch daily OHLCV from CoinGecko for a crypto base ticker (e.g. 'SONIC', 'SUI').

        Uses /coins/{id}/market_chart. Requests min 365 days to guarantee daily
        (not hourly) candle granularity on the free tier. Retries once on 429.
        """
        coin_id = self._resolve_coin_id(base)
        if not coin_id:
            logger.debug("CoinGecko ohlcv: no coin ID for %s", base)
            return []

        cg_days = max(days, 365)
        for attempt in range(2):
            try:
                resp = requests.get(
                    f"{self._base()}/coins/{coin_id}/market_chart",
                    params={"vs_currency": "usd", "days": cg_days},
                    headers=self._headers(),
                    timeout=_TIMEOUT,
                )
                if resp.status_code == 429:
                    logger.warning("CoinGecko rate limited fetching ohlcv for %s, retry in 10s", base)
                    time.sleep(10)
                    continue
                if resp.status_code != 200:
                    logger.debug("CoinGecko ohlcv HTTP %s for %s", resp.status_code, base)
                    return []
                data = resp.json()
                prices = data.get("prices", [])
                volumes = data.get("total_volumes", [])
                vol_map = {ts: v for ts, v in volumes}
                return [
                    {
                        "date": datetime.fromtimestamp(ts / 1000, tz=timezone.utc),
                        "open": float(price),
                        "high": float(price),
                        "low": float(price),
                        "close": float(price),
                        "volume": float(vol_map.get(ts, 0.0)),
                    }
                    for ts, price in prices
                ]
            except Exception as exc:
                logger.debug("CoinGecko ohlcv failed for %s (%s): %s", base, coin_id, exc)
                return []
        return []

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
