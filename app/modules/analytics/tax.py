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

from storage.repositories.transaction_repo import TransactionRepository

STCG_EQUITY_RATE          = 0.20
LTCG_EQUITY_RATE          = 0.125
LTCG_EQUITY_EXEMPTION_INR = 125_000   # ₹1.25L per financial year
CRYPTO_TAX_RATE           = 0.30

logger = logging.getLogger("analytics.tax")


def classify_lot(buy_date_str: str, asset_type: str) -> str:
    """Returns 'LTCG' or 'STCG' for a lot based on asset type and holding period."""
    logger.debug("classify_lot: buy_date=%s asset_type=%s", buy_date_str, asset_type)

    if 'crypto' in asset_type:
        logger.debug("classify_lot: crypto asset → always STCG")
        return 'STCG'

    held_days = (date.today() - date.fromisoformat(buy_date_str)).days
    classification = 'LTCG' if held_days > 365 else 'STCG'
    logger.debug("classify_lot: held_days=%d → %s", held_days, classification)
    return classification


def compute_lot_gain(lot: dict, current_price_inr: float) -> dict:
    """
    Computes unrealized gain and estimated tax for a single tax lot.
    current_price_inr must already be in INR (caller handles FX for crypto).
    Note: LTCG exemption is applied per-lot here for display purposes.
    For accurate cross-lot aggregation use compute_portfolio_tax_summary().
    """
    qty           = lot['qty']
    buy_price     = lot['buy_price']
    asset_type    = lot.get('asset_type', 'equity_spot')
    buy_date_str  = lot['buy_date']

    logger.debug(
        "compute_lot_gain: lot_id=%s symbol=%s qty=%.4f buy_price=%.2f current_price_inr=%.2f",
        lot.get('lot_id'), lot.get('symbol'), qty, buy_price, current_price_inr
    )

    cost_basis      = qty * buy_price
    current_value   = qty * current_price_inr
    unrealized_gain = current_value - cost_basis
    holding_days    = (date.today() - date.fromisoformat(buy_date_str)).days
    tax_type        = classify_lot(buy_date_str, asset_type)

    logger.debug(
        "compute_lot_gain: cost_basis=%.2f current_value=%.2f unrealized_gain=%.2f holding_days=%d tax_type=%s",
        cost_basis, current_value, unrealized_gain, holding_days, tax_type
    )

    if unrealized_gain <= 0:
        estimated_tax = 0.0
        logger.debug("compute_lot_gain: unrealized_gain=%.2f ≤ 0 → tax=0", unrealized_gain)
    elif 'crypto' in asset_type:
        estimated_tax = unrealized_gain * CRYPTO_TAX_RATE
        logger.debug("compute_lot_gain: crypto STCG %.2f * %.0f%% = %.2f",
                     unrealized_gain, CRYPTO_TAX_RATE * 100, estimated_tax)
    elif tax_type == 'LTCG':
        taxable = max(0.0, unrealized_gain - LTCG_EQUITY_EXEMPTION_INR)
        estimated_tax = taxable * LTCG_EQUITY_RATE
        logger.debug(
            "compute_lot_gain: LTCG gain=%.2f exemption=%.0f taxable=%.2f rate=%.1f%% tax=%.2f",
            unrealized_gain, LTCG_EQUITY_EXEMPTION_INR, taxable, LTCG_EQUITY_RATE * 100, estimated_tax
        )
    else:
        estimated_tax = unrealized_gain * STCG_EQUITY_RATE
        logger.debug("compute_lot_gain: STCG gain=%.2f * %.0f%% = %.2f",
                     unrealized_gain, STCG_EQUITY_RATE * 100, estimated_tax)

    return {
        'lot_id':         lot['lot_id'],
        'symbol':         lot['symbol'],
        'broker':         lot.get('broker', 'Unknown'),
        'buy_date':       buy_date_str,
        'holding_days':   holding_days,
        'qty':            qty,
        'buy_price':      round(buy_price, 2),
        'cost_basis':     round(cost_basis, 2),
        'current_value':  round(current_value, 2),
        'unrealized_gain': round(unrealized_gain, 2),
        'tax_type':       tax_type,
        'estimated_tax':  round(estimated_tax, 2),
    }


