"""EPF Passbook PDF parser (EPFO Member Passbook format).

Parses annual EPF passbook PDFs downloaded from the EPFO Unified Member Portal.
Extracts header info, monthly contribution transactions, and closing balances
for EPF (employee + employer) and EPS (pension) components.

Usage
-----
    result = parse_epf_passbook("/path/to/epf_passbook.pdf")
    result.transactions          # List[EPFTransaction]
    result.closing_employee      # float — employee EPF balance
    result.closing_employer      # float — employer EPF balance
    result.closing_pension       # float — EPS/pension balance
    result.summary()
    result.to_transactions_json()
"""

import re
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

import pdfplumber

logger = logging.getLogger("providers.epf_passbook")


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


def _parse_date(dmy: str) -> Optional[datetime]:
    """Parse DD-MM-YYYY → datetime. Returns None on failure."""
    try:
        return datetime.strptime(dmy.strip(), "%d-%m-%Y")
    except ValueError:
        return None


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class EPFTransaction:
    wage_month: str               # e.g. "Aug-2024"
    date: str                     # DD-MM-YYYY string as in passbook
    parsed_date: Optional[datetime]
    txn_type: str                 # "CR" or "DR"
    particulars: str              # description text
    epf_wages: float              # EPF wage basis
    eps_wages: float              # EPS wage basis
    employee_contribution: float  # employee EPF contribution
    employer_contribution: float  # employer EPF contribution (net of EPS)
    pension_contribution: float   # EPS pension contribution


@dataclass
class EPFPassbookResult:
    uan: str = ""
    member_id: str = ""
    member_name: str = ""
    establishment_name: str = ""
    financial_year: str = ""
    dob: str = ""

    transactions: List[EPFTransaction] = field(default_factory=list)

    closing_employee: float = 0.0   # employee EPF balance
    closing_employer: float = 0.0   # employer EPF balance
    closing_pension: float = 0.0    # EPS/pension balance
    interest_employee: float = 0.0  # interest credited (employee side)
    interest_employer: float = 0.0  # interest credited (employer side)
    closing_date: str = ""          # e.g. "31/03/2025"

    def total_epf(self) -> float:
        return self.closing_employee + self.closing_employer

    def total_corpus(self) -> float:
        return self.total_epf() + self.closing_pension

    def summary(self) -> dict:
        contributions = [
            t for t in self.transactions
            if "cont." in t.particulars.lower() or "due-month" in t.particulars.lower()
        ]
        return {
            "uan": self.uan,
            "member_name": self.member_name,
            "establishment_name": self.establishment_name,
            "financial_year": self.financial_year,
            "closing_date": self.closing_date,
            "transactions_count": len(self.transactions),
            "regular_contributions": len(contributions),
            "closing_employee_inr": round(self.closing_employee, 2),
            "closing_employer_inr": round(self.closing_employer, 2),
            "closing_pension_inr": round(self.closing_pension, 2),
            "total_epf_inr": round(self.total_epf(), 2),
            "total_corpus_inr": round(self.total_corpus(), 2),
        }

    def to_transactions_json(self) -> list:
        return [
            {
                "wage_month": t.wage_month,
                "date": t.date,
                "type": t.txn_type,
                "particulars": t.particulars,
                "epf_wages": t.epf_wages,
                "eps_wages": t.eps_wages,
                "employee_contribution": t.employee_contribution,
                "employer_contribution": t.employer_contribution,
                "pension_contribution": t.pension_contribution,
            }
            for t in self.transactions
        ]


# ── Regex patterns ────────────────────────────────────────────────────────────

