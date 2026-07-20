import hashlib
import hmac
import time
from datetime import datetime
from typing import Any, List, Optional
from urllib.parse import urlencode

import requests

from app.core.binance import SPOT_TRADE_QUOTES
from app.core.exceptions import BinanceAuthError, RateLimitError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import BrokerProvider
from app.core.providers.registry import registry

_BASE_URL = "https://api.binance.com"
_FAPI_URL = "https://fapi.binance.com"
_DAPI_URL = "https://dapi.binance.com"

# Binance futures trade-history endpoints (fapi/dapi userTrades) reject a
# startTime/endTime span over 7 days — a regular sync window bounded by "since
# last captured trade" must be chunked into windows this size or smaller when
# the app has been offline longer than that.
_FUTURES_TRADE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

# Binance's "invalid symbol" error code — returned as HTTP 400 when a probed
# candidate pair doesn't actually exist. Not an auth failure, safe to skip.
_INVALID_SYMBOL_CODE = -1121

# Pairs already confirmed non-existent on Binance (e.g. "ETHFDUSD" doesn't exist
# even though "BTCFDUSD" does) — a symbol's existence is global, not per-account,
# so this is safe to cache for the worker process's lifetime and skip re-probing
# on every future sync.
_known_invalid_spot_pairs: set[str] = set()


