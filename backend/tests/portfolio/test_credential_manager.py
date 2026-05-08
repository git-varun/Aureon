"""Tests for CredentialManager and database credential fetching."""

import json
import pytest
from unittest.mock import Mock, MagicMock, patch

from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.modules.portfolio.providers.binance import BinanceIntelligenceClient
from app.modules.portfolio.providers.groww import GrowwSync
from app.modules.portfolio.providers.coinbase import CoinbaseSync
from app.modules.portfolio.providers.custom_equity import CustomEquitySync


class TestCredentialManager:
    """Test CredentialManager credential fetching logic."""

    def test_credential_manager_without_session_uses_env(self, monkeypatch):
        """Test that CredentialManager falls back to env vars when session is None."""
        monkeypatch.setenv("BINANCE_API_KEY", "env_key")
        monkeypatch.setenv("BINANCE_API_SECRET", "env_secret")

        manager = CredentialManager(session=None)
        api_key, api_secret = manager.get_binance_credentials()

        assert api_key == "env_key"
        assert api_secret == "env_secret"

    def test_credential_manager_with_session_queries_db(self):
        """Test that CredentialManager queries database when session provided."""
        mock_session = Mock()
        mock_config_service = Mock()
        mock_config_service.get_decrypted_key.side_effect = lambda provider, key_name: {
            ("binance", "api_key"): "db_key",
            ("binance", "api_secret"): "db_secret",
        }.get((provider, key_name))

        manager = CredentialManager(session=mock_session)
        manager._config_service = mock_config_service

        api_key, api_secret = manager.get_binance_credentials()

        assert api_key == "db_key"
        assert api_secret == "db_secret"
        assert mock_config_service.get_decrypted_key.call_count == 2

    def test_credential_manager_db_fallback_to_env(self, monkeypatch):
        """Test fallback to env when DB returns None."""
        monkeypatch.setenv("BINANCE_API_KEY", "env_key")
        monkeypatch.setenv("BINANCE_API_SECRET", "env_secret")

        mock_session = Mock()
        mock_config_service = Mock()
        mock_config_service.get_decrypted_key.return_value = None

        manager = CredentialManager(session=mock_session)
        manager._config_service = mock_config_service

        api_key, api_secret = manager.get_binance_credentials()

        # Should have tried DB first, then fallen back to env
        assert api_key == "env_key"
        assert api_secret == "env_secret"

    def test_credential_manager_groww_credentials(self, monkeypatch):
        """Test Groww credentials fetching."""
        monkeypatch.setenv("GROWW_API_KEY", "groww_key")
        monkeypatch.setenv("GROWW_API_SECRET", "groww_secret")

        manager = CredentialManager(session=None)
        api_key, api_secret = manager.get_groww_credentials()

        assert api_key == "groww_key"
        assert api_secret == "groww_secret"

    def test_credential_manager_coinbase_credentials(self, monkeypatch):
        """Test Coinbase credentials fetching."""
        monkeypatch.setenv("COINBASE_API_KEY", "cb_key")
        monkeypatch.setenv("COINBASE_API_SECRET", "cb_secret")
        monkeypatch.setenv("COINBASE_PASSPHRASE", "cb_pass")

        manager = CredentialManager(session=None)
        api_key, api_secret, passphrase = manager.get_coinbase_credentials()

        assert api_key == "cb_key"
        assert api_secret == "cb_secret"
        assert passphrase == "cb_pass"

    def test_credential_manager_custom_equity_credentials(self, monkeypatch):
        """Test custom equity credentials fetching."""
        json_data = '[{"symbol": "TEST", "qty": 10}]'
        monkeypatch.setenv("CUSTOM_EQUITY_HOLDINGS_JSON", json_data)

        manager = CredentialManager(session=None)
        holdings_json, holdings_file = manager.get_custom_equity_credentials()

        assert holdings_json == json_data
        assert holdings_file is None or holdings_file == ""


