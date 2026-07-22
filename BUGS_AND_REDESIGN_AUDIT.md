# Bugs & Redesign Requests — Audit (Settings / Transactions / Portfolio)

Date: 2026-07-21
Scope: audit-only. Part A verifies four user-reported bug claims against real
code and live data flow; no fixes applied. Part B catalogs redesign/
consolidation requests with current-state notes; no implementation.

**Working-tree note**: at the start of this pass, `git status` was not clean —
9 files had uncommitted changes (`config.py`, `portfolio.py` (api+service),
`portfolio_importer.py`, `apiService.js`, `PfImportCenter.jsx`,
`JobConfig.jsx`, `ProviderConfig.jsx`, `Settings.jsx`). Read the full diff
before drawing any conclusions: it is unrelated in-progress feature work —
a new "Danger Zone" data-reset feature, Binance Spot backfill wiring, NPS
statement multi-format (CSV/XLSX/PDF) parsing, and a portfolio-scoped-job
dispatch guard. None of it touches Recommendation Outcomes, Trend Analysis,
Import History, or AI Eval status. It was left untouched, per instructions.

======================================================================
## Part A — Bug claims: root cause, live-verified

======================================================================

### 1. Recommendation Outcomes showing assets not in the portfolio

**Root cause confirmed: NOT fabrication. A real, live, correctly-computed
query — but it is intentionally global/asset-universe-wide, not scoped to
the current portfolio's holdings, and the UI doesn't make that distinction
visible.**

Trace: `Portfolio.jsx` → `OutcomesTab.jsx` → `apiService.getRecommendationOutcomes(portfolioId)`
→ `GET /intelligence/outcomes?portfolio_id=...` (`ai/api/intelligence.py:71-92`)
→ `FinancialIntelligenceService.get_recommendation_quality_metrics()` /
`get_recommendation_performance()` (`ai/services/intelligence.py:92-130`).

The router code itself documents the design, verbatim:
```python
# Recommendations are scoped globally by asset_id (no portfolio_id column
# on Recommendation) — this param only keys the response cache, it does
# not filter the underlying query. Outcomes are the same across portfolios.
portfolio_id: uuid.UUID = Query(..., description="Cache key only — recommendations are global, not portfolio-scoped"),
```
`get_recommendation_performance()` iterates `self.repo.get_all_recommendations()`
— every `Recommendation` row in the system, regardless of which assets are
currently held — and computes real returns from real price history
(`_get_asset_price_at_time`), correctly returning `performance_available: false`
with `unavailable_reason` when price data is missing rather than fabricating
a number. No hardcoded/fake values found anywhere in this path.

**Why this looks like fabrication to the user**: the recommendation engine
recommends across the whole scored asset universe (including "consider
buying X" for assets never held), not just the user's current holdings —
that's the intended product behavior (recommendations aren't only about
managing existing positions). But the frontend surfaces this under the
**Portfolio** page as "Recommendation Outcomes" with no label distinguishing
"assets you hold" from "assets the engine has ever scored/recommended,"
so a user reasonably reads it as portfolio-scoped and sees it as wrong.

**Backlog cross-reference**: `INTELLIGENCE_MODULE_AUDIT.md` (2026-07-17)
already documented `/intelligence/outcomes` as having **zero frontend
caller** at that time — `OutcomesTab.jsx` is new/recently wired since that
audit, not yet reflected there. That same audit's Finding A (fabricated
`75.0` default for `recommendation_outcomes_score`) has since been fixed —
confirmed live: current code renormalizes weights over only the available
components (`intelligence.py:639-647`), no fabricated fallback remains.
This specific "shows assets not in portfolio" complaint is **new**, not a
previously-catalogued item — it's a scoping/labeling gap, not a data bug.

**Recommendation**: not a Tier-1 fix-on-sight fabrication case. If action is
wanted, options are (a) relabel the section to make clear it's universe-wide
recommendation performance, not portfolio-scoped, or (b) actually filter to
assets ever held by the active portfolio (a real product/scope decision, not
a bug fix — flagging, not deciding).

**Live verification performed** (direct Postgres + Redis query against the
running stack, not just static reading — per this codebase's own discipline
that static reasoning alone has repeatedly missed real fabrication bugs):
- `recommendation.recommendations`: 22 rows, all `status='active'`, all
  created `2026-07-20 20:36:56`–`20:37:06` (yesterday, a single batch run) —
  a real, fresh, non-empty table (not the emptied-post-cleanup state the
  handoff doc describes from an earlier incident).
