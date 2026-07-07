"""Transaction and holding file parsers (CDSL CAS, Groww, Zerodha)."""

import io
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging import logger

# Accepted column names (case-insensitive) -> internal key
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
    # Zerodha console Tradebook export (CSV/XLSX)
    "trade id": "_order_id",
    # Groww trade statement (CSV)
    "stock symbol": "symbol", "average traded price": "price",
    "stock/scrip name": "_name",
    # Groww stock order history (XLSX)
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
    "executed": "quantity", "fee": "_fee",
}

_VALID_TYPES = {"buy", "sell", "dividend", "interest", "split", "bonus", "contribution", "withdrawal"}

_TYPE_ALIAS = {
    "b": "buy", "purchase": "buy", "bought": "buy",
    "lumpsum": "buy", "additional purchase": "buy", "sip": "buy",
    "switch in": "buy", "switch-in": "buy",
    "s": "sell", "sale": "sell", "sold": "sell",
    "redeem": "sell", "redemption": "sell",
    "switch out": "sell", "switch-out": "sell",
    "d": "dividend", "div": "dividend",
}

def _detect_broker(header: List[str]) -> Optional[str]:
    lowers = {c.strip().lower() for c in header}
    if "pair" in lowers and ("date(utc)" in lowers or "side" in lowers):
        return "binance"
    if ("fund name" in lowers or "scheme name" in lowers) and ("nav" in lowers or "nav (rs)" in lowers or "nav(rs.)" in lowers):
        return "groww_mf"
    if "execution date and time" in lowers:
        return "groww"
    if "stock symbol" in lowers or "average traded price" in lowers:
        return "groww"
    if ("instrument" in lowers or "avg. price" in lowers) and "series" in lowers:
        return "zerodha"
    # Zerodha console Tradebook export (Equity or Mutual Fund)
    if "trade type" in lowers and "segment" in lowers and "exchange" in lowers and (
        "trade id" in lowers or "order id" in lowers
    ):
        return "zerodha"
    return None

def _mf_symbol(name: str) -> str:
    slug = re.sub(r"[^A-Z0-9]+", "_", name.upper().strip())
    return slug[:40].rstrip("_") + "_MF"

def _normalise_binance_symbol(pair: str) -> str:
    from app.core.binance import split_quote_asset

    base, quote = split_quote_asset(pair)
    if base is None:
        return pair
    return f"{base}-{quote}"

def _normalise_type(raw: str) -> str:
    v = raw.strip().lower()
    return _TYPE_ALIAS.get(v, v)

def _parse_date(raw: str) -> Optional[datetime]:
    for fmt in (
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%Y/%m/%d",
        "%d-%b-%Y", "%d %B %Y",
        "%d-%m-%Y %I:%M %p", "%d-%m-%Y %H:%M",
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
    ):
        try:
            # Parse as naive and localize to UTC
            naive = datetime.strptime(raw.strip(), fmt)
            return naive.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None

def _validate_row(row: Dict[str, Any], idx: int) -> List[str]:
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

