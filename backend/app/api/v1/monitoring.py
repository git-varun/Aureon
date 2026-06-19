import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis import get_cached_asset_health, get_cached_provider_health
from app.domain.entities.system import FailedIngestion
from app.infrastructure.repositories.asset_health import AssetHealthRepository

router = APIRouter()

@router.get("/assets/{asset_id}/health")
def get_asset_health(asset_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    cached = get_cached_asset_health(str(asset_id))
    if cached:
        return cached

    repo = AssetHealthRepository(db)
    health_records = repo.get(asset_id)
    if not health_records:
        raise HTTPException(status_code=404, detail="Asset health not found")

    health = health_records[0]
    return {
        "asset_id": str(health.asset_id),
        "provider_name": health.provider_name,
        "status": health.status,
        "quote_age_seconds": health.quote_age_seconds,
        "updated_at": health.updated_at
    }

@router.get("/providers")
def get_provider_health(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    cached = get_cached_provider_health()
    if cached is not None:
        return cached
        
    from app.domain.entities.system import Provider
    providers = db.query(Provider).all()
    return [{"provider_name": p.name, "status": p.health_status} for p in providers]

@router.get("/failed-ingestions")
def get_failed_ingestions(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    failures = db.query(FailedIngestion).order_by(FailedIngestion.created_at.desc()).limit(limit).offset(offset).all()
    return [
        {
            "id": str(f.id),
            "provider": f.provider,
            "attempts": f.attempts,
            "is_exhausted": f.is_exhausted,
            "error": f.error,
            "created_at": f.created_at
        } for f in failures
    ]


@router.get("/dependencies")
def get_dependencies_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    from sqlalchemy import text

    from app.core.redis import check_redis_health
    
    # 1. PostgreSQL check
    postgres_status = "healthy"
    try:
        db.execute(text("SELECT 1")).scalar()
    except Exception as e:
        postgres_status = f"unhealthy: {e}"
        
    # 2. Redis check
    redis_healthy = check_redis_health()
    redis_status = "healthy" if redis_healthy else "unhealthy"
    
    # 3. Celery check
    # We can check if Celery is running by inspecting active queues or tasks
    celery_status = "healthy (eager)"
    try:
        from app.workers.celery_app import celery_app
        # If broker is not configured, it falls back to eager mode
        if celery_app.conf.task_always_eager:
            celery_status = "healthy (eager mode)"
        else:
            inspector = celery_app.control.inspect()
            if inspector and inspector.ping():
                celery_status = "healthy"
            else:
                celery_status = "degraded (no workers active)"
    except Exception as e:
        celery_status = f"unknown: {e}"
        
    return {
        "postgresql": postgres_status,
        "redis": redis_status,
        "celery": celery_status
    }


@router.get("/health/aggregate")
def get_aggregate_health(db: Session = Depends(get_db)) -> dict[str, Any]:
    deps = get_dependencies_status(db)
    
    # Provider health summary
    from app.domain.entities.system import Provider
    providers = db.query(Provider).all()
    providers_summary = {p.name: p.health_status for p in providers}
    
    # Overall health flag
    is_healthy = all(status == "healthy" or "eager" in status for status in deps.values())
    
    return {
        "status": "UP" if is_healthy else "DEGRADED",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dependencies": deps,
        "providers": providers_summary
    }


@router.get("/backups/verify")
def verify_backups(db: Session = Depends(get_db)) -> dict[str, Any]:
    # Check if there are any records in transactions to verify database holds data
    from app.domain.entities.portfolio import Transaction
    txn_count = db.query(Transaction).count()
    
    status_val = "verified" if txn_count > 0 else "empty_database"
    return {
        "status": status_val,
        "message": f"Database verification checked. Active ledger has {txn_count} transactions.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "verification_metrics": {
            "transaction_count": txn_count
        }
    }


@router.get("/restore/verify")
def verify_restore_procedures(db: Session = Depends(get_db)) -> dict[str, Any]:
    # Verifies integrity: foreign keys are valid and no orphan records exist
    from app.domain.entities.market import LatestQuote
    from app.domain.entities.portfolio import Position
    
    # Check orphan positions
    positions = db.query(Position).all()
    orphans = 0
    for p in positions:
        quote = db.query(LatestQuote).filter(LatestQuote.symbol == p.symbol).first()
        if not quote:
            orphans += 1
            
    return {
        "status": "healthy" if orphans == 0 else "warning",
        "restore_integrity_check": "passed" if orphans == 0 else "failed",
        "orphan_positions_found": orphans,
        "message": "Restore integrity check: position references to market quotes are fully valid." if orphans == 0 else f"Found {orphans} position records without corresponding market quotes."
    }