- Symbols: `ICICIBANK.NS, WIPRO.NS, MSFT, SBIN.NS, ETH-USD, TSLA, HCLTECH.NS,
  AAPL, NVDA, HDFCBANK.NS, AAVE-USD, GOOGL, BNB-USD, SKY-USD, BTC-USD,
  INFY.NS, AMZN, META, MARUTI.NS, LINK-USD, TCS.NS, SOL-USD` — cross-checked
  against `portfolio.positions` for the (only) portfolio, "Default Portfolio"
  (`c1511450-...`): **8 of 22 are actually held** (AAVE-USD, BNB-USD,
  BTC-USD, ETH-USD, HDFCBANK.NS, LINK-USD, SKY-USD, SOL-USD); **14 of 22 are
  never held** — and those 14 are exactly the shape of a fixed market-scan
  universe (major US tech: MSFT/AAPL/NVDA/GOOGL/AMZN/META/TSLA; major NSE
  large-caps: ICICIBANK/WIPRO/SBIN/HCLTECH/HDFCBANK/INFY/MARUTI/TCS), not
  random or nonsensical symbols.
- Read the live Redis cache key `intelligence:outcomes:c1511450-...`
  directly (TTL 407s at read time — fresh, not stale): its `performance`
  array's returns (e.g. ETH-USD `+1.6%`/30d vs `+0.79%` benchmark, SBIN.NS
  `-1.47%`/30d, MSFT flat `0.0%`) are varied and plausible, not identical/
  hardcoded placeholder values — consistent with genuinely computed
  `_get_asset_price_at_time`-derived returns, not a fabricated constant.
- **Conclusion stands, now live-confirmed**: the served response is
  real, fresh, and correctly computed from real (not stale-cached,
  not fabricated) rows. The verdict is unchanged — intentional global
  scope + missing UI label, not fabrication — but this is now a
  live-verified fact, not an inference from code reading alone.

---

### 2. Portfolio Trend Analysis showing no data

**Root cause confirmed: genuinely unbuilt placeholder — literally
hardcoded, no data fetch of any kind. Different component and different gap
from PfPerformanceChart.**

`Portfolio.jsx:112-118` renders, for the "Trend Analysis" section:
```jsx
<NotBuiltState title="Trend Analysis" body="Trend analysis isn't built yet — there's no backend endpoint computing it, regardless of provider or snapshot data."/>
```
No API call, no state, no conditional logic — a static stub.

This is **not** the same gap `PARTIAL_FEATURES_SWEEP.md` #13 and
`Aureon handoff phase3.md` describe for `PfPerformanceChart` (that
component's `apiService.fetchPortfolioHistory()` used to be a hardcoded
`return null`). That gap has since been **closed**: `PfPerformanceChart.jsx`
now calls a real `GET /portfolio/portfolios/{id}/history` endpoint
(`portfolio/api/portfolio.py:453-462` → `PortfolioService.get_history`,
`portfolio/services/portfolio.py:626`), confirmed live and functioning —
it only falls back to its own empty state when the `snapshots` array is
genuinely empty.

**Cross-reference**: this is a distinct, still-unbuilt section that was
never wired to the now-working history endpoint or any other data source.
It is an honest "not built" label (matches the project's stated preference
for honest empty states over masquerading stubs, per `UI_BUGS_AUDIT.md`'s
housekeeping note on the same pattern), not a bug and not fabrication.

**Recommendation**: missing-feature gap, not a fix. If wanted, it would need
scoping — what "trend analysis" should actually compute (e.g., moving
averages / momentum over the same snapshot history `PfPerformanceChart` now
has access to) is a real design question, not answered here.

---

### 3. Import History page not showing import history data

**Root cause confirmed: no import-history log exists anywhere in the
codebase — a missing feature, not a broken/miswired endpoint.**

`PfImportCenter.jsx` (rendered at Settings → Import Data, and presumably
what "Import History page" refers to) holds all import state
(`csvState`, `casState`, `npsState`, `epfState`, results/errors) in local
`useState`, reset on remount/navigation. It calls one-shot import endpoints
(`portfolio_importer.py`) that parse and persist the resulting
holdings/transactions but write nothing to a queryable history/audit table.
Grepped the full backend for `ImportLog`/`ImportRecord`/`import_history` —
zero hits. There is no persisted record of "an import happened, on this
date, with this result" anywhere.

