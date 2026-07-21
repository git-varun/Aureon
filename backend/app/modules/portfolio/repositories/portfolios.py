from app.core.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.portfolio.entities.portfolio import Portfolio


class PortfoliosRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, portfolio: Portfolio) -> Portfolio:
        self.session.add(portfolio)
        self.session.flush()
        return portfolio

    def get_by_id(self, portfolio_id: uuid.UUID) -> Portfolio | None:
        stmt = select(Portfolio).where(Portfolio.id == portfolio_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_all(self, include_archived: bool = False) -> list[Portfolio]:
        stmt = select(Portfolio)
        if not include_archived:
            stmt = stmt.where(Portfolio.is_archived.is_(False))
        return list(self.session.execute(stmt).scalars().all())

    def update(self, portfolio: Portfolio) -> Portfolio:
        self.session.flush()
        return portfolio

    def delete(self, portfolio_id: uuid.UUID) -> bool:
        portfolio = self.get_by_id(portfolio_id)
        if portfolio:
            self.session.delete(portfolio)
            self.session.flush()
            return True
        return False
