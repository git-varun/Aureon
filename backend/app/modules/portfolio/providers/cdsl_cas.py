"""CDSL Consolidated Account Statement (CAS) PDF parser.

Extracts mutual fund holdings from two sections of a CDSL CAS PDF:
  1. MF/RTA folios  — "MUTUAL FUND UNITS HELD WITH MF/RTA" table
                      (scheme name, ISIN, folio, units, NAV, invested, valuation, P&L)
  2. Demat-held MF  — HOLDING STATEMENT tables filtered to ISIN prefix "INF"
                      (units and current NAV; cost basis unavailable)

The PDF uses bilingual Hindi+English embedded fonts, so raw cell text contains
garbled Unicode. All header matching is done on a normalized form that strips
non-ASCII characters and whitespace, making it robust to these artifacts.

Usage
-----
    result = parse_cas("/path/to/cdsl_cas.pdf")
    result = parse_cas("/path/to/cdsl_cas.pdf", password="ABCDE1234F")

    result.mf_folios          # List[MFFolioHolding]
    result.demat_mf           # List[DematMFHolding]
    result.to_holdings_json() # list compatible with MutualFundSync
    result.summary()          # dict with totals
"""

import re
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, List, Optional

import pdfplumber

logger = logging.getLogger("providers.cdsl_cas")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _num(val: Any) -> Optional[float]:
    """Parse Indian-formatted number string → float. Returns None on failure."""
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
    """Strip all non-ASCII chars and whitespace, lowercase — for header matching."""
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _cell(row: list, idx: int) -> str:
    """Safe cell access with newline collapse and strip."""
    if idx >= len(row) or row[idx] is None:
        return ""
    return str(row[idx]).replace("\n", " ").strip()


def _clean_isin(raw: str) -> str:
    """Strip soft-hyphens, spaces, and non-alphanumeric chars from ISIN."""
    return re.sub(r"[^A-Z0-9]", "", raw.upper())


def _clean_scheme_name(raw: str) -> str:
    """
    Demat security names are formatted as:
        "AMC LTD#AMC MF-SCHEME NAME-PLAN-GROWTH"
    Extract the human-readable part after '#', strip the "AMC MF-" prefix.
    """
    s = raw.replace("\n", " ").strip()
    if "#" in s:
        after = s.split("#", 1)[1].strip()
        after = re.sub(r"^[A-Z0-9 ]+ MF-", "", after, flags=re.IGNORECASE).strip()
        return after if after else s
    return s


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class MFFolioHolding:
    """Mutual fund units held directly with an AMC/RTA (folio form)."""
    scheme_name: str
    isin: str
    folio_no: str
    units: float
    nav: float                  # current NAV as of statement date
    invested: float             # cumulative amount invested (INR)
    valuation: float
    unrealised_pnl: float
    unrealised_pnl_pct: float
    avg_nav: float = 0.0        # derived: invested / units

    def __post_init__(self):
        if self.units > 0 and self.invested > 0:
            self.avg_nav = round(self.invested / self.units, 4)


@dataclass
class DematMFHolding:
    """Mutual fund units held in demat form (via a depository participant)."""
    isin: str
    security_raw: str           # raw security string from PDF
    scheme_name: str            # cleaned scheme name
    dp_name: str                # e.g. "ZERODHA BROKING LIMITED"
    units: float
    market_price: float         # current NAV / market price
    value: float


@dataclass
class CASResult:
    investor_name: str = ""
    pan: str = ""
    cas_id: str = ""
    period_from: str = ""
    period_to: str = ""
    mf_folios: List[MFFolioHolding] = field(default_factory=list)
    demat_mf: List[DematMFHolding] = field(default_factory=list)

    def to_holdings_json(self) -> list:
        """Return list compatible with MutualFundSync holdings_json format.

        Folio holdings include full cost basis (avg_nav = invested / units).
        Demat holdings set avg_nav=0 because cost basis is not in the CAS.
        Same ISIN may appear in both folio and demat — they are kept separate.
        """
        out = []
        for h in self.mf_folios:
            out.append({
                "scheme_name": h.scheme_name,
                "isin": h.isin,
                "folio_no": h.folio_no,
                "units": h.units,
                "avg_nav": h.avg_nav,
                "current_nav": h.nav,
                "source": "cas_folio",
            })
        for h in self.demat_mf:
            out.append({
                "scheme_name": h.scheme_name,
                "isin": h.isin,
                "folio_no": "",
                "units": h.units,
                "avg_nav": 0.0,
                "current_nav": h.market_price,
                "source": "cas_demat",
                "dp": h.dp_name,
            })
        return out

    def summary(self) -> dict:
        folio_val = sum(h.valuation for h in self.mf_folios)
        demat_val = sum(h.value for h in self.demat_mf)
        return {
            "investor": self.investor_name,
            "pan": self.pan,
            "cas_id": self.cas_id,
            "period": f"{self.period_from} to {self.period_to}",
            "mf_folios": len(self.mf_folios),
            "demat_mf_holdings": len(self.demat_mf),
            "folio_value_inr": round(folio_val, 2),
            "demat_mf_value_inr": round(demat_val, 2),
            "total_mf_value_inr": round(folio_val + demat_val, 2),
        }