**Backlog cross-reference — this is an exact match for an already-catalogued,
already-ruled-out item**: `UI_BUGS_AUDIT.md` line 41 and line 117
explicitly examined Transactions' "Pending Imports / Import History" tabs
and concluded:
> "the code is explicit (`/* no backend endpoint yet */`) and there's no
> working sibling proving a real endpoint exists, so this is an honest,
> correctly-labeled backend gap, not a stub-masquerading-as-data-driven bug...
> Recommend building these two only if/when CSV-import review UX is
> actually prioritized."
> — listed under "Not bugs / ruled out" in that doc's summary table.

**Recommendation**: not a bug. Building a real import-history log (a table
recording each import operation's timestamp/source/row-count/outcome) is a
real, previously-scoped-and-deferred feature request, not a fix. Live
dry-run of an actual import wasn't re-performed in this pass since the
static/grep evidence (zero persistence code paths exist at all) is
already conclusive — there is nothing that could show up regardless of
what gets imported.

---

### 4. AI Eval status showing yellow/"not connected", refresh not working

**Root cause confirmed: two distinct, real signals feed "AI eval"-labeled
UI in this app; the most likely match (`PfFreshnessBar`'s "AI eval" pill)
has a genuinely misleading Refresh button — it re-reads cached state, it
does not trigger the thing it's displaying the freshness of.**

**Primary candidate** — `PfFreshnessBar.jsx:30` (rendered on the Portfolio
page), whose label is literally "AI eval":
```js
{ label: 'AI eval', ...deriveItem(freshness?.daily_briefing, THRESHOLDS.ai) }
```
`freshness.daily_briefing` traces to `useAureonData.js:288`:
`daily_briefing: aiBriefing?.created_at ?? null` — the real timestamp of
the most recent `AIBriefing` DB row (via `GET /analytics/ai/briefings?limit=30`).
If no briefing has been generated recently (or ever), this is legitimately
null/stale, and the dot renders `dusk-500` (yellow-ish) rather than
`sage-500` (green) — this is a correct, live signal, not a bug.

**The "refresh not working" part is real and confirmed**: `onRefresh` on
this component is wired to `Portfolio.jsx:45`:
```js
const handleRefresh = () => qc.invalidateQueries();
```
This only invalidates and re-fetches react-query caches — it re-reads
whatever is already in Postgres. **It never dispatches the `daily_briefing`
Celery job.** So if the reason the AI-eval pill is stale is that the
briefing job hasn't run (or the AI provider chain is failing), clicking
"Refresh" here can never fix it — it will always re-fetch the same stale
timestamp. The only way to actually regenerate a briefing is via Settings →
Jobs → running `daily_briefing` manually, a completely different action the
user may not know is required. **This is a real, confirmed UI bug**: a
refresh affordance next to a status pill that cannot affect that pill's
underlying data.

**Secondary candidate, ruled less likely but noted**: Settings → Providers →
`ConnectionStatusSection` shows "Connected"/"Keys missing" per provider
(including the Gemini/Groq AI provider), also with its own "Refresh" button.
Checked live: `keys_status` (`core/services/config.py:69`) is
`{k: bool(encrypted.get(k)) for k in key_names}` — **presence-only**, it
checks whether a key string is stored, not whether it's valid or the
provider actually responds. So this can never show "yellow" for an
invalid-but-present key (it would show green "Connected" even if the key
were rejected by Gemini) — this doesn't match "yellow" as reported, but is
worth knowing: this "Connected" status is not a real health check either,
for a different reason than the primary candidate.

**Live verification performed — dispatched the job for real and watched it
fail, per the task's explicit instruction to "trigger the refresh action
directly and trace what happens."** This surfaced a second, more severe bug
one layer beneath the Refresh-button issue:

- `ai.ai_briefings` had zero rows before this pass touched anything.
- `system.task_runs` showed `daily_briefing_task`/`weekly_briefing_task`/
  `monthly_briefing_task` all recorded `status = SUCCESS` (last run
  2026-07-17), no `error_message` — consistent with, but not yet proof of,
  a swallowed failure (an empty table is also consistent with rows having
  been created then later deleted, e.g. via the uncommitted Danger Zone
  reset feature also sitting in this working tree).
- **Checked the beat schedule first** (`celery_app.py:46-70`):
  `daily_briefing`/`weekly_briefing`/`monthly_briefing` are **not present at
  all** — only `seed-market-universe`, `seed-price-history`,
  `hourly-price-refresh`, `news-refresh`, `refresh-fundamentals`,
  `refresh-mutual-fund-navs` are scheduled. **These three briefing jobs
  never run automatically, on any cadence** — a separate, real, confirmed
  gap independent of the swallow-bug. (The 2026-07-17 `task_runs` rows were
  presumably a manual trigger, not a missed schedule.)
- **Then dispatched it live**: `POST /config/jobs/daily_briefing/run` against
  the running stack →`task_id` returned, polled `system.task_runs` until
  terminal: **`status = SUCCESS`, `ended_at` set, `ai_briefings` count still
  `0`.** The swallow fires today, not just as an inference from stale data.
- **Read the worker log for that exact run and got the real error**:
  ```
  [Gemini] gemini-2.5-flash - The read operation timed out (60194ms)
  [Gemini] gemini-2.0-flash - rate limited (429), circuit breaker tripped
  [Gemini] gemini-2.0-flash-lite - rate limited (429), circuit breaker tripped
  All models exhausted. Trace: {...}
  [aureon] Failed to generate global briefing: All models exhausted...
  [Celery] daily_briefing_task ... OK (63844ms)
  ```
  Confirms the exact mechanism in `app/workers/ingestion/tasks.py:456-459`:
  `AIService.generate_briefing()` raised (`ProviderError`, all Gemini models
  exhausted), the `try/except Exception: logger.error(...)` swallowed it,
  and the task still logged `OK`/`SUCCESS`. This is the same "swallows
  failure, always reports SUCCESS" pattern the handoff doc's Fix R already
  fixed for `fetch_news_task` in the news module — unfixed here, in the
  briefing tasks.
- **Incidental finding, not deeply investigated**: per CLAUDE.md the AI
  fallback chain is "Gemini (4 models) → Groq (2 models)," but the log
  shows only 3 Gemini models attempted before "all models exhausted" — no
  Groq attempt appears at all. Could mean Groq isn't configured
  (no `GROQ_API_KEY` set), or the fallback chain isn't reaching it for
  another reason. Not root-caused further here — flagging as worth a look
  if the swallow-bug fix is picked up, since fixing the exception-swallow
  without also fixing the fallback gap would just surface loud failures
  from a chain that's still only 3-deep instead of 6.

**Backlog cross-reference**: no existing audit doc catalogues either of
these two Part-4 issues (the misleading Refresh-doesn't-refresh gap, or
presence-only key validation) — both are **new findings** from this pass,
not previously known. The swallowed-exception bug in the briefing tasks is
also new — a sibling of the already-fixed news-module Fix R, not itself
previously found.

**Recommendation**: three separate, ready-to-fix-on-confirmation items,
none fixed in this pass:
1. **Tier 1, fix on sight**: make `daily_briefing_task`/`weekly_briefing_task`/
   `monthly_briefing_task` re-raise (or otherwise report failure to
   `_wrap_job_execution`) instead of swallowing the exception — the same
   fix already applied to `fetch_news_task` (Fix R). Right now `task_runs`
   actively records a false `SUCCESS` for a failed operation — live-
   reproduced in this pass — which is worse than the freshness pill just
   looking stale.
2. **Tier 2, product decision, not mechanical**: none of the three briefing
   jobs are on the Celery beat schedule at all — they only ever run on
   manual trigger. Worth a decision on whether that's intentional (AI
   briefings are opt-in/on-demand) or an oversight; not assumed either way
   here.
3. **Tier 2, mechanical**: the Refresh-button mismatch on `PfFreshnessBar`
   (and likely `MarketFreshnessSection`'s dashboard equivalent — not
   independently re-verified but shares the same `handleRefresh =
   invalidateQueries` pattern based on the freshness-badge code being
   structurally identical) — either have it dispatch `daily_briefing` (and
   the other underlying jobs the bar represents — prices/snapshot too) via
   `apiService.runJob(...)`, or relabel the button to make clear it only
   refetches, not regenerates.

======================================================================
## Part B — Redesign/consolidation requests: catalog only, no implementation

======================================================================

### Settings page

**Portfolio: "Management" / "Allocation"**
Neither is a real component. In `Settings.jsx`'s nav (`portfolio-mgmt`,
`alloc-targets`) both route to the generic `EmptySection` stub
("Not available" placeholder, `Settings.jsx:136`). There is no
`PortfolioMgmt.jsx` or `AllocationTargets.jsx` to merge or redesign —
**these are unimplemented placeholders**, not existing screens with
overlapping functionality. The user's request is ambiguous as flagged in
the task brief: "merge/redesign/fix" doesn't apply cleanly to something
that doesn't exist yet. **Needs clarification**: does the user want these
built for the first time, and if so, as what?

