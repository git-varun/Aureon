import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.market.entities.market import Asset, AssetSnapshot, LatestQuote
from app.modules.portfolio.entities.portfolio import Portfolio, Position
from app.modules.portfolio.services.portfolio import resolve_position_price


@pytest.fixture
def portfolio(db_session):
    p = Portfolio(id=uuid.uuid4(), name="Price Resolution Test Portfolio")
    db_session.add(p)
    db_session.commit()
    yield p
    db_session.delete(p)
    db_session.commit()


def _make_position(db_session, portfolio, symbol, avg_buy_price=100.0, asset_id=None):
    pos = Position(
        id=uuid.uuid4(),
        portfolio_id=portfolio.id,
        symbol=symbol,
        quantity=1.0,
        avg_buy_price=avg_buy_price,
        asset_id=asset_id,
    )
    db_session.add(pos)
    db_session.commit()
    return pos


def test_zero_price_quote_labeled_unavailable_not_market(db_session, portfolio):
    """A LatestQuote row with price == 0 (e.g. a mutual fund/NPS/EPF symbol with
    no real NAV ingestion) must not be reported as price_source == "market" —
    that would falsely claim a real market quote backed the value."""
    symbol = "NPS-TEST-E-T1"
    quote = LatestQuote(symbol=symbol, price=0, provider="yahoo")
    db_session.add(quote)
    db_session.commit()

    pos = _make_position(db_session, portfolio, symbol)

    result = resolve_position_price(db_session, pos)

    assert result.price == 0.0
    assert result.price_source == "unavailable"
    assert result.quote_age_status is None
    assert result.quote_updated_at is None

    db_session.delete(pos)
    db_session.delete(quote)
    db_session.commit()


def test_nonzero_price_quote_still_labeled_market(db_session, portfolio):
    symbol = "AAPL-TEST"
    quote = LatestQuote(symbol=symbol, price=150.25, provider="yahoo")
    db_session.add(quote)
    db_session.commit()

    pos = _make_position(db_session, portfolio, symbol)

    result = resolve_position_price(db_session, pos)

    assert result.price == 150.25
    assert result.price_source == "market"
    assert result.quote_age_status is not None
    assert result.quote_updated_at is not None

    db_session.delete(pos)
    db_session.delete(quote)
    db_session.commit()


def test_no_quote_falls_back_to_cost_basis(db_session, portfolio):
    pos = _make_position(db_session, portfolio, "NEW-SYMBOL-TEST", avg_buy_price=42.5)

    result = resolve_position_price(db_session, pos)

    assert result.price == 42.5
    assert result.price_source == "cost_basis"
    assert result.quote_age_status is None
    assert result.quote_updated_at is None

    db_session.delete(pos)
    db_session.commit()


def test_manual_asset_zero_price_still_labeled_manual(db_session, portfolio):
    """Manual valuations take precedence over the zero-price "unavailable"
    check — a manually-entered value of 0 is still a real user-entered value,
    not a missing market quote."""
    asset = Asset(
        id=uuid.uuid4(),
        symbol="MANUAL-ZERO-TEST",
        name="Manual Zero Test Asset",
        asset_class="equity",
        metadata_payload={"sector": "Manual"},
    )
    db_session.add(asset)
    db_session.commit()

    snapshot = AssetSnapshot(asset_id=asset.id, price=0)
    db_session.add(snapshot)
    db_session.commit()

    quote = LatestQuote(symbol=asset.symbol, price=0, provider=None, asset_id=asset.id)
    db_session.add(quote)
    db_session.commit()

    pos = _make_position(db_session, portfolio, asset.symbol, asset_id=asset.id)

    result = resolve_position_price(db_session, pos)

    assert result.price == 0.0
    assert result.price_source == "manual"

    db_session.delete(pos)
    db_session.delete(quote)
    db_session.delete(snapshot)
    db_session.delete(asset)
    db_session.commit()


def test_mutual_fund_nav_20_hours_old_is_live_not_stale(db_session, portfolio):
    """A mutual fund/NPS NAV only updates once daily — a 20-hour-old NAV is
    normal, not degraded, so it must not be labeled "stale" under the
    5min/15min bands tuned for continuously-traded equities."""
    asset = Asset(
        id=uuid.uuid4(),
        symbol="MF-NAV-TEST",
        name="Mutual Fund NAV Test Asset",
        asset_class="mutual_fund",
    )
    db_session.add(asset)
    db_session.commit()

    snapshot = AssetSnapshot(asset_id=asset.id, price=100.0)
    db_session.add(snapshot)
    db_session.commit()

    stale_by_equity_bands = datetime.now(timezone.utc) - timedelta(hours=20)
    quote = LatestQuote(
        symbol=asset.symbol,
        price=100.0,
        provider="amfi",
        asset_id=asset.id,
        updated_at=stale_by_equity_bands,
    )
    db_session.add(quote)
    db_session.commit()

    pos = _make_position(db_session, portfolio, asset.symbol, asset_id=asset.id)

    result = resolve_position_price(db_session, pos)

    assert result.price_source == "market"
    assert result.quote_age_status == "live"

    db_session.delete(pos)
    db_session.delete(quote)
    db_session.delete(snapshot)
    db_session.delete(asset)
    db_session.commit()


def test_equity_freshness_bands_unchanged(db_session, portfolio):
    asset = Asset(
        id=uuid.uuid4(),
        symbol="EQ-NAV-TEST",
        name="Equity Freshness Test Asset",
        asset_class="equity",
    )
    db_session.add(asset)
    db_session.commit()

    snapshot = AssetSnapshot(asset_id=asset.id, price=100.0)
    db_session.add(snapshot)
    db_session.commit()

    stale_by_equity_bands = datetime.now(timezone.utc) - timedelta(hours=20)
    quote = LatestQuote(
        symbol=asset.symbol,
        price=100.0,
        provider="yahoo",
        asset_id=asset.id,
        updated_at=stale_by_equity_bands,
    )
    db_session.add(quote)
    db_session.commit()

    pos = _make_position(db_session, portfolio, asset.symbol, asset_id=asset.id)

    result = resolve_position_price(db_session, pos)

    assert result.quote_age_status == "stale"

    db_session.delete(pos)
    db_session.delete(quote)
    db_session.delete(snapshot)
    db_session.delete(asset)
    db_session.commit()
