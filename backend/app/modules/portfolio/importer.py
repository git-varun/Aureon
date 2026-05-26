"""Transaction file importer: CSV, XLSX, PDF → normalised transaction rows."""

from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger("portfolio.importer")

# Accepted column names (case-insensitive) → internal key
_COL_MAP = {
    # Generic / common
    "date": "date", "trade date": "date", "transaction date": "date",
    "symbol": "symbol", "ticker": "symbol", "scrip": "symbol", "stock": "symbol",
    "type": "type", "transaction type": "type", "trade type": "type", "action": "type",
    "qty": "quantity", "quantity": "quantity", "shares": "quantity", "units": "quantity",
    "price": "price", "rate": "price", "trade price": "price", "avg price": "price",
    # Zerodha contract note
    "instrument": "symbol", "avg. price": "price", "net price": "price",
    "buy/sell": "type", "series": "_ignore",
    # Groww trade statement
    "stock symbol": "symbol", "average traded price": "price",
    "stock/scrip name": "_name",
    # Binance trade history
    "date(utc)": "date", "pair": "symbol", "side": "type",
    "executed": "quantity", "amount": "_total", "fee": "_fee",
}

_VALID_TYPES = {"buy", "sell", "dividend", "interest", "split", "contribution", "withdrawal"}

_TYPE_ALIAS = {
    "b": "buy", "purchase": "buy", "bought": "buy",
    "s": "sell", "sale": "sell", "sold": "sell",
    "d": "dividend", "div": "dividend",
}


def _detect_broker(header: list[str]) -> str | None:
    """Auto-detect broker from CSV header columns."""
    lowers = {c.strip().lower() for c in header}
    if "pair" in lowers and ("date(utc)" in lowers or "side" in lowers):
        return "binance"
    if "stock symbol" in lowers or "average traded price" in lowers:
        return "groww"
    if ("instrument" in lowers or "avg. price" in lowers) and "series" in lowers:
        return "zerodha"
    return None


def _normalise_binance_symbol(pair: str) -> str:
    """Convert Binance pair notation to hyphenated form (BTCUSDT → BTC-USDT)."""
    for quote in ("USDT", "BUSD", "USDC", "BTC", "ETH", "BNB"):
        if len(pair) > len(quote) and pair.endswith(quote):
            return pair[:-len(quote)] + "-" + quote
    return pair


def _normalise_type(raw: str) -> str:
    v = raw.strip().lower()
    return _TYPE_ALIAS.get(v, v)


def _parse_date(raw: str) -> datetime | None:
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw.strip(), fmt)
        except ValueError:
            continue
    return None


def _validate_row(row: dict, idx: int) -> list[str]:
    errs = []
    if not row.get("symbol"):
        errs.append(f"row {idx}: missing symbol")
    if not row.get("date"):
        errs.append(f"row {idx}: missing or unparseable date")
    txn_type = row.get("type", "")
    if txn_type not in _VALID_TYPES:
        errs.append(f"row {idx}: invalid type '{txn_type}' — expected one of {sorted(_VALID_TYPES)}")
    try:
        qty = float(row.get("quantity", 0))
        if qty <= 0:
            errs.append(f"row {idx}: quantity must be > 0")
    except (TypeError, ValueError):
        errs.append(f"row {idx}: quantity is not a number")
    try:
        price = float(row.get("price", 0))
        if price < 0:
            errs.append(f"row {idx}: price must be ≥ 0")
    except (TypeError, ValueError):
        errs.append(f"row {idx}: price is not a number")
    return errs


def _map_columns(header: list[str]) -> dict[int, str]:
    """Return {col_index: internal_key} for recognised columns."""
    mapping = {}
    for i, col in enumerate(header):
        key = _COL_MAP.get(col.strip().lower())
        if key:
            mapping[i] = key
    return mapping


