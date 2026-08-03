from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List

from app.core.exceptions import ProviderError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote
from app.core.redis import try_consume_provider_budget

_BASE_URL = "https://api.coingecko.com/api/v3"

# No key required — but the free/anonymous tier is far tighter than commonly
# assumed, and the effective ceiling visibly degraded across repeated live
# testing in the same session/IP: an initial clean burst allowed ~6-7 calls
# before a sustained 429 (retry-after: 35), but later re-tests in this same
# investigation drew a 429 after only 1-2 calls — this looks like adaptive
# throttling on top of a simple per-minute quota, not a fixed token bucket.
# Re-tested directly against the real API (bypassing this guard) at the
# actual ~100-crypto-asset daily-refresh scale this budget has to survive:
# two independent unguarded bursts both drew a real 429 on the 3rd call in
# a fresh 60s window (2 calls succeeded each time) — the previous 3/minute
# setting was already sitting past today's observed real ceiling, not under
# it, meaning the old number itself risked the exact real-429 outcome this
# guard exists to prevent. 2/minute is what's actually supported right now;
# raising it is not justified by live testing, only lowering it is. A fresh
# IP/session may still sustain more — this errs toward never drawing a real
# 429 over maximizing throughput.
_BUDGET_LIMIT = 2
_BUDGET_WINDOW_SECONDS = 60

_PERIOD_TO_DAYS = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825}

# CoinGecko ticker symbols are NOT unique (18k+ listed coins — e.g. "BTC"
# matches "batcat" before "bitcoin"; "DOT" matches a coin literally named
# "Dot" before "polkadot") — a derived/lowercased lookup would silently
# resolve to the wrong coin. This is a curated map for coins Aureon
# realistically holds via Binance spot/earn, not an exhaustive list.
# MATIC and POL are both listed separately post-2024 migration with
# different live prices — kept as distinct entries deliberately.
SYMBOL_TO_COINGECKO_ID: dict[str, str] = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "BNB": "binancecoin",
    "XRP": "ripple", "ADA": "cardano", "DOGE": "dogecoin", "DOT": "polkadot",
    "LTC": "litecoin", "LINK": "chainlink", "MATIC": "matic-network",
    "POL": "polygon-ecosystem-token", "AVAX": "avalanche-2", "TRX": "tron",
    "ATOM": "cosmos", "UNI": "uniswap", "BCH": "bitcoin-cash",
    "ETC": "ethereum-classic", "XLM": "stellar", "FIL": "filecoin",
    "NEAR": "near", "APT": "aptos", "ARB": "arbitrum", "OP": "optimism",
    "SUI": "sui", "TON": "the-open-network", "SHIB": "shiba-inu",
    "PEPE": "pepe", "USDT": "tether", "USDC": "usd-coin", "BUSD": "binance-usd",
    "DAI": "dai", "FDUSD": "first-digital-usd",
}


def _coin_id(provider_name: str, symbol: str) -> str:
    raw = symbol.removesuffix("-USD")
    coin_id = SYMBOL_TO_COINGECKO_ID.get(raw.upper())
    if coin_id:
        return coin_id
    # Tracked-universe coins outside the curated 33 (Phase D's top-100-by-
    # market-cap seed) are stored with the symbol *already being* their real
    # CoinGecko id (e.g. "shiba-inu-USD") rather than a guessed ticker — ids
    # are lowercase/kebab-case by construction and globally unique (that's
    # what they're for), unlike tickers (CoinGecko has 18k+ listed coins with
    # duplicate tickers — see module docstring). The curated map above always
    # uses uppercase keys, so there's no ambiguity between the two forms: if
    # `raw` is already lowercase, it's an id, not a ticker to look up.
    if raw == raw.lower():
        return raw
    raise ProviderError(f"{provider_name}: no curated CoinGecko id mapping for symbol {symbol}")


