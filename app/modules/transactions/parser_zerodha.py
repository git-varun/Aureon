"""
Zerodha trade history CSV parsers for tax lot reconstruction.

Zerodha Console exports two separate CSVs:
  1. Equity tradebook (equity_trades) — P&L > Tradebook > Equity
  2. MF order history (mf_trades)     — MF > Orders

Since Kite Connect does not expose per-trade buy dates, these CSV exports
are the only authoritative source for STCG/LTCG classification.

equity_trades columns (from Console export):
  Order ID | Trade ID | Trading Symbol | Exchange | Segment | Trade Type |
  Quantity | Price | Product | Order Type | Fill Time

mf_trades columns (from Console export):
  Order ID | Fund Name | ISIN | Folio Number | Transaction Type |
  Amount | Units | NAV | Order Status | Order Date | Allotment Date

Delivery segment filter:
  Only CNC (Cash-and-Carry / delivery) trades are STCG/LTCG eligible.
  MIS (intraday) and NRML (F&O carry-forward) are excluded.
"""

import csv
import hashlib
import io
import logging
from datetime import datetime
from typing import List, Optional

logger = logging.getLogger("ZerodhaLots")

# ---------------------------------------------------------------------------
# Candidate column names (all lowercase/stripped)
# ---------------------------------------------------------------------------
_ORDER_ID_COLS  = ['order id', 'order_id', 'orderid']
_TRADE_ID_COLS  = ['trade id', 'trade_id', 'tradeid']
_SYMBOL_COLS    = ['trading symbol', 'tradingsymbol', 'symbol', 'scrip', 'instrument']
_EXCHANGE_COLS  = ['exchange', 'stock exchange']
_SEGMENT_COLS   = ['segment', 'product', 'order segment']
_TYPE_COLS      = ['trade type', 'transaction type', 'type', 'buy/sell']
_QTY_COLS       = ['quantity', 'qty', 'units']
_PRICE_COLS     = ['price', 'trade price', 'avg price', 'average price', 'rate', 'nav']
_FILL_TIME_COLS = ['fill time', 'fill_time', 'trade time', 'timestamp', 'order date', 'allotment date', 'date']
_STATUS_COLS    = ['order status', 'status', 'order_status']
_AMOUNT_COLS    = ['amount', 'invested amount', 'transaction amount']
_FUND_COLS      = ['fund name', 'fund_name', 'scheme name', 'scheme_name', 'instrument']

# Zerodha delivery segment identifiers
_DELIVERY_SEGMENTS = {'cnc', 'delivery'}

# Statuses treated as successfully executed
_EXECUTED_STATUSES = {'complete', 'completed', 'traded', 'allotted', 'allotted (units)', 'executed'}

