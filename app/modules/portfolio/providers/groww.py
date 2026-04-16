
import logging
from typing import List, Dict

from pydantic import ValidationError
from growwapi import GrowwAPI

from app.shared.interfaces import AssetSource, AssetPayload
from app.core.config import settings


class GrowwSync(AssetSource):
    def __init__(self):
        self.logger = logging.getLogger("Groww")
        self.api_key = settings.groww_api_key
        self.api_secret = settings.groww_api_secret
        self.api = None
        self._authenticate()

    @property
    def provider_name(self) -> str:
        return "Groww"

    def validate_credentials(self) -> None:
        """Raise ValueError listing every missing Groww credential."""
        missing = []
        if not self.api_key or self.api_key.lower() == "none":
            missing.append("GROWW_API_KEY")
        if not self.api_secret or self.api_secret.lower() == "none":
            missing.append("GROWW_API_SECRET")
        if missing:
            raise ValueError(f"Missing Groww credentials: {', '.join(missing)}")
        if self.api is None:
            raise ValueError("Groww authentication failed — check GROWW_API_KEY / GROWW_API_SECRET.")

    def _authenticate(self):
        if not self.api_key or not self.api_secret or self.api_key.lower() == "none":
            self.logger.warning("🚫 Groww Plugin Disabled: Missing keys.")
            return
        try:
            self.api = GrowwAPI(GrowwAPI.get_access_token(api_key=self.api_key, secret=self.api_secret))
            self.logger.info("✅ Groww Plugin: Authenticated")
        except Exception as e:
            self.logger.error(f"❌ Groww Auth Failed: {e}")

    def fetch_holdings(self) -> List[AssetPayload]:
        if not self.api:
            return []

        raw_holdings = []
        self.logger.info("📡 Fetching active positions from Groww...")

        # 1. EQUITIES (Spot)
        try:
            stock_res = self.api.get_holdings_for_user(timeout=10)
            for item in stock_res.get("holdings", []):
                qty = float(item.get("quantity", 0))
                if qty <= 0:
                    continue
                raw_holdings.append({
                    "symbol": f"{item.get('trading_symbol')}.NS",
                    "qty": qty,
                    "avg_buy_price": float(item.get("avg_price", 0.0)),
                    "source": "Groww (Equity)",
                    "type": "equity_spot"
                })
        except Exception as e:
            self.logger.error(f"Groww Stocks Error: {e}")

        # 2. MUTUAL FUNDS (Multiple Fallbacks)
        try:
            mf_res = self.api._session.get("https://groww.in/v1/api/mf_portfolio/v1/dashboard/investments").json()
            if 'investments' not in mf_res:
                mf_res = self.api._session.get(
                    "https://groww.in/v1/api/mutual_funds_dashboard/v1/app/user/investments").json()

            for mf in mf_res.get('investments', []):
                scheme_name = mf.get('scheme_name', 'UNKNOWN_MF')
                # API may return 'units' or 'nav_units' depending on endpoint version
                qty = float(mf.get('units') or mf.get('nav_units', 0))
                if qty <= 0:
                    continue
                invested = float(mf.get('invested_amount', 0.0))
                avg_nav = invested / qty if qty > 0 and invested > 0 else 0.0
                raw_holdings.append({
                    "symbol": f"{scheme_name[:20].replace(' ', '_')}_MF",
                    "qty": qty,
                    "avg_buy_price": avg_nav,
                    "source": "Groww (MF)",
                    "type": "mutual_fund"
                })
        except Exception as e:
            self.logger.debug(f"Groww MF skipped: {e}")

        # 3. FUTURES & OPTIONS
        try:
            fo_res = self.api._session.get(
                "https://groww.in/v1/api/stocks_fo_data/v1/derivatives/user/positions").json()
            for pos in fo_res.get('positions', []):
                qty = float(pos.get('net_qty', 0))
                if qty != 0:
                    sym = pos.get('trading_symbol', 'UNKNOWN_FO')
                    raw_holdings.append({
                        "symbol": f"{sym}.FO",
                        "qty": qty,
                        "avg_buy_price": 0.0,
                        "source": "Groww (F&O)",
                        "type": "equity_fo_short" if qty < 0 else "equity_fo_long"
                    })
        except Exception as e:
            self.logger.debug(f"Groww F&O skipped: {e}")

        # Group by symbol and aggregate into positions[]
        assets_map: Dict[str, Dict] = {}

        for h in raw_holdings:
            symbol = h["symbol"]
            if symbol not in assets_map:
                assets_map[symbol] = {
                    "symbol": symbol,
                    "type": h.get("type", "equity").split("_")[0],  # Extract base type
                    "qty": 0.0,
                    "avg_buy_price": 0.0,
                    "unrealized_pnl": 0.0,
                    "positions": [],
                    "sources": set(),
                }

            # Infer market_type and position_type from source and type
            source_tag = h["source"]
            asset_type = h.get("type", "equity_spot")

            market_type = "spot"
            if "F&O" in source_tag:
                market_type = "futures"

            position_type = "long"
            if "short" in asset_type.lower():
                position_type = "short"

            position = {
                "source": source_tag,
                "market_type": market_type,
                "position_type": position_type,
                "qty": float(h["qty"]),
                "avg_buy_price": float(h.get("avg_buy_price", 0.0)),
                "unrealized_pnl": float(h.get("unrealized_pnl", 0.0)),
            }

            assets_map[symbol]["positions"].append(position)
            assets_map[symbol]["sources"].add(source_tag)
            assets_map[symbol]["qty"] += h["qty"]
            assets_map[symbol]["unrealized_pnl"] += h.get("unrealized_pnl", 0.0)

        # Compute aggregated avg_buy_price (long positions only)
        for symbol, asset in assets_map.items():
            long_qty = sum(p["qty"] for p in asset["positions"] if p["qty"] > 0)
            if long_qty > 0:
                total_cost = sum(p["avg_buy_price"] * p["qty"] for p in asset["positions"] if p["qty"] > 0)
                asset["avg_buy_price"] = total_cost / long_qty

            asset["source"] = " / ".join(sorted(asset["sources"])) if asset["sources"] else "Unknown"
            del asset["sources"]

        # Validate against contract
        validated = []
        for symbol, asset in assets_map.items():
            try:
                validated.append(AssetPayload(**asset))
            except ValidationError as e:
                self.logger.error(f"Schema violation in GrowwSync for {symbol}: {e}")

        self.logger.info(f"✅ Groww payload compiled. Yielding {len(validated)} assets to orchestrator.")
        return validated