def _rows_from_records(records: List[Dict[str, Any]], broker: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[str]]:
    rows, errors = [], []

    if not broker and records:
        broker = _detect_broker(list(records[0].keys()))

    if records:
        found_cols = list(records[0].keys())
        recognised = [c for c in found_cols if _COL_MAP.get(c.strip().lower())]
        logger.debug(f"importer columns found={found_cols} recognised={recognised} broker={broker}")
        if not recognised:
            return [], [
                f"No recognised columns found. File headers: {found_cols}."
            ]

    for i, rec in enumerate(records, start=2):
        normalised: Dict[str, Any] = {}
        extras: Dict[str, str] = {}
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
        if not any(v.strip() for v in normalised.values() if isinstance(v, str)):
            continue

        if broker == "groww_mf":
            status = extras.get("_status", "").strip().lower()
            if status and status not in ("executed", "allotted", "redeemed", "completed", "successful", "success"):
                continue
            if not normalised.get("symbol") and extras.get("_name"):
                normalised["symbol"] = _mf_symbol(extras["_name"])

        if broker == "groww" and extras.get("_status", "").strip().lower() != "executed":
            if extras.get("_status"):
                continue

        if broker == "binance" and "quantity" in normalised:
            normalised["quantity"] = normalised["quantity"].split()[0]
        if broker == "binance" and "symbol" in normalised:
            normalised["symbol"] = _normalise_binance_symbol(normalised["symbol"])

        if extras.get("_segment", "").strip().upper() == "MF" and normalised.get("symbol"):
            if not extras.get("_name"):
                extras["_name"] = normalised["symbol"]
            normalised["symbol"] = _mf_symbol(normalised["symbol"])

        if (
            broker in ("zerodha", "groww")
            and extras.get("_segment", "").strip().upper() != "MF"
            and normalised.get("symbol")
            and not normalised["symbol"].upper().endswith((".NS", ".BO"))
        ):
            # NSE/BSE holdings of the same stock are fungible in an Indian demat
            # account — always canonicalise to NSE regardless of which exchange
            # a given historical trade executed on, so buys/sells of the same
            # stock across exchanges net into one position instead of splitting
            # into unrelated .NS/.BO symbols.
            normalised["symbol"] = f"{normalised['symbol'].upper()}.NS"

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
                "type":             normalised["type"].upper(),  # Store as uppercase
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

def _parse_csv(content: bytes, broker: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[str]]:
    import csv
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return _rows_from_records(list(reader), broker=broker)

def _parse_xlsx(content: bytes, broker: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[str]]:
    try:
        import openpyxl
    except ImportError:
        return [], ["openpyxl not installed — cannot parse XLSX files"]

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows_raw = list(ws.iter_rows(values_only=True))
    if not rows_raw:
        return [], ["Empty spreadsheet"]

    # Find the header row
    def _find_header_row(rows_list: List[Any]) -> int:
        for i, row in enumerate(rows_list):
            cols = [str(c).strip().lower() for c in row if c is not None]
            if sum(1 for c in cols if c in _COL_MAP) >= 3:
                return i
        return 0

    header_idx = _find_header_row(rows_raw)
    header = [str(c) if c is not None else "" for c in rows_raw[header_idx]]
    records = []
    for row in rows_raw[header_idx + 1:]:
        rec = {header[i]: (str(v) if v is not None else "") for i, v in enumerate(row) if i < len(header)}
        records.append(rec)

    return _rows_from_records(records, broker=broker)

