import os
import uuid

from sqlalchemy import select

from app.modules.portfolio.repositories.portfolio_snapshot import (
    PortfolioSnapshotRepository,
)
from app.modules.portfolio.repositories.import_runs import ImportRunsRepository
from app.modules.portfolio.repositories.portfolios import PortfoliosRepository
from app.modules.portfolio.repositories.positions import PositionsRepository
from app.modules.portfolio.repositories.transactions import TransactionsRepository
from app.modules.market.entities.market import Asset
from app.modules.portfolio.entities.portfolio import Portfolio, Position, Transaction
from app.modules.portfolio.services.portfolio import PortfolioService

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "nps")


def _make_service(db_session):
    return PortfolioService(
        PortfoliosRepository(db_session),
        TransactionsRepository(db_session),
        PositionsRepository(db_session),
        PortfolioSnapshotRepository(db_session),
        ImportRunsRepository(db_session),
    )


def _read_fixture(name):
    with open(os.path.join(FIXTURES, name), "rb") as f:
        return f.read()


def test_nps_tier1_and_tier2_import(db_session):
    service = _make_service(db_session)

    portfolio = Portfolio(id=uuid.uuid4(), name="NPS Test Portfolio")
    db_session.add(portfolio)
    db_session.commit()

    try:
        report_t1 = service.import_nps_statement(portfolio.id, _read_fixture("110197068537.csv"))
        assert report_t1["holdings_imported"] == 4
        assert report_t1["transactions_committed"] == 16
        assert report_t1["transactions_skipped"] == 0
        assert report_t1["summary"]["tier"] == 1

        report_t2 = service.import_nps_statement(portfolio.id, _read_fixture("110197068537__1_.csv"))
        assert report_t2["holdings_imported"] == 3
        assert report_t2["transactions_committed"] == 6
        assert report_t2["transactions_skipped"] == 0
        assert report_t2["summary"]["tier"] == 2

        # Re-import Tier I: transactions must be skipped (idempotent), holdings snapshot still upserts.
        report_t1_again = service.import_nps_statement(portfolio.id, _read_fixture("110197068537.csv"))
        assert report_t1_again["transactions_committed"] == 0
        assert report_t1_again["transactions_skipped"] == 16

        symbol_e_t1 = "NPS-110197068537-E-T1"
        symbol_a_t1 = "NPS-110197068537-A-T1"
        symbol_e_t2 = "NPS-110197068537-E-T2"

        asset_e_t1 = db_session.scalar(select(Asset).filter_by(symbol=symbol_e_t1))
        assert asset_e_t1 is not None
        assert asset_e_t1.tier == 1
        assert asset_e_t1.asset_class == "nps"
        assert "SCHEME E - TIER I" in asset_e_t1.name

        asset_a_t1 = db_session.scalar(select(Asset).filter_by(symbol=symbol_a_t1))
        assert asset_a_t1 is not None
        assert asset_a_t1.tier == 1

        asset_e_t2 = db_session.scalar(select(Asset).filter_by(symbol=symbol_e_t2))
        assert asset_e_t2 is not None
        assert asset_e_t2.tier == 2
        assert "ICICI" in asset_e_t2.name

        # BUY/SELL classification and Opening/Closing balance rows skipped.
        txns_e_t1 = db_session.execute(
            select(Transaction).where(
                Transaction.portfolio_id == portfolio.id,
                Transaction.symbol == symbol_e_t1,
                Transaction.kind == "trade",
            )
        ).scalars().all()
        assert len(txns_e_t1) == 4
        types = sorted(t.transaction_type for t in txns_e_t1)
        assert types == ["BUY", "BUY", "BUY", "SELL"]
        descriptions = {t.notes for t in txns_e_t1}
        assert "Opening balance" not in descriptions
        assert "Closing Balance" not in descriptions

        sell_txn = next(t for t in txns_e_t1 if t.transaction_type == "SELL")
        assert float(sell_txn.quantity) == 0.7129
        assert float(sell_txn.price) == 35.8359

        # Broker snapshot present for the holdings pass.
        snapshot = db_session.execute(
            select(Transaction).where(
                Transaction.portfolio_id == portfolio.id,
                Transaction.symbol == symbol_e_t1,
                Transaction.kind == "broker_snapshot",
                Transaction.broker == "nps",
            )
        ).scalars().first()
        assert snapshot is not None
        assert float(snapshot.quantity) == 572.7740

        # Position recalculated from trade transactions (kind="trade" takes precedence).
        position = db_session.execute(
            select(Position).where(Position.portfolio_id == portfolio.id, Position.symbol == symbol_e_t1)
        ).scalars().first()
        assert position is not None
        assert float(position.quantity) == 192.7020 + 188.3953 + 192.3896 - 0.7129
    finally:
        db_session.delete(portfolio)
        db_session.commit()