class CoinGeckoAdapter(MarketDataProvider):
    """Primary price/fundamentals-equivalent source for spot crypto/stablecoin
    assets ({ASSET}-USD, asset_class 'crypto'/'stablecoin' — see
    portfolio.py's Binance spot/earn sync). Not used for crypto_futures
    (BTCUSDT-USDM etc., served by binance_price) or for position/trade data,
    which stays on the Binance broker provider — this only supplies price.

    get_quote() makes one HTTP call per symbol, matching every other
    adapter's shape in this codebase (nse_direct/finnhub/twelvedata/
    alphavantage) even though CoinGecko's /coins/markets could price many
    coins in a single call — the existing ingestion fan-out
    (ingest_all_quotes -> one Celery task + one get_quote() per symbol) isn't
    built for a bulk-fetch provider, and reworking that is out of this
    phase's scope. The conservative per-minute budget below (see
    _BUDGET_LIMIT) exists specifically because this per-symbol shape burns
    CoinGecko's tight anonymous rate limit faster than a bulk call would for
    portfolios holding more than a handful of coins.
    """

    @property
    def provider_name(self) -> str:
        return "coingecko"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE, Capability.OHLC, Capability.FUNDAMENTALS]

    def _check_budget(self) -> None:
        if not try_consume_provider_budget(self.provider_name, _BUDGET_LIMIT, _BUDGET_WINDOW_SECONDS):
            raise ProviderError(
                f"{self.provider_name}: local call budget ({_BUDGET_LIMIT}/{_BUDGET_WINDOW_SECONDS}s) "
                "exhausted for this window, skipping rather than draw a real 429"
            )

    def get_quote(self, symbol: str) -> NormalizedQuote:
        coin_id = _coin_id(self.provider_name, symbol)
        self._check_budget()
        try:
            res = http_client.get(
                "CoinGecko", f"{_BASE_URL}/coins/markets",
                params={"vs_currency": "usd", "ids": coin_id},
                timeout=15
            )
            res.raise_for_status()
            data = res.json()
            if not data:
                raise ProviderError(f"No price returned by CoinGecko for symbol {symbol}")
            coin = data[0]
            price = coin.get("current_price")
            if not price:
                raise ProviderError(f"No price returned by CoinGecko for symbol {symbol}")
            volume = coin.get("total_volume")
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal(str(price)),
                volume=Decimal(str(volume)) if volume else None,
            )
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"CoinGecko get_quote failed for {symbol}: {e}") from e

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        raise ProviderError(f"{self.provider_name} does not support news")

    def get_fundamentals(self, symbol: str) -> dict[str, Any]:
        coin_id = _coin_id(self.provider_name, symbol)
        self._check_budget()
        try:
            res = http_client.get(
                "CoinGecko", f"{_BASE_URL}/coins/markets",
                params={"vs_currency": "usd", "ids": coin_id},
                timeout=15
            )
            res.raise_for_status()
            data = res.json()
            if not data:
                raise ProviderError(f"No fundamentals returned by CoinGecko for symbol {symbol}")
            coin = data[0]
            return {
                "market_cap": coin.get("market_cap"),
                "circulating_supply": coin.get("circulating_supply"),
                "total_supply": coin.get("total_supply"),
                "max_supply": coin.get("max_supply"),
                "ath": coin.get("ath"),
                "atl": coin.get("atl"),
            }
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"CoinGecko get_fundamentals failed for {symbol}: {e}") from e

    def get_price_history(self, symbol: str, period: str = "3mo", interval: str = "1d") -> list[dict[str, Any]]:
        if interval != "1d":
            raise ProviderError(f"{self.provider_name} only supports daily price history, got interval={interval}")
        coin_id = _coin_id(self.provider_name, symbol)
        days = _PERIOD_TO_DAYS.get(period, 90)
        self._check_budget()
        try:
            res = http_client.get(
                "CoinGecko", f"{_BASE_URL}/coins/{coin_id}/market_chart",
                params={"vs_currency": "usd", "days": days, "interval": "daily"},
                timeout=15
            )
            res.raise_for_status()
            data = res.json()
            rows = []
            for ts_ms, price in data.get("prices", []):
                rows.append({
                    "timestamp": datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc),
                    "close": float(price),
                    "volume": None,
                })
            return rows
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"CoinGecko get_price_history failed for {symbol}: {e}") from e

    def get_top_market_cap_coins(self, limit: int = 100) -> list[dict[str, Any]]:
        """Live top-`limit`-by-market-cap coins — one /coins/markets call
        (confirmed live: a single page=1&per_page=100 call returns the full
        top 100, well within the 3/min budget), used by the tracked-universe
        seed job so the crypto universe is discovered from real live ranking
        rather than a 6th hardcoded static list (unlike the other 5 markets'
        curated equity-index constituent lists, which have no equivalent
        single-call discovery endpoint). Returns each coin's real `id` (the
        CoinGecko-assigned unique slug) alongside its ticker `symbol` — the
        caller decides how to name the resulting Asset.symbol (see
        SYMBOL_TO_COINGECKO_ID's module docstring on ticker collisions)."""
        self._check_budget()
        try:
            res = http_client.get(
                "CoinGecko", f"{_BASE_URL}/coins/markets",
                params={"vs_currency": "usd", "order": "market_cap_desc", "per_page": limit, "page": 1},
                timeout=15
            )
            res.raise_for_status()
            data = res.json()
            return [
                {
                    "id": c["id"],
                    "symbol": c["symbol"].upper(),
                    "name": c.get("name"),
                    "price": c.get("current_price"),
                    "market_cap": c.get("market_cap"),
                }
                for c in data
            ]
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"CoinGecko get_top_market_cap_coins failed: {e}") from e

    def health_check(self) -> bool:
        try:
            res = http_client.get("CoinGecko", f"{_BASE_URL}/ping", timeout=5)
            return res.status_code == 200
        except Exception:
            return False


registry.register(CoinGeckoAdapter)
