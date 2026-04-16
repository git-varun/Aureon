"""Integration-style tests for assets routes (using TestClient with mocked service)."""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.modules.portfolio.models import Asset, PriceHistory
from app.shared.constants import AssetType


def _asset(id=1, symbol="RELIANCE", asset_type=AssetType.EQUITY, price=2850.0, exchange="NSE"):
    a = MagicMock(spec=Asset)
    a.id = id
    a.symbol = symbol
    a.name = f"{symbol} Ltd"
    a.asset_type = asset_type
    a.exchange = exchange
    a.current_price = price
    a.previous_close = price
    a.market_cap = None
    a.updated_at = datetime(2026, 4, 16)
    return a


def _price_history(close=100.0):
    p = MagicMock(spec=PriceHistory)
    p.asset_id = 1
    p.close = close
    p.open_price = close
    p.high = close + 5
    p.low = close - 5
    p.volume = 1000.0
    p.date = datetime(2026, 4, 16)
    return p


@pytest.fixture
def client():
    from fastapi import FastAPI
    from app.modules.assets.routes import router
    from app.core.dependencies import get_session
    from unittest.mock import MagicMock

    test_app = FastAPI()
    test_app.include_router(router)
    # Override DB session with a no-op mock (routes mock AssetsService anyway)
    test_app.dependency_overrides[get_session] = lambda: MagicMock()
    return TestClient(test_app)


class TestAssetsHealthRoute:
    def test_health_returns_ok(self, client):
        resp = client.get("/api/assets/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestListAssetsRoute:
    def test_list_returns_assets(self, client):
        assets = [_asset(1, "RELIANCE"), _asset(2, "TCS")]
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.list_assets.return_value = assets
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        assert len(body["data"]) == 2

    def test_list_with_type_filter(self, client):
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.list_assets.return_value = []
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets?asset_type=crypto")
        assert resp.status_code == 200
        svc_instance.list_assets.assert_called_once_with(
            asset_type=AssetType.CRYPTO, exchange=None, search=None
        )

    def test_list_with_exchange_filter(self, client):
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.list_assets.return_value = []
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets?exchange=NSE")
        assert resp.status_code == 200
        svc_instance.list_assets.assert_called_once_with(
            asset_type=None, exchange="NSE", search=None
        )


class TestGetAssetRoute:
    def test_get_existing_asset(self, client):
        detail = {
            "id": 1,
            "symbol": "RELIANCE",
            "name": "Reliance Ltd",
            "type": "equity",
            "exchange": "NSE",
            "current_price": 2850.0,
            "previous_close": 2840.0,
            "market_cap": None,
            "updated_at": "2026-04-16T00:00:00",
            "prices_24h": [2840.0, 2850.0],
            "volume_24h": 5000.0,
            "latest_price_ts": "2026-04-16T00:00:00",
        }
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.get_asset_detail.return_value = detail
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets/RELIANCE")
        assert resp.status_code == 200
        assert resp.json()["symbol"] == "RELIANCE"

    def test_get_missing_asset_returns_404(self, client):
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.get_asset_detail.return_value = None
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets/UNKNOWN")
        assert resp.status_code == 404


class TestPriceHistoryRoute:
    def test_history_returns_rows(self, client):
        ph = [_price_history(100.0), _price_history(105.0)]
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.get_asset.return_value = _asset()
            svc_instance.get_price_history.return_value = ph
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets/RELIANCE/history?days=7")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_history_404_for_missing_asset(self, client):
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.get_asset.return_value = None
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets/UNKNOWN/history")
        assert resp.status_code == 404


class TestChartRoute:
    def test_chart_returns_candles(self, client):
        candles = [
            {"time": 1744761600, "open": 100.0, "high": 105.0, "low": 98.0, "close": 102.0, "volume": 1000}
        ]
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.get_asset.return_value = _asset()
            svc_instance.get_chart_data.return_value = candles
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets/RELIANCE/chart")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_chart_404_for_missing_asset(self, client):
        with patch("app.modules.assets.routes.AssetsService") as MockSvc:
            svc_instance = MagicMock()
            svc_instance.get_asset.return_value = None
            MockSvc.return_value = svc_instance

            resp = client.get("/api/assets/UNKNOWN/chart")
        assert resp.status_code == 404


class TestTriggerPriceRefreshRoute:
    def test_trigger_enqueues_task(self, client):
        mock_task = MagicMock()
        mock_task.id = "abc123"
        # Task is imported lazily inside the route function; patch at the source module
        with patch("app.tasks.portfolio.refresh_prices_task") as mock_refresh:
            mock_refresh.delay.return_value = mock_task
            resp = client.post("/api/assets/price")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "enqueued"
        assert body["task_id"] == "abc123"
