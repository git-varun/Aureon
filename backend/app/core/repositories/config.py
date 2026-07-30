from app.core.repositories.base import BaseRepository
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.entities.config import (
    AllocationTarget,
    JobConfig,
    JobLog,
    JobStatus,
    ProviderConfig,
)


class ConfigRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    # Provider Configs
    def get_provider(self, provider_name: str) -> ProviderConfig | None:
        stmt = select(ProviderConfig).where(ProviderConfig.provider_name == provider_name)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_all_providers(self) -> list[ProviderConfig]:
        stmt = select(ProviderConfig)
        return list(self.session.execute(stmt).scalars().all())

    def get_providers_by_type(self, provider_type: str) -> list[ProviderConfig]:
        stmt = select(ProviderConfig).where(ProviderConfig.provider_type == provider_type)
        return list(self.session.execute(stmt).scalars().all())

    # Job Configs
    def get_job(self, job_name: str) -> JobConfig | None:
        stmt = select(JobConfig).where(JobConfig.job_name == job_name)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_all_jobs(self) -> list[JobConfig]:
        stmt = select(JobConfig)
        return list(self.session.execute(stmt).scalars().all())

    # Allocation Targets
    def get_allocation_target(self, asset_class: str) -> AllocationTarget | None:
        stmt = select(AllocationTarget).where(AllocationTarget.asset_class == asset_class)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_allocation_targets(self) -> list[AllocationTarget]:
        stmt = select(AllocationTarget).order_by(AllocationTarget.target_pct.desc())
        return list(self.session.execute(stmt).scalars().all())

    def save_allocation_target(self, target: AllocationTarget) -> AllocationTarget:
        self.session.add(target)
        self.session.flush()
        return target

    # Job Logs
    def get_job_log(self, log_id: int) -> JobLog | None:
        stmt = select(JobLog).where(JobLog.id == log_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_job_log_by_task_id(self, task_id: str) -> JobLog | None:
        stmt = select(JobLog).where(
            or_(
                JobLog.task_id == task_id,
                JobLog.task_id.like(f"%{task_id}%")
            )
        ).order_by(JobLog.started_at.desc())
        return self.session.execute(stmt).scalars().first()

    def get_last_successful_log(self, job_name: str) -> JobLog | None:
        stmt = (
            select(JobLog)
            .where(JobLog.job_name == job_name, JobLog.status == JobStatus.SUCCESS)
            .order_by(JobLog.started_at.desc())
        )
        return self.session.execute(stmt).scalars().first()

    def save_job_log(self, log: JobLog) -> JobLog:
        self.session.add(log)
        self.session.flush()
        return log

    def list_job_logs(self, job_name: str | None = None, limit: int = 50, offset: int = 0) -> list[JobLog]:
        stmt = select(JobLog)
        if job_name:
            stmt = stmt.where(JobLog.job_name == job_name)
        stmt = stmt.order_by(JobLog.started_at.desc()).limit(limit).offset(offset)
        return list(self.session.execute(stmt).scalars().all())

    def count_job_logs(self, job_name: str | None = None) -> int:
        stmt = select(func.count()).select_from(JobLog)
        if job_name:
            stmt = stmt.where(JobLog.job_name == job_name)
        return self.session.execute(stmt).scalar_one()
