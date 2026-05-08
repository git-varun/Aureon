"""Unit tests for newly added portfolio providers."""

import pytest

from app.core.config import settings
from app.modules.portfolio.providers.coinbase import CoinbaseSync
from app.modules.portfolio.providers.custom_equity import CustomEquitySync


def test_custom_equity_provider_parses_json(monkeypatch):
    monkeypatch.setenv("CUSTOM_EQUITY_HOLDINGS_JSON", '[{"symbol": "RELIANCE", "qty": 10, "avg_buy_price": 2500}]')
    provider = CustomEquitySync()

    provider.validate_credentials()
    holdings = provider.fetch_holdings()

    assert len(holdings) == 1
    assert holdings[0].symbol == "RELIANCE"
    assert holdings[0].qty == 10
    assert holdings[0].avg_buy_price == 2500.0


def test_coinbase_provider_requires_credentials(monkeypatch):
    monkeypatch.setattr(settings, "coinbase_api_key", "")
    monkeypatch.setattr(settings, "coinbase_api_secret", "")
    monkeypatch.setattr(settings, "coinbase_passphrase", "")
    provider = CoinbaseSync()

    with pytest.raises(ValueError, match="Missing Coinbase credentials"):
        provider.validate_credentials()
