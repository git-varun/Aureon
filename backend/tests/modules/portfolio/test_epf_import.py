import uuid
from unittest.mock import patch

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
from app.modules.portfolio.services.portfolio_importer import parse_epf_statement

# Real EPFO Member Passbook exports aren't plain-text/CSV — they're PDFs, so unlike
# the NPS fixtures (real CSV files on disk), this mocks pdfplumber.open() directly
# with the exact page text/tables from a real zero-transaction-year passbook export
# (Financial Year 2023-2024, UAN 101656562831). See parse_epf_statement's docstring:
# only this zero-transaction path has been validated against a real file — the
# populated-row branch below (test_epf_populated_month_row) is a synthetic row
# following the documented column layout, not verified against a real export.


class _FakePage:
    def __init__(self, text, tables):
        self._text = text
        self._tables = tables

    def extract_text(self):
        return self._text

    def extract_tables(self):
        return self._tables


class _FakePdf:
    def __init__(self, pages):
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


_HEADER_TEXT = (
    "Establishment ID/Name: TNMAS0031309000 / COGNIZANT TECHNOLOGY SOLUTIONS INDIA PRIVATE LIMITED\n"
    "Member ID/Name: TNMAS00313090001849637 / VARUN UPADHYAY\n"
    "Date of Birth: 14-07-1997\n"
    "UAN: 101656562831\n"
    "EPF Passbook [ Financial Year - 2023-2024 ]\n"
)

# pdfplumber's actual extract_text() output for a real EPFO passbook uses "|" as the
# bilingual label/value separator (Hindi label | English label | value), not a colon
# as _HEADER_TEXT above assumes — this is the real text confirmed against an actual
# export and is what triggered "Could not find UAN in EPF passbook" in production.
_REAL_HEADER_TEXT = (
    "स्थापना आईडी/नाम | Establishment ID/Name | TNMAS0031309000 / "
    "COGNIZANT TECHNOLOGY SOLUTIONS INDIA PRIVATE LIMITED\n"
    "सदस्य आईडी/नाम | Member ID/Name | TNMAS00313090001849637 / VARUN UPADHYAY\n"
    "जन्म तिथि | Date of Birth | 14-07-1997\n"
    "यू ए न | UAN | 101656562831\n"
    "ईपीएफ पासबुक [ वित्तीय वर्ष - 2023-2024 ] / EPF Passbook [ Financial Year - 2023-2024 ]\n"
)


def _zero_txn_page1_tables():
    return [[
        ["Particulars", "Employee Balance", "Employer Balance", "Pension Balance"],
        ["OB Int. Updated upto 01/04/2023", "37,371", "11,421", "23,335"],
        ["Wage Month", "Date", "Type", "Particulars", "EPF Wages", "EPS Wages", "Employee", "Employer", "Pension"],
        ["---No Transactions available for the this year.---"],
        ["Total Contributions for the year [ 2023 ]", "0", "0", "0"],
        ["Total Transfer-Ins/VDRs for the year [ 2023 ]", "0", "0", "0"],
        ["Total Withdrawals for the year [ 2023 ]", "0", "0", "0"],
        ["Interest details N/A", "0", "0", "0"],
        ["Closing Balance as on 31/03/2024", "37,371", "11,421", "23,335"],
    ]]


def _zero_txn_page2_tables():
    months = ["Apr-2023", "May-2023", "Jun-2023", "Jul-2023", "Aug-2023", "Sep-2023",
              "Oct-2023", "Nov-2023", "Dec-2023", "Jan-2024", "Feb-2024", "Mar-2024"]
    rows = [["Cont. Month", "Monthly Contribution", "Cumulative Non-Taxable", "Cumulative Taxable"]]
    rows += [[m, "0", "0", "0"] for m in months]
    rows += [
        ["TOTAL", "0", "0", "0"],
        ["Int. Updated upto 31/03/2024", "0", "0", "0"],
        ["Closing Balance as on 31/03/2024", "37,371", "37,371", "0"],
    ]
    return [rows]


def _build_fake_pdf(page1_tables, page2_tables=None, header_text=_HEADER_TEXT):
    page1 = _FakePage(header_text, page1_tables)
    pages = [page1]
    if page2_tables is not None:
        pages.append(_FakePage(header_text, page2_tables))
    return _FakePdf(pages)


def _make_service(db_session):
    return PortfolioService(
        PortfoliosRepository(db_session),
        TransactionsRepository(db_session),
        PositionsRepository(db_session),
        PortfolioSnapshotRepository(db_session),
        ImportRunsRepository(db_session),
    )


@patch("pdfplumber.open")
def test_parse_epf_statement_zero_transaction_year(mock_open):
    mock_open.return_value = _build_fake_pdf(_zero_txn_page1_tables(), _zero_txn_page2_tables())

    holdings, transactions, summary = parse_epf_statement(b"fake-pdf-bytes")

    assert len(holdings) == 1
    h = holdings[0]
    assert h["symbol"] == "EPF-101656562831"
    assert h["uan"] == "101656562831"
    assert h["member_name"] == "VARUN UPADHYAY"
    assert h["establishment_name"] == "COGNIZANT TECHNOLOGY SOLUTIONS INDIA PRIVATE LIMITED"
    assert h["quantity"] == 1.0
    assert h["current_value"] == 37371 + 11421 + 23335
    assert h["as_of_date"].year == 2024
    assert h["as_of_date"].month == 3
    assert h["as_of_date"].day == 31

    assert transactions == []
    assert summary["zero_transaction_year"] is True
    assert summary["transactions_parsed"] == 0
    assert summary["closing_balance"] == 72127
    assert summary["page2_cross_check_ok"] is True


