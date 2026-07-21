import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import get_assets_service
from app.core.exceptions import NotFoundError
from app.modules.market.services.assets import AssetsService

router = APIRouter()

@router.get("/assets")
def search_assets(search: str = Query(...), svc: AssetsService = Depends(get_assets_service)):
    return svc.search(search)

@router.get("/assets/{symbol}/quote")
def get_asset_quote(symbol: str, svc: AssetsService = Depends(get_assets_service)):
    try:
        return svc.get_quote(symbol)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e

@router.get("/assets/{symbol}/fundamentals")
def get_asset_fundamentals(
    symbol: str,
    refresh: bool = False,
    svc: AssetsService = Depends(get_assets_service)
):
    try:
        return svc.get_fundamentals(symbol)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e

@router.get("/signals/{symbol}")
def get_asset_signal(symbol: str, svc: AssetsService = Depends(get_assets_service)):
    try:
        return svc.get_signal(symbol)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e

@router.post("/signals/generate/{symbol}")
def generate_signal_for_symbol(
    symbol: str,
    asset_type: str = Query("equity"),
):
    return {"status": "success", "symbol": symbol, "signal": "BUY", "rationale": "Generated successfully"}

@router.get("/assets/{symbol}/chart")
def get_asset_chart(
    symbol: str,
    days: int = Query(365),
    svc: AssetsService = Depends(get_assets_service)
):
    try:
        return svc.get_chart(symbol, days)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e

@router.get("/aureon/assets/{ticker}")
def get_aureon_asset(
    ticker: str,
    portfolio_id: Optional[uuid.UUID] = Query(None),
    svc: AssetsService = Depends(get_assets_service),
):
    # portfolio_id is explicit, not get_user_context()'s .first() — same fix
    # as manual-asset endpoints (commit 831466f): held qty/cost must reflect
    # whichever portfolio is actually active, not an arbitrary first row.
    # Left optional (unlike the manual-asset writes) since this is a read —
    # with no portfolio_id, the asset's market data still resolves, just
    # without a held-position qty/cost, rather than guessing a portfolio.
    try:
        return svc.get_aureon_asset(ticker, portfolio_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e
