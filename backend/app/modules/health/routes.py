"""Health check endpoints for liveness and readiness probes."""

import logging
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import settings

router = APIRouter(tags=["health"])
logger = logging.getLogger("app.health")


def _check_db() -> tuple[str, str | None]:
    try:
        from app.core.db import SessionLocal
        with SessionLocal() as db:
            db.execute(__import__("sqlalchemy").text("SELECT 1"))
        return "ok", None
    except Exception as exc:
        return "error", str(exc)


def _check_redis() -> tuple[str, str | None]:
    if not settings.redis_url:
        return "disabled", None
    try:
        import redis as redis_lib
        client = redis_lib.from_url(settings.redis_url, socket_connect_timeout=3, socket_timeout=3)
        client.ping()
        return "ok", None
    except Exception as exc:
        return "error", str(exc)


def _check_rabbitmq() -> tuple[str, str | None]:
    if not settings.celery_broker_url:
        return "disabled", None
    try:
        from kombu import Connection
        with Connection(settings.celery_broker_url) as conn:
            conn.ensure_connection(max_retries=1, timeout=3)
        return "ok", None
    except Exception as exc:
        return "error", str(exc)


@router.get("/health")
async def liveness() -> dict[str, str]:
    """Liveness probe — app process is running."""
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness() -> JSONResponse:
    """Readiness probe — all dependencies reachable."""
    checks: dict[str, Any] = {}

    db_status, db_err = _check_db()
    checks["db"] = {"status": db_status}
    if db_err:
        checks["db"]["error"] = db_err

    redis_status, redis_err = _check_redis()
    checks["redis"] = {"status": redis_status}
    if redis_err:
        checks["redis"]["error"] = redis_err

    rabbitmq_status, rabbitmq_err = _check_rabbitmq()
    checks["rabbitmq"] = {"status": rabbitmq_status}
    if rabbitmq_err:
        checks["rabbitmq"]["error"] = rabbitmq_err

    failed = [k for k, v in checks.items() if v["status"] == "error"]
    overall = "error" if failed else "ready"
    http_status = 503 if failed else 200

    if failed:
        logger.warning("Readiness check failed for: %s", ", ".join(failed))

    return JSONResponse(
        status_code=http_status,
        content={"status": overall, "checks": checks},
    )
