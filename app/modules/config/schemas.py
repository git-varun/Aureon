"""Config module schemas for providers, jobs, and job logs."""
from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel, ConfigDict, Field


# ── Provider Schemas ──────────────────────────────────────────────────────

class ProviderConfigResponse(BaseModel):
    """Provider configuration response."""
    provider_name: str
    provider_type: str
    enabled: bool
    key_names: List[str]
    keys_status: Dict[str, bool]  # { key_name: is_set }

    model_config = ConfigDict(from_attributes=True)


class ProviderKeyResponse(BaseModel):
    """Response after setting a provider API key."""
    provider: ProviderConfigResponse


class ProviderEnableToggle(BaseModel):
    """Toggle provider enabled status."""
    enabled: bool


class SetProviderKeyRequest(BaseModel):
    """Set a single provider API key."""
    key_name: str = Field(..., min_length=1)
    value: str = Field(default="", description="Leave blank to clear key")


# ── Job Schemas ───────────────────────────────────────────────────────────

class JobLogResponse(BaseModel):
    """Job execution log entry."""
    id: int
    job_name: str
    status: str
    task_id: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_ms: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class JobConfigResponse(BaseModel):
    """Job configuration response."""
    id: int
    job_name: str
    enabled: bool
    cron_schedule: str
    last_status: Optional[str] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class JobUpdateRequest(BaseModel):
    """Update job configuration."""
    enabled: Optional[bool] = None
    cron_schedule: Optional[str] = Field(None, description="Cron expression (e.g., '0 9 * * *')")


class JobRunResponse(BaseModel):
    """Response from running a job."""
    status: str
    job_name: str
    task_id: Optional[str] = None


# ── Bulk Response Schemas ─────────────────────────────────────────────────

class ProvidersListResponse(BaseModel):
    """List of all provider configs."""
    providers: List[ProviderConfigResponse]


class JobsListResponse(BaseModel):
    """List of all job configs."""
    jobs: List[JobConfigResponse]


class JobLogsResponse(BaseModel):
    """Job execution logs."""
    job_name: str
    logs: List[JobLogResponse]
