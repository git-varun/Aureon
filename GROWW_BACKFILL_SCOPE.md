# Groww Trade-History Backfill — Scope Doc

**Status: scoping only, no implementation.**

Uses `BINANCE_BACKFILL_SCOPE.md`'s shape as a structural reference only (that
doc no longer exists in the tree — Binance backfill has since been
implemented, see `backend/app/modules/portfolio/services/portfolio.py`
`backfill_binance_spot`/`get_binance_backfill_status`, provider methods in
`providers/broker/binance/provider.py`, and migration
`942dce1f19c8_add_binance_backfill_progress_table.py`, all currently
uncommitted on this branch). Groww's mechanism does **not** match Binance's —
see Finding 1. Findings below are verified by actually running the current
importer (`parse_transaction_file`) against five real Groww export files
found at `/home/dev-var/Personal/Docs/Groww /` — not inferred from column-map
inspection alone.

---

## Finding 1 — Groww has a live API, but it cannot do trade-history backfill

Confirmed against `backend/app/modules/portfolio/providers/broker/groww/provider.py`
and Groww's public API docs (`groww.in/trade-api/docs/curl`):

- Groww **does** have a documented public trading API (unlike some Indian
  discount/neo-brokers) — this codebase already integrates it
  (`GrowwBrokerProvider`, registered, `ProviderConfig.status = "PARTIAL"`).
- The only endpoint this codebase calls is `GET /v1/holdings/user` — current
  equity holdings, no history. `PortfolioService.sync_groww_holdings` upserts
  one `broker_snapshot` Transaction per symbol (same pattern as Zerodha),
  confirmed in `PROVIDERS.md`.
