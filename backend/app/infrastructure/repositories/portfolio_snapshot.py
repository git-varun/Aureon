from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domain.entities.portfolio import PortfolioSnapshot


class PortfolioSnapshotRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, portfolio_id: uuid.UUID) -> PortfolioSnapshot | None:
        stmt = select(PortfolioSnapshot).where(PortfolioSnapshot.portfolio_id == portfolio_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert(self, snapshot: PortfolioSnapshot) -> PortfolioSnapshot:
        stmt = insert(PortfolioSnapshot).values(
            portfolio_id=snapshot.portfolio_id,
            market_value=snapshot.market_value,
            cash_balance=snapshot.cash_balance,
            allocation=snapshot.allocation,
            daily_return=snapshot.daily_return,
            total_return=snapshot.total_return,
            updated_at=snapshot.updated_at
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=['portfolio_id'],
            set_=dict(
                market_value=stmt.excluded.market_value,
                cash_balance=stmt.excluded.cash_balance,
                allocation=stmt.excluded.allocation,
                daily_return=stmt.excluded.daily_return,
                total_return=stmt.excluded.total_return,
                updated_at=stmt.excluded.updated_at
            )
        ).returning(PortfolioSnapshot)

        result = self.session.execute(upsert_stmt).scalar_one()
        self.session.flush()
        return result