# Date/datetime formats used in Zerodha Console exports
_DATETIME_FORMATS = [
    '%Y-%m-%d %H:%M:%S',
    '%d-%m-%Y %H:%M:%S',
    '%d/%m/%Y %H:%M:%S',
    '%Y-%m-%dT%H:%M:%S',
    '%d-%b-%Y %H:%M:%S',
]
_DATE_FORMATS = [
    '%Y-%m-%d',
    '%d-%m-%Y',
    '%d/%m/%Y',
    '%d-%b-%Y',
    '%b %d, %Y',
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_col(headers: list, candidates: list) -> Optional[str]:
    """Returns the first matching original header from the candidates list."""
    h_map = {h.lower().strip(): h for h in headers}
    for c in candidates:
        if c in h_map:
            return h_map[c]
    return None


def _parse_date(raw: str) -> str:
    """Parses datetime or date strings, returns ISO YYYY-MM-DD."""
    raw = raw.strip()
    for fmt in _DATETIME_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date/datetime format: {raw!r}")


def _clean_number(raw: str) -> float:
    """Strips currency symbols, commas, and whitespace."""
    return float(raw.replace(',', '').replace('₹', '').replace(' ', '').strip())


def _resolve_equity_symbol(tradingsymbol: str, exchange: str) -> str:
    """Returns fully-qualified symbol: SYMBOL.NS or SYMBOL.BO."""
    if tradingsymbol.endswith(('.NS', '.BO', '.FO')):
        return tradingsymbol
    suffix = '.BO' if exchange.upper() in ('BSE', 'BOM') else '.NS'
    return f"{tradingsymbol}{suffix}"


# ---------------------------------------------------------------------------
# Equity Tradebook Parser
# ---------------------------------------------------------------------------

def parse_zerodha_equity_trades(
    file_content: str,
    source_filename: str = "zerodha_equity_trades.csv"
) -> List[dict]:
    """
    Parses a Zerodha Console equity tradebook CSV into tax lot dicts.

    Only CNC (delivery) BUY trades are imported. MIS and NRML are excluded.
    Status is not checked — all rows in the tradebook are considered executed
    (Console only exports filled trades, not pending/cancelled ones).

    buy_date is extracted from the fill_time datetime field (date portion only).

    Args:
        file_content: Raw UTF-8 CSV content from Zerodha Console tradebook export.
        source_filename: Original filename stored for audit trail.

    Returns:
        List of tax lot dicts ready for PortfolioDB.save_tax_lots().

    Raises:
        ValueError: If required columns cannot be located.
    """
    reader = csv.DictReader(io.StringIO(file_content))
    headers = list(reader.fieldnames or [])

    symbol_col    = _find_col(headers, _SYMBOL_COLS)
    exchange_col  = _find_col(headers, _EXCHANGE_COLS)
    segment_col   = _find_col(headers, _SEGMENT_COLS)
    type_col      = _find_col(headers, _TYPE_COLS)
    qty_col       = _find_col(headers, _QTY_COLS)
    price_col     = _find_col(headers, _PRICE_COLS)
    fill_time_col = _find_col(headers, _FILL_TIME_COLS)
    trade_id_col  = _find_col(headers, _TRADE_ID_COLS)   # preferred for idempotency
    order_id_col  = _find_col(headers, _ORDER_ID_COLS)   # fallback

    missing = [name for name, col in [
        ('trading symbol', symbol_col), ('trade type', type_col),
        ('quantity', qty_col), ('price', price_col), ('fill time', fill_time_col),
    ] if col is None]

    if missing:
        raise ValueError(
            f"Could not locate required columns: {missing}. "
            f"Headers found: {headers}"
        )

    lots = []
    skipped = 0

    for row in reader:
        trade_type = row.get(type_col, '').strip().upper()
        if trade_type != 'BUY':
            skipped += 1
            continue

        # Only delivery (CNC) trades are STCG/LTCG eligible
        if segment_col:
            segment = row.get(segment_col, '').strip().lower()
            if segment and segment not in _DELIVERY_SEGMENTS:
                skipped += 1
                continue

        try:
            tradingsymbol = row[symbol_col].strip()
            exchange_raw  = row.get(exchange_col, 'NSE') if exchange_col else 'NSE'
            symbol        = _resolve_equity_symbol(tradingsymbol, exchange_raw)

            buy_date  = _parse_date(row[fill_time_col])
            qty       = _clean_number(row[qty_col])
            buy_price = _clean_number(row[price_col])

            # Use trade_id preferentially — it's unique per fill even for partial fills
            trade_id  = row.get(trade_id_col, '').strip() if trade_id_col else ''
            order_id  = row.get(order_id_col, '').strip() if order_id_col else ''
            ref_id    = trade_id or order_id

            raw_id = f"Zerodha_{ref_id}" if ref_id else f"Zerodha_{symbol}_{buy_date}_{qty}_{buy_price}"
            lot_id = hashlib.md5(raw_id.encode('utf-8')).hexdigest()

            lots.append({
                'lot_id':      lot_id,
                'symbol':      symbol,
                'broker':      'Zerodha',         # equity lots tagged 'Zerodha'
                'buy_date':    buy_date,
                'qty':         qty,
                'buy_price':   buy_price,
                'asset_type':  'equity_spot',
                'source_file': source_filename,
            })

        except (ValueError, KeyError) as e:
            logger.warning(f"Skipping equity row (parse error: {e}): {dict(row)}")
            skipped += 1

    logger.info(f"Parsed {len(lots)} equity BUY lots from '{source_filename}' ({skipped} rows skipped).")
    return lots


# ---------------------------------------------------------------------------
# MF Order History Parser
# ---------------------------------------------------------------------------

def parse_zerodha_mf_trades(
    file_content: str,
    source_filename: str = "zerodha_mf_trades.csv"
) -> List[dict]:
    """
    Parses a Zerodha Console MF order history CSV into tax lot dicts.

    Only PURCHASE and SIP transaction types are imported; REDEMPTION is skipped.
    Uses allotment_date as buy_date (date units are credited), falling back to
    order_date if allotment_date is absent or blank.
    buy_price = nav (NAV at allotment, the true cost basis per unit).
    Only orders with an executed/allotted status are imported.

    Args:
        file_content: Raw UTF-8 CSV content from Zerodha MF order history export.
        source_filename: Original filename stored for audit trail.

    Returns:
        List of tax lot dicts ready for PortfolioDB.save_tax_lots().

    Raises:
        ValueError: If required columns cannot be located.
    """
    reader = csv.DictReader(io.StringIO(file_content))
    headers = list(reader.fieldnames or [])

    fund_col       = _find_col(headers, _FUND_COLS)
    type_col       = _find_col(headers, _TYPE_COLS)
    units_col      = _find_col(headers, _QTY_COLS)
    nav_col        = _find_col(headers, _PRICE_COLS)
    status_col     = _find_col(headers, _STATUS_COLS)     # optional but important
    order_id_col   = _find_col(headers, _ORDER_ID_COLS)   # optional

    # Prefer allotment_date; fall back to any date column
    allotment_col  = _find_col(headers, ['allotment date', 'allotment_date'])
    order_date_col = _find_col(headers, ['order date', 'order_date', 'date'])
    date_col       = allotment_col or order_date_col

    missing = [name for name, col in [
        ('fund name', fund_col), ('transaction type', type_col),
        ('units', units_col), ('nav', nav_col), ('date', date_col),
    ] if col is None]

    if missing:
        raise ValueError(
            f"Could not locate required columns: {missing}. "
            f"Headers found: {headers}"
        )

    lots = []
    skipped = 0

    for row in reader:
        tx_type = row.get(type_col, '').strip().upper()
        if tx_type not in ('PURCHASE', 'SIP'):
            skipped += 1
            continue

        # Skip non-executed orders
        if status_col:
            status = row.get(status_col, '').strip().lower()
            if status and status not in _EXECUTED_STATUSES:
                skipped += 1
                continue

        try:
            fund_name = row[fund_col].strip()
            # Use same symbol convention as Zerodha MF holdings (if ever added),
            # matching MFApiPricer: first 20 chars, spaces→underscores, _MF suffix
            symbol = f"{fund_name[:20].replace(' ', '_')}_MF"

            # allotment_date is authoritative; fall back to order_date if blank
            raw_date = row.get(allotment_col, '').strip() if allotment_col else ''
            if not raw_date and order_date_col:
                raw_date = row.get(order_date_col, '').strip()
            buy_date = _parse_date(raw_date)

            units     = _clean_number(row[units_col])
            nav       = _clean_number(row[nav_col])

            if units <= 0:
                skipped += 1
                continue