# Frontend State Management Module Audit

Scope: `frontend/src/components/aureon/store.jsx` and its full dependency graph —
`contexts/PortfolioContext.jsx`, `contexts/V4Context.jsx`, `hooks/useAureonData.js`,
`api/apiService.js`, and the components that consume them (`Dashboard.jsx`,
`AssetDetail.jsx`, `flow.jsx`, `decisions/*`).

**Premise correction:** the task brief stated recommendation materialization is
"currently dark (no recommendations generating at all)." That is not what's running
right now — the live backend (port 8002) has 8 active, 1 dismissed recommendations
today, and `POST /recommendations/generate` is producing data. I tested against this
live, populated state rather than an empty one; where a finding depends on the
empty-list case, it's marked as a code-path analysis, not an observed-today reality.

Method: read the actual backend response shapes from source
(`backend/app/modules/ai/services/recommendation.py`, `market/services/assets.py`),
drove the live backend directly with `curl` (apply/dismiss/undo, inspecting the
real JSON), and — after an initial pass that only did that plus static code tracing —
drove the actual running frontend (`localhost:3000`, proxying to the real backend,
confirmed via `curl localhost:3000/api/v1/...`) with a headless Chrome + Playwright
session: seeded `localStorage.active_portfolio_id`, loaded `/decisions`, clicked
**Apply** on a live recommendation, and read back both screenshots and DOM text
before/after the query-invalidation refetch. Findings are marked:
- **live-verified (browser)** — actually observed rendering, screenshotted or read
  from the DOM, in the running app against the running backend.
- **live-verified (API)** — confirmed the real backend JSON shape via `curl`, and
  the code reads the wrong field, but I did not additionally screenshot the result.
- **static** — traced the code/data-contract without a runtime repro (either the
  condition doesn't currently occur in this dataset, or reaching it isn't
  practical from the CLI).

All test mutations (one apply, one dismiss, both immediately undone) were reverted
via the same API before finishing; the portfolio's transaction count was confirmed
back at its original 130 afterward.

---

## Tier 1 — Fabrication / silent-failure (fix)

### 0. Recommendation confidence renders 100x too small — screenshotted, live
**File:** `components/aureon/primitives.jsx:5-17`, feeding from `store.jsx:58`
**Live-verified (browser).** `ConfidenceIndicator` treats its `score` prop as a
0–100 number: `filled = Math.round(score / 10)` (segments lit out of 10) and
`{score}%` for the label. But `rec.confidence` is set in `apiRecToFE`
(`store.jsx:58`) straight from the backend's `confidence_score`, which is a 0–1
fraction (confirmed via the live API: `"confidence_score":0.658982276406357`).
Screenshotting `/decisions` against the real backend shows every single card's
confidence label rendering as the raw fraction with a `%` appended —
`0.658982276406357%`, `0.732505085886536%`, `0.888868798361948%` — instead of
`66%`, `73%`, `89%`. Because `filled = Math.round(score/10)` also operates on the
same un-scaled fraction, the 10-segment confidence bar is empty (0 segments lit)
for every recommendation regardless of actual confidence — the whole confidence
visualization is dead across the entire Decisions feed today, not a rare edge case.
This is the single highest-visibility bug found in this audit: it's on the primary
decisions screen, wrong on 100% of cards, and looks like a real (if absurdly
precise) number rather than an error.

Fix: multiply by 100 (and round) either in `apiRecToFE` or at the point `score` is
passed to `ConfidenceIndicator`, consistently with how `AssetDetail.jsx:408` and
`Terminal.jsx:433` already do it (`Math.round(confidence * 100)`).

### 1. `store.jsx` reads outcome fields from the wrong object — applied/dismissed state is structurally broken
**File:** `components/aureon/store.jsx:209-221`
**Live-verified (browser + API).** I applied a live recommendation (`BUY META`)
through the actual UI, then inspected the History tab before and after the
transactions-query refetch that `apply()` triggers. Immediately after applying,
the optimistic entry showed correctly (`✓ BUY META applied`, "settling", "~5d",
`CALIBRATION` strip read `SETTLING 1`). A few seconds later, once
`queryClient.invalidateQueries` landed and `store.jsx`'s effect replaced `activity`
with the transaction-derived version, the DOM showed: `APPLIED 0`, `DISMISSED 0`,
and the same entry now rendered with the **✕ (dismissed-style) icon**, no
"settling"/outcome badge at all (`OutcomeCell` returns `null` unless
`a.kind === 'applied'`), buried at the chronological bottom of the list instead of
under "today." The backend, confirmed via direct `curl`, actually has this exactly
right the whole time —