_RE_UAN = re.compile(r"UAN\s+(\d{12})")
_RE_DOB = re.compile(r"Date of Birth\s+(\d{2}-\d{2}-\d{4})", re.IGNORECASE)
_RE_FY = re.compile(r"Financial Year\s*[-–]\s*(\d{4}-\d{4})", re.IGNORECASE)
_RE_MEMBER_LINE = re.compile(
    r"Member ID/Name\s+(\S+)\s*/\s*(.+?)$", re.IGNORECASE | re.MULTILINE
)
_RE_ESTAB_LINE = re.compile(
    r"Establishment ID/Name\s+\S+\s*/\s*(.+?)$", re.IGNORECASE | re.MULTILINE
)
_RE_CLOSING = re.compile(r"Closing Balance as on\s+(\d{2}/\d{2}/\d{4})", re.IGNORECASE)
_RE_INTEREST = re.compile(r"Int\.\s+Updated upto\s+(\d{2}/\d{2}/\d{4})", re.IGNORECASE)
_RE_DATE_CELL = re.compile(r"^\d{2}-\d{2}-\d{4}$")
_RE_WAGE_MONTH = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$", re.IGNORECASE
)
_RE_NUMS = re.compile(r"[\d,]+\.?\d*")


# ── Metadata extraction ───────────────────────────────────────────────────────

def _extract_metadata(text: str, result: EPFPassbookResult) -> None:
    m = _RE_UAN.search(text)
    if m:
        result.uan = m.group(1)

    m = _RE_DOB.search(text)
    if m:
        result.dob = m.group(1)

    m = _RE_FY.search(text)
    if m:
        result.financial_year = m.group(1)

    m = _RE_MEMBER_LINE.search(text)
    if m:
        result.member_id = m.group(1).strip()
        result.member_name = m.group(2).strip()

    m = _RE_ESTAB_LINE.search(text)
    if m:
        result.establishment_name = m.group(1).strip()


# ── Table-based transaction extraction ───────────────────────────────────────

def _clean(val: Any) -> str:
    if val is None:
        return ""
    return str(val).replace("\n", " ").strip()


def _parse_from_tables(pages: list, result: EPFPassbookResult) -> None:
    """Primary parser: use pdfplumber table extraction (page 1 only)."""
    for page in pages[:1]:  # page 1 has the transaction table
        tables = page.extract_tables()
        for table in tables:
            _process_table(table, result)


