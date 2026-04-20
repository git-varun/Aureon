"""Credential manager for fetching API keys from database or environment."""

import logging
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger("credential_manager")


class CredentialManager:
    """Fetch provider credentials from database ConfigService or fallback to environment variables."""

    def __init__(self, session: Optional[Session] = None):
        """
        Initialize credential manager.

        Args:
            session: Optional SQLAlchemy session for database access.
                    If provided, credentials will be fetched from DB first,
                    then fallback to environment variables.
        """
        self.session = session
        self._config_service = None

    @property
    def config_service(self):
        """Lazy-load ConfigService (only if session available)."""
        if self._config_service is None and self.session:
            from app.modules.config.services import ConfigService
            self._config_service = ConfigService(self.session)
        return self._config_service

    def get_credential(self, provider: str, key_name: str, env_var: str) -> Optional[str]:
        """
        Fetch a credential for a provider.

        Priority:
            1. Database (if config_service available)
            2. Environment variable

        Args:
            provider: Provider name (e.g., 'binance', 'zerodha', 'groww')
            key_name: Key name in database (e.g., 'api_key', 'api_secret')
            env_var: Environment variable name (fallback)

        Returns:
            Credential value or None if not found
        """
        try:
            # Try database first
            if self.config_service:
                db_value = self.config_service.get_decrypted_key(provider, key_name)
                if db_value:
                    logger.debug(
                        "Credential fetched from DB: provider=%s key=%s (masked)",
                        provider, key_name
                    )
                    return db_value
        except Exception as e:
            logger.warning(
                "Failed to fetch credential from DB: provider=%s key=%s error=%s",
                provider, key_name, e
            )

        # Fallback to environment variable
        import os
        env_value = os.getenv(env_var, "").strip()
        if env_value:
            logger.debug(
                "Credential fetched from env: provider=%s env_var=%s (masked)",
                provider, env_var
            )
            return env_value

        logger.debug(
            "Credential not found: provider=%s key=%s env_var=%s",
            provider, key_name, env_var
        )
        return None

    def get_binance_credentials(self) -> tuple[Optional[str], Optional[str]]:
        """Get Binance API key and secret."""
        api_key = self.get_credential("binance", "api_key", "BINANCE_API_KEY")
        api_secret = self.get_credential("binance", "api_secret", "BINANCE_API_SECRET")
        return api_key, api_secret

    def get_groww_credentials(self) -> tuple[Optional[str], Optional[str]]:
        """Get Groww API key and secret."""
        api_key = self.get_credential("groww", "api_key", "GROWW_API_KEY")
        api_secret = self.get_credential("groww", "api_secret", "GROWW_API_SECRET")
        return api_key, api_secret

    def get_coinbase_credentials(self) -> tuple[Optional[str], Optional[str], Optional[str]]:
        """Get Coinbase API key, secret, and passphrase."""
        api_key = self.get_credential("coinbase", "api_key", "COINBASE_API_KEY")
        api_secret = self.get_credential("coinbase", "api_secret", "COINBASE_API_SECRET")
        passphrase = self.get_credential("coinbase", "api_passphrase", "COINBASE_PASSPHRASE")
        return api_key, api_secret, passphrase

    def get_zerodha_credentials(self) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
        """Get Zerodha API key, secret, access token, and request token."""
        api_key = self.get_credential("zerodha", "api_key", "ZERODHA_API_KEY")
        api_secret = self.get_credential("zerodha", "api_secret", "ZERODHA_API_SECRET")
        access_token = self.get_credential("zerodha", "access_token", "ZERODHA_ACCESS_TOKEN")
        request_token = self.get_credential("zerodha", "request_token", "ZERODHA_REQUEST_TOKEN")
        return api_key, api_secret, access_token, request_token

    def get_custom_equity_credentials(self) -> tuple[Optional[str], Optional[str]]:
        """Get custom equity holdings JSON and file path."""
        holdings_json = self.get_credential("custom_equity", "holdings_json", "CUSTOM_EQUITY_HOLDINGS_JSON")
        holdings_file = self.get_credential("custom_equity", "holdings_file", "CUSTOM_EQUITY_HOLDINGS_FILE")
        return holdings_json, holdings_file

    def get_gemini_key(self) -> Optional[str]:
        return self.get_credential("gemini", "api_key", "GEMINI_API_KEY")

    def get_groq_key(self) -> Optional[str]:
        return self.get_credential("groq", "api_key", "GROQ_API_KEY")

    def get_finnhub_key(self) -> Optional[str]:
        return self.get_credential("finnhub", "api_key", "FINNHUB_API_KEY")

    def get_newsapi_key(self) -> Optional[str]:
        return self.get_credential("newsapi", "api_key", "NEWSAPI_API_KEY")

    def get_alphavantage_key(self) -> Optional[str]:
        return self.get_credential("alphavantage", "api_key", "ALPHAVANTAGE_API_KEY")

    def get_telegram_credentials(self) -> tuple[Optional[str], Optional[str]]:
        bot_token = self.get_credential("telegram", "bot_token", "TELEGRAM_BOT_TOKEN")
        chat_id = self.get_credential("telegram", "chat_id", "TELEGRAM_CHAT_ID")
        return bot_token, chat_id

    def get_coingecko_key(self) -> Optional[str]:
        return self.get_credential("coingecko", "api_key", "COINGECKO_API_KEY")

    def get_coinmarketcap_key(self) -> Optional[str]:
        return self.get_credential("coinmarketcap", "api_key", "COINMARKETCAP_API_KEY")
