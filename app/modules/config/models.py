"""Config module models: ProviderConfig, JobConfig, JobLog."""
import enum

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Enum
from sqlalchemy.sql import func

from app.core.db import Base


class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class ProviderConfig(Base):
    __tablename__ = "provider_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider_name = Column(String(64), unique=True, nullable=False, index=True)
    provider_type = Column(String(32), nullable=False)  # broker | ai | notification
    enabled = Column(Boolean, default=True)
    key_names = Column(Text, default="[]")        # JSON array of expected key names
    encrypted_keys = Column(Text, default="{}")   # JSON dict of Fernet-encrypted key values
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class JobConfig(Base):
    __tablename__ = "job_configs"

    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(64), unique=True, nullable=False, index=True)
    enabled = Column(Boolean, default=True)
    cron_expression = Column(String(64), nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    config = Column(Text, default="{}")  # JSON blob for extra per-job config
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class JobLog(Base):
    __tablename__ = "job_logs"

    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(64), nullable=False, index=True)
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False)
    task_id = Column(String(128), nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(Integer, nullable=True)