# ── Header detection (normalized — immune to Hindi/garbled text) ──────────────

def _is_folio_header(row: list) -> bool:
    """True if this row looks like the MF folio table header."""
    norms = {_norm(c) for c in row if c}
    return (
        any("isin" in n for n in norms) and
        any("folio" in n for n in norms) and
        any("scheme" in n for n in norms) and
        any("nav" in n for n in norms)
    )


def _is_holding_header(row: list) -> bool:
    """True if this row looks like a HOLDING STATEMENT table header (9-col)."""
    norms = {_norm(c) for c in row if c}
    return (
        any("isin" in n for n in norms) and
        any("security" in n for n in norms) and
        any("currentbal" in n or (n.startswith("current") and "bal" in n) for n in norms) and
        any("marketprice" in n or "faceval" in n or ("market" in n and "price" in n) for n in norms)
    )


# ── Column index mapper ───────────────────────────────────────────────────────

def _map_folio_cols(header_row: list) -> dict:
    """Return {field: col_index} for the MF folio table."""
    m: dict = {}
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


def _map_holding_cols(header_row: list) -> dict:
    """Return {field: col_index} for the HOLDING STATEMENT table."""
    m: dict = {}
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


# ── Table parsers ─────────────────────────────────────────────────────────────

def _parse_folio_table(table: list) -> List[MFFolioHolding]:
    """Parse the MF/RTA folio table. Header may be at row 0 or row 1."""
    hdr_row, data_start = None, None

    for ri in range(min(3, len(table))):
        if _is_folio_header(table[ri]):
            hdr_row = table[ri]
            data_start = ri + 1
            break

    if hdr_row is None:
        return []

    col = _map_folio_cols(hdr_row)
    if not col:
        return []

    g = col.get
    results: List[MFFolioHolding] = []

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
        pnl     = _num(_cell(row, g("pnl",      7)))
        pnl_pct = _num(_cell(row, g("pnl_pct",  8)))

        if units is None or units <= 0:
            continue
        results.append(MFFolioHolding(
            scheme_name=scheme,
            isin=isin,
            folio_no=folio,
            units=units,
            nav=nav or 0.0,
            invested=invested or 0.0,
            valuation=val or 0.0,
            unrealised_pnl=pnl or 0.0,
            unrealised_pnl_pct=pnl_pct or 0.0,
        ))

    logger.info("cdsl_cas: parsed %d MF folio holdings", len(results))
    return results


def _parse_holding_table(table: list, dp_name: str) -> List[DematMFHolding]:
    """Parse a HOLDING STATEMENT table; return only rows with INF* ISINs (MF)."""
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
    results: List[DematMFHolding] = []

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
        results.append(DematMFHolding(
            isin=isin,
            security_raw=security_raw,
            scheme_name=_clean_scheme_name(security_raw),
            dp_name=dp_name,
            units=units,
            market_price=price or 0.0,
            value=value or 0.0,
        ))

    logger.debug("cdsl_cas: holding table gave %d demat MF rows (dp=%r)", len(results), dp_name)
    return results


# ── Metadata extraction ───────────────────────────────────────────────────────

_RE_CAS_ID = re.compile(r"CAS\s*ID\s*[:\-]\s*([A-Z0-9]+)", re.IGNORECASE)
_RE_PAN    = re.compile(r"PAN\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])")
_RE_NAME   = re.compile(r"single name of\s+([A-Z][A-Z ]+?)(?:\s*\(|\s*$)", re.IGNORECASE | re.MULTILINE)
_RE_DP     = re.compile(r"DP\s+Name\s*[:\-]\s*([A-Z][A-Z &()]+?)(?:\s{2,}|$)", re.IGNORECASE | re.MULTILINE)
_RE_DATE   = re.compile(r"(\d{2}[-/]\w{3}[-/]\d{4})")


