"""Celery tasks for signal generation.

Task layer is thin and only handles scheduling and orchestration.
All business logic is delegated to SignalService and signal providers.
"""

import logging
from typing import Optional, List

from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.modules.signals.services import SignalService
from app.modules.portfolio.models import Asset
from app.modules.recommendations.materializer import materialize_from_signals
from app.shared.utils import report_task_status

logger = logging.getLogger("celery.signals")


@celery_app.task(bind=True, name="signals.generate_all")
def generate_signals_task(self, symbols: Optional[List[str]] = None, user_id: Optional[int] = None):
    """Generate composite signals for assets using all available providers."""
    session = None
    task_id = getattr(self.request, "id", None)
    try:
        session = SessionLocal()
        service = SignalService(session)

        # Delegate all signal generation to service
        generated_signals = service.generate_signals_batch(symbols=symbols, user_id=user_id)

        logger.info(
            f"generate_signals_task: completed with {len(generated_signals)} signals generated"
        )

        rec_counts = materialize_from_signals(session, user_id=user_id)
        logger.info(f"generate_signals_task: rec materialize {rec_counts}")

        if task_id:
            report_task_status(task_id, "SUCCESS")

        signal_ids = [s.id for s in generated_signals]
        return {
            "status": "success",
            "count": len(generated_signals),
            "signal_ids": signal_ids,
            "recommendations": rec_counts,
        }

    except Exception as exc:
        logger.exception(f"generate_signals_task failed: {exc}")
        if task_id:
            report_task_status(task_id, "FAILED", error=str(exc))
        raise self.retry(exc=exc, countdown=60, max_retries=3)

    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="signals.generate_for_symbol")
def generate_signal_for_symbol_task(self, symbol: str, asset_type: str = "equity", user_id: Optional[int] = None):
    """Generate a composite signal for a specific symbol.

    Generates signals using all available providers and aggregates using majority voting.

    Args:
        symbol: Asset symbol (e.g., RELIANCE, BTC)
        asset_type: 'equity' or 'crypto'

    Returns:
        Dict with {status, signal_id, action, confidence}
    """
    session = None
    try:
        session = SessionLocal()
        service = SignalService(session)

        # Delegate signal generation to service
        signal = service.generate_signal_for_symbol(symbol, asset_type, user_id=user_id)

        if not signal:
            logger.warning(f"generate_signal_for_symbol_task: no signal generated for {symbol}")
            return {
                "status": "no_signal",
                "symbol": symbol,
                "message": "No providers could generate a signal"
            }

        logger.info(
            f"generate_signal_for_symbol_task: signal generated for {symbol} "
            f"action={signal.signal_type} confidence={signal.confidence:.2f}"
        )

        rec_counts = materialize_from_signals(session, user_id=user_id)
        logger.info(f"generate_signal_for_symbol_task: rec materialize {rec_counts}")

        return {
            "status": "success",
            "symbol": symbol,
            "signal_id": signal.id,
            "action": signal.signal_type.value,
            "confidence": signal.confidence,
            "rationale": signal.rationale,
            "recommendations": rec_counts,
        }

    except Exception as exc:
        logger.exception(f"generate_signal_for_symbol_task failed for {symbol}: {exc}")
        raise self.retry(exc=exc, countdown=30, max_retries=2)

    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="signals.daily_batch")
def daily_signal_batch_task(self):
    """Scheduled daily task: generate signals for all assets.

    This task runs on a cron schedule and:
    1. Queries all assets from the database
    2. Triggers signal generation for each asset
    3. Uses majority voting to aggregate provider signals
    4. Persists composite signals

    Returns:
        Dict with {status, signals_count}
    """
    session = None
    try:
        logger.info("daily_signal_batch_task: starting")
        session = SessionLocal()
        service = SignalService(session)

        # Delegate all signal generation to service
        generated_signals = service.generate_signals_batch(symbols=None)

        logger.info(
            f"daily_signal_batch_task: completed with {len(generated_signals)} signals"
        )

        rec_counts = materialize_from_signals(session)
        logger.info(f"daily_signal_batch_task: rec materialize {rec_counts}")

        return {
            "status": "success",
            "signals_count": len(generated_signals),
            "recommendations": rec_counts,
        }

    except Exception as exc:
        logger.exception(f"daily_signal_batch_task failed: {exc}")
        raise self.retry(exc=exc, countdown=300, max_retries=2)

    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="signals.compute_technicals")
def compute_technicals_task(self):
    """Compute RSI, MACD, Bollinger Bands for all assets with sufficient price history.

    Upserts one TechnicalIndicators row per asset (keyed by symbol).
    Requires at least 14 price history rows per asset.
    """
    from datetime import datetime, timedelta
    from app.modules.analytics.models import TechnicalIndicators
    from app.modules.portfolio.models import Asset, PriceHistory
    from app.shared.quant import QuantEngine

    session = None
    try:
        session = SessionLocal()
        qe = QuantEngine()
        cutoff = datetime.utcnow() - timedelta(days=60)

        assets = session.query(Asset).filter(Asset.current_price.isnot(None)).all()
        processed = 0
        skipped = 0

        for asset in assets:
            prices = (
                session.query(PriceHistory)
                .filter(PriceHistory.asset_id == asset.id, PriceHistory.date >= cutoff)
                .order_by(PriceHistory.date.asc())
                .all()
            )
            if len(prices) < 14:
                skipped += 1
                continue

            indicators = qe.compute_all(prices)

            bb = indicators.get("bollinger") or {}
            existing = (
                session.query(TechnicalIndicators)
                .filter(TechnicalIndicators.symbol == asset.symbol)
                .first()
            )
            if existing:
                existing.rsi = indicators.get("rsi_14")
                existing.macd = indicators.get("macd")
                existing.bollinger_upper = bb.get("upper") if isinstance(bb, dict) else None
                existing.bollinger_lower = bb.get("lower") if isinstance(bb, dict) else None
                existing.vwap = indicators.get("vwap")
            else:
                session.add(TechnicalIndicators(
                    symbol=asset.symbol,
                    rsi=indicators.get("rsi_14"),
                    macd=indicators.get("macd"),
                    bollinger_upper=bb.get("upper") if isinstance(bb, dict) else None,
                    bollinger_lower=bb.get("lower") if isinstance(bb, dict) else None,
                    vwap=indicators.get("vwap"),
                ))
            processed += 1

        session.commit()
        logger.info("compute_technicals: processed=%d skipped=%d", processed, skipped)
        return {"status": "success", "processed": processed, "skipped": skipped}
    except Exception as exc:
        logger.exception("compute_technicals failed: %s", exc)
        if session:
            session.rollback()
        raise
    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="signals.clean_stale")
def clean_stale_signals_task(self):
    from app.core.db import SessionLocal
    from app.modules.signals.models import Signal
    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    with SessionLocal() as db:
        deleted = db.query(Signal).filter(Signal.created_at < cutoff).delete()
        db.commit()
    logger.info("clean_stale_signals: deleted=%d", deleted)
    return {"status": "ok", "deleted": deleted}


__all__ = [
    "generate_signals_task",
    "generate_signal_for_symbol_task",
    "daily_signal_batch_task",
    "compute_technicals_task",
    "clean_stale_signals_task",
]
