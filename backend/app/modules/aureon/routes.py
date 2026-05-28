"""Aureon API routes — composite state, asset detail, activity ledger."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import require_auth, get_session

from pydantic import BaseModel

from .services import build_asset_detail, build_aureon_state, _build_activity, build_portfolio_history, ask_about_context

router = APIRouter(prefix="/api/aureon", tags=["aureon"])


@router.get("/state")
def get_aureon_state(
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Composite cold-load for the Aureon UI. Returns pre-computed cache when available."""
    from app.core.cache import cache
    from app.shared.utils import cache_key
    cached = cache.get(cache_key("aureon", "state", str(current_user.id)))
    if cached:
        return cached
    return build_aureon_state(session, user_id=current_user.id)


@router.get("/assets/{ticker}")
def get_asset_detail(
        ticker: str,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    payload = build_asset_detail(session, ticker.upper(), user_id=current_user.id)
    if not payload:
        raise HTTPException(status_code=404, detail=f"Asset {ticker} not found")
    return payload


@router.get("/activity")
def get_activity(
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    return {"items": _build_activity(session, user_id=current_user.id)}


@router.get("/portfolio/history")
def get_portfolio_history(
        days: int = Query(default=60, ge=7, le=365),
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Daily net-worth history for the portfolio chart."""
    return {"history": build_portfolio_history(session, user_id=current_user.id, days=days)}


@router.post("/signals/generate")
def generate_signals(
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Re-run signal generation for all user positions."""
    from app.modules.signals.services import SignalService
    from app.modules.portfolio.models import Position, Asset

    from sqlalchemy import or_
    positions = (
        session.query(Position)
        .filter(or_(Position.user_id == current_user.id, Position.user_id.is_(None)), Position.quantity > 0)
        .all()
    )
    tickers = []
    for pos in positions:
        asset = session.get(Asset, pos.asset_id)
        if asset and asset.ticker:
            tickers.append((asset.ticker, asset.asset_type or "equity"))

    svc = SignalService(session)
    generated = 0
    for ticker, asset_type in tickers:
        try:
            sig = svc.generate_signal_for_symbol(ticker, asset_type=asset_type, user_id=current_user.id)
            if sig:
                generated += 1
        except Exception:
            pass

    return {"status": "ok", "generated": generated, "tickers": [t for t, _ in tickers]}


class AskRequest(BaseModel):
    context_type: str   # "signal" | "recommendation"
    context_id: str
    question: str


@router.post("/ask")
def ask_aureon(
        body: AskRequest,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Answer a question about a specific signal or recommendation using AI."""
    try:
        answer = ask_about_context(
            session,
            context_type=body.context_type,
            context_id=body.context_id,
            question=body.question,
            user_id=current_user.id,
        )
        return {"answer": answer, "context_type": body.context_type, "context_id": body.context_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import logging as _log
        _log.getLogger("aureon.routes").exception("ask_aureon failed: %s", e)
        raise HTTPException(status_code=500, detail="AI service unavailable")
