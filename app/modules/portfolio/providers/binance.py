import time
import hmac
import hashlib
import logging
import requests
from urllib.parse import urlencode
from typing import Dict, List, Optional

from app.shared.interfaces import AssetSource, AssetPayload
from app.core.config import settings
from pydantic import ValidationError


class BinanceIntelligenceClient(AssetSource):
    @property
    def provider_name(self) -> str:
        return "Binance"

    def __init__(self, cred_manager=None):
        self.logger = logging.getLogger("BinanceREST")
        self.cred_manager = cred_manager

        # Fetch credentials
        if cred_manager:
            self.api_key, self.api_secret = cred_manager.get_binance_credentials()
        else:
            self.api_key = settings.binance_api_key
            self.api_secret = settings.binance_api_secret

        self.session = requests.Session()
        self.session.headers.update({"X-MBX-APIKEY": self.api_key or "", "Content-Type": "application/json"})

        self.base_url = "https://api.binance.com"
        self.fapi_url = "https://fapi.binance.com"   # USD-M Futures
        self.dapi_url = "https://dapi.binance.com"   # COIN-M Futures

    def validate_credentials(self) -> None:
        """Raise ValueError listing every missing Binance credential."""
        missing = []
        if not self.api_key or self.api_key.lower() == "none":
            missing.append("BINANCE_API_KEY")
        if not self.api_secret or self.api_secret.lower() == "none":
            missing.append("BINANCE_API_SECRET")
        if missing:
            raise ValueError(f"Missing Binance credentials: {', '.join(missing)}")

    def _sign_request(self, params: dict = None) -> str:
        if params is None:
            params = {}
        params["timestamp"] = int(time.time() * 1000)
        query_string = urlencode(params)
        signature = hmac.new(
            self.api_secret.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return f"{query_string}&signature={signature}"

    def fetch_holdings(self) -> List[AssetPayload]:
        if not self.api_key or not self.api_secret or self.api_key.lower() == "none":
            self.logger.warning("Binance REST Plugin Disabled: Missing keys.")
            return []

        balances: List[Dict] = []

        # ─────────────────────────────────────────────────────────────────────
        # 1.  SPOT WALLET & FLEXIBLE EARN
        # ─────────────────────────────────────────────────────────────────────
        try:
            spot_url = f"{self.base_url}/api/v3/account?{self._sign_request()}"
            spot_data = self.session.get(spot_url, timeout=10).json()

            for item in spot_data.get("balances", []):
                qty = float(item["free"]) + float(item["locked"])
                if qty <= 0.00000001:
                    continue

                raw_name = item["asset"]
                clean_name = raw_name
                asset_type = "crypto_spot"
                source_tag = "Binance (Spot)"

                if raw_name.startswith("LD") and len(raw_name) > 2:
                    clean_name = raw_name[2:]
                    asset_type = "crypto_earn_flexible"
                    source_tag = "Binance (Flex Earn)"
                elif raw_name.startswith("BN") and raw_name not in ("BNB", "BNC"):
                    clean_name = raw_name[2:]
                    asset_type = "crypto_earn_locked"
                    source_tag = "Binance (Locked Earn)"

                if clean_name in ("USDT", "USDC", "FDUSD", "BUSD", "EUR"):
                    asset_type = "crypto_cash"

                mapping = {"POL": "MATIC", "S": "SONIC"}
                clean_name = mapping.get(clean_name, clean_name)

                balances.append({"symbol": f"{clean_name}-USD", "qty": qty, "source": source_tag, "type": asset_type})
        except Exception as e:
            self.logger.error(f"Binance Spot API Error: {e}")

        # ─────────────────────────────────────────────────────────────────────
        # 2.  LOCKED STAKING (Simple Earn)
        # ─────────────────────────────────────────────────────────────────────
        try:
            earn_url = f"{self.base_url}/sapi/v1/simple-earn/locked/position?{self._sign_request()}"
            earn_data = self.session.get(earn_url, timeout=10).json()

            for item in earn_data.get("rows", []):
                qty = float(item["totalAmount"])
                if qty > 0:
                    balances.append({
                        "symbol": f"{item['asset']}-USD",
                        "qty": qty,
                        "source": "Binance (Locked Earn)",
                        "type": "crypto_earn_locked",
                    })
        except Exception as e:
            self.logger.debug(f"Binance Locked Earn skipped: {e}")

        # ─────────────────────────────────────────────────────────────────────
        # 3.  USD-M FUTURES (USDⓈ-M)
        #     Account summary: wallet balance + net PnL
        #     Positions: individual open contracts (positionRisk)
        # ─────────────────────────────────────────────────────────────────────
        try:
            fapi_account_url = f"{self.fapi_url}/fapi/v2/account?{self._sign_request()}"
            fapi_account = self.session.get(fapi_account_url, timeout=10).json()

            wallet_balance   = float(fapi_account.get("totalWalletBalance",   0) or 0)
            margin_balance   = float(fapi_account.get("totalMarginBalance",   0) or 0)
            total_unreal_pnl = float(fapi_account.get("totalUnrealizedProfit", 0) or 0)

            # Report the futures USDT wallet as a distinct entry so the ledger
            # shows "Futures Margin" separately from Spot USDT.
            if wallet_balance > 0.001:
                balances.append({
                    "symbol":          "USDT-USD",
                    "qty":             wallet_balance,
                    "avg_buy_price":   1.0,
                    "unrealized_pnl":  total_unreal_pnl,          # Net PnL across all positions
                    "source":          f"Binance (USDⓈ-M Margin) · Bal: ${wallet_balance:.2f} · PnL: ${total_unreal_pnl:.2f}",
                    "type":            "crypto_futures_margin",
                })
                self.logger.info(
                    f"USD-M Futures — Wallet: ${wallet_balance:.4f} | "
                    f"Margin: ${margin_balance:.4f} | PnL: ${total_unreal_pnl:.4f}"
                )
        except Exception as e:
            self.logger.debug(f"Binance USDⓈ-M account summary skipped: {e}")

        try:
            fapi_pos_url = f"{self.fapi_url}/fapi/v2/positionRisk?{self._sign_request()}"
            fapi_pos = self.session.get(fapi_pos_url, timeout=10).json()

            for pos in fapi_pos:
                qty = float(pos["positionAmt"])
                if qty == 0:
                    continue
                clean_sym = pos["symbol"].replace("USDT", "").replace("BUSD", "")
                entry_price      = float(pos.get("entryPrice", 0.0) or 0.0)
                unrealized_pnl   = float(pos.get("unrealizedProfit", 0.0) or 0.0)
                balances.append({
                    "symbol":         f"{clean_sym}-USD",
                    "qty":            qty,
                    "avg_buy_price":  entry_price,
                    "unrealized_pnl": unrealized_pnl,
                    "source":         "Binance (USDⓈ-M Futures)",
                    "type":           "crypto_futures_short" if qty < 0 else "crypto_futures_long",
                })
        except Exception as e:
            self.logger.debug(f"Binance USDⓈ-M positions skipped: {e}")

        # ─────────────────────────────────────────────────────────────────────
        # 4.  COIN-M FUTURES (COIN-M)
        #     Account: per-coin wallet balances (ETH, BTC, …)
        #     Positions: individual open contracts
        # ─────────────────────────────────────────────────────────────────────
        try:
            dapi_account_url = f"{self.dapi_url}/dapi/v1/account?{self._sign_request()}"
            dapi_account = self.session.get(dapi_account_url, timeout=10).json()

            for asset_entry in dapi_account.get("assets", []):
                wallet_bal = float(asset_entry.get("walletBalance",    0) or 0)
                unreal_pnl = float(asset_entry.get("unrealizedProfit", 0) or 0)
                coin       = asset_entry.get("asset", "")
                if wallet_bal <= 0.000001 or not coin:
                    continue
                balances.append({
                    "symbol":         f"{coin}-USD",
                    "qty":            wallet_bal,
                    "avg_buy_price":  0.0,
                    "unrealized_pnl": unreal_pnl,
                    "source":         f"Binance (COIN-M Margin) · Bal: {wallet_bal:.6f} {coin} · PnL: {unreal_pnl:.6f}",
                    "type":           "crypto_futures_margin",
                })
                self.logger.info(f"COIN-M — {coin}: Wallet {wallet_bal:.6f} | PnL {unreal_pnl:.6f}")
        except Exception as e:
            self.logger.debug(f"Binance COIN-M account summary skipped: {e}")

        try:
            dapi_pos_url = f"{self.dapi_url}/dapi/v1/positionRisk?{self._sign_request()}"
            dapi_pos = self.session.get(dapi_pos_url, timeout=10).json()

            for pos in dapi_pos:
                qty = float(pos["positionAmt"])
                if qty == 0:
                    continue
                # COIN-M symbols: BTCUSD_PERP, ETHUSD_220930 → BTC, ETH
                raw_sym = pos["symbol"]
                base    = raw_sym.split("_")[0]            # e.g. BTCUSD
                base    = base.rstrip("USD") if base.endswith("USD") else base  # → BTC
                entry_price    = float(pos.get("entryPrice",      0.0) or 0.0)
                unrealized_pnl = float(pos.get("unrealizedProfit", 0.0) or 0.0)
                balances.append({
                    "symbol":         f"{base}-USD",
                    "qty":            qty,
                    "avg_buy_price":  entry_price,
                    "unrealized_pnl": unrealized_pnl,
                    "source":         "Binance (COIN-M Futures)",
                    "type":           "crypto_futures_short" if qty < 0 else "crypto_futures_long",
                })
        except Exception as e:
            self.logger.debug(f"Binance COIN-M positions skipped: {e}")

        # ─────────────────────────────────────────────────────────────────────
        # Group by symbol and aggregate into positions[] structure
        # ─────────────────────────────────────────────────────────────────────
        assets_map: Dict[str, Dict] = {}

        for b in balances:
            symbol = b["symbol"]
            if symbol not in assets_map:
                assets_map[symbol] = {
                    "symbol": symbol,
                    "type": "crypto",
                    "qty": 0.0,
                    "avg_buy_price": 0.0,
                    "unrealized_pnl": 0.0,
                    "positions": [],
                    "sources": set(),
                }

            # Infer market_type and position_type from source and asset_type
            source_tag = b["source"]
            asset_type = b.get("type", "crypto_spot")

            market_type = "spot"
            if "Futures" in source_tag:
                market_type = "futures"
            elif "Earn" in source_tag:
                market_type = "earn"

            position_type = "long"
            if "short" in asset_type.lower():
                position_type = "short"
            elif "flexible" in asset_type.lower():
                position_type = "flexible"
            elif "locked" in asset_type.lower():
                position_type = "locked"

            position = {
                "source": source_tag,
                "market_type": market_type,
                "position_type": position_type,
                "qty": float(b["qty"]),
                "avg_buy_price": float(b.get("avg_buy_price", 0.0)),
                "unrealized_pnl": float(b.get("unrealized_pnl", 0.0)),
            }

            assets_map[symbol]["positions"].append(position)
            assets_map[symbol]["sources"].add(source_tag)
            assets_map[symbol]["qty"] += b["qty"]
            assets_map[symbol]["unrealized_pnl"] += b.get("unrealized_pnl", 0.0)

        # Compute aggregated avg_buy_price (long positions only)
        for symbol, asset in assets_map.items():
            long_qty = sum(p["qty"] for p in asset["positions"] if p["qty"] > 0)
            if long_qty > 0:
                total_cost = sum(p["avg_buy_price"] * p["qty"] for p in asset["positions"] if p["qty"] > 0)
                asset["avg_buy_price"] = total_cost / long_qty

            # Aggregate source
            asset["source"] = " / ".join(sorted(asset["sources"])) if asset["sources"] else "Unknown"
            del asset["sources"]

        # Validate against AssetPayload contract
        validated: List[AssetPayload] = []
        for symbol, asset in assets_map.items():
            try:
                validated.append(AssetPayload(**asset))
            except ValidationError as e:
                self.logger.error(f"Schema violation in Binance for {symbol}: {e}")

        return validated
