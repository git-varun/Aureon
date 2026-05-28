"""Config routes: providers & jobs — properly refactored with schemas and auth."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth
from app.modules.config.services import ConfigService
from app.modules.config.schemas import (
    AllocationTargetUpsert,
    ProvidersListResponse,
    ProviderKeyResponse,
    JobsListResponse,
    JobLogsResponse,
    ProviderEnableToggle,
    SetProviderKeyRequest,
    JobUpdateRequest,
    JobRunResponse,
)

router = APIRouter(prefix="/api/config", tags=["config"])


# ── Providers ─────────────────────────────────────────────────────────────────

@router.get("/providers", response_model=ProvidersListResponse)
def get_providers(db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Get all provider configurations."""
    svc = ConfigService(db)
    return {"providers": svc.get_all_providers()}


@router.put("/providers/{provider_name}", response_model=ProvidersListResponse)
def update_provider(
        provider_name: str,
        payload: ProviderEnableToggle,
        db: Session = Depends(get_session),
        _user=Depends(require_auth)
):
    """Toggle provider enabled/disabled status."""
    svc = ConfigService(db)
    result = svc.update_provider(provider_name, enabled=payload.enabled)
    if not result:
        raise HTTPException(status_code=404, detail=f"Provider {provider_name} not found")
    return {"providers": svc.get_all_providers()}


@router.put("/providers/{provider_name}/keys", response_model=ProviderKeyResponse)
def set_provider_key(
        provider_name: str,
        payload: SetProviderKeyRequest,
        db: Session = Depends(get_session),
        _user=Depends(require_auth)
):
    """Set or clear an API key for a provider."""
    svc = ConfigService(db)
    ok = svc.set_provider_key(provider_name, payload.key_name, payload.value)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Provider {provider_name} not found")
    provider_dict = svc.get_provider_dict(provider_name)
    if not provider_dict:
        raise HTTPException(status_code=404, detail=f"Provider {provider_name} not found")
    return {"provider": provider_dict}


# ── Jobs ──────────────────────────────────────────────────────────────────────

@router.get("/jobs", response_model=JobsListResponse)
def get_jobs(db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Get all job configurations."""
    svc = ConfigService(db)
    return {"jobs": svc.get_all_jobs()}


@router.put("/jobs/{job_name}", response_model=JobsListResponse)
def update_job(
        job_name: str,
        payload: JobUpdateRequest,
        db: Session = Depends(get_session),
        _user=Depends(require_auth)
):
    """Update job schedule and enable/disable status."""
    svc = ConfigService(db)
    job = svc.get_job(job_name)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_name} not found")
    if (job.job_tier or "user") == "system" and payload.cron_schedule is not None:
        raise HTTPException(status_code=403, detail="Cron schedule is read-only for system jobs")
    result = svc.update_job(
        job_name,
        enabled=payload.enabled,
        cron_expression=payload.cron_schedule
    )
    if not result:
        raise HTTPException(status_code=404, detail=f"Job {job_name} not found")
    return {"jobs": svc.get_all_jobs()}


@router.post("/jobs/{job_name}/run", response_model=JobRunResponse)
def run_job(
        job_name: str,
        db: Session = Depends(get_session),
        current_user=Depends(require_auth)
):
    """Trigger a job manually and log execution."""
    from app.modules.config.models import JobStatus
    svc = ConfigService(db)
    if not svc.get_job(job_name):
        raise HTTPException(status_code=404, detail=f"Job {job_name} not found")

    log = svc.log_job_start(job_name)
    try:
        task_id = svc.dispatch_job(job_name, log_id=log.id, user_id=current_user.id)
    except Exception as e:
        svc.log_job_end(log.id, JobStatus.FAILED, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to dispatch {job_name}: {e}")

    svc.mark_job_ran(job_name)
    return {"status": "triggered", "job_name": job_name, "task_id": task_id}


# ── Allocation Targets ────────────────────────────────────────────────────────

@router.get("/allocation_targets")
def list_allocation_targets(db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Per-class target allocation as flat map: { asset_class: target_pct }."""
    svc = ConfigService(db)
    targets = svc.list_allocation_targets()
    return {t["asset_class"]: t["target_pct"] for t in targets}


@router.put("/allocation_targets/{asset_class}")
def upsert_allocation_target(
        asset_class: str,
        payload: AllocationTargetUpsert,
        db: Session = Depends(get_session),
        _user=Depends(require_auth),
):
    """Create or update target for an asset class. Pcts are 0..1. Returns updated flat map."""
    svc = ConfigService(db)
    svc.upsert_allocation_target(
        asset_class,
        target_pct=payload.target_pct,
        band_low_pct=payload.band_low_pct,
        band_high_pct=payload.band_high_pct,
        notes=payload.notes,
    )
    targets = svc.list_allocation_targets()
    return {t["asset_class"]: t["target_pct"] for t in targets}


@router.get("/jobs/{job_name}/logs", response_model=JobLogsResponse)
def get_job_logs(
        job_name: str,
        limit: int = 50,
        db: Session = Depends(get_session),
        _user=Depends(require_auth)
):
    """Get execution logs for a job."""
    svc = ConfigService(db)
    return {"job_name": job_name, "logs": svc.get_job_logs(job_name, limit=limit)}
