"""
Groww order history / trade book CSV parser.

Groww's export column headers vary slightly across versions.
This parser uses candidate-list matching so it handles all known variants.

Expected CSV format (Groww Stock Orders export):
  Order Date | Stock Name | Exchange | Transaction Type (BUY/SELL) | Quantity | Price | Order Type | Status | Order ID

Expected CSV format (Groww MF Transactions export):
  Order Date | Scheme Name | Transaction Type (BUY/SELL/SIP) | Amount | Units | Status
"""

import csv
import hashlib
import io
import logging
from datetime import datetime
from typing import List, Optional

logger = logging.getLogger("GrowwLots")

# Candidate column names for each required field (lowercase, stripped)
_DATE_COLS     = ['trade date', 'date', 'order date', 'settlement date', 'transaction date']
_SYMBOL_COLS   = ['symbol', 'scrip', 'trading symbol', 'script', 'instrument', 'stock name', 'stock_name']
_TYPE_COLS     = ['trade type', 'type', 'transaction type', 'order type', 'buy/sell']
_QTY_COLS      = ['quantity', 'qty', 'trade quantity', 'shares', 'units']
_PRICE_COLS    = ['price', 'trade price', 'avg price', 'average price', 'rate']
_ID_COLS       = ['order id', 'trade id', 'order_id', 'trade_id', 'ref no', 'reference']
_EXCHANGE_COLS = ['exchange', 'stock exchange']
_STATUS_COLS   = ['status', 'order status']
_AMOUNT_COLS   = ['amount', 'invested amount', 'transaction amount']
_SCHEME_COLS   = ['scheme name', 'scheme_name', 'fund name', 'mutual fund']

_DATE_FORMATS = ['%d-%b-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%b %d, %Y', '%d %b %Y']

# Statuses treated as executed (case-insensitive)
_EXECUTED_STATUSES = {'executed', 'complete', 'completed', 'traded', 'allotted', 'allotted (units)'}


def _find_col(headers: list, candidates: list) -> Optional[str]:
    """Returns the first matching original header from the candidates list."""
    h_map = {h.lower().strip(): h for h in headers}
    for c in candidates:
        if c in h_map:
            return h_map[c]
    return None


def _parse_date(raw: str) -> str:
    """Tries known date formats, returns ISO YYYY-MM-DD string."""
    raw = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {raw!r}")


def _clean_number(raw: str) -> float:
    """Strips currency symbols, commas, and whitespace before float conversion."""
    return float(raw.replace(',', '').replace('₹', '').replace(' ', '').strip())


def _resolve_equity_symbol(raw_symbol: str, exchange_raw: str) -> str:
    """Returns a fully-qualified symbol like RELIANCE.NS or RELIANCE.BO."""
    if raw_symbol.endswith(('.NS', '.BO', '.FO')):
        return raw_symbol
    exchange = exchange_raw.strip().upper() if exchange_raw else ''
    suffix = '.BO' if exchange in ('BSE', 'BOM') else '.NS'
    return f"{raw_symbol}{suffix}"


