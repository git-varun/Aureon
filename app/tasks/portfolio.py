"""Portfolio Celery tasks: sync, refresh prices, enrich technicals, seed OHLCV history."""

import logging
from datetime import datetime, timezone
from typing import Optional

from app.core.cache import cache
from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.modules.portfolio.services import PortfolioService
from app.shared.utils import cache_key

logger = logging.getLogger("celery.portfolio")


@celery_app.task(bind=True, name="portfolio.sync")
def sync_portfolio_task(self, broker: str, force_refresh: bool = True, dry_run: bool = False):
    """Sync portfolio holdings from broker via real provider factory.

    Returns a structured result with stage, counts, and any errors so that
    AsyncResult polling surfaces meaningful progress.
    """
    logger.info(
        "[sync:%s] task started task_id=%s force_refresh=%s dry_run=%s.",
        broker,
        getattr(self.request, "id", None),
        force_refresh,
        dry_run,
    )

    errors = []
    holdings_count = 0
    updated_assets = 0
    cred_session = None

    # ── Stage 1: resolve provider ────────────────────────────────────────────
    try:
        from app.modules.portfolio.providers.factory import get_broker_provider
        cred_session = SessionLocal()
        provider = get_broker_provider(broker, session=cred_session)
        logger.info("[sync:%s] provider resolved -> %s", broker, provider.provider_name)
    except ValueError as exc:
        logger.error("[sync:%s] unsupported broker: %s", broker, exc)
        if cred_session:
            cred_session.close()
        return {"status": "error", "broker": broker, "stage": "resolve", "errors": [str(exc)]}

    # ── Stage 2: credential validation ──────────────────────────────────────
    try:
        provider.validate_credentials()
        logger.info("[sync:%s] credentials validated", broker)
    except Exception as exc:
        logger.error("[sync:%s] credential validation failed: %s", broker, exc)
        if cred_session:
            cred_session.close()
        return {"status": "error", "broker": broker, "stage": "validation", "errors": [str(exc)]}

    # ── dry_run: credential check only, skip fetch + persist ────────────────
    if dry_run:
        logger.info("[sync:%s] dry_run=true -> stopping after credential validation.", broker)
        if cred_session:
            cred_session.close()
        return {"status": "ok", "broker": broker, "stage": "validated", "dry_run": True, "errors": []}

    # ── Stage 3: delegate sync to service ────────────────────────────────────
    service_session = None
    try:
        service_session = SessionLocal()
        service = PortfolioService(service_session)
        result = service.sync_portfolio(provider, force_refresh=force_refresh, dry_run=dry_run)
        holdings_count = result.get("holdings_count", 0)
        updated_assets = result.get("updated_assets", 0)
        errors = result.get("errors", [])
        logger.info("[sync:%s] service sync result=%s", broker, result.get("status"))
        if result.get("status") == "dry_run":
            return {
                "status": "ok",
                "broker": broker,
                "stage": "validated",
                "dry_run": True,
                "holdings_count": holdings_count,
                "updated_assets": updated_assets,
                "errors": errors,
            }
    except Exception as exc:
        logger.exception("[sync:%s] persistence failed: %s", broker, exc)
        errors.append(str(exc))
        raise self.retry(exc=exc, countdown=60, max_retries=3)
    finally:
        if service_session is not None:
            service_session.close()
        if cred_session is not None:
            cred_session.close()

    # ── Stage 4: cache invalidation ──────────────────────────────────────────
    cache.clear_pattern("portfolio:*")
    cache.set(
        "portfolio:sync_status",
        {"status": "success", "broker": broker, "timestamp": datetime.now(timezone.utc).isoformat()},
        ttl=3600,
    )

    logger.info(
        "[sync:%s] completed holdings=%d upserted=%d errors=%d",
        broker,
        holdings_count,
        updated_assets,
        len(errors),
    )
    return {
        "status": "success",
        "broker": broker,
        "stage": "persisted",
        "holdings_count": holdings_count,
        "updated_assets": updated_assets,
        "errors": errors,
    }


