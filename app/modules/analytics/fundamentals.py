import pandas as pd
import numpy as np
import logging

from app.core.context_cache import smart_cache, TTL_FUNDAMENTALS

logger = logging.getLogger("analytics.fundamentals")


class FundamentalsEngine:
    """Calculates Deep Value, Solvency (Altman Z), Efficiency, and Delivery Metrics."""

    def __init__(self):
        self.logger = logger

    def _sanitize_value(self, val, default=0.0):
        if val is None:
            return default
        try:
            fval = float(val)
        except (TypeError, ValueError):
            self.logger.debug("_sanitize_value: cannot convert %r to float, using default=%s", val, default)
            return default
        if np.isnan(fval) or pd.isna(fval):
            self.logger.debug("_sanitize_value: NaN detected, using default=%s", default)
            return default
        if np.isinf(fval):
            clamped = 999999999.0 if fval > 0 else -999999999.0
            self.logger.debug("_sanitize_value: Inf detected (sign=%+.0f), clamping to %s", fval, clamped)
            return clamped
        return fval

    def _get_nse_delivery(self, symbol: str):
        """Delivery data sourced from repository (not fetched from NSE API)."""
        self.logger.debug("_get_nse_delivery: symbol=%s — delivery data not wired, returning N/A", symbol)
        return "N/A"

    def _calculate_graham_number(self, eps: float, bvps: float) -> float:
        eps = self._sanitize_value(eps)
        bvps = self._sanitize_value(bvps)
        self.logger.debug("_calculate_graham_number: eps=%.4f bvps=%.4f", eps, bvps)

        if eps <= 0 or bvps <= 0:
            self.logger.debug("_calculate_graham_number: eps or bvps ≤ 0 → graham_number=0.0")
            return 0.0

        graham = round(np.sqrt(22.5 * eps * bvps), 2)
        self.logger.debug("_calculate_graham_number: sqrt(22.5 * %.4f * %.4f) = %.2f", eps, bvps, graham)
        return graham

    def _calculate_altman_z(self, info: dict) -> float:
        try:
            assets      = self._sanitize_value(info.get('totalAssets', 1))
            liabilities = self._sanitize_value(info.get('totalDebt', 0))
            ebitda      = self._sanitize_value(info.get('ebitda', 0))
            market_cap  = self._sanitize_value(info.get('marketCap', 0))
            revenue     = self._sanitize_value(info.get('totalRevenue', 0))

            self.logger.debug(
                "_calculate_altman_z: assets=%.0f liabilities=%.0f ebitda=%.0f market_cap=%.0f revenue=%.0f",
                assets, liabilities, ebitda, market_cap, revenue
            )

            working_capital    = assets - liabilities
            retained_earnings  = ebitda * 0.5

            A = working_capital / assets
            B = retained_earnings / assets
            C = ebitda / assets
            D = market_cap / liabilities if liabilities > 0 else 5.0
            E = revenue / assets

            self.logger.debug(
                "_calculate_altman_z: A(WC/TA)=%.3f B(RE/TA)=%.3f C(EBITDA/TA)=%.3f D(MktCap/Debt)=%.3f E(Rev/TA)=%.3f",
                A, B, C, D, E
            )

            z = round((1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (0.999 * E), 2)
            self.logger.debug("_calculate_altman_z: Z-score = %.2f", z)
            return z
        except Exception as exc:
            self.logger.warning("_calculate_altman_z: calculation failed: %s", exc)
            return 0.0

    def analyze_asset(self, symbol: str, asset_type: str) -> dict:
        self.logger.info("analyze_asset: symbol=%s asset_type=%s", symbol, asset_type)

        cache_key = f"fund_{symbol}"
        cached = smart_cache.get(cache_key)
        if cached is not None:
            self.logger.debug("analyze_asset: cache HIT key=%s", cache_key)
            return cached

        self.logger.debug("analyze_asset: cache MISS key=%s — computing fundamentals", cache_key)

        metrics = {
            "pe_ratio": "N/A", "52w_high": "N/A", "52w_low": "N/A",
            "delivery_pct": "N/A", "graham_number": "N/A", "altman_z_score": "N/A",
            "dcf_value": "N/A", "fundamental_health": "UNRATED",
            "fundamental_score": 50,
            "revenue_growth": "N/A",
            "debt_ratio": "N/A",
        }

        if 'crypto' in asset_type or 'mutual_fund' in asset_type or symbol == "GOLD":
            self.logger.debug(
                "analyze_asset: symbol=%s skipped (asset_type=%s not supported for fundamentals) — returning neutral",
                symbol, asset_type
            )
            smart_cache.set(cache_key, metrics, expire=TTL_FUNDAMENTALS)
            return metrics

        # All fundamental data must be sourced from repositories, not external APIs
        self.logger.debug(
            "analyze_asset: symbol=%s — fundamental data repository not wired yet, returning neutral metrics",
            symbol
        )
        smart_cache.set(cache_key, metrics, expire=TTL_FUNDAMENTALS)
        self.logger.debug("analyze_asset: cached neutral metrics for symbol=%s ttl=%s", symbol, TTL_FUNDAMENTALS)
        return metrics