class TestProviderWithCredentialManager:
    """Test provider classes with CredentialManager."""

    def test_binance_provider_with_cred_manager(self):
        """Test BinanceIntelligenceClient accepts cred_manager."""
        mock_cred_manager = Mock()
        mock_cred_manager.get_binance_credentials.return_value = ("api_key", "api_secret")

        provider = BinanceIntelligenceClient(cred_manager=mock_cred_manager)

        assert provider.api_key == "api_key"
        assert provider.api_secret == "api_secret"
        mock_cred_manager.get_binance_credentials.assert_called_once()

    def test_binance_provider_without_cred_manager_uses_settings(self, monkeypatch):
        """Test BinanceIntelligenceClient falls back to settings."""
        monkeypatch.setenv("BINANCE_API_KEY", "")
        monkeypatch.setenv("BINANCE_API_SECRET", "")

        provider = BinanceIntelligenceClient(cred_manager=None)

        # Should use empty settings
        assert provider.api_key == ""
        assert provider.api_secret == ""

    def test_coinbase_provider_with_cred_manager(self):
        """Test CoinbaseSync accepts cred_manager."""
        mock_cred_manager = Mock()
        mock_cred_manager.get_coinbase_credentials.return_value = (
            "api_key", "api_secret", "passphrase"
        )

        provider = CoinbaseSync(cred_manager=mock_cred_manager)

        assert provider.api_key == "api_key"
        assert provider.api_secret == "api_secret"
        assert provider.passphrase == "passphrase"
        mock_cred_manager.get_coinbase_credentials.assert_called_once()

    def test_custom_equity_provider_with_cred_manager(self):
        """Test CustomEquitySync accepts cred_manager."""
        json_data = '[{"symbol": "TEST", "qty": 10}]'
        mock_cred_manager = Mock()
        mock_cred_manager.get_custom_equity_credentials.return_value = (json_data, None)

        provider = CustomEquitySync(cred_manager=mock_cred_manager)

        assert provider.json_payload == json_data
        assert provider.file_path == ""
        mock_cred_manager.get_custom_equity_credentials.assert_called_once()

    def test_groww_provider_with_cred_manager(self):
        """Test GrowwSync accepts cred_manager."""
        mock_cred_manager = Mock()
        mock_cred_manager.get_groww_credentials.return_value = ("api_key", "api_secret")

        # Mock the GrowwAPI to prevent actual authentication
        with patch("app.modules.portfolio.providers.groww.GrowwAPI"):
            provider = GrowwSync(cred_manager=mock_cred_manager)

            assert provider.api_key == "api_key"
            assert provider.api_secret == "api_secret"
            mock_cred_manager.get_groww_credentials.assert_called_once()


class TestProviderFactoryWithSession:
    """Test provider factory passes session to credential manager."""

    def test_get_broker_provider_passes_session(self):
        """Test that factory passes session to CredentialManager."""
        from app.modules.portfolio.providers.factory import get_broker_provider

        mock_session = Mock()

        # Mock the binance provider module
        with patch("app.modules.portfolio.providers.binance.BinanceIntelligenceClient") as mock_binance:
            get_broker_provider("binance", session=mock_session)

            # Verify that a CredentialManager was created and passed
            mock_binance.assert_called_once()
            call_kwargs = mock_binance.call_args.kwargs
            assert "cred_manager" in call_kwargs

    def test_get_broker_provider_without_session(self):
        """Test that factory works without session (backward compat)."""
        from app.modules.portfolio.providers.factory import get_broker_provider

        # Mock the binance provider module
        with patch("app.modules.portfolio.providers.binance.BinanceIntelligenceClient") as mock_binance:
            get_broker_provider("binance", session=None)

            # Should still be called with cred_manager
            mock_binance.assert_called_once()
            call_kwargs = mock_binance.call_args.kwargs
            assert "cred_manager" in call_kwargs
