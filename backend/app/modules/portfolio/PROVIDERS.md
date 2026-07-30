# Portfolio Providers & Import Parsers

This document covers the two ways positions/transactions get into a portfolio:
live broker API sync (Zerodha, Groww, Binance) and file import (CDSL CAS, NPS,
EPF, generic CSV/XLSX/Tradebook). Audited directly against the code as of
2026-07-08 — line numbers may drift, but the described mechanisms/quirks were
all verified against the current repo state, not prior notes.

## Broker Sync Providers

All three broker providers are registered in `app/core/providers/registry.py`
(self-register at import time — see Shared Patterns below) and instantiated
by `ProviderFactory` (`app/core/providers/factory.py`). Credentials are stored
**in Postgres**, not `.env` — the `ProviderConfig` table
(`app/core/entities/config.py`), Fernet-encrypted, managed via the config API
(`app/core/api/config.py`, `ConfigService.set_provider_key`).

None of the three brokers' sync jobs are wired into Celery beat. `JobConfig`
rows exist with cron expressions (`sync_zerodha`: `30 8 * * 1-5`, `sync_binance`:
`35 8 * * 1-5`, `sync_groww`: `40 8 * * 1-5`, all `enabled: False`;
`sync_portfolio`: `0 9 * * 1-5`, `enabled: True`) but
`celery_app.conf.beat_schedule` (`app/workers/celery_app.py`) only contains
quote/news/snapshot jobs — nothing reads `JobConfig.cron_expression` to
actually dispatch these. **The only way any broker sync runs today is the
manual `POST /portfolio/sync {"broker": "..."}` endpoint**
(`app/modules/portfolio/api/portfolio.py`), which calls
`ConfigService.dispatch_job(...)` → sends the named Celery task.

Shared sync orchestration: `_run_broker_sync()` in
`app/workers/ingestion/tasks.py` — resolves the provider via
`ProviderFactory.get(name, required=False)` (unconfigured provider = clean
no-op warning, not a crash), calls `provider.sync()`, applies holdings to
every portfolio, re-ingests quotes, regenerates snapshots.

Stale/expired credentials are signalled via provider-specific exceptions
(`ZerodhaAuthError`/`GrowwAuthError`/`BinanceAuthError`, all `ProviderError`
subclasses in `app/core/exceptions.py`) whose message is prefixed
`"AUTH_REQUIRED: ..."` — `GET /portfolio/sync/status`
(`app/modules/portfolio/api/portfolio.py`) string-matches on that prefix in
the last job log to surface a distinct `auth_required` status to the frontend.

### Zerodha

**Auth**: Kite Connect OAuth. `ProviderConfig` seed declares `api_key`,
`api_secret`, `access_token`, `request_token` — only the first three are
actually used (`request_token` is transient, passed once into
`generate_session()`, never persisted).

- `GET /providers/zerodha/oauth/login-url` builds the Kite login URL.
- User logs in via Zerodha's own login page; Zerodha redirects to
  `GET /providers/zerodha/oauth/callback?request_token=...` — **intentionally
  unauthenticated**, since an attacker with only the request_token can't
  forge a session without the `api_secret` (SHA-256 checksum of
  `api_key + request_token + api_secret` is required to exchange for a token).
- **No refresh flow.** Kite Connect access tokens expire daily; there is no
  refresh-token mechanism anywhere in the codebase. On expiry (`get_holdings()`
  gets HTTP 403), `ZerodhaAuthError("AUTH_REQUIRED: Zerodha access token
  expired")` is raised — the user must manually redo the OAuth login every day.
- Auth header: `Authorization: token {api_key}:{access_token}`.

**Sync entry point**: Celery task `sync_zerodha_task`
(`app/workers/ingestion/tasks.py`), dispatched only via the manual
`/portfolio/sync` endpoint (see above — no live cron).

**Symbol mapping**: `PortfolioService.sync_zerodha_holdings` uppercases the
raw Kite `tradingsymbol` and suffixes it by exchange
(`{"NSE": ".NS", "BSE": ".BO"}`), unless already suffixed. `asset_class` is
hardcoded `"equity"` — the live sync path only covers equity holdings (no
F&O/MF).

