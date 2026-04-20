"""
Zerodha broker source via Kite Connect API.

Credential model
----------------
Static (set once in .env, never change):
  ZERODHA_API_KEY     — from Zerodha developer console
  ZERODHA_API_SECRET  — from Zerodha developer console

Daily rotating (one required at runtime, resets at 6 AM):
  ZERODHA_ACCESS_TOKEN  — cached token from a previous generate_session() call.
  ZERODHA_REQUEST_TOKEN — obtained fresh from today's login redirect (valid minutes).
                          The provider exchanges it for an access_token automatically.

Daily login flow (when access_token has expired):
  1. Visit login_url in a browser
  2. Copy the request_token from the redirect URL query string
  3. Set ZERODHA_REQUEST_TOKEN=<token> (env var or pass to task)
  4. The provider calls generate_session(request_token, api_secret) → access_token
  5. Optionally persist the printed access_token as ZERODHA_ACCESS_TOKEN for tomorrow

Holdings vs lot-level cost basis:
  Kite Connect provides avg_buy_price per holding (accurate weighted average).
  Per-lot buy dates are NOT available via API. For STCG/LTCG tax computation,
  import Zerodha's Console P&L CSV via a dedicated parser (future work).
"""

import logging
import os
from typing import Dict, List, Optional

from pydantic import ValidationError

from app.core.config import settings
from app.shared.interfaces import AssetSource, AssetPayload

_KITE_LOGIN_BASE = "https://kite.zerodha.com/connect/login?v=3"


def _read_cred(value: Optional[str]) -> str:
    """Normalise a credential value: strip whitespace, treat literal 'none' as absent."""
    normalised = (value or "").strip()
    return "" if normalised.lower() == "none" else normalised


class _Creds:
    """Single read of all Zerodha credentials from settings + env.

    Static platform credentials (set once in .env):
      api_key, api_secret  — issued by Zerodha platform, never change.

    Daily rotating tokens (one of these must be present at runtime):
      access_token   — cached from a previous generate_session(), valid until 6 AM.
      request_token  — just obtained from the login-URL redirect; valid for minutes.
                       Will be exchanged for a fresh access_token via generate_session().
    """

    __slots__ = ("api_key", "api_secret", "access_token", "request_token")

    def __init__(self, cred_manager=None):
        if cred_manager:
            # Fetch from credential manager (database or env)
            api_key, api_secret, access_token, request_token = cred_manager.get_zerodha_credentials()
            self.api_key = _read_cred(api_key)
            self.api_secret = _read_cred(api_secret)
            self.access_token = _read_cred(access_token)
            self.request_token = _read_cred(request_token)
        else:
            # Original behavior: read from settings and env
            self.api_key = _read_cred(settings.zerodha_api_key)
            self.api_secret = _read_cred(settings.zerodha_api_secret)
            self.access_token = _read_cred(settings.zerodha_access_token)
            self.request_token = _read_cred(os.getenv("ZERODHA_REQUEST_TOKEN"))

    @property
    def has_static_creds(self) -> bool:
        """Both platform credentials are present."""
        return bool(self.api_key and self.api_secret)

    @property
    def has_access_token(self) -> bool:
        """A cached access token is available (may still be expired — kite.profile() will tell)."""
        return bool(self.access_token)

    @property
    def has_request_token(self) -> bool:
        """A fresh request_token from today's login redirect is available."""
        return bool(self.request_token)

    @property
    def is_configured(self) -> bool:
        """True when enough credentials are present to attempt authentication."""
        return self.has_static_creds and (self.has_access_token or self.has_request_token)


