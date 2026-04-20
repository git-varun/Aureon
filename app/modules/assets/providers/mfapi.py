"""Indian Mutual Fund NAV provider via mfapi.in (free public AMFI mirror API)."""
import logging
from typing import Optional

import requests

from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import PricePayload, PriceProvider

logger = logging.getLogger("providers.mfapi")

_SEARCH_URL = "https://api.mfapi.in/mf/search"
_NAV_URL = "https://api.mfapi.in/mf/{scheme_code}"


class MFAPIPriceProvider(PriceProvider):
    """Fetches latest NAV from mfapi.in for Indian mutual fund assets.

    No API key required. Symbol format expected: <SCHEME_NAME>_MF
    (e.g. HDFC_BALANCED_ADVANTAGE_FUND_MF).
    """

    provider_name = "mfapi"
    _scheme_cache: dict = {}

    def __init__(self, cred_manager: CredentialManager):
        pass

    def _lookup_scheme_code(self, symbol: str) -> Optional[int]:
        query = symbol.replace("_MF", "").replace("_", " ").strip()
        try:
            resp = requests.get(_SEARCH_URL, params={"q": query}, timeout=10)
            resp.raise_for_status()
            results = resp.json()
            if results:
                code = results[0].get("schemeCode")
                logger.debug("mfapi: %s → schemeCode=%s (%s)", symbol, code, results[0].get("schemeName"))
                return int(code) if code else None
        except Exception as exc:
            logger.debug("mfapi search failed for %s: %s", symbol, exc)
        return None

    def get_price(self, symbol: str, asset_type: str) -> Optional[PricePayload]:
        if asset_type != "mutual_fund":
            return None

        if symbol not in self._scheme_cache:
            code = self._lookup_scheme_code(symbol)
            if code is None:
                logger.warning("mfapi: could not resolve scheme code for %s", symbol)
                return None
            self._scheme_cache[symbol] = code

        scheme_code = self._scheme_cache[symbol]
        try:
            resp = requests.get(_NAV_URL.format(scheme_code=scheme_code), timeout=10)
            resp.raise_for_status()
            data = resp.json()
            nav_entries = data.get("data", [])
            if nav_entries:
                nav = float(nav_entries[0]["nav"])
                return PricePayload(
                    symbol=symbol,
                    price=nav,
                    currency="INR",
                    provider=self.provider_name,
                )
        except Exception as exc:
            logger.debug("mfapi nav fetch failed for %s (code=%s): %s", symbol, scheme_code, exc)
        return None

    def get_historical_nav(self, symbol: str, limit: int = 365) -> list:
        """Return list of {date, nav} dicts for OHLCV seeding."""
        if symbol not in self._scheme_cache:
            code = self._lookup_scheme_code(symbol)
            if code is None:
                return []
            self._scheme_cache[symbol] = code

        scheme_code = self._scheme_cache[symbol]
        try:
            resp = requests.get(_NAV_URL.format(scheme_code=scheme_code), timeout=15)
            resp.raise_for_status()
            return resp.json().get("data", [])[:limit]
        except Exception as exc:
            logger.debug("mfapi historical fetch failed for %s: %s", symbol, exc)
        return []
