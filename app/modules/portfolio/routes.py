"""Portfolio API routes."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth
from app.core.cache import get_cache
from app.modules.portfolio.services import PortfolioService
from app.modules.portfolio.schemas import (
    AssetResponse, PositionResponse, PortfolioResponse, PortfolioSyncRequest,
    TransactionResponse, AssetCreate, PositionCreate
)
from app.modules.portfolio.models import Asset, Position, Transaction
from app.tasks.portfolio import sync_portfolio_task
from app.shared.utils import cache_key
from app.shared.exceptions import NotFoundError

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioResponse)
def get_portfolio(session: Session = Depends(get_session), _user=Depends(require_auth)):
    """Get full portfolio summary: value, PnL, positions."""
    service = PortfolioService(session)
    return service.get_portfolio_summary()


@router.get("/assets", response_model=list[AssetResponse])
def list_assets(session: Session = Depends(get_session), _user=Depends(require_auth)):
    """List all assets in portfolio."""
    service = PortfolioService(session)
    assets = service.list_assets()
    return [AssetResponse.from_orm(a) for a in assets]


@router.get("/assets/{symbol}", response_model=AssetResponse)
def get_asset(symbol: str, session: Session = Depends(get_session), _user=Depends(require_auth)):
    """Get asset by symbol."""
    service = PortfolioService(session)
    asset = service.get_asset(symbol)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")
    return AssetResponse.from_orm(asset)


@router.get("/positions", response_model=list[PositionResponse])
def list_positions(session: Session = Depends(get_session), _user=Depends(require_auth)):
    """List all positions."""
    service = PortfolioService(session)
    positions = service.list_positions()
    return [
        PositionResponse(
            id=p.id,
            quantity=p.quantity,
            avg_buy_price=p.avg_buy_price,
            current_value=p.current_value,
            pnl=p.pnl,
            pnl_percent=p.pnl_percent,
            asset=AssetResponse.from_orm(p.asset),
            created_at=p.created_at
        )
        for p in positions
    ]


@router.get("/positions/{position_id}", response_model=PositionResponse)
def get_position(position_id: int, session: Session = Depends(get_session), _user=Depends(require_auth)):
    """Get position by ID."""
    service = PortfolioService(session)
    pos = service.get_position(position_id)
    if not pos:
        raise HTTPException(status_code=404, detail=f"Position {position_id} not found")
    return PositionResponse(
        id=pos.id,
        quantity=pos.quantity,
        avg_buy_price=pos.avg_buy_price,
        current_value=pos.current_value,
        pnl=pos.pnl,
        pnl_percent=pos.pnl_percent,
        asset=AssetResponse.from_orm(pos.asset),
        created_at=pos.created_at
    )


@router.post("/sync")
def sync_portfolio(req: PortfolioSyncRequest, session: Session = Depends(get_session), _user=Depends(require_auth)):
    """Enqueue portfolio sync from broker (async Celery task).

    Pass dry_run=true to validate credentials without writing to the DB.
    """
    task = sync_portfolio_task.delay(
        broker=req.broker,
        force_refresh=req.force_refresh,
        dry_run=req.dry_run,
    )
    return {
        "status": "enqueued",
        "task_id": task.id,
        "broker": req.broker,
        "force_refresh": req.force_refresh,
        "dry_run": req.dry_run,
    }


@router.get("/sync/{task_id}")
def get_sync_status(task_id: str, _user=Depends(require_auth)):
    """Check async sync task status."""
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None
    }



@router.get("/transactions", response_model=list[TransactionResponse])
def list_transactions(session: Session = Depends(get_session), _user=Depends(require_auth)):
    """List all transactions."""
    transactions = session.query(Transaction).order_by(Transaction.transaction_date.desc()).all()
    return [
        TransactionResponse(
            id=t.id,
            symbol=t.asset.symbol,
            transaction_type=t.transaction_type,
            quantity=t.quantity,
            price=t.price,
            total_value=t.total_value,
            transaction_date=t.transaction_date,
            broker=t.broker
        )
        for t in transactions
    ]
