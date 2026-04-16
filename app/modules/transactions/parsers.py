"""
Unified transaction parser for Binance, Groww, and Zerodha CSV exports.

Output schema per transaction:
{
    "provider":          str,          # "Binance" | "Groww" | "Zerodha"
    "asset":             str,          # e.g. "BTC", "RELIANCE.NS"
    "transaction_type":  "BUY"|"SELL",
    "quantity":          float,
    "price":             float,
    "fee":               float,
    "total_value":       float,
    "currency":          str,          # "USD" | "INR"
    "timestamp":         str,          # ISO-8601
}
"""
import csv
import io
import logging
from datetime import datetime
from typing import List, Tuple

logger = logging.getLogger("TransactionParser")

# ─────────────────────────────────────────────────────────────────────────────
# DATETIME HELPERS
# ─────────────────────────────────────────────────────────────────────────────

_BINANCE_DATE_FMTS = [
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
]
_GROWW_DATE_FMTS = [
    "%d-%b-%Y %H:%M:%S",  # 15-Jan-2024 10:30:00 (combined date+time)
    "%d-%b-%Y %H:%M",     # 15-Jan-2024 10:30
    "%d-%b-%Y",           # 15-Jan-2024
    "%d/%m/%Y %H:%M:%S",  # 15/01/2024 10:30:00
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
    "%d %b %Y",
]
_ZERODHA_DATE_FMTS = [
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d %b %Y",
]


def _parse_dt(value: str, fmts: list) -> str:
    """Try a list of datetime formats; return ISO string or raise ValueError."""
    value = str(value).strip()
    for fmt in fmts:
        try:
            return datetime.strptime(value, fmt).isoformat()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: '{value}'")


def _safe_float(value, default=0.0) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return default


def _normalise_type(raw: str) -> str | None:
    """Map broker-specific type strings to BUY or SELL, or None if irrelevant."""
    raw = str(raw).strip().upper()
    if any(k in raw for k in ("BUY", "PURCHASE", "SIP")):
        return "BUY"
    if any(k in raw for k in ("SELL", "REDEMPTION", "REDEEM")):
        return "SELL"
    return None


def _resolve_col(row: dict, candidates: list, default="") -> str:
    """Return the first candidate column that exists in row."""
    for c in candidates:
        if c in row:
            return str(row[c]).strip()
    return default


# ─────────────────────────────────────────────────────────────────────────────
# BINANCE SPOT TRADE HISTORY
#
# Expected columns (Binance "Trade History" export):
#   Date(UTC) | Market | Type | Price | Amount | Total | Fee | Fee Coin
# ─────────────────────────────────────────────────────────────────────────────

_BINANCE_DATE_COLS   = ["Date(UTC)", "date(utc)", "Date", "Datetime"]
_BINANCE_PAIR_COLS   = ["Market", "market", "Pair", "Symbol"]
_BINANCE_TYPE_COLS   = ["Type", "type", "Side", "side"]
_BINANCE_PRICE_COLS  = ["Price", "price"]
_BINANCE_AMOUNT_COLS = ["Amount", "amount", "Quantity", "Executed"]
_BINANCE_TOTAL_COLS  = ["Total", "total"]
_BINANCE_FEE_COLS    = ["Fee", "fee"]


