import io
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_config_service,
    get_current_user,
    get_db,
    get_members_repo,
    get_portfolio_service,
    get_user_context,
    get_watchlist_repo,
)
from app.api.v1.schemas import (
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
from app.domain.entities.system import User
from app.domain.services import ConfigService, PortfolioService
from app.infrastructure.repositories import (
    OrganizationMembersRepository,
    WatchlistsRepository,
)

router = APIRouter()

# --- Authorization Helpers ---

def check_org_write_access(org_id: uuid.UUID, user_id: uuid.UUID, members_repo: OrganizationMembersRepository):
    membership = members_repo.get_by_org_and_user(org_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not authorized to access this organization")
    if membership.role == "READ_ONLY":
        raise HTTPException(status_code=403, detail="Read-only members cannot modify resources")
    return membership

def check_org_read_access(org_id: uuid.UUID, user_id: uuid.UUID, members_repo: OrganizationMembersRepository):
    membership = members_repo.get_by_org_and_user(org_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not authorized to access this organization")
    return membership


# --- Portfolio CRUD ---

@router.post("/organizations/{org_id}/portfolios", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
def create_portfolio(
    org_id: uuid.UUID,
    req: PortfolioCreate,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    return service.create_portfolio(name=req.name, organization_id=org_id, actor_id=current_user.id)

@router.get("/organizations/{org_id}/portfolios", response_model=List[PortfolioResponse])
def list_portfolios(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    return service.list_portfolios(org_id)

@router.get("/organizations/{org_id}/portfolios/{portfolio_id}", response_model=PortfolioResponse)
def get_portfolio(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    try:
        return service.get_portfolio(portfolio_id, org_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.put("/organizations/{org_id}/portfolios/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    req: PortfolioUpdate,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        return service.update_portfolio(portfolio_id, org_id, name=req.name, actor_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/organizations/{org_id}/portfolios/{portfolio_id}")
def delete_portfolio(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        deleted = service.delete_portfolio(portfolio_id, org_id, actor_id=current_user.id)
        return {"success": deleted}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Transaction CRUD ---

@router.post("/organizations/{org_id}/portfolios/{portfolio_id}/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    req: TransactionCreate,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        return service.record_transaction(
            portfolio_id=portfolio_id,
            organization_id=org_id,
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

@router.get("/organizations/{org_id}/portfolios/{portfolio_id}/transactions", response_model=List[TransactionResponse])
def list_transactions(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    try:
        return service.list_transactions(portfolio_id, org_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/organizations/{org_id}/portfolios/{portfolio_id}/transactions/{txn_id}", response_model=TransactionResponse)
def get_transaction(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    txn_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    try:
        txn = service.get_transaction(txn_id, org_id)
        if txn.portfolio_id != portfolio_id:
            raise HTTPException(status_code=404, detail="Transaction not found in this portfolio")
        return txn
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.put("/organizations/{org_id}/portfolios/{portfolio_id}/transactions/{txn_id}", response_model=TransactionResponse)
def update_transaction(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    txn_id: uuid.UUID,
    req: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        # Verify transaction portfolio matches url portfolio
        txn = service.get_transaction(txn_id, org_id)
        if txn.portfolio_id != portfolio_id:
            raise HTTPException(status_code=404, detail="Transaction not found in this portfolio")

        return service.update_transaction(
            txn_id=txn_id,
            organization_id=org_id,
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

@router.delete("/organizations/{org_id}/portfolios/{portfolio_id}/transactions/{txn_id}")
def delete_transaction(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    txn_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        # Verify transaction portfolio matches url portfolio
        txn = service.get_transaction(txn_id, org_id)
        if txn.portfolio_id != portfolio_id:
            raise HTTPException(status_code=404, detail="Transaction not found in this portfolio")

        deleted = service.delete_transaction(txn_id, org_id)
        return {"success": deleted}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Positions & Snapshots ---

@router.get("/organizations/{org_id}/portfolios/{portfolio_id}/positions", response_model=List[PositionResponse])
def get_positions(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    # Ensure portfolio exists
    service.get_portfolio(portfolio_id, org_id)
    return service.positions_repo.get_by_portfolio(portfolio_id)

@router.get("/organizations/{org_id}/portfolios/{portfolio_id}/snapshot", response_model=SnapshotResponse)
def get_portfolio_snapshot_route(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    # Ensure portfolio exists
    service.get_portfolio(portfolio_id, org_id)

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

    try:
        snapshot = service.snapshot_repo.get(portfolio_id)
        if not snapshot:
            snapshot = service.generate_portfolio_snapshot(portfolio_id, org_id)
        return snapshot
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/organizations/{org_id}/portfolios/{portfolio_id}/snapshot", response_model=SnapshotResponse)
def generate_portfolio_snapshot_route(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        snapshot = service.generate_portfolio_snapshot(portfolio_id, org_id)
        # Update cache
        cache_data = {
            "portfolio_id": str(snapshot.portfolio_id),
            "market_value": float(snapshot.market_value) if snapshot.market_value is not None else 0.0,
            "cash_balance": float(snapshot.cash_balance) if snapshot.cash_balance is not None else 0.0,
            "allocation": snapshot.allocation,
            "daily_return": float(snapshot.daily_return) if snapshot.daily_return is not None else 0.0,
            "total_return": float(snapshot.total_return) if snapshot.total_return is not None else 0.0,
            "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else datetime.now(timezone.utc).isoformat()
        }
        cache_portfolio_snapshot(str(portfolio_id), cache_data)
        return snapshot
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- File Importers ---

@router.post("/organizations/{org_id}/portfolios/{portfolio_id}/import")
async def import_file(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    file: UploadFile = File(...),
    broker: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    content = await file.read()
    try:
        return service.import_transaction_file(
            portfolio_id=portfolio_id,
            organization_id=org_id,
            file_bytes=content,
            filename=file.filename or "import.csv",
            broker=broker
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/organizations/{org_id}/portfolios/{portfolio_id}/import/cdsl")
async def import_cdsl_cas_pdf(
    org_id: uuid.UUID,
    portfolio_id: uuid.UUID,
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: PortfolioService = Depends(get_portfolio_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    content = await file.read()
    try:
        return service.import_cdsl_cas(
            portfolio_id=portfolio_id,
            organization_id=org_id,
            file_bytes=content,
            password=password
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Manual Assets, Sync, Backup/Restore (single-user facade via get_user_context) ---

class CreateManualAssetRequest(BaseModel):
    name: str
    symbol: str
    asset_class: str
    quantity: float
    price: float

@router.post("/manual-assets")
def create_manual_asset(
    body: CreateManualAssetRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    service: PortfolioService = Depends(get_portfolio_service),
):
    org_id, portfolio_id = get_user_context(db, user)
    symbol = service.create_manual_asset(
        portfolio_id=portfolio_id,
        name=body.name,
        symbol=body.symbol,
        asset_class=body.asset_class,
        quantity=body.quantity,
        price=body.price,
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
    org_id, portfolio_id = get_user_context(db, user)
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
    if broker == "zerodha":
        task_id = config_svc.dispatch_job("sync_zerodha")
    else:
        task_id = config_svc.dispatch_job("sync_portfolio")
    return {"status": "queued", "message": f"{broker or 'portfolio'} sync queued", "task_id": task_id}

@router.get("/sync/status")
def get_sync_status(
    config_svc: ConfigService = Depends(get_config_service),
    service: PortfolioService = Depends(get_portfolio_service),
):
    results = []
    for provider in config_svc.get_providers_by_type("broker"):
        name = provider["provider_name"]
        if name != "zerodha":
            continue  # v1 scope — groww/binance/etc. have no sync implementation yet

        has_token = provider["keys_status"].get("access_token", False)
        logs = config_svc.get_job_logs("sync_zerodha", limit=1)
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

        positions_count = service.count_broker_positions(broker="zerodha")

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
    org_id, portfolio_id = get_user_context(db, user)
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
    org_id, portfolio_id = get_user_context(db, user)
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
            organization_id=org_id,
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
