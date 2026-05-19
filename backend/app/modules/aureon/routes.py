"""Aureon API routes — composite state, asset detail, activity ledger."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import require_auth, get_session

from .services import build_asset_detail, build_aureon_state, _build_activity

router = APIRouter(prefix="/api/aureon", tags=["aureon"])


@router.get("/state")
def get_aureon_state(
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Composite cold-load for the Aureon UI."""
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
