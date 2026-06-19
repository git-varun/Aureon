from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.entities.portfolio import Transaction


class TransactionsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, txn: Transaction) -> Transaction:
        self.session.add(txn)
        self.session.flush()
        return txn

    def get_by_id(self, txn_id: uuid.UUID) -> Transaction | None:
        stmt = select(Transaction).where(Transaction.id == txn_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_portfolio(self, portfolio_id: uuid.UUID) -> list[Transaction]:
        stmt = select(Transaction).where(Transaction.portfolio_id == portfolio_id).order_by(Transaction.transaction_date.asc())
        return list(self.session.execute(stmt).scalars().all())

    def get_by_portfolio_symbol(self, portfolio_id: uuid.UUID, symbol: str) -> list[Transaction]:
        stmt = select(Transaction).where(
            (Transaction.portfolio_id == portfolio_id) &
            (Transaction.symbol == symbol)
        ).order_by(Transaction.transaction_date.asc())
        return list(self.session.execute(stmt).scalars().all())

    def update(self, txn: Transaction) -> Transaction:
        self.session.flush()
        return txn

    def delete(self, txn_id: uuid.UUID) -> bool:
        txn = self.get_by_id(txn_id)
        if txn:
            self.session.delete(txn)
            self.session.flush()
            return True
        return False