def parse_groww_order_history(file_content: str, source_filename: str = "groww_import.csv") -> List[dict]:
    """
    Parses a Groww stock order history CSV export into tax lot dicts.

    Only EXECUTED BUY orders are imported. Order status is checked against
    _EXECUTED_STATUSES. Exchange column is used to determine .NS vs .BO suffix.

    Args:
        file_content: Raw UTF-8 string content of the CSV file.
        source_filename: Original filename stored for audit trail.

    Returns:
        List of tax lot dicts ready for PortfolioDB.save_tax_lots().

    Raises:
        ValueError: If required columns cannot be located in the CSV headers.
    """
    reader = csv.DictReader(io.StringIO(file_content))
    headers = list(reader.fieldnames or [])

    date_col     = _find_col(headers, _DATE_COLS)
    symbol_col   = _find_col(headers, _SYMBOL_COLS)
    type_col     = _find_col(headers, _TYPE_COLS)
    qty_col      = _find_col(headers, _QTY_COLS)
    price_col    = _find_col(headers, _PRICE_COLS)
    id_col       = _find_col(headers, _ID_COLS)       # optional
    exchange_col = _find_col(headers, _EXCHANGE_COLS) # optional
    status_col   = _find_col(headers, _STATUS_COLS)   # optional

    missing = [name for name, col in [
        ('date', date_col), ('symbol', symbol_col),
        ('trade type', type_col), ('quantity', qty_col), ('price', price_col)
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

        # Skip non-executed orders when a status column is present
        if status_col:
            status = row.get(status_col, '').strip().lower()
            if status and status not in _EXECUTED_STATUSES:
                skipped += 1
                continue

        try:
            raw_symbol   = row[symbol_col].strip()
            exchange_raw = row.get(exchange_col, '') if exchange_col else ''
            symbol       = _resolve_equity_symbol(raw_symbol, exchange_raw)

            buy_date  = _parse_date(row[date_col])
            qty       = _clean_number(row[qty_col])
            buy_price = _clean_number(row[price_col])
            order_id  = row.get(id_col, '').strip() if id_col else ''

            # Deterministic lot_id — re-importing the same CSV is safe
            raw_id = f"Groww_{order_id}" if order_id else f"Groww_{symbol}_{buy_date}_{qty}_{buy_price}"
            lot_id = hashlib.md5(raw_id.encode('utf-8')).hexdigest()

            lots.append({
                'lot_id':      lot_id,
                'symbol':      symbol,
                'broker':      'Groww',          # equity lots tagged 'Groww'
                'buy_date':    buy_date,
                'qty':         qty,
                'buy_price':   buy_price,
                'asset_type':  'equity_spot',
                'source_file': source_filename,
            })

        except (ValueError, KeyError) as e:
            logger.warning(f"Skipping row (parse error: {e}): {dict(row)}")
            skipped += 1

    logger.info(f"Parsed {len(lots)} BUY lots from '{source_filename}' ({skipped} rows skipped).")
    return lots


def parse_groww_mf_transactions(file_content: str, source_filename: str = "groww_mf_import.csv") -> List[dict]:
    """
    Parses a Groww MF transaction history CSV export into tax lot dicts.

    Handles BUY and SIP transaction types. SELL orders are skipped.
    Only EXECUTED/ALLOTTED transactions are imported.

    buy_price is derived as amount / units (purchase NAV per unit).

    Args:
        file_content: Raw UTF-8 string content of the CSV file.
        source_filename: Original filename stored for audit trail.

    Returns:
        List of tax lot dicts ready for PortfolioDB.save_tax_lots().

    Raises:
        ValueError: If required columns cannot be located in the CSV headers.
    """
    reader = csv.DictReader(io.StringIO(file_content))
    headers = list(reader.fieldnames or [])

    date_col   = _find_col(headers, _DATE_COLS)
    scheme_col = _find_col(headers, _SCHEME_COLS)
    type_col   = _find_col(headers, _TYPE_COLS)
    amount_col = _find_col(headers, _AMOUNT_COLS)
    units_col  = _find_col(headers, _QTY_COLS)    # 'units' is in _QTY_COLS
    id_col     = _find_col(headers, _ID_COLS)      # optional
    status_col = _find_col(headers, _STATUS_COLS)  # optional

    missing = [name for name, col in [
        ('date', date_col), ('scheme name', scheme_col),
        ('transaction type', type_col), ('amount', amount_col), ('units', units_col)
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
        # Accept BUY and SIP; skip SELL and anything else
        if trade_type not in ('BUY', 'SIP'):
            skipped += 1
            continue

        # Skip non-executed orders when a status column is present
        if status_col:
            status = row.get(status_col, '').strip().lower()
            if status and status not in _EXECUTED_STATUSES:
                skipped += 1
                continue

        try:
            scheme_name = row[scheme_col].strip()
            # Use same symbol convention as GrowwSync (first 20 chars, spaces→underscores)
            symbol = f"{scheme_name[:20].replace(' ', '_')}_MF"

            buy_date = _parse_date(row[date_col])
            units    = _clean_number(row[units_col])
            amount   = _clean_number(row[amount_col])

            if units <= 0:
                skipped += 1
                continue

            buy_price = amount / units  # purchase NAV

            order_id = row.get(id_col, '').strip() if id_col else ''
            raw_id   = f"GrowwMF_{order_id}" if order_id else f"GrowwMF_{symbol}_{buy_date}_{units}_{amount}"
            lot_id   = hashlib.md5(raw_id.encode('utf-8')).hexdigest()

            lots.append({
                'lot_id':      lot_id,
                'symbol':      symbol,
                'broker':      'GrowwMF',        # MF lots tagged 'GrowwMF' for independent clear
                'buy_date':    buy_date,
                'qty':         units,
                'buy_price':   buy_price,
                'asset_type':  'mutual_fund',
                'source_file': source_filename,
            })

        except (ValueError, KeyError) as e:
            logger.warning(f"Skipping MF row (parse error: {e}): {dict(row)}")
            skipped += 1

    logger.info(f"Parsed {len(lots)} MF lots from '{source_filename}' ({skipped} rows skipped).")
    return lots

