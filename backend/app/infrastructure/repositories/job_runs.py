from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.entities.system import JobRun


class JobRunsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def insert(self, job_run: JobRun) -> JobRun:
        self.session.add(job_run)
        self.session.flush()
        return job_run

    def update(self, job_run: JobRun) -> JobRun:
        self.session.flush()
        return job_run

    def get(self, job_id: uuid.UUID) -> JobRun | None:
        stmt = select(JobRun).where(JobRun.id == job_id)
        return self.session.execute(stmt).scalar_one_or_none()
