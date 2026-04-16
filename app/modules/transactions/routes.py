"""Transactions routes: ledger view and tax summary."""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth
from app.modules.transactions.services import TaxService, TransactionService
from app.shared.constants import TransactionType

router = APIRouter(prefix="/api", tags=["transactions"])


@router.get("/transactions/health")
def transactions_health():
    return {"module": "transactions", "status": "ok"}


@router.get("/ledger/transactions")
def get_transactions(
    symbol: Optional[str] = None,
    broker: Optional[str] = None,
    type: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_session),
):
    """Paginated, filtered transaction list."""
    asset_id = None
    if symbol:
        from app.modules.portfolio.models import Asset
        asset = db.query(Asset).filter_by(symbol=symbol.upper()).first()
        if not asset:
            return []
        asset_id = asset.id

    tx_type = None
    if type:
        try:
            tx_type = TransactionType(type.upper())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid transaction type: {type}")

    from_dt = datetime.combine(from_date, datetime.min.time()) if from_date else None
    to_dt = datetime.combine(to_date, datetime.max.time()) if to_date else None

    svc = TransactionService(db)
    txns = svc.get_all_transactions(
        limit=limit,
        offset=offset,
        asset_id=asset_id,
        broker=broker,
        transaction_type=tx_type,
        from_date=from_dt,
        to_date=to_dt,
    )
    return [
        {
            "id": t.id,
            "symbol": t.asset.symbol if t.asset else None,
            "transaction_type": t.transaction_type.value if t.transaction_type else None,
            "quantity": float(t.quantity or 0),
            "price": float(t.price or 0),
            "total_value": float(t.total_value or 0),
            "transaction_date": t.transaction_date.isoformat() if t.transaction_date else None,
            "broker": t.broker,
        }
        for t in txns
    ]


@router.post("/ledger/upload")
async def upload_ledger(
    file: UploadFile = File(...),
    broker: str = "unknown",
    db: Session = Depends(get_session),
    _user=Depends(require_auth),
):
    """Upload a CSV of transactions and import them into the ledger."""
    content = await file.read()
    svc = TaxService(db)
    try:
        count = svc.import_transactions_csv(content, broker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV import failed: {e}")
    return {"status": "ok", "imported": count, "broker": broker}


@router.get("/tax/summary")
def get_tax_summary(
    year: int = Query(default=None),
    db: Session = Depends(get_session),
):
    """FIFO capital gains tax summary for a given financial year."""
    if year is None:
        year = datetime.utcnow().year
    svc = TaxService(db)
    return svc.get_tax_summary(year)


@router.post("/tax/import")
async def import_tax_lots(
    file: UploadFile = File(...),
    broker: str = "unknown",
    db: Session = Depends(get_session),
):
    """Alias for /ledger/upload — imports transactions from broker CSV."""
    content = await file.read()
    svc = TaxService(db)
    try:
        count = svc.import_transactions_csv(content, broker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {e}")
    return {"status": "ok", "imported": count, "broker": broker}
