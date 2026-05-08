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


def test_sync_portfolio_creates_new_position(monkeypatch):
    session = MagicMock()
    service = PortfolioService(session)

    holdings = [
        AssetPayload(symbol="TCS", qty=10.0, avg_buy_price=3200.0, source="custom_equity", type="equity")
    ]
    provider = StubProvider(holdings)

    asset = Asset(id=1, symbol="TCS", name="TCS", asset_type=AssetType.EQUITY, exchange="NSE")
    position = Position(id=1, asset_id=1, quantity=10.0, avg_buy_price=3200.0, current_value=32000.0, pnl=0.0, pnl_percent=0.0)

    with patch.object(service, "create_asset", return_value=asset) as create_asset, \
         patch.object(service.position_repo, "find_by_asset", return_value=None) as find_pos, \
         patch.object(service, "create_position", return_value=position) as create_position:
        result = service.sync_portfolio(provider, dry_run=False)

    create_asset.assert_called_once()
    create_position.assert_called_once_with({
        "asset_id": 1,
        "quantity": 10.0,
        "avg_buy_price": 3200.0,
    })
    assert result["status"] == "success"
    assert result["holdings_count"] == 1
    assert result["updated_assets"] == 1
    assert result["errors"] == []


def test_sync_portfolio_dry_run_returns_holdings_count():
    session = MagicMock()
    service = PortfolioService(session)
    holdings = [
        AssetPayload(symbol="INFY", qty=5.0, avg_buy_price=1400.0, source="custom_equity", type="equity")
    ]
    provider = StubProvider(holdings)

    result = service.sync_portfolio(provider, dry_run=True)

    assert result["status"] == "dry_run"
    assert result["holdings_count"] == 1
    assert result["updated_assets"] == 0
    assert result["errors"] == []
