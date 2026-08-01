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

@router.get("/assets/batch")
def get_assets_batch(symbols: str = Query(..., description="Comma-separated symbols"), svc: AssetsService = Depends(get_assets_service)):
    symbol_list = [s for s in symbols.split(",") if s.strip()]
    return {"data": svc.get_batch(symbol_list)}

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
        return svc.get_fundamentals(symbol, refresh=refresh)
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
    # BACKLOG: this used to return a hardcoded {"signal": "BUY"} for any symbol,
    # regardless of any real analysis — a fabricated investment recommendation on
    # a live, callable endpoint. Real per-symbol signal generation already exists
    # (GET /signals/{symbol} -> AssetsService.get_signal, RSI-threshold-based) and
    # separately AssetsService/runSingleAI-style on-demand AI analysis exists
    # elsewhere — a real implementation of this specific endpoint should either
    # delegate to one of those or be removed if nothing calls it (frontend does
    # not call this today; see TechnicalTab.jsx). Not built in this pass.
    raise HTTPException(status_code=501, detail="Signal generation via this endpoint is not implemented.")

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