class BinanceClient:
    """Thin Binance REST client covering Spot, Simple Earn, and USDⓈ-M/COIN-M
    Futures wallets. Signed requests per Binance's standard HMAC-SHA256
    request-security scheme: query string (including a timestamp) is signed
    with the API secret, and the API key travels as a header."""

    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self._spot_symbols: Optional[set[str]] = None
        self._coinm_contract_sizes: Optional[dict[str, float]] = None

    def _signed_get(self, path: str, params: Optional[dict] = None, base_url: str = _BASE_URL) -> Any:
        params = dict(params or {})
        params["timestamp"] = int(time.time() * 1000)
        query = urlencode(params)
        signature = hmac.new(self.api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
        query = f"{query}&signature={signature}"

        try:
            res = http_client.get(
                "Binance", f"{base_url}{path}?{query}",
                headers={"X-MBX-APIKEY": self.api_key},
                timeout=15,
            )
        except requests.RequestException as e:
            raise BinanceAuthError(f"Binance request failed: {e}") from e

        if res.status_code == 401:
            raise BinanceAuthError("Binance rejected the API key/secret")
        if res.status_code == 429:
            raise RateLimitError("Binance rate limited the request — try again later")
        res.raise_for_status()
        return res.json()

    def _signed_get_optional(self, path: str, params: Optional[dict] = None, base_url: str = _BASE_URL) -> Any:
        """Like _signed_get, but tolerates Binance's "invalid symbol" error (a
        probed trade-history candidate that doesn't exist as a real pair) by
        returning None instead of raising. Auth failures still raise."""
        try:
            return self._signed_get(path, params, base_url)
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            if status == 400:
                try:
                    body = e.response.json()
                except ValueError:
                    body = {}
                if body.get("code") == _INVALID_SYMBOL_CODE:
                    return None
            raise

    def get_account(self) -> dict[str, Any]:
        return self._signed_get("/api/v3/account")

    def get_balances(self) -> List[dict[str, Any]]:
        """Non-zero spot balances — Binance's /account endpoint reports every
        listed asset (mostly zero balances), so filter down to holdings."""
        balances = self.get_account().get("balances") or []
        return [b for b in balances if float(b.get("free") or 0) + float(b.get("locked") or 0) > 0]

    def get_earn_flexible_positions(self) -> List[dict[str, Any]]:
        rows = self._signed_get("/sapi/v1/simple-earn/flexible/position")
        return rows.get("rows") or []

    def get_earn_locked_positions(self) -> List[dict[str, Any]]:
        rows = self._signed_get("/sapi/v1/simple-earn/locked/position")
        return rows.get("rows") or []

    def get_futures_usdm_positions(self) -> List[dict[str, Any]]:
        positions = self._signed_get("/fapi/v2/positionRisk", base_url=_FAPI_URL) or []
        return [p for p in positions if float(p.get("positionAmt") or 0) != 0]

    def get_coinm_contract_sizes(self) -> dict[str, float]:
        """contractSize per COIN-M symbol (e.g. BTCUSD_PERP -> 100, ETHUSD_PERP
        -> 10) from Binance's public dapi exchangeInfo — a COIN-M position's
        positionAmt is denominated in contracts, not coins, so this is required
        to convert to a real coin-denominated notional. Public endpoint,
        unsigned, static per symbol; cached on this client instance for the
        lifetime of one sync run."""
        if self._coinm_contract_sizes is not None:
            return self._coinm_contract_sizes
        try:
            res = http_client.get("Binance", f"{_DAPI_URL}/dapi/v1/exchangeInfo", timeout=15)
            res.raise_for_status()
            data = res.json()
        except requests.RequestException as e:
            from app.core.logging import logger
            logger.warning(f"Binance COIN-M exchangeInfo fetch failed: {e}")
            return {}
        self._coinm_contract_sizes = {
            s["symbol"]: float(s["contractSize"])
            for s in data.get("symbols", [])
            if s.get("symbol") and s.get("contractSize") is not None
        }
        return self._coinm_contract_sizes

    def get_futures_coinm_positions(self) -> List[dict[str, Any]]:
        positions = self._signed_get("/dapi/v1/positionRisk", base_url=_DAPI_URL) or []
        positions = [p for p in positions if float(p.get("positionAmt") or 0) != 0]
        if positions:
            contract_sizes = self.get_coinm_contract_sizes()
            for p in positions:
                p["contractSize"] = contract_sizes.get((p.get("symbol") or "").upper())
        return positions

    def get_valid_spot_symbols(self) -> Optional[set[str]]:
        """All symbols Binance's Spot exchange currently knows about (regardless
        of trading status — a delisted pair can still have real historical
        trades). Public endpoint, unsigned, no API key needed. Cached on this
        client instance for the lifetime of one sync run — large and
        mostly-static, so it's fetched once and reused across every candidate
        symbol instead of per-symbol. Returns None (caller should fall back to
        per-symbol probing) if the fetch itself fails."""
        if self._spot_symbols is not None:
            return self._spot_symbols
        try:
            res = http_client.get("Binance", f"{_BASE_URL}/api/v3/exchangeInfo", timeout=15)
            res.raise_for_status()
            data = res.json()
        except requests.RequestException as e:
            from app.core.logging import logger
            logger.warning(f"Binance exchangeInfo fetch failed, falling back to per-symbol probing: {e}")
            return None
        self._spot_symbols = {s["symbol"] for s in data.get("symbols", []) if s.get("symbol")}
        return self._spot_symbols

    def get_spot_trades(self, symbol: str, start_time_ms: Optional[int] = None) -> List[dict[str, Any]]:
        if symbol in _known_invalid_spot_pairs:
            return []
        # myTrades accepts symbol+startTime with no endTime (no 24h span cap
        # applies unless both are sent) — so a single call from the last
        # captured trade's time forward is sufficient for a regular sync;
        # only an unbounded/no-startTime call is capped at Binance's default
        # 500 most-recent trades.
        params = {"symbol": symbol}
        if start_time_ms is not None:
            params["startTime"] = start_time_ms
        result = self._signed_get_optional("/api/v3/myTrades", params)
        if result is None:
            _known_invalid_spot_pairs.add(symbol)
            return []
        return result

    def _get_futures_trades_windowed(
        self, path: str, param_key: str, symbol_or_pair: str, base_url: str,
        start_time_ms: Optional[int], end_time_ms: Optional[int],
    ) -> List[dict[str, Any]]:
        """Shared windowing for fapi/dapi userTrades: Binance rejects a
        startTime/endTime span over 7 days, so a gap since the last captured
        trade longer than that is walked in <=7-day chunks and concatenated.
        With no start_time_ms (first-ever sync), falls through to Binance's
        default (last 7 days), matching prior behavior."""
        if start_time_ms is None:
            return self._signed_get_optional(path, {param_key: symbol_or_pair}, base_url=base_url) or []

        end = end_time_ms if end_time_ms is not None else int(time.time() * 1000)
        trades: List[dict[str, Any]] = []
        window_start = start_time_ms
        while window_start < end:
            window_end = min(window_start + _FUTURES_TRADE_WINDOW_MS, end)
            trades.extend(
                self._signed_get_optional(
                    path,
                    {param_key: symbol_or_pair, "startTime": window_start, "endTime": window_end},
                    base_url=base_url,
                ) or []
            )
            window_start = window_end
        return trades

    def get_futures_usdm_trades(
        self, symbol: str, start_time_ms: Optional[int] = None, end_time_ms: Optional[int] = None,
    ) -> List[dict[str, Any]]:
        return self._get_futures_trades_windowed(
            "/fapi/v1/userTrades", "symbol", symbol, _FAPI_URL, start_time_ms, end_time_ms
        )

    def get_futures_coinm_trades(
        self, pair: str, start_time_ms: Optional[int] = None, end_time_ms: Optional[int] = None,
    ) -> List[dict[str, Any]]:
        return self._get_futures_trades_windowed(
            "/dapi/v1/userTrades", "pair", pair, _DAPI_URL, start_time_ms, end_time_ms
        )

    def get_candidate_spot_symbols(self, assets: set[str]) -> List[str]:
        """{asset}{quote} for each common quote pair (SPOT_TRADE_QUOTES),
        pre-filtered against exchangeInfo (fetched once per run) so only
        symbols that actually exist on Binance are returned. Shared by
        get_spot_trade_candidates (regular sync) and the backfill symbol
        discovery in PortfolioService.backfill_binance_spot."""
        candidates = [
            f"{asset}{quote}"
            for asset in assets
            for quote in SPOT_TRADE_QUOTES
            if asset != quote
        ]

        valid_symbols = self.get_valid_spot_symbols()
        if valid_symbols is None:
            to_poll = candidates
        else:
            to_poll = [c for c in candidates if c in valid_symbols]

        from app.core.logging import logger
        logger.info(
            f"Binance spot trade discovery: {len(candidates)} candidate pairs, "
            f"{len(to_poll)} polled, {len(candidates) - len(to_poll)} filtered out via exchangeInfo"
        )
        return to_poll

    def get_spot_trade_candidates(
        self, assets: set[str], start_time_ms: Optional[int] = None,
    ) -> List[dict[str, Any]]:
        """Best-effort trade history for currently-held assets — see
        get_candidate_spot_symbols for how candidate pairs are derived."""
        trades = []
        for symbol in self.get_candidate_spot_symbols(assets):
            trades.extend(self.get_spot_trades(symbol, start_time_ms=start_time_ms))
        return trades

    def get_spot_trades_page(
        self, symbol: str, from_id: int, limit: int = 1000, max_retries: int = 5,
    ) -> List[dict[str, Any]]:
        """One page of full Spot trade history for `symbol` via fromId-based
        pagination (ascending trade-ID order, no time-window cap — unlike
        get_spot_trades' startTime form, used for backfill's full-history walk
        rather than regular sync's "since last capture" gap-fill). Retries with
        exponential backoff on Binance's 429/rate-limit response; raises
        RateLimitError if still limited after `max_retries`."""
        if symbol in _known_invalid_spot_pairs:
            return []
        from app.core.logging import logger

        params = {"symbol": symbol, "fromId": from_id, "limit": limit}
        for attempt in range(max_retries):
            try:
                result = self._signed_get_optional("/api/v3/myTrades", params)
                if result is None:
                    _known_invalid_spot_pairs.add(symbol)
                    return []
                return result
            except RateLimitError:
                wait = 2 ** attempt
                logger.warning(
                    f"Binance backfill: rate limited on {symbol} (fromId={from_id}), "
                    f"backing off {wait}s (attempt {attempt + 1}/{max_retries})"
                )
                time.sleep(wait)
        raise RateLimitError(f"Binance rate limit persisted after {max_retries} retries for {symbol}")

    def health_check(self) -> bool:
        try:
            self.get_account()
            return True
        except Exception:
            return False


class BinanceBrokerProvider(BrokerProvider):
    """Registry-facing wrapper. sync() fetches Spot balances, Simple Earn positions,
    USDⓈ-M/COIN-M Futures positions, and best-effort trade history for currently-held
    assets/open futures positions, all under the credentials configured for the
    "binance" provider (Binance uses one API key across all these wallet types).
    validate() == health_check(). Only PARTIAL lifecycle status in ProviderConfig
    since order placement is still not implemented."""

    def __init__(self):
        self._client: Optional[BinanceClient] = None

    @property
    def provider_name(self) -> str:
        return "binance"

    def capabilities(self) -> List[Capability]:
        return [Capability.PORTFOLIO, Capability.HOLDINGS, Capability.TRANSACTIONS]

    def authenticate(self, api_key: str | None = None, api_secret: str | None = None, **_: str) -> None:
        if not api_key or not api_secret:
            return
        self._client = BinanceClient(api_key, api_secret)

    def _try(self, label: str, fn) -> list:
        """Binance API keys are permissioned per product — Earn/Futures may not be
        enabled even when Spot is. A permission-denied/4xx from one of these must
        not take down the whole sync (Spot would otherwise be discarded too)."""
        try:
            return fn()
        except Exception as e:
            from app.core.logging import logger
            logger.warning(f"Binance sync: {label} unavailable (likely missing API key permission): {e}")
            return []

    def sync(self, since: Optional[datetime] = None, **kwargs: Any) -> dict[str, Any]:
        """`since`: the timestamp of the most recently captured broker_trade for
        this broker (see _run_broker_sync — derived from the Transaction table,
        not a job-scheduling timestamp), used to bound trade-history fetches to
        the gap since the last successful sync instead of relying on Binance's
        defaults (Spot: most-recent-500-ever; Futures: last-7-days-ever). None
        on a first-ever sync — falls through to those same Binance defaults,
        since fetching full history here is backfill's job, not regular sync's."""
        if self._client is None:
            raise BinanceAuthError("AUTH_REQUIRED: Binance api_key/api_secret not configured")

        since_ms = int(since.timestamp() * 1000) if since is not None else None

        # Spot is the base credential check — if this fails, the key/secret itself
        # is bad, and the whole sync should fail (unchanged from prior behavior).
        spot = self._client.get_balances()
        earn = (
            self._try("Simple Earn flexible", self._client.get_earn_flexible_positions)
            + self._try("Simple Earn locked", self._client.get_earn_locked_positions)
        )
        futures_usdm = self._try("USDⓈ-M Futures positions", self._client.get_futures_usdm_positions)
        futures_coinm = self._try("COIN-M Futures positions", self._client.get_futures_coinm_positions)

        held_assets = {(b.get("asset") or "").upper() for b in spot if b.get("asset")}
        held_assets |= {(e.get("asset") or "").upper() for e in earn if e.get("asset")}
        spot_trades = (
            self._client.get_spot_trade_candidates(held_assets, start_time_ms=since_ms)
            if held_assets else []
        )

        futures_usdm_trades = []
        for pos in futures_usdm:
            symbol = pos.get("symbol")
            if symbol:
                futures_usdm_trades.extend(self._client.get_futures_usdm_trades(symbol, start_time_ms=since_ms))

        futures_coinm_trades = []
        for pos in futures_coinm:
            pair = pos.get("pair")  # dapi userTrades is scoped by pair (e.g. "BTCUSD"), not the contract symbol
            if pair:
                futures_coinm_trades.extend(self._client.get_futures_coinm_trades(pair, start_time_ms=since_ms))

        return {
            "spot": spot,
            "earn": earn,
            "futures_usdm": futures_usdm,
            "futures_coinm": futures_coinm,
            "trades": {
                "spot": spot_trades,
                "futures_usdm": futures_usdm_trades,
                "futures_coinm": futures_coinm_trades,
            },
        }

    def get_backfill_symbol_universe(self, extra_symbols: set[str]) -> List[str]:
        """Spot pairs the one-time full-history backfill should walk: every
        candidate pair for currently-held assets (same discovery as regular
        sync's get_spot_trade_candidates) plus `extra_symbols` — raw pairs
        already known-valid from existing broker_trade rows (e.g. a fully-exited
        position with no current balance, so it wouldn't otherwise be
        discovered). `extra_symbols` skip the exchangeInfo filter since they're
        already proven valid by having real trade history."""
        if self._client is None:
            raise BinanceAuthError("AUTH_REQUIRED: Binance api_key/api_secret not configured")

        spot = self._client.get_balances()
        earn = (
            self._try("Simple Earn flexible", self._client.get_earn_flexible_positions)
            + self._try("Simple Earn locked", self._client.get_earn_locked_positions)
        )
        held_assets = {(b.get("asset") or "").upper() for b in spot if b.get("asset")}
        held_assets |= {(e.get("asset") or "").upper() for e in earn if e.get("asset")}

        candidates = set(self._client.get_candidate_spot_symbols(held_assets)) if held_assets else set()
        candidates |= extra_symbols
        return sorted(candidates)

    def walk_spot_trades_page(self, symbol: str, from_id: int, limit: int = 1000) -> List[dict[str, Any]]:
        if self._client is None:
            raise BinanceAuthError("AUTH_REQUIRED: Binance api_key/api_secret not configured")
        return self._client.get_spot_trades_page(symbol, from_id=from_id, limit=limit)

    def validate(self, **kwargs: Any) -> bool:
        return self.health_check()

    def health_check(self) -> bool:
        if self._client is None:
            return False
        return self._client.health_check()


registry.register(BinanceBrokerProvider)