def _process_table(table: list, result: EPFPassbookResult) -> None:
    """Walk rows of an extracted table and collect transactions + closing balances."""
    for row in table:
        if not row:
            continue

        cells = [_clean(c) for c in row]

        # ── Closing balance row ──────────────────────────────────────────────
        combined = " ".join(cells)
        if _RE_CLOSING.search(combined):
            nums = _RE_NUMS.findall(combined.replace(",", ""))
            # last 3 non-zero-length numeric strings are emp/employer/pension
            valid_nums = [n for n in nums if n and "." not in n or True]
            floats = [_num(v) for v in valid_nums if _num(v) is not None]
            if len(floats) >= 3:
                result.closing_employee = floats[-3]
                result.closing_employer = floats[-2]
                result.closing_pension = floats[-1]
                m = _RE_CLOSING.search(combined)
                if m:
                    result.closing_date = m.group(1)
            continue

        # ── Interest row ─────────────────────────────────────────────────────
        if _RE_INTEREST.search(combined):
            nums_raw = _RE_NUMS.findall(combined.replace(",", ""))
            floats = [_num(v) for v in nums_raw if _num(v) is not None]
            if len(floats) >= 2:
                result.interest_employee = floats[-2] if len(floats) >= 2 else 0.0
                result.interest_employer = floats[-1] if len(floats) >= 1 else 0.0
            continue

        # ── Transaction row: need wage_month + date + CR/DR + 5 amounts ─────
        # Find wage_month and date cells (may be in any of first 5 positions
        # due to merged headers producing None/empty cells)
        wage_month = ""
        date_str = ""
        txn_type = ""
        particulars_parts = []
        amounts: List[float] = []

        for c in cells:
            if not wage_month and _RE_WAGE_MONTH.match(c):
                wage_month = c
            elif not date_str and _RE_DATE_CELL.match(c):
                date_str = c
            elif not txn_type and c.upper() in ("CR", "DR"):
                txn_type = c.upper()

        if not date_str or not txn_type:
            continue

        # Collect numeric cells for amount columns
        for c in cells:
            v = _num(c) if c else None
            if v is not None and not _RE_DATE_CELL.match(c) and not _RE_WAGE_MONTH.match(c):
                amounts.append(v)

        # Collect non-key text cells as particulars (skip wage_month, date, type, numbers)
        skip = {wage_month, date_str, txn_type}
        for c in cells:
            if c and c not in skip and not _RE_DATE_CELL.match(c) and not _RE_WAGE_MONTH.match(c):
                try:
                    float(c.replace(",", ""))
                    continue  # it's a number
                except ValueError:
                    if c.upper() not in ("CR", "DR"):
                        particulars_parts.append(c)

        particulars = " ".join(particulars_parts).strip()

        # Need at least 3 contribution amounts (employee, employer, pension)
        if len(amounts) < 3:
            continue

        # Layout: epf_wages, eps_wages, employee, employer, pension
        # If 5 amounts: all present. If 3: only contributions (wages missing/zero).
        if len(amounts) >= 5:
            epf_wages, eps_wages = amounts[0], amounts[1]
            employee, employer, pension = amounts[2], amounts[3], amounts[4]
        elif len(amounts) == 4:
            epf_wages, eps_wages = amounts[0], amounts[1]
            employee, employer, pension = amounts[2], amounts[3], 0.0
        else:
            epf_wages, eps_wages = 0.0, 0.0
            employee, employer, pension = amounts[0], amounts[1], amounts[2]

        parsed_dt = _parse_date(date_str)
        result.transactions.append(EPFTransaction(
            wage_month=wage_month,
            date=date_str,
            parsed_date=parsed_dt,
            txn_type=txn_type,
            particulars=particulars,
            epf_wages=epf_wages,
            eps_wages=eps_wages,
            employee_contribution=employee,
            employer_contribution=employer,
            pension_contribution=pension,
        ))


# ── Text-based fallback ───────────────────────────────────────────────────────
# Used when table extraction yields no transactions (some PDF renderers flatten
# the table into plain text blocks).

_RE_TXN_LINE = re.compile(
    r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4})?\s*"
    r"(\d{2}-\d{2}-\d{4})\s+"
    r"(CR|DR)\s+"
    r"(.+?)\s+"
    r"([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$",
    re.IGNORECASE,
)
_RE_CLOSING_TEXT = re.compile(
    r"Closing Balance as on\s+(\d{2}/\d{2}/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)",
    re.IGNORECASE,
)
_RE_INTEREST_TEXT = re.compile(
    r"Int\.\s+Updated upto\s+\d{2}/\d{2}/\d{4}\s+([\d,]+)\s+([\d,]+)",
    re.IGNORECASE,
)


def _parse_from_text(full_text: str, result: EPFPassbookResult) -> None:
    """Fallback parser: regex over extracted text."""
    for m in _RE_TXN_LINE.finditer(full_text):
        wage_month = (m.group(1) or "").strip()
        date_str = m.group(2).strip()
        txn_type = m.group(3).upper()
        particulars = m.group(4).strip()
        epf_wages = _num(m.group(5)) or 0.0
        eps_wages = _num(m.group(6)) or 0.0
        employee = _num(m.group(7)) or 0.0
        employer = _num(m.group(8)) or 0.0
        pension = _num(m.group(9)) or 0.0

        result.transactions.append(EPFTransaction(
            wage_month=wage_month,
            date=date_str,
            parsed_date=_parse_date(date_str),
            txn_type=txn_type,
            particulars=particulars,
            epf_wages=epf_wages,
            eps_wages=eps_wages,
            employee_contribution=employee,
            employer_contribution=employer,
            pension_contribution=pension,
        ))

    m = _RE_CLOSING_TEXT.search(full_text)
    if m:
        result.closing_date = m.group(1)
        result.closing_employee = _num(m.group(2)) or 0.0
        result.closing_employer = _num(m.group(3)) or 0.0
        result.closing_pension = _num(m.group(4)) or 0.0

    m = _RE_INTEREST_TEXT.search(full_text)
    if m:
        result.interest_employee = _num(m.group(1)) or 0.0
        result.interest_employer = _num(m.group(2)) or 0.0


