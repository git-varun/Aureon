import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.dependencies import (
    get_current_user,
    get_members_repo,
    get_portfolio_service,
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
from app.domain.services import PortfolioService
from app.infrastructure.repositories import OrganizationMembersRepository

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
