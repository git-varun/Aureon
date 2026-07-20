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
from app.core.redis import (
    cache_portfolio_snapshot,
    get_cached_portfolio_snapshot,
    invalidate_intelligence_outcomes,
    invalidate_intelligence_recommendations,
    store_backup_receipt,
)
from app.core.entities.system import User
from app.core.services.config import ConfigService
from app.modules.portfolio.services.portfolio import PortfolioService
from app.modules.portfolio.entities.portfolio import Portfolio, Transaction
from app.modules.market.repositories.watchlist import WatchlistsRepository
from app.modules.market.entities.watchlist import Watchlist, WatchlistSymbol
from app.modules.market.entities.market import MarketTheme, ThemeWeight
from app.modules.market.services.market import ensure_asset_exists
from app.modules.ai.entities.ai import AIBriefing, AIEvaluation, AIFeedback, AIGeneration
from app.modules.ai.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)

router = APIRouter()


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


def _txn_to_backup(t: Transaction) -> Dict[str, Any]:
    return {
        "id": str(t.id),
        "symbol": t.symbol,
        "type": t.transaction_type,
        "qty": float(t.quantity),
        "price": float(t.price),
        "date": t.transaction_date.isoformat(),
        "fees": float(t.fees),
        "taxes": float(t.taxes),
        "notes": t.notes,
        "broker": t.broker,
        "broker_reference": t.broker_reference,
        "kind": t.kind,
        "asset_id": str(t.asset_id) if t.asset_id else None,
        "recommendation_id": str(t.recommendation_id) if t.recommendation_id else None,
        "created_at": _iso(t.created_at),
        "updated_at": _iso(t.updated_at),
    }


def _watchlist_to_backup(w: Watchlist) -> Dict[str, Any]:
    return {
        "name": w.name,
        "symbols": [
            {
                "symbol": s.symbol,
                "alert_price": float(s.alert_price) if s.alert_price is not None else None,
                "alert_direction": s.alert_direction,
                "alert_triggered": s.alert_triggered,
            }
            for s in w.symbols
        ],
    }


def _ai_generation_to_backup(g: AIGeneration) -> Dict[str, Any]:
    return {
        "id": str(g.id),
        "user_id": str(g.user_id) if g.user_id else None,
        "feature_name": g.feature_name,
        "provider": g.provider,
        "model": g.model,
        "prompt_version": g.prompt_version,
        "prompt_text": g.prompt_text,
        "context_payload": g.context_payload,
        "retrieval_metadata": g.retrieval_metadata,
        "response_text": g.response_text,
        "prompt_tokens": g.prompt_tokens,
        "completion_tokens": g.completion_tokens,
        "total_tokens": g.total_tokens,
        "latency_ms": g.latency_ms,
        "execution_trace": g.execution_trace,
        "error_message": g.error_message,
        "generation_parameters": g.generation_parameters,
        "prompt_sha256": g.prompt_sha256,
        "data_classification": g.data_classification,
        "payload_retention_state": g.payload_retention_state,
        "created_at": _iso(g.created_at),
        "updated_at": _iso(g.updated_at),
    }


def _ai_evaluation_to_backup(e: AIEvaluation) -> Dict[str, Any]:
    return {
        "id": str(e.id),
        "generation_id": str(e.generation_id),
        "faithfulness_score": float(e.faithfulness_score) if e.faithfulness_score is not None else None,
        "relevance_score": float(e.relevance_score) if e.relevance_score is not None else None,
        "data_reference_validated": e.data_reference_validated,
        "validation_details": e.validation_details,
        "created_at": _iso(e.created_at),
        "updated_at": _iso(e.updated_at),
    }


def _ai_feedback_to_backup(f: AIFeedback) -> Dict[str, Any]:
    return {
        "id": str(f.id),
        "generation_id": str(f.generation_id),
        "user_id": str(f.user_id) if f.user_id else None,
        "rating": f.rating,
        "comment": f.comment,
        "created_at": _iso(f.created_at),
        "updated_at": _iso(f.updated_at),
    }