- Groww's API does expose order/trade endpoints (`GET /v1/order/list`,
  `GET /v1/order/trades/{groww_order_id}`), but per Groww's own docs:
  - `/v1/order/list` returns **same-trading-day orders only** — no date-range
    parameter, no pagination across days ("get the history of orders
    executed for the day").
  - `/v1/order/trades/{groww_order_id}` requires a specific order ID (fetches
    fills for one order) — no bulk/global trades-by-date-range endpoint
    analogous to Binance's `myTrades`.
  - `/v1/positions/user` (F&O positions) is also unused in this codebase —
    unrelated to trade history, noted for completeness only.

**Conclusion: Groww's live API cannot support a Binance-style backfill**
(walk trade history via pagination against a live endpoint) — there is no
endpoint that returns historical trades beyond the current day. "Backfill"
for Groww is necessarily an import-completeness problem, not a live-API
pagination problem. Do not scope a `backfill_groww_task` /
`GrowwBackfillProgress` table analogous to Binance's — there is nothing on
the wire to page through.

---

## Finding 2 — empirical test results against 5 real Groww export files

Ran `parse_transaction_file()` (current uncommitted working tree) directly
against real exports covering all the file types the task named, plus two
more found alongside them:

| File | Real header row | Result |
|---|---|---|
| `Stocks_Order_History_..._01-04-2026_08-04-2026.xlsx` | `Stock name, Symbol, ISIN, Type, Quantity, Value, Exchange, Exchange Order Id, Execution date and time, Order status` | **Works.** 1 row parsed cleanly: symbol `TATSILV.NS`, price derived from Value/Quantity (22.02), `broker_reference` from Exchange Order Id, ISIN/exchange/name all captured. |
| `Mutual_Funds_Order_History_..._01-04-2026_09-04-2026.xlsx` | `Scheme Name, Transaction Type, Units, NAV, Amount, Date` (file body says "NO TRANSACTIONS FOUND" — no data rows in this sample) | **Correctly produces 0 rows / 0 errors.** Header-shape alone maps cleanly (scheme name→`_name`, units→quantity, NAV→price, transaction type→type, date→date) — this is a clean empty-period result, not a parsing failure. Confirms the `groww_mf` detection/mapping is structurally sound; not exercised against a populated MF transaction row (still an open item, not newly resolved here). |
| `Stocks_Holdings_Statement_..._08-04-2026.xlsx` | `Stock Name, ISIN, Quantity, Average buy price, Buy value, Closing price, Closing value, Unrealised P&L` | **Fails completely.** 0 rows, 54 errors — every row: "missing symbol", "missing or unparseable date", "invalid type ''". |
| `Mutual_Funds_..._09-04-2026_09-04-2026.xlsx` (MF holdings) | `Scheme Name, AMC, Category, Sub-category, Folio No., Source, Units, Invested Value, Current Value, Returns, XIRR` (preceded by a `HOLDING SUMMARY` section) | **Fails completely.** "No recognised columns found" — header-row auto-detection (`_find_header_row`, needs ≥3 matched columns) never finds this table; `Folio No.` (with trailing period) doesn't match the mapped key `"folio no"`, so only 2 of 11 columns match, below the 3-column threshold. |
| `Stocks_PnL_Report_..._2025_2026.xlsx` | P&L statement, not a transaction table | **Fails completely** (181 errors) — expected; this is a report, not an import candidate. |

**This is the headline finding, upgrading the earlier hypothesis**: the
**Stock Order History** and **MF Order History** shapes described in
`PROVIDERS.md` genuinely work as documented. But **Groww also produces
holdings-snapshot exports** ("Stocks Holdings Statement", MF holdings
summary) that this codebase's importer was never built to handle — passing
them to `parse_transaction_file` doesn't just skip them cleanly, it produces
either a wall of per-row validation errors (holdings statement: every row
"missing symbol"/"missing date"/"invalid type", because a holdings snapshot
has no transaction date or buy/sell type at all) or a header-detection
failure (MF holdings: wrong section picked as header). **Neither is a
"three known formats, all working" situation — there are at least 5 distinct
Groww export shapes in practice, and 2 of the 3 the task explicitly asked
about (Holdings Statement, MF holdings) are unsupported today**, not merely
"needs an ISIN-resolution gap fix" as the analogous Zerodha backlog item
implied.

This is structurally sound, not a bug to "fix" in the transaction importer:
a holdings statement is a point-in-time snapshot (quantity + avg price, no
per-transaction date/type), the same shape CDSL CAS/NPS/EPF snapshot imports
already model via `broker_snapshot`-kind single-row-per-symbol transactions
— **not** the generic per-row ledger path. Feeding a snapshot file through
`parse_transaction_file` (built for order/trade logs) was never going to
work; it needs its own snapshot-shaped parser (analogous to
`import_cdsl_cas`), if importing it is wanted at all — see Open Question 1.

**Re-confirmed the read_only XLSX fix directly via diff**, not inference:
`git diff` on `portfolio_importer.py` shows `_parse_xlsx` had
`read_only=True` **removed** in the current uncommitted change (was
`openpyxl.load_workbook(..., read_only=True, data_only=True)`, now
`openpyxl.load_workbook(..., data_only=True)`). All 5 real files above were
parsed against the **current** (read_only removed) code and none showed any
read_only-related symptom (truncated rows, missing merged-cell values, etc.)
— the fix, whatever its original motivation, applies uniformly to every
Groww shape since they all share this one `_parse_xlsx` function. No
Groww-specific instance of that bug class exists or is newly introduced.

---

## Finding 3 — other completeness gaps (verified against actual code, not assumed from Zerodha)

1. **No corporate-action rows in the working shapes.** Stock Order History
   and MF Order History are both execution/order logs — neither carries
   bonus/split/rights-issue events. `_VALID_TYPES` includes `split`/`bonus`
   but nothing in Groww's real column set can populate them. Same category
   of gap as Zerodha's tradebook import, independently confirmed present for
   Groww's real files too (not assumed).
2. **Trade Statement (CSV) shape — could not be verified, no real sample
   available.** `PROVIDERS.md` and `_detect_broker` describe a third Groww
   shape (detected via `"stock symbol"`/`"average traded price"`, distinct
   header names from the real Stock Order History file above, which uses
   plain `"Symbol"`/`"Value"`). No real file of this shape was found on disk
   to test against. Whether it carries an order-ID-equivalent column for
   dedup is **unknown** — `_COL_MAP` has no `_order_id` mapping rule keyed to
   any header this shape is documented to use, which is a real signal but
   not proof without a real file. **Do not treat this as a confirmed gap**;
   it's an open question (see below), unlike the Holdings Statement finding
   above which was verified by direct execution.
3. **Export date-range behavior — unconfirmed.** Groww's Reports UI lets a
   user pick a custom date range per download (confirmed via Groww's help
   docs); the two real order-history files on disk both cover ~1-week
   windows, consistent with manual narrow exports rather than a hard platform
   cap. No evidence of a hard maximum range found. If full-history backfill
   needs multiple per-period files, the existing importer already handles
   that correctly today (idempotent dedup via `(broker, broker_reference)`
   for the two working shapes) — this needs a real multi-month/year sample
   to fully confirm, not available in this pass.
4. **No backfill-progress/checkpoint concept applies here.** This isn't a
   paginated live-API walk — "backfill" is "re-run the existing import
   endpoint against however many historical export files the user has,"
   already idempotent for the two working shapes.

---

## Open questions for a product decision

1. **Should Groww's holdings-snapshot exports (Stocks Holdings Statement, MF
   holdings) be importable at all?** They're empirically confirmed broken
   today (Finding 2) — not silently skipped, but silently or noisily
   rejected (0 rows imported, no useful error surfaced to a user beyond raw
   per-row messages). If yes, this needs a dedicated snapshot-shaped parser
   analogous to `import_cdsl_cas`/NPS/EPF (single `broker_snapshot` row per
   symbol, ISIN capture, no date/type expected) — a real, scoped feature, not
   a one-line fix to the existing transaction importer. If these exports are
   considered out of scope (holdings already come from the live
   `/v1/holdings/user` sync when credentials are configured, making the
   snapshot file redundant for a connected account), that should be an
   explicit decision, since the task named "Stocks Holdings Statement" as
   one of the three formats to verify.
2. **Trade Statement (CSV) dedup** — worth getting a real sample to check
   for an order-ID column before deciding whether `_COL_MAP` needs extending.
   Not resolved here; flagged as unverified rather than asserted broken.
3. **Corporate actions** — same open question as Zerodha; likely a
   broker-agnostic decision (manual-entry workflow vs. new import path), not
   Groww-specific.
4. **MF Order History with actual transaction rows** — the one real sample
   available had zero rows in the period selected; the mapping looks correct
   by header shape alone, but a populated file hasn't been run through the
   importer. Recommend testing against a real file with actual MF buy/sell
   rows before considering this format fully verified end-to-end.

**No implementation in this pass**, per the task brief.