def _rows_from_records(records: list[dict], broker: str | None = None) -> tuple[list[dict], list[str]]:
    rows, errors = [], []

    # Auto-detect broker from first record's keys if not provided
    if not broker and records:
        broker = _detect_broker(list(records[0].keys()))

    for i, rec in enumerate(records, start=2):
        normalised = {}
        for raw_col, val in rec.items():
            key = _COL_MAP.get((raw_col or "").strip().lower())
            if key and not key.startswith("_"):
                normalised[key] = str(val).strip() if val is not None else ""

        if not normalised:
            continue

        # Binance: strip quantity unit suffix (e.g. "0.00154500 BTC" → "0.001545")
        if broker == "binance" and "quantity" in normalised:
            normalised["quantity"] = normalised["quantity"].split()[0]
        # Binance: normalize pair symbol
        if broker == "binance" and "symbol" in normalised:
            normalised["symbol"] = _normalise_binance_symbol(normalised["symbol"])

        if "date" in normalised:
            parsed = _parse_date(normalised["date"])
            normalised["date"] = parsed
        if "type" in normalised:
            normalised["type"] = _normalise_type(normalised["type"])

        errs = _validate_row(normalised, i)
        errors.extend(errs)
        if not errs:
            rows.append({
                "symbol":   normalised["symbol"].upper(),
                "type":     normalised["type"],
                "quantity": float(normalised["quantity"]),
                "price":    float(normalised["price"]),
                "date":     normalised["date"],
                "broker":   broker or "import",
            })

    return rows, errors


def _parse_csv(content: bytes, broker: str | None = None) -> tuple[list[dict], list[str]]:
    import csv
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return _rows_from_records(list(reader), broker=broker)


def _parse_xlsx(content: bytes, broker: str | None = None) -> tuple[list[dict], list[str]]:
    try:
        import openpyxl
    except ImportError:
        return [], ["openpyxl not installed — cannot parse XLSX files"]

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows_raw = list(ws.iter_rows(values_only=True))
    if not rows_raw:
        return [], ["Empty spreadsheet"]

    header = [str(c) if c is not None else "" for c in rows_raw[0]]
    records = []
    for row in rows_raw[1:]:
        rec = {header[i]: (str(v) if v is not None else "") for i, v in enumerate(row) if i < len(header)}
        records.append(rec)

    return _rows_from_records(records, broker=broker)


def _parse_pdf(content: bytes, broker: str | None = None) -> tuple[list[dict], list[str]]:
    try:
        import pdfplumber
    except ImportError:
        return [], ["pdfplumber not installed — cannot parse PDF files"]

    records = []
    header: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue
            if not header:
                # First page with a table: capture the header from row 0.
                header = [str(c or "") for c in table[0]]
            # Always skip row 0 (header) — every page repeats it.
            for row in table[1:]:
                if row:
                    rec = {header[i]: str(v or "") for i, v in enumerate(row) if i < len(header)}
                    records.append(rec)

    if not records:
        return [], ["No tables found in PDF. Verify the file contains a transaction table."]

    rows, errors = _rows_from_records(records, broker=broker)

    if not rows and not errors:
        recognised = sorted({k for k in _COL_MAP if not _COL_MAP[k].startswith("_")})
        found_cols = list(records[0].keys()) if records else []
        return [], [
            f"PDF columns not recognised. Found: {found_cols}. "
            f"Expected at least: date, symbol, type, quantity, price. "
            f"Supported aliases: {recognised[:12]}… "
            f"If this is a portfolio valuation or CAS statement, use the 'CAS / Holdings' tab instead."
        ]

    return rows, errors


def parse_transaction_file(content: bytes, ext: str, broker: str | None = None) -> tuple[list[dict], list[str]]:
    """Parse uploaded file bytes into normalised transaction dicts.

    Returns (rows, errors). Rows are valid; errors describe bad rows.
    """
    if ext in ("xlsx", "xls"):
        return _parse_xlsx(content, broker=broker)
    if ext == "pdf":
        return _parse_pdf(content, broker=broker)
    # Default to CSV
    return _parse_csv(content, broker=broker)


def commit_transactions(session: Session, rows: list[dict], user_id: int) -> int:
    """Bulk-insert parsed transaction rows. Returns count of rows committed.

    Rolls back and re-raises on any DB error so the caller receives a clean
    exception rather than a corrupted session state.
    """
    from app.modules.portfolio.models import Asset, Transaction

    committed = 0
    try:
        for row in rows:
            symbol = row["symbol"]
            asset = session.query(Asset).filter_by(symbol=symbol).first()
            if not asset:
                logger.warning("commit_transactions: asset %s not found, skipping", symbol)
                continue

            qty = row["quantity"]
            price = row["price"]
            session.add(Transaction(
                asset_id=asset.id,
                user_id=user_id,
                transaction_type=row["type"],
                quantity=qty,
                price=price,
                total_value=qty * price,
                transaction_date=row["date"],
                broker=row.get("broker", "import"),
                kind="trade",
            ))
            committed += 1

        session.commit()
    except Exception as exc:
        session.rollback()
        logger.exception("commit_transactions: rolled back after error: %s", exc)
        raise

    return committed
