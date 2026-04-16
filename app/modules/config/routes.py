"""Config routes: profile, providers, jobs — DB-backed replacements for main.py stubs."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth
from app.modules.config.services import ConfigService

router = APIRouter(prefix="/api", tags=["config"])


# ── Request schemas ───────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


class ProviderUpdate(BaseModel):
    enabled: Optional[bool] = None


class ProviderKeyUpdate(BaseModel):
    key_name: str
    value: str


class JobUpdate(BaseModel):
    enabled: Optional[bool] = None
    cron_schedule: Optional[str] = None


# ── In-memory profile (single-user, Phase 8 will move this to users table) ───

_profile = {"name": "Investor", "email": ""}


@router.get("/profile")
def get_profile():
    return {"profile": _profile}


@router.put("/profile")
def update_profile(payload: ProfileUpdate):
    if payload.name is not None:
        _profile["name"] = payload.name
    if payload.email is not None:
        _profile["email"] = payload.email
    return {"profile": _profile}


# ── Providers ─────────────────────────────────────────────────────────────────

@router.get("/providers")
def get_providers(db: Session = Depends(get_session)):
    svc = ConfigService(db)
    return {"providers": svc.get_all_providers()}


@router.put("/providers/{provider_name}")
def update_provider(provider_name: str, payload: ProviderUpdate, db: Session = Depends(get_session)):
    svc = ConfigService(db)
    result = svc.update_provider(provider_name, enabled=payload.enabled)
    if not result:
        raise HTTPException(status_code=404, detail=f"Provider {provider_name} not found")
    return {"providers": svc.get_all_providers()}


@router.put("/providers/{provider_name}/keys")
def set_provider_key(provider_name: str, payload: ProviderKeyUpdate, db: Session = Depends(get_session), _user=Depends(require_auth)):
    svc = ConfigService(db)
    ok = svc.set_provider_key(provider_name, payload.key_name, payload.value)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Provider {provider_name} not found")
    return {"status": "ok"}


# ── Jobs ──────────────────────────────────────────────────────────────────────

@router.get("/jobs")
def get_jobs(db: Session = Depends(get_session)):
    svc = ConfigService(db)
    return {"jobs": svc.get_all_jobs()}


@router.put("/jobs/{job_name}")
def update_job(job_name: str, payload: JobUpdate, db: Session = Depends(get_session)):
    svc = ConfigService(db)
    result = svc.update_job(job_name, enabled=payload.enabled, cron_expression=payload.cron_schedule)
    if not result:
        raise HTTPException(status_code=404, detail=f"Job {job_name} not found")
    return {"jobs": svc.get_all_jobs()}


@router.post("/jobs/{job_name}/run")
def run_job(job_name: str, db: Session = Depends(get_session)):
    """Trigger a job by name and log the execution."""
    from app.modules.config.models import JobStatus
    svc = ConfigService(db)
    job = svc.get_job(job_name)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_name} not found")

    task_id = None
    try:
        task_id = _dispatch_job(job_name)
    except Exception as e:
        log = svc.log_job_start(job_name)
        svc.log_job_end(log.id, JobStatus.FAILED, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to dispatch {job_name}: {e}")

    svc.log_job_start(job_name, task_id=task_id)
    svc.mark_job_ran(job_name)
    return {"status": "triggered", "job_name": job_name, "task_id": task_id}


@router.get("/jobs/{job_name}/logs")
def get_job_logs(job_name: str, limit: int = 50, db: Session = Depends(get_session)):
    svc = ConfigService(db)
    return {"logs": svc.get_job_logs(job_name, limit=limit), "job_name": job_name}


# ── Job dispatch registry ─────────────────────────────────────────────────────

def _dispatch_job(job_name: str) -> Optional[str]:
    """Map job_name → Celery task and dispatch. Returns task_id."""
    if job_name == "sync_portfolio":
        from app.modules.portfolio.providers.factory import list_supported_brokers
        from app.tasks.portfolio import sync_portfolio_task

        # task_ids = [sync_portfolio_task.delay(broker="zerodha").id]

        task_ids = [sync_portfolio_task.delay(broker=broker).id for broker in list_supported_brokers()]
        return ",".join(task_ids)
    if job_name == "refresh_prices":
        from app.tasks.portfolio import refresh_prices_task
        return refresh_prices_task.delay().id
    if job_name == "fetch_news":
        from app.tasks.news import fetch_news_task
        return fetch_news_task.delay().id
    if job_name == "daily_briefing":
        from app.tasks.ai import global_briefing_task
        return global_briefing_task.delay().id
    if job_name == "run_signals":
        from app.tasks.signals import generate_signals_task
        return generate_signals_task.delay().id
    raise ValueError(f"Unknown job: {job_name}")
