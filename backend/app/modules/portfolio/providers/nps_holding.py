"""NPS Holding Statement PDF parser (Protean CRA format).

Parses "Statement of Holding for NPS" PDFs from the Protean CRA portal
(https://cra.nps-proteantech.in/).  Extracts Tier I and Tier II holdings
with scheme-level detail (units, current NAV, current value).

⚠ Cost basis is NOT available in the holding statement.  avg_buy_price is
  set to 0 for all NPS positions.  If you need returns / XIRR, download a
  Transaction Statement from the same portal.

Usage
-----
    result = parse_nps_holding("/path/to/nps_holding.pdf")
    result.tier1_schemes    # List[NPSSchemeHolding]
    result.tier2_schemes    # List[NPSSchemeHolding]
    result.summary()        # dict with totals
    result.to_holdings_json()
"""

import re
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, List, Optional

import pdfplumber

logger = logging.getLogger("providers.nps_holding")


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


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class NPSSchemeHolding:
    """One NPS sub-scheme holding (E, C, or G class)."""
    scheme_name: str        # full canonical name
    fund_manager: str       # e.g. "HDFC PENSION FUND MANAGEMENT LIMITED"
    scheme_type: str        # "E", "C", or "G"
    tier: str               # "I" or "II"
    total_units: float
    blocked_units: float
    nav: float              # current NAV (Rs.)
    current_value: float    # Total Value of Scheme (Rs.)


@dataclass
class NPSHoldingResult:
    pran: str = ""
    subscriber_name: str = ""
    pan: str = ""
    statement_date: str = ""
    tier1_schemes: List[NPSSchemeHolding] = field(default_factory=list)
    tier2_schemes: List[NPSSchemeHolding] = field(default_factory=list)

    def tier1_total(self) -> float:
        return sum(s.current_value for s in self.tier1_schemes)

    def tier2_total(self) -> float:
        return sum(s.current_value for s in self.tier2_schemes)

    def total(self) -> float:
        return self.tier1_total() + self.tier2_total()

    def summary(self) -> dict:
        return {
            "pran": self.pran,
            "subscriber": self.subscriber_name,
            "pan": self.pan,
            "statement_date": self.statement_date,
            "tier1_schemes": len(self.tier1_schemes),
            "tier2_schemes": len(self.tier2_schemes),
            "tier1_value_inr": round(self.tier1_total(), 2),
            "tier2_value_inr": round(self.tier2_total(), 2),
            "total_value_inr": round(self.total(), 2),
        }

    def to_holdings_json(self) -> list:
        out = []
        for s in self.tier1_schemes + self.tier2_schemes:
            out.append({
                "scheme_name": s.scheme_name,
                "fund_manager": s.fund_manager,
                "scheme_type": s.scheme_type,
                "tier": s.tier,
                "total_units": s.total_units,
                "blocked_units": s.blocked_units,
                "nav": s.nav,
                "current_value": s.current_value,
            })
        return out


# ── Regex patterns ─────────────────────────────────────────────────────────────

# The CRA portal PDF is an HTML page printed to PDF.  pdfplumber extracts text
# line-by-line from the visual layout, resulting in scheme names that are split
# across multiple lines with the 7 data columns interleaved.
#
# Two observed layouts (verified against actual CRA PDF output):
#
# HDFC (name wraps mid-row — numbers appear on the middle name line):
#   "NPS TRUST A/C HDFC PENSION FUND"
#   "MANAGEMENT LIMITED SCHEME C - 262.8959 0.0000 262.8959 30.0836 7,908.85 0.00 7,908.85"
#   "TIER I DIRECT"
#
# ICICI (numbers are on a standalone line between name parts):
#   "NPS TRUST A/C ICICI PRUDENTIAL PENSION"
#   "6.5346 0.0000 6.5346 57.8640 378.11 0.00 378.11"
#   "FUND SCHEME E - TIER II DIRECT"
#
# Strategy: identify lines with exactly 7 decimal numbers (the data row), then
# reconstruct the full scheme name from surrounding lines.

_RE_PRAN = re.compile(r"PRAN\s+(\d{12})")
_RE_PAN = re.compile(r"PAN\s+([A-Z]{5}\d{4}[A-Z])")
_RE_DATE = re.compile(r"Statement\s+Generation\s+Date\s*[:\-]\s*(.+?)(?:\n|$)", re.IGNORECASE)
_RE_NAME = re.compile(
    r"Name\s+((?:SHRI|SMT|KUM|MR\.?|MS\.?|DR\.?)\s+[A-Z][A-Z\s\.]+?)(?:\n|Address|\d)",
    re.IGNORECASE,
)
_RE_DECIMAL = re.compile(r"[\d,]+\.\d+")
_RE_TIER_DIRECT = re.compile(r"TIER\s+(I{1,2})\s+DIRECT", re.IGNORECASE)
_RE_SCHEME_NAME = re.compile(
    r"NPS\s+TRUST\s+A/C\s+(.*?)\s+SCHEME\s+([ECG])\s*[-–]\s*TIER\s+(I{1,2})\s+DIRECT",
    re.IGNORECASE,
)