def _extract_metadata(tables_by_page: list, pages_text: list, result: CASResult) -> None:
    """Extract investor name, PAN, CAS ID, and period from early pages."""
    full = "\n".join(pages_text[:5])

    m = _RE_CAS_ID.search(full)
    if m:
        result.cas_id = m.group(1).strip()

    m = _RE_PAN.search(full)
    if m:
        result.pan = m.group(1).strip()

    m = _RE_NAME.search(full)
    if m:
        result.investor_name = " ".join(m.group(1).split())

    # period: look for two DD-Mon-YYYY dates in the summary table text
    # (Page 2 table header has "Statement for the period from ... to ...")
    for page_tables in tables_by_page[:3]:
        for table in page_tables:
            for row in table:
                row_text = " ".join(str(c or "") for c in row)
                dates = _RE_DATE.findall(row_text)
                if len(dates) >= 2:
                    result.period_from = dates[0]
                    result.period_to = dates[-1]
                    return
                if "period" in row_text.lower() and len(dates) == 1:
                    result.period_to = dates[0]


# ── Main entry point ──────────────────────────────────────────────────────────

def parse_cas(pdf_path: str | Path, password: Optional[str] = None) -> CASResult:
    """Parse a CDSL CAS PDF and return all MF holdings.

    Args:
        pdf_path: Path to the CDSL CAS PDF file.
        password: PDF password if encrypted (typically PAN in uppercase).

    Returns:
        CASResult with mf_folios and demat_mf populated.

    Raises:
        FileNotFoundError: if pdf_path does not exist.
        ValueError: if the PDF cannot be opened (wrong password, corrupt file).
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"CAS PDF not found: {path}")

    open_kwargs: dict = {}
    if password:
        open_kwargs["password"] = password

    try:
        pdf = pdfplumber.open(str(path), **open_kwargs)
    except Exception as exc:
        raise ValueError(f"Cannot open PDF: {exc}") from exc

    result = CASResult()
    pages_text: list[str] = []
    tables_by_page: list[list] = []
    current_dp: str = ""

    # Track which DP holding tables belong to — scan page text for "DP Name : X"
    # and the portfolio value footer line to know when a DP section ends.
    _dp_pattern = re.compile(
        r"DP\s+Name\s*[:\-]\s*([A-Z][A-Z0-9 &()]+?)(?:\s{3,}|BO ID|$)",
        re.IGNORECASE,
    )

    with pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages_text.append(text)
            tables = page.extract_tables() or []
            tables_by_page.append(tables)

            # Update current_dp when we encounter a DP Name line in the text.
            # The text is garbled by Hindi fonts on most pages, but "DP Name" and
            # the broker names are often legible enough for this regex.
            dm = _dp_pattern.search(text)
            if dm:
                cand = dm.group(1).strip().split("\n")[0].strip()
                if len(cand) > 3:
                    current_dp = cand
                    logger.debug("cdsl_cas: switched DP → %r", current_dp)

            for table in tables:
                if not table:
                    continue

                # ── MF folio table ────────────────────────────────────────────
                # Section title is row 0 ("MUTUAL FUND UNITS HELD AS ON ..."),
                # actual header is row 1 ("Scheme Name | ISIN | Folio No | ...")
                if any(_is_folio_header(table[ri]) for ri in range(min(3, len(table)))):
                    folios = _parse_folio_table(table)
                    result.mf_folios.extend(folios)

                # ── Demat holding statement table ─────────────────────────────
                elif any(_is_holding_header(table[ri]) for ri in range(min(3, len(table)))):
                    mf_rows = _parse_holding_table(table, current_dp)
                    result.demat_mf.extend(mf_rows)

    _extract_metadata(tables_by_page, pages_text, result)

    # Deduplicate demat_mf: same ISIN in same DP → keep first (avoids ELSS
    # lock-in detail rows re-appearing as a holding row on a different page).
    seen: set = set()
    deduped: List[DematMFHolding] = []
    for h in result.demat_mf:
        key = (h.isin, h.dp_name)
        if key not in seen:
            seen.add(key)
            deduped.append(h)
    result.demat_mf = deduped

    logger.info(
        "cdsl_cas: complete — investor=%r pan=%r folios=%d demat_mf=%d",
        result.investor_name, result.pan,
        len(result.mf_folios), len(result.demat_mf),
    )
    return result


# ── AssetSource adapter ───────────────────────────────────────────────────────

class CASAssetSource:
    """Wraps a CASResult as an AssetSource so it can be fed directly into
    PortfolioService.sync_portfolio() without any extra glue.

    Merge logic (per ISIN):
    - Folio + demat for same ISIN → combined units, folio avg_nav (only known cost basis).
    - Demat-only → units from demat, avg_nav = 0 (cost basis unknown from CAS).
    """

    provider_name = "cas_cdsl"

    def __init__(self, cas_result: CASResult):
        self._result = cas_result

    def validate_credentials(self) -> None:
        if not self._result.mf_folios and not self._result.demat_mf:
            raise ValueError("CAS PDF contained no mutual fund holdings.")

    def fetch_holdings(self):
        from app.shared.interfaces import AssetPayload

        # Merge by ISIN: folio takes precedence for cost basis
        folio_by_isin: dict = {h.isin: h for h in self._result.mf_folios if h.isin}
        merged: dict = {}  # isin → {units, avg_nav, scheme_name, current_nav}

        for h in self._result.mf_folios:
            key = h.isin or h.folio_no
            merged[key] = {
                "isin": h.isin,
                "scheme_name": h.scheme_name,
                "units": h.units,
                "avg_nav": h.avg_nav,
                "current_nav": h.nav,
            }

        for h in self._result.demat_mf:
            key = h.isin
            if key in merged:
                # Same ISIN held in both folio and demat — add units, keep folio cost basis
                merged[key]["units"] += h.units
            else:
                merged[key] = {
                    "isin": h.isin,
                    "scheme_name": h.scheme_name,
                    "units": h.units,
                    "avg_nav": 0.0,
                    "current_nav": h.market_price,
                }

        payloads = []
        for key, m in merged.items():
            isin = m["isin"]
            units = m["units"]
            avg_nav = m["avg_nav"]
            current_nav = m["current_nav"]
            symbol = f"{isin}_MF" if isin else f"{_slug(m['scheme_name'])}_MF"
            current_value = round(units * current_nav, 2) if current_nav else round(units * avg_nav, 2)
            unrealised_pnl = round(current_value - units * avg_nav, 2) if avg_nav else 0.0

            try:
                payloads.append(AssetPayload(
                    symbol=symbol,
                    name=m["scheme_name"],
                    qty=units,
                    avg_buy_price=avg_nav,
                    current_price=current_nav if current_nav else None,
                    source="CAS (CDSL)",
                    type="mutual_fund",
                    unrealized_pnl=unrealised_pnl,
                    positions=[{
                        "source": "CAS (CDSL)",
                        "market_type": "spot",
                        "position_type": "long",
                        "qty": units,
                        "avg_buy_price": avg_nav,
                        "unrealized_pnl": unrealised_pnl,
                    }],
                ))
            except Exception as exc:
                logger.error("CASAssetSource: schema error for %s: %s", symbol, exc)

        logger.info("CASAssetSource: yielding %d merged MF positions", len(payloads))
        return payloads


# ── CLI smoke-test ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys, json
    logging.basicConfig(level=logging.DEBUG)

    if len(sys.argv) < 2:
        print("Usage: python cdsl_cas.py <path_to_cas.pdf> [password]")
        sys.exit(1)

    pw = sys.argv[2] if len(sys.argv) > 2 else None
    cas = parse_cas(sys.argv[1], password=pw)

    print("\n=== Summary ===")
    print(json.dumps(cas.summary(), indent=2, ensure_ascii=False))

    print("\n=== MF Folio Holdings ===")
    for h in cas.mf_folios:
        print(f"  {h.scheme_name[:52]:<52} | {h.units:>10.3f} u | NAV {h.nav:>8.4f}"
              f" | Invested {h.invested:>10,.0f} | Value {h.valuation:>10,.2f}"
              f" | P&L {h.unrealised_pnl_pct:>+6.2f}%")

    print("\n=== Demat-held MF ===")
    for h in cas.demat_mf:
        print(f"  [{h.dp_name[:20]:<20}] {h.scheme_name[:45]:<45}"
              f" | {h.units:>10.3f} u | NAV {h.market_price:>8.3f} | Value {h.value:>10,.2f}")

    print("\n=== holdings_json ===")
    print(json.dumps(cas.to_holdings_json(), indent=2, ensure_ascii=False))
