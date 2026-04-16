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

logger = logging.getLogger("celery.signals")


@celery_app.task(bind=True, name="signals.generate_all")
def generate_signals_task(self, symbols: Optional[List[str]] = None):
    """Generate composite signals for assets using all available providers.

    This is the main signal generation task. It:
    1. Triggers SignalService.generate_signals_batch()
    2. Delegates all business logic to providers (technical, fundamental, on-chain)
    3. Aggregates provider signals using majority voting
    4. Persists composite signals to database

    Args:
        symbols: Optional list of specific symbols. If None, generates for all assets.

    Returns:
        Dict with {status, count, symbols}
    """
    session = None
    try:
        session = SessionLocal()
        service = SignalService(session)

        # Delegate all signal generation to service
        generated_signals = service.generate_signals_batch(symbols=symbols)

        logger.info(
            f"generate_signals_task: completed with {len(generated_signals)} signals generated"
        )

        signal_ids = [s.id for s in generated_signals]
        return {
            "status": "success",
            "count": len(generated_signals),
            "signal_ids": signal_ids
        }

    except Exception as exc:
        logger.exception(f"generate_signals_task failed: {exc}")
        raise self.retry(exc=exc, countdown=60, max_retries=3)

    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="signals.generate_for_symbol")
def generate_signal_for_symbol_task(self, symbol: str, asset_type: str = "equity"):
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
        signal = service.generate_signal_for_symbol(symbol, asset_type)

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

        return {
            "status": "success",
            "symbol": symbol,
            "signal_id": signal.id,
            "action": signal.signal_type.value,
            "confidence": signal.confidence,
            "rationale": signal.rationale
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

        return {
            "status": "success",
            "signals_count": len(generated_signals)
        }

    except Exception as exc:
        logger.exception(f"daily_signal_batch_task failed: {exc}")
        raise self.retry(exc=exc, countdown=300, max_retries=2)

    finally:
        if session:
            session.close()


__all__ = [
    "generate_signals_task",
    "generate_signal_for_symbol_task",
    "daily_signal_batch_task",
]
