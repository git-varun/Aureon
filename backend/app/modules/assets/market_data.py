"""MarketDataService — yfinance-backed, Redis-cached data for any symbol.

Sits behind the portfolio DB path in AssetsService. Only reached when a symbol
is not in the Asset table (i.e. non-portfolio symbols from the market universe).

Cache TTLs:
  quote      5 min  — price changes during market hours
  ohlcv      1 h    — daily candles, sufficient for chart rendering
  fundamentals 24 h — balance-sheet data changes slowly
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.core.cache import cache
from app.shared.utils import cache_key, normalize_yf_symbol

logger = logging.getLogger("assets.market_data")

_QUOTE_TTL = 300  # 5 min
_OHLCV_TTL = 3600  # 1 h
_FUNDAMENTALS_TTL = 86400  # 24 h


def _yf_ticker(symbol: str):
    """Return a yfinance Ticker, resolving the correct exchange suffix."""
    import yfinance as yf
    yf_sym = normalize_yf_symbol(symbol, asset_type="equity", exchange="NSE")
    return yf.Ticker(yf_sym), yf_sym


class MarketDataService:
    """Fetch market data for any symbol via yfinance with Redis caching.

    All public methods return None on any failure — callers must handle None.
    Never raises; never writes to the portfolio DB.
    """

    # ── Quote ────────────────────────────────────────────────────────────────

    def get_quote(self, symbol: str) -> Optional[dict[str, Any]]:
        """Latest OHLCV + 52-week range.  Same shape as AssetsService.get_asset_quote()."""
        ck = cache_key("market", "quote", symbol)
        cached = cache.get(ck)
        if cached:
            return cached

        try:
            ticker, yf_sym = _yf_ticker(symbol)
            info = ticker.fast_info
            hist = ticker.history(period="1d", interval="1d")
            hist_52w = ticker.history(period="1y", interval="1d")

            if hist.empty:
                logger.debug("get_quote: yfinance returned empty history for %s (%s)", symbol, yf_sym)
                return None

            latest = hist.iloc[-1]
            highs = hist_52w["High"].dropna().tolist()
            lows = hist_52w["Low"].dropna().tolist()

            result: dict[str, Any] = {
                "symbol": symbol,
                "open": float(latest.get("Open", 0)) or None,
                "high": float(latest.get("High", 0)) or None,
                "low": float(latest.get("Low", 0)) or None,
                "close": float(latest.get("Close", 0)) or None,
                "volume": int(latest.get("Volume", 0)) or None,
                "previous_close": float(getattr(info, "previous_close", None) or 0) or None,
                "high_52w": max(highs) if highs else None,
                "low_52w": min(lows) if lows else None,
            }
            cache.set(ck, result, ttl=_QUOTE_TTL)
            logger.info("get_quote: fetched %s via yfinance (%s)", symbol, yf_sym)
            return result
        except Exception as exc:
            logger.warning("get_quote: failed for %s — %s", symbol, exc)
            return None

    # ── OHLCV (chart) ────────────────────────────────────────────────────────

    def get_ohlcv(self, symbol: str, days: int = 365) -> list[dict[str, Any]]:
        """Daily OHLCV candles.  Returns list[ChartCandleResponse-compatible dict].

        Technical overlays (sma50, sma200, ema20, bbu, bbl) are NOT included —
        those require depth we only compute for portfolio assets.
        """
        ck = cache_key("market", "ohlcv", symbol, str(days))
        cached = cache.get(ck)
        if cached:
            return cached

        try:
            ticker, yf_sym = _yf_ticker(symbol)
            period = _days_to_yf_period(days)
            hist = ticker.history(period=period, interval="1d")

            if hist.empty:
                logger.debug("get_ohlcv: empty history for %s (%s)", symbol, yf_sym)
                return []

            result: list[dict[str, Any]] = []
            for ts, row in hist.iterrows():
                o = row.get("Open")
                h = row.get("High")
                lo = row.get("Low")
                c = row.get("Close")
                v = row.get("Volume")
                if any(val is None or (hasattr(val, "__float__") and __import__("math").isnan(float(val))) for val in
                       [o, h, lo, c]):
                    continue
                result.append({
                    "time": int(ts.timestamp()),
                    "open": float(o),
                    "high": float(h),
                    "low": float(lo),
                    "close": float(c),
                    "volume": int(v) if v and not __import__("math").isnan(float(v)) else 0,
                })

            cache.set(ck, result, ttl=_OHLCV_TTL)
            logger.info("get_ohlcv: fetched %d candles for %s (%s)", len(result), symbol, yf_sym)
            return result
        except Exception as exc:
            logger.warning("get_ohlcv: failed for %s — %s", symbol, exc)
            return []

    # ── Fundamentals ─────────────────────────────────────────────────────────

    def get_fundamentals(self, symbol: str) -> Optional[dict[str, Any]]:
        """Fundamental metrics — same shape as AssetsService.get_fundamentals()."""
        ck = cache_key("market", "fundamentals", symbol)
        cached = cache.get(ck)
        if cached:
            return {**cached, "data_source": "cache"}

        try:
            ticker, yf_sym = _yf_ticker(symbol)
            info = ticker.info or {}

            pe = info.get("trailingPE") or info.get("forwardPE")
            pb = info.get("priceToBook")
            roe = info.get("returnOnEquity")
            de = info.get("debtToEquity")
            eps = info.get("trailingEps")
            dy = info.get("dividendYield")
            mcap = info.get("marketCap")
            high_52w = info.get("fiftyTwoWeekHigh")
            low_52w = info.get("fiftyTwoWeekLow")
            beta = info.get("beta")

            bvps = info.get("bookValue")
            graham = round((22.5 * eps * bvps) ** 0.5, 2) if eps and bvps and eps > 0 and bvps > 0 else None

            result: dict[str, Any] = {
                "symbol": symbol,
                "pe_ratio": float(pe) if pe is not None else None,
                "pb_ratio": float(pb) if pb is not None else None,
                "roe": float(roe) if roe is not None else None,
                "de_ratio": float(de) if de is not None else None,
                "eps": float(eps) if eps is not None else None,
                "dividend_yield": float(dy) if dy is not None else None,
                "market_cap": int(mcap) if mcap is not None else None,
                "high_52w": float(high_52w) if high_52w is not None else None,
                "low_52w": float(low_52w) if low_52w is not None else None,
                "graham_number": graham,
                "beta": float(beta) if beta is not None else None,
                "vol_30d": None,
                "data_source": "live" if pe is not None else "partial",
            }
            cache.set(ck, result, ttl=_FUNDAMENTALS_TTL)
            logger.info("get_fundamentals: fetched %s via yfinance (%s)", symbol, yf_sym)
            return result
        except Exception as exc:
            logger.warning("get_fundamentals: failed for %s — %s", symbol, exc)
            return None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _days_to_yf_period(days: int) -> str:
    if days <= 5:    return "5d"
    if days <= 30:   return "1mo"
    if days <= 90:   return "3mo"
    if days <= 180:  return "6mo"
    if days <= 365:  return "1y"
    if days <= 730:  return "2y"
    return "5y"