def _parse_binance(content: str, source_file: str) -> Tuple[List[dict], List[str]]:
    transactions, errors = [], []
    reader = csv.DictReader(io.StringIO(content))

    for i, row in enumerate(reader, start=2):
        try:
            raw_date = _resolve_col(row, _BINANCE_DATE_COLS)
            raw_pair = _resolve_col(row, _BINANCE_PAIR_COLS)
            raw_type = _resolve_col(row, _BINANCE_TYPE_COLS)

            if not raw_date or not raw_pair or not raw_type:
                continue

            txn_type = _normalise_type(raw_type)
            if txn_type is None:
                continue  # skip transfers, deposits, etc.

            price = _safe_float(_resolve_col(row, _BINANCE_PRICE_COLS))
            qty   = _safe_float(_resolve_col(row, _BINANCE_AMOUNT_COLS))
            total = _safe_float(_resolve_col(row, _BINANCE_TOTAL_COLS))
            fee   = _safe_float(_resolve_col(row, _BINANCE_FEE_COLS))

            if qty <= 0:
                continue

            # Market pair like "BTCUSDT" → base asset "BTC"
            pair = raw_pair.upper()
            for quote in ("USDT", "BUSD", "USDC", "BTC", "ETH", "BNB"):
                if pair.endswith(quote):
                    asset = pair[: -len(quote)]
                    break
            else:
                asset = pair

            transactions.append({
                "provider":         "Binance",
                "asset":            asset,
                "transaction_type": txn_type,
                "quantity":         qty,
                "price":            price,
                "fee":              fee,
                "total_value":      total if total else round(qty * price, 8),
                "currency":         "USD",
                "timestamp":        _parse_dt(raw_date, _BINANCE_DATE_FMTS),
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")

    return transactions, errors


# ─────────────────────────────────────────────────────────────────────────────
# GROWW EQUITY ORDER HISTORY
#
# Expected columns (Groww "Order History" export):
#   ORDER DATE | ORDER TIME | STOCK NAME | EXCHANGE | TRANSACTION TYPE |
#   QUANTITY | PRICE | ORDER ID | ORDER STATUS
# ─────────────────────────────────────────────────────────────────────────────

_GROWW_DATE_COLS   = ["ORDER DATE", "order date", "Date", "date"]
_GROWW_TIME_COLS   = ["ORDER TIME", "order time", "Time"]
_GROWW_SYMBOL_COLS = ["STOCK NAME", "stock name", "Stock Name", "SYMBOL", "Symbol", "stock_name"]
_GROWW_TYPE_COLS   = ["TRANSACTION TYPE", "transaction type", "Type", "type", "SIDE"]
_GROWW_QTY_COLS    = ["QUANTITY", "quantity", "Qty", "qty"]
_GROWW_PRICE_COLS  = ["PRICE", "price", "Price"]
_GROWW_STATUS_COLS = ["ORDER STATUS", "order status", "Status", "status"]
_GROWW_EXCHANGE_COLS = ["EXCHANGE", "exchange", "Exchange"]

_GROWW_EXECUTED = {"complete", "executed", "filled", "traded"}


def _parse_groww(content: str, source_file: str) -> Tuple[List[dict], List[str]]:
    transactions, errors = [], []
    reader = csv.DictReader(io.StringIO(content))

    for i, row in enumerate(reader, start=2):
        try:
            status = _resolve_col(row, _GROWW_STATUS_COLS).lower()
            if status and status not in _GROWW_EXECUTED:
                continue

            raw_date = _resolve_col(row, _GROWW_DATE_COLS)
            raw_time = _resolve_col(row, _GROWW_TIME_COLS)
            raw_sym  = _resolve_col(row, _GROWW_SYMBOL_COLS)
            raw_type = _resolve_col(row, _GROWW_TYPE_COLS)

            if not raw_date or not raw_sym or not raw_type:
                continue

            txn_type = _normalise_type(raw_type)
            if txn_type is None:
                continue

            qty   = _safe_float(_resolve_col(row, _GROWW_QTY_COLS))
            price = _safe_float(_resolve_col(row, _GROWW_PRICE_COLS))
            if qty <= 0:
                continue

            exchange = _resolve_col(row, _GROWW_EXCHANGE_COLS).upper()
            suffix = ".BO" if exchange == "BSE" else ".NS"
            asset = f"{raw_sym.strip()}{suffix}"

            dt_str = f"{raw_date} {raw_time}".strip() if raw_time else raw_date
            timestamp = _parse_dt(dt_str, _GROWW_DATE_FMTS + _BINANCE_DATE_FMTS)

            transactions.append({
                "provider":         "Groww",
                "asset":            asset,
                "transaction_type": txn_type,
                "quantity":         qty,
                "price":            price,
                "fee":              0.0,
                "total_value":      round(qty * price, 2),
                "currency":         "INR",
                "timestamp":        timestamp,
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")

    return transactions, errors


# ─────────────────────────────────────────────────────────────────────────────
# ZERODHA TRADEBOOK (equity + F&O)
#
# Expected columns (Zerodha "Tradebook" export):
#   symbol | isin | trade_date | exchange | segment | series |
#   trade_type | auction | quantity | price | trade_id | order_id | order_execution_time
# ─────────────────────────────────────────────────────────────────────────────

_ZERODHA_DATE_COLS   = ["trade_date", "Trade Date", "order_execution_time", "Date"]
_ZERODHA_SYMBOL_COLS = ["symbol", "Symbol", "tradingsymbol"]
_ZERODHA_TYPE_COLS   = ["trade_type", "Trade Type", "transaction_type", "Type"]
_ZERODHA_QTY_COLS    = ["quantity", "Quantity", "qty"]
_ZERODHA_PRICE_COLS  = ["price", "Price"]
_ZERODHA_EXCHANGE_COLS = ["exchange", "Exchange"]
_ZERODHA_SEGMENT_COLS  = ["segment", "Segment"]


def _parse_zerodha(content: str, source_file: str) -> Tuple[List[dict], List[str]]:
    transactions, errors = [], []
    reader = csv.DictReader(io.StringIO(content))

    for i, row in enumerate(reader, start=2):
        try:
            raw_date = _resolve_col(row, _ZERODHA_DATE_COLS)
            raw_sym  = _resolve_col(row, _ZERODHA_SYMBOL_COLS)
            raw_type = _resolve_col(row, _ZERODHA_TYPE_COLS)

            if not raw_date or not raw_sym or not raw_type:
                continue

            txn_type = _normalise_type(raw_type)
            if txn_type is None:
                continue

            qty   = _safe_float(_resolve_col(row, _ZERODHA_QTY_COLS))
            price = _safe_float(_resolve_col(row, _ZERODHA_PRICE_COLS))
            if qty <= 0:
                continue

            exchange = _resolve_col(row, _ZERODHA_EXCHANGE_COLS).upper()
            segment  = _resolve_col(row, _ZERODHA_SEGMENT_COLS).upper()

            if "NFO" in (exchange, segment) or "FO" in segment:
                asset = f"{raw_sym.strip()}.FO"
            else:
                suffix = ".BO" if exchange == "BSE" else ".NS"
                asset = f"{raw_sym.strip()}{suffix}"

            timestamp = _parse_dt(raw_date.strip()[:10], _ZERODHA_DATE_FMTS)

            transactions.append({
                "provider":         "Zerodha",
                "asset":            asset,
                "transaction_type": txn_type,
                "quantity":         qty,
                "price":            price,
                "fee":              0.0,
                "total_value":      round(qty * price, 2),
                "currency":         "INR",
                "timestamp":        timestamp,
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")

    return transactions, errors


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────

_PARSERS = {
    "Binance": _parse_binance,
    "Groww":   _parse_groww,
    "Zerodha": _parse_zerodha,
}


def parse_transactions(
    content: str,
    provider: str,
    source_file: str = "",
) -> Tuple[List[dict], List[str]]:
    """
    Parse a CSV string into the unified transaction schema.

    Returns:
        (transactions, errors)
        transactions — list of dicts conforming to the unified schema
        errors       — list of row-level parse error strings (non-fatal)
    """
    parser = _PARSERS.get(provider)
    if parser is None:
        raise ValueError(f"Provider '{provider}' not supported. Choose from: {list(_PARSERS)}")

    transactions, errors = parser(content, source_file)
    logger.info(f"Parsed {len(transactions)} transactions from {provider} ({len(errors)} row errors)")
    return transactions, errors