def _parse_pdf(content: bytes, broker: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[str]]:
    try:
        import pdfplumber
    except ImportError:
        return [], ["pdfplumber not installed — cannot parse PDF files"]

    records = []
    header: List[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue
            if not header:
                header = [str(c or "") for c in table[0]]
            for row in table[1:]:
                if row:
                    rec = {header[i]: str(v or "") for i, v in enumerate(row) if i < len(header)}
                    records.append(rec)

    if not records:
        return [], ["No tables found in PDF. Verify the file contains a transaction table."]

    rows, errors = _rows_from_records(records, broker=broker)
    return rows, errors

def parse_transaction_file(content: bytes, ext: str, broker: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[str]]:
    if ext in ("xlsx", "xls"):
        return _parse_xlsx(content, broker=broker)
    if ext == "pdf":
        return _parse_pdf(content, broker=broker)
    return _parse_csv(content, broker=broker)


# ── CDSL CAS Parser ───────────────────────────────────────────────────────────

def _num(val: Any) -> Optional[float]:
    if val is None:
        return None
    s = str(val).replace(",", "").strip()
    if s in ("--", "-", "", "N/A", "NA"):
        return None
    try:
        return float(s)
    except ValueError:
        return None

def _norm(s: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

def _cell(row: List[Any], idx: int) -> str:
    if idx >= len(row) or row[idx] is None:
        return ""
    return str(row[idx]).replace("\n", " ").strip()

def _clean_isin(raw: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", raw.upper())

def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_")

def _clean_scheme_name(raw: str) -> str:
    s = raw.replace("\n", " ").strip()
    if "#" in s:
        after = s.split("#", 1)[1].strip()
        after = re.sub(r"^[A-Z0-9 ]+ MF-", "", after, flags=re.IGNORECASE).strip()
        return after if after else s
    return s

def _is_folio_header(row: List[Any]) -> bool:
    norms = {_norm(c) for c in row if c}
    return (
        any("isin" in n for n in norms) and
        any("folio" in n for n in norms) and
        any("scheme" in n for n in norms) and
        any("nav" in n for n in norms)
    )

def _is_holding_header(row: List[Any]) -> bool:
    norms = {_norm(c) for c in row if c}
    return (
        any("isin" in n for n in norms) and
        any("security" in n for n in norms) and
        any("currentbal" in n or (n.startswith("current") and "bal" in n) for n in norms) and
        any("marketprice" in n or "faceval" in n or ("market" in n and "price" in n) for n in norms)
    )

def _map_folio_cols(header_row: List[Any]) -> Dict[str, int]:
    m: Dict[str, int] = {}
    for ci, cell in enumerate(header_row):
        n = _norm(cell)
        raw = str(cell).lower()
        if "scheme" in n and "name" in n:
            m.setdefault("scheme", ci)
        elif n == "isin" or n == "isinisin":
            m.setdefault("isin", ci)
        elif "folio" in n:
            m.setdefault("folio", ci)
        elif "closing" in n or ("unit" in n and "closing" in n):
            m.setdefault("units", ci)
        elif "nav" in n and "cumul" not in n and "unreali" not in n and "valuation" not in n:
            m.setdefault("nav", ci)
        elif "cumul" in n or "invest" in n:
            m.setdefault("invested", ci)
        elif "valuation" in n:
            m.setdefault("valuation", ci)
        elif "unreali" in n and "%" not in raw:
            m.setdefault("pnl", ci)
        elif "unreali" in n and "%" in raw:
            m.setdefault("pnl_pct", ci)
    return m

def _map_holding_cols(header_row: List[Any]) -> Dict[str, int]:
    m: Dict[str, int] = {}
    for ci, cell in enumerate(header_row):
        n = _norm(cell)
        if n in ("isin", "isinisin"):
            m.setdefault("isin", ci)
        elif "security" in n:
            m.setdefault("security", ci)
        elif "currentbal" in n or (n.startswith("current") and len(n) < 20):
            m.setdefault("units", ci)
        elif "marketprice" in n or "faceval" in n or ("market" in n and "price" in n):
            m.setdefault("price", ci)
        elif "value" in n and "pledge" not in n and "setup" not in n and "face" not in n:
            m.setdefault("value", ci)
    return m

def _parse_folio_table(table: List[List[Any]]) -> List[Dict[str, Any]]:
    hdr_row, data_start = None, None
    for ri in range(min(3, len(table))):
        if _is_folio_header(table[ri]):
            hdr_row = table[ri]
            data_start = ri + 1
            break
    if hdr_row is None:
        return []
    col = _map_folio_cols(hdr_row)
    g = col.get
    results = []
    for row in table[data_start:]:
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue
        scheme = _cell(row, g("scheme", 0))
        if not scheme or "grand total" in scheme.lower() or "load structure" in scheme.lower():
            continue
        isin    = _clean_isin(_cell(row, g("isin", 1)))
        folio   = _cell(row, g("folio",    2))
        units   = _num(_cell(row, g("units",    3)))
        nav     = _num(_cell(row, g("nav",      4)))
        invested= _num(_cell(row, g("invested", 5)))
        val     = _num(_cell(row, g("valuation",6)))
        _num(_cell(row, g("pnl",      7)))
        _num(_cell(row, g("pnl_pct",  8)))

        if units is None or units <= 0:
            continue

        avg_nav = round(invested / units, 4) if units > 0 and invested and invested > 0 else 0.0
        results.append({
            "scheme_name": scheme,
            "isin": isin,
            "folio_no": folio,
            "units": units,
            "avg_nav": avg_nav,
            "current_nav": nav or 0.0,
            "valuation": val or 0.0,
            "source": "cas_folio"
        })
    return results

def _parse_holding_table(table: List[List[Any]], dp_name: str) -> List[Dict[str, Any]]:
    hdr_row, data_start = None, None
    for ri in range(min(3, len(table))):
        if _is_holding_header(table[ri]):
            hdr_row = table[ri]
            data_start = ri + 1
            break
    if hdr_row is None:
        return []
    col = _map_holding_cols(hdr_row)
    g = col.get
    results = []
    for row in table[data_start:]:
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue
        isin = _clean_isin(_cell(row, g("isin", 0)))
        if not isin.startswith("INF"):
            continue
        security_raw = _cell(row, g("security", 1))
        units = _num(_cell(row, g("units", 2)))
        price = _num(_cell(row, g("price", 7)))
        value = _num(_cell(row, g("value", 8)))

        if units is None or units <= 0:
            continue
        results.append({
            "scheme_name": _clean_scheme_name(security_raw),
            "isin": isin,
            "folio_no": "",
            "units": units,
            "avg_nav": 0.0,
            "current_nav": price or 0.0,
            "valuation": value or 0.0,
            "source": "cas_demat",
            "dp": dp_name
        })
    return results

def parse_cdsl_cas(content: bytes, password: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    try:
        import pdfplumber
    except ImportError:
        raise ImportError("pdfplumber not installed — cannot parse CDSL CAS PDF")

    open_kwargs = {}
    if password:
        open_kwargs["password"] = password

    try:
        pdf = pdfplumber.open(io.BytesIO(content), **open_kwargs)
    except Exception as exc:
        raise ValueError(f"Cannot open PDF: {exc}") from exc

    mf_folios = []
    demat_mf = []
    current_dp = ""

    _dp_pattern = re.compile(
        r"DP\s+Name\s*[:\-]\s*([A-Z][A-Z0-9 &()]+?)(?:\s{3,}|BO ID|$)",
        re.IGNORECASE,
    )

    with pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            tables = page.extract_tables() or []

            dm = _dp_pattern.search(text)
            if dm:
                cand = dm.group(1).strip().split("\n")[0].strip()
                if len(cand) > 3:
                    current_dp = cand

            for table in tables:
                if not table:
                    continue
                if any(_is_folio_header(table[ri]) for ri in range(min(3, len(table)))):
                    mf_folios.extend(_parse_folio_table(table))
                elif any(_is_holding_header(table[ri]) for ri in range(min(3, len(table)))):
                    demat_mf.extend(_parse_holding_table(table, current_dp))

    # Deduplicate demat
    seen = set()
    deduped_demat = []
    for h in demat_mf:
        key = (h["isin"], h["dp"])
        if key not in seen:
            seen.add(key)
            deduped_demat.append(h)

    # Merge by ISIN
    merged = {}
    for h in mf_folios:
        key = h["isin"] or h["folio_no"]
        merged[key] = {
            "isin": h["isin"],
            "scheme_name": h["scheme_name"],
            "units": h["units"],
            "avg_nav": h["avg_nav"],
            "current_nav": h["current_nav"],
            "source": "CDSL CAS (Folio)",
        }

    for h in deduped_demat:
        key = h["isin"]
        if key in merged:
            merged[key]["units"] += h["units"]
        else:
            merged[key] = {
                "isin": h["isin"],
                "scheme_name": h["scheme_name"],
                "units": h["units"],
                "avg_nav": 0.0,
                "current_nav": h["current_nav"],
                "source": "CDSL CAS (Demat)",
            }

    payloads = []
    for key, m in merged.items():
        isin = m["isin"]
        units = m["units"]
        avg_nav = m["avg_nav"]
        current_nav = m["current_nav"]
        symbol = f"{isin}_MF" if isin else f"{_slug(m['scheme_name'])}_MF"
        payloads.append({
            "symbol": symbol,
            "name": m["scheme_name"],
            "quantity": units,
            "avg_buy_price": avg_nav,
            "current_price": current_nav if current_nav else None,
            "source": m["source"],
            "asset_type": "mutual_fund",
        })

    summary = {
        "mf_folios_count": len(mf_folios),
        "demat_mf_count": len(deduped_demat),
        "merged_count": len(payloads),
    }

    return payloads, summary
