# Watchlist Module Audit

Scope: backend `app/modules/market/{entities,repositories,services,api}/watchlist.py`, frontend
`frontend/src/pages/aureon/Watchlist.jsx` (plus `apiService.js`'s watchlist client methods). Per
the last handoff, this module has never had a full audit — only an old exchange-label fix from
the market-module pass touched it. Same discipline as prior audits: audit before modifying,
tiered triage, live verification over static reasoning. **Nothing in this report has been fixed —
all findings are reported for review/decision, per the ask.**

Live-verified against the running docker-compose stack (API on :8002, Postgres on :5433). No
pre-existing watchlist rows existed in the DB; created a throwaway watchlist ("Audit Test") and
added three symbols (AAPL — has a live quote; ZZZZTEST — a fake symbol with no quote, to check
the missing-data path; BTC-USD — to check crypto handling), then deleted them at the end of the
session to leave the DB clean. Confirmed `watchlist.watchlists` / `watchlist.watchlist_symbols`
both back to 0 rows. Adding `ZZZZTEST` also left a test-created orphaned `market.asset_snapshot`
row behind (see finding 4.8) — `remove_symbol` doesn't clean these up, which is itself part of the
finding — so that row was deleted manually as a separate cleanup step, and a timestamp-scoped
check confirmed no other test-window rows were left in `market.asset_snapshot` or `market.assets`.

---

## 1. Module location (confirmed, not assumed)

Lives under `app/modules/market/`, not `portfolio/` or a standalone module — same
entities/services/api/repositories split as the rest of that domain:

- `entities/watchlist.py` — `Watchlist` (schema `watchlist`, one row per named list,
  `UniqueConstraint(user_id, name)`) and `WatchlistSymbol` (one row per symbol in a list,
  `UniqueConstraint(watchlist_id, symbol)`, optional `alert_price`). Cascade delete on both the
  ORM relationship and the FK (`ondelete="CASCADE"`).
- `repositories/watchlist.py` — plain CRUD, no surprises.
- `services/watchlist.py` — business logic, including the per-request asset-info enrichment
  (`_fetch_asset_info`) that joins live price data onto each symbol.
- `api/watchlist.py` — REST router, `/watchlist/...`, standard 404/409 mapping via `_handle`.
- Frontend: `frontend/src/pages/aureon/Watchlist.jsx` (all watchlist UI, self-contained), driven
  entirely through `apiService.js`'s six watchlist methods.

## 2. Data flow

**Adding a symbol** is manual-only, via a search box (`WLSearchBar`) that calls
`apiService.searchAssets`, or by typing an exact ticker. No auto-population. `add_symbol` calls
`ensure_asset_exists(session, sym_upper)` with **no name argument**, then inserts a
`WatchlistSymbol` row. Because `ensure_asset_exists` only touches the `Asset` table when a name is
supplied (a deliberate guard added in the market-module audit to stop fake-price seeding), adding
a brand-new symbol to a watchlist never creates or updates its `Asset` row — confirmed live (see
§4.3).

**Pricing** does *not* share `resolve_position_price()` (the portfolio price-resolution path
audited/centralized in the market-module pass). Watchlist has its own, separate enrichment
function, `_fetch_asset_info()` (`services/watchlist.py:15-38`), which does a single batched query
against `LatestQuote` keyed by symbol and hand-rolls exchange/currency/asset-type per symbol. This
is a real second price-fetch code path, distinct from both `resolve_position_price` and
`assets.py`'s `get_aureon_asset`. It is simpler than those (batched, one query, no fallback chain)
but re-derives logic that already exists elsewhere in the same module, with weaker output — see
§4.1, §4.2 below.

## 3. No-fake-data check — clean on price/previousClose, live-verified

- Missing quote (`ZZZZTEST`, never ingested): `currentPrice: null`, `previousClose: null`,
  `spark: []`. **No fabricated 0.0 or placeholder — correct.**
- Real quote (`AAPL`): `currentPrice: 330.12`. Correct, live value.
- Frontend price cell: `u.price > 0 ? fmt(...) : '—'` (`Watchlist.jsx:414`) — never renders a
  fabricated price string for a null/zero price. Correct.

**One design smell, not a visible fabrication (Tier 3, see below)**: `_fetch_asset_info` always
sets `previousClose = currentPrice` (`services/watchlist.py:33`) — there is no real
previous-close data source in this path at all, it's just the same number duplicated into a
second field. Confirmed live: AAPL and BTC-USD both came back with `currentPrice ==
previousClose` exactly. The frontend has a specific workaround for this
(`Watchlist.jsx:397-398`, comment: *"backend sets previousClose = currentPrice as fallback → show
—"*) — `hasDayPct` is `false` whenever `price === previousClose`, so Day Δ always renders `—`
instead of a fabricated `0.00%`. **So the no-fake-data policy is not actually violated in the
UI** — the frontend's equality check catches it. But it's a fragile, non-obvious guard: it also
hides a *genuine* zero-day-change (an asset that really didn't move), which is indistinguishable
from the fabricated case with the data as currently shaped. Flagged as Tier 3 below, not urgent,
because there is no visible fabrication today.

## 4. Findings

### Tier 1 — mechanical, no design question (recommend fixing, not yet done)

**4.1 — Watchlist rows never show the asset's real name — silently drops data that exists in the
same DB, live-confirmed.**

`_fetch_asset_info` sets `"name": sym` unconditionally (`services/watchlist.py:30`) — it never
queries the `Asset` table, only `LatestQuote`. Live-checked: `market.assets` already has
`AAPL → "Apple Inc."` and `BTC-USD → "Bitcoin"` (both pre-existing, seeded by asset-universe/
ingestion, unrelated to this session's test data). Watchlist's `/watchlist/` response for both
returns `"name": "AAPL"` / `"name": "BTC-USD"` — the ticker, not the real name — even though
`assets.py`'s `get_aureon_asset` (same module) already does this join correctly
(`asset.name if asset else ticker`). Frontend consequence: `Watchlist.jsx:407`'s sub-label
(`{u.name && u.name !== u.sym && (...)}`) can never render, because `name` always equals `sym` —
so the "company name under ticker" UI affordance is permanently dead, not because it's
unimplemented in the frontend, but because the backend never sends anything but the symbol. Fix
is a one-line join onto `Asset` (same pattern as `assets.py:132-133`), no design judgment needed.

**4.2 — `assetType` is hardcoded `"equity"` for every symbol, including crypto — wrong value,
currently harmless because it's unread.**

`_fetch_asset_info` line 34: `"assetType": "equity"` unconditionally. Live-checked: adding
`BTC-USD` returns `"assetType": "equity"` even though `market.assets.asset_class` for that same
symbol is `"crypto"`, and `infer_exchange_region` (called two lines above, same function) already
correctly resolves it to `exchange: "CRYPTO"`. Grepped the frontend: `Watchlist.jsx`'s row/enrich
logic never reads `assetType` from the watchlist API response (only `TradingViewChart`/`ChartTab`
use an `assetType` prop, but those get it from the Terminal page's own asset fetch, not from
watchlist data) — so this wrong value has no live user-visible effect today, but it's silently
incorrect data sitting in a shipped API response, one field-read away from becoming a visible bug
if anything ever consumes it (e.g., a future watchlist filter-by-asset-class). Mechanical fix:
derive from the same `Asset.asset_class` lookup as 4.1, or from `infer_exchange_region`'s region
output the way currency partially already does.

**4.3 — `currency` heuristic in `_fetch_asset_info` is narrower than the module's own
`infer_currency()` and will misclassify BSE (`.BO`) symbols.**

Line 35: `"currency": "INR" if sym.endswith(".NS") else "USD"` — handles NSE but not BSE
(`.BO`), and doesn't handle `epf`/`nps`/`mutual_fund` asset classes the way
`market.py`'s `infer_currency(asset_class, symbol)` already does. Not live-tested (no `.BO` or
retirement-account symbol was added during this pass — would need one to trigger), but this is a
straightforward static read: the existing correct helper is a two-line import away and already
used elsewhere in the same module. Mechanical fix: call `infer_currency` instead of re-deriving.

### Tier 2 — needs one explicit decision

**4.4 — `duplicateList` (frontend) silently drops every alert when copying a list.**

`Watchlist.jsx:679-700`: `duplicateList` creates a new watchlist, then loops
`apiService.addWatchlistSymbol(created.id, s.symbol)` for each symbol — it never calls
`setWatchlistAlert` for symbols that had `alertPrice` set on the source list. A user who
duplicates a watchlist to create a variant loses their price alerts on the copy without any
warning. This looks like a straightforward oversight rather than an intentional
"duplicate doesn't carry alerts" design choice, but since it changes user-facing behavior on an
already-shipped feature, flagging rather than fixing outright — **decision needed**: should
`duplicateList` also carry over each symbol's `alertPrice`? (If yes, fix is mechanical: add one
more `await apiService.setWatchlistAlert(created.id, s.symbol, s.alertPrice)` call per symbol
inside the existing loop, guarded on `s.alertPrice != null`.)

**4.5 — Real 30-day price history exists and is used elsewhere in this module, but watchlist rows
never get it — sparkline column is permanently empty.**

`_fetch_asset_info`'s `spark` field is `[price] if price is not None else []` — a single point,
never more (`services/watchlist.py:36`). The frontend only renders a sparkline when
`spark.length > 1` (`Watchlist.jsx:396`), so the "30d" column in the watchlist table can **never**
show a real chart — it always falls through to the `—` dash chip. Confirmed live: `AAPL`'s
response came back with `"spark": [330.12]` (length 1), and `assets.py`'s `get_aureon_asset` (same
module, same repo) already has working 30-point history via
`repo.get_recent_price_history(asset_id, limit=30)`. This isn't a copy-paste miss of identical
logic (per the recurring "check which duplicate is actually running" pattern from prior audits) —
it's a *different*, incomplete reimplementation that never got the history piece.
**Decision needed, not mechanical**: `get_recent_price_history` is keyed by `asset_id`, not
`symbol`, and is a single-asset query (`repositories/assets.py:29-36`). The `asset_id` itself is
readily available — `_fetch_asset_info` already loads each symbol's `LatestQuote` row, which
carries `asset_id` directly (the same field `assets.py:145` keys off), and it's also
deterministically derivable via `uuid5(NAMESPACE_DNS, symbol)` if needed. So this isn't blocked on
asset-id resolvability; the actual decision is **N+1 per-symbol history queries vs. a new
batched-by-`asset_id`-list history query** (a list of 20+ symbols would mean 20+ queries with the
naive approach), plus confirming `PriceHistory` rows actually exist for arbitrary
watchlist-only symbols (ones added via search but never held in the portfolio) — not a one-line
fix, worth scoping deliberately rather than copy-pasting the single-asset call in a loop.

### Tier 3 — architecture / deferred, no action needed now

**4.6 — `previousClose = currentPrice` is a data-shape smell, not a currently-visible bug (see
§3).** Already covered above. No visible fabrication today because the frontend's equality check
happens to catch it, but the underlying design (storing a "previous close" field that is never
actually a previous close) is fragile — a future frontend change that drops that specific
`price !== previousClose` guard would silently start rendering `0.00%` for every watchlist row.
Real fix (a genuine previous-close data source) is the same class of work as the currency-field/
per-holding-freshness gaps already deferred in the last handoff — not scoping it now.

**4.7 — Alert prices are stored but nothing ever evaluates or fires them — BUILT, see below.**

**Status update (2026-07-16): built and live-verified, per `BACKLOG_SWEEP_SCOPE.md` §3b.**
`WatchlistSymbol` gained `alert_direction` ("gte"/"lte", derived once at `set_alert` time by
comparing the target to the live price) and `alert_triggered` (crossing-suppression state),
migration `9a7ae6e25211`. Evaluation happens inline in the existing quote-ingestion chain — `ingest_quote`
(`app/workers/ingestion/tasks.py`) now dispatches `evaluate_watchlist_alerts.delay(symbol)`
(`app/workers/monitoring/watchlist_alerts.py`) right after `process_asset_snapshot.delay(...)`.
The task queries only `WatchlistSymbol` rows with a non-null `alert_price` for that symbol
(`WatchlistsRepository.list_active_alerts_for_symbol`, filtered at the query level), compares
current price against `alert_price`/`alert_direction`, and on a genuine crossing calls the
existing `NotificationService.create_notification` (the `notification.web_notifications` CRUD
stack, confirmed already fully wired end-to-end frontend included). Live-verified: set an alert
on AAPL, crafted a crossing via a direct `LatestQuote` price update + manual task invocation —
notification fired once, did not re-fire on a second evaluation at the same crossed price,
reset when price moved back across the threshold, and fired again on a fresh re-crossing.
Confirmed the new row surfaces via `GET /notifications/`. All test data (watchlist, symbol,
alert, notifications) cleaned up afterward; original AAPL price restored.

Original finding, superseded by the above, kept for history:

Grepped the entire backend (`app/workers/`, `app/core/services/notification.py`, and everywhere
else) for `alert_price`/`WatchlistSymbol`: **zero hits outside the watchlist module's own three
files** (entity/service/migration). There is no Celery task, no notification-service call, no
cron job that ever reads `WatchlistSymbol.alert_price` and compares it against a live price. The
UI (`Watchlist.jsx`) presents this as a live feature — "⚡N alerts armed" badge in the sidebar,
per-symbol alert chips, a rule-builder modal with live preview text like *"Notify when NVDA rises
to or above $500"* — none of which currently fires any notification, because nothing evaluates the
stored threshold against anything. This isn't a data-fabrication bug (no fake data is shown,
the price/alert values themselves are real), but it is a fully-built UI for a backend capability
that doesn't exist — flagging because "armed"/"notify when" language could reasonably lead the
user to expect an actual notification that will never come. Not a watchlist audit bug to fix
in isolation (it's a whole feature: an alert-evaluation worker + a delivery mechanism), consistent
with the backlog precedent of deferring unrequested feature scope. Flagging for awareness/decision
on priority, not fixing.

**4.8 — `ensure_asset_exists` leaves a permanently-orphaned, all-null `AssetSnapshot` row for
every genuinely new symbol added to a watchlist — confirmed live, but this is `ensure_asset_exists`
behavior (shared/cross-cutting), not watchlist-specific, and was already in scope of the earlier
market-module audit.**

Live-verified: adding `ZZZZTEST` (a symbol with no `Asset` row, no `LatestQuote`) created
`market.asset_snapshot` row `asset_id = uuid5(NAMESPACE_DNS, 'ZZZZTEST')` with every column null
(`price`, `market_cap`, `pe_ratio`, `rsi`, `momentum_score`, `volatility_score`,
`sentiment_score` — all null, `payload: {}`). `asset_snapshot.asset_id` has no FK constraint to
`market.assets.id` (confirmed by reading the entity — it's a bare `primary_key=True` UUID column,
no `ForeignKey`), so this row silently persists with no linked `Asset` row and no cleanup path —
removing the symbol from the watchlist does not touch it (`remove_symbol` only deletes the
`WatchlistSymbol` row). Every symbol a user types into the watchlist search-and-add box, even ones
they immediately remove or that never resolve to a real ingested asset, leaves one of these dead
rows behind permanently. Noting this because it's watchlist's `add_symbol` that's the trigger path
here, but the root cause (`ensure_asset_exists` always creating a snapshot row regardless of
whether a name/Asset was established) is shared infrastructure. It's related to, but distinct
from, the fake-`LatestQuote(price=0.0)`-seeding fix the prior market-module audit already made to
this same function — that fix stopped a *price* fabrication; this orphaned-empty-snapshot behavior
is a separate, previously-unflagged side effect of the same function, not something already
covered by that earlier work. **Not proposing a fix here, just confirming watchlist is one of the
call sites that reliably reproduces it, live-verified with a throwaway symbol this session (and
cleaned up manually afterward, since `remove_symbol` doesn't touch it).**

## 5. Removal / management — clean

- `remove_symbol` — deletes the `WatchlistSymbol` row only, no side effects. Live-verified: after
  removing `AAPL` from the test watchlist, `SELECT symbol FROM watchlist.watchlist_symbols` no
  longer listed it; the other two symbols were untouched.
- `delete_watchlist` — cascades (`cascade="all, delete-orphan"` on the ORM relationship, backed by
  `ondelete="CASCADE"` at the DB level). Live-verified: deleting the whole "Audit Test" watchlist
  left `watchlist.watchlist_symbols` at 0 rows for that `watchlist_id`, and the `watchlists` row
  itself gone — no orphans.
- No bulk operations exist (no "clear list," no "remove all," no multi-select) — confirmed by
  reading both the router and the frontend; not a gap, just a feature that was never built. Not
  flagging as missing since nothing in the module implies it should exist.

## 6. Dead/stale code check

- `assetType` field (4.2) is computed and shipped over the wire but genuinely unread by the
  frontend for the Watchlist page itself — verified by grep, not assumed (see §4.2 for detail on
  where `assetType`/`assetClass` actually comes from on the Terminal page instead).
- The `name` sub-label rendering path in `Watchlist.jsx:407` is live frontend code, not dead — but
  it can never fire today because of 4.1 (backend never sends a real name). Confirmed by tracing
  both sides rather than assuming either was dead in isolation.
- Everything else in the module (repository methods, service methods, API routes) has a live
  caller — no other unused code found.

## 7. Provider-toggle / provenance cross-check

Watchlist pricing reads only `LatestQuote` by symbol (§2) — it does not call any broker provider
(Zerodha/Groww/Binance) and is not touched by the broker-sync enable/disable toggle
(`_run_broker_sync`'s `required=False` check, `app/workers/ingestion/tasks.py:202-218`) at all;
that toggle only gates portfolio broker-sync jobs. Watchlist quotes come from the market-data
ingestion path (`ingest_quote`, same file, quote providers `yahoo`/`finnhub`/`binance_price`
depending on asset class) — if a market-data provider were disabled or failing, the practical
effect on watchlist is simply that `LatestQuote` stops being refreshed for symbols that provider
covers, and watchlist would keep showing the last-ingested price (or null, if never ingested) —
same behavior as every other `LatestQuote` consumer in the app, no watchlist-specific handling and
no watchlist-specific bug. Confirmed by reading `ingest_quote` and grepping for any
watchlist-specific provider-selection logic (there is none — watchlist has no opinion about which
provider populated a given `LatestQuote` row, it just reads whatever's there).

## 8. Summary

No live-visible fake-data rendering found (Tier 1 fabrication class, the most severe category in
this audit chain, is **clean** for this module) — the `previousClose = currentPrice` smell (§3,
§4.6) is real but currently masked by a frontend equality guard, not a rendering bug today. Three
small, low-risk Tier 1 mechanical fixes recommended (4.1 real name, 4.2 real asset type, 4.3 full
currency logic — all one-line joins onto data that already exists). Two Tier 2 items need a
decision before touching (4.4 duplicate-list alert carry-over, 4.5 real 30-day sparkline data).
Three Tier 3 items noted for awareness, not action: the previousClose data-shape smell, the
alert-armed-but-never-fires gap (a whole missing feature, not a bug), and the
`ensure_asset_exists`-orphaned-snapshot-row behavior (shared infrastructure, not watchlist-owned —
related to but distinct from the fake-price-seeding fix the prior market-module audit already
made to this function). Removal/deletion paths for watchlists/symbols themselves are clean with no
orphaned rows in the `watchlist` schema; the one orphan found (4.8) is in `market.asset_snapshot`,
a side effect of shared infrastructure, not the watchlist deletion code.
Provider-toggle cross-check confirms watchlist pricing is unaffected by the broker-sync toggle and
behaves the same as any other `LatestQuote` consumer if a market-data provider is degraded.
