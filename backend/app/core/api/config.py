from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.api.dependencies import get_config_service, get_current_user
from app.core.config import settings
from app.core.exceptions import NotFoundError, ZerodhaAuthError
from app.core.logging import logger
from app.core.entities.system import User
from app.core.services.config import ConfigService

router = APIRouter(prefix="/config", tags=["config"])

# --- Schemas ---

class ProviderConfigResponse(BaseModel):
    provider_name: str
    provider_type: str
    enabled: bool
    key_names: List[str]
    keys_status: Dict[str, bool]
    keys_health: Dict[str, str] = {}
    config: Dict[str, Any]
    status: str = "PLANNED"
    capabilities: List[str] = []
    priority: int = 100
    health: Dict[str, Any] = {}
    rate_limit: Optional[str] = None
    timeout_seconds: int = 10
    retry_policy: Dict[str, Any] = {}
    cache_ttl_seconds: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class ProvidersListResponse(BaseModel):
    providers: List[ProviderConfigResponse]

class ProviderKeyResponse(BaseModel):
    provider: ProviderConfigResponse

class ProviderEnableToggle(BaseModel):
    enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None

class SetProviderKeyRequest(BaseModel):
    key_name: str = Field(..., min_length=1)
    value: str = Field(default="", description="Leave blank to clear key")

class JobLogResponse(BaseModel):
    id: int
    job_name: str
    status: str
    task_id: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_ms: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class JobLogsResponse(BaseModel):
    job_name: str
    logs: List[JobLogResponse]

class JobConfigResponse(BaseModel):
    id: int
    job_name: str
    enabled: bool
    cron_schedule: str
    job_tier: str = "user"
    last_status: Optional[str] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class JobsListResponse(BaseModel):
    jobs: List[JobConfigResponse]

class JobUpdateRequest(BaseModel):
    enabled: Optional[bool] = None
    cron_schedule: Optional[str] = Field(None, description="Cron expression (e.g., '0 9 * * *')")
    schedule: Optional[str] = Field(None, description="Alias for cron_schedule (FE compat)")

    @model_validator(mode="after")
    def resolve_cron_schedule(self) -> "JobUpdateRequest":
        if self.cron_schedule is None and self.schedule is not None:
            self.cron_schedule = self.schedule
        return self

class JobRunResponse(BaseModel):
    status: str
    job_name: str
    task_id: Optional[str] = None

class AllocationTargetUpsert(BaseModel):
    target_pct: Optional[float] = Field(None, ge=0, le=1)
    target: Optional[float] = Field(None, ge=0, le=1, description="Alias for target_pct (FE compat)")
    band_low_pct: Optional[float] = Field(None, ge=0, le=1)
    band_high_pct: Optional[float] = Field(None, ge=0, le=1)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def resolve_target_pct(self) -> "AllocationTargetUpsert":
        if self.target_pct is None and self.target is not None:
            self.target_pct = self.target
        if self.target_pct is None:
            raise ValueError("Either target_pct or target must be provided")
        return self

# --- Providers ---

