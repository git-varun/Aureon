"""Portfolio API routes."""

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth
from app.core.cache import get_cache
from app.modules.portfolio.services import PortfolioService
from app.modules.portfolio.schemas import (
    AssetResponse, PositionResponse, PortfolioResponse, PortfolioSyncRequest,
    TransactionResponse, TransactionCreate, AssetCreate, PositionCreate,
    ManualAssetCreate, ManualValuationUpdate, AllocationResponse,
)
from app.modules.portfolio.models import Asset, Position, Transaction
from app.tasks.portfolio import sync_portfolio_task
from app.shared.utils import cache_key
from app.shared.exceptions import NotFoundError

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])



@router.get("", response_model=PortfolioResponse)
def get_portfolio(session: Session = Depends(get_session), current_user=Depends(require_auth)):
    """Get full portfolio summary: value, PnL, positions."""
    service = PortfolioService(session)
    return service.get_portfolio_summary(user_id=current_user.id)


@router.get("/assets", response_model=list[AssetResponse])
def list_assets(
        limit: int = Query(200, ge=1, le=1000),
        session: Session = Depends(get_session),
        _user=Depends(require_auth),
):
    """List assets in portfolio."""
    service = PortfolioService(session)
    assets = service.list_assets()
    return [AssetResponse.from_orm(a) for a in assets[:limit]]


@router.get("/assets/{symbol}", response_model=AssetResponse)
def get_asset(symbol: str, session: Session = Depends(get_session), _user=Depends(require_auth)):
    """Get asset by symbol."""
    service = PortfolioService(session)
    asset = service.get_asset(symbol)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")
    return AssetResponse.from_orm(asset)


