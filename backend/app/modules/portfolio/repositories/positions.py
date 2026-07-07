from app.core.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.portfolio.entities.portfolio import Position


class PositionsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, pos: Position) -> Position:
        self.session.add(pos)
        self.session.flush()
        return pos

    def get_by_id(self, pos_id: uuid.UUID) -> Position | None:
        stmt = select(Position).where(Position.id == pos_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_portfolio_symbol(self, portfolio_id: uuid.UUID, symbol: str) -> Position | None:
        stmt = select(Position).where(
            (Position.portfolio_id == portfolio_id) &
            (Position.symbol == symbol)
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_portfolio(self, portfolio_id: uuid.UUID) -> list[Position]:
        stmt = select(Position).where(Position.portfolio_id == portfolio_id)
        return list(self.session.execute(stmt).scalars().all())

    def update(self, pos: Position) -> Position:
        self.session.flush()
        return pos

    def delete(self, pos_id: uuid.UUID) -> bool:
        pos = self.get_by_id(pos_id)
        if pos:
            self.session.delete(pos)
            self.session.flush()
            return True
        return False
