# Backlog Sweep — Scope (Part 3 of the backlog-sweep pass)

Status: **draft for review, no implementation yet**

Three items deferred across prior audits, scoped together per the backlog-sweep
prompt's "one combined doc, your call." Same discipline as
`FUNDAMENTALS_SCORING_SCOPE.md`/`WORKERS_OBSERVABILITY_SCOPE.md`: investigate
current state first, present options with reasoning, flag open questions
rather than deciding unilaterally. Nothing in this doc has been built.

======================================================================

## Part A — Observability read-side (`task_runs`, `audit_logs`, `ErrorFingerprinter`)

### A.1 Re-verified: all three are still write-only, confirmed live by grep, not assumed

- **`system.task_runs`** (`TaskRun` entity, `app/core/entities/system.py`) — landed since the
  last pass as `WORKERS_OBSERVABILITY_SCOPE.md`'s recommended item 2 (commit `32e3768`,
  "Add TaskRun table + Celery signal handlers for per-task run history"). Its repository
  (`app/core/repositories/task_run.py`) has exactly two methods, `create_started` and
  `mark_terminal` — both writes, no `list`/`get`/`filter`. Grepped `backend/app` for
  `TaskRunRepository` and `TaskRun` — the only call sites are the three Celery signal
  handlers in `celery_app.py` that write it. **No reader anywhere**, confirmed unchanged from
  what this table's own scope doc predicted it would need (§3 there, not yet built).
- **`system.audit_logs`** (`AuditLog` entity) — `app/core/services/audit.py` has one function,
  `log_audit_action`, which only inserts. Grepped for `AuditLog` — two hits, the entity file
  and this write-only service. No API route, no repository query method, no reader.
- **`ErrorFingerprinter.get_fingerprints()`** (`app/core/observability/health.py`) — grepped
  for `get_fingerprints` across `backend/app`: the only hit is the method definition itself.
  `register_error` (the write side) presumably has callers elsewhere (not re-checked here,
  out of scope for this pass), but the aggregate accessor has zero callers.
- Cross-checked `app/api/v1/monitoring.py` (the module CLAUDE.md notes "hasn't moved yet") for
  all three names — zero hits. Monitoring's own audit (`MONITORING_MODULE_AUDIT.md`, this
  session-chain) already concluded "no frontend, curl-only ops surface" for its own
  content — that conclusion is about `system.task_runs`'/monitoring's *existing* seven
  endpoints, not about whether a read-side should exist at all; it didn't have occasion to
  consider `audit_logs`/fingerprint aggregation since those aren't monitoring-module tables.

### A.2 Does "curl-only, no dashboard" still hold once there's an actual reason to look?

This is the open tradeoff, not decided here:

- **The monitoring audit's conclusion was about UI, not about read endpoints.** Its own
  finding (`MONITORING_MODULE_AUDIT.md` §4, "curl-only ops surface... no frontend") is
  specifically about *building a frontend page* — it didn't argue against a queryable read
  endpoint existing at all, since a `curl`-based workflow still needs *something* to `curl`
  against. Right now there's nothing to curl for any of these three data sources — an operator
  debugging "did asset X's evaluation chain complete last night" or "what does the error
  fingerprint aggregate look like this week" has to open a DB client and hand-write SQL. A
  read endpoint doesn't contradict "no dashboard," it's the thing "curl-only" was assuming
  existed.
- **The debugging-moment argument for building it now**: `WORKERS_OBSERVABILITY_SCOPE.md` §3.1
  already made this case for `task_runs` specifically — "if item 2 ships, most of what a
  dashboard would show is already sitting in one queryable table... no dashboard UI required
  to answer any of them for a single operator checking on their own system," recommending a
  thin read endpoint over the table, explicitly not a UI. Item 2 (the table) has since shipped;
  the read endpoint it was contingent on has not. `audit_logs` and the fingerprinter aggregate
  are new to this pass, not covered by that doc, but the same reasoning applies structurally:
  single-user local software, no push/alerting need, a query-shaped answer is proportionate.
- **The counter-argument for leaving it fully deferred**: nothing in either audit surfaced an
  actual incident where the *absence* of a read endpoint cost real debugging time — this is
  "would help if X happens" reasoning, not "X happened and this data would have helped."
  `WORKERS_OBSERVABILITY_SCOPE.md` flagged the same tension for `task_runs` alone and left it
  as an open question rather than building preemptively. That reasoning hasn't been overtaken
  by anything found in this pass.