def _ai_briefing_to_backup(b: AIBriefing) -> Dict[str, Any]:
    return {
        "id": str(b.id),
        "briefing_type": b.briefing_type,
        "symbol": b.symbol,
        "content": b.content,
        "model_used": b.model_used,
        "prompt_tokens": b.prompt_tokens,
        "created_at": _iso(b.created_at),
        "updated_at": _iso(b.updated_at),
    }


def _recommendation_to_backup(r: Recommendation) -> Dict[str, Any]:
    return {
        "id": str(r.id),
        "asset_id": str(r.asset_id),
        "recommendation_state": r.recommendation_state,
        "confidence_score": float(r.confidence_score),
        "status": r.status,
        "version": r.version,
        "created_at": _iso(r.created_at),
        "updated_at": _iso(r.updated_at),
    }


def _recommendation_explanation_to_backup(e: RecommendationExplanation) -> Dict[str, Any]:
    return {
        "recommendation_id": str(e.recommendation_id),
        "rules_matched": e.rules_matched,
        "reasoning": e.reasoning,
        "confidence_factors": e.confidence_factors,
    }


def _recommendation_outcome_to_backup(o: RecommendationOutcome) -> Dict[str, Any]:
    return {
        "recommendation_id": str(o.recommendation_id),
        "status": o.status,
        "action_taken_at": _iso(o.action_taken_at),
        "dismiss_reason": o.dismiss_reason,
        "ledger_transaction_id": str(o.ledger_transaction_id) if o.ledger_transaction_id else None,
        "predicted_impact": float(o.predicted_impact) if o.predicted_impact is not None else None,
        "realized_impact": float(o.realized_impact) if o.realized_impact is not None else None,
    }


def _market_theme_to_backup(t: MarketTheme) -> Dict[str, Any]:
    return {
        "id": str(t.id),
        "theme_id": t.theme_id,
        "name": t.name,
        "desc": t.desc,
        "symbols": t.symbols,
        "ret1m": float(t.ret1m),
        "forked_from": t.forked_from,
        "inception_date": t.inception_date,
        "is_public": t.is_public,
        "created_at": _iso(t.created_at),
        "updated_at": _iso(t.updated_at),
    }


def _theme_weight_to_backup(w: ThemeWeight) -> Dict[str, Any]:
    return {
        "id": str(w.id),
        "theme_id": w.theme_id,
        "symbol": w.symbol,
        "weight": float(w.weight),
        "effective_date": w.effective_date,
        "mcap_at_set": float(w.mcap_at_set) if w.mcap_at_set is not None else None,
        "created_at": _iso(w.created_at),
    }


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
        pos.price, pos.price_source, pos.quote_age_status, pos.quote_updated_at, pos.epf_estimate_basis, pos.currency = service.get_position_price(pos)
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