**Providers: three components, genuinely overlapping**
- `ApiKeysSection` (`Settings.jsx:148-214`) — read-only summary of
  providers with configured key names, set/unset dots, deep-links to
  `provider-list`.
- `ConnectionStatusSection` (`Settings.jsx:217-284`) — read-only table of
  enabled providers, keys-count + Connected/Keys-missing status, its own
  Refresh button (see Part A #4's note on this button's real semantics).
- `ProviderConfig.jsx` — the actual full CRUD surface: enable/disable,
  per-provider credential editor, EPF rate editor, broker sync/connect
  rows, Binance backfill row.

**These three are genuinely, not just superficially, similar**: the first
two are both read-only summaries of the same `getProviders()` data with
different column subsets, existing only to deep-link into the third, which
does all the real work. A merge (fold both summary panels into one, or
into `ProviderConfig` itself as a header strip) looks structurally sound —
but this is a UI consolidation decision, not scoped here.

**Providers: remove ones needing no API/config** — not independently
investigated in this pass (would require enumerating every registered
provider and checking which have zero configurable settings); flagging as
unresolved, needs a follow-up pass specifically enumerating providers if
this is pursued.

**Jobs: "Job Status" / "Manual Run" overlap — confirmed real**
`JobConfig.jsx` (Job Status) shows schedule, last-run, enable-toggle, run
button, logs. `ManualRunSection` (`Settings.jsx:304-367`) shows a simpler
run-only list with ephemeral "last triggered" state, no schedule/enable
toggle. Both call `apiService.getJobs()` / `runJob(name)`. **ManualRun is
essentially a stripped-down duplicate of JobConfig's run action** — the
data overlap the user describes is real, not imagined.

**Jobs: label coverage gap, incidental finding** — the frontend
`JOB_LABEL_MAP`/`JOB_LABELS` dictionaries don't cover all 15 backend jobs
(`sync_binance`, `sync_groww`, `sync_zerodha`, `refresh_fundamentals`,
`refresh_mutual_fund_navs`, `weekly_briefing`, `monthly_briefing` fall back
to raw snake_case). Not one of the requested items, but relevant if any
job-list redesign is scoped — worth folding in.

**Jobs: "merge Sync Groww / Sync Binance into one 'portfolio sync'
concept"** and **"merge other similar job pairs (Briefings, Market Data)"**
— these are three functionally distinct backend jobs each
(`sync_groww`, `sync_binance`, `sync_zerodha` are three separate Celery
tasks hitting three different broker providers; `daily_briefing` /
`weekly_briefing` / `monthly_briefing` are three separate AI generation
jobs at different cadences). A UI merge into one "portfolio sync" entry
that fans out to all three brokers, or one "Briefings" entry that shows
all three cadences, is plausible as a **display-layer consolidation** (the
underlying jobs stay separate) — but this needs an explicit decision on
whether "merge" means single trigger button (fires all three) or just a
grouped display (still three separate run actions, visually clustered).
Not decided here.

### Transactions page

**"Import CSV" / "New Transaction" button order** — confirmed:
`Transactions.jsx:784-793` renders "Import CSV" first (left), which
navigates to `/settings#import-data`; "New transaction" is second (right),
styled as the primary CTA, opens `TransactionDrawer`. Reordering is a
one-line JSX swap — mechanical once a decision on desired order is made
(not made here, per scope).

**Filter additions (manual vs. provider-sourced, filter by provider)** —
confirmed gap: `FilterBar` (`Transactions.jsx:124-147`) already has symbol
search, date range, and Class/Type selects — real, working filter UI. But
there is **no source/provider filter**: `SourceBadge`/`deriveSource` only
*labels* rows as Manual/CSV/CAS for display, it isn't wired into the
filter state at all. Adding this is additive to an existing pattern (one
more `<select>` + one more filter predicate), not a redesign — but still a
real feature addition, not scoped/estimated here.

### Portfolio page

**Scroll behavior** — confirmed: only `PfHoldingsTable.jsx:82`
(`maxHeight:560, overflowY:'auto'`) currently scrolls. `PfActivityFeed`
hard-truncates to 8 rows via `.slice(0,8)` instead of scrolling. Making
"all components scrollable" means auditing each of `PfSummaryHero`,
`PfPerformanceChart`, `PfAllocationSection`, `PfActivityFeed`,
`PortfolioHealthCard`/`DiversificationCard`/`AllocationDriftCard`,
`PfConcentrationSection` individually — some may not have unbounded content
(e.g. summary hero) and wouldn't need it. Not a single mechanical change;
needs per-component judgment.

**"Full Ledger" buttons — confirmed genuinely duplicate, not distinct
scopes.** One in `Portfolio.jsx:93` (section header), one inside
`PfActivityFeed.jsx:23` (`onViewAll`). **Both navigate to `/transactions`
with identical behavior** — no different filter/scope on either. This one
is a true duplicate; removing one (likely the section-header one, keeping
the in-component `onViewAll`) is a low-ambiguity, mechanical cleanup if
desired.

**Holdings: "Log Transactions" vs. "Manual Assets" — confirmed distinct,
not duplicative.** `Portfolio.jsx:78` "+ Log transaction" → `LogTradeModal`
(records a real trade). `PfHoldingsTable.jsx:70` "+ Manual asset" →
`ManualAssetModal` (adds/updates a non-provider-tracked holding, e.g. real
estate or an asset with no broker feed). These serve genuinely different
purposes despite superficially similar placement — **not a consolidation
candidate**, just two buttons that happen to sit near each other.

**"Take Snapshot" vs. "Log Trades" — confirmed distinct, and one is
mislabeled.** Both live in `PfSummaryHero.jsx:50-51`. "Log trade" →
`LogTradeModal` (same as Holdings' button — same modal reachable from two
places, itself a minor duplication worth noting). "Take snapshot" →
`onSnapshot` → the same `handleRefresh = () => qc.invalidateQueries()` seen
in Part A #4 — **it does not create a snapshot at all**, only refetches
cached queries. This button's label is actively misleading about what it
does, independent of any consolidation decision — flagging as its own
small, confirmed bug (mislabeled action, same root cause pattern as the
AI-eval Refresh button: `invalidateQueries` standing in for an action it
doesn't perform).

======================================================================
## Summary

**Part A — one confirmed real bug (with a second, deeper one found live
underneath it) and three confirmed non-bugs (by design or by known/honest
gap), all live- or first-hand-verified**:

| # | Claim | Verdict |
|---|---|---|
| 1 | Recommendation Outcomes shows non-portfolio assets | Live-verified real: intentional global scope + missing UI label — not fabrication |
| 2 | Trend Analysis shows no data | Genuinely unbuilt, honestly labeled stub — not a bug |
| 3 | Import History empty | No persistence layer exists at all — known, already ruled-out gap (`UI_BUGS_AUDIT.md`) |
| 4 | AI Eval yellow / refresh broken | **Three confirmed real issues, live-reproduced**: (a) `daily_briefing` isn't on the beat schedule — never runs automatically; (b) when manually dispatched, it fails (Gemini timeout + rate-limited on all 3 attempted models, no Groq fallback observed) yet `task_runs` still records `SUCCESS` — exception swallowed, not re-raised; (c) the Refresh button only invalidates the query cache, it never dispatches `daily_briefing` in the first place |

Item 4(c) (the Refresh-button mismatch) and the "Take Snapshot" button in
Part B share the exact same bug shape — `invalidateQueries()` masquerading
as an action-triggering button — worth fixing together if this is picked
up. Item 4(b) is unrelated in mechanism but explains *why* there's never
anything fresh to refresh in the first place — the two compound: even if
Refresh correctly dispatched `daily_briefing`, the swallowed exception means
it would keep reporting SUCCESS while still writing nothing, and the AI
provider itself needs its own attention (rate limits / missing Groq
fallback) before either fix would produce a real, fresh briefing.

**Part B** is a clean catalog per the task's instruction: two items are
confirmed genuine duplicates (Full Ledger ×2, ManualRun/JobConfig overlap),
two are confirmed *not* duplicates despite looking similar (Log
Transaction/Manual Asset, Log Trade/Take Snapshot), and one item (Portfolio
Management/Allocation) turned out to be a request to build something that
doesn't exist yet rather than a merge of existing things. None implemented,
per instructions.
