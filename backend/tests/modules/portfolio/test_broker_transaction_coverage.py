import uuid
from datetime import datetime, timedelta, timezone

from app.modules.portfolio.repositories.portfolio_snapshot import (
    PortfolioSnapshotRepository,
)
from app.modules.portfolio.repositories.import_runs import ImportRunsRepository
from app.modules.portfolio.repositories.portfolios import PortfoliosRepository
from app.modules.portfolio.repositories.positions import PositionsRepository
from app.modules.portfolio.repositories.transactions import TransactionsRepository
from app.modules.portfolio.entities.portfolio import Portfolio, Transaction
from app.modules.portfolio.services.portfolio import PortfolioService


def _make_service(db_session):
    return PortfolioService(
        PortfoliosRepository(db_session),
        TransactionsRepository(db_session),
        PositionsRepository(db_session),
        PortfolioSnapshotRepository(db_session),
        ImportRunsRepository(db_session),
    )


# The Transactions page's "Data gaps" tab needs the real gap in recorded
# transaction history per broker (last dated buy/sell), not "time since sync
# last ran" — Zerodha/Groww's live sync only ever re-stamps a broker_snapshot
# row to datetime.now() on every run (see PortfolioService._sync_broker_snapshot),
# so including that kind would always report "0 days ago" regardless of when
# the user actually last traded. This test locks in that broker_snapshot rows
# are excluded and only real (kind="trade"/"broker_trade") rows count.
def test_broker_transaction_coverage_ignores_resynced_snapshot_rows(db_session):
    service = _make_service(db_session)
    portfolio = Portfolio(id=uuid.uuid4(), name="Coverage Test Portfolio")
    db_session.add(portfolio)
    db_session.commit()

    real_trade_date = datetime.now(timezone.utc) - timedelta(days=10)
    try:
        db_session.add(Transaction(
            portfolio_id=portfolio.id, symbol="RELIANCE", broker="zerodha",
            kind="broker_snapshot", transaction_type="buy",
            quantity=1, price=1, fees=0, taxes=0,
            transaction_date=datetime.now(timezone.utc),
        ))
        db_session.add(Transaction(
            portfolio_id=portfolio.id, symbol="TCS", broker="zerodha",
            kind="trade", transaction_type="buy",
            quantity=1, price=1, fees=0, taxes=0,
            transaction_date=real_trade_date,
        ))
        db_session.commit()

        coverage = service.get_broker_transaction_coverage(portfolio.id)

        assert coverage["zerodha"] == real_trade_date.replace(microsecond=coverage["zerodha"].microsecond)
        assert "binance" not in coverage
    finally:
        db_session.delete(portfolio)
        db_session.commit()
