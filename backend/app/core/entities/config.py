import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.entities.base import Base


class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

class ProviderConfig(Base):
    __tablename__ = "provider_configs"
    __table_args__ = {"schema": "config"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    provider_name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    provider_type: Mapped[str] = mapped_column(String(32), nullable=False)  # broker | ai | notification | news | price | valuation | config
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    key_names: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of expected key names
    encrypted_keys: Mapped[str] = mapped_column(Text, default="{}")  # JSON dict of Fernet-encrypted key values
    config: Mapped[str] = mapped_column(Text, default="{}")  # JSON blob for non-credential settings
    # Plugin registry metadata (app.core.providers). `status` mirrors ProviderStatus —
    # kept as a plain String column (not a native DB enum type), but constrained by
    # ck_provider_configs_status_valid (see migration b7c2e4f19a3d) to the values
    # ProviderStatus actually defines. Adding a new lifecycle value requires updating
    # both the enum and that constraint.
    status: Mapped[str] = mapped_column(String(16), default="PLANNED", nullable=False)
    capabilities: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of Capability values
    priority: Mapped[int] = mapped_column(Integer, default=100)  # lower = tried first in a fallback chain
    health: Mapped[str] = mapped_column(Text, default="{}")  # JSON: {"ok": bool, "checked_at": iso8601}
    rate_limit: Mapped[str | None] = mapped_column(String(64), nullable=True)  # e.g. "60/min"
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=10)
    retry_policy: Mapped[str] = mapped_column(Text, default="{}")  # JSON: {"max_attempts": int, "backoff_base": float}
    cache_ttl_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

class JobConfig(Base):
    __tablename__ = "job_configs"
    __table_args__ = {"schema": "config"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    job_tier: Mapped[str] = mapped_column(String(16), default='user')  # 'user'/'system' — Settings UI grouping only
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

class AllocationTarget(Base):
    __tablename__ = "allocation_targets"
    __table_args__ = {"schema": "config"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_class: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    target_pct: Mapped[int] = mapped_column(Integer, nullable=False)  # stored as basis-points (0-10000) for precision
    band_low_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    band_high_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

class JobLog(Base):
    __tablename__ = "job_logs"
    __table_args__ = {"schema": "config"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False)
    task_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
