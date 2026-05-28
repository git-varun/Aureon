"""MarketEngine — provider-agnostic orchestrator for market-wide data.

DB-first: reads live prices from Asset + PriceHistory tables (the user's
universe). Falls back to _SEED_* constants from services.py on cold start.
YahooFinanceProvider is used for index snapshots only (^NSEI etc.).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.cache import cache
from app.shared.utils import cache_key

logger = logging.getLogger("market.engine")

# Asset type → UI class mapping (mirrors aureon/services.py).
_TYPE_TO_CLASS = {
    "equity": "stocks",
    "crypto": "crypto",
    "mutual_fund": "funds",
    "bond": "bonds",
    "real_estate": "real_estate",
    "epf": "retirement",
    "ppf": "retirement",
    "insurance": "insurance",
    "commodity": "stocks",
}

# Index symbols to fetch from yfinance.
_INDEX_TICKERS = [
    ("^NSEI", "NIFTY 50", "IN"),
    ("^BSESN", "SENSEX", "IN"),
    ("^NSEBANK", "BANK NIFTY", "IN"),
    ("^NSEMDCP50", "NIFTY MIDCAP 50", "IN"),
    ("^GSPC", "S&P 500", "US"),
    ("^IXIC", "NASDAQ", "US"),
    ("^FTSE", "FTSE 100", "EU"),
    ("^N225", "NIKKEI 225", "AS"),
    ("^HSI", "HANG SENG", "AS"),
]

# How long cached market data is valid (seconds).
_CACHE_TTL = 15 * 60  # 15 min


class MarketEngine:
    """Orchestrates market data refresh from DB + optional live feeds."""

    def __init__(self, session: Session) -> None:
        self._db = session

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fetch_universe(self) -> List[Dict[str, Any]]:
        from app.modules.portfolio.models import Asset, PriceHistory

        rows = (
            self._db.query(Asset)
            .filter(Asset.current_price.isnot(None))
            .all()
        )

        # Bulk fetch 30-day price history for all assets in one query.
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        asset_ids = [a.id for a in rows]
        spark_map: Dict[int, List[float]] = {}
        if asset_ids:
            ph_rows = (
                self._db.query(PriceHistory.asset_id, PriceHistory.close)
                .filter(
                    PriceHistory.asset_id.in_(asset_ids),
                    PriceHistory.date >= thirty_days_ago,
                )
                .order_by(PriceHistory.asset_id, PriceHistory.date)
                .all()
            )
            for ph in ph_rows:
                spark_map.setdefault(ph.asset_id, []).append(ph.close)

        result = []
        for a in rows:
            meta = a.asset_metadata or {}
            sector = meta.get("sector") if isinstance(meta, dict) else None
            prev = float(a.previous_close or a.current_price)
            price = float(a.current_price)
            day_pct = (price - prev) / prev if prev else 0.0
            is_nse = (a.asset_type or "").lower() == "equity"
            result.append({
                "sym": a.symbol,
                "name": a.name,
                "ex": "NSE" if is_nse else (a.currency or ""),
                "region": "IN" if (a.currency or "INR") == "INR" else "US",
                "class": _TYPE_TO_CLASS.get((a.asset_type or "").lower(), "stocks"),
                "sector": sector,
                "price": price,
                "dayPct": round(day_pct, 6),
                "mcap": meta.get("mcap") if isinstance(meta, dict) else None,
                "spark": spark_map.get(a.id, []),
            })
        return result

    def fetch_movers(self, universe: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        if universe is None:
            universe = self.fetch_universe()
        active = [u for u in universe if u.get("class") in ("stocks", "crypto", "funds")]
        if not active:
            return {"gainers": [], "losers": []}
        sorted_by_abs = sorted(active, key=lambda x: abs(x.get("dayPct", 0.0)), reverse=True)
        gainers = sorted([x for x in sorted_by_abs if x.get("dayPct", 0) > 0], key=lambda x: -x["dayPct"])[:5]
        losers = sorted([x for x in sorted_by_abs if x.get("dayPct", 0) < 0], key=lambda x: x["dayPct"])[:5]
        return {"gainers": gainers, "losers": losers}

    def fetch_sectors(self, universe: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        if universe is None:
            universe = self.fetch_universe()
        totals: Dict[str, Dict[str, float]] = {}
        grand = sum(u.get("price", 0) for u in universe if u.get("sector"))
        for u in universe:
            sec = u.get("sector")
            if not sec:
                continue
            bucket = totals.setdefault(sec, {"price_sum": 0.0, "day_sum": 0.0, "count": 0})
            bucket["price_sum"] += u.get("price", 0.0)
            bucket["day_sum"] += u.get("dayPct", 0.0)
            bucket["count"] += 1
        result = []
        for name, b in sorted(totals.items(), key=lambda x: -x[1]["price_sum"]):
            wt = b["price_sum"] / grand if grand else 0.0
            avg_day = b["day_sum"] / b["count"] if b["count"] else 0.0
            result.append({"name": name, "wt": round(wt, 4), "dayPct": round(avg_day, 6)})
        return result

    def fetch_indices(self) -> List[Dict[str, Any]]:
        try:
            import yfinance as yf
            result = []
            for yf_sym, label, region in _INDEX_TICKERS:
                try:
                    hist = yf.Ticker(yf_sym).history(period="1mo")
                    if hist.empty:
                        logger.debug("index history empty for %s", yf_sym)
                        continue
                    closes = hist["Close"].dropna().tolist()
                    price = closes[-1] if closes else 0.0
                    prev = closes[-2] if len(closes) >= 2 else price
                    day_pct = (price - prev) / prev if prev else 0.0
                    result.append({
                        "sym": label,
                        "region": region,
                        "value": round(float(price), 2),
                        "dayPct": round(day_pct, 6),
                        "spark": [round(v, 2) for v in closes],
                    })
                except Exception as e:
                    logger.debug("index fetch failed for %s: %s", yf_sym, e)
            return result
        except ImportError:
            logger.warning("yfinance not installed; skipping live index fetch")
            return []

    def fetch_themes(self) -> List[Dict[str, Any]]:
        from app.modules.market.models import MarketTheme
        rows = self._db.query(MarketTheme).all()
        if not rows:
            return []
        result = []
        for t in rows:
            syms = json.loads(t.symbols or "[]")
            ret1m = self._compute_ret1m(syms)
            t.ret1m = ret1m
            result.append({
                "id": t.theme_id,
                "name": t.name,
                "desc": t.desc,
                "count": len(syms),
                "ret1m": ret1m,
            })
        self._db.commit()
        return result

    def _compute_ret1m(self, symbols: List[str]) -> float:
        """Average 30-day return across all symbols, falling back to yfinance for those not in PriceHistory."""
        from app.modules.portfolio.models import Asset, PriceHistory
        if not symbols:
            return 0.0
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        returns = []
        missing = []

        for sym in symbols:
            asset = self._db.query(Asset).filter_by(symbol=sym).first()
            if not asset:
                missing.append(sym)
                continue
            ph = (
                self._db.query(PriceHistory.close)
                .filter(
                    PriceHistory.asset_id == asset.id,
                    PriceHistory.date >= thirty_days_ago,
                )
                .order_by(PriceHistory.date)
                .all()
            )
            closes = [r.close for r in ph]
            if len(closes) >= 2:
                returns.append((closes[-1] - closes[0]) / closes[0])
            else:
                missing.append(sym)

        # yfinance fallback for symbols not found in DB
        if missing:
            try:
                import yfinance as yf
                for sym in missing:
                    # Try NSE suffix first, then bare symbol (for US/crypto)
                    for ticker_sym in (f"{sym}.NS", sym):
                        try:
                            hist = yf.Ticker(ticker_sym).history(period="1mo")
                            if hist.empty:
                                continue
                            closes = hist["Close"].dropna().tolist()
                            if len(closes) >= 2:
                                returns.append((closes[-1] - closes[0]) / closes[0])
                            break
                        except Exception:
                            continue
            except ImportError:
                logger.debug("yfinance not installed; skipping theme ret1m fallback")

        return round(sum(returns) / len(returns), 6) if returns else 0.0

    def fetch_fx_rate(self, pair: str = "USD_INR") -> Optional[float]:
        cached = cache.get(cache_key("fx", pair.lower()))
        if cached:
            return float(cached)
        try:
            import yfinance as yf
            sym = pair.replace("_", "") + "=X"
            t = yf.Ticker(sym)
            info = t.info
            rate = info.get("regularMarketPrice") or info.get("previousClose")
            return float(rate) if rate else None
        except Exception as e:
            logger.debug("fx_rate fetch failed for %s: %s", pair, e)
        return None

    def refresh_cache(self) -> Dict[str, Any]:
        """Rebuild all market cache keys and return counts for logging."""
        universe = self.fetch_universe()
        movers = self.fetch_movers(universe)
        sectors = self.fetch_sectors(universe)
        indices = self.fetch_indices()
        themes = self.fetch_themes()
        fx_rate = self.fetch_fx_rate()

        cache.set(cache_key("market", "universe"), universe, ttl=_CACHE_TTL)
        if movers["gainers"] or movers["losers"]:
            cache.set(cache_key("market", "movers"), movers, ttl=_CACHE_TTL)
        if sectors:
            cache.set(cache_key("market", "sectors"), sectors, ttl=_CACHE_TTL)
        if indices:
            cache.set(cache_key("market", "indices"), indices, ttl=_CACHE_TTL)
        if themes:
            cache.set(cache_key("market", "themes"), themes, ttl=_CACHE_TTL)
        if fx_rate:
            cache.set(cache_key("fx", "usd_inr"), fx_rate, ttl=_CACHE_TTL)

        return {
            "universe": len(universe),
            "sectors": len(sectors),
            "indices": len(indices),
            "themes": len(themes),
            "movers": {"gainers": len(movers["gainers"]), "losers": len(movers["losers"])},
            "fx_rate": fx_rate,
        }
