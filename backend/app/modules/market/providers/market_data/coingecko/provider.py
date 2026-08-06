from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List

from app.core.exceptions import ProviderError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote
from app.core.redis import is_provider_cooling_down, set_provider_cooldown, try_consume_provider_budget

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

# /coins/markets accepts a comma-separated `ids` list in one call — used by
# get_quotes_by_ids to refresh many tracked coins per budget-guarded call
# instead of one call per coin (see get_quotes_by_ids docstring). Kept well
# under CoinGecko's practical per-call id-list ceiling (URL-length driven,
# not officially documented) rather than relying on a single request for an
# arbitrarily large tracked universe.
_BULK_IDS_PER_CALL = 200

# CoinGecko's real cooldown after a 429 is relative to the moment it was
# drawn (its own Retry-After header), not aligned to _check_budget's fixed
# wall-clock window — a request right after a fresh window boundary can
# slip through the local budget counter while the real API is still
# rejecting it. Fallback used only if a 429 response omits Retry-After.
_DEFAULT_RETRY_AFTER_SECONDS = 60

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
        if is_provider_cooling_down(self.provider_name):
            raise ProviderError(
                f"{self.provider_name}: cooling down after a real 429, skipping rather than draw another"
            )
        if not try_consume_provider_budget(self.provider_name, _BUDGET_LIMIT, _BUDGET_WINDOW_SECONDS):
            raise ProviderError(
                f"{self.provider_name}: local call budget ({_BUDGET_LIMIT}/{_BUDGET_WINDOW_SECONDS}s) "
                "exhausted for this window, skipping rather than draw a real 429"
            )

    def _get(self, path: str, params: dict[str, Any]):
        res = http_client.get("CoinGecko", f"{_BASE_URL}{path}", params=params, timeout=15)
        if res.status_code == 429:
            retry_after = res.headers.get("Retry-After")
            try:
                seconds = int(retry_after) if retry_after is not None else _DEFAULT_RETRY_AFTER_SECONDS
            except ValueError:
                seconds = _DEFAULT_RETRY_AFTER_SECONDS
            set_provider_cooldown(self.provider_name, seconds)
            raise ProviderError(f"{self.provider_name}: 429 rate limited, cooling down for {seconds}s")
        res.raise_for_status()
        return res

    def get_quote(self, symbol: str) -> NormalizedQuote:
        coin_id = _coin_id(self.provider_name, symbol)
        self._check_budget()
        try:
            res = self._get("/coins/markets", {"vs_currency": "usd", "ids": coin_id})
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
            res = self._get("/coins/markets", {"vs_currency": "usd", "ids": coin_id})
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
            res = self._get(f"/coins/{coin_id}/market_chart", {"vs_currency": "usd", "days": days, "interval": "daily"})
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

    def get_quotes_by_ids(self, coin_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Bulk quote refresh for many CoinGecko ids, spending one budget-
        guarded call per _BULK_IDS_PER_CALL ids instead of one call per coin
        — used by refresh_tracked_universe_task's crypto batch, which was
        previously firing one get_quote() (and one _check_budget() draw) per
        tracked symbol, so only ~_BUDGET_LIMIT of a ~100-coin batch ever won
        the shared per-minute budget and the rest silently failed every
        cycle (confirmed live, see investigation notes). Returns
        {coin_id: {"price": ..., "volume": ...}} only for ids CoinGecko
        actually priced this call — a missing id means "no quote this
        cycle" to the caller, not a hard error for the whole batch."""
        if not coin_ids:
            return {}
        results: dict[str, dict[str, Any]] = {}
        for i in range(0, len(coin_ids), _BULK_IDS_PER_CALL):
            batch = coin_ids[i:i + _BULK_IDS_PER_CALL]
            self._check_budget()
            try:
                res = self._get(
                    "/coins/markets",
                    {"vs_currency": "usd", "ids": ",".join(batch), "per_page": len(batch), "page": 1},
                )
                for coin in res.json():
                    price = coin.get("current_price")
                    if price is None:
                        continue
                    results[coin["id"]] = {"price": price, "volume": coin.get("total_volume")}
            except ProviderError:
                raise
            except Exception as e:
                raise ProviderError(f"CoinGecko get_quotes_by_ids failed: {e}") from e
        return results

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
            res = self._get("/coins/markets", {"vs_currency": "usd", "order": "market_cap_desc", "per_page": limit, "page": 1})
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
