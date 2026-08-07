import uuid
from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import select

from app.core.entities.config import ProviderConfig
from app.modules.market.entities.market import Asset, AssetSnapshot
from app.modules.market.services.market import ensure_asset_exists
from app.modules.portfolio.entities.portfolio import Portfolio, Position, Transaction
from app.modules.portfolio.services.portfolio import resolve_position_price

# Worked-example fixture: opening balance 100,000, twelve equal 10,000 monthly
# contributions across FY2023-2024 (April 2023-March 2024), 8.25% annual rate.
# EPF_ESTIMATE_SCOPE.md §2 hand-computes the precise EPFO formula for this exact
# scenario as ₹12,787.50 of interest for the year (vs. ₹13,200 for a naive
# average-balance approximation) — this test reproduces that arithmetic.


def _freeze(now: datetime):
    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return now
    return patch("app.modules.portfolio.services.portfolio.datetime", _FrozenDatetime)


def _make_portfolio(db_session):
    portfolio = Portfolio(id=uuid.uuid4(), name="EPF Estimate Test Portfolio")
    db_session.add(portfolio)
    db_session.commit()
    return portfolio


def _make_epf_position(db_session, portfolio, symbol):
    asset_id = ensure_asset_exists(db_session, symbol, name="EPF Test Account", asset_class="epf")
    asset = db_session.get(Asset, asset_id)
    position = Position(
        portfolio_id=portfolio.id,
        symbol=symbol,
        asset_id=asset.id,
        quantity=1.0,
        avg_buy_price=100000.0,
    )
    db_session.add(position)
    db_session.commit()
    return asset, position


def _set_rates(db_session, rates: dict):
    provider = db_session.scalar(select(ProviderConfig).filter_by(provider_name="epf_interest_rates"))
    if not provider:
        provider = ProviderConfig(
            provider_name="epf_interest_rates",
            provider_type="config",
            config="{}",
            status="ACTIVE",
        )
        db_session.add(provider)
    import json
    provider.config = json.dumps({"rates": rates})
    db_session.commit()
    return provider


def _cleanup(db_session, portfolio, asset):
    db_session.delete(portfolio)
    snapshot = db_session.get(AssetSnapshot, asset.id)
    if snapshot:
        db_session.delete(snapshot)
    db_session.delete(asset)
    # Reset the shared rate-config row back to its seeded default rather than
    # leaving this test's rates behind for the next test/run to trip over.
    _set_rates(db_session, {})
    db_session.commit()


def test_epf_estimate_matches_worked_example(db_session):
    symbol = f"EPF-TEST-{uuid.uuid4().hex[:8]}"
    portfolio = _make_portfolio(db_session)
    asset, position = _make_epf_position(db_session, portfolio, symbol)
    _set_rates(db_session, {"2023-2024": 8.25})

    snapshot = Transaction(
        portfolio_id=portfolio.id,
        symbol=symbol,
        asset_id=asset.id,
        transaction_type="BUY",
        quantity=1.0,
        price=100000.0,
        transaction_date=datetime(2023, 3, 31, tzinfo=timezone.utc),
        broker="epf",
        kind="broker_snapshot",
    )
    db_session.add(snapshot)

    months = [(2023, 4), (2023, 5), (2023, 6), (2023, 7), (2023, 8), (2023, 9),
              (2023, 10), (2023, 11), (2023, 12), (2024, 1), (2024, 2), (2024, 3)]
    for i, (y, m) in enumerate(months):
        db_session.add(Transaction(
            portfolio_id=portfolio.id,
            symbol=symbol,
            asset_id=asset.id,
            transaction_type="BUY",
            quantity=1.0,
            price=10000.0,
            transaction_date=datetime(y, m, 15, tzinfo=timezone.utc),
            broker="epf",
            broker_reference=f"ref-{i}",
            kind="broker_trade",
        ))
    db_session.commit()

    try:
        with _freeze(datetime(2024, 3, 20, tzinfo=timezone.utc)):
            result = resolve_position_price(db_session, position)

        assert result.price_source == "epf_estimated"
        assert result.price == 100000.0 + 12 * 10000.0 + 12787.5
        assert result.epf_estimate_basis is not None
        assert result.epf_estimate_basis["rates_applied"] == [{"financial_year": "2023-2024", "rate_pct": 8.25}]
        assert result.epf_estimate_basis["statement_date"].startswith("2023-03-31")
    finally:
        _cleanup(db_session, portfolio, asset)


def test_epf_estimate_unavailable_when_fy_rate_missing(db_session):
    symbol = f"EPF-TEST-{uuid.uuid4().hex[:8]}"
    portfolio = _make_portfolio(db_session)
    asset, position = _make_epf_position(db_session, portfolio, symbol)
    # Only the prior FY's rate is configured; the projection spans into 2024-2025.
    _set_rates(db_session, {"2023-2024": 8.25})

    snapshot = Transaction(
        portfolio_id=portfolio.id,
        symbol=symbol,
        asset_id=asset.id,
        transaction_type="BUY",
        quantity=1.0,
        price=100000.0,
        transaction_date=datetime(2024, 3, 31, tzinfo=timezone.utc),
        broker="epf",
        kind="broker_snapshot",
    )
    db_session.add(snapshot)
    db_session.commit()

    try:
        with _freeze(datetime(2024, 5, 1, tzinfo=timezone.utc)):
            result = resolve_position_price(db_session, position)

        assert result.price_source == "unavailable"
        assert result.price is None
        assert result.epf_estimate_basis is None
    finally:
        _cleanup(db_session, portfolio, asset)


