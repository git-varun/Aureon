from datetime import datetime, timezone

from sqlalchemy import select

from app.core.entities.system import TaskRun, TaskRunStatus
from app.core.repositories.base import BaseRepository


class TaskRunRepository(BaseRepository):
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