**Not deciding this here** — flagging as the first open question in §A.4.

### A.3 If built: one unified endpoint or three separate ones?

- **One unified endpoint** (e.g. `GET /monitoring/activity?source=task_runs|audit_logs|errors`)
  — a single mental model ("what happened, and when") for an operator who doesn't necessarily
  know in advance which of the three tables holds the answer to "why did X look wrong
  yesterday." Downside: the three sources have genuinely different shapes (`TaskRun` is
  per-task-invocation with duration/status; `AuditLog` is per-user-action with actor/entity;
  the fingerprint aggregate is pre-grouped, not row-level) — forcing one response schema over
  them either lossy-flattens the differences or produces a `oneOf`-style response that's not
  simpler than three endpoints would have been.
- **Three separate endpoints**, one per source, each shaped naturally for its own table
  (`GET /monitoring/task-runs?task_name=&status=&asset_id=&since=`, `GET
  /monitoring/audit-logs?actor_id=&entity_type=&since=`, `GET /monitoring/error-fingerprints`)
  — matches `WORKERS_OBSERVABILITY_SCOPE.md` §3's original recommendation for `task_runs`
  alone ("one simple read endpoint... filterable by task_name/status/asset_id/time range").
  Slightly more route surface, but each endpoint stays a thin, obvious pass-through over its
  table's existing filter columns — no schema-unification design problem to solve.
- **Leaning three separate, thin endpoints** if built at all — the unification benefit (one
  URL to remember) is small for a single operator who already knows which system they're
  debugging when they go looking, and the cost of forcing a shared response shape onto three
  structurally different tables is real, not hypothetical. Not deciding — flagging as §A.4.

### A.4 Open questions

1. Build a read endpoint at all now, or leave deferred until a concrete incident makes the
   gap costly (same tension `WORKERS_OBSERVABILITY_SCOPE.md` already flagged for `task_runs`
   alone, now extended to all three)?
2. If built: one unified endpoint across all three sources, or three separate thin endpoints
   (recommended shape above, not decided)?