# ── Metadata + scheme extraction ──────────────────────────────────────────────

def _extract_metadata(text: str, result: NPSHoldingResult) -> None:
    m = _RE_PRAN.search(text)
    if m:
        result.pran = m.group(1)

    m = _RE_PAN.search(text)
    if m:
        result.pan = m.group(1)

    m = _RE_DATE.search(text)
    if m:
        result.statement_date = m.group(1).strip()

    m = _RE_NAME.search(text)
    if m:
        result.subscriber_name = re.sub(r"\s+", " ", m.group(1)).strip()


def _parse_schemes(text: str) -> List[NPSSchemeHolding]:
    """Extract scheme holdings using a line-by-line context assembler.

    For each line with 7 decimal numbers (the data row), look backward for the
    "NPS TRUST A/C" line that starts the scheme name, and forward for the
    "TIER I/II DIRECT" line that ends it.  Handles both HDFC (numbers inline
    with middle name part) and ICICI (numbers on a standalone line) layouts.
    """
    lines = text.split("\n")
    schemes: List[NPSSchemeHolding] = []
    seen: set = set()

    for i, line in enumerate(lines):
        stripped = line.strip()
        nums = _RE_DECIMAL.findall(stripped)

        # Data rows have exactly 7 decimal numbers; preference rows have 1,
        # Total rows have 3 — so < 7 naturally excludes all non-data lines.
        if len(nums) < 7:
            continue

        # ── Backward scan: find "NPS TRUST A/C ..." start of scheme name ──
        backward: list[str] = []
        j = i - 1
        while j >= 0:
            prev = lines[j].strip()
            if not prev:
                break
            backward.insert(0, prev)
            if "NPS TRUST A/C" in prev.upper():
                break
            j -= 1

        # ── Inline name part: strip the numbers from the current line ──
        name_inline = _RE_DECIMAL.sub("", stripped).strip()

        # ── Forward scan: find "TIER I/II DIRECT" end of scheme name ──
        forward: list[str] = []
        j = i + 1
        while j < len(lines):
            nxt = lines[j].strip()
            if not nxt:
                break
            forward.append(nxt)
            if _RE_TIER_DIRECT.search(nxt):
                break
            j += 1

        # ── Assemble full name and parse components ──
        parts = backward + ([name_inline] if name_inline else []) + forward
        full_name = re.sub(r"\s+", " ", " ".join(parts)).strip()

        m = _RE_SCHEME_NAME.search(full_name)
        if not m:
            logger.debug("nps_holding: no scheme match in assembled name: %r", full_name[:120])
            continue

        fund_manager = re.sub(r"\s+", " ", m.group(1)).strip()
        scheme_type = m.group(2).upper()
        tier = m.group(3).upper()

        key = (scheme_type, tier, fund_manager)
        if key in seen:
            continue
        seen.add(key)

        total_units = _num(nums[0])
        blocked_units = _num(nums[1])
        # nums[2] = free_units (not stored separately)
        nav = _num(nums[3])
        # nums[4] = Amount (Rs.), nums[5] = Amount in Transition
        total_value = _num(nums[6])  # Total Value of Scheme

        if not total_units or total_units <= 0:
            continue

        scheme_name = (
            f"NPS TRUST A/C {fund_manager} SCHEME {scheme_type}"
            f" - TIER {tier} DIRECT"
        )
        schemes.append(NPSSchemeHolding(
            scheme_name=scheme_name,
            fund_manager=fund_manager,
            scheme_type=scheme_type,
            tier=tier,
            total_units=total_units,
            blocked_units=blocked_units or 0.0,
            nav=nav or 0.0,
            current_value=total_value or 0.0,
        ))

    logger.debug("nps_holding: parsed %d scheme rows", len(schemes))
    return schemes


# ── Main entry point ──────────────────────────────────────────────────────────

