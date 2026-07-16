# backend/app/modules/portfolio/ — reference

**What's here**: everything that turns broker data (live API sync or
statement/CSV import) into Portfolio/Position/Transaction rows, plus
portfolio-level valuation (snapshots, FX conversion, EPF/NPS estimate
pricing).

**Why it's shaped this way**: broker sync (`providers/broker/*`) and file
import (`services/portfolio_importer.py`) are two separate code paths for
the same destination tables — sync is live/authenticated, import is
stateless parsing of exported statements (Zerodha/Groww/Binance/CDSL
CAS/NPS/EPF). Position has no per-broker provenance column by design; broker
attribution lives only on `Transaction.broker`.

**Details / history**: see —
- `EPF_ESTIMATE_SCOPE.md` — EPF interest-accrual estimate design
- `PROVIDER_TOGGLE_AND_PILOT_DOCS_SCOPE.md` §Part 1 — provider enable/
  disable mechanism (sync gating, credential separation)
- `bf01cd7` (COIN-M futures margin/P&L unit fix) and `d55884e` (Binance
  LD*-Earn wrapper spot balances merged into their underlying asset) — no
  standalone audit/scope doc exists for these yet, commit messages are the
  only record

_Last touched: 2026-07-16, by PROVIDER_TOGGLE_AND_PILOT_DOCS_SCOPE.md._
