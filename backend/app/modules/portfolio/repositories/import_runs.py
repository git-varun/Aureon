from app.core.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.portfolio.entities.portfolio import ImportRun


class ImportRunsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, run: ImportRun) -> ImportRun:
        self.session.add(run)
        self.session.flush()
        return run

    def list_by_portfolio(self, portfolio_id: uuid.UUID, limit: int = 50) -> list[ImportRun]:
        stmt = (
            select(ImportRun)
            .where(ImportRun.portfolio_id == portfolio_id)
            .order_by(ImportRun.started_at.desc())
            .limit(limit)
        )
        return list(self.session.execute(stmt).scalars().all())