@router.get("/providers", response_model=ProvidersListResponse)
def get_providers(
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    return {"providers": svc.get_all_providers()}

@router.put("/providers/{provider_name}", response_model=ProvidersListResponse)
def update_provider(
    provider_name: str,
    payload: ProviderEnableToggle,
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    try:
        svc.update_provider(provider_name, enabled=payload.enabled, config=payload.config, actor_id=user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"providers": svc.get_all_providers()}

@router.put("/providers/{provider_name}/keys", response_model=ProviderKeyResponse)
def set_provider_key(
    provider_name: str,
    payload: SetProviderKeyRequest,
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    try:
        svc.set_provider_key(provider_name, payload.key_name, payload.value, actor_id=user.id)
        p_dict = svc.get_provider_dict(provider_name)
        if not p_dict:
            raise HTTPException(status_code=404, detail=f"Provider {provider_name} not found")
        return {"provider": p_dict}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/providers/{provider_name}/keys/{key_name}", response_model=ProviderKeyResponse)
def remove_provider_key(
    provider_name: str,
    key_name: str,
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    try:
        svc.remove_provider_key(provider_name, key_name, actor_id=user.id)
        p_dict = svc.get_provider_dict(provider_name)
        if not p_dict:
            raise HTTPException(status_code=404, detail=f"Provider {provider_name} not found")
        return {"provider": p_dict}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Zerodha OAuth ---

@router.get("/providers/zerodha/oauth/login-url")
def get_zerodha_login_url(
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service),
):
    api_key = svc.get_decrypted_key("zerodha", "api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="Zerodha api_key is not configured yet")

    from app.modules.portfolio.providers.broker.zerodha.provider import ZerodhaClient
    client = ZerodhaClient(api_key)
    return {"login_url": client.login_url()}


@router.get("/providers/zerodha/oauth/callback")
def zerodha_oauth_callback(
    request_token: Optional[str] = None,
    status: Optional[str] = None,
    svc: ConfigService = Depends(get_config_service),
):
    # Unauthenticated by necessity: Zerodha's browser redirect carries no session cookie/JWT.
    # An attacker hitting this endpoint without our api_secret cannot forge a session — the
    # request_token is only useful when exchanged against Zerodha's own servers with that secret.
    logger.info(f"Zerodha OAuth callback hit (status={status})")

    if status != "success" or not request_token:
        return RedirectResponse(f"{settings.FRONTEND_BASE_URL}/profile?zerodha=error&reason=login_failed")

    api_key = svc.get_decrypted_key("zerodha", "api_key")
    api_secret = svc.get_decrypted_key("zerodha", "api_secret")
    if not api_key or not api_secret:
        return RedirectResponse(f"{settings.FRONTEND_BASE_URL}/profile?zerodha=error&reason=not_configured")

    from app.modules.portfolio.providers.broker.zerodha.provider import ZerodhaClient
    client = ZerodhaClient(api_key, api_secret)
    try:
        client.generate_session(request_token)
    except ZerodhaAuthError as e:
        logger.warning(f"Zerodha session exchange failed: {e}")
        return RedirectResponse(f"{settings.FRONTEND_BASE_URL}/profile?zerodha=error&reason=exchange_failed")

    svc.set_provider_key("zerodha", "access_token", client.access_token)
    return RedirectResponse(f"{settings.FRONTEND_BASE_URL}/profile?zerodha=connected")

# --- Jobs ---

@router.get("/jobs", response_model=JobsListResponse)
def get_jobs(
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    return {"jobs": svc.get_all_jobs()}

@router.put("/jobs/{job_name}", response_model=JobsListResponse)
def update_job(
    job_name: str,
    payload: JobUpdateRequest,
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    job = svc.get_job(job_name)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_name} not found")
    if (job.job_tier or "user") == "system" and payload.cron_schedule is not None:
        raise HTTPException(status_code=403, detail="Cron schedule is read-only for system jobs")
    try:
        svc.update_job(job_name, enabled=payload.enabled, cron_expression=payload.cron_schedule, actor_id=user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"jobs": svc.get_all_jobs()}

@router.post("/jobs/{job_name}/run", response_model=JobRunResponse)
def run_job(
    job_name: str,
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    if not svc.get_job(job_name):
        raise HTTPException(status_code=404, detail=f"Job {job_name} not found")

    log = svc.log_job_start(job_name)
    task_id = svc.dispatch_job(job_name, log_id=log.id, user_id=user.id)

    svc.mark_job_ran(job_name)
    return {"status": "triggered", "job_name": job_name, "task_id": task_id}

@router.get("/jobs/{job_name}/logs", response_model=JobLogsResponse)
def get_job_logs(
    job_name: str,
    limit: int = 50,
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    return {"job_name": job_name, "logs": svc.get_job_logs(job_name, limit=limit)}

# --- Allocation Targets ---

@router.get("/allocation_targets")
def list_allocation_targets(
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    targets = svc.list_allocation_targets()
    return {t["asset_class"]: t["target_pct"] for t in targets}

@router.put("/allocation_targets/{asset_class}")
def upsert_allocation_target(
    asset_class: str,
    payload: AllocationTargetUpsert,
    user: User = Depends(get_current_user),
    svc: ConfigService = Depends(get_config_service)
):
    svc.upsert_allocation_target(
        asset_class,
        target_pct=payload.target_pct,
        band_low_pct=payload.band_low_pct,
        band_high_pct=payload.band_high_pct,
        notes=payload.notes,
        actor_id=user.id
    )
    targets = svc.list_allocation_targets()
    return {t["asset_class"]: t["target_pct"] for t in targets}
