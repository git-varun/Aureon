import logging
import os

from growwapi import GrowwAPI

from modules.interfaces import AssetSource


class GrowwSync(AssetSource):
    def __init__(self):
        self.logger = logging.getLogger("Groww")

        # Defensively fetch and clean the keys.
        # If None is returned, it defaults to an empty string.
        self.api_key = (os.getenv("GROWW_API_KEY") or "").strip()
        self.api_secret = (os.getenv("GROWW_API_SECRET") or "").strip()

        self.api = None
        self._authenticate()

    def _authenticate(self):
        """Exchanges Key/Secret for an active session token."""
        # 1. Strict guard against empty, missing, or "None" string keys
        if not self.api_key or not self.api_secret or self.api_key.lower() == "none":
            self.logger.warning("🚫 Groww Plugin Disabled: Missing or invalid keys in .env")
            return

        try:
            # 2. Proceed with authentication only if keys are solid strings
            access_token = GrowwAPI.get_access_token(
                api_key=self.api_key,
                secret=self.api_secret
            )
            self.api = GrowwAPI(access_token)
            self.logger.info("✅ Groww Plugin: Authenticated Successfully")
        except Exception as e:
            self.logger.error(f"❌ Groww Plugin: Auth Failed -> {e}")

    def fetch_holdings(self):
        """Implements the AssetSource contract."""
        if not self.api:
            return []  # Fail gracefully and return empty assets if not authenticated

        try:
            response = self.api.get_holdings_for_user(timeout=10)
            raw = response.get("holdings", [])
            return [{
                "symbol": f"{item.get('trading_symbol')}.NS",
                "qty": float(item.get("quantity", 0)),
                "source": "groww",
                "type": "stock"
            } for item in raw]
        except Exception as e:
            self.logger.error(f"⚠️ Groww Fetch Error: {e}")
            return []
