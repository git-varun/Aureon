"""Signals API routes - public-facing endpoints for trading signals.

All signal generation is delegated to Celery tasks which in turn delegate to
the SignalService and signal providers. The routes are thin wrappers that:
1. Accept user requests
2. Dispatch to Celery tasks
3. Return async task status

Signal flow:
  API Route → Celery Task → SignalService → Signal Providers → Database
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from celery.result import AsyncResult

from app.core.dependencies import get_session, require_auth
from app.modules.signals.services import SignalService
from app.modules.signals.schemas import SignalResponse, GenerateSignalsRequest
from app.tasks.signals import generate_signals_task, generate_signal_for_symbol_task

router = APIRouter(prefix="/api/signals", tags=["signals"])


@router.get("/{symbol}", response_model=Optional[SignalResponse])
def get_signal(symbol: str, session: Session = Depends(get_session), current_user=Depends(require_auth)):
    """Get the latest signal for an asset.

    Returns the most recent composite signal, or null (200) when none exists.
    """
    from app.modules.signals.models import Signal
    from sqlalchemy import desc
    signal = (
        session.query(Signal)
        .filter(Signal.symbol == symbol, Signal.user_id == current_user.id)
        .order_by(desc(Signal.created_at))
        .first()
    )
    if not signal:
        return None
    return SignalResponse.model_validate(signal)


@router.get("", response_model=List[SignalResponse])
def list_signals(
        limit: int = Query(10, ge=1, le=100),
        session: Session = Depends(get_session),
        current_user=Depends(require_auth)
):
    """List the most recent signals for the authenticated user."""
    from sqlalchemy import func, desc
    from app.modules.signals.models import Signal

    # Get the latest signal per symbol for this user
    subquery = (
        session.query(Signal.symbol, func.max(Signal.created_at).label("max_date"))
        .filter(Signal.user_id == current_user.id)
        .group_by(Signal.symbol)
        .order_by(desc(func.max(Signal.created_at)))
        .limit(limit)
        .subquery()
    )

    signals = session.query(Signal).join(
        subquery,
        (Signal.symbol == subquery.c.symbol) & (Signal.created_at == subquery.c.max_date)
    ).filter(Signal.user_id == current_user.id).all()

    return [SignalResponse.from_orm(s) for s in signals]


@router.post("/generate")
def generate_signals(
        req: GenerateSignalsRequest,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth)
):
    """Enqueue signal generation for specified symbols."""
    task = generate_signals_task.delay(symbols=req.symbols, user_id=current_user.id)
    return {
        "status": "enqueued",
        "task_id": task.id,
        "symbols": req.symbols or "all"
    }


@router.post("/generate/{symbol}")
def generate_signal_for_symbol(
        symbol: str,
        asset_type: str = Query("equity", pattern="^(equity|crypto)$"),
        session: Session = Depends(get_session),
        current_user=Depends(require_auth)
):
    """Generate a signal for a specific symbol."""
    task = generate_signal_for_symbol_task.delay(symbol, asset_type, user_id=current_user.id)
    return {
        "status": "enqueued",
        "task_id": task.id,
        "symbol": symbol,
        "asset_type": asset_type
    }


@router.get("/generate/{task_id}")
def get_signal_generation_status(task_id: str, _user=Depends(require_auth)):
    """Check the status of an async signal generation task.

    Args:
        task_id: Celery task ID returned from /api/signals/generate endpoints

    Returns:
        {task_id: str, status: str, result: dict | None}

    Status values:
        - PENDING: Task queued but not started
        - STARTED: Task is running
        - SUCCESS: Task completed successfully
        - FAILURE: Task failed with exception
        - RETRY: Task retrying after failure
    """
    result = AsyncResult(task_id)
    response = {
        "task_id": task_id,
        "status": result.status,
    }

    if result.ready():
        if result.successful():
            response["result"] = result.result
        else:
            response["error"] = str(result.info)

    return response
