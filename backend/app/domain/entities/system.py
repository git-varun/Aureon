import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Index, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.entities.base import Base, TimestampMixin, UUIDMixin


class Provider(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "providers"
    __table_args__ = {"schema": "system"}

    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    health_status: Mapped[str] = mapped_column(String, nullable=True)
    last_success_at: Mapped[datetime] = mapped_column(nullable=True)


class ProviderUsage(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "provider_usage"
    __table_args__ = (
        Index("idx_provider_usage_provider_recorded_at", "provider_id", text("recorded_at DESC")),
        {"schema": "system"}
    )

    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("system.providers.id", ondelete="CASCADE"), nullable=False)
    endpoint: Mapped[str] = mapped_column(String, nullable=False)
    request_count: Mapped[int] = mapped_column(Integer, default=0)
    cost_estimate: Mapped[float] = mapped_column(Numeric, default=0.0)
    recorded_at: Mapped[datetime] = mapped_column(nullable=True)

class FailedIngestion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "failed_ingestions"
    __table_args__ = (
        Index("idx_failed_ingestions_created_at_desc", text("created_at DESC")),
        Index("idx_failed_ingestions_is_exhausted", "is_exhausted"),
        {"schema": "system"}
    )

    provider: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    error: Mapped[str] = mapped_column(String)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    is_exhausted: Mapped[bool] = mapped_column(Boolean, default=False)

class JobRun(TimestampMixin, Base):
    __tablename__ = "job_runs"
    __table_args__ = (
        Index("idx_job_runs_started_at_desc", text("started_at DESC")),
        Index("idx_job_runs_status", "status"),
        {"schema": "system"}
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    job_name: Mapped[str] = mapped_column(String, nullable=False)
    started_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String, default="RUNNING")
    rows_processed: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String, nullable=True)


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "system"}

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    profile_picture: Mapped[str | None] = mapped_column(String, nullable=True)


class UserPreference(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "user_preferences"
    __table_args__ = {"schema": "system"}

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("system.users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    risk_profile: Mapped[str | None] = mapped_column(String, nullable=True, default="moderate")
    target_profit_pct: Mapped[float | None] = mapped_column(Numeric, nullable=True, default=12.0)
    monthly_saving: Mapped[float | None] = mapped_column(Numeric, nullable=True, default=25000.0)
    working_area: Mapped[str | None] = mapped_column(String, nullable=True)
    swing_trading_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    bio: Mapped[str | None] = mapped_column(String, nullable=True)



class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_logs_action_time", "action", text("created_at DESC")),
        {"schema": "system"}
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("system.users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))

