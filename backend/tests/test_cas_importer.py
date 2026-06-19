from unittest.mock import MagicMock, patch

import pytest

from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.portfolio import Portfolio, Transaction
from app.domain.entities.system import Organization
from app.domain.services import PortfolioService
from app.domain.services.portfolio_importer import parse_cdsl_cas
from app.infrastructure.repositories import (
    PortfolioSnapshotRepository,
    PortfoliosRepository,
    PositionsRepository,
    TransactionsRepository,
)


@pytest.fixture
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_parse_cdsl_cas_with_mock_pdf():
    # Setup mock folio table
    mock_table = [
        ["Scheme Name", "ISIN", "Folio No", "Closing Balance", "NAV", "Valuation", "Invested Amount", "Unrealized Gain"],
        ["HDFC Top 100 Fund", "INF179K01135", "12345/67", "100.5", "150.2", "15095.1", "10050.0", "5045.1"]
    ]
    
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "Statement of Mutual Fund Folios"
    mock_page.extract_tables.return_value = [mock_table]
    
    mock_pdf = MagicMock()
    mock_pdf.pages = [mock_page]
    
    with patch("pdfplumber.open") as mock_open:
        mock_open.return_value = mock_pdf
        
        payloads, summary = parse_cdsl_cas(b"dummy pdf content")
        
        assert summary["merged_count"] == 1
        assert len(payloads) == 1
        assert payloads[0]["symbol"] == "INF179K01135_MF"
        assert payloads[0]["name"] == "HDFC Top 100 Fund"
        assert payloads[0]["quantity"] == 100.5
        assert payloads[0]["avg_buy_price"] == 100.0  # 10050 / 100.5

def test_import_cdsl_cas_workflow(clean_db, db_session):
    # Setup organization and portfolio
    org = Organization(name="Test Org", slug="test-org")
    db_session.add(org)
    db_session.flush()
    
    portfolio = Portfolio(name="My Portfolio", organization_id=org.id)
    db_session.add(portfolio)
    db_session.flush()
    
    # Mock parse_cdsl_cas to return a payload
    mock_payload = [
        {
            "symbol": "INF179K01135_MF",
            "name": "HDFC Top 100 Fund",
            "quantity": 100.5,
            "avg_buy_price": 100.0,
            "source": "CDSL CAS (Folio)",
            "asset_type": "mutual_fund"
        }
    ]
    
    portfolios_repo = PortfoliosRepository(db_session)
    txns_repo = TransactionsRepository(db_session)
    positions_repo = PositionsRepository(db_session)
    snap_repo = PortfolioSnapshotRepository(db_session)
    
    service = PortfolioService(portfolios_repo, txns_repo, positions_repo, snap_repo)
    
    with patch("app.domain.services.portfolio_importer.parse_cdsl_cas") as mock_parse:
        mock_parse.return_value = (mock_payload, {"merged_count": 1})
        
        # Call import
        res = service.import_cdsl_cas(portfolio.id, org.id, b"dummy content")
        
        assert res["status"] == "success"
        assert res["imported_holdings"] == 1
        
        # Verify transaction was created
        txn = db_session.query(Transaction).filter(Transaction.portfolio_id == portfolio.id).first()
        assert txn is not None
        assert txn.symbol == "INF179K01135_MF"
        assert txn.quantity == 100.5
        assert txn.price == 100.0
        assert txn.kind == "broker_snapshot"
        assert txn.broker == "cas_cdsl"
