import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.exceptions import NotFoundError
from app.core.entities.system import TaskRunStatus
from app.core.logging import logger
from app.core.observability.health import fingerprinter
from app.core.redis import check_redis_health, get_cached_asset_health, get_cached_provider_health
from app.core.services.base import BaseService
from app.core.services.config import ConfigService
from app.modules.market.repositories.asset_health import AssetHealthRepository
from app.core.repositories.monitoring import MonitoringRepository
from app.core.repositories.task_run import TaskRunRepository

# Broker/AI providers with a real, working health-check path
# (ConfigService.check_provider_health(), already live in ProviderConfig.jsx)
# that never writes to system.providers — that table is populated only by
# the quote-ingestion fallback chain (mark_provider_healthy/degraded), which
# these providers never go through. Bridged into get_provider_health() below
# rather than into system.providers itself, so status reflects a live check
# made at request time instead of whenever Settings was last opened. See
# MONITORING_MODULE_AUDIT.md / the Job History & Monitoring verification pass.
_BRIDGED_PROVIDERS = ["binance", "groww", "zerodha", "gemini", "groq"]


class MonitoringService(BaseService):
    def __init__(
        self,
        repo: MonitoringRepository,
        asset_health_repo: AssetHealthRepository,
        task_run_repo: TaskRunRepository,
        config_svc: ConfigService,
    ):
        self.repo = repo
        self.asset_health_repo = asset_health_repo
        self.task_run_repo = task_run_repo
        self.config_svc = config_svc

    def _bridged_provider_health(self) -> list[dict[str, Any]]:
        results = []
        for name in _BRIDGED_PROVIDERS:
            try:
                healthy = self.config_svc.check_provider_health(name)
            except Exception as e:
                logger.warning(f"check_provider_health() raised for bridged provider '{name}': {e}")
                healthy = False
            if healthy is None:
                status = "not_configured"
            else:
                status = "healthy" if healthy else "unhealthy"
            results.append({"provider_name": name, "status": status})
        return results

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
        quote_providers = [{"provider_name": p.name, "status": p.health_status} for p in self.repo.list_providers()]
        return quote_providers + self._bridged_provider_health()

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
        providers_summary = {p["provider_name"]: p["status"] for p in self.get_provider_health()}
        is_healthy = all(status == "healthy" or "eager" in status for status in deps.values())

        return {
            "status": "UP" if is_healthy else "DEGRADED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dependencies": deps,
            "providers": providers_summary,
        }

    def check_transaction_integrity(self) -> dict[str, Any]:
        """Live count/consistency check over the Transaction table.

        Not a backup-file check — this codebase's actual backup/restore
        mechanism is the JSON export/import at GET/POST /portfolio/backup
        and /portfolio/restore. A real backup-integrity check (e.g.
        validating that export path produces importable output) would be
        a legitimate future addition, but isn't implemented here.
        """
        txn_count = self.repo.count_transactions()
        status_val = "consistent" if txn_count > 0 else "empty"
        return {
            "status": status_val,
            "message": f"Transaction table integrity check: {txn_count} transactions present.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "verification_metrics": {"transaction_count": txn_count},
        }

    def check_position_quote_integrity(self) -> dict[str, Any]:
        """Live referential-integrity check: every Position has a matching
        LatestQuote. Not a restore-procedure test — no restore is exercised."""
        positions = self.repo.list_positions()
        orphans = 0
        for p in positions:
            if not self.repo.get_quote_by_symbol(p.symbol):
                orphans += 1

        return {
            "status": "healthy" if orphans == 0 else "warning",
            "quote_integrity_check": "passed" if orphans == 0 else "failed",
            "orphan_positions_found": orphans,
            "message": (
                "Position/quote integrity check: all position references to market quotes are valid."
                if orphans == 0
                else f"Found {orphans} position records without corresponding market quotes."
            ),
        }

    def get_observability(
        self,
        task_name: str | None = None,
        status: str | None = None,
        action: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Recent activity merged across task_runs, audit_logs, and error
        fingerprints — one place to look instead of three. Curl-only ops
        surface, no frontend (see MONITORING_MODULE_AUDIT.md)."""
        task_status = TaskRunStatus(status) if status is not None else None

        task_runs = self.task_run_repo.list_filtered(
            task_name=task_name, status=task_status, since=since, until=until,
            limit=limit, offset=offset,
        )
        audit_logs = self.repo.list_audit_logs(
            action=action, since=since, until=until, limit=limit, offset=offset,
        )
        fingerprints = fingerprinter.get_fingerprints()

        events: list[dict[str, Any]] = []
        for t in task_runs:
            events.append({
                "source": "task_run",
                "timestamp": t.started_at.isoformat(),
                "summary": f"{t.task_name} [{t.status.value}]" + (f" asset={t.asset_id}" if t.asset_id else ""),
                "detail": {
                    "task_name": t.task_name,
                    "task_id": t.task_id,
                    "asset_id": t.asset_id,
                    "status": t.status.value,
                    "error_message": t.error_message,
                    "duration_ms": t.duration_ms,
                    "started_at": t.started_at.isoformat(),
                    "ended_at": t.ended_at.isoformat() if t.ended_at else None,
                },
            })
        for a in audit_logs:
            events.append({
                "source": "audit_log",
                "timestamp": a.created_at.isoformat(),
                "summary": f"{a.action} {a.entity_type}" + (f"#{a.entity_id}" if a.entity_id else ""),
                "detail": {
                    "actor_id": str(a.actor_id) if a.actor_id else None,
                    "action": a.action,
                    "entity_type": a.entity_type,
                    "entity_id": a.entity_id,
                    "details": a.details,
                    "created_at": a.created_at.isoformat(),
                },
            })
        for f in fingerprints:
            events.append({
                "source": "error_fingerprint",
                "timestamp": f["last_seen"],
                "summary": f"{f['error_type']}: {f['message']} (x{f['count']})",
                "detail": f,
            })

        events.sort(key=lambda e: e["timestamp"], reverse=True)

        return {
            "events": events[:limit],
            "pagination": {"limit": limit, "offset": offset},
        }
