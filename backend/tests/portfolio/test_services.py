"""Unit tests for portfolio service sync orchestration."""

from unittest.mock import MagicMock, patch

import pytest

from app.modules.portfolio.services import PortfolioService
from app.modules.portfolio.models import Asset, Position
from app.shared.constants import AssetType
from app.shared.interfaces import AssetPayload, AssetSource


class StubProvider(AssetSource):
    def __init__(self, holdings):
        self._holdings = holdings

    @property
    def provider_name(self) -> str:
        return "stub"

    def validate_credentials(self) -> None:
        return None

    def fetch_holdings(self):
        return self._holdings


def test_sync_portfolio_creates_snapshot_and_recalculates(monkeypatch):
    """sync_portfolio should upsert a broker_snapshot transaction then delegate
    position state to recalculate_position, not call create_position directly."""
    session = MagicMock()
    service = PortfolioService(session)

    holdings = [
        AssetPayload(symbol="TCS", qty=10.0, avg_buy_price=3200.0, source="stub", type="equity")
    ]
    provider = StubProvider(holdings)

    asset = Asset(id=1, symbol="TCS", name="TCS", asset_type=AssetType.EQUITY, exchange="NSE")

    # Session query for broker_snapshot returns None (first sync, no existing snapshot)
    snap_query = MagicMock()
    snap_query.filter_by.return_value.first.return_value = None
    session.query.return_value = snap_query

    with patch.object(service, "create_asset", return_value=asset), \
         patch.object(service, "recalculate_position") as mock_recalc:
        result = service.sync_portfolio(provider, dry_run=False, user_id=1)

    mock_recalc.assert_called_once_with(asset.id, 1)
    assert result["status"] == "success"
    assert result["holdings_count"] == 1
    assert result["updated_assets"] == 1
    assert result["errors"] == []


def test_sync_portfolio_dry_run_returns_holdings_count():
    session = MagicMock()
    service = PortfolioService(session)
    holdings = [
        AssetPayload(symbol="INFY", qty=5.0, avg_buy_price=1400.0, source="stub", type="equity")
    ]
    provider = StubProvider(holdings)

    result = service.sync_portfolio(provider, dry_run=True)

    assert result["status"] == "dry_run"
    assert result["holdings_count"] == 1
    assert result["updated_assets"] == 0
    assert result["errors"] == []
