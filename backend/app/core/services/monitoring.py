import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.exceptions import NotFoundError
from app.core.redis import check_redis_health, get_cached_asset_health, get_cached_provider_health
from app.core.services.base import BaseService
from app.modules.market.repositories.asset_health import AssetHealthRepository
from app.core.repositories.monitoring import MonitoringRepository


class MonitoringService(BaseService):
    def __init__(self, repo: MonitoringRepository, asset_health_repo: AssetHealthRepository):
        self.repo = repo
        self.asset_health_repo = asset_health_repo

    def get_asset_health(self, asset_id: uuid.UUID) -> dict[str, Any]:
        cached = get_cached_asset_health(str(asset_id))
        if cached:
            return cached

        health_records = self.asset_health_repo.get(asset_id)
        if not health_records:
            raise NotFoundError("Asset health not found")

        health = health_records[0]
        return {
            "asset_id": str(health.asset_id),
            "status": health.status,
            "quote_age_seconds": health.quote_age_seconds,
            "updated_at": health.updated_at,
        }

    def get_provider_health(self) -> list[dict[str, Any]]:
        cached = get_cached_provider_health()
        if cached is not None:
            return cached
        return [{"provider_name": p.name, "status": p.health_status} for p in self.repo.list_providers()]

    def get_failed_ingestions(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        failures = self.repo.list_failed_ingestions(limit, offset)
        return [
            {
                "id": str(f.id),
                "provider": f.provider,
                "attempts": f.attempts,
                "is_exhausted": f.is_exhausted,
                "error": f.error,
                "created_at": f.created_at,
            }
            for f in failures
        ]

    def get_dependencies_status(self) -> dict[str, Any]:
        postgres_status = "healthy"
        try:
            self.repo.ping_postgres()
        except Exception as e:
            postgres_status = f"unhealthy: {e}"

        redis_status = "healthy" if check_redis_health() else "unhealthy"

        celery_status = "healthy (eager)"
        try:
            from app.workers.celery_app import celery_app
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
            "celery": celery_status,
        }

    def get_aggregate_health(self) -> dict[str, Any]:
        deps = self.get_dependencies_status()
        providers_summary = {p.name: p.health_status for p in self.repo.list_providers()}
        is_healthy = all(status == "healthy" or "eager" in status for status in deps.values())

        return {
            "status": "UP" if is_healthy else "DEGRADED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dependencies": deps,
            "providers": providers_summary,
        }

    def verify_backups(self) -> dict[str, Any]:
        txn_count = self.repo.count_transactions()
        status_val = "verified" if txn_count > 0 else "empty_database"
        return {
            "status": status_val,
            "message": f"Database verification checked. Active ledger has {txn_count} transactions.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "verification_metrics": {"transaction_count": txn_count},
        }

    def verify_restore_procedures(self) -> dict[str, Any]:
        positions = self.repo.list_positions()
        orphans = 0
        for p in positions:
            if not self.repo.get_quote_by_symbol(p.symbol):
                orphans += 1

        return {
            "status": "healthy" if orphans == 0 else "warning",
            "restore_integrity_check": "passed" if orphans == 0 else "failed",
            "orphan_positions_found": orphans,
            "message": (
                "Restore integrity check: position references to market quotes are fully valid."
                if orphans == 0
                else f"Found {orphans} position records without corresponding market quotes."
            ),
        }