class ZerodhaSync(AssetSource):
    def __init__(self, cred_manager=None):
        self.logger = logging.getLogger("Zerodha")
        self.cred_manager = cred_manager
        self._kite = None
        self._authenticate()

    @property
    def provider_name(self) -> str:
        return "Zerodha"

    @property
    def login_url(self) -> str:
        creds = _Creds(self.cred_manager)
        api_key = creds.api_key
        return f"{_KITE_LOGIN_BASE}&api_key={api_key}" if api_key else ""

    def validate_credentials(self) -> None:
        """Raise ValueError listing every missing or invalid Zerodha credential."""
        creds = _Creds(self.cred_manager)
        missing: List[str] = []

        # Static platform credentials — must always be present in .env
        if not creds.api_key:
            missing.append("ZERODHA_API_KEY")
        if not creds.api_secret:
            missing.append("ZERODHA_API_SECRET")

        # Daily token — need at least one of these at runtime
        if not creds.has_access_token and not creds.has_request_token:
            missing.append(
                "ZERODHA_ACCESS_TOKEN or ZERODHA_REQUEST_TOKEN — "
                "visit the login URL, copy the request_token from the redirect, "
                "then set ZERODHA_REQUEST_TOKEN=<token> before starting the sync"
            )

        if missing:
            raise ValueError(
                f"Missing Zerodha credentials: {'; '.join(missing)}. "
                f"Login URL: {self.login_url or '(set ZERODHA_API_KEY first)'}"
            )

        if self._kite is None:
            raise ValueError(
                "Zerodha authentication failed — access_token may be expired (resets at 6 AM). "
                f"Visit {self.login_url} to get a new request_token, "
                "then set ZERODHA_REQUEST_TOKEN=<token> and retry."
            )

    def _authenticate(self) -> None:
        creds = _Creds(self.cred_manager)

        if not creds.is_configured:
            # Silently skip — validate_credentials() called by the Celery task will
            # emit a precise, actionable error message for each missing field.
            self.logger.debug("Zerodha skipped: static or daily credentials not configured.")
            return

        try:
            from kiteconnect import KiteConnect
        except ImportError:
            self.logger.error("kiteconnect not installed. Run: pip install kiteconnect")
            return

        try:
            kite = KiteConnect(api_key=creds.api_key)

            if creds.has_access_token:
                # Use the cached token from a previous session.
                kite.set_access_token(creds.access_token)
                token_mode = "cached_access_token"
            else:
                # Exchange today's request_token for a fresh access_token.
                # api_secret is always present (static platform credential).
                data = kite.generate_session(creds.request_token, api_secret=creds.api_secret)
                fresh_token = str(data.get("access_token", "")).strip()
                if not fresh_token:
                    raise ValueError("generate_session returned no access_token")
                kite.set_access_token(fresh_token)
                token_mode = "generated_from_request_token"
                self.logger.info(
                    "Zerodha access token generated from request_token. "
                    "Set ZERODHA_ACCESS_TOKEN=%s in .env to skip the login step tomorrow.",
                    fresh_token,
                )

            kite.profile()  # liveness check — raises if token is expired or invalid
            self._kite = kite
            self.logger.info("Zerodha authenticated via %s", token_mode)

        except Exception as e:
            self.logger.error(
                "Zerodha auth failed — token expired or invalid. "
                "Visit %s to get a new request_token: %s",
                self.login_url,
                e,
            )

    def fetch_holdings(self) -> List[AssetPayload]:
        if not self._kite:
            return []

        raw_holdings = []
        self.logger.info("Fetching active positions from Zerodha...")

        # 1. LONG-TERM HOLDINGS (CNC — equity delivery)
        try:
            for h in self._kite.holdings():
                qty = float(h.get('quantity', 0)) + float(h.get('t1_quantity', 0))
                if qty <= 0:
                    continue
                exchange = h.get('exchange', 'NSE').upper()
                suffix = '.BO' if exchange == 'BSE' else '.NS'
                raw_holdings.append({
                    "symbol": f"{h['tradingsymbol']}{suffix}",
                    "qty": qty,
                    "avg_buy_price": float(h.get('average_price', 0.0)),
                    "source": "Zerodha (Equity)",
                    "type": "equity_spot",
                })
        except Exception as e:
            self.logger.error(f"Zerodha holdings error: {e}")

        # 2. OPEN POSITIONS (F&O, intraday, NRML carry-forward)
        try:
            positions = self._kite.positions().get('net', [])
            for pos in positions:
                qty = float(pos.get('quantity', 0))
                if qty == 0:
                    continue

                exchange = pos.get('exchange', 'NSE')
                symbol = pos['tradingsymbol']
                product = pos.get('product', '')

                if exchange in ('NFO', 'BFO'):
                    sym_tag = f"{symbol}.FO"
                    asset_type = "equity_fo_short" if qty < 0 else "equity_fo_long"
                    source_tag = "Zerodha (F&O)"
                else:
                    sym_tag = f"{symbol}.NS"
                    asset_type = "equity_spot"
                    source_tag = f"Zerodha ({product})"

                raw_holdings.append({
                    "symbol": sym_tag,
                    "qty": qty,
                    "avg_buy_price": float(pos.get('average_price', 0.0)),
                    "source": source_tag,
                    "type": asset_type,
                })
        except Exception as e:
            self.logger.debug(f"Zerodha positions skipped: {e}")

        # Group by symbol and aggregate into positions[]
        assets_map: Dict[str, Dict] = {}

        for h in raw_holdings:
            symbol = h["symbol"]
            if symbol not in assets_map:
                assets_map[symbol] = {
                    "symbol": symbol,
                    "type": "equity",
                    "qty": 0.0,
                    "avg_buy_price": 0.0,
                    "unrealized_pnl": 0.0,
                    "positions": [],
                    "sources": set(),
                }

            source_tag = h["source"]
            asset_type = h.get("type", "equity_spot")

            market_type = "futures" if "F&O" in source_tag else "spot"
            position_type = "short" if "short" in asset_type.lower() else "long"

            assets_map[symbol]["positions"].append({
                "source": source_tag,
                "market_type": market_type,
                "position_type": position_type,
                "qty": float(h["qty"]),
                "avg_buy_price": float(h.get("avg_buy_price", 0.0)),
                "unrealized_pnl": float(h.get("unrealized_pnl", 0.0)),
            })
            assets_map[symbol]["sources"].add(source_tag)
            assets_map[symbol]["qty"] += h["qty"]
            assets_map[symbol]["unrealized_pnl"] += h.get("unrealized_pnl", 0.0)

        # Compute aggregated avg_buy_price (long positions only)
        for symbol, asset in assets_map.items():
            long_qty = sum(p["qty"] for p in asset["positions"] if p["qty"] > 0)
            if long_qty > 0:
                total_cost = sum(
                    p["avg_buy_price"] * p["qty"] for p in asset["positions"] if p["qty"] > 0
                )
                asset["avg_buy_price"] = total_cost / long_qty

            asset["source"] = " / ".join(sorted(asset["sources"])) if asset["sources"] else "Unknown"
            del asset["sources"]

        validated = []
        for symbol, asset in assets_map.items():
            try:
                validated.append(AssetPayload(**asset))
            except ValidationError as e:
                self.logger.error(f"Schema violation in ZerodhaSync for {symbol}: {e}")

        self.logger.info(f"zerodha payload compiled: {len(validated)} assets")
        return validated