def test_epf_estimate_unavailable_when_no_snapshot(db_session):
    symbol = f"EPF-TEST-{uuid.uuid4().hex[:8]}"
    portfolio = _make_portfolio(db_session)
    asset, position = _make_epf_position(db_session, portfolio, symbol)
    _set_rates(db_session, {"2023-2024": 8.25})

    try:
        result = resolve_position_price(db_session, position)
        assert result.price_source == "unavailable"
        assert result.price is None
    finally:
        _cleanup(db_session, portfolio, asset)


def test_epf_estimate_not_blocked_by_contribution_gap(db_session):
    """A missing broker_trade row between two real months shouldn't block the
    estimate — it just understates slightly (EPF_ESTIMATE_SCOPE.md §7)."""
    symbol = f"EPF-TEST-{uuid.uuid4().hex[:8]}"
    portfolio = _make_portfolio(db_session)
    asset, position = _make_epf_position(db_session, portfolio, symbol)
    _set_rates(db_session, {"2023-2024": 8.25})

    snapshot = Transaction(
        portfolio_id=portfolio.id,
        symbol=symbol,
        asset_id=asset.id,
        transaction_type="BUY",
        quantity=1.0,
        price=100000.0,
        transaction_date=datetime(2023, 3, 31, tzinfo=timezone.utc),
        broker="epf",
        kind="broker_snapshot",
    )
    db_session.add(snapshot)
    # Only April and June contributions recorded — May is a gap.
    db_session.add(Transaction(
        portfolio_id=portfolio.id, symbol=symbol, asset_id=asset.id,
        transaction_type="BUY", quantity=1.0, price=10000.0,
        transaction_date=datetime(2023, 4, 15, tzinfo=timezone.utc),
        broker="epf", broker_reference="ref-apr", kind="broker_trade",
    ))
    db_session.add(Transaction(
        portfolio_id=portfolio.id, symbol=symbol, asset_id=asset.id,
        transaction_type="BUY", quantity=1.0, price=10000.0,
        transaction_date=datetime(2023, 6, 15, tzinfo=timezone.utc),
        broker="epf", broker_reference="ref-jun", kind="broker_trade",
    ))
    db_session.commit()

    try:
        with _freeze(datetime(2023, 6, 30, tzinfo=timezone.utc)):
            result = resolve_position_price(db_session, position)

        assert result.price_source == "epf_estimated"
        # April: opening 100000, interest = 100000*8.25/100/12 = 687.5; principal -> 110000
        # May: opening 110000 (no contribution), interest = 110000*8.25/100/12 = 756.25; principal -> 110000
        # June: opening 110000, interest = 756.25; principal -> 120000 (June contribution added)
        expected_interest = (100000 * 8.25 / 100 / 12) + (110000 * 8.25 / 100 / 12) + (110000 * 8.25 / 100 / 12)
        expected_principal = 100000 + 10000 + 10000
        assert result.price == expected_principal + expected_interest
    finally:
        _cleanup(db_session, portfolio, asset)


def test_epf_estimate_compounds_annually_across_fy_boundary(db_session):
    """No contributions, to isolate the annual-compounding/per-FY-rate mechanic:
    FY2023-2024's credited interest becomes FY2024-2025's opening balance and
    itself earns interest there, at that FY's own (different) rate."""
    symbol = f"EPF-TEST-{uuid.uuid4().hex[:8]}"
    portfolio = _make_portfolio(db_session)
    asset, position = _make_epf_position(db_session, portfolio, symbol)
    _set_rates(db_session, {"2023-2024": 8.25, "2024-2025": 8.10})

    snapshot = Transaction(
        portfolio_id=portfolio.id,
        symbol=symbol,
        asset_id=asset.id,
        transaction_type="BUY",
        quantity=1.0,
        price=100000.0,
        transaction_date=datetime(2023, 3, 31, tzinfo=timezone.utc),
        broker="epf",
        kind="broker_snapshot",
    )
    db_session.add(snapshot)
    db_session.commit()

    try:
        with _freeze(datetime(2024, 6, 15, tzinfo=timezone.utc)):
            result = resolve_position_price(db_session, position)

        assert result.price_source == "epf_estimated"
        # FY2023-2024 (Apr-Mar): 12 * (100000 * 8.25% / 12) = 8250, credited at March
        # -> principal becomes 108250, which is FY2024-2025's opening balance.
        fy1_interest = 12 * (100000 * 8.25 / 100 / 12)
        principal_after_fy1 = 100000 + fy1_interest
        assert principal_after_fy1 == 108250.0
        # FY2024-2025 (Apr, May, Jun only, since "now" is mid-June): 3 months at 8.10%.
        fy2_interest = 3 * (principal_after_fy1 * 8.10 / 100 / 12)
        expected = principal_after_fy1 + fy2_interest
        assert result.price == expected
        assert result.epf_estimate_basis["rates_applied"] == [
            {"financial_year": "2023-2024", "rate_pct": 8.25},
            {"financial_year": "2024-2025", "rate_pct": 8.10},
        ]
    finally:
        _cleanup(db_session, portfolio, asset)
