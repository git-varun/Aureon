"""NAV-style basket performance computation.

Formula: NAV_T = 100 × Σ_i ( w_i × P_i,T / P_i,0 )

P_i,0 = closing price on inception_date (or earliest available)
P_i,T = closing price on day T
w_i   = weight from most recent ThemeWeight snapshot
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger("market.nav")


def compute_theme_nav(theme_id: str, days: int = 365) -> Optional[list]:
    """
    Returns a list of NAV floats (base=100) over the last `days` calendar days.
    Returns None when any constituent has zero price history rows.
    """
    try:
        import pandas as pd
        from app.core.db import SessionLocal
        from app.modules.market.models import MarketTheme, ThemeWeight
        from app.modules.portfolio.models import Asset, PriceHistory
        from sqlalchemy import func

        with SessionLocal() as db:
            theme = db.query(MarketTheme).filter_by(theme_id=theme_id).first()
            if not theme:
                return None

            # Most recent effective_date weights
            latest_date = (
                db.query(func.max(ThemeWeight.effective_date))
                .filter(ThemeWeight.theme_id == theme_id)
                .scalar()
            )

            if latest_date is None:
                # Fall back to equal weights from symbols JSON
                import json
                symbols = json.loads(theme.symbols or "[]")
                if not symbols:
                    return None
                w = 1.0 / len(symbols)
                weights = {s: w for s in symbols}
            else:
                rows = (
                    db.query(ThemeWeight)
                    .filter(ThemeWeight.theme_id == theme_id, ThemeWeight.effective_date == latest_date)
                    .all()
                )
                weights = {r.symbol: r.weight for r in rows}

            if not weights:
                return None

            inception = theme.inception_date or date.today()
            cutoff = date.today() - timedelta(days=days)

            # Fetch price history for each constituent
            price_frames = {}
            for symbol in weights:
                asset = db.query(Asset).filter_by(symbol=symbol).first()
                if not asset:
                    return None

                ph_rows = (
                    db.query(PriceHistory.date, PriceHistory.close)
                    .filter(
                        PriceHistory.asset_id == asset.id,
                        func.date(PriceHistory.date) >= cutoff,
                    )
                    .order_by(PriceHistory.date)
                    .all()
                )

                if not ph_rows:
                    return None

                dates = [r.date.date() if hasattr(r.date, "date") else r.date for r in ph_rows]
                closes = [r.close for r in ph_rows]
                s = pd.Series(closes, index=pd.DatetimeIndex(dates))
                price_frames[symbol] = s

            if len(price_frames) < len(weights):
                return None

            df = pd.DataFrame(price_frames)
            if df.empty or len(df) < 14:
                return None

            df = df.ffill().bfill()

            # Determine inception prices (P_i,0)
            inception_idx = pd.Timestamp(inception)
            # Use first available row at or after inception_date
            base_prices = {}
            for sym in weights:
                series = df[sym].dropna()
                at_or_after = series[series.index >= inception_idx]
                if at_or_after.empty:
                    base_prices[sym] = series.iloc[0]
                else:
                    base_prices[sym] = at_or_after.iloc[0]

            # Compute NAV
            nav = []
            for _, row in df.iterrows():
                val = sum(
                    weights[sym] * (row[sym] / base_prices[sym])
                    for sym in weights
                    if base_prices[sym] > 0
                )
                nav.append(round(100.0 * val, 4))

            return nav if len(nav) >= 14 else None

    except Exception as exc:
        logger.warning("compute_theme_nav failed for %s: %s", theme_id, exc)
        return None
