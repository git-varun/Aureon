"""EPS valuation: accumulated corpus from accrual ledger or contribution estimate.

Corpus = 8.33% × min(pensionable_salary, 15000) × months_of_service.
Projected monthly pension (display-only) = (pensionable_salary × service_years) / 70.
"""

import logging
from datetime import date
from typing import Optional

from app.shared.interfaces import ValuationProvider

logger = logging.getLogger("valuation.eps")

_EPS_CAP = 15_000.0  # EPFO statutory salary cap for EPS contribution
_EPS_RATE = 0.0833   # 8.33% employer contribution to EPS


class EPSValuationProvider(ValuationProvider):
    provider_name = "eps_valuation"

    def compute_current_value(self, asset_metadata: dict, accrual_history: list) -> float:
        """Return latest accrual running_total or estimate from contributions × months."""
        if accrual_history:
            latest = max(accrual_history, key=lambda r: r.get("period_end", ""))
            running_total = latest.get("running_total")
            if running_total is not None:
                return float(running_total)

        return self._estimate_corpus(asset_metadata)

    def compute_yield(self, asset_metadata: dict) -> Optional[float]:
        return None  # EPS has no stated interest rate visible to the employee

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _estimate_corpus(self, meta: dict) -> float:
        monthly = self._monthly_contribution(meta)
        months = self._service_months(meta)
        return round(monthly * months, 2)

    @staticmethod
    def _monthly_contribution(meta: dict) -> float:
        override = float(meta.get("employer_eps_monthly") or 0)
        if override > 0:
            return override
        salary = float(meta.get("pensionable_salary") or 0)
        capped = min(salary, _EPS_CAP)
        return round(capped * _EPS_RATE, 2)

    @staticmethod
    def _service_months(meta: dict) -> float:
        if meta.get("known_service_years"):
            return float(meta["known_service_years"]) * 12
        doj = meta.get("date_of_joining")
        if not doj:
            return 0.0
        try:
            start = date.fromisoformat(str(doj))
            end_str = meta.get("date_of_exit")
            end = date.fromisoformat(str(end_str)) if end_str else date.today()
            delta = (end.year - start.year) * 12 + (end.month - start.month)
            return max(0.0, float(delta))
        except (ValueError, TypeError):
            return 0.0

    @staticmethod
    def projected_monthly_pension(meta: dict) -> float:
        """Display-only. Formula: (pensionable_salary × service_years) / 70."""
        salary = min(float(meta.get("pensionable_salary") or 0), _EPS_CAP)
        if meta.get("known_service_years"):
            years = float(meta["known_service_years"])
        else:
            doj = meta.get("date_of_joining")
            if not doj:
                return 0.0
            try:
                start = date.fromisoformat(str(doj))
                end_str = meta.get("date_of_exit")
                end = date.fromisoformat(str(end_str)) if end_str else date.today()
                months = (end.year - start.year) * 12 + (end.month - start.month)
                years = months / 12
            except (ValueError, TypeError):
                return 0.0
        return round((salary * years) / 70, 2)
