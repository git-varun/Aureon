"""Unit tests for assets repositories."""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.modules.assets.repositories import AssetRepository, PriceHistoryRepository
from app.modules.portfolio.models import Asset, PriceHistory
from app.shared.constants import AssetType


def _mock_asset(id=1, symbol="RELIANCE", asset_type=AssetType.EQUITY, exchange="NSE"):
    a = MagicMock(spec=Asset)
    a.id = id
    a.symbol = symbol
    a.asset_type = asset_type
    a.exchange = exchange
    return a


def _mock_price(asset_id=1, close=100.0, date=None):
    p = MagicMock(spec=PriceHistory)
    p.asset_id = asset_id
    p.close = close
    p.date = date or datetime(2026, 4, 1)
    return p


# ── AssetRepository ────────────────────────────────────────────────────────

class TestAssetRepository:
    def setup_method(self):
        self.session = MagicMock()
        self.repo = AssetRepository(self.session)

    def _chain(self, result):
        """Return a mock query chain that ultimately yields `result`."""
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.first.return_value = result
        q.all.return_value = result if isinstance(result, list) else [result] if result else []
        return q

    def test_get_by_symbol_found(self):
        asset = _mock_asset()
        self.session.query.return_value = self._chain(asset)
        result = self.repo.get_by_symbol("RELIANCE")
        assert result is asset

    def test_get_by_symbol_not_found(self):
        self.session.query.return_value = self._chain(None)
        result = self.repo.get_by_symbol("UNKNOWN")
        assert result is None

    def test_list_all_no_filter(self):
        assets = [_mock_asset(1, "RELIANCE"), _mock_asset(2, "TCS")]
        self.session.query.return_value = self._chain(assets)
        result = self.repo.list_all()
        assert len(result) == 2

    def test_upsert_creates_new_asset(self):
        # get_by_symbol returns None → new asset created
        self.session.query.return_value = self._chain(None)
        new_asset = _mock_asset()
        with patch("app.modules.assets.repositories.Asset", return_value=new_asset):
            result = self.repo.upsert("INFY", "Infosys", AssetType.EQUITY, "NSE")
        self.session.add.assert_called_once()
        self.session.commit.assert_called_once()

    def test_upsert_updates_existing_asset(self):
        existing = _mock_asset()
        self.session.query.return_value = self._chain(existing)
        self.repo.upsert("RELIANCE", "Reliance Ind", AssetType.EQUITY, "NSE")
        # name, asset_type, exchange updated via attribute assignment
        self.session.commit.assert_called_once()


# ── PriceHistoryRepository ─────────────────────────────────────────────────

class TestPriceHistoryRepository:
    def setup_method(self):
        self.session = MagicMock()
        self.repo = PriceHistoryRepository(self.session)

    def _chain(self, result):
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.first.return_value = result if not isinstance(result, list) else None
        q.all.return_value = result if isinstance(result, list) else []
        return q

    def test_get_range_returns_ordered_rows(self):
        rows = [_mock_price(close=100.0), _mock_price(close=105.0)]
        self.session.query.return_value = self._chain(rows)
        start = datetime(2026, 1, 1)
        end = datetime(2026, 4, 1)
        result = self.repo.get_range(1, start, end)
        assert len(result) == 2

    def test_get_last_n_days_delegates_to_get_range(self):
        rows = [_mock_price()]
        self.session.query.return_value = self._chain(rows)
        result = self.repo.get_last_n_days(1, days=7)
        assert len(result) == 1

    def test_save_snapshot_creates_new_record(self):
        # No existing record for that date
        q = MagicMock()
        q.filter.return_value = q
        q.first.return_value = None
        self.session.query.return_value = q

        new_ph = _mock_price()
        with patch("app.modules.assets.repositories.PriceHistory", return_value=new_ph):
            self.repo.save_snapshot(1, datetime(2026, 4, 16), close=2850.0)
        self.session.add.assert_called_once()
        self.session.commit.assert_called_once()

    def test_save_snapshot_updates_existing_record(self):
        existing = _mock_price(close=100.0)
        q = MagicMock()
        q.filter.return_value = q
        q.first.return_value = existing
        self.session.query.return_value = q

        self.repo.save_snapshot(1, datetime(2026, 4, 16), close=2850.0)
        self.session.add.assert_not_called()
        self.session.commit.assert_called_once()