@router.get("/positions", response_model=list[PositionResponse])
def list_positions(session: Session = Depends(get_session), current_user=Depends(require_auth)):
    """List all positions."""
    service = PortfolioService(session)
    positions = service.list_positions(user_id=current_user.id)
    return [
        PositionResponse(
            id=p.id,
            asset_id=p.asset_id,
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
def get_position(position_id: int, session: Session = Depends(get_session), current_user=Depends(require_auth)):
    """Get position by ID."""
    service = PortfolioService(session)
    pos = service.get_position(position_id, user_id=current_user.id)
    if not pos:
        raise HTTPException(status_code=404, detail=f"Position {position_id} not found")
    return PositionResponse(
        id=pos.id,
        asset_id=pos.asset_id,
        quantity=pos.quantity,
        avg_buy_price=pos.avg_buy_price,
        current_value=pos.current_value,
        pnl=pos.pnl,
        pnl_percent=pos.pnl_percent,
        asset=AssetResponse.from_orm(pos.asset),
        created_at=pos.created_at
    )


@router.post("/positions/{position_id}/recompute-cost")
def recompute_position_cost(
    position_id: int,
    session: Session = Depends(get_session),
    current_user=Depends(require_auth),
):
    """Recompute avg_buy_price from transaction history (VWAP of BUY transactions)."""
    service = PortfolioService(session)
    try:
        return service.recompute_avg_buy_price(position_id, user_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/sync")
def sync_portfolio(req: PortfolioSyncRequest, session: Session = Depends(get_session), current_user=Depends(require_auth)):
    """Enqueue portfolio sync from broker (async Celery task).

    Pass dry_run=true to validate credentials without writing to the DB.
    """
    task = sync_portfolio_task.delay(
        broker=req.broker,
        force_refresh=req.force_refresh,
        dry_run=req.dry_run,
        user_id=current_user.id,
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


@router.post("/manual-assets", response_model=PositionResponse, status_code=201)
def create_manual_asset(
        req: ManualAssetCreate,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Create an illiquid asset (bond, EPF, PPF, insurance, real estate) + initial position."""
    from app.modules.portfolio.schemas import AssetCreate
    service = PortfolioService(session)

    asset_create = AssetCreate(
        symbol=req.symbol,
        name=req.name,
        asset_type=req.asset_type,
        exchange=req.exchange,
        asset_metadata=req.asset_metadata,
    )
    asset = service.create_asset(asset_create)

    pos = service.create_position({
        "asset_id": asset.id,
        "quantity": 1.0,
        "avg_buy_price": req.initial_value,
        "current_value": req.initial_value,
        "purchase_date": req.purchase_date,
    }, user_id=current_user.id)

    return PositionResponse(
        id=pos.id,
        asset_id=pos.asset_id,
        quantity=pos.quantity,
        avg_buy_price=pos.avg_buy_price,
        current_value=pos.current_value,
        pnl=pos.pnl,
        pnl_percent=pos.pnl_percent,
        asset=AssetResponse.from_orm(asset),
        created_at=pos.created_at,
    )


@router.put("/manual-assets/{symbol}/valuation", response_model=PositionResponse)
def update_manual_valuation(
        symbol: str,
        req: ManualValuationUpdate,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Update the current value of a manually-valued illiquid asset."""
    service = PortfolioService(session)
    asset = service.get_asset(symbol)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    from sqlalchemy import or_
    owned = session.query(Position).filter(
        Position.asset_id == asset.id,
        or_(Position.user_id == current_user.id, Position.user_id.is_(None)),
    ).first()
    if not owned:
        raise HTTPException(status_code=403, detail="Not authorised to update this asset")

    pos = service.update_manual_valuation(asset.id, req.new_value, req.notes)
    return PositionResponse(
        id=pos.id,
        asset_id=pos.asset_id,
        quantity=pos.quantity,
        avg_buy_price=pos.avg_buy_price,
        current_value=pos.current_value,
        pnl=pos.pnl,
        pnl_percent=pos.pnl_percent,
        asset=AssetResponse.from_orm(asset),
        created_at=pos.created_at,
    )


@router.get("/allocation", response_model=AllocationResponse)
def get_allocation(session: Session = Depends(get_session), current_user=Depends(require_auth)):
    """Portfolio allocation breakdown by asset type."""
    service = PortfolioService(session)
    return service.get_portfolio_by_type(user_id=current_user.id)


@router.get("/sync/status")
def get_all_sync_status(session: Session = Depends(get_session), current_user=Depends(require_auth)):
    """Per-provider sync status derived from transaction history and position counts."""
    from sqlalchemy import func as sqlfunc
    from app.modules.portfolio.models import Position

    providers = ["zerodha", "groww", "binance", "manual"]
    result = []
    for provider in providers:
        last_tx = (
            session.query(sqlfunc.max(Transaction.transaction_date))
            .filter(Transaction.user_id == current_user.id, Transaction.broker == provider)
            .scalar()
        )
        pos_count = (
            session.query(sqlfunc.count(Position.id))
            .filter(Position.user_id == current_user.id, Position.broker == provider)
            .scalar()
        ) or 0
        result.append({
            "provider": provider,
            "last_synced_at": last_tx.isoformat() if last_tx else None,
            "positions_count": pos_count,
            "status": "ok" if last_tx else "never",
            "error": None,
        })
    return result


@router.get("/export/csv")
def export_portfolio_csv(session: Session = Depends(get_session), current_user=Depends(require_auth)):
    """Stream portfolio positions as CSV."""
    from app.modules.portfolio.models import Position, Asset

    positions = (
        session.query(Position)
        .join(Position.asset)
        .filter(Position.user_id == current_user.id, Position.quantity > 0)
        .all()
    )

    total_value = sum((p.quantity * (p.asset.current_price or 0)) for p in positions) or 1

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ticker", "name", "asset_class", "quantity", "avg_buy_price",
                     "current_price", "current_value", "unrealized_pnl",
                     "unrealized_pnl_pct", "allocation_pct"])
    for p in positions:
        cp = p.asset.current_price or 0
        cv = p.quantity * cp
        pnl = cv - (p.quantity * (p.avg_buy_price or 0))
        pnl_pct = (pnl / (p.quantity * p.avg_buy_price) * 100) if p.avg_buy_price else 0
        writer.writerow([
            p.asset.symbol, p.asset.name or "", p.asset.asset_type or "",
            p.quantity, round(p.avg_buy_price or 0, 4),
            round(cp, 4), round(cv, 2), round(pnl, 2), round(pnl_pct, 2),
            round(cv / total_value * 100, 2),
        ])

    output.seek(0)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="aureon_portfolio_{date_str}.csv"'},
    )


@router.post("/transactions/import")
def import_transactions(
        file: UploadFile = File(...),
        dry_run: bool = Query(True, description="Preview rows without committing to DB"),
        broker: Optional[str] = Query(None, description="Broker hint: zerodha, groww, binance (auto-detected if omitted)"),
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Import transactions from a CSV, XLSX, or PDF file.

    Expected columns (order-independent, case-insensitive):
      date, symbol, type (BUY/SELL), quantity, price

    Supported broker formats (auto-detected or pass ?broker=):
      zerodha, groww, binance, or generic

    - dry_run=true (default): returns parsed rows + validation errors, nothing is written.
    - dry_run=false: commits valid rows, returns summary.
    """
    from app.modules.portfolio.importer import parse_transaction_file, commit_transactions

    content = file.file.read()
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    rows, errors = parse_transaction_file(content, ext, broker=broker)

    detected_broker = rows[0].get("broker") if rows else broker or "generic"
    if dry_run:
        return {
            "dry_run": True, "rows": rows, "errors": errors,
            "total": len(rows), "detected_broker": detected_broker,
            "hint": "If errors show unrecognised columns, check the 'errors' field — it lists the exact column headers found in your file." if errors and not rows else None,
        }

    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Fix validation errors before committing", "errors": errors},
        )

    committed, skipped = commit_transactions(session, rows, user_id=current_user.id)
    return {"dry_run": False, "committed": committed, "skipped_duplicates": skipped, "total": len(rows)}


@router.post("/cas/upload")
def upload_cas(
        file: UploadFile = File(..., description="CDSL CAS PDF file"),
        password: Optional[str] = Query(None, description="PDF password (usually PAN in uppercase)"),
        dry_run: bool = Query(True, description="Preview holdings without writing to DB"),
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Parse a CDSL Consolidated Account Statement PDF and import MF holdings.

    - dry_run=true (default): returns parsed holdings for review, nothing is written.
    - dry_run=false: upserts assets and positions, returns import summary.

    The PDF may be password-protected (CDSL typically uses the investor's PAN
    as the password, e.g. ABCDE1234F). Pass it via ?password=.
    """
    import tempfile, os
    from app.modules.portfolio.providers.cdsl_cas import parse_cas, CASAssetSource

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted.")

    content = file.file.read()
    if len(content) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    # Write to a temp file — pdfplumber requires a path or file object
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(content)

        try:
            cas = parse_cas(tmp_path, password=password)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if not cas.mf_folios and not cas.demat_mf:
        raise HTTPException(
            status_code=422,
            detail="No mutual fund holdings found in the PDF. "
                   "Verify this is a CDSL CAS PDF (not an account statement for equities only).",
        )

    if dry_run:
        return {
            "dry_run": True,
            "summary": cas.summary(),
            "holdings": cas.to_holdings_json(),
        }

    provider = CASAssetSource(cas)
    service = PortfolioService(session)
    result = service.sync_portfolio(provider, force_refresh=True, dry_run=False, user_id=current_user.id)

    # Invalidate portfolio cache so the dashboard reflects the new positions
    try:
        get_cache().clear_pattern("portfolio:*")
    except Exception:
        pass

    return {
        "dry_run": False,
        "summary": cas.summary(),
        **result,
    }


@router.post("/nps/upload")
def upload_nps_holding(
        file: UploadFile = File(..., description="Protean CRA NPS Holding Statement PDF"),
        dry_run: bool = Query(True, description="Preview holdings without writing to DB"),
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Parse a Protean CRA NPS Holding Statement PDF and import NPS holdings.

    ⚠ Cost basis is NOT available in the holding statement — avg_buy_price
      will be 0 for all positions.  For returns / XIRR download a Transaction
      Statement from the same portal.

    - dry_run=true (default): returns parsed holdings for review, nothing written.
    - dry_run=false: upserts NPS_TIER1 / NPS_TIER2 assets and positions.
    """
    import tempfile
    import os
    from app.modules.portfolio.providers.nps_holding import (
        parse_nps_holding,
        NPSHoldingAssetSource,
    )

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted.")

    content = file.file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(content)

        try:
            nps = parse_nps_holding(tmp_path)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if not nps.tier1_schemes and not nps.tier2_schemes:
        raise HTTPException(
            status_code=422,
            detail=(
                "No NPS holdings found in the PDF. "
                "Verify this is a Protean CRA 'Statement of Holding for NPS'."
            ),
        )

    if dry_run:
        return {
            "dry_run": True,
            "summary": nps.summary(),
            "holdings": nps.to_holdings_json(),
        }

    # sync_portfolio cannot be used here: AssetCreate requires asset_metadata for
    # illiquid types (nps), but AssetSource/AssetPayload has no metadata field.
    # We construct NPSMetadata directly and use create_asset + a manual position upsert.
    from app.modules.portfolio.metadata_schemas import NPSMetadata
    from app.modules.portfolio.repositories import PositionRepository
    from app.modules.portfolio.schemas import AssetCreate
    from app.shared.constants import AssetType

    service = PortfolioService(session)
    updated_assets = 0
    errors: list = []

    def _sync_tier(symbol: str, name: str, tier_key: str, schemes: list) -> None:
        nonlocal updated_assets
        if not schemes:
            return
        total_value = round(sum(s.current_value for s in schemes), 2)
        total_units = sum(s.total_units for s in schemes)
        effective_price = round(total_value / total_units, 4) if total_units else 0.0
        try:
            meta = NPSMetadata(
                asset_type="nps",
                pran_number=nps.pran or None,
                tier=tier_key,
                balance=total_value,
            )
            asset = service.create_asset(AssetCreate(
                symbol=symbol,
                name=name,
                asset_type=AssetType.NPS,
                asset_metadata=meta,
            ))
            asset.current_price = effective_price
            session.commit()

            pos_repo = PositionRepository(session)
            existing = pos_repo.find_by_asset(asset.id, user_id=current_user.id)
            if existing:
                existing.quantity = total_units
                existing.avg_buy_price = 0.0
                existing.current_value = total_value
                existing.pnl = None
                existing.pnl_percent = 0.0
                session.commit()
            else:
                from app.modules.portfolio.models import Position as _Position
                session.add(_Position(
                    asset_id=asset.id,
                    quantity=total_units,
                    avg_buy_price=0.0,
                    current_value=total_value,
                    pnl=None,
                    pnl_percent=0.0,
                    user_id=current_user.id,
                ))
                session.commit()
            updated_assets += 1
        except Exception as exc:
            errors.append(str(exc))
            try:
                session.rollback()
            except Exception:
                pass

    _sync_tier("NPS_TIER1", "NPS Tier I", "tier1", nps.tier1_schemes)
    _sync_tier("NPS_TIER2", "NPS Tier II", "tier2", nps.tier2_schemes)

    try:
        get_cache().clear_pattern("portfolio:*")
    except Exception:
        pass

    return {
        "dry_run": False,
        "summary": nps.summary(),
        "status": "success" if not errors else "partial",
        "holdings_count": len(nps.tier1_schemes) + len(nps.tier2_schemes),
        "updated_assets": updated_assets,
        "errors": errors,
    }


@router.post("/epf/upload")
def upload_epf_passbook(
        file: UploadFile = File(..., description="EPFO Member Passbook PDF (annual financial year statement)"),
        dry_run: bool = Query(True, description="Preview holdings without writing to DB"),
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Parse an EPFO Member Passbook PDF and import EPF + EPS holdings with transactions.

    Downloads the annual passbook PDF from the EPFO Unified Member Portal
    (https://passbook.epfindia.gov.in).

    - dry_run=true (default): returns parsed transactions + closing balances for review.
    - dry_run=false: upserts EPF and EPS assets, positions, and all contribution
      transactions. Enables XIRR calculation on the EPF asset.
    """
    import tempfile
    import os
    from app.modules.portfolio.providers.epf_passbook import parse_epf_passbook

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted.")

    content = file.file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(content)

        try:
            epf = parse_epf_passbook(tmp_path)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if epf.closing_employee == 0.0 and epf.closing_employer == 0.0:
        raise HTTPException(
            status_code=422,
            detail=(
                "No EPF closing balances found in the PDF. "
                "Verify this is an EPFO Member Passbook (annual financial year statement)."
            ),
        )

    if dry_run:
        return {
            "dry_run": True,
            "summary": epf.summary(),
            "transactions": epf.to_transactions_json(),
        }

    # ── Commit phase ──────────────────────────────────────────────────────────
    from app.modules.portfolio.metadata_schemas import EPFMetadata, EPSMetadata
    from app.modules.portfolio.repositories import PositionRepository
    from app.modules.portfolio.schemas import AssetCreate
    from app.modules.portfolio.models import Position as _Position, Transaction as _Transaction
    from app.shared.constants import AssetType, TransactionType

    service = PortfolioService(session)
    errors: list = []
    committed_transactions = 0

    # Derive monthly contribution amounts from regular (non-transfer) transactions
    regular = [
        t for t in epf.transactions
        if t.txn_type == "CR" and ("cont." in t.particulars.lower() or "due-month" in t.particulars.lower())
    ]
    avg_employee = round(sum(t.employee_contribution for t in regular) / len(regular), 2) if regular else 0.0
    avg_employer = round(sum(t.employer_contribution for t in regular) / len(regular), 2) if regular else 0.0
    avg_pension = round(sum(t.pension_contribution for t in regular) / len(regular), 2) if regular else 0.0

    # ── Upsert EPF asset + position ───────────────────────────────────────────
    try:
        epf_meta = EPFMetadata(
            asset_type="epf",
            uan_number=epf.uan or None,
            employer_name=epf.establishment_name or None,
            employee_monthly=avg_employee,
            employer_monthly=avg_employer,
            interest_rate=8.15,
        )
        epf_asset = service.create_asset(AssetCreate(
            symbol="EPF",
            name="EPF (Employees' Provident Fund)",
            asset_type=AssetType.EPF,
            asset_metadata=epf_meta,
        ))
        total_epf_value = epf.total_epf()
        epf_asset.current_price = total_epf_value
        session.commit()

        pos_repo = PositionRepository(session)
        existing_pos = pos_repo.find_by_asset(epf_asset.id, user_id=current_user.id)
        if existing_pos:
            existing_pos.quantity = 1.0
            existing_pos.avg_buy_price = 0.0
            existing_pos.current_value = total_epf_value
            existing_pos.pnl = None
            existing_pos.pnl_percent = 0.0
            session.commit()
        else:
            session.add(_Position(
                asset_id=epf_asset.id,
                quantity=1.0,
                avg_buy_price=0.0,
                current_value=total_epf_value,
                pnl=None,
                pnl_percent=0.0,
                user_id=current_user.id,
            ))
            session.commit()

        # Import EPF transactions (employee + employer contribution cashflows)
        for t in epf.transactions:
            if not t.parsed_date:
                continue
            total = t.employee_contribution + t.employer_contribution
            if total <= 0:
                continue
            # Skip if an identical transaction already exists (idempotent re-upload)
            existing_txn = session.query(_Transaction).filter(
                _Transaction.asset_id == epf_asset.id,
                _Transaction.transaction_date == t.parsed_date,
                _Transaction.total_value == total,
                _Transaction.user_id == current_user.id,
            ).first()
            if existing_txn:
                continue
            session.add(_Transaction(
                asset_id=epf_asset.id,
                transaction_type=TransactionType.CONTRIBUTION.value,
                quantity=1.0,
                price=total,
                total_value=total,
                transaction_date=t.parsed_date,
                broker="epfo",
                kind="contribution",
                notes=t.particulars[:200],
                user_id=current_user.id,
            ))
            committed_transactions += 1

        session.commit()
    except Exception as exc:
        errors.append(f"EPF: {exc}")
        try:
            session.rollback()
        except Exception:
            pass

    # ── Upsert EPS asset + position ───────────────────────────────────────────
    if epf.closing_pension > 0:
        try:
            eps_meta = EPSMetadata(
                asset_type="eps",
                uan_number=epf.uan or None,
                employer_name=epf.establishment_name or None,
                pensionable_salary=15000.0,
                employer_eps_monthly=avg_pension,
            )
            eps_asset = service.create_asset(AssetCreate(
                symbol="EPS",
                name="EPS (Employee Pension Scheme)",
                asset_type=AssetType.EPS,
                asset_metadata=eps_meta,
            ))
            eps_asset.current_price = epf.closing_pension
            session.commit()

            pos_repo = PositionRepository(session)
            existing_eps = pos_repo.find_by_asset(eps_asset.id, user_id=current_user.id)
            if existing_eps:
                existing_eps.quantity = 1.0
                existing_eps.avg_buy_price = 0.0
                existing_eps.current_value = epf.closing_pension
                existing_eps.pnl = None
                existing_eps.pnl_percent = 0.0
                session.commit()
            else:
                session.add(_Position(
                    asset_id=eps_asset.id,
                    quantity=1.0,
                    avg_buy_price=0.0,
                    current_value=epf.closing_pension,
                    pnl=None,
                    pnl_percent=0.0,
                    user_id=current_user.id,
                ))
                session.commit()
        except Exception as exc:
            errors.append(f"EPS: {exc}")
            try:
                session.rollback()
            except Exception:
                pass

    try:
        get_cache().clear_pattern("portfolio:*")
    except Exception:
        pass

    return {
        "dry_run": False,
        "summary": epf.summary(),
        "status": "success" if not errors else "partial",
        "committed_transactions": committed_transactions,
        "errors": errors,
    }


@router.post("/transactions", response_model=TransactionResponse, status_code=201)
def create_transaction(
        req: TransactionCreate,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """Manually log a single trade transaction and recalculate the position."""
    from app.shared.constants import AssetType

    service = PortfolioService(session)

    # Resolve or auto-create the asset
    symbol = req.symbol.upper()
    asset = service.get_asset(symbol)
    if not asset:
        asset = Asset(
            symbol=symbol,
            name=symbol,
            asset_type=AssetType.EQUITY.value,
        )
        session.add(asset)
        session.flush()

    txn = Transaction(
        asset_id=asset.id,
        user_id=current_user.id,
        transaction_type=req.transaction_type.value,
        quantity=req.quantity,
        price=req.price,
        total_value=req.quantity * req.price,
        transaction_date=req.transaction_date,
        broker=req.broker or "manual",
        notes=req.notes,
        kind="trade",
    )
    session.add(txn)
    session.flush()

    service.recalculate_position(asset.id, current_user.id)
    session.commit()

    return TransactionResponse(
        id=txn.id,
        symbol=asset.symbol,
        transaction_type=txn.transaction_type,
        quantity=txn.quantity,
        price=txn.price,
        total_value=txn.total_value,
        transaction_date=txn.transaction_date,
        broker=txn.broker,
    )


@router.get("/transactions", response_model=list[TransactionResponse])
def list_transactions(
        provider: Optional[str] = None,
        asset: Optional[str] = None,
        limit: int = 200,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    """List transactions with optional filters: ?provider=groww&asset=INFY&limit=200."""
    from app.modules.portfolio.models import Asset
    from sqlalchemy import or_
    q = session.query(Transaction).join(Transaction.asset)
    q = q.filter(or_(Transaction.user_id == current_user.id, Transaction.user_id.is_(None)))
    if provider:
        q = q.filter(Transaction.broker == provider)
    if asset:
        q = q.filter(Asset.symbol == asset.upper())
    transactions = q.order_by(Transaction.transaction_date.desc()).limit(limit).all()
    return [
        TransactionResponse(
            id=t.id,
            symbol=t.asset.symbol,
            transaction_type=t.transaction_type,
            quantity=t.quantity,
            price=t.price,
            total_value=t.total_value,
            transaction_date=t.transaction_date,
            broker=t.broker,
        )
        for t in transactions
    ]
