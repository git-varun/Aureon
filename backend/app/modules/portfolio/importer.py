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
    "date": "date", "trade date": "date", "trade_date": "date",
    "transaction date": "date", "transaction_date": "date",
    "symbol": "symbol", "ticker": "symbol", "scrip": "symbol", "stock": "symbol",
    "type": "type", "transaction type": "type", "transaction_type": "type",
    "trade type": "type", "trade_type": "type", "action": "type",
    "qty": "quantity", "quantity": "quantity", "shares": "quantity", "units": "quantity",
    "price": "price", "rate": "price", "trade price": "price", "avg price": "price",
    # Zerodha contract note
    "instrument": "symbol", "avg. price": "price", "net price": "price",
    "buy/sell": "type", "series": "_ignore",
    # Groww trade statement (CSV)
    "stock symbol": "symbol", "average traded price": "price",
    "stock/scrip name": "_name",
    # Groww stock order history (XLSX) — "Value" = total, no unit price column
    "stock name": "_name",
    "isin": "_isin",
    "segment": "_segment",
    "value": "_total",
    "exchange": "_exchange",
    "exchange order id": "_order_id",
    "execution date and time": "date",
    "order status": "_status",
    # Groww MF order history (CSV/XLSX)
    "fund name": "_name", "scheme name": "_name", "scheme": "_name",
    "nav": "price", "nav (rs)": "price", "nav(rs.)": "price",
    "order date": "date", "allotment date": "date",
    "order type": "type",
    "units allotted": "quantity", "units purchased": "quantity",
    "units redeemed": "quantity",
    "amount (rs)": "_total", "amount(rs.)": "_total", "amount": "_total",
    "folio no": "_folio", "folio number": "_folio",
    "order id": "_order_id",
    # Binance trade history
    "date(utc)": "date", "pair": "symbol", "side": "type",
    "executed": "quantity", "amount": "_total", "fee": "_fee",
}

_VALID_TYPES = {"buy", "sell", "dividend", "interest", "split", "contribution", "withdrawal"}

_TYPE_ALIAS = {
    "b": "buy", "purchase": "buy", "bought": "buy",
    "lumpsum": "buy", "additional purchase": "buy", "sip": "buy",
    "switch in": "buy", "switch-in": "buy",
    "s": "sell", "sale": "sell", "sold": "sell",
    "redeem": "sell", "redemption": "sell",
    "switch out": "sell", "switch-out": "sell",
    "d": "dividend", "div": "dividend",
}


def _detect_broker(header: list[str]) -> str | None:
    """Auto-detect broker from CSV/XLSX header columns."""
    lowers = {c.strip().lower() for c in header}
    if "pair" in lowers and ("date(utc)" in lowers or "side" in lowers):
        return "binance"
    # Groww MF order history has fund name / NAV columns
    if ("fund name" in lowers or "scheme name" in lowers) and ("nav" in lowers or "nav (rs)" in lowers or "nav(rs.)" in lowers):
        return "groww_mf"
    # Groww XLSX stock order history has this unique column
    if "execution date and time" in lowers:
        return "groww"
    if "stock symbol" in lowers or "average traded price" in lowers:
        return "groww"
    if ("instrument" in lowers or "avg. price" in lowers) and "series" in lowers:
        return "zerodha"
    return None


def _mf_symbol(name: str) -> str:
    """Derive a stable symbol slug from a mutual fund scheme name."""
    import re
    slug = re.sub(r"[^A-Z0-9]+", "_", name.upper().strip())
    return slug[:40].rstrip("_") + "_MF"


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
    for fmt in (
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%Y/%m/%d",
        "%d-%b-%Y", "%d %B %Y",
        # Groww XLSX: "02-04-2026 03:28 PM"
        "%d-%m-%Y %I:%M %p", "%d-%m-%Y %H:%M",
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
    ):
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


def _find_header_row(rows_raw: list) -> int:
    """Find the first row with ≥ 3 recognised column names (skips metadata rows)."""
    for i, row in enumerate(rows_raw):
        cols = [str(c).strip().lower() for c in row if c is not None]
        if sum(1 for c in cols if c in _COL_MAP) >= 3:
            return i
    return 0


