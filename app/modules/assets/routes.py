"""Assets routes.

Data flow: Route → AssetsService → Repositories / PriceProviderService
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth
from app.modules.assets.schemas import (
    AssetDetailResponse,
    AssetListResponse,
    AssetResponse,
    ChartCandleResponse,
    PriceHistoryEntry,
)
from app.modules.assets.services import AssetsService
from app.shared.constants import AssetType

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/health")
def assets_health():
    return {"module": "assets", "status": "ok"}


@router.get("", response_model=AssetListResponse)
def list_assets(
    asset_type: Optional[AssetType] = Query(None, description="Filter by asset type"),
    exchange: Optional[str] = Query(None, description="Filter by exchange (NSE, BSE, BINANCE…)"),
    search: Optional[str] = Query(None, description="Search symbol or name"),
    session: Session = Depends(get_session),
        _user=Depends(require_auth),
):
    """List all tracked assets with optional filtering."""
    svc = AssetsService(session)
    assets = svc.list_assets(asset_type=asset_type, exchange=exchange, search=search)
    return AssetListResponse(
        data=[
            AssetResponse(
                id=a.id,
                symbol=a.symbol,
                name=a.name,
                type=a.asset_type.value if a.asset_type else "equity",
                exchange=a.exchange,
                current_price=a.current_price,
                previous_close=a.previous_close,
                market_cap=a.market_cap,
                updated_at=a.updated_at,
            )
            for a in assets
        ],
        total=len(assets),
    )


@router.get("/{symbol}", response_model=AssetDetailResponse)
def get_asset(symbol: str, session: Session = Depends(get_session), _user=Depends(require_auth)):
    """Return full asset detail including recent price samples."""
    svc = AssetsService(session)
    detail = svc.get_asset_detail(symbol.upper())
    if not detail:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")
    return AssetDetailResponse(**detail)


@router.get("/{symbol}/history", response_model=List[PriceHistoryEntry])
def get_price_history(
    symbol: str,
    days: int = Query(30, ge=1, le=365, description="Number of days of history"),
    session: Session = Depends(get_session),
        _user=Depends(require_auth),
):
    """Return historical OHLCV data for an asset."""
    svc = AssetsService(session)
    asset = svc.get_asset(symbol.upper())
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")
    rows = svc.get_price_history(symbol.upper(), days=days)
    return [
        PriceHistoryEntry(
            date=p.date,
            open=p.open_price,
            high=p.high,
            low=p.low,
            close=p.close,
            volume=p.volume,
        )
        for p in rows
    ]


@router.get("/{symbol}/chart", response_model=List[ChartCandleResponse])
def get_chart(
    symbol: str,
    days: int = Query(365, ge=1, le=730, description="Number of days"),
    session: Session = Depends(get_session),
        _user=Depends(require_auth),
):
    """Return OHLCV + per-candle technical overlays for TradingView lightweight-charts."""
    svc = AssetsService(session)
    asset = svc.get_asset(symbol.upper())
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")
    return svc.get_chart_data(symbol.upper(), days=days)


@router.post("/price")
def trigger_price_refresh(symbol: Optional[str] = None, _user=Depends(require_auth)):
    """Enqueue a price refresh task for all assets or a specific symbol."""
    from app.tasks.portfolio import refresh_prices_task
    task = refresh_prices_task.delay(symbol=symbol)
    return {"status": "enqueued", "task_id": task.id, "symbol": symbol or "all"}