3. `FailedIngestion` (`system.py`, written by `ingest_quote`'s `record_failure`) is a fourth
   write-only table `WORKERS_OBSERVABILITY_SCOPE.md` §2.1 already flagged, distinct from these
   three — worth folding into the same read-side pass if one gets built, since it's the same
   shape of gap, not a new decision.

======================================================================

## Part B — Watchlist alert evaluation + delivery

### B.1 What exists today, re-verified live

- `WatchlistSymbol.alert_price` (Numeric, nullable) is stored per symbol —
  confirmed schema, no evaluation logic anywhere. Grepped `app/workers/`,
  `app/core/services/notification.py`, and the rest of the backend for
  `alert_price`/`WatchlistSymbol`: zero hits outside the watchlist module's own
  three files, unchanged from `WATCHLIST_MODULE_AUDIT.md` §4.7's finding.
- The frontend (`Watchlist.jsx`) presents alerts as live: sidebar "⚡N alerts armed" badge (now
  "Alert target" post the copy fix in `c9ca06c`), per-symbol chips, a rule-builder modal —
  none of which is backed by anything that evaluates the stored price.

### B.2 Delivery mechanism already exists — checked live, not assumed

Per the task's explicit instruction not to assume delivery needs building from scratch: it
does not.

- **`notification.web_notifications`** (`WebNotification` entity, `app/core/entities/
  notification.py`) is a real table with a full CRUD stack already wired end-to-end:
  - Backend: `WebNotificationsRepository` → `NotificationService` (list-by-user, create,
    mark-read, mark-all-read) → `app/core/api/notification.py` router (`GET/POST
    /notifications/`, `PUT /notifications/{id}/read`, `PUT /notifications/mark-all-read`).
  - Frontend: `apiService.getNotifications()` is called from `useAureonData.js`'s
    `notificationsQuery` (react-query, `staleTime: 15000`, **no `refetchInterval`** — refetches
    on window focus/remount, not continuously polled). `notifications` feeds `unreadCount`
    (badge count) and is rendered on the dedicated `Notifications.jsx` page plus `TopBar.jsx`.
- **What's missing is only the writer.** Grepped every call site of
  `NotificationService.create_notification` / `WebNotificationsRepository` — the only caller
  is the `POST /notifications/` HTTP route itself, invoked by the currently-authenticated user
  (`get_current_user` dependency). **No Celery task, no worker, no scheduled job ever creates a
  `WebNotification` row today.** The infrastructure is a working manual/user-initiated CRUD
  surface; nothing autonomous writes into it yet.
- So the actual gap for alert delivery is narrower than "build a delivery mechanism" — it's
  "call an existing service method from a new Celery task instead of from an HTTP handler."
  `NotificationService.create_notification(data)` takes a plain dict
  (`user_id`/`title`/`message`/`type`) and has no HTTP-specific dependency baked in — a worker
  task can open a `SessionLocal()`, construct the same repository/service pair the API route
  uses, and call it directly, the same pattern already used throughout `app/workers/`.

### B.3 Where evaluation would run

- **New Celery periodic task**, following the existing quote-ingestion-chain shape
  (`ingest_quote` → `process_asset_snapshot` → ... in `app/workers/`): a task that queries all
  `WatchlistSymbol` rows with `alert_price IS NOT NULL`, joins each against `LatestQuote` by
  symbol (the same table watchlist's own `_fetch_asset_info` already reads — no new price
  source needed), compares current price against `alert_price`, and calls
  `NotificationService.create_notification` for symbols that cross the threshold.
- **Beat-schedule cadence** — needs a decision, not obvious from existing patterns: quote
  ingestion runs hourly (`ingest_all_quotes`, per `celery_app.py`'s beat schedule), so alert
  freshness is naturally bounded by that regardless of how often the alert-eval task itself
  runs; running alert-eval more often than quotes actually update would just re-check the same
  stale price. Tying it to the same cadence (or triggering it as a downstream step after
  `ingest_quote`/`process_asset_snapshot`, similar to how snapshot triggers features/signals/
  scores/health today) avoids adding a second independent schedule that can drift out of sync
  with actual price freshness.
- **Re-fire suppression — a real design question, not mechanical.** A naive "price >=
  alert_price → notify" check re-fires every single evaluation cycle for as long as the price
  stays above threshold (hourly, indefinitely) unless something tracks "already notified for
  this crossing." Two shapes, not decided:
  - Add a `last_alerted_at` / `alert_fired` field to `WatchlistSymbol`, cleared when the user
    edits or re-arms the alert.
  - Treat it as fire-once-then-clear: evaluation sets `alert_price = NULL` after firing (matches
    "one-shot price target" semantics, but changes what "editing an alert" means from the
    user's perspective — the alert disappears once hit, rather than staying visible/re-editable).
  Needs a decision before implementation; not resolving here.

### B.4 Sizing

Small-to-moderate: one new Celery task + one new beat-schedule entry (or chain-hook), reusing
`LatestQuote` (no new price source) and `NotificationService.create_notification` (no new
delivery infra) — the two most expensive-looking pieces already exist. The re-fire-suppression
field is the one schema change needed, and its shape depends on the open question above.

### B.5 Open questions

1. Beat-scheduled independently, or triggered as a downstream step of the existing
   ingest-quote chain (avoids a second schedule drifting from actual price freshness)?
2. Re-fire suppression: a `last_alerted_at`/`alert_fired` field (alert stays configured,
   re-arms manually or via a cooldown), or fire-once-and-clear (`alert_price` set back to
   `NULL` on fire)? These have different UX implications, not just different implementations.
3. Should the notification's `type` field (`info`/`warning`/`error`/`success` per the
   `WebNotification` entity) map to anything alert-specific, or is `info` sufficient?

======================================================================

## Part C — PROVIDERS.md consolidation

### C.1 Empirical check: has the regeneration trigger actually been followed?

Per `PROVIDER_TOGGLE_AND_PILOT_DOCS_SCOPE.md`'s proposed rule — "if a session's audit/scope
work materially changes what's true about a piloted folder, update that folder's `reference.md`
as part of the same session/commit, not deferred" — checked git history on both pilot docs:

```
git log --follow -- backend/app/modules/market/reference.md
git log --follow -- backend/app/modules/portfolio/reference.md
```

**Both return exactly one commit each (`3452646`, the commit that created them) — neither has
been touched since.** That commit sits 17 commits behind current `HEAD`. In the commits since,
work has materially touched both piloted folders without a `reference.md` update:

- **`market/`**: this session-chain produced `WATCHLIST_MODULE_AUDIT.md` (new, more than 3
  sentences of material) plus three follow-on fixes (`bae3e4a` real name/type/currency/spark,
  `c9ca06c` alert copy, `5f287e3` duplicate-list alert carryover, plus this pass's own
  `d5879ae`/`d0d0269`/`3b13809`) — none reflected in `market/reference.md`'s "Details / history"
  list, which still only names four docs and doesn't mention watchlist at all.
- **`portfolio/`**: `857fb79` ("Add dispatch-time concurrency guard for broker-sync jobs")
  materially changes a claim `portfolio/reference.md` itself would reasonably need to make
  about sync dispatch behavior — not reflected there either.

**Conclusion: the trigger is not being followed in practice.** This is itself the useful
signal the task asked for — not "the pilot format is wrong," but "a proposed rule with no
enforcement mechanism doesn't get followed just because it was written down," which is worth
surfacing before deciding whether to invest further in the `reference.md` pattern versus, e.g.,
folding upkeep into an existing checklist/discipline step that's already consistently followed
(the audit-doc-per-session habit clearly *is* being followed — three new audits landed this
session-chain — so the gap is specifically "update the 3-sentence pointer doc," not "do the
investigative work at all").

### C.2 What's actually redundant in `PROVIDERS.md`'s 563 lines vs. genuinely unique

Read the full file. Breaking down by section:

- **Lines 1–232 (Broker Sync Providers: shared orchestration + Zerodha/Groww/Binance
  detail)** — **genuinely unique, no other home.** This is deep, load-bearing mechanism detail
  (auth flows, symbol-mapping quirks, idempotency keys, per-broker gotchas like Groww's daily
  manual-approval step or Binance's COIN-M `userTrades` pair-vs-symbol scoping) that isn't
  duplicated in any audit or scope doc — `portfolio/reference.md` only has a 2-3 sentence
  summary pointing back here. **Keep**, don't delete.
- **Lines 233–425 (Import Parsers: CSV/CDSL/NPS/EPF/Manual)** — **mostly genuinely unique** for
  the same reason (format detection, column mapping, real-world gotchas like the EPF PDF
  pipe-delimiter bug). One exception: EPF's transaction-modeling section overlaps with
  `EPF_ESTIMATE_SCOPE.md`'s territory — not re-checked in this pass whether that doc covers the
  same ground or a different angle (interest-accrual estimate vs. statement-import parsing);
  flagging as worth a closer diff before trimming, not resolving here.
- **Lines 427–441 (`ensure_asset_exists()` shared pattern)** — **stale, and now more stale
  after this pass's Part 1 fix.** States it "Separately guarantees a `LatestQuote` (price=0.0
  placeholder) and `AssetSnapshot` (all metrics None) row exist for the asset" — the `price=0.0
  placeholder` claim was already wrong before this pass (a prior market-module audit fixed that
  exact fabrication; `market.py`'s own comment at the function now explicitly says `LatestQuote`
  "is intentionally NOT seeded here"), and this pass's Part 1 fix additionally removed
  watchlist's call to this function entirely. **This section needs a correction regardless of
  the consolidation decision** — it's actively wrong today, not just redundant.
- **Lines 443–471 (ProviderFactory/Registry Autodiscovery)** — mechanism detail with no other
  home, **genuinely unique**, keep.
- **Lines 473–488 (`classify()` and UI Bucketing)** — mechanism detail, **genuinely unique**,
  keep.
- **Lines 490–563 (Known Backlog / Unresolved Items, 10 numbered findings)** — **this is the
  section most redundant with other docs**, or at least most naturally *belongs* in an audit
  doc rather than a mechanism-reference doc. Several items here (#7 no-scheduler-wiring, #8
  Zerodha no-refresh-flow, #9 Groww manual-approval) read exactly like audit findings, not
  reference material — they're about what's *wrong*, not how the system *works*. No dedicated
  portfolio-module audit doc exists yet to hold them (unlike market/, which now has
  `MARKET_MODULE_AUDIT.md` + this session's `WATCHLIST_MODULE_AUDIT.md`), so today there's
  nowhere else for this list to live — deleting it without a new home would lose real findings,
  not just deduplicate them.

### C.3 Recommended shape (not decided — options, not a unilateral call)

- **Do not delete the mechanism-detail sections** (broker sync, import parsers, provider
  registry, `classify()`) — confirmed genuinely unique, no audit/scope doc covers this ground.
  `PROVIDERS.md` remains the only home for it.
- **Fix the stale `ensure_asset_exists()` section now**, independent of any broader
  consolidation decision — it states something false about current behavior (the 0.0
  placeholder claim, and now doesn't mention that watchlist no longer calls it at all post this
  session's Part 1 fix). This is a correctness fix to an existing doc, not a scope decision —
  flagging it here since it was found during this scoping pass, not doing it in this pass per
  the "scope only" instruction for Part 3.
- **The "Known Backlog" section (#1–10) is the real consolidation question**: either (a) leave
  it in `PROVIDERS.md` as-is until a dedicated `PORTFOLIO_MODULE_AUDIT.md` exists to receive it
  (mirroring how `market/`'s pilot doc already points out to `MARKET_MODULE_AUDIT.md` /
  `WATCHLIST_MODULE_AUDIT.md` rather than carrying findings inline), or (b) spin up that audit
  doc now specifically to receive this section, then trim `PROVIDERS.md` down to pure mechanism
  reference. (b) is more consolidation work than "trim the doc" implies — it's effectively
  commissioning a new audit, which is a real scope increase beyond what this backlog item asked
  for. **Leaning (a)** — leave the backlog section in place until (if ever) a portfolio-module
  audit is separately commissioned, at which point migrating it becomes a natural side effect
  of that work rather than a standalone trim.

### C.4 Sizing

- Correcting the stale `ensure_asset_exists()` paragraph: trivial, a few sentences, no decision
  needed — a mechanical doc fix once someone's touching the file.
- Full "trim what's redundant" as originally framed: **effectively nothing to trim today** —
  the mechanism sections are unique and the backlog section has no other home yet. The real
  finding of this pass is that PROVIDERS.md isn't over-large relative to what's genuinely
  unique in it; the redundancy the task suspected doesn't hold up on a full read.

### C.5 Open questions

1. Fix the stale `ensure_asset_exists()` paragraph now (small, mechanical, arguably not even a
   "decision") or bundle it with whatever eventually touches this file next?
2. Commission a `PORTFOLIO_MODULE_AUDIT.md` (mirroring `market/`'s now-two audits) as the
   receiving doc for the "Known Backlog" section, or leave that section living inside
   `PROVIDERS.md` indefinitely?
3. Independent of both: should the regeneration-trigger rule itself be revisited, given it's
   gone unfollowed for 17 commits' worth of material changes to both piloted folders? (Not
   proposing a fix — just surfacing that "write the rule down" alone didn't produce compliance
   here, which is evidence, not speculation.)

======================================================================

## Part D — `transaction_date` naive-timestamp storage risk (found during Binance backfill work)

Found incidentally while building the "since last sync" watermark for Binance backfill, not a
scoped investigation of this pass — recording it here rather than fixing it.

- **The column**: `Transaction.transaction_date` (`backend/app/modules/portfolio/entities/
  portfolio.py:41`) is declared `Mapped[datetime]` with no explicit `DateTime(timezone=True)`,
  which SQLAlchemy maps to Postgres `TIMESTAMP WITHOUT TIME ZONE`. Values round-trip through
  Postgres as naive timestamps — there's no stored offset, so "what timezone is this value in"
  is an implicit convention carried by whichever code wrote and reads it, not something the
  column itself enforces.
- **The new risk surface**: `_last_broker_trade_at()` (`backend/app/workers/ingestion/
  tasks.py:244-265`), added for the Binance backfill "since last sync" watermark, does
  `select(func.max(Transaction.transaction_date))` and hands the naive result straight to
  `provider.sync(since=since)` (`tasks.py:287-288`). This only computes the correct fetch
  window today because the dev machine's system TZ (IST) happens to line up with whatever
  implicit assumption produced the stored values — coincidental, not guaranteed by anything in
  the schema or the code.
- **Where it would break**: a deployment with `TZ=UTC` (a common default for Docker base
  images — a real possibility given this stack is fully Dockerized per `docker-compose.yml`)
  would silently compute a different "since" bound with no error raised — just a quietly wrong
  backfill window, most likely re-fetching or skipping trades near the boundary.
- **Not new, not scoped to this session's work**: this is a pre-existing storage/read
  convention already used everywhere `transaction_date` is touched in this codebase, consistent
  with the earlier-known IST/UTC skew documented for `retry_failed_ingestion` (see memory:
  timezone bug in retry_failed_ingestion). `_last_broker_trade_at` is a new *consumer* of the
  existing convention, not the source of the problem.
- **Severity**: not urgent for the current single-user, local, IST-machine deployment — the
  coincidence holds today. Real correctness risk (a) if this app is ever run with a UTC-
  configured container/environment, or (b) for any other timestamp-sensitive logic elsewhere in
  the codebase making the same implicit-timezone assumption that hasn't been audited yet.
- **Recommended fix direction, for whenever this is picked up**: store `transaction_date` (and
  likely other similarly-declared timestamp columns across the codebase) as `TIMESTAMP WITH
  TIME ZONE` / explicit UTC (`DateTime(timezone=True)`), and audit other call sites that read
  `transaction_date` expecting a specific implicit timezone before assuming the fix is
  contained to this one column.
- **No code changes made in this pass** — scoping only, per instruction.

======================================================================

## Part E — Binance Futures trade-history backfill: deferred, not forgotten

`BINANCE_BACKFILL_SCOPE.md` scoped both Spot and Futures (USDⓈ-M and COIN-M)
historical trade-history backfill. Only Spot was built (the one-time
`POST /portfolios/{id}/sync/binance/backfill` endpoint + resumable `fromId`
walk + `portfolio.binance_backfill_progress` checkpoint table). Futures was
explicitly scoped out of that build, not overlooked — recording the reasoning
here so it's revisitable later instead of needing to be re-scoped from
scratch.

- **What was deferred**: Binance Futures (USDⓈ-M `/fapi/v1/userTrades` and
  COIN-M `/dapi/v1/userTrades`) historical trade-history backfill. No fetch
  loop, no pagination/chunking, no checkpoint table for either futures wallet.
- **Why (1) — Binance's own cap makes "backfill" a much smaller thing for
  futures than for Spot**: Binance hard-caps futures trade history at 6
  months, enforced Binance-side since 2024-10-30, with no API path to
  anything older regardless of what's requested. Spot's `fromId` walk has no
  such cap (full account history is reachable), which is precisely why Spot
  backfill was worth building as designed. For futures, "backfill" only ever
  means "close the gap up to 6 months back" — a materially smaller, differently-shaped
  problem than what got built for Spot, not a drop-in extension of it.
- **Why (2) — no read path exists to consume the result today**:
  `_sync_futures_positions` (`backend/app/modules/portfolio/services/
  portfolio.py`) derives everything a futures position displays — quantity,
  entry price, leverage, liquidation price, unrealized P&L — directly from
  Binance's live `positionRisk` snapshot on every sync. It never replays
  `broker_trade` transactions the way Spot's cost basis does
  (`_apply_trade_cost_basis`). Building futures backfill today would populate
  an audit-trail-only ledger with zero visible effect anywhere in the app —
  real engineering effort (pagination/chunking within the 7-day-per-call /
  6-month-total window, a second checkpoint table) for a feature nothing
  reads.
- **Revisit trigger**: worth reconsidering if/when a realized-P&L or
  trade-log view for futures positions is ever built. At that point a futures
  transaction ledger would have a real consumer, and the backfill
  decision should be re-evaluated then — not before, and not preemptively.
- **Reference**: `BINANCE_BACKFILL_SCOPE.md` has the full original scoping
  detail for both wallets — endpoint shapes, pagination/windowing approach,
  weight costs, the 6-month cutoff's exact enforcement date — so a future
  session picking this up doesn't need to re-research Binance's API
  constraints from scratch.
- **No code changes in this pass** — backlog entry only, per instruction.

======================================================================

## Part F — No ISIN→ticker resolution anywhere in the codebase (Groww + Zerodha, one shared gap)

Found while building Groww's Stocks Holdings Statement import
(`GROWW_BACKFILL_SCOPE.md` Open Question 1, since built). Recording as one
shared gap rather than two broker-specific ones — both brokers hit the same
missing capability, not two unrelated bugs.

- **The gap**: nothing in this codebase resolves an ISIN to the real
  exchange ticker (`.NS`/`.BO`-suffixed symbol) another import path or the
  live broker sync would use for the same security. ISIN is parsed in
  several places but never used as a canonicalization key.
- **Groww side — real, live risk, not hypothetical**: `parse_groww_stocks_holdings`
  (`backend/app/modules/portfolio/services/portfolio_importer.py`) has no
  ticker column to work with at all — Groww's Stocks Holdings Statement
  export only gives company name + ISIN, unlike Stock Order History (which
  has a real `Symbol` column). With no ISIN→ticker table to check against,
  the parser synthesises `{ISIN}_HOLDING` as the symbol (documented in the
  function's own docstring as a deliberate, flagged limitation, not an
  oversight). **Concretely**: a stock imported via Holdings Statement and
  also present via Stock Order History import or live Groww sync (which both
  resolve to the real `.NS`/`.BO` ticker) creates **two separate Position
  rows for the same real holding** — quantity and value both double-counted
  in any portfolio total, with no error, warning, or dedup of any kind today.
- **Zerodha side — same missing capability, currently harmless by luck, not
  by design**: the generic CSV/XLSX importer captures ISIN into
  `extras["_isin"]` (`portfolio_importer.py`, `_rows_from_records`) for
  Zerodha rows same as Groww's, but Zerodha's working import paths (contract
  note, Console Tradebook) all carry a real tradeable symbol column already,
  so ISIN is stored as inert row metadata and never actually needed for
  symbol resolution — the existing `.NS`/`.BO` forced-canonicalization
  (`PROVIDERS.md`'s documented Zerodha import behavior) happens to produce
  the right answer today without touching ISIN at all. This is the same
  underlying missing capability as Groww's, just not currently exploitable
  into a visible bug — a `PROVIDERS.md`-documented backlog item (#2, no
  ISIN→symbol resolution for Zerodha's Tax P&L/Holdings Statement shapes)
  already flags the adjacent case where Zerodha *would* need this and
  doesn't have it either.
- **Two possible directions, not decided here**:
  1. **Build real ISIN→ticker resolution.** The principled fix, benefits both
     brokers uniformly (Groww's holdings-statement symbols would resolve to
     the real ticker instead of a synthetic one; Zerodha's Tax P&L/Holdings
     Statement gap in `PROVIDERS.md` #2 would also close). Real scope, not a
     small patch — almost certainly needs a reference ISIN↔symbol mapping
     data source (no such registry exists anywhere in this codebase today),
     plus a decision on what to do when a lookup misses (fall back to
     synthetic symbol? reject the row?).
  2. **Cheaper interim mitigation, doesn't fix the symbol scheme.** At import
     time, if an ISIN being imported already exists (stored) under a
     *different* symbol already held in the same portfolio, surface a
     warning to the user instead of silently creating a second Position.
     Doesn't require solving ISIN→ticker resolution — just needs ISIN to
     start being persisted somewhere it currently isn't (neither `Transaction`
     nor `Asset` has an `isin` column today), and a same-ISIN-different-symbol
     check at import time.
- **Severity**: higher nuisance-risk than a typical "missing feature" backlog
  item. This isn't silent data loss (nothing is dropped) — it's silent
  **double-counting**: a plausible-looking but wrong portfolio value, which
  is arguably worse than an omission because there's no visible signal
  (empty state, error, warning) that anything is off. A user who imports
  both a Holdings Statement and later connects live Groww sync (or imports
  Stock Order History) for the same account would see inflated holdings with
  no indication why.
- **File references**: `backend/app/modules/portfolio/services/
  portfolio_importer.py` (`parse_groww_stocks_holdings` and its `{ISIN}_HOLDING`
  synthetic symbol scheme, added this session); `PROVIDERS.md` Known Backlog
  item #2 (Zerodha's ISIN-captured-but-unused finding, pre-existing).
- **No code changes in this pass** — backlog entry only, per instruction.
