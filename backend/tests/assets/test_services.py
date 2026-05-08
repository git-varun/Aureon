"""Unit tests for AssetsService and PriceProviderService."""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app.modules.assets.services import AssetsService, PriceProviderService
from app.modules.portfolio.models import Asset, Position, PriceHistory
from app.shared.constants import AssetType
from app.shared.interfaces import PricePayload


def _asset(symbol="RELIANCE", asset_type=AssetType.EQUITY, price=100.0):
    a = MagicMock(spec=Asset)
    a.id = 1
    a.symbol = symbol
    a.name = symbol
    a.asset_type = asset_type
    a.exchange = "NSE"
    a.current_price = price
    a.previous_close = price
    a.market_cap = None
    a.updated_at = datetime(2026, 4, 16)
    a.positions = []
    return a


def _position(asset, qty=10.0, avg=100.0):
    p = MagicMock(spec=Position)
    p.id = 1
    p.asset = asset
    p.asset_id = asset.id
    p.quantity = qty
    p.avg_buy_price = avg
    p.current_value = qty * avg
    p.pnl = 0.0
    p.pnl_percent = 0.0
    return p


def _price_history(close=100.0, date=None):
    p = MagicMock(spec=PriceHistory)
    p.asset_id = 1
    p.close = close
    p.open_price = close
    p.high = close
    p.low = close
    p.volume = 1000.0
    p.date = date or datetime(2026, 4, 1)
    return p


# ── PriceProviderService ───────────────────────────────────────────────────

class TestPriceProviderService:
    def test_fetch_returns_first_successful_price(self):
        p1 = MagicMock()
        p1.provider_name = "p1"
        p1.get_price.return_value = PricePayload(symbol="BTC", price=95000.0, currency="USD", provider="p1")
        p2 = MagicMock()
        p2.get_price.return_value = PricePayload(symbol="BTC", price=94000.0, currency="USD", provider="p2")

        svc = PriceProviderService([p1, p2])
        result = svc.fetch("BTC", "crypto")

        assert result == 95000.0
        p2.get_price.assert_not_called()  # first provider succeeded

    def test_fetch_falls_back_on_none(self):
        p1 = MagicMock()
        p1.provider_name = "p1"
        p1.get_price.return_value = None
        p2 = MagicMock()
        p2.provider_name = "p2"
        p2.get_price.return_value = PricePayload(symbol="BTC", price=94000.0, currency="USD", provider="p2")

        svc = PriceProviderService([p1, p2])
        assert svc.fetch("BTC", "crypto") == 94000.0

    def test_fetch_returns_zero_when_all_fail(self):
        p = MagicMock()
        p.provider_name = "p"
        p.get_price.side_effect = Exception("timeout")
        svc = PriceProviderService([p])
        assert svc.fetch("BTC", "crypto") == 0.0

    def test_fetch_batch_skips_zero_prices(self):
        p = MagicMock()
        p.provider_name = "p"
        p.get_price.side_effect = lambda sym, _type: (
            PricePayload(symbol=sym, price=100.0, currency="INR", provider="p")
            if sym == "RELIANCE" else None
        )
        svc = PriceProviderService([p])
        result = svc.fetch_batch(["RELIANCE", "INFY"], "equity")
        assert "RELIANCE" in result
        assert "INFY" not in result


# ── AssetsService ──────────────────────────────────────────────────────────

