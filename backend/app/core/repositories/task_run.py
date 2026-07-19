from datetime import datetime, timezone

from sqlalchemy import select

from app.core.entities.system import TaskRun, TaskRunStatus
from app.core.repositories.base import BaseRepository


class TaskRunRepository(BaseRepository):
    def list_filtered(
        self,
        task_name: str | None = None,
        status: TaskRunStatus | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[TaskRun]:
        stmt = select(TaskRun).order_by(TaskRun.started_at.desc())
        if task_name is not None:
            stmt = stmt.where(TaskRun.task_name == task_name)
        if status is not None:
            stmt = stmt.where(TaskRun.status == status)
        if since is not None:
            stmt = stmt.where(TaskRun.started_at >= since)
        if until is not None:
            stmt = stmt.where(TaskRun.started_at <= until)
        stmt = stmt.limit(limit).offset(offset)
        return list(self.session.execute(stmt).scalars().all())

    def create_started(self, task_name: str, task_id: str, asset_id: str | None) -> TaskRun:
        run = TaskRun(
            task_name=task_name,
            task_id=task_id,
            asset_id=asset_id,
            status=TaskRunStatus.STARTED,
        )
        self.session.add(run)
        self.session.commit()
        return run

    def mark_terminal(
        self, task_id: str, status: TaskRunStatus, error_message: str | None = None
    ) -> TaskRun | None:
        stmt = select(TaskRun).where(TaskRun.task_id == task_id).order_by(TaskRun.started_at.desc())
        run = self.session.execute(stmt).scalars().first()
        if run is None:
            return None
        ended_at = datetime.now(timezone.utc)
        run.status = status
        run.error_message = error_message
        run.ended_at = ended_at
        run.duration_ms = int((ended_at - run.started_at).total_seconds() * 1000)
        self.session.commit()
        return run