# ── Main entry point ──────────────────────────────────────────────────────────

def parse_epf_passbook(
    pdf_path: "str | Path",
    password: Optional[str] = None,
) -> EPFPassbookResult:
    """Parse an EPFO Member Passbook PDF (annual financial year statement).

    Args:
        pdf_path: Path to the PDF file.
        password: PDF password if encrypted (rarely needed for EPFO PDFs).

    Returns:
        EPFPassbookResult with transactions and closing balances.

    Raises:
        FileNotFoundError: if pdf_path does not exist.
        ValueError: if the PDF cannot be opened or is not an EPFO passbook.
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"EPF passbook PDF not found: {path}")

    open_kwargs: dict = {}
    if password:
        open_kwargs["password"] = password

    try:
        pdf = pdfplumber.open(str(path), **open_kwargs)
    except Exception as exc:
        raise ValueError(f"Cannot open PDF: {exc}") from exc

    all_text_parts: list[str] = []
    all_pages: list = []
    with pdf:
        for page in pdf.pages:
            all_text_parts.append(page.extract_text() or "")
            all_pages.append(page)

    full_text = "\n".join(all_text_parts)

    if "UAN" not in full_text and "EPFO" not in full_text.upper() and "EPF" not in full_text.upper():
        raise ValueError(
            "This does not appear to be an EPFO Member Passbook PDF. "
            "Download the annual passbook from the EPFO Unified Member Portal."
        )

    result = EPFPassbookResult()
    _extract_metadata(full_text, result)

    # Primary: table extraction
    _parse_from_tables(all_pages, result)

    # Fallback: if table extraction found nothing, try text-based parser
    if not result.transactions:
        logger.warning("epf_passbook: table extraction found no transactions — trying text fallback")
        _parse_from_text(full_text, result)

    # If closing balances not found via table, try text
    if result.closing_employee == 0.0 and result.closing_employer == 0.0:
        _parse_from_text(full_text, result)

    logger.info(
        "epf_passbook: uan=%r fy=%r txns=%d epf=%.2f+%.2f eps=%.2f",
        result.uan,
        result.financial_year,
        len(result.transactions),
        result.closing_employee,
        result.closing_employer,
        result.closing_pension,
    )
    return result


# ── CLI smoke-test ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json
    logging.basicConfig(level=logging.DEBUG)

    if len(sys.argv) < 2:
        print("Usage: python epf_passbook.py <path_to_pdf> [password]")
        sys.exit(1)

    pw = sys.argv[2] if len(sys.argv) > 2 else None
    r = parse_epf_passbook(sys.argv[1], password=pw)

    print("\n=== Summary ===")
    print(json.dumps(r.summary(), indent=2, ensure_ascii=False))

    print("\n=== Transactions ===")
    for t in r.transactions:
        print(
            f"  {t.wage_month:<10} {t.date}  {t.txn_type}  "
            f"Emp ₹{t.employee_contribution:>8,.0f}  "
            f"Empr ₹{t.employer_contribution:>7,.0f}  "
            f"EPS ₹{t.pension_contribution:>7,.0f}  "
            f"| {t.particulars[:50]}"
        )

    print(f"\nClosing  Employee ₹{r.closing_employee:>10,.2f}")
    print(f"         Employer ₹{r.closing_employer:>10,.2f}")
    print(f"         Pension  ₹{r.closing_pension:>10,.2f}")
    print(f"         Total    ₹{r.total_corpus():>10,.2f}")
