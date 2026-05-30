"""Unit tests for newly added portfolio providers."""

import pytest
from unittest.mock import MagicMock

from app.modules.portfolio.providers.coinbase import CoinbaseSync
from app.modules.portfolio.providers.custom_equity import CustomEquitySync


def test_custom_equity_provider_parses_json():
    cred_manager = MagicMock()
    cred_manager.get_custom_equity_credentials.return_value = (
        '[{"symbol": "RELIANCE", "qty": 10, "avg_buy_price": 2500}]',
        None,
    )
    provider = CustomEquitySync(cred_manager=cred_manager)

    provider.validate_credentials()
    holdings = provider.fetch_holdings()

    assert len(holdings) == 1
    assert holdings[0].symbol == "RELIANCE"
    assert holdings[0].qty == 10
    assert holdings[0].avg_buy_price == 2500.0


def test_coinbase_provider_requires_credentials():
    cred_manager = MagicMock()
    cred_manager.get_coinbase_credentials.return_value = ("", "", "")
    provider = CoinbaseSync(cred_manager=cred_manager)

    with pytest.raises(ValueError, match="Missing Coinbase credentials"):
        provider.validate_credentials()
