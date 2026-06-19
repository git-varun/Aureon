import uuid
from datetime import datetime, timezone
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.main import app
from app.core.database import SessionLocal, engine
from app.core.exceptions import NotFoundError
from app.domain.entities.base import Base
from app.domain.entities.market import LatestQuote
from app.domain.entities.system import Organization, OrganizationMember, User
from app.domain.services import PortfolioService
from app.infrastructure.repositories import (
    OrganizationMembersRepository,
    OrganizationsRepository,
    PortfolioSnapshotRepository,
    PortfoliosRepository,
    PositionsRepository,
    TransactionsRepository,
    UsersRepository,
)

client = TestClient(app)

@pytest.fixture
def clean_db() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

@pytest.fixture
def db_session() -> Generator[SessionLocal, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_portfolio_crud_and_validation(clean_db: None, db_session: SessionLocal) -> None:
    portfolios_repo = PortfoliosRepository(db_session)
    txns_repo = TransactionsRepository(db_session)
    positions_repo = PositionsRepository(db_session)
    snap_repo = PortfolioSnapshotRepository(db_session)
    users_repo = UsersRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)
    members_repo = OrganizationMembersRepository(db_session)

    service = PortfolioService(portfolios_repo, txns_repo, positions_repo, snap_repo)

    # Create user and organization
    user = User(email="test@user.com", password_hash="hash", is_active=True)
    users_repo.create(user)
    org = Organization(name="Test Org", slug="test-org")
    orgs_repo.create(org)
    member = OrganizationMember(organization_id=org.id, user_id=user.id, role="MEMBER")
    members_repo.create(member)
    db_session.commit()

    # 1. Create Portfolio
    portfolio = service.create_portfolio(name="My Portfolio", organization_id=org.id)
    assert portfolio.id is not None
    assert portfolio.name == "My Portfolio"
    assert portfolio.organization_id == org.id

    # 2. Get Portfolio
    fetched = service.get_portfolio(portfolio.id, org.id)
    assert fetched.name == "My Portfolio"

    # Attempt get with invalid org
    with pytest.raises(NotFoundError):
        service.get_portfolio(portfolio.id, uuid.uuid4())

    # 3. List Portfolios
    lst = service.list_portfolios(org.id)
    assert len(lst) == 1
    assert lst[0].name == "My Portfolio"

    # 4. Update Portfolio
    updated = service.update_portfolio(portfolio.id, org.id, name="Renamed Portfolio")
    assert updated.name == "Renamed Portfolio"

    # 5. Delete Portfolio
    deleted = service.delete_portfolio(portfolio.id, org.id)
    assert deleted is True
    with pytest.raises(NotFoundError):
        service.get_portfolio(portfolio.id, org.id)