@celery_app.task(bind=True, name="portfolio.refresh_prices")
def refresh_prices_task(self, symbol: Optional[str] = None):
    """Refresh current prices for all assets.

    Thin Celery wrapper — all business logic lives in AssetsService.refresh_prices().
    """
    session = None
    try:
        logger.info("refresh_prices_task: symbol=%s", symbol or "all")
        from app.modules.assets.services import AssetsService
        session = SessionLocal()
        result = AssetsService(session).refresh_prices(symbol=symbol)
        logger.info("refresh_prices_task: %s", result)
        return result
    except Exception as exc:
        logger.exception("refresh_prices_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=30, max_retries=2)
    finally:
        if session is not None:
            session.close()


@celery_app.task(bind=True, name="portfolio.enrich_technicals")
def enrich_technicals_task(self, symbol: str):
    """Compute technical indicators for an asset. Delegates to QuantEngine (Phase 3)."""
    try:
        logger.info(f"Enriching technicals for {symbol}")
        session = SessionLocal()
        service = PortfolioService(session)

        asset = service.get_asset(symbol)
        if not asset:
            session.close()
            raise ValueError(f"Asset {symbol} not found")

        from app.modules.portfolio.models import PriceHistory
        prices = (
            session.query(PriceHistory)
            .filter_by(asset_id=asset.id)
            .order_by(PriceHistory.date)
            .all()
        )
        session.close()

        if len(prices) < 14:
            logger.warning(f"Insufficient history for {symbol}: {len(prices)} candles")
            return {"status": "skip", "reason": "insufficient_history", "symbol": symbol}

        from app.shared.quant import QuantEngine
        technicals = QuantEngine().compute_all(prices)

        # Upsert TechnicalIndicators row for this symbol
        session2 = SessionLocal()
        try:
            from app.modules.analytics.models import TechnicalIndicators
            record = session2.query(TechnicalIndicators).filter_by(symbol=symbol).first()
            macd_dict = technicals.get("macd") or {}
            bollinger_dict = technicals.get("bollinger") or {}
            if record:
                record.rsi             = technicals.get("rsi_14")
                record.macd            = macd_dict.get("value")
                record.bollinger_upper = bollinger_dict.get("upper")
                record.bollinger_lower = bollinger_dict.get("lower")
            else:
                record = TechnicalIndicators(
                    symbol=symbol,
                    rsi=technicals.get("rsi_14"),
                    macd=macd_dict.get("value"),
                    bollinger_upper=bollinger_dict.get("upper"),
                    bollinger_lower=bollinger_dict.get("lower"),
                )
                session2.add(record)
            session2.commit()
        except Exception as db_exc:
            logger.warning(f"TechnicalIndicators DB write failed for {symbol}: {db_exc}")
            session2.rollback()
        finally:
            session2.close()

        cache.set(cache_key("technicals", symbol), technicals, ttl=3600)
        logger.info(f"Technicals enriched and cached for {symbol}")
        return {"status": "success", "symbol": symbol, "technicals": technicals}

    except Exception as exc:
        logger.exception(f"Technical enrichment failed for {symbol}: {exc}")
        raise self.retry(exc=exc, countdown=30, max_retries=2)


# ---------------------------------------------------------------------------
# OHLCV history seeding
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="portfolio.seed_price_history", max_retries=1)
def seed_price_history_task(self, symbol: Optional[str] = None, days: int = 365, force: bool = False):
    """Seed real OHLCV price history for all assets (or one symbol).

    Sources:
    - Equity: yfinance ticker.history()
    - Crypto (*-USD-*): yfinance using base pair (e.g. BTC-USD-SPOT → BTC-USD)
    - Mutual Fund (*_MF): mfapi.in historical NAV
    """
    session = None
    try:
        from app.modules.portfolio.models import Asset, PriceHistory
        from app.shared.constants import AssetType
        from sqlalchemy import func

        session = SessionLocal()
        if symbol:
            assets = session.query(Asset).filter(Asset.symbol == symbol).all()
        else:
            assets = session.query(Asset).all()

        seeded = 0
        skipped = 0
        seen_yf_symbols: set = set()  # deduplicate crypto base pairs across compound symbols
        for asset in assets:
            try:
                if not force and asset.last_seeded_at:
                    age_days = (datetime.now(timezone.utc) - asset.last_seeded_at.replace(tzinfo=timezone.utc)).days
                    if age_days < 7:
                        skipped += 1
                        continue

                # For crypto, multiple compound symbols share the same yfinance base pair
                # (BTC-USD-SPOT, BTC-USD-EARN-FLEX, BTC-USD-FUTURES-MARGIN → all BTC-USD).
                # Fetch OHLCV once; each asset row still gets its own PriceHistory records.
                if asset.asset_type == AssetType.CRYPTO:
                    parts = asset.symbol.split("-")
                    yf_key = f"{parts[0]}-{parts[1]}" if len(parts) >= 2 else asset.symbol
                    if yf_key in seen_yf_symbols:
                        logger.debug("seed_price_history: dedup crypto %s (yf_key=%s already seeded)",
                                     asset.symbol, yf_key)
                        skipped += 1
                        continue
                    seen_yf_symbols.add(yf_key)

                rows = _fetch_ohlcv(asset, days)
                if not rows:
                    logger.warning("seed_price_history: no data for %s", asset.symbol)
                    continue

                for row in rows:
                    date_val = row["date"]
                    existing = session.query(PriceHistory).filter(
                        PriceHistory.asset_id == asset.id,
                        func.date(PriceHistory.date) == date_val.date() if hasattr(date_val, "date") else date_val,
                    ).first()
                    if existing:
                        existing.open_price = row["open"]
                        existing.high = row["high"]
                        existing.low = row["low"]
                        existing.close = row["close"]
                        existing.volume = row["volume"]
                    else:
                        session.add(PriceHistory(
                            asset_id=asset.id,
                            date=date_val,
                            open_price=row["open"],
                            high=row["high"],
                            low=row["low"],
                            close=row["close"],
                            volume=row["volume"],
                        ))

                asset.last_seeded_at = datetime.now(timezone.utc)
                session.commit()
                seeded += 1
                logger.info("seed_price_history: seeded %d candles for %s", len(rows), asset.symbol)

            except Exception as exc:
                session.rollback()
                logger.warning("seed_price_history: failed for %s: %s", asset.symbol, exc)

        return {"status": "success", "seeded": seeded, "skipped": skipped}

    except Exception as exc:
        logger.exception("seed_price_history_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=120)
    finally:
        if session:
            session.close()


def _fetch_ohlcv(asset, days: int) -> list:
    """Fetch OHLCV rows for one asset from the appropriate source."""
    from app.shared.constants import AssetType

    sym = asset.symbol
    atype = asset.asset_type

    # Mutual fund: mfapi historical NAV (daily)
    if atype == AssetType.MUTUAL_FUND or (asset.sub_type and "mutual" in asset.sub_type):
        from app.modules.assets.providers.mfapi import MFAPIPriceProvider
        provider = MFAPIPriceProvider(None)
        raw = provider.get_historical_nav(sym, limit=days)
        rows = []
        for entry in raw:
            try:
                import datetime as dt
                d = dt.datetime.strptime(entry["date"], "%d-%m-%Y").replace(tzinfo=timezone.utc)
                nav = float(entry["nav"])
                rows.append({"date": d, "open": nav, "high": nav, "low": nav, "close": nav, "volume": 0})
            except Exception:
                pass
        return rows

    # Crypto: derive yfinance pair, fall back to CoinGecko when yfinance returns nothing.
    # CoinGecko resolves any ticker via search so new/rebranded coins work automatically.
    if atype == AssetType.CRYPTO:
        parts = sym.split("-")
        base = parts[0]
        yf_sym = f"{base}-{parts[1]}" if len(parts) >= 2 else sym
        rows = _yfinance_ohlcv(yf_sym, days)
        if not rows:
            logger.debug("_fetch_ohlcv: yfinance empty for %s, trying CoinGecko", yf_sym)
            rows = _coingecko_ohlcv(base, days)
        return rows

    # Equity: use yfinance directly
    return _yfinance_ohlcv(sym, days)


def _coingecko_ohlcv(base: str, days: int) -> list:
    """CoinGecko OHLCV fallback for crypto. Resolves any ticker via search — no static map needed."""
    import time
    from app.modules.portfolio.providers.price.coingecko import CoinGeckoProvider
    time.sleep(1)  # avoid 429 when called after multiple back-to-back yfinance attempts
    provider = CoinGeckoProvider()
    return provider.get_ohlcv(base, days)


def _yfinance_ohlcv(yf_symbol: str, days: int) -> list:
    """Fetch OHLCV from yfinance for given symbol."""
    try:
        import yfinance as yf
        period = "1y" if days <= 365 else "2y"
        ticker = yf.Ticker(yf_symbol)
        hist = ticker.history(period=period, auto_adjust=True)
        if hist.empty:
            return []
        rows = []
        for ts, row in hist.iterrows():
            d = ts.to_pydatetime().replace(tzinfo=timezone.utc)
            rows.append({
                "date": d,
                "open": float(row.get("Open", row["Close"])),
                "high": float(row.get("High", row["Close"])),
                "low": float(row.get("Low", row["Close"])),
                "close": float(row["Close"]),
                "volume": float(row.get("Volume", 0)),
            })
        return rows
    except Exception as exc:
        logger.debug("yfinance ohlcv failed for %s: %s", yf_symbol, exc)
        return []
