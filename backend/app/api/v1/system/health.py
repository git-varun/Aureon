from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import check_redis_health

router = APIRouter()

class DependencyStatus(BaseModel):
    database: str
    redis: str
    celery: str

class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str
    dependencies: DependencyStatus
    providers: dict[str, str]
    migration_version: str
    build_version: str
    configuration: dict[str, Any]

@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    # 1. Database check
    postgres_status = "healthy"
    try:
        db.execute(text("SELECT 1")).scalar()
    except Exception as e:
        postgres_status = f"unhealthy: {str(e)}"
        
    # 2. Redis check
    redis_healthy = check_redis_health()
    redis_status = "healthy" if redis_healthy else "unhealthy"
    
    # 3. Celery check
    celery_status = "healthy (eager)"
    try:
        from app.workers.celery_app import celery_app
        if celery_app.conf.task_always_eager:
            celery_status = "healthy (eager mode)"
        else:
            inspector = celery_app.control.inspect()
            if inspector:
                pings = inspector.ping()
                if pings:
                    celery_status = "healthy"
                else:
                    celery_status = "degraded (no workers active)"
            else:
                celery_status = "degraded (inspections offline)"
    except Exception as e:
        celery_status = f"unknown: {str(e)}"

    # 4. Providers health
    providers_summary: dict[str, str] = {}
    try:
        from app.domain.entities.system import Provider
        providers = db.query(Provider).all()
        providers_summary = {p.name: (p.health_status or "unknown") for p in providers}
    except Exception as e:
        providers_summary["error"] = f"failed to retrieve providers: {str(e)}"

    # 5. Migration version
    migration_version = "unknown"
    try:
        mig_val = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
        migration_version = str(mig_val) if mig_val else "none"
    except Exception:
        migration_version = "none" # Table might not exist yet if not migrated

    # 6. Build Version
    build_version = "9A.3-production"

    # 7. Configuration Status
    config_status = {
        "debug_mode": settings.DEBUG,
        "google_oauth_configured": settings.GOOGLE_CLIENT_ID is not None,
        "finnhub_api_configured": settings.FINNHUB_API_KEY is not None,
        "polygon_api_configured": settings.POLYGON_API_KEY is not None,
        "cors_origins_configured": len(settings.CORS_ALLOWED_ORIGINS) > 0
    }

    # Determine overall health status
    is_healthy = (
        postgres_status == "healthy"
        and redis_status == "healthy"
        and ("healthy" in celery_status)
    )
    overall_status = "healthy" if is_healthy else "degraded"

    return HealthResponse(
        status=overall_status,
        service="Aureon API",
        timestamp=datetime.now(timezone.utc).isoformat(),
        dependencies=DependencyStatus(
            database=postgres_status,
            redis=redis_status,
            celery=celery_status
        ),
        providers=providers_summary,
        migration_version=migration_version,
        build_version=build_version,
        configuration=config_status
    )

@router.get("/health/score")
def health_score() -> dict[str, Any]:
    from app.core.observability.health import health_engine
    return health_engine.compute_health_score()
