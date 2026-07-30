from app.core.repositories.base import BaseRepository
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.portfolio.entities.portfolio import Transaction


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

    def get_last_real_transaction_dates_by_broker(self, portfolio_id: uuid.UUID) -> dict[str, datetime]:
        """Most recent transaction_date per broker, restricted to kind in
        ("trade", "broker_trade") — real, dated transaction history (CSV/CAS/
        manual imports and Binance's per-trade ledger). Deliberately excludes
        kind="broker_snapshot": that row is re-stamped to "now" on every sync
        (see PortfolioService._sync_broker_snapshot), so including it would
        always read as "0 days ago" regardless of when the user actually last
        traded — the exact bug this query exists to avoid."""
        # transaction_date is TIMESTAMP WITHOUT TIME ZONE. When a tz-aware Python
        # datetime (e.g. datetime.now(timezone.utc), used throughout this codebase)
        # is written to it, psycopg converts to the session's TimeZone GUC (not
        # necessarily UTC — this dev/prod DB runs Asia/Kolkata) before dropping
        # tzinfo. Reading the naive value back and assuming it's UTC (the pattern
        # used elsewhere in this codebase) is off by exactly that GUC's offset —
        # confirmed live (5:30 skew against Asia/Kolkata). timezone(current TimeZone
        # GUC, col) reverses the same conversion the write path applied, so this is
        # correct regardless of which TimeZone the session is configured with
        # (a no-op when it's already UTC).
        last_date_utc = func.timezone(func.current_setting("TimeZone"), Transaction.transaction_date)
        stmt = (
            select(Transaction.broker, func.max(last_date_utc))
            .where(
                Transaction.portfolio_id == portfolio_id,
                Transaction.broker.isnot(None),
                Transaction.kind.in_(("trade", "broker_trade")),
            )
            .group_by(Transaction.broker)
        )
        return {broker: last_date for broker, last_date in self.session.execute(stmt).all()}

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
