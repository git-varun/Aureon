"""
Indian Capital Gains Tax Engine (FY 2024-25 rates, post-Budget 2024).

Equity / Equity MFs:
  STCG (held ≤ 1 year)  → 20%
  LTCG (held > 1 year)  → 12.5% on gains exceeding ₹1,25,000 exemption per FY

Crypto / VDAs:
  Always STCG at flat 30%. No LTCG benefit. Losses cannot offset other income.

Scope: unrealized gain estimates only. Does not account for STT, brokerage,
or intra-FY exemption already consumed by other sales.
"""

import logging
from datetime import date
from typing import List, Dict


STCG_EQUITY_RATE = 0.20
LTCG_EQUITY_RATE = 0.125
LTCG_EQUITY_EXEMPTION_INR = 125_000   # ₹1.25L per financial year
CRYPTO_TAX_RATE = 0.30

logger = logging.getLogger("TaxService")


def classify_lot(buy_date_str: str, asset_type: str) -> str:
    """Returns 'LTCG' or 'STCG' for a lot based on asset type and holding period."""
    if 'crypto' in asset_type:
        return 'STCG'
    held_days = (date.today() - date.fromisoformat(buy_date_str)).days
    return 'LTCG' if held_days > 365 else 'STCG'


def compute_lot_gain(lot: dict, current_price_inr: float) -> dict:
    """
    Computes unrealized gain and estimated tax for a single tax lot.
    current_price_inr must already be in INR (caller handles FX for crypto).
    Note: LTCG exemption is applied per-lot here for display purposes.
    For accurate cross-lot aggregation use compute_portfolio_tax_summary().
    """
    qty = lot['qty']
    buy_price = lot['buy_price']
    asset_type = lot.get('asset_type', 'equity_spot')
    buy_date_str = lot['buy_date']

    cost_basis = qty * buy_price
    current_value = qty * current_price_inr
    unrealized_gain = current_value - cost_basis
    holding_days = (date.today() - date.fromisoformat(buy_date_str)).days
    tax_type = classify_lot(buy_date_str, asset_type)

    if unrealized_gain <= 0:
        estimated_tax = 0.0
    elif 'crypto' in asset_type:
        estimated_tax = unrealized_gain * CRYPTO_TAX_RATE
    elif tax_type == 'LTCG':
        taxable = max(0.0, unrealized_gain - LTCG_EQUITY_EXEMPTION_INR)
        estimated_tax = taxable * LTCG_EQUITY_RATE
    else:
        estimated_tax = unrealized_gain * STCG_EQUITY_RATE

    return {
        'lot_id': lot['lot_id'],
        'symbol': lot['symbol'],
        'broker': lot.get('broker', 'Unknown'),
        'buy_date': buy_date_str,
        'holding_days': holding_days,
        'qty': qty,
        'buy_price': round(buy_price, 2),
        'cost_basis': round(cost_basis, 2),
        'current_value': round(current_value, 2),
        'unrealized_gain': round(unrealized_gain, 2),
        'tax_type': tax_type,
        'estimated_tax': round(estimated_tax, 2),
    }


def compute_portfolio_tax_summary(lots: List[dict], assets: List[dict], fx_rate: float = 83.5) -> dict:
    """
    Aggregates tax estimates across all lots.
    LTCG exemption is applied once across all LTCG gains (not per-lot) for accuracy.
    """
    price_map = {a['symbol']: a.get('live_price', 0) for a in assets}

    lot_results = []
    total_stcg_gain = 0.0
    total_ltcg_gain = 0.0
    no_price_symbols = set()

    for lot in lots:
        sym = lot['symbol']
        raw_price = price_map.get(sym, 0)
        if raw_price == 0:
            no_price_symbols.add(sym)
            continue

        is_crypto = 'crypto' in lot.get('asset_type', '')
        price_inr = raw_price * fx_rate if is_crypto else raw_price

        result = compute_lot_gain(lot, price_inr)
        lot_results.append(result)

        gain = result['unrealized_gain']
        if gain > 0:
            if result['tax_type'] == 'LTCG':
                total_ltcg_gain += gain
            else:
                total_stcg_gain += gain

    # Apply LTCG exemption once across all LTCG gains
    taxable_ltcg = max(0.0, total_ltcg_gain - LTCG_EQUITY_EXEMPTION_INR)
    estimated_ltcg_tax = taxable_ltcg * LTCG_EQUITY_RATE
    estimated_stcg_tax = total_stcg_gain * STCG_EQUITY_RATE

    return {
        'lots': lot_results,
        'summary': {
            'total_stcg_gains': round(total_stcg_gain, 2),
            'total_ltcg_gains': round(total_ltcg_gain, 2),
            'taxable_ltcg_after_exemption': round(taxable_ltcg, 2),
            'estimated_stcg_tax': round(estimated_stcg_tax, 2),
            'estimated_ltcg_tax': round(estimated_ltcg_tax, 2),
            'estimated_total_tax': round(estimated_stcg_tax + estimated_ltcg_tax, 2),
            'lots_without_price': sorted(no_price_symbols),
            'note': 'LTCG ₹1,25,000 exemption applied once across all LTCG gains. '
                    'Crypto taxed at flat 30% (STCG). Estimates only — consult a CA for filing.'
        }
    }


"""JobService — abstracts job scheduling and execution state."""
import logging
from typing import List, Dict, Optional


class JobService:
    def __init__(self):
        self.logger = logging.getLogger("JobService")
        self.job_repo = JobRepository()

    def mark_running(self, job_name: str) -> Dict:
        """Mark a job as currently running."""
        try:
            return self.job_repo.mark_running(job_name)
        except Exception as e:
            self.logger.error(f"Failed to mark job {job_name} as running: {e}")
            return {}

    def mark_done(self, job_name: str, status: str = "success", error: str = None, duration_ms: int = None) -> Dict:
        """Mark a job as completed."""
        try:
            return self.job_repo.mark_done(job_name, status=status, error=error, duration_ms=duration_ms)
        except Exception as e:
            self.logger.error(f"Failed to mark job {job_name} as done: {e}")
            return {}

    def get_all_jobs(self) -> List[Dict]:
        """Get all jobs and their current state."""
        try:
            return self.job_repo.get_all()
        except Exception as e:
            self.logger.error(f"Failed to fetch all jobs: {e}")
            return []

    def get_job(self, name: str) -> Optional[Dict]:
        """Get a specific job."""
        try:
            return self.job_repo.get_by_name(name)
        except Exception as e:
            self.logger.warning(f"Failed to fetch job {name}: {e}")
            return None

    def update_schedule(self, name: str, cron: str, enabled: bool = True) -> Dict:
        """Update job schedule and enabled status."""
        try:
            return self.job_repo.update_schedule(name, cron, enabled)
        except Exception as e:
            self.logger.error(f"Failed to update schedule for job {name}: {e}")
            return {}

    def get_logs(self, job_name: str = None, limit: int = 100) -> List[Dict]:
        """Get job execution logs."""
        try:
            if job_name:
                return self.job_repo.get_logs_for_job(job_name, limit=limit)
            else:
                return self.job_repo.get_all_logs(limit=limit)
        except Exception as e:
            self.logger.error(f"Failed to fetch job logs: {e}")
            return []
