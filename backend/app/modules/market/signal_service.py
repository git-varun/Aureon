"""Compute composite technical signals for a theme basket from price history."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def compute_theme_signals(theme_id: str) -> dict[str, Any] | None:
    """Return RSI/MACD/ADX composite signal for a theme basket.

    Aggregates PriceHistory for all constituent symbols, computes a weighted
    average close series, then runs technical indicators. Returns None when
    insufficient price data is available (PriceHistory empty or sparse).
    """
    try:
        from app.core.db import SessionLocal
        from app.modules.portfolio.models import PriceHistory, Asset
        from app.modules.market.services import get_theme_detail
        import pandas as pd
        import pandas_ta  # noqa: F401

        theme = get_theme_detail(theme_id)
        if not theme:
            return None

        symbols: list[str] = [c["sym"] for c in theme.get("constituents", [])]
        if not symbols:
            return None

        db = SessionLocal()
        try:
            # Fetch price histories for all constituent symbols
            assets = db.query(Asset).filter(Asset.symbol.in_(symbols)).all()
            if not assets:
                return None

            asset_ids = [a.id for a in assets]
            rows = (
                db.query(PriceHistory)
                .filter(PriceHistory.asset_id.in_(asset_ids))
                .order_by(PriceHistory.date)
                .all()
            )
            if len(rows) < 14:
                return None

            # Build a simple equal-weight average close series
            by_date: dict = {}
            for r in rows:
                key = r.date.date()
                if key not in by_date:
                    by_date[key] = []
                by_date[key].append(r.close)

            dates = sorted(by_date.keys())
            closes = [sum(by_date[d]) / len(by_date[d]) for d in dates]

            if len(closes) < 14:
                return None

            df = pd.DataFrame({"close": closes})

            # RSI
            rsi_series = df.ta.rsi(length=14)
            rsi = round(float(rsi_series.dropna().iloc[-1]), 1) if rsi_series is not None and not rsi_series.dropna().empty else None

            # MACD
            macd_df = df.ta.macd()
            macd_val = None
            if macd_df is not None and not macd_df.empty:
                col = [c for c in macd_df.columns if "MACD_" in c and "Signal" not in c and "Hist" not in c]
                if col:
                    macd_val = round(float(macd_df[col[0]].dropna().iloc[-1]), 3)

            # ADX requires OHLC — approximate with close as high/low/open
            adx_val = None
            try:
                ohlc = pd.DataFrame({"high": closes, "low": closes, "close": closes, "open": closes})
                adx_df = ohlc.ta.adx(length=14)
                if adx_df is not None and not adx_df.empty:
                    adx_col = [c for c in adx_df.columns if c.startswith("ADX_")]
                    if adx_col:
                        adx_val = round(float(adx_df[adx_col[0]].dropna().iloc[-1]), 1)
            except Exception:
                pass

            if rsi is None:
                return None

            trend = "Bullish" if rsi > 55 else "Bearish" if rsi < 45 else "Mildly bullish"
            conf = min(90, max(50, int(50 + abs(rsi - 50))))

            return {
                "rsi": rsi,
                "macd": macd_val,
                "adx": adx_val,
                "conf": conf,
                "trend": trend,
            }
        finally:
            db.close()
    except Exception as exc:
        logger.warning("compute_theme_signals(%s) failed: %s", theme_id, exc)
        return None