class TestAssetsService:
    def setup_method(self):
        self.session = MagicMock()
        self.svc = AssetsService(self.session)

    def test_list_assets_delegates_to_repo(self):
        assets = [_asset("RELIANCE"), _asset("TCS")]
        self.svc.asset_repo.list_all = MagicMock(return_value=assets)
        result = self.svc.list_assets()
        assert len(result) == 2
        self.svc.asset_repo.list_all.assert_called_once_with(
            asset_type=None, exchange=None, search=None
        )

    def test_list_assets_passes_filters(self):
        self.svc.asset_repo.list_all = MagicMock(return_value=[])
        self.svc.list_assets(asset_type=AssetType.CRYPTO, exchange="BINANCE", search="BTC")
        self.svc.asset_repo.list_all.assert_called_once_with(
            asset_type=AssetType.CRYPTO, exchange="BINANCE", search="BTC"
        )

    def test_get_asset_delegates_to_repo(self):
        asset = _asset()
        self.svc.asset_repo.get_by_symbol = MagicMock(return_value=asset)
        result = self.svc.get_asset("RELIANCE")
        assert result is asset

    def test_get_asset_detail_returns_none_for_missing(self):
        self.svc.asset_repo.get_by_symbol = MagicMock(return_value=None)
        assert self.svc.get_asset_detail("UNKNOWN") is None

    def test_get_asset_detail_includes_price_samples(self):
        asset = _asset()
        prices = [_price_history(close=100.0), _price_history(close=105.0)]
        self.svc.asset_repo.get_by_symbol = MagicMock(return_value=asset)
        self.svc.price_repo.get_last_n_days = MagicMock(return_value=prices)

        detail = self.svc.get_asset_detail("RELIANCE")
        assert detail is not None
        assert detail["prices_24h"] == [100.0, 105.0]

    def test_update_asset_price_persists_and_cascades(self):
        pos = _position(_asset())
        asset = _asset()
        asset.positions = [pos]

        self.svc.price_repo.save_snapshot = MagicMock()

        self.svc.update_asset_price(asset, 110.0)

        assert asset.current_price == 110.0
        self.session.commit.assert_called()
        self.svc.price_repo.save_snapshot.assert_called_once()
        # Position P&L updated
        assert pos.current_value == pos.quantity * 110.0

    def test_get_price_history_returns_empty_for_missing_asset(self):
        self.svc.asset_repo.get_by_symbol = MagicMock(return_value=None)
        assert self.svc.get_price_history("UNKNOWN") == []

    def test_get_chart_data_returns_empty_for_missing_asset(self):
        self.svc.asset_repo.get_by_symbol = MagicMock(return_value=None)
        assert self.svc.get_chart_data("UNKNOWN") == []

    def test_get_chart_data_builds_candles(self):
        asset = _asset()
        self.svc.asset_repo.get_by_symbol = MagicMock(return_value=asset)
        prices = [
            _price_history(close=float(100 + i), date=datetime(2026, 1, i + 1))
            for i in range(25)
        ]
        self.svc.price_repo.get_last_n_days = MagicMock(return_value=prices)

        candles = self.svc.get_chart_data("RELIANCE", days=25)
        assert len(candles) == 25
        for c in candles:
            assert "time" in c
            assert "close" in c
        # EMA20 should be present for all candles (ewm fills from start)
        assert all("ema20" in c for c in candles)

    def test_refresh_prices_calls_update_for_valid_price(self):
        asset = _asset("RELIANCE", AssetType.EQUITY)
        self.svc.asset_repo.list_all = MagicMock(return_value=[asset])
        self.svc.update_asset_price = MagicMock()

        with patch("app.modules.assets.services.PriceProviderService") as MockSvc:
            mock_price_svc = MagicMock()
            mock_price_svc.fetch.return_value = 2850.0
            MockSvc.return_value = mock_price_svc

            result = self.svc.refresh_prices()

        self.svc.update_asset_price.assert_called_once_with(asset, 2850.0)
        assert result["assets_updated"] == 1
        assert result["assets_skipped"] == 0

    def test_refresh_prices_skips_zero_price(self):
        asset = _asset("RELIANCE", AssetType.EQUITY)
        self.svc.asset_repo.list_all = MagicMock(return_value=[asset])
        self.svc.update_asset_price = MagicMock()

        with patch("app.modules.assets.services.PriceProviderService") as MockSvc:
            mock_price_svc = MagicMock()
            mock_price_svc.fetch.return_value = 0.0
            MockSvc.return_value = mock_price_svc

            result = self.svc.refresh_prices()

        self.svc.update_asset_price.assert_not_called()
        assert result["assets_updated"] == 0
        assert result["assets_skipped"] == 1
