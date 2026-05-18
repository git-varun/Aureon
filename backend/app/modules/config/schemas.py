"""Config module schemas for providers, jobs, and job logs."""
from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    job_tier: str = "user"
    last_status: Optional[str] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class JobUpdateRequest(BaseModel):
    """Update job configuration."""
    enabled: Optional[bool] = None
    cron_schedule: Optional[str] = Field(None, description="Cron expression (e.g., '0 9 * * *')")
    schedule: Optional[str] = Field(None, description="Alias for cron_schedule (FE compat)")

    @model_validator(mode="after")
    def resolve_cron_schedule(self) -> "JobUpdateRequest":
        if self.cron_schedule is None and self.schedule is not None:
            self.cron_schedule = self.schedule
        return self


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


# ── Allocation Targets ────────────────────────────────────────────────────

class AllocationTargetOut(BaseModel):
    asset_class: str
    target_pct: float  # 0..1
    band_low_pct: Optional[float] = None
    band_high_pct: Optional[float] = None
    notes: Optional[str] = None


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