```json
{ "status": "applied",
  "outcome": { "action_taken_at": "...", "predicted_impact": 0.05, "realized_impact": 0.0, "dismiss_reason": null } }
```

— but every field the frontend needs lives under `outcome`, and the mapping reads
them off the rec itself:
```js
ts: r.applied_at ? ... : '',                    // r.applied_at doesn't exist → always ''
predicted: r.predicted_impact,                  // doesn't exist → always undefined
realized: r.realized_impact ?? null,            // doesn't exist → always null
pending: r.realized_impact == null,             // always true
...
reason: r.dismiss_reason || 'User dismissed',   // doesn't exist → always the hardcoded default
```
Consequence, confirmed against the live payload above:
- Every "applied" recommendation shows a blank timestamp and no predicted return, forever.
- `pending` is `true` unconditionally — even after the backend has already computed
  a `realized_impact` (0.0 in the live test), the calibration UI (`CalibrationStrip.jsx`
  "N settling" count, `DecisionHistoryTab.jsx`'s pending/realized branch) can **never**
  show a settled outcome. This is the frontend's own version of the fabrication
  pattern: not a fake number, but a value that's permanently stuck at a default that
  looks like real in-progress state instead of an actual (or an actual-but-null) one.
- Dismiss reasons are silently discarded. I dismissed a rec with
  `reason=Test reason XYZ`; the backend correctly stored and returned
  `outcome.dismiss_reason: "Test reason XYZ"`. The frontend would render
  `'User dismissed'` regardless — a fabricated-looking generic string standing in for
  a real value that exists but isn't being read. (Currently dormant only because no
  UI surface lets a user type a custom reason yet — `dismiss()` is always called
  with its default param. The mapping bug is real and will misrepresent data the
  moment that UI is added.)

Fix: read `r.outcome?.action_taken_at`, `r.outcome?.predicted_impact`,
`r.outcome?.realized_impact`, `r.outcome?.dismiss_reason` instead of the top-level
(nonexistent) fields.