**Idempotency**: shared `_sync_broker_snapshot()` upsert-by-symbol pattern
(see Shared Patterns) — one `Transaction` row per `(portfolio_id, symbol,
kind="broker_snapshot", broker="zerodha")`, updated in place on every sync.
Holdings that disappear (fully sold) get their stale snapshot row deleted and
`recalculate_position` re-run. No trade-history import via the live API — only
current holdings + avg price.

**Quirks**:
- Only holdings sync implemented (no order placement/quotes) —
  `ProviderConfig.status = "PARTIAL"`.
- `health_check()` hits `/user/profile` and swallows all exceptions.
- Separate CSV/XLSX Tradebook import path (`portfolio_importer.py`,
  `_detect_broker()`) recognizes two Zerodha formats: contract-note style
  (`instrument`/`avg. price` + `series` columns) and Console Tradebook export
  (`trade type` + `segment` + `exchange` + `trade id`/`order id`). For
  imported rows, symbol is **force-canonicalized to `.NS` regardless of which
  exchange the historical trade executed on** — "NSE/BSE holdings of the same
  stock are fungible in an Indian demat account," so buys/sells across
  exchanges net into one position — a deliberate difference from the live
  sync path, which preserves the real `.NS`/`.BO` per Kite's reported exchange.
  Imported rows get `broker_reference` from the trade/order ID, deduped via
  `(Transaction.broker, Transaction.broker_reference)`.

### Groww

**Auth**: `api_key` + `api_secret` entered directly via the config API — no
OAuth/browser flow. **Session token is re-exchanged on every sync run, never
cached** — comment in the client notes the token is "only valid ~10 minutes
anyway" and sync runs are periodic/on-demand, so caching isn't worth it.
Exchange: `checksum = sha256(api_secret + timestamp)`, POST to
`https://api.groww.in/v1/token/api/access` with
`Authorization: Bearer {api_key}`.

A 403 during token exchange commonly means **a daily manual "session
approval" step inside the Groww mobile app is required before the API
key/secret will exchange for a token** — a Groww-imposed manual step with no
programmatic bypass in this codebase.

Auth header for actual API calls: `Authorization: Bearer {session_token}`,
plus `X-API-VERSION: 1.0`.

**Sync entry point**: Celery task `sync_groww_task`, same shared
`_run_broker_sync` / manual-dispatch-only pattern as Zerodha.