def _rows_from_records(records: list[dict], broker: str | None = None) -> tuple[list[dict], list[str]]:
    rows, errors = [], []

    # Auto-detect broker from first record's keys if not provided
    if not broker and records:
        broker = _detect_broker(list(records[0].keys()))

    if records:
        found_cols = list(records[0].keys())
        recognised = [c for c in found_cols if _COL_MAP.get(c.strip().lower())]
        logger.debug("importer columns found=%s recognised=%s broker=%s", found_cols, recognised, broker)
        if not recognised:
            return [], [
                f"No recognised columns found. File headers: {found_cols}. "
                f"Expected at least one of: date, symbol, type, quantity, price, nav, fund name, scheme name, transaction date, order date, units, units allotted."
            ]

    for i, rec in enumerate(records, start=2):
        normalised: dict[str, Any] = {}
        extras: dict[str, str] = {}  # internal _-prefixed fields
        for raw_col, val in rec.items():
            key = _COL_MAP.get((raw_col or "").strip().lower())
            if key is None:
                continue
            str_val = str(val).strip() if val is not None else ""
            if key.startswith("_"):
                extras[key] = str_val
            else:
                normalised[key] = str_val

        if not normalised:
            continue
        # Skip spacer/blank rows where every mapped value is an empty string
        if not any(v.strip() for v in normalised.values() if isinstance(v, str)):
            continue

        # Groww MF: derive symbol from fund/scheme name; filter non-executed orders
        if broker == "groww_mf":
            status = extras.get("_status", "").strip().lower()
            if status and status not in ("executed", "allotted", "redeemed", "completed", "successful", "success"):
                continue
            # Use scheme name as symbol when no explicit symbol column exists
            if not normalised.get("symbol") and extras.get("_name"):
                normalised["symbol"] = _mf_symbol(extras["_name"])

        # Groww XLSX: skip non-executed orders (cancelled, rejected, etc.)
        if broker == "groww" and extras.get("_status", "").strip().lower() != "executed":
            if extras.get("_status"):  # only skip if status column present; don't filter generic rows
                continue

        # Binance: strip quantity unit suffix (e.g. "0.00154500 BTC" → "0.001545")
        if broker == "binance" and "quantity" in normalised:
            normalised["quantity"] = normalised["quantity"].split()[0]
        # Binance: normalize pair symbol
        if broker == "binance" and "symbol" in normalised:
            normalised["symbol"] = _normalise_binance_symbol(normalised["symbol"])

        # Zerodha MF tradebook: symbol column contains full fund name — slugify it
        if extras.get("_segment", "").strip().upper() == "MF" and normalised.get("symbol"):
            if not extras.get("_name"):
                extras["_name"] = normalised["symbol"]
            normalised["symbol"] = _mf_symbol(normalised["symbol"])

        # Derive unit price from total value / quantity when no unit price column present
        if "price" not in normalised and "_total" in extras:
            try:
                total = float(extras["_total"].replace(",", ""))
                qty = float(normalised.get("quantity", "0"))
                if qty > 0:
                    normalised["price"] = str(round(total / qty, 4))
            except (ValueError, ZeroDivisionError):
                pass

        if "date" in normalised:
            parsed = _parse_date(normalised["date"])
            normalised["date"] = parsed
        if "type" in normalised:
            normalised["type"] = _normalise_type(normalised["type"])

        errs = _validate_row(normalised, i)
        errors.extend(errs)
        if not errs:
            rows.append({
                "symbol":           normalised["symbol"].upper(),
                "type":             normalised["type"],
                "quantity":         float(normalised["quantity"]),
                "price":            float(normalised["price"]),
                "date":             normalised["date"],
                "broker":           broker or "import",
                "broker_reference": extras.get("_order_id") or None,
                "isin":             extras.get("_isin") or None,
                "exchange":         extras.get("_exchange") or None,
                "name":             extras.get("_name") or None,
                "asset_type":       "mutual_fund" if broker == "groww_mf" else None,
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

    # Find the actual header row — some exports (e.g. Groww XLSX) include metadata rows before column headers
    header_idx = _find_header_row(rows_raw)
    header = [str(c) if c is not None else "" for c in rows_raw[header_idx]]
    records = []
    for row in rows_raw[header_idx + 1:]:
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


def commit_transactions(session: Session, rows: list[dict], user_id: int) -> tuple[int, int]:
    """Bulk-insert parsed transaction rows. Returns (committed, skipped_duplicates).

    - Auto-creates missing Asset rows from symbol/name/isin in the row.
    - Skips rows where (broker, broker_reference) already exists (dedup on re-upload).
    - Rolls back and re-raises on any DB error.
    """
    from app.modules.portfolio.models import Asset, Transaction
    from app.shared.constants import AssetType

    committed = 0
    skipped_dup = 0
    trade_asset_ids: set[int] = set()
    try:
        for row in rows:
            symbol = row["symbol"][:120]  # guard against column width
            asset = session.query(Asset).filter_by(symbol=symbol).first()
            if not asset:
                row_asset_type = row.get("asset_type")
                if row_asset_type:
                    asset_type = row_asset_type
                else:
                    # Classify by ISIN prefix: INE = equity, INF = ETF (traded on exchange → equity)
                    asset_type = AssetType.EQUITY.value
                asset = Asset(
                    symbol=symbol,
                    name=row.get("name") or symbol,
                    asset_type=asset_type,
                    exchange=row.get("exchange"),
                )
                session.add(asset)
                session.flush()
                logger.info("commit_transactions: auto-created asset %s", symbol)

            # Dedup: skip if this broker order was already imported
            broker_ref = row.get("broker_reference")
            broker_name = row.get("broker", "import")
            if broker_ref:
                exists = session.query(Transaction).filter_by(
                    broker=broker_name,
                    broker_reference=broker_ref,
                ).first()
                if exists:
                    skipped_dup += 1
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
                broker=broker_name,
                broker_reference=broker_ref,
                kind="trade",
            ))
            committed += 1

            # Track BUY/SELL assets for position recalculation
            if row["type"] in ("buy", "sell"):
                trade_asset_ids.add(asset.id)

        # Recalculate positions for all affected BUY/SELL assets
        if trade_asset_ids:
            from app.modules.portfolio.services import PortfolioService
            svc = PortfolioService(session)
            for asset_id in trade_asset_ids:
                svc.recalculate_position(asset_id, user_id)

        session.commit()
    except Exception as exc:
        session.rollback()
        logger.exception("commit_transactions: rolled back after error: %s", exc)
        raise

    if skipped_dup:
        logger.info("commit_transactions: skipped %d duplicate transactions", skipped_dup)

    return committed, skipped_dup
