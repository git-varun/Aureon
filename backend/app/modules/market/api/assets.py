from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import get_assets_service, get_current_user, get_user_context
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.entities.system import User
from app.modules.market.services.assets import AssetsService
from sqlalchemy.orm import Session

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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    svc: AssetsService = Depends(get_assets_service),
):
    portfolio_id = get_user_context(db, user)
    try:
        return svc.get_aureon_asset(ticker, portfolio_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e