def parse_nps_holding(
    pdf_path: "str | Path",
    password: Optional[str] = None,
) -> NPSHoldingResult:
    """Parse a Protean CRA NPS Holding Statement PDF.

    Args:
        pdf_path: Path to the PDF file.
        password: PDF password if encrypted.

    Returns:
        NPSHoldingResult with tier1_schemes / tier2_schemes populated.

    Raises:
        FileNotFoundError: if pdf_path does not exist.
        ValueError: if the PDF cannot be opened (wrong password, corrupt file).
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"NPS holding PDF not found: {path}")

    open_kwargs: dict = {}
    if password:
        open_kwargs["password"] = password

    try:
        pdf = pdfplumber.open(str(path), **open_kwargs)
    except Exception as exc:
        raise ValueError(f"Cannot open PDF: {exc}") from exc

    all_text: list[str] = []
    with pdf:
        for page in pdf.pages:
            all_text.append(page.extract_text() or "")

    full_text = "\n".join(all_text)

    result = NPSHoldingResult()
    _extract_metadata(full_text, result)

    for scheme in _parse_schemes(full_text):
        if scheme.tier == "I":
            result.tier1_schemes.append(scheme)
        else:
            result.tier2_schemes.append(scheme)

    logger.info(
        "nps_holding: pran=%r tier1=%d (₹%.2f) tier2=%d (₹%.2f)",
        result.pran,
        len(result.tier1_schemes), result.tier1_total(),
        len(result.tier2_schemes), result.tier2_total(),
    )
    return result


# ── AssetSource adapter ───────────────────────────────────────────────────────

class NPSHoldingAssetSource:
    """Wraps NPSHoldingResult as an AssetSource for sync_portfolio().

    Produces two AssetPayloads (NPS_TIER1, NPS_TIER2) to match the existing
    NPSSync symbols.  Per-scheme breakdown is recorded in positions[].
    avg_buy_price=0 because cost basis is not in the holding statement.
    """

    provider_name = "nps_holding"

    def __init__(self, result: NPSHoldingResult):
        self._result = result

    def validate_credentials(self) -> None:
        if not self._result.tier1_schemes and not self._result.tier2_schemes:
            raise ValueError("NPS holding PDF contained no scheme holdings.")

    def fetch_holdings(self):
        from app.shared.interfaces import AssetPayload

        payloads = []

        def _add(symbol: str, name: str, schemes: List[NPSSchemeHolding]) -> None:
            if not schemes:
                return
            total_value = sum(s.current_value for s in schemes)
            total_units = sum(s.total_units for s in schemes)
            positions = [
                {
                    "source": f"NPS {name} - Scheme {s.scheme_type}",
                    "fund_manager": s.fund_manager,
                    "market_type": "spot",
                    "position_type": "long",
                    "qty": s.total_units,
                    "avg_buy_price": 0.0,
                    "current_price": s.nav,
                    "current_value": s.current_value,
                    "unrealized_pnl": 0.0,
                }
                for s in schemes
            ]
            try:
                payloads.append(AssetPayload(
                    symbol=symbol,
                    name=name,
                    qty=total_units,
                    avg_buy_price=0.0,
                    current_price=round(total_value / total_units, 4) if total_units else 0.0,
                    source="NPS (Holding Statement)",
                    type="nps",
                    unrealized_pnl=0.0,
                    positions=positions,
                ))
            except Exception as exc:
                logger.error("NPSHoldingAssetSource: schema error for %s: %s", symbol, exc)

        _add("NPS_TIER1", "NPS Tier I", self._result.tier1_schemes)
        _add("NPS_TIER2", "NPS Tier II", self._result.tier2_schemes)

        logger.info("NPSHoldingAssetSource: yielding %d NPS assets", len(payloads))
        return payloads


# ── CLI smoke-test ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json
    logging.basicConfig(level=logging.DEBUG)

    if len(sys.argv) < 2:
        print("Usage: python nps_holding.py <path_to_pdf> [password]")
        sys.exit(1)

    pw = sys.argv[2] if len(sys.argv) > 2 else None
    r = parse_nps_holding(sys.argv[1], password=pw)

    print("\n=== Summary ===")
    print(json.dumps(r.summary(), indent=2, ensure_ascii=False))

    print("\n=== Tier I Schemes ===")
    for s in r.tier1_schemes:
        print(f"  Scheme {s.scheme_type} | {s.fund_manager[:40]:<40}"
              f" | {s.total_units:>10.4f} u | NAV {s.nav:>8.4f} | ₹{s.current_value:>10,.2f}")

    print("\n=== Tier II Schemes ===")
    for s in r.tier2_schemes:
        print(f"  Scheme {s.scheme_type} | {s.fund_manager[:40]:<40}"
              f" | {s.total_units:>10.4f} u | NAV {s.nav:>8.4f} | ₹{s.current_value:>10,.2f}")

    print(f"\nTier I Total:  ₹{r.tier1_total():>10,.2f}")
    print(f"Tier II Total: ₹{r.tier2_total():>10,.2f}")
    print(f"Grand Total:   ₹{r.total():>10,.2f}")

    print("\n=== holdings_json ===")
    print(json.dumps(r.to_holdings_json(), indent=2, ensure_ascii=False))
