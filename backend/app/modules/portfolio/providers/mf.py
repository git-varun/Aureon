"""Manual mutual fund portfolio provider using mfapi.in for NAV lookup.

Holdings are configured via the UI as a JSON array:
  [{"scheme_name": "HDFC Flexi Cap Fund", "units": 150.5, "avg_nav": 45.23}, ...]
  or with an explicit scheme_code:
  [{"scheme_code": 119551, "units": 150.5, "avg_nav": 45.23, "scheme_name": "..."}]
"""

import json
import logging
from typing import Any, Dict, List, Optional

import requests
from pydantic import ValidationError

from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import AssetPayload, AssetSource

logger = logging.getLogger("providers.mf")

_SEARCH_URL = "https://api.mfapi.in/mf/search"
_NAV_URL = "https://api.mfapi.in/mf/{scheme_code}"

_scheme_cache: Dict[str, Optional[int]] = {}


def _slug(name: str) -> str:
    return name.upper().replace(" ", "_")[:40]


def _lookup_scheme_code(query: str) -> Optional[int]:
    if query in _scheme_cache:
        return _scheme_cache[query]
    try:
        resp = requests.get(_SEARCH_URL, params={"q": query}, timeout=10)
        resp.raise_for_status()
        results = resp.json()
        if results:
            code = results[0].get("schemeCode")
            _scheme_cache[query] = int(code) if code else None
            return _scheme_cache[query]
    except Exception as exc:
        logger.debug("mfapi search failed for %s: %s", query, exc)
    _scheme_cache[query] = None
    return None


def _fetch_nav(scheme_code: int) -> Optional[float]:
    try:
        resp = requests.get(_NAV_URL.format(scheme_code=scheme_code), timeout=10)
        resp.raise_for_status()
        entries = resp.json().get("data", [])
        if entries:
            return float(entries[0]["nav"])
    except Exception as exc:
        logger.debug("mfapi nav fetch failed for code=%s: %s", scheme_code, exc)
    return None


class MutualFundSync(AssetSource):
    """Load manually-configured MF holdings; resolves current NAV from mfapi.in."""

    def __init__(self, cred_manager: CredentialManager):
        self._raw = (cred_manager.get_credential("mf", "holdings_json") or "").strip()

    @property
    def provider_name(self) -> str:
        return "mf"

    def validate_credentials(self) -> None:
        holdings = self._load()
        if not holdings:
            raise ValueError(
                "mf.holdings_json must be a non-empty JSON array of MF holdings."
            )

    def _load(self) -> List[Dict[str, Any]]:
        if not self._raw:
            return []
        try:
            data = json.loads(self._raw)
        except json.JSONDecodeError as exc:
            raise ValueError("mf.holdings_json must be valid JSON") from exc
        if not isinstance(data, list):
            raise ValueError("mf.holdings_json must be a JSON array")
        return data

    def fetch_holdings(self) -> List[AssetPayload]:
        try:
            raw = self._load()
        except ValueError as exc:
            logger.error("MutualFundSync: invalid holdings config: %s", exc)
            return []

        results: List[AssetPayload] = []
        for item in raw:
            scheme_name = str(item.get("scheme_name", "")).strip()
            units = float(item.get("units", 0) or 0)
            avg_nav = float(item.get("avg_nav", 0) or 0)

            if not scheme_name or units <= 0:
                continue

            symbol = f"{_slug(scheme_name)}_MF"

            scheme_code = item.get("scheme_code")
            if not scheme_code:
                scheme_code = _lookup_scheme_code(scheme_name)

            current_nav = _fetch_nav(scheme_code) if scheme_code else None
            price = current_nav if current_nav else avg_nav
            unrealized_pnl = round((price - avg_nav) * units, 2) if avg_nav > 0 else 0.0

            try:
                results.append(AssetPayload(
                    symbol=symbol,
                    qty=units,
                    avg_buy_price=avg_nav,
                    source="MF (Manual)",
                    type="mutual_fund",
                    unrealized_pnl=unrealized_pnl,
                    positions=[{
                        "source": "MF (Manual)",
                        "market_type": "spot",
                        "position_type": "long",
                        "qty": units,
                        "avg_buy_price": avg_nav,
                        "unrealized_pnl": unrealized_pnl,
                    }],
                ))
            except ValidationError as exc:
                logger.error("MutualFundSync schema error for %s: %s", symbol, exc)

        logger.info("MutualFundSync: yielding %d assets", len(results))
        return results
