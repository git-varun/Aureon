"""Celery tasks: market cache refresh, universe seeding, and price backfill."""

import json
import logging

from app.core.celery_app import celery_app
from app.core.db import SessionLocal

logger = logging.getLogger("tasks.market")


@celery_app.task(bind=True, name="tasks.backfill_symbol", max_retries=3)
def backfill_symbol_task(self, symbol: str, user_id: int, days: int = 1095):
    """Fetch 3 years of OHLCV for `symbol` from yfinance and write to PriceHistory.

    Publishes a Redis pub/sub event on completion so the frontend spinner clears.
    """
    from datetime import timezone

    import yfinance as yf

    from app.core.config import settings
    from app.modules.portfolio.models import Asset, PriceHistory
    from sqlalchemy import func

    try:
        with SessionLocal() as db:
            asset = db.query(Asset).filter_by(symbol=symbol).first()
            if not asset:
                # Create a minimal asset record so PriceHistory has a FK target
                from app.shared.constants import AssetType
                asset = Asset(
                    symbol=symbol,
                    name=symbol,
                    asset_type=AssetType.equity.value if hasattr(AssetType, "equity") else "equity",
                    exchange="NSE",
                    currency="INR",
                    is_active=True,
                )
                db.add(asset)
                db.flush()

            ticker = yf.Ticker(symbol)
            period = "3y" if days > 730 else ("2y" if days > 365 else "1y")
            hist = ticker.history(period=period, auto_adjust=True)

            if hist.empty:
                raise ValueError(f"yfinance returned no data for {symbol}")

            added = 0
            for ts, row in hist.iterrows():
                d = ts.to_pydatetime().replace(tzinfo=timezone.utc)
                existing = (
                    db.query(PriceHistory)
                    .filter(
                        PriceHistory.asset_id == asset.id,
                        func.date(PriceHistory.date) == d.date(),
                    )
                    .first()
                )
                if existing:
                    continue
                db.add(PriceHistory(
                    asset_id=asset.id,
                    date=d,
                    open_price=float(row.get("Open", row["Close"])),
                    high=float(row.get("High", row["Close"])),
                    low=float(row.get("Low", row["Close"])),
                    close=float(row["Close"]),
                    volume=float(row.get("Volume", 0)),
                ))
                added += 1

            db.commit()

        logger.info("backfill_symbol: %d candles written for %s (user=%s)", added, symbol, user_id)

        # Notify frontend via Redis pub/sub
        _redis_publish(settings, f"backfill:{user_id}", {"type": "backfill_done", "symbol": symbol})

    except Exception as exc:
        logger.warning("backfill_symbol failed for %s: %s", symbol, exc)
        if self.request.retries >= self.max_retries:
            try:
                _redis_publish(settings, f"backfill:{user_id}", {
                    "type": "backfill_failed",
                    "symbol": symbol,
                    "reason": str(exc),
                })
            except Exception:
                pass
        raise self.retry(exc=exc, countdown=60)


def _redis_publish(settings, channel: str, payload: dict) -> None:
    """Synchronous Redis publish — safe to call from a Celery worker."""
    try:
        import redis
        r = redis.from_url(settings.redis_url)
        r.publish(channel, json.dumps(payload))
        r.close()
    except Exception as pub_exc:
        logger.debug("redis publish failed: %s", pub_exc)


@celery_app.task(name="market.refresh_cache", bind=True)
def market_refresh_task(self):
    from app.modules.market.engine import MarketEngine

    with SessionLocal() as session:
        engine = MarketEngine(session)
        result = engine.refresh_cache()

    logger.info("market.refresh_cache completed: %s", result)
    return result


@celery_app.task(name="market.seed_universe", bind=True)
def seed_market_universe_task(self):
    """Idempotently seed well-known assets into the Asset table.

    Seeds _SEED_UNIVERSE symbols + all theme constituent symbols so that
    Terminal search, Watchlist search, and Sector Heatmap work even before
    the user has synced broker portfolios.  Does NOT overwrite prices for
    assets that already have a current_price set.
    """
    from app.modules.market.services import _SEED_UNIVERSE, _DEFAULT_THEMES
    from app.modules.portfolio.models import Asset

    # Asset type mapping from UI class → DB asset_type value
    _CLASS_TO_TYPE = {
        "stocks": "equity",
        "funds": "mutual_fund",
        "bonds": "bond",
        "crypto": "crypto",
        "retirement": "epf",
    }

    with SessionLocal() as session:
        existing = {a.symbol for a in session.query(Asset.symbol).all()}

        # Collect all symbols: seed universe + theme constituents
        entries: dict[str, dict] = {}
        for item in _SEED_UNIVERSE:
            entries[item["sym"]] = item

        for theme in _DEFAULT_THEMES:
            for sym in theme.get("symbols", []):
                if sym not in entries:
                    entries[sym] = {
                        "sym": sym, "name": sym,
                        "class": "stocks", "ex": "NSE",
                        "region": "IN", "price": None,
                    }

        added = 0
        for sym, item in entries.items():
            if sym in existing:
                continue
            asset_type = _CLASS_TO_TYPE.get(item.get("class", "stocks"), "equity")
            currency = "USD" if item.get("region") == "US" else "INR"
            session.add(Asset(
                symbol=sym,
                name=item.get("name", sym),
                asset_type=asset_type,
                exchange=item.get("ex"),
                current_price=item.get("price"),
                currency=currency,
                is_active=True,
            ))
            added += 1

        session.commit()

    logger.info("seed_market_universe: added %d new assets (%d already existed)", added, len(existing))

    # Trigger a market cache refresh now that universe is populated
    if added > 0:
        market_refresh_task.delay()

    return {"status": "success", "added": added, "skipped": len(existing)}
