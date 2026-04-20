"""Credential manager — DB-only key fetching. No env fallback."""

import logging
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger("credential_manager")


class CredentialManager:
    """Fetch provider credentials exclusively from the database.

    Keys must be set via the UI (/api/config/providers). If a key is absent
    from the DB, the relevant provider raises a MissingCredentialError.
    """

    def __init__(self, session: Session):
        self.session = session
        self._config_service = None

    @property
    def config_service(self):
        if self._config_service is None:
            from app.modules.config.services import ConfigService
            self._config_service = ConfigService(self.session)
        return self._config_service

    def get_credential(self, provider: str, key_name: str) -> Optional[str]:
        """Return decrypted key from DB, or None if not set."""
        try:
            return self.config_service.get_decrypted_key(provider, key_name)
        except Exception as e:
            logger.warning("get_credential: provider=%s key=%s error=%s", provider, key_name, e)
            return None

    # ── Brokers ──────────────────────────────────────────────────────────────

    def get_binance_credentials(self) -> tuple[Optional[str], Optional[str]]:
        return (
            self.get_credential("binance", "api_key"),
            self.get_credential("binance", "api_secret"),
        )

    def get_groww_credentials(self) -> tuple[Optional[str], Optional[str]]:
        return (
            self.get_credential("groww", "api_key"),
            self.get_credential("groww", "api_secret"),
        )

    def get_coinbase_credentials(self) -> tuple[Optional[str], Optional[str], Optional[str]]:
        return (
            self.get_credential("coinbase", "api_key"),
            self.get_credential("coinbase", "api_secret"),
            self.get_credential("coinbase", "api_passphrase"),
        )

    def get_zerodha_credentials(self) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
        return (
            self.get_credential("zerodha", "api_key"),
            self.get_credential("zerodha", "api_secret"),
            self.get_credential("zerodha", "access_token"),
            self.get_credential("zerodha", "request_token"),
        )

    def get_custom_equity_credentials(self) -> tuple[Optional[str], Optional[str]]:
        return (
            self.get_credential("custom_equity", "holdings_json"),
            self.get_credential("custom_equity", "holdings_file"),
        )

    # ── AI ───────────────────────────────────────────────────────────────────

    def get_gemini_key(self) -> Optional[str]:
        return self.get_credential("gemini", "api_key")

    def get_groq_key(self) -> Optional[str]:
        return self.get_credential("groq", "api_key")

    # ── News ─────────────────────────────────────────────────────────────────

    def get_finnhub_key(self) -> Optional[str]:
        return self.get_credential("finnhub", "api_key")

    def get_newsapi_key(self) -> Optional[str]:
        return self.get_credential("newsapi", "api_key")

    def get_alphavantage_key(self) -> Optional[str]:
        return self.get_credential("alphavantage", "api_key")

    # ── Price ─────────────────────────────────────────────────────────────────

    def get_coingecko_key(self) -> Optional[str]:
        return self.get_credential("coingecko", "api_key")

    def get_coinmarketcap_key(self) -> Optional[str]:
        return self.get_credential("coinmarketcap", "api_key")

    # ── Notification ──────────────────────────────────────────────────────────

    def get_telegram_credentials(self) -> tuple[Optional[str], Optional[str]]:
        return (
            self.get_credential("telegram", "bot_token"),
            self.get_credential("telegram", "chat_id"),
        )