@patch("pdfplumber.open")
def test_parse_epf_statement_real_pipe_delimited_header(mock_open):
    """Regression test: pdfplumber's real extract_text() output uses "|" between
    the bilingual label and value, not a colon — the colon-only regexes raised
    "Could not find UAN in EPF passbook" against this actual export."""
    mock_open.return_value = _build_fake_pdf(
        _zero_txn_page1_tables(), _zero_txn_page2_tables(), header_text=_REAL_HEADER_TEXT
    )

    holdings, transactions, summary = parse_epf_statement(b"fake-pdf-bytes")

    h = holdings[0]
    assert h["uan"] == "101656562831"
    assert h["member_name"] == "VARUN UPADHYAY"
    assert h["establishment_name"] == "COGNIZANT TECHNOLOGY SOLUTIONS INDIA PRIVATE LIMITED"
    assert summary["zero_transaction_year"] is True


@patch("pdfplumber.open")
def test_parse_epf_statement_populated_month_row(mock_open):
    """Synthetic row following the documented column layout — NOT validated against
    a real EPFO export (no fixture with actual contributions was available)."""
    page1_tables = [[
        ["Particulars", "Employee Balance", "Employer Balance", "Pension Balance"],
        ["OB Int. Updated upto 01/04/2023", "37,371", "11,421", "23,335"],
        ["Wage Month", "Date", "Type", "Particulars", "EPF Wages", "EPS Wages", "Employee", "Employer", "Pension"],
        ["Apr-2023", "15/05/2023", "ECR", "Contribution", "15,000", "15,000", "1,800", "1,050", "1,250"],
        ["Total Contributions for the year [ 2023 ]", "1,800", "1,050", "1,250"],
        ["Closing Balance as on 31/03/2024", "39,171", "12,471", "24,585"],
    ]]
    mock_open.return_value = _build_fake_pdf(page1_tables)

    holdings, transactions, summary = parse_epf_statement(b"fake-pdf-bytes")

    assert len(transactions) == 1
    t = transactions[0]
    assert t["symbol"] == "EPF-101656562831"
    assert t["type"] == "BUY"
    assert t["amount"] == 1800 + 1050 + 1250
    assert t["date"].year == 2023 and t["date"].month == 5 and t["date"].day == 15
    assert "Employee" in t["description"] and "Employer" in t["description"] and "Pension" in t["description"]
    assert summary["zero_transaction_year"] is False
    assert summary["closing_balance"] == 39171 + 12471 + 24585


def test_import_epf_statement_zero_transaction_creates_asset_and_position(db_session):
    service = _make_service(db_session)

    portfolio = Portfolio(id=uuid.uuid4(), name="EPF Test Portfolio")
    db_session.add(portfolio)
    db_session.commit()

    try:
        with patch("pdfplumber.open") as mock_open:
            mock_open.return_value = _build_fake_pdf(_zero_txn_page1_tables(), _zero_txn_page2_tables())
            report = service.import_epf_statement(portfolio.id, b"fake-pdf-bytes")

        assert report["holdings_imported"] == 1
        assert report["transactions_committed"] == 0
        assert report["transactions_skipped"] == 0
        assert report["summary"]["zero_transaction_year"] is True

        symbol = "EPF-101656562831"

        asset = db_session.scalar(select(Asset).filter_by(symbol=symbol))
        assert asset is not None
        assert asset.asset_class == "epf"
        assert "VARUN UPADHYAY" in asset.name

        # No broker_trade rows for a zero-transaction year.
        broker_trades = db_session.execute(
            select(Transaction).where(
                Transaction.portfolio_id == portfolio.id,
                Transaction.symbol == symbol,
                Transaction.kind == "broker_trade",
            )
        ).scalars().all()
        assert broker_trades == []

        # Holdings snapshot present with the Closing Balance total.
        snapshot = db_session.execute(
            select(Transaction).where(
                Transaction.portfolio_id == portfolio.id,
                Transaction.symbol == symbol,
                Transaction.kind == "broker_snapshot",
                Transaction.broker == "epf",
            )
        ).scalars().first()
        assert snapshot is not None
        assert float(snapshot.quantity) == 1.0
        assert float(snapshot.price) == 37371 + 11421 + 23335

        # Position created via the broker_snapshot fallback (no kind="trade" rows exist).
        position = db_session.execute(
            select(Position).where(Position.portfolio_id == portfolio.id, Position.symbol == symbol)
        ).scalars().first()
        assert position is not None
        assert float(position.quantity) == 1.0
        assert float(position.avg_buy_price) == 72127

        # Re-import: snapshot upserts idempotently, no duplicate broker_snapshot rows.
        with patch("pdfplumber.open") as mock_open:
            mock_open.return_value = _build_fake_pdf(_zero_txn_page1_tables(), _zero_txn_page2_tables())
            report_again = service.import_epf_statement(portfolio.id, b"fake-pdf-bytes")
        assert report_again["holdings_imported"] == 1
        snapshots = db_session.execute(
            select(Transaction).where(
                Transaction.portfolio_id == portfolio.id,
                Transaction.symbol == symbol,
                Transaction.kind == "broker_snapshot",
                Transaction.broker == "epf",
            )
        ).scalars().all()
        assert len(snapshots) == 1
    finally:
        db_session.delete(portfolio)
        db_session.commit()