**Symbol mapping**: `PortfolioService.sync_groww_holdings` reads
`trading_symbol`/`quantity`/`average_price` from Groww's
`GET /v1/holdings/user` (response nested under `"payload"`). **Always appends
`.NS`** unless already `.NS`/`.BO` suffixed — Groww's holdings API doesn't
return an explicit exchange field on this path, so there's no BSE handling
here (unlike Zerodha's live sync). `asset_class` hardcoded `"equity"`.

**Idempotency**: same shared `_sync_broker_snapshot()` pattern as Zerodha — no
trade-history import via the live API, so no `broker_reference` dedup on this
path.

**Quirks**:
- `health_check()` calls the real `get_holdings()` (full holdings +
  token-exchange call) — no lightweight ping endpoint.
- Only equity holdings implemented — `ProviderConfig.status = "PARTIAL"`.
- Separate CSV/XLSX import path recognizes **three** distinct Groww formats
  via `_detect_broker()`:
  1. **Stock order history** (XLSX) — detected via `"execution date and
     time"` column; rows filtered to `order status == "executed"` only.
  2. **Trade statement** (CSV) — detected via `"stock symbol"` or `"average
     traded price"` columns.
  3. **MF order history** (CSV/XLSX), tagged broker `"groww_mf"` — detected
     via `fund name`/`scheme name` + `nav`/`nav (rs)`. Symbol synthesized via
     `_mf_symbol()`: slugify fund name to uppercase alnum + `_`, truncate to
     40 chars, append `_MF`. Rows filtered to
     `executed/allotted/redeemed/completed/successful/success` statuses.
  - Non-MF Groww rows get the same forced `.NS` canonicalization as Zerodha's
    import path.

### Binance

Note: this is the **portfolio/broker** provider (spot balances, futures
positions, trade history). A separate, unrelated Binance **market-data price
provider** exists for quote ingestion (`binance_price`, no keys required,
`ACTIVE`) — not covered here.

**Auth**: standard Binance HMAC-SHA256 request signing — no OAuth, no token
exchange, no expiry. Every signed request appends a millisecond timestamp,
computes `hmac_sha256(api_secret, query_string)` as `signature`, sends the
raw API key as header `X-MBX-APIKEY`. The same key/secret pair is used
indefinitely (until revoked on Binance's side) across Spot, Simple Earn, and
both Futures wallet types — Binance issues one API key that covers all of it.

**Sync entry point**: Celery task `sync_binance_task`, same shared
`_run_broker_sync` / manual-dispatch-only pattern.

**Symbol mapping**:
- Spot balances (non-zero `free+locked`) and Simple Earn positions (flexible +
  locked) are **merged into one quantity per asset** — "Spot and Earn
  balances are the same underlying coin." Internal symbol:
  `f"{asset}-USD"` (e.g. Binance `"BTC"` → Aureon `"BTC-USD"`). `asset_class`
  is `"stablecoin"` for `USDT/USDC/BUSD/FDUSD`, else `"crypto"`.
- **Futures wallets get a different symbol scheme**: `f"{raw_symbol}-{suffix}"`
  where `suffix` is `USDM` (USDⓈ-M) or `COINM` (COIN-M) — e.g. `"BTCUSDT"` in
  the USDⓈ-M wallet becomes `"BTCUSDT-USDM"`.
- Spot trade pairs are split base/quote via `split_quote_asset()`; only pairs
  quoted in a USD stablecoin are converted to the `"{BASE}-USD"` balance
  symbol — pairs quoted in BTC/ETH/BNB (e.g. `"ADABTC"`) are **explicitly
  skipped** on the live-sync path (would need a separate BTC→USD conversion);
  the comment notes this is "still available via the CSV importer... since
  exported statements report values in the user's fiat."

**Idempotency** — two distinct mechanisms depending on data type:
- **Spot/Earn balances**: same shared `_sync_broker_snapshot()` upsert
  pattern as the other brokers.
- **Trade history (Spot + both Futures wallets)** — the only one of the three
  brokers that imports individual trades via the live API, as append-only
  `Transaction` rows with `kind="broker_trade"` (distinct from
  `kind="broker_snapshot"` — "this history is best-effort/partial and must
  never override the live balance snapshot's quantity"). Dedup key:
  `broker_reference = f"{wallet}:{raw_symbol}:{trade_id}"` — **Binance trade
  IDs are only unique per symbol/market, not globally**, so the key must
  include both wallet and raw symbol/pair, not just the ID. Cost basis is
  then re-derived from the full `broker_trade` history via a running
  weighted-average BUY/SELL replay, applied to the existing Position's
  `avg_buy_price` **without touching quantity** (quantity stays authoritative
  from the live balance snapshot) — re-run on every sync, not just when new
  trades appear.
- **Futures positions** bypass the transaction/dedup mechanism entirely —
  upserted directly from Binance's `positionRisk` snapshot (quantity,
  `entryPrice`, leverage, liquidation price, unrealized PnL, side), since "a
  futures position isn't a cost-basis ledger — it's a live, signed snapshot
  that Binance itself already nets out." Stale positions (no longer reported,
  zero amount, or side flip) are deleted per-wallet.

**Quirks**:
- **`exchangeInfo` pre-filter before `myTrades` polling**:
  `get_valid_spot_symbols()` fetches the full Binance Spot symbol list from
  the public, unsigned `GET /api/v3/exchangeInfo` and caches it for the sync
  run. `get_spot_trade_candidates()` builds candidate pairs (`{asset}{quote}`
  for every held asset × every stablecoin/BTC/ETH/BNB quote), filters against
  the cached exchangeInfo set, and only calls `myTrades` on survivors — avoids
  blind-probing every combination against a rate-limited signed endpoint. If
  the exchangeInfo fetch itself fails, falls back to polling every raw
  candidate (logged as a warning).
- **Known-invalid-pair cache**: a module-level set caches candidates that
  returned Binance's `-1121` "invalid symbol" error, so future sync runs in
  the same worker process skip re-probing them (symbol existence is global,
  not per-account, so process-lifetime caching is safe).
- **Futures wallet endpoints are fully separate**: USDⓈ-M
  (`fapi.binance.com`) vs COIN-M (`dapi.binance.com`), each with its own
  positions and trades endpoints. COIN-M's `userTrades` is scoped by `pair`
  (e.g. `"BTCUSD"`), not the contract `symbol` — the sync loop branches on
  this explicitly.
- **Per-product permission tolerance**: Simple Earn and both Futures calls are
  wrapped so a permission-denied/4xx from one doesn't take down the whole
  sync (logged as a warning); only the initial Spot `get_balances()` call is
  treated as the "credential is bad" hard-fail check.
- `health_check()` only calls Spot `get_account()` — doesn't validate
  Futures/Earn permissions.
- Only holdings + trade history implemented (no order placement) —
  `ProviderConfig.status = "PARTIAL"`.
- Separate CSV/XLSX trade-history import (`_detect_broker`: `"pair"` +
  `"date(utc)"`/`"side"` columns) — quantity field is space-separated
  (`"0.001 BTC"`), only the numeric portion is kept. Symbol goes through
  `_normalise_binance_symbol()` → `f"{base}-{quote}"`, **not** restricted to
  USD-quoted pairs here (unlike the live-sync path).

## Import Parsers

All parsing logic lives in `services/portfolio_importer.py`; orchestration
(Asset creation, dedup, persistence) in `services/portfolio.py`; routes in
`api/portfolio.py`.

### Generic CSV/XLSX/Tradebook (`parse_transaction_file`)

**Format**: CSV, XLSX, or PDF-with-extractable-tables. No password support.
Dispatches by file extension.

**Broker/format detection**: `_detect_broker()` inspects the lower-cased
header set — recognizes Zerodha (two shapes), Groww (three shapes, including
`groww_mf`), and Binance trade-history headers (see broker sections above for
the exact column signatures). If the caller passes an explicit `broker` form
field on `POST /portfolios/{id}/import`, auto-detection is skipped.

Column normalization is table-driven (`_COL_MAP`), covering all three
brokers' known export formats. Row transformation handles MF symbol slugging,
Binance pair splitting, Groww/Zerodha status filtering (only
executed/allotted/redeemed/etc. rows kept), price-from-total backfill, and the
NSE/BSE `.NS` canonicalization described above.

Row validation enforces symbol/date presence, `type` in
`{buy, sell, dividend, interest, split, bonus, contribution, withdrawal}`
(with an alias table), quantity > 0, price ≥ 0. Note: `recalculate_position`'s
actual replay logic only special-cases `BUY/SELL/BONUS/SPLIT/VALUATION` —
`dividend/interest/contribution/withdrawal` rows are stored as `Transaction`
rows but have **no effect on position quantity/avg price**.

**Entry point**: `POST /portfolios/{id}/import` →
`PortfolioService.import_transaction_file`.

**Symbol/Asset creation**: symbol comes straight from the parser. This is the
only import path where `ensure_asset_exists()` is called **without** `name`/
`asset_class`/`tier` — it relies on an Asset already existing (universe
seeding or an earlier import) rather than creating one itself. The parsed
row's `asset_type` field (`"mutual_fund"` for `groww_mf`, else `None`) is
currently **not passed through** to `ensure_asset_exists` — unused downstream.

**Transaction modeling**: each accepted row becomes a real `Transaction` with
`transaction_type` from the file, real `quantity`/`price`, `kind="trade"` —
the only importer producing true per-row ledger entries.

**Idempotency**: dedup key `(broker, broker_reference)`, `broker_reference`
sourced from the order/trade ID column (only present for Zerodha/Groww/
Binance formats that include one). Bulk pre-fetch: one query per broker
grouping candidate refs, plus an in-call `seen_this_call` set for intra-file
duplicates. **Rows lacking a `broker_reference` are never deduped** — re-
importing the same file re-inserts them every time.

### CDSL CAS (Consolidated Account Statement)

**Format**: PDF, with password support. Password-protected PDFs raise
`ValueError("PDF_PASSWORD_REQUIRED")` or `"PDF_PASSWORD_INCORRECT"` (via
`pdfminer.PDFPasswordIncorrect` detection), which propagate as HTTP 400 with
that literal string as `detail` — the frontend pattern-matches on it to
re-prompt for a password.

**Format detection**: no `_detect_broker()` involvement — two dedicated
table-shape detectors (MF folio statement table, demat-held MF holdings
table), keyed on normalized column-name sets, plus a DP (depository
participant) name regex scraped from page text. Folio-table and demat-table
rows are **merged by ISIN** — if a scheme appears in both, units are summed;
avg NAV comes from whichever source has it (demat table has none, defaults to
0.0).

**Entry point**: `POST /portfolios/{id}/import/cdsl` →
`PortfolioService.import_cdsl_cas`.

**Symbol/Asset creation**: `f"{isin}_MF"` if ISIN present, else a slugified
scheme name + `_MF`. `ensure_asset_exists(..., asset_class=p.get("asset_type")
or "equity")` — but the parser always sets `asset_type="mutual_fund"`, so the
`"equity"` fallback is effectively dead code.

**Transaction modeling**: single `broker_snapshot`-kind `BUY` transaction per
symbol — quantity = units, price = avg NAV (or 0.0). No per-transaction
ledger, snapshot only.

**Idempotency**: upsert-one-broker_snapshot-per-symbol, keyed
`(portfolio_id, symbol, kind="broker_snapshot", broker="cas_cdsl")` — **no
`broker_reference` used**; re-importing the same CAS PDF overwrites the
existing snapshot row in place (idempotent by construction, not
dedup-and-skip).

### NPS Statement

**Format**: CSV only, from the NPS CRA portal export. No password/XLSX/PDF
support. No `_detect_broker()` — structure is assumed fixed; detected by
scanning for literal section header rows (`"Investment Details - Scheme Wise
Summary"`, `"Transaction Details"`).

Tier detected via regex on the first line (`"Tier (I|II) Account"`) — raises
if absent. PRAN scraped from a row where the first cell is literally `"pran"`
— raises if missing. Scheme letter (E/A/etc.) extracted from
`"SCHEME X - TIER..."` style names.

Two independent sub-parses: **holdings** (one row per scheme from the
scheme-wise summary section) and **transactions** (per-scheme sections in the
transaction details, classified by description text — `"by voluntary
contributions"`/`"tier-2 contribution"` → BUY, `"billing for q..."` → SELL,
unrecognised descriptions fall back to sign-of-units with a logged warning).

**Entry point**: `POST /portfolios/{id}/import/nps` →
`PortfolioService.import_nps_statement`.

**Symbol/Asset creation**: `f"NPS-{pran}-{letter}-T{tier}"` (e.g.
`NPS-1234567890-E-T1`). `ensure_asset_exists(..., asset_class="nps",
tier=h["tier"])` — tier (1 or 2) is a real column on `Asset`, not just
embedded in the symbol.

**Transaction modeling**: **real BUY/SELL transactions with real per-scheme
quantities** (`kind="trade"`) — genuinely different from EPF/CDSL. Plus a
separate `broker_snapshot` holding row per scheme, upserted the same way as
CDSL. Raw NPS description text stored in `notes`.

**Idempotency**:
- Holdings: same upsert-one-broker_snapshot-per-symbol pattern as CDSL, keyed
  by `broker="nps"`.
- Transactions: `broker_reference = f"{symbol}|{date}|{description}"`, deduped
  by broker-scoped query plus `seen_this_call` for intra-file duplicates.

### EPF Statement

**Format**: PDF (EPFO Member Passbook export), no password support. No
`_detect_broker()` — structure assumed fixed. Only reads **page 1** (Member
Passbook) for holdings/transactions; page 2 ("Taxable Data") is used purely
as a cross-check, **never imported as transactions**.

Header fields (UAN, Establishment ID/Name, Member ID/Name) scraped via regex.
**Known real-world gotcha, now fixed**: pdfplumber's actual `extract_text()`
output for a real EPFO export uses `|` as the bilingual label/value separator
(`यू ए न | UAN | 101656562831`), not the colon the original regexes assumed
(`UAN\s*:\s*(\d+)`) — this caused `"Could not find UAN in EPF passbook"` in
production against a real file. The header regexes now accept either `:` or
`|`. A regression test using the real extracted header text was added
(`test_parse_epf_statement_real_pipe_delimited_header` in
`test_epf_import.py`).

Row classification skips the `"no transactions available"` marker (sets
`zero_transaction_year=True`, a valid non-error state — holdings still get
populated from the Closing Balance row so the Asset/Position is created
regardless), opening/closing balance rows, and summary rows, treating
everything else as a candidate contribution row per the documented column
layout (`Wage Month, Date, Type, Particulars, EPF Wages, EPS Wages, Employee,
Employer, Pension`).

**Entry point**: `POST /portfolios/{id}/import/epf` →
`PortfolioService.import_epf_statement`.

**Symbol/Asset creation**: `f"EPF-{uan}"`. `ensure_asset_exists(...,
asset_class="epf")`.

**Transaction modeling** — confirmed exactly as commonly assumed:
- Holdings snapshot: `kind="broker_snapshot"`, `BUY`, `quantity=1.0`,
  `price=current_value` (Employee + Employer + Pension closing balance) — EPF
  has no per-unit NAV, so it's modelled as a lump-sum balance, same
  convention as a manually-valued asset.
- Per-row contributions: `kind="broker_trade"` (**not** `"trade"`) —
  contributions aren't per-unit purchases the way NPS's BUY replay assumes,
  so they must never drive `Position.quantity`; they're audit-trail only. The
  holdings snapshot is what actually drives `Position.quantity`/value via
  `recalculate_position`'s broker_snapshot fallback path. `quantity=1.0`
  (hardcoded), `price=amount` (Employee+Employer+Pension summed), Employee/
  Employer/Pension breakdown preserved in `notes`.

Additionally, a page1/page2 contribution-total cross-check logs a warning
(not an error) on mismatch > ₹1, surfaced as `summary["page2_cross_check_ok"]`.

**Idempotency**: same patterns as NPS — snapshot upsert keyed
`broker="epf"`, transactions deduped by
`broker_reference = f"{symbol}|{wage_month}|{date}"`.

**Known limitation** (docstring in `parse_epf_statement`, still true): only
the header + zero-transaction path has been validated against a real EPFO
export — the populated-transaction-row parsing follows the documented column
layout but hasn't been exercised against a real file with actual contribution
rows. `test_epf_import.py`'s populated-row test is explicitly synthetic ("no
fixture with actual contributions was available").

### Manual / Real-Estate Assets (referenced by EPF's modeling convention)

`create_manual_asset` always inserts `transaction_type="BUY"`, `kind="trade"`,
real `quantity`/`price` — non-tradeable classes (real estate, EPF/NPS shown
manually, insurance, etc.) are forced to `quantity=1.0`/`price=current_value`
by the API layer (`_TRADEABLE_ASSET_CLASSES = {stock, stocks, equity,
mutual_fund, etf, crypto}` gates this). Revaluation goes through
`update_manual_valuation`, which inserts a **`transaction_type="VALUATION"`**
row (not `SPLIT`) — `recalculate_position` explicitly no-ops on `VALUATION`
for quantity/avg-price (it only updates the asset's current price
separately). `SPLIT` is reserved for real corporate-action stock splits,
where `price` is treated as a multiplier — a materially different meaning
from `VALUATION`'s absolute unit price.

## Shared Patterns

### `ensure_asset_exists()`

Defined in `app/modules/market/services/market.py`. Derives a deterministic
`uuid5(NAMESPACE_DNS, symbol.upper())` as the asset ID (so repeated calls for
the same symbol always resolve the same ID without a DB round-trip first).
Only creates/touches the `Asset` row when a `name` is supplied by the caller
— callers that omit `name` rely on an Asset already existing (universe
seeding or an earlier import). When it does touch the row, it won't clobber
an existing real name (only upgrades a placeholder that's empty or equals the
symbol itself), and updates `tier` if given.

**`LatestQuote` is never seeded here** — a prior fake-data fix removed the
old `price=0.0` placeholder; the function's own comment now states this
explicitly ("must only ever hold a real ingested... price... seeding a fake
0.0 here would defeat that [signal]"). It only *reads* `LatestQuote` (to
carry a real price into the snapshot below, if one already exists) and never
writes it. An `AssetSnapshot` row is still always created if missing
(`price` copied from `LatestQuote` if present, else `None`; every other
metric `None`). Every branch is existence-checked, so it's safe to call
repeatedly.

All current callers are in `services/portfolio.py` (thirteen call sites, all
listed above per-parser). Watchlist's `add_symbol` used to call this too but
never passed `name` (so it never touched `Asset`) and never stored the
returned `asset_id` anywhere (`WatchlistSymbol` has no such column) — the
call's only live effect was an orphaned, permanently-empty `AssetSnapshot`
row every time a new symbol was searched. That call was removed entirely
(`BACKLOG_SWEEP_SCOPE.md` Part 1); this function's snapshot-creation
behavior itself is unchanged and still required by every remaining
(portfolio) caller, since `Position`/`Transaction.asset_id` FK into
`AssetSnapshot.asset_id`, not `Asset.id`.

### ProviderFactory / Registry Autodiscovery

`app/core/providers/registry.py`: providers self-register at import time —
each `app/modules/<module>/providers/<category>/<name>/provider.py` calls
`registry.register(...)` at module bottom. `discover()` walks
`app.modules.market.providers`, `app.modules.portfolio.providers`,
`app.modules.ai.providers` via `pkgutil.walk_packages`, importing every
submodule ending in `.provider` (which triggers the self-registration side
effect). Guarded by a `_discovered` flag so it only walks once per process;
`get()`/`list()` call `discover()` first, so it's lazy but idempotent.

`ProviderFactory` (`app/core/providers/factory.py`) sits on top: `get(name,
required=True)` fetches the bare instance from the registry, then overlays
DB-stored `ProviderConfig` (enabled/status/credentials), raising
`ConfigurationError` if unregistered/disabled/planned when `required=True`.
`get_fallback_chain()` resolves a priority list, silently skipping
unavailable providers.

**Bug found and fixed** (commit `9c93bce`, "test+fix: provider framework unit
tests, circular import, missing polygon seed"): `factory.py` imported
`ConfigService` at module scope while `app.domain.services.ai` imports
`ProviderFactory` at module scope — importing `factory.py` first (rather than
transitively via the AI service) crashed with a circular import. Fixed by
moving the `ConfigService` import behind `TYPE_CHECKING` and quoting the type
hint. Still in place today (paths updated post-refactor to
`app.modules.ai.services.ai` / `app.core.services.config`). The same commit
also fixed a related gap: Polygon had been migrated onto the plugin registry
but its `ProviderConfig` seed row was missing, silently falling back to a
generic gray swatch in the frontend onboarding provider list.

### `classify()` and UI Bucketing

Defined in `app/modules/market/services/market.py`. Substring-matches the raw
`Asset.asset_class` string into a fixed bucket vocabulary: `stablecoin`,
`crypto`, `bonds`, `funds`, `real_estate`, `retirement` (matches
`retirement`/`epf`/`nps`), `insurance`, falling back to symbol-suffix checks
(`_MF` → funds, `-USD` → crypto) when `asset_class` is empty, else `stocks`.
Called from several `market.py`/`assets.py` endpoints, always assigned to a
`"class"` key in API response dicts (the `/api/state`-composite payload and
asset search results).

Frontend: `useAureonData.js` sets each holding's `class` from this backend
field. `PfHoldingsTable.jsx` renders filter tabs
(`all/stocks/crypto/funds/bonds/retirement/passive`) filtering on `h.class` —
except the `"passive"` tab, which filters on a **separate** `h.tier` field,
not a `classify()` output (see Known Backlog below).

## Known Backlog / Unresolved Items

1. **Crypto futures signal resolution — permanent, by design.** Futures
   symbols (`-USDM`/`-COINM` suffixed, from `WALLET_SUFFIXES`) are
   structurally unresolvable by the Yahoo-based signal pipeline — Yahoo has
   no such ticker, so RSI/signals will never compute for them
   (`app/modules/market/services/assets.py`, explicit comment: "that's
   permanent, not 'not available yet'"). **Correction to the original
   framing**: "Earn"-wrapper symbols are *not* a separate unresolvable case —
   Spot and Simple Earn balances are merged into one Position per asset
   before a symbol is even assigned, so there's no distinct Earn symbol to
   fail to resolve. Only futures (`-USDM`/`-COINM`) symbols hit this limit.

2. **No ISIN→symbol resolution for Zerodha Tax P&L/Holdings Statement
   exports — confirmed.** `_detect_broker()` only recognizes the contract-note
   and Console Tradebook shapes; no branch matches a Tax P&L or Holdings
   Statement header. The ISIN-handling code that exists (`_clean_isin` etc.)
   is exclusive to CDSL CAS PDF parsing, not any Zerodha CSV path.

3. **EPF populated-contribution-row parsing unvalidated — confirmed,
   unchanged.** Docstring in `parse_epf_statement` still states only the
   header + zero-transaction path has been validated against a real export;
   `test_epf_import.py`'s populated-row test remains explicitly synthetic.

4. **Import response field naming inconsistency — confirmed, documented.**
   CDSL CAS returns `imported_holdings`; NPS and EPF both return
   `holdings_imported`. Already noted in `KnownLimitation.md` as cosmetic,
   not worth a breaking-change fix right now.

5. **`useAureonData.js` hardcoded `tier: 'active'` — resolved.** Now derives
   `tier` from `pos.price_source` (`"manual"`/`"epf_estimated"` → `'passive'`,
   else `'active'`), the same field `resolve_position_price()` already sets
   to distinguish a user-entered valuation from a real market quote — so
   `PfHoldingsTable.jsx`'s "Passive" filter tab and "Manual" row badge now
   reflect real state.

6. **`app/core/repositories/monitoring.py` imports domain entities directly
   — confirmed.** Imports `LatestQuote` (market), `Position`/`Transaction`
   (portfolio) at module scope and queries them in `list_all_quotes()` /
   `count_transactions()` — a cross-module domain-entity dependency from a
   file living under `core/`, which the layering convention (`core/` =
   domain-entity-free) says shouldn't happen.

Four more backlog items are already documented in full above, in their
respective sections — listed here only as index pointers, not restated, to
avoid the doc disagreeing with itself:

7. No scheduler wires broker sync `JobConfig` cron expressions to actual
   dispatch — see the **Broker Sync Providers** intro above (`sync_zerodha`/
   `sync_binance`/`sync_groww`/`sync_portfolio` all have cron expressions
   that nothing reads; manual `/portfolio/sync` is the only real trigger).
8. Zerodha has no access-token refresh flow — see **Zerodha → Auth** above.
9. Groww requires a daily manual in-app approval step — see **Groww → Auth**
   above.
10. Generic CSV importer's `asset_type` field is parsed but unused — see
    **Generic CSV/XLSX/Tradebook → Symbol/Asset creation** above.

Only two `TODO`/`FIXME`/`unvalidated`-style comments exist in the portfolio
module tree, both already covered above: the EPF populated-row caveat (#3)
and a docstring note that `BinanceBrokerProvider` doesn't support order
placement (a scope note, not a bug — reflected in its `PARTIAL` status).
