import io
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_config_service,
    get_current_user,
    get_portfolio_service,
    get_user_context,
    get_watchlist_repo,
)
from app.core.database import get_db
from app.core.api.schemas import (
    PortfolioCreate,
    PortfolioResponse,
    PortfolioUpdate,
    PositionResponse,
    SnapshotResponse,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.core.redis import cache_portfolio_snapshot, get_cached_portfolio_snapshot
from app.core.entities.system import User
from app.domain.services import ConfigService, PortfolioService
from app.infrastructure.repositories import WatchlistsRepository

router = APIRouter()


def _serialize_snapshot_for_cache(snapshot) -> Dict[str, Any]:
    return {
        "portfolio_id": str(snapshot.portfolio_id),
        "market_value": float(snapshot.market_value) if snapshot.market_value is not None else 0.0,
        "cash_balance": float(snapshot.cash_balance) if snapshot.cash_balance is not None else 0.0,
        "allocation": snapshot.allocation,
        "daily_return": float(snapshot.daily_return) if snapshot.daily_return is not None else 0.0,
        "total_return": float(snapshot.total_return) if snapshot.total_return is not None else 0.0,
        "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else datetime.now(timezone.utc).isoformat()
    }


# --- Portfolio CRUD ---

@router.post("/portfolios", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
def create_portfolio(
    req: PortfolioCreate,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    return service.create_portfolio(name=req.name, actor_id=current_user.id)

@router.get("/portfolios", response_model=List[PortfolioResponse])
def list_portfolios(
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    return service.list_portfolios()

@router.get("/portfolios/{portfolio_id}", response_model=PortfolioResponse)
def get_portfolio(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        return service.get_portfolio(portfolio_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.put("/portfolios/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: uuid.UUID,
    req: PortfolioUpdate,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        return service.update_portfolio(portfolio_id, name=req.name, actor_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/portfolios/{portfolio_id}")
def delete_portfolio(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        deleted = service.delete_portfolio(portfolio_id, actor_id=current_user.id)
        return {"success": deleted}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Transaction CRUD ---

@router.post("/portfolios/{portfolio_id}/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    portfolio_id: uuid.UUID,
    req: TransactionCreate,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        return service.record_transaction(
            portfolio_id=portfolio_id,
            symbol=req.symbol,
            transaction_type=req.transaction_type,
            quantity=req.quantity,
            price=req.price,
            transaction_date=req.transaction_date,
            fees=req.fees,
            taxes=req.taxes,
            notes=req.notes,
            broker=req.broker,
            broker_reference=req.broker_reference,
            kind="trade"
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/portfolios/{portfolio_id}/transactions", response_model=List[TransactionResponse])
def list_transactions(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        return service.list_transactions(portfolio_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/portfolios/{portfolio_id}/transactions/{txn_id}", response_model=TransactionResponse)
def get_transaction(
    portfolio_id: uuid.UUID,
    txn_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        txn = service.get_transaction(txn_id)
        if txn.portfolio_id != portfolio_id:
            raise HTTPException(status_code=404, detail="Transaction not found in this portfolio")
        return txn
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.put("/portfolios/{portfolio_id}/transactions/{txn_id}", response_model=TransactionResponse)
def update_transaction(
    portfolio_id: uuid.UUID,
    txn_id: uuid.UUID,
    req: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        # Verify transaction portfolio matches url portfolio
        txn = service.get_transaction(txn_id)
        if txn.portfolio_id != portfolio_id:
            raise HTTPException(status_code=404, detail="Transaction not found in this portfolio")

        return service.update_transaction(
            txn_id=txn_id,
            symbol=req.symbol,
            transaction_type=req.transaction_type,
            quantity=req.quantity,
            price=req.price,
            transaction_date=req.transaction_date,
            fees=req.fees,
            taxes=req.taxes,
            notes=req.notes,
            broker=req.broker,
            broker_reference=req.broker_reference
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/portfolios/{portfolio_id}/transactions/{txn_id}")
def delete_transaction(
    portfolio_id: uuid.UUID,
    txn_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        # Verify transaction portfolio matches url portfolio
        txn = service.get_transaction(txn_id)
        if txn.portfolio_id != portfolio_id:
            raise HTTPException(status_code=404, detail="Transaction not found in this portfolio")

        deleted = service.delete_transaction(txn_id)
        return {"success": deleted}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Positions & Snapshots ---

@router.get("/portfolios/{portfolio_id}/positions", response_model=List[PositionResponse])
def get_positions(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    # Ensure portfolio exists
    service.get_portfolio(portfolio_id)
    positions = service.positions_repo.get_by_portfolio(portfolio_id)
    for pos in positions:
        pos.price, pos.price_source, pos.quote_age_status, pos.quote_updated_at, pos.epf_estimate_basis = service.get_position_price(pos)
    return positions

@router.get("/portfolios/{portfolio_id}/snapshot", response_model=SnapshotResponse)
def get_portfolio_snapshot_route(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    # Ensure portfolio exists
    service.get_portfolio(portfolio_id)

    # Check cache first
    cached = get_cached_portfolio_snapshot(str(portfolio_id))
    if cached:
        return SnapshotResponse(
            portfolio_id=uuid.UUID(cached["portfolio_id"]),
            market_value=cached.get("market_value"),
            cash_balance=cached.get("cash_balance"),
            allocation=cached.get("allocation"),
            daily_return=cached.get("daily_return"),
            total_return=cached.get("total_return"),
            updated_at=datetime.fromisoformat(cached["updated_at"]) if cached.get("updated_at") else datetime.now(timezone.utc)
        )

    # Cache miss: regenerate fresh rather than trusting a possibly-stale
    # persisted PortfolioSnapshot row (that row is only otherwise refreshed
    # by this same regeneration, so it can lag behind position changes).
    try:
        snapshot = service.generate_portfolio_snapshot(portfolio_id)
        cache_portfolio_snapshot(str(portfolio_id), _serialize_snapshot_for_cache(snapshot))
        return snapshot
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/portfolios/{portfolio_id}/snapshot", response_model=SnapshotResponse)
def generate_portfolio_snapshot_route(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        snapshot = service.generate_portfolio_snapshot(portfolio_id)
        cache_portfolio_snapshot(str(portfolio_id), _serialize_snapshot_for_cache(snapshot))
        return snapshot
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- File Importers ---

@router.post("/portfolios/{portfolio_id}/import")
async def import_file(
    portfolio_id: uuid.UUID,
    file: UploadFile = File(...),
    broker: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    content = await file.read()
    try:
        return service.import_transaction_file(
            portfolio_id=portfolio_id,
            file_bytes=content,
            filename=file.filename or "import.csv",
            broker=broker
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/portfolios/{portfolio_id}/import/cdsl")
async def import_cdsl_cas_pdf(
    portfolio_id: uuid.UUID,
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    content = await file.read()
    try:
        return service.import_cdsl_cas(
            portfolio_id=portfolio_id,
            file_bytes=content,
            password=password
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/portfolios/{portfolio_id}/import/nps")
async def import_nps_statement(
    portfolio_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    content = await file.read()
    try:
        return service.import_nps_statement(
            portfolio_id=portfolio_id,
            file_bytes=content,
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/portfolios/{portfolio_id}/import/epf")
async def import_epf_statement(
    portfolio_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    content = await file.read()
    try:
        return service.import_epf_statement(
            portfolio_id=portfolio_id,
            file_bytes=content,
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Manual Assets, Sync, Backup/Restore (single-user facade via get_user_context) ---

# Asset classes that represent a tradeable unit with a per-unit price (a ticker/ISIN
# you hold N of). Everything else (real estate, EPF/PPF/NPS, insurance, etc.) is
# valued as a single lump sum and has no meaningful quantity/price split.
_TRADEABLE_ASSET_CLASSES = {"stock", "stocks", "equity", "mutual_fund", "etf", "crypto"}

class CreateManualAssetRequest(BaseModel):
    name: str
    asset_class: str
    symbol: Optional[str] = None
    quantity: Optional[float] = None
    price: Optional[float] = None
    current_value: Optional[float] = None
    cost_basis: Optional[float] = None
    valuation_date: Optional[str] = None
    notes: Optional[str] = None
    tier: Optional[int] = None

    @model_validator(mode="after")
    def _validate_fields_for_asset_class(self):
        if self.asset_class in _TRADEABLE_ASSET_CLASSES:
            missing = [f for f in ("symbol", "quantity", "price") if getattr(self, f) is None]
            if missing:
                raise ValueError(
                    f"{', '.join(missing)} required for tradeable asset_class={self.asset_class!r}"
                )
        elif self.current_value is None:
            raise ValueError(
                f"current_value required for manually-valued asset_class={self.asset_class!r}"
            )
        return self

@router.post("/manual-assets")
def create_manual_asset(
    body: CreateManualAssetRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    service: PortfolioService = Depends(get_portfolio_service),
):
    portfolio_id = get_user_context(db, user)
    is_tradeable = body.asset_class in _TRADEABLE_ASSET_CLASSES
    transaction_date = None
    if body.valuation_date:
        try:
            transaction_date = datetime.fromisoformat(body.valuation_date)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid valuation_date: {body.valuation_date!r}")
    symbol = service.create_manual_asset(
        portfolio_id=portfolio_id,
        name=body.name,
        symbol=body.symbol if is_tradeable else (body.symbol or f"MANUAL-{uuid.uuid4().hex[:8].upper()}"),
        asset_class=body.asset_class,
        quantity=body.quantity if is_tradeable else 1.0,
        price=body.price if is_tradeable else body.current_value,
        transaction_date=transaction_date,
        notes=body.notes,
        tier=body.tier,
    )
    return {"status": "success", "symbol": symbol}

class UpdateManualValuationRequest(BaseModel):
    new_value: float
    notes: Optional[str] = None

@router.put("/manual-assets/{symbol}/valuation")
def update_manual_valuation(
    symbol: str,
    body: UpdateManualValuationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    service: PortfolioService = Depends(get_portfolio_service),
):
    portfolio_id = get_user_context(db, user)
    try:
        new_price = service.update_manual_valuation(
            portfolio_id=portfolio_id,
            symbol=symbol,
            new_value=body.new_value,
            notes=body.notes,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "success", "new_price": new_price}

@router.post("/sync")
def sync_brokers(
    body: Dict[str, Any],
    user: User = Depends(get_current_user),
    config_svc: ConfigService = Depends(get_config_service),
):
    broker = (body.get("broker") or "").lower()
    job_name = {"zerodha": "sync_zerodha", "binance": "sync_binance", "groww": "sync_groww"}.get(broker, "sync_portfolio")
    task_id = config_svc.dispatch_job(job_name)
    return {"status": "queued", "message": f"{broker or 'portfolio'} sync queued", "task_id": task_id}

@router.get("/sync/status")
def get_sync_status(
    config_svc: ConfigService = Depends(get_config_service),
    service: PortfolioService = Depends(get_portfolio_service),
):
    # provider_name -> (job_name, keys required to consider it "connected")
    _SYNCABLE_BROKERS = {
        "zerodha": ("sync_zerodha", ["access_token"]),
        "binance": ("sync_binance", ["api_key", "api_secret"]),
        "groww": ("sync_groww", ["api_key", "api_secret"]),
    }

    results = []
    for provider in config_svc.get_providers_by_type("broker"):
        name = provider["provider_name"]
        if name not in _SYNCABLE_BROKERS:
            continue  # no sync implementation yet for this broker

        job_name, required_keys = _SYNCABLE_BROKERS[name]
        has_token = all(provider["keys_status"].get(k, False) for k in required_keys)
        logs = config_svc.get_job_logs(job_name, limit=1)
        last_log = logs[0] if logs else None

        if not has_token:
            status, error = "auth_required", None
        elif last_log and last_log["status"] == "FAILED" and "AUTH_REQUIRED" in (last_log["error_message"] or ""):
            status, error = "auth_required", last_log["error_message"]
        elif last_log and last_log["status"] == "FAILED":
            status, error = "error", last_log["error_message"]
        elif last_log and last_log["status"] == "SUCCESS":
            status, error = "ok", None
        else:
            status, error = "idle", None

        positions_count = service.count_broker_positions(broker=name)

        results.append({
            "provider": name,
            "status": status,
            "last_synced_at": last_log["ended_at"] if (last_log and status == "ok") else None,
            "positions_count": positions_count,
            "error": error,
        })

    return results

@router.get("/backup")
def export_backup(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    service: PortfolioService = Depends(get_portfolio_service),
    watchlists_repo: WatchlistsRepository = Depends(get_watchlist_repo),
):
    portfolio_id = get_user_context(db, user)
    txns = service.transactions_repo.get_by_portfolio(portfolio_id)
    watchlists = watchlists_repo.list_by_user(user.id)

    backup = {
        "version": "1.0.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user_id": str(user.id),
        "transactions": [
            {
                "symbol": t.symbol,
                "type": t.transaction_type,
                "qty": float(t.quantity),
                "price": float(t.price),
                "date": t.transaction_date.isoformat(),
                "broker": t.broker,
                "notes": t.notes
            } for t in txns
        ],
        "watchlists": [
            {
                "name": w.name,
                "symbols": [s.symbol for s in w.symbols]
            } for w in watchlists
        ]
    }

    content = json.dumps(backup, indent=2)
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=aureon_backup_{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"}
    )

@router.post("/restore")
def restore_backup(
    file: UploadFile = File(...),
    confirm: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    service: PortfolioService = Depends(get_portfolio_service),
):
    portfolio_id = get_user_context(db, user)
    content = file.file.read()
    data = json.loads(content)

    if not confirm:
        return {
            "status": "dry_run",
            "transactions_count": len(data.get("transactions", [])),
            "watchlists_count": len(data.get("watchlists", []))
        }

    count = 0
    for t in data.get("transactions", []):
        service.record_transaction(
            portfolio_id=portfolio_id,
            symbol=t["symbol"],
            transaction_type=t["type"],
            quantity=t["qty"],
            price=t["price"],
            transaction_date=datetime.fromisoformat(t["date"]),
            notes=t.get("notes"),
            broker=t.get("broker")
        )
        count += 1

    return {"status": "success", "imported_transactions": count}
