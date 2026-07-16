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
- `CRYPTO_SYMBOL_RENDERING_AUDIT.md` — the audit behind `bf01cd7` (COIN-M
  futures margin/P&L unit fix, Finding 1.2) and `d55884e` (Binance
  LD*-Earn wrapper spot balances merged into their underlying asset,
  Finding 2.2) — a standalone audit doc now exists for these; the bare
  commit-hash note this line used to be was itself stale (superseded the
  same day the commits landed)
- `WORKERS_OBSERVABILITY_SCOPE.md` §1 — scoped the dispatch-time
  concurrency guard later built in `857fb79` ("Add dispatch-time
  concurrency guard for broker-sync jobs") — guards `POST
  /config/jobs/{job_name}/run` against a double-dispatch race, most
  relevant to this folder's `sync_zerodha`/`sync_binance`/`sync_groww`
  manual-trigger endpoints
- `BACKLOG_SWEEP_SCOPE.md` §3c (Part C) — scopes trimming this folder's
  `PROVIDERS.md`; concluded most of its 563 lines are genuinely unique
  mechanism detail with no other home (not redundant, not trimmed), but
  flagged one section as actively stale — see correction below

**Correction to `PROVIDERS.md`'s "Shared Patterns → `ensure_asset_exists()`"
section (not fixed in this pass — `PROVIDERS.md` edits are out of scope
here per `BACKLOG_SWEEP_SCOPE.md` §3c, noting the drift instead)**: that
section still claims `ensure_asset_exists()` "separately guarantees a
`LatestQuote` (price=0.0 placeholder)... row exist for the asset." Live-
checked against `services/market.py` for this pass: that hasn't been true
since a prior fake-data fix — the function's own comment now reads
"`LatestQuote` is intentionally NOT seeded here... seeding a fake 0.0 here
would defeat that [signal]." `AssetSnapshot` is still always created
(price copied from `LatestQuote` if one exists, else `None`), so that half
of the old claim stands; only the `LatestQuote`/0.0 half is wrong.

_Last touched: 2026-07-16, by this reference-doc catch-up pass
(`BACKLOG_SWEEP_SCOPE.md` §3c follow-through)._
