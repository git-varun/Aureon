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
from app.modules.portfolio.entities.portfolio import Portfolio
from app.modules.portfolio.services.portfolio import PortfolioService

# Regression test: import_transaction_file parsed row["asset_type"]/row["name"]
# but never passed them into ensure_asset_exists(), so a CSV row identified as
# a mutual fund (broker="groww_mf") never got Asset.asset_class="mutual_fund"
# — it silently fell back to whatever ensure_asset_exists's default ("equity")
# or an already-existing Asset row provided. Same bug class as the CDSL/NPS/EPF
# asset_class wiring already fixed elsewhere.
_GROWW_MF_CSV = (
    "Scheme Name,Order Type,NAV,Order Date,Units Allotted,Folio No\n"
    "HDFC Flexi Cap Fund,buy,45.67,01-01-2024,10,ABC123\n"
)


def _make_service(db_session):
    return PortfolioService(
        PortfoliosRepository(db_session),
        TransactionsRepository(db_session),
        PositionsRepository(db_session),
        PortfolioSnapshotRepository(db_session),
        ImportRunsRepository(db_session),
    )


def test_csv_import_sets_asset_class_for_mutual_fund_row(db_session):
    service = _make_service(db_session)

    portfolio = Portfolio(id=uuid.uuid4(), name="CSV Import Test Portfolio")
    db_session.add(portfolio)
    db_session.commit()

    try:
        report = service.import_transaction_file(
            portfolio.id, _GROWW_MF_CSV.encode(), filename="groww_mf.csv"
        )
        assert report["committed"] == 1

        symbol = "HDFC_FLEXI_CAP_FUND_MF"
        asset = db_session.scalar(select(Asset).filter_by(symbol=symbol))
        assert asset is not None
        assert asset.asset_class == "mutual_fund"
        assert asset.name == "HDFC Flexi Cap Fund"
    finally:
        db_session.delete(portfolio)
        db_session.commit()