### 2. Transaction → activity mapping's `kind` fallback is dead, so real transactions never match `'applied'`/`'dismissed'` checks — and overwrites the optimistic entry with a wrong, worse-looking state
**File:** `components/aureon/store.jsx:106-119` (mapping), `:222` (the overwrite)
**Live-verified (browser + API).** This is the mechanism behind the History-tab
behavior described in finding #1 above — same repro, same session.
`GET /portfolio/portfolios/{id}/transactions` returns rows with a real `kind`
field already populated by the backend — `"broker_trade"` for synced broker rows,
`"broker_snapshot"` for snapshot rows, and (confirmed via `curl` right after the
live apply) `"trade"` for the transaction created by applying a recommendation.
The frontend does:
```js
kind: t.kind || (t.transaction_type === 'BUY' ? 'applied' : 'dismissed'),
```
Since `t.kind` is always truthy from the backend (whatever its value), the
`'applied'/'dismissed'` fallback never fires for any real transaction, including
the one created by applying a recommendation. Every consumer that branches on
`a.kind === 'applied'` (`ActivityTab.jsx:111`, `CalibrationStrip.jsx:136`,
`DecisionHistoryTab.jsx`'s `HistoryKindDot`/`OutcomeCell`) never matches real
transaction-derived rows; they only ever match the synthetic entries `apply()`/
`dismiss()` push directly into local state — which is exactly what the
"immediately after applying" screenshot in #1 shows working correctly.

Those synthetic entries are short-lived, though. `apply()` invalidates the
`["portfolio", id, "transactions"]` query on success (`store.jsx:293`), which
refetches and re-runs the effect at `store.jsx:197-223`. That effect does
`if (Array.isArray(s.activity) && s.activity.length) setActivity(s.activity)` —
an unconditional replace, not a merge — wiping out the optimistic entry entirely
(its `pending: true` / real-if-mapped-correctly predicted value) and replacing it
with the transaction-mapped version, which **hardcodes** `predicted: null,
realized: null, pending: false, settleDays: 0` (`store.jsx:115-118`) and a `kind`
(`"trade"`) that `HistoryKindDot` doesn't recognize, so it falls through to
`KIND_MAP.dismissed` (`DecisionHistoryTab.jsx:14`) and renders the **✕
dismissed-style icon** for what is actually an applied, still-settling BUY. This
is the exact DOM state I observed: `APPLIED 0`, entry showing ✕, no outcome badge,
sorted into the chronological middle of history instead of "today." A decision
that's still actively settling is rendered indistinguishable from one the user
declined.

Fix: this needs a real correlation — either have the backend return a
`recommendation_id`/a `kind` value the frontend actually checks for
(`"recommendation_apply"` or similar) on the transaction resource, or stop
overwriting the recommendation-derived applied/dismissed state with the
transaction-derived one and keep them as separate lists that get unioned for
display.

### 3. `store.jsx` never clears recs/activity state when the backend goes from populated → empty
**File:** `components/aureon/store.jsx:206`
**Static** (current backend has live recs, so this doesn't reproduce today, but the
bug is unconditional on the code path). The effect:
```js
if (all.length === 0) return;
setAllRecs(all); setActive(...); setApplied(...); setDismissed(...);
```
returns before touching any state when the freshly-fetched `recsData` maps to zero
recommendations. If a later fetch (via the 15s `staleTime`/invalidation) returns an
empty list — e.g. every recommendation gets applied/dismissed elsewhere, or
recommendation materialization stops producing new ones — `allRecs`/`active`/
`applied`/`dismissed` are left holding the previous non-empty snapshot. `Dashboard.jsx`
reads `allRecs`/`active` straight from this context (`Dashboard.jsx:25,50,102`), so
it would keep showing recommendations that no longer exist server-side. This is
exactly the "stale cache presented as fresh" pattern the audit is looking for.

Fix: don't early-return on empty; always sync state to what the query returned
(empty included).

### 4. `V4Context.jsx` renders a fabricated `0%` confidence for an in-flight AI job
**File:** `contexts/V4Context.jsx:70`, consumed at `pages/aureon/AssetDetail.jsx:408`
**Live-verified via code path** (no live LLM call needed — the placeholder is
synchronous). `_parseAIResponse` for the "Processing" placeholder sets
`confidence: 0`, not `null`:
```js
return { ..., tone: 'Processing', text: 'Analysis is queued...', confidence: 0 };
```
`AssetDetail.jsx:408` renders confidence whenever `r.confidence != null` — `0` passes
that guard, so while a run is queued the UI shows "Processing · 0%", indistinguishable
from a genuinely-computed near-zero confidence score. The sibling error path
(`_aiErrorFallback`, same file, line 81) already does this correctly with
`confidence: null`. The processing placeholder should match it.

Fix: `confidence: null` in the processing branch.

### 6. `PortfolioContext` swallows load failures — no way to distinguish "no portfolios" from "failed to load portfolios"
**File:** `contexts/PortfolioContext.jsx:45-49`
```js
} catch (err) {
    console.error('Failed to load portfolios:', err);
} finally { setLoading(false); }
```
On failure, `portfolios` stays `[]` and no error is exposed through the context value.
Every consumer of `usePortfolio()` (there's no `error` field in the context at all)
sees exactly the same shape whether the user genuinely has zero portfolios or the
`/portfolio/portfolios` call 500'd. Given this is the context that gates
`activePortfolioId` for the rest of the app (recs, transactions, positions all key
off it), a load failure here currently degrades silently into "empty portfolio" UI
rather than a visible error.

Fix: expose an `error` field on the context (mirror what `useAureonData.js` already
does correctly for its own queries) and let consumers show a real error state instead
of an empty one.

---

## Tier 2 — Signal/observability gaps needing a decision

### 7. `quality_score`/`valuation_score` (mentioned in the task as now-nullable backend fields) have zero frontend references
Grepped the entire `frontend/src` tree — no component reads `quality_score` or
`valuation_score` in any form. Either this is intentionally unbuilt frontend surface
(deferred, not a bug) or there's a screen that's supposed to show asset quality/valuation
and currently shows nothing at all instead. Needs a decision on which, not a fix — flagged
here rather than assumed.

### 8. `apiRecToFE` (`store.jsx:50-66`) is written against a richer recommendation shape than the backend actually returns
The live backend recommendation object only ever has: `id, asset_id, symbol,
recommendation_state, confidence_score, status, version, created_at, updated_at,
explanation{rules_matched, reasoning, confidence_factors}, outcome{...}`. `apiRecToFE`
also reads `r.strength`, `r.horizon`, `r.change`, `r.conflictsWith`/`conflicts_with`,
`r.signalIds`/`signal_ids` — none of which the backend has ever sent. These all
degrade harmlessly to `null`/`[]` today (no fabrication — genuinely absent renders as
absent), but it means a chunk of this mapping function is dead weight modeling a
contract that doesn't exist. Worth deciding whether these are near-term backend
additions (keep the mapping) or should be deleted (simplify).

### 9. Dead defensive fallbacks that would silently reactivate the fabrication pattern if a backend invariant ever changes
- `hooks/useAureonData.js:185` — `const rsi = raw.rsi_14 ?? 50;`
- `pages/aureon/AssetDetail.jsx:277` — `const conf = rsi != null ? ... : 50;`

Traced `backend/app/modules/market/services/assets.py:66-95` (`get_signal`): the
backend guarantees `rsi_14` and `signal_type` are set together, or both `null`
together — there is no code path today where `signal_type` is present but `rsi_14` is
null. Combined with the callers' own `signal_type == null` guards, both `?? 50`
fallbacks are currently unreachable — confirmed by reading the one function that
produces this data, not by assumption. They're not live bugs today, but they're
exactly the shape of bug this audit chain keeps finding (a silent numeric default
standing in for missing data) and they'll reactivate the moment the backend
decouples the two fields. Recommend removing the `?? 50`/`: 50` fallbacks now while
the reasoning is easy to verify, rather than leaving a landmine for later.

### 10. Transaction `detail` string hardcodes `$` regardless of actual currency
`store.jsx:114`: `` detail: `${t.transaction_type} ${t.quantity} ${t.symbol} @ $${t.price}` ``.
The app has a whole FX/currency layer (`V4Context.jsx` `effectiveRates`) used
elsewhere, but this ledger detail string always shows `$` even for NSE equities
(`.NS` symbols, broker `zerodha`) priced in INR. Cosmetic today since it's a plain
string embedded in an activity feed, but it's a real currency mislabel a user could
act on.

---

## Tier 3 — Cleanup

- `hooks/useAureonData.js:7` — `AUREON_STATE_KEY` exported and unused anywhere in the
  tree (grepped, zero other references). Dead export.
- The `?? 50` / `: 50` fallbacks from item 9 above, once a decision is made to remove
  them, are pure cleanup (no behavior change given current backend guarantees).
- `contexts/V4Context.jsx:154-163` — the job runner records every job as
  `status: 'ok'` even when the underlying API call rejected (the rejection is
  swallowed by `.catch(() => {})` before `.finally()` unconditionally writes `'ok'`).
  Initially flagged this as Tier 1 silent-failure; grepped every consumer of
  `jobHistory` and found exactly one (`shell/RunMenu.jsx:92`), which reads only
  `hist.last` (the timestamp) and never `hist.status`. So today this is dead,
  unread state, not a live misrepresentation — worth fixing if `status` is ever
  wired to a UI element (which is clearly the intent), but not urgent as-is.

---

## What's actually solid here (verified, not just assumed)
- `useAureonData.js`'s freshness-tile logic (`oldestMarketQuoteAt`, `fetchNewsLastRunAt`)
  is well-reasoned and already documents *why* it avoids the obvious-but-wrong
  approach (snapshot `updated_at`, `JobConfig.last_run_at`) — no notes needed.
- `AssetDetail.jsx`'s per-section `loading/error/empty/ok` state machine (`mkL/mkD/mkE`,
  `SectionCard`) is a clean, consistent pattern applied uniformly across Fundamentals,
  Technical, News sections — genuine loading vs. error vs. empty are visually distinct,
  not collapsed into one state.
- The `NewsSection` sentiment-dot fix already in the working tree (`score == null` →
  `'unassessed'` with a distinct visual treatment, not silently folded into `'neutral'`)
  is exactly the right pattern — it's just not applied yet to the RSI/confidence bar in
  the sibling `TechnicalSection` (tracked as dead code per item 9, since the null case
  can't currently occur there).
- `GoalProgress.jsx` renders explicit `null` → `—` for `ytdReturn`/`monthlySavingActual`
  rather than fabricating a number — correct pattern, no finding.
- React Query's shared cache means `store.jsx` and `useAureonData.js` querying the same
  `["recommendations"]` / `["portfolio", id, "transactions"]` keys is **not** state
  duplication/drift — same cache entry, single network call, no divergence risk.

---

## Deferred (not built, don't build — noted for scope only)
- Deciding the `quality_score`/`valuation_score` frontend surface (item 7).
- Adding a `recommendation_id` correlation on transactions so applied/dismissed
  activity rows can be identified without the fragile `kind` guess (item 2's proper fix
  is a backend contract change, not a frontend patch).
- A UI surface for custom dismiss reasons (item 1's dormant half) — no action needed
  until that UI exists, but the mapping fix (read `outcome.dismiss_reason`) should land
  regardless so it's correct on day one.