def test_avco_calculations(clean_db: None, db_session: SessionLocal) -> None:
    portfolios_repo = PortfoliosRepository(db_session)
    txns_repo = TransactionsRepository(db_session)
    positions_repo = PositionsRepository(db_session)
    snap_repo = PortfolioSnapshotRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)

    service = PortfolioService(portfolios_repo, txns_repo, positions_repo, snap_repo)

    org = Organization(name="Test Org", slug="test-org")
    orgs_repo.create(org)
    db_session.commit()

    portfolio = service.create_portfolio(name="Test Portfolio", organization_id=org.id)

    # 1. BUY 10 shares of AAPL at $150
    service.record_transaction(
        portfolio_id=portfolio.id,
        organization_id=org.id,
        symbol="AAPL",
        transaction_type="BUY",
        quantity=10.0,
        price=150.0,
        transaction_date=datetime.now(timezone.utc),
    )
    pos = positions_repo.get_by_portfolio_symbol(portfolio.id, "AAPL")
    assert pos is not None
    assert float(pos.quantity) == 10.0
    assert float(pos.avg_buy_price) == 150.0

    # 2. BUY 5 shares of AAPL at $160
    service.record_transaction(
        portfolio_id=portfolio.id,
        organization_id=org.id,
        symbol="AAPL",
        transaction_type="BUY",
        quantity=5.0,
        price=160.0,
        transaction_date=datetime.now(timezone.utc),
    )
    pos = positions_repo.get_by_portfolio_symbol(portfolio.id, "AAPL")
    # AVCO = (10 * 150 + 5 * 160) / 15 = 153.3333...
    assert float(pos.quantity) == 15.0
    assert round(float(pos.avg_buy_price), 4) == round(153.3333333, 4)

    # 3. BONUS 1 share per 5 shares (adds 3 shares at 0 cost)
    service.record_transaction(
        portfolio_id=portfolio.id,
        organization_id=org.id,
        symbol="AAPL",
        transaction_type="BONUS",
        quantity=3.0,
        price=0.0,
        transaction_date=datetime.now(timezone.utc),
    )
    pos = positions_repo.get_by_portfolio_symbol(portfolio.id, "AAPL")
    # AVCO = (15 * 153.3333 + 3 * 0) / 18 = 127.7777...
    assert float(pos.quantity) == 18.0
    assert round(float(pos.avg_buy_price), 4) == round(127.777777, 4)

    # 4. SPLIT 2-for-1 (multiplier = 2.0)
    service.record_transaction(
        portfolio_id=portfolio.id,
        organization_id=org.id,
        symbol="AAPL",
        transaction_type="SPLIT",
        quantity=1.0,
        price=2.0,
        transaction_date=datetime.now(timezone.utc),
    )
    pos = positions_repo.get_by_portfolio_symbol(portfolio.id, "AAPL")
    # qty = 36.0, avg_buy_price = 63.8888...
    assert float(pos.quantity) == 36.0
    assert round(float(pos.avg_buy_price), 4) == round(63.888888, 4)

    # 5. SELL 10 shares of AAPL (average cost unchanged)
    service.record_transaction(
        portfolio_id=portfolio.id,
        organization_id=org.id,
        symbol="AAPL",
        transaction_type="SELL",
        quantity=10.0,
        price=180.0,
        transaction_date=datetime.now(timezone.utc),
    )
    pos = positions_repo.get_by_portfolio_symbol(portfolio.id, "AAPL")
    assert float(pos.quantity) == 26.0
    assert round(float(pos.avg_buy_price), 4) == round(63.888888, 4)

    # 6. SELL remaining 26 shares (deleted)
    service.record_transaction(
        portfolio_id=portfolio.id,
        organization_id=org.id,
        symbol="AAPL",
        transaction_type="SELL",
        quantity=26.0,
        price=180.0,
        transaction_date=datetime.now(timezone.utc),
    )
    pos = positions_repo.get_by_portfolio_symbol(portfolio.id, "AAPL")
    assert pos is None

def test_snapshot_generation(clean_db: None, db_session: SessionLocal) -> None:
    portfolios_repo = PortfoliosRepository(db_session)
    txns_repo = TransactionsRepository(db_session)
    positions_repo = PositionsRepository(db_session)
    snap_repo = PortfolioSnapshotRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)

    service = PortfolioService(portfolios_repo, txns_repo, positions_repo, snap_repo)

    org = Organization(name="Test Org", slug="test-org")
    orgs_repo.create(org)
    db_session.commit()

    portfolio = service.create_portfolio(name="Test Portfolio", organization_id=org.id)

    # Record trade
    service.record_transaction(
        portfolio_id=portfolio.id,
        organization_id=org.id,
        symbol="RELIANCE.NS",
        transaction_type="BUY",
        quantity=10.0,
        price=2000.0,
        transaction_date=datetime.now(timezone.utc),
    )

    # Update quote price
    quote = db_session.scalar(select(LatestQuote).filter_by(symbol="RELIANCE.NS"))
    assert quote is not None
    quote.price = 2500.0
    db_session.commit()

    # Generate snapshot
    snapshot = service.generate_portfolio_snapshot(portfolio.id, org.id)
    assert snapshot is not None
    assert float(snapshot.market_value) == 25000.0
    assert float(snapshot.total_return) == 5000.0
    assert snapshot.allocation == {"equity": 100.0}

def test_csv_importer(clean_db: None, db_session: SessionLocal) -> None:
    portfolios_repo = PortfoliosRepository(db_session)
    txns_repo = TransactionsRepository(db_session)
    positions_repo = PositionsRepository(db_session)
    snap_repo = PortfolioSnapshotRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)

    service = PortfolioService(portfolios_repo, txns_repo, positions_repo, snap_repo)

    org = Organization(name="Test Org", slug="test-org")
    orgs_repo.create(org)
    db_session.commit()

    portfolio = service.create_portfolio(name="Test Portfolio", organization_id=org.id)

    csv_content = (
        "date,symbol,type,quantity,price\n"
        "2026-06-10,AAPL,BUY,10,150\n"
        "2026-06-11,AAPL,SELL,5,160\n"
    ).encode("utf-8")

    res = service.import_transaction_file(
        portfolio_id=portfolio.id,
        organization_id=org.id,
        file_bytes=csv_content,
        filename="trades.csv"
    )

    assert res["committed"] == 2
    assert res["skipped"] == 0

    pos = positions_repo.get_by_portfolio_symbol(portfolio.id, "AAPL")
    assert pos is not None
    assert float(pos.quantity) == 5.0
    assert float(pos.avg_buy_price) == 150.0