def compute_portfolio_tax_summary(lots: List[dict], assets: List[dict], fx_rate: float = 83.5) -> dict:
    """
    Aggregates tax estimates across all lots.
    LTCG exemption is applied once across all LTCG gains (not per-lot) for accuracy.
    """
    logger.info(
        "compute_portfolio_tax_summary: lots=%d assets=%d fx_rate=%.2f",
        len(lots), len(assets), fx_rate
    )

    price_map = {a['symbol']: a.get('live_price', 0) for a in assets}
    logger.debug("compute_portfolio_tax_summary: price_map has %d symbols", len(price_map))

    lot_results      = []
    total_stcg_gain  = 0.0
    total_ltcg_gain  = 0.0
    no_price_symbols = set()

    for lot in lots:
        sym       = lot['symbol']
        raw_price = price_map.get(sym, 0)

        if raw_price == 0:
            logger.warning("compute_portfolio_tax_summary: no live price for symbol=%s — skipping lot", sym)
            no_price_symbols.add(sym)
            continue

        is_crypto = 'crypto' in lot.get('asset_type', '')
        price_inr = raw_price * fx_rate if is_crypto else raw_price
        logger.debug(
            "compute_portfolio_tax_summary: symbol=%s raw_price=%.4f is_crypto=%s price_inr=%.2f",
            sym, raw_price, is_crypto, price_inr
        )

        result = compute_lot_gain(lot, price_inr)
        lot_results.append(result)

        gain = result['unrealized_gain']
        if gain > 0:
            if result['tax_type'] == 'LTCG':
                total_ltcg_gain += gain
                logger.debug("compute_portfolio_tax_summary: symbol=%s LTCG gain=%.2f running_total=%.2f",
                             sym, gain, total_ltcg_gain)
            else:
                total_stcg_gain += gain
                logger.debug("compute_portfolio_tax_summary: symbol=%s STCG gain=%.2f running_total=%.2f",
                             sym, gain, total_stcg_gain)

    # Apply LTCG exemption once across all LTCG gains
    taxable_ltcg      = max(0.0, total_ltcg_gain - LTCG_EQUITY_EXEMPTION_INR)
    estimated_ltcg_tax = taxable_ltcg * LTCG_EQUITY_RATE
    estimated_stcg_tax = total_stcg_gain * STCG_EQUITY_RATE

    logger.info(
        "compute_portfolio_tax_summary: stcg_gain=%.2f ltcg_gain=%.2f "
        "taxable_ltcg=%.2f stcg_tax=%.2f ltcg_tax=%.2f total_tax=%.2f lots_no_price=%d",
        total_stcg_gain, total_ltcg_gain, taxable_ltcg,
        estimated_stcg_tax, estimated_ltcg_tax,
        estimated_stcg_tax + estimated_ltcg_tax,
        len(no_price_symbols)
    )
    if no_price_symbols:
        logger.warning("compute_portfolio_tax_summary: symbols with no price (excluded): %s", sorted(no_price_symbols))

    return {
        'lots': lot_results,
        'summary': {
            'total_stcg_gains':             round(total_stcg_gain, 2),
            'total_ltcg_gains':             round(total_ltcg_gain, 2),
            'taxable_ltcg_after_exemption': round(taxable_ltcg, 2),
            'estimated_stcg_tax':           round(estimated_stcg_tax, 2),
            'estimated_ltcg_tax':           round(estimated_ltcg_tax, 2),
            'estimated_total_tax':          round(estimated_stcg_tax + estimated_ltcg_tax, 2),
            'lots_without_price':           sorted(no_price_symbols),
            'note': 'LTCG ₹1,25,000 exemption applied once across all LTCG gains. '
                    'Crypto taxed at flat 30% (STCG). Estimates only — consult a CA for filing.'
        }
    }