@router.get("/portfolios/{portfolio_id}/history")
def get_portfolio_history_route(
    portfolio_id: uuid.UUID,
    days: int = Query(90, ge=1, le=1825),
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        return service.get_history(portfolio_id, days)
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

@router.post("/portfolios/{portfolio_id}/import/groww/holdings")
async def import_groww_stocks_holdings(
    portfolio_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    content = await file.read()
    try:
        return service.import_groww_stocks_holdings(
            portfolio_id=portfolio_id,
            file_bytes=content,
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/portfolios/{portfolio_id}/import/groww/mf-holdings")
async def import_groww_mf_holdings(
    portfolio_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    content = await file.read()
    try:
        return service.import_groww_mf_holdings(
            portfolio_id=portfolio_id,
            file_bytes=content,
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
    password: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    service: PortfolioService = Depends(get_portfolio_service),
):
    content = await file.read()
    try:
        return service.import_epf_statement(
            portfolio_id=portfolio_id,
            file_bytes=content,
            password=password,
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

@router.post("/portfolios/{portfolio_id}/sync/binance/backfill")
def backfill_binance_spot(
    portfolio_id: uuid.UUID,
    service: PortfolioService = Depends(get_portfolio_service),
    config_svc: ConfigService = Depends(get_config_service),
):
    """One-time, user-triggered full-history Spot trade backfill (see
    BinanceClient.get_spot_trades_page / PortfolioService.backfill_binance_spot)
    — not part of regular sync cadence. Resumable: an interrupted run continues
    from its per-symbol checkpoint on the next call. Spot only — Binance's
    futures trade-history endpoints don't feed any read path today, so futures
    aren't backfilled."""
    try:
        service.get_portfolio(portfolio_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    task_id = config_svc.dispatch_job("backfill_binance_spot", extra_kwargs={"portfolio_id": str(portfolio_id)})
    return {
        "status": "queued",
        "task_id": task_id,
        "scope": "spot_only",
        "message": (
            "Binance Spot trade-history backfill queued — walks full account history "
            "via fromId pagination, resumable if interrupted. Spot only: Futures trade "
            "history is not backfilled (Binance API limitation). Poll "
            "GET /portfolios/{id}/sync/binance/backfill/status for progress."
        ),
    }

@router.get("/portfolios/{portfolio_id}/sync/binance/backfill/status")
def get_binance_backfill_status(
    portfolio_id: uuid.UUID,
    service: PortfolioService = Depends(get_portfolio_service),
):
    try:
        return service.get_binance_backfill_status(portfolio_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/backup")
def export_backup(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    service: PortfolioService = Depends(get_portfolio_service),
    watchlists_repo: WatchlistsRepository = Depends(get_watchlist_repo),
):
    # Export every Portfolio row, not just the one get_user_context()/.first()
    # happens to resolve — the schema supports (and this install actually has)
    # more than one Portfolio, and a backup that silently drops a second
    # portfolio's transactions isn't a real safety net for a reset (see
    # DATA_RESET_SCOPE.md §5).
    portfolios = service.portfolios_repo.list_all()
    watchlists = watchlists_repo.list_by_user(user.id)

    # AI history, recommendation history, and custom themes are the other three
    # data-only-reset scopes (see DATA_RESET_SCOPE.md §4) — a backup covering
    # only transactions/watchlists can't back a reset of those, so all four are
    # exported together as one comprehensive backup, not per-scope files.
    ai_generations = db.query(AIGeneration).order_by(AIGeneration.created_at.asc()).all()
    generation_ids = [g.id for g in ai_generations]
    ai_evaluations = (
        db.query(AIEvaluation).filter(AIEvaluation.generation_id.in_(generation_ids)).all()
        if generation_ids else []
    )
    ai_feedback = (
        db.query(AIFeedback).filter(AIFeedback.generation_id.in_(generation_ids)).all()
        if generation_ids else []
    )
    ai_briefings = db.query(AIBriefing).order_by(AIBriefing.created_at.asc()).all()

    recommendations = db.query(Recommendation).order_by(Recommendation.created_at.asc()).all()
    recommendation_ids = [r.id for r in recommendations]
    recommendation_explanations = (
        db.query(RecommendationExplanation)
        .filter(RecommendationExplanation.recommendation_id.in_(recommendation_ids)).all()
        if recommendation_ids else []
    )
    recommendation_outcomes = (
        db.query(RecommendationOutcome)
        .filter(RecommendationOutcome.recommendation_id.in_(recommendation_ids)).all()
        if recommendation_ids else []
    )

    # Only the default user's forked/owned themes — public/system themes
    # (owner_id IS NULL) are market reference data, out of reset scope.
    market_themes = db.query(MarketTheme).filter(MarketTheme.owner_id == user.id).all()
    theme_ids = [t.theme_id for t in market_themes]
    theme_weights = (
        db.query(ThemeWeight).filter(ThemeWeight.theme_id.in_(theme_ids)).all()
        if theme_ids else []
    )

    backup = {
        "version": "3.0.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user_id": str(user.id),
        "portfolios": [
            {
                "name": p.name,
                "transactions": [
                    _txn_to_backup(t) for t in service.transactions_repo.get_by_portfolio(p.id)
                ],
            }
            for p in portfolios
        ],
        "watchlists": [_watchlist_to_backup(w) for w in watchlists],
        "ai_generations": [_ai_generation_to_backup(g) for g in ai_generations],
        "ai_evaluations": [_ai_evaluation_to_backup(e) for e in ai_evaluations],
        "ai_feedback": [_ai_feedback_to_backup(f) for f in ai_feedback],
        "ai_briefings": [_ai_briefing_to_backup(b) for b in ai_briefings],
        "recommendations": [_recommendation_to_backup(r) for r in recommendations],
        "recommendation_explanations": [
            _recommendation_explanation_to_backup(e) for e in recommendation_explanations
        ],
        "recommendation_outcomes": [
            _recommendation_outcome_to_backup(o) for o in recommendation_outcomes
        ],
        "market_themes": [_market_theme_to_backup(t) for t in market_themes],
        "theme_weights": [_theme_weight_to_backup(w) for w in theme_weights],
    }

    content = json.dumps(backup, indent=2)

    # Receipt for the data-reset backup-first gate (DATA_RESET_SCOPE.md §5) — this
    # export covers every reset scope (portfolio, watchlists, AI history,
    # recommendation history, custom themes) in one file, so a single receipt
    # authorizes any/all of them. POST /reset requires it, single-use, 10 min TTL.
    receipt = str(uuid.uuid4())
    store_backup_receipt(receipt)

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=aureon_backup_{datetime.now(timezone.utc).strftime('%Y%m%d')}.json",
            "X-Backup-Receipt": receipt,
        }
    )

@router.post("/restore")
def restore_backup(
    file: UploadFile = File(...),
    confirm: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    service: PortfolioService = Depends(get_portfolio_service),
    watchlists_repo: WatchlistsRepository = Depends(get_watchlist_repo),
):
    content = file.file.read()
    data = json.loads(content)

    # Backward compatibility with the pre-multi-portfolio export shape (a flat
    # top-level "transactions" list): treat it as a single unnamed portfolio,
    # restored into whatever get_user_context() resolves.
    portfolio_entries = data.get("portfolios")
    if portfolio_entries is None:
        portfolio_entries = [{"name": None, "transactions": data.get("transactions", [])}]

    if not confirm:
        return {
            "status": "dry_run",
            "transactions_count": sum(len(p.get("transactions", [])) for p in portfolio_entries),
            "portfolios_count": len(portfolio_entries),
            "watchlists_count": len(data.get("watchlists", [])),
            "ai_generations_count": len(data.get("ai_generations", [])),
            "ai_evaluations_count": len(data.get("ai_evaluations", [])),
            "ai_feedback_count": len(data.get("ai_feedback", [])),
            "ai_briefings_count": len(data.get("ai_briefings", [])),
            "recommendations_count": len(data.get("recommendations", [])),
            "recommendation_explanations_count": len(data.get("recommendation_explanations", [])),
            "recommendation_outcomes_count": len(data.get("recommendation_outcomes", [])),
            "market_themes_count": len(data.get("market_themes", [])),
            "theme_weights_count": len(data.get("theme_weights", [])),
        }

    # Restore order matters: recommendations before transactions (transactions
    # reference recommendation_id), transactions before recommendation_outcomes
    # (outcomes reference ledger_transaction_id). asset_id is not trusted from
    # the export — re-derived via ensure_asset_exists, which is deterministic
    # per symbol (uuid5), so it lands on the same row without depending on
    # market reference data having been exported (it's out of reset scope).

    for r in data.get("recommendations", []):
        rec = Recommendation(
            id=uuid.UUID(r["id"]) if r.get("id") else uuid.uuid4(),
            asset_id=uuid.UUID(r["asset_id"]),
            recommendation_state=r["recommendation_state"],
            confidence_score=r["confidence_score"],
            status=r.get("status", "active"),
            version=r.get("version", "v2.0.0"),
        )
        if r.get("created_at"):
            rec.created_at = datetime.fromisoformat(r["created_at"])
        if r.get("updated_at"):
            rec.updated_at = datetime.fromisoformat(r["updated_at"])
        db.add(rec)
    db.flush()

    for e in data.get("recommendation_explanations", []):
        db.add(RecommendationExplanation(
            recommendation_id=uuid.UUID(e["recommendation_id"]),
            rules_matched=e["rules_matched"],
            reasoning=e["reasoning"],
            confidence_factors=e["confidence_factors"],
        ))

    # Restored per-portfolio, matched by name — not the single get_user_context()
    # row — since the schema (and this install) supports more than one Portfolio,
    # and a restore that flattens every portfolio's transactions into whichever
    # one happens to resolve first would silently merge or misattribute ledgers.
    txn_count = 0
    portfolios_count = 0
    portfolio_ids_touched: set[uuid.UUID] = set()
    for entry in portfolio_entries:
        name = entry.get("name")
        if name:
            portfolio = db.query(Portfolio).filter(Portfolio.name == name).first()
            if not portfolio:
                portfolio = Portfolio(name=name)
                db.add(portfolio)
                db.flush()
            portfolio_id = portfolio.id
        else:
            portfolio_id = get_user_context(db, user)
        portfolios_count += 1
        portfolio_ids_touched.add(portfolio_id)

        symbols_touched: set[str] = set()
        for t in entry.get("transactions", []):
            symbol = t["symbol"].upper().strip()
            asset_id = ensure_asset_exists(db, symbol)
            txn = Transaction(
                id=uuid.UUID(t["id"]) if t.get("id") else uuid.uuid4(),
                portfolio_id=portfolio_id,
                symbol=symbol,
                asset_id=asset_id,
                transaction_type=t["type"].upper().strip(),
                quantity=t["qty"],
                price=t["price"],
                transaction_date=datetime.fromisoformat(t["date"]),
                fees=t.get("fees", 0.0),
                taxes=t.get("taxes", 0.0),
                notes=t.get("notes"),
                broker=t.get("broker"),
                broker_reference=t.get("broker_reference"),
                kind=t.get("kind", "trade"),
                recommendation_id=uuid.UUID(t["recommendation_id"]) if t.get("recommendation_id") else None,
            )
            if t.get("created_at"):
                txn.created_at = datetime.fromisoformat(t["created_at"])
            if t.get("updated_at"):
                txn.updated_at = datetime.fromisoformat(t["updated_at"])
            db.add(txn)
            symbols_touched.add(symbol)
            txn_count += 1
        db.flush()

        for symbol in symbols_touched:
            service.recalculate_position(portfolio_id, symbol)
            # recalculate_position falls back to the latest broker_snapshot row for
            # broker-synced symbols, but that row's `price` is a live-balance
            # placeholder (often 0), not a real cost basis. The normal broker-sync
            # path derives avg_buy_price from kind="broker_trade" rows afterward
            # (_apply_trade_cost_basis) — restore must do the same or it corrupts
            # avg_buy_price to whatever the snapshot's placeholder price was.
            service._apply_trade_cost_basis(portfolio_id, symbol)

    for o in data.get("recommendation_outcomes", []):
        db.add(RecommendationOutcome(
            recommendation_id=uuid.UUID(o["recommendation_id"]),
            status=o["status"],
            action_taken_at=(
                datetime.fromisoformat(o["action_taken_at"])
                if o.get("action_taken_at") else datetime.now(timezone.utc)
            ),
            dismiss_reason=o.get("dismiss_reason"),
            ledger_transaction_id=(
                uuid.UUID(o["ledger_transaction_id"]) if o.get("ledger_transaction_id") else None
            ),
            predicted_impact=o.get("predicted_impact"),
            realized_impact=o.get("realized_impact"),
        ))

    watchlists_count = 0
    for w in data.get("watchlists", []):
        wl = watchlists_repo.get_by_user_and_name(user.id, w["name"])
        if not wl:
            wl = Watchlist(user_id=user.id, name=w["name"])
            db.add(wl)
            db.flush()
        for sym_entry in w.get("symbols", []):
            # Tolerate both the old export shape (bare symbol strings) and the
            # current one (dicts with alert fields).
            sym_dict = sym_entry if isinstance(sym_entry, dict) else {"symbol": sym_entry}
            sym = (sym_dict.get("symbol") or "").upper().strip()
            if not sym or watchlists_repo.get_symbol(wl.id, sym):
                continue
            ws = WatchlistSymbol(
                watchlist_id=wl.id,
                symbol=sym,
                alert_price=sym_dict.get("alert_price"),
                alert_direction=sym_dict.get("alert_direction"),
                alert_triggered=bool(sym_dict.get("alert_triggered", False)),
            )
            db.add(ws)
        watchlists_count += 1
    db.flush()

    for g in data.get("ai_generations", []):
        gen = AIGeneration(
            id=uuid.UUID(g["id"]) if g.get("id") else uuid.uuid4(),
            user_id=uuid.UUID(g["user_id"]) if g.get("user_id") else None,
            feature_name=g["feature_name"],
            provider=g["provider"],
            model=g["model"],
            prompt_version=g.get("prompt_version"),
            prompt_text=g["prompt_text"],
            context_payload=g.get("context_payload"),
            retrieval_metadata=g.get("retrieval_metadata"),
            response_text=g["response_text"],
            prompt_tokens=g.get("prompt_tokens"),
            completion_tokens=g.get("completion_tokens"),
            total_tokens=g.get("total_tokens"),
            latency_ms=g.get("latency_ms"),
            execution_trace=g.get("execution_trace"),
            error_message=g.get("error_message"),
            generation_parameters=g.get("generation_parameters") or {},
            prompt_sha256=g.get("prompt_sha256"),
            data_classification=g.get("data_classification"),
            payload_retention_state=g.get("payload_retention_state", "full"),
        )
        if g.get("created_at"):
            gen.created_at = datetime.fromisoformat(g["created_at"])
        if g.get("updated_at"):
            gen.updated_at = datetime.fromisoformat(g["updated_at"])
        db.add(gen)
    db.flush()

    for e in data.get("ai_evaluations", []):
        db.add(AIEvaluation(
            id=uuid.UUID(e["id"]) if e.get("id") else uuid.uuid4(),
            generation_id=uuid.UUID(e["generation_id"]),
            faithfulness_score=e.get("faithfulness_score"),
            relevance_score=e.get("relevance_score"),
            data_reference_validated=e.get("data_reference_validated", True),
            validation_details=e.get("validation_details"),
        ))

    for f in data.get("ai_feedback", []):
        db.add(AIFeedback(
            id=uuid.UUID(f["id"]) if f.get("id") else uuid.uuid4(),
            generation_id=uuid.UUID(f["generation_id"]),
            user_id=uuid.UUID(f["user_id"]) if f.get("user_id") else None,
            rating=f["rating"],
            comment=f.get("comment"),
        ))

    for b in data.get("ai_briefings", []):
        briefing = AIBriefing(
            id=uuid.UUID(b["id"]) if b.get("id") else uuid.uuid4(),
            briefing_type=b["briefing_type"],
            symbol=b.get("symbol"),
            content=b["content"],
            model_used=b["model_used"],
            prompt_tokens=b.get("prompt_tokens"),
        )
        if b.get("created_at"):
            briefing.created_at = datetime.fromisoformat(b["created_at"])
        db.add(briefing)

    for t in data.get("market_themes", []):
        db.add(MarketTheme(
            id=uuid.UUID(t["id"]) if t.get("id") else uuid.uuid4(),
            theme_id=t["theme_id"],
            name=t["name"],
            desc=t["desc"],
            symbols=t.get("symbols", []),
            ret1m=t.get("ret1m", 0.0),
            owner_id=user.id,
            forked_from=t.get("forked_from"),
            inception_date=t.get("inception_date"),
            is_public=t.get("is_public", False),
        ))
    db.flush()

    for w in data.get("theme_weights", []):
        db.add(ThemeWeight(
            id=uuid.UUID(w["id"]) if w.get("id") else uuid.uuid4(),
            theme_id=w["theme_id"],
            symbol=w["symbol"],
            weight=w["weight"],
            effective_date=w["effective_date"],
            mcap_at_set=w.get("mcap_at_set"),
        ))

    db.commit()
    for pid in portfolio_ids_touched:
        service._invalidate_portfolio_caches(pid)
        invalidate_intelligence_recommendations(str(pid))
        invalidate_intelligence_outcomes(str(pid))

    return {
        "status": "success",
        "imported_transactions": txn_count,
        "imported_portfolios": portfolios_count,
        "imported_watchlists": watchlists_count,
        "imported_ai_generations": len(data.get("ai_generations", [])),
        "imported_ai_evaluations": len(data.get("ai_evaluations", [])),
        "imported_ai_feedback": len(data.get("ai_feedback", [])),
        "imported_ai_briefings": len(data.get("ai_briefings", [])),
        "imported_recommendations": len(data.get("recommendations", [])),
        "imported_recommendation_explanations": len(data.get("recommendation_explanations", [])),
        "imported_recommendation_outcomes": len(data.get("recommendation_outcomes", [])),
        "imported_market_themes": len(data.get("market_themes", [])),
        "imported_theme_weights": len(data.get("theme_weights", [])),
    }
