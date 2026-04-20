"""Portfolio Celery tasks: sync, refresh prices, enrich technicals."""

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
