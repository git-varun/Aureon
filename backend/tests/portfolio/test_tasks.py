"""Tests for portfolio Celery task delegation and orchestration."""

from unittest.mock import MagicMock, patch

from app.tasks.portfolio import sync_portfolio_task


def test_sync_portfolio_task_delegates_to_service():
    provider = MagicMock()
    provider.provider_name = "custom_equity"
    provider.validate_credentials = MagicMock()
    provider.fetch_holdings = MagicMock(return_value=[])

    with patch("app.modules.portfolio.providers.factory.get_broker_provider", return_value=provider), \
         patch("app.modules.portfolio.services.PortfolioService.sync_portfolio", return_value={
             "status": "success",
             "broker": "custom_equity",
             "holdings_count": 0,
             "updated_assets": 0,
             "errors": [],
         }) as mock_sync, \
         patch("app.tasks.portfolio.SessionLocal", return_value=MagicMock()):
            result = sync_portfolio_task.run(broker="custom_equity")
