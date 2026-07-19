# Partial/Missing-Feature Sweep — Consolidated Inventory

Date: 2026-07-17
Method: mined every `*_AUDIT.md`/`*_SCOPE.md` doc in the repo root (20 files) for findings
matching one specific shape — **a schema field, table, UI element, or backend function is
real, but the reader/writer/trigger/UI-surface/consumer that would make it functionally
complete never got built or wired** — then live-verified each surviving candidate against
current code (not the doc's original finding, which may predate later fixes), and grepped
fresh for the same pattern beyond what the docs already caught.

Excluded per scope: simple bugs (wrong value, crash risk), fully-dead code with no live
purpose on either side, and anything already resolved this session-chain (confirmed via
`git log`/current-code grep, not assumed from the doc's original date). A large fraction of
candidates named in the docs — most of Watchlist's audit, all of Sentiment/Crypto-rendering,
the UI-bugs dead-stub widgets, EPF estimate, fundamentals scoring, crypto recommendation gate
— turned out to already be built and were dropped after verification; they are not listed
below. What remains are the ones still genuinely open as of today.

This is an inventory, not a triage — no tiering, no fix recommendation.

---

### 1. `system.task_runs` — write-only, no read path anywhere
**Real half:** `TaskRun` entity + `TaskRunRepository` (`app/core/repositories/task_run.py`),
written by three Celery signal handlers in `celery_app.py` (`create_started`/`mark_terminal`)
for every one of the ~24 tasks in the app. Live, populated, correct.
**Missing half:** the repository has exactly those two write methods — no `list`/`get`/filter
method exists, and grep confirms zero other call sites read `TaskRun` back anywhere (no
endpoint, no service, no UI). Confirmed unchanged today.
**Cited by:** `MONITORING_MODULE_AUDIT.md`, `WORKERS_OBSERVABILITY_SCOPE.md`,
`BACKLOG_SWEEP_SCOPE.md` Part A.
**Assessment:** genuinely incomplete, not decided-against — `WORKERS_OBSERVABILITY_SCOPE.md`
explicitly recommends a thin read endpoint as the natural next step once the table shipped;
that recommendation is still open, not declined.

### 2. `system.audit_logs` — write-only, no read path anywhere
**Real half:** `AuditLog` entity, written by `log_audit_action` (`app/core/services/audit.py`)
from ~15 real call sites across portfolio/recommendation/ai/config services.
**Missing half:** no repository query method, no API route, no reader anywhere — confirmed by
grep (only the entity file and the write-only service reference `AuditLog`).
**Cited by:** `MONITORING_MODULE_AUDIT.md`, `BACKLOG_SWEEP_SCOPE.md` Part A.
**Assessment:** genuinely incomplete/stalled — flagged as an open question (build a read
endpoint or not), no decision made either way yet.

### 3. `ErrorFingerprinter.get_fingerprints()` — aggregate accessor with zero callers
**Real half:** `register_error` (the write side, in `app/core/observability/health.py`) is
live — every exception handler in `main.py` calls it and attaches a `fingerprint` field to
error responses.
**Missing half:** `get_fingerprints()`, the method that would return the deduped/counted
aggregate this whole class exists to produce, has exactly one hit in the entire codebase — its
own definition. Confirmed by fresh grep.
**Cited by:** `MONITORING_MODULE_AUDIT.md`, `BACKLOG_SWEEP_SCOPE.md` Part A.
**Assessment:** genuinely incomplete — the per-error write/tag half works; the aggregate
half was built but never given a caller.

### 4. `ai.ai_generations` — write-only, never queried back
**Real half:** `AIGeneration` row inserted on every single AI provider call
(`ai/services/ai.py:627`), capturing model/prompt/tokens/cost per generation.
**Missing half:** grepped every reference — the only other hit is the class import; no
endpoint, no history view, no cost-reporting query reads it back anywhere.
**Cited by:** `INTELLIGENCE_MODULE_AUDIT.md` §4.
**Assessment:** genuinely stalled — looks like it was meant to back a cost/usage view that
was never built.

### 5. `ai.ai_feedback` — fully unused, both sides
**Real half:** none currently — the table/entity exists (`entities/ai.py`) but is never
written to.
**Missing half:** never read either. Confirmed by fresh grep — zero references anywhere
outside the entity definition.
**Cited by:** `INTELLIGENCE_MODULE_AUDIT.md` §4/§6, `AUTH_IDENTITY_REMNANTS_AUDIT.md` §8 (the
`user_id` FK survey).
**Assessment:** this one is closer to "never started" than "half-built" — flagging per the
brief's explicit ask (it was named as a known candidate), but note it's the weakest match for
the sweep's shape since neither half exists; looks like scaffolding for a feedback-loop feature
that was never begun.

### 6. `evaluation.feature_snapshots` — write-only, inserted every scoring cycle
**Real half:** `FeatureSnapshotsRepository.insert()` is called from
`generate_and_score_asset` on every `generate_scores` run for every asset.
**Missing half:** the repository has exactly one method (`insert`); grepped the full backend —
no other call site reads a `FeatureSnapshot` back. `EVALUATION_MODULE_AUDIT.md` explicitly
flagged this as needing a retention decision (audit trail with a reader vs. dead weight) —
still undecided.
**Cited by:** `EVALUATION_MODULE_AUDIT.md` §3.2.
**Assessment:** genuinely stalled, decision explicitly deferred, not made.

### 7. `JobConfig.enabled` / `.cron_expression` — UI presents live scheduling control that doesn't control anything
**Real half:** both fields are written via `PUT /config/jobs/{name}` and rendered back
(`cron_expression` shown as `cron_schedule` in `JobConfig.jsx`; `enabled` drives a real toggle
button that calls the same endpoint).
**Missing half:** Celery's actual schedule is a hardcoded dict in `celery_app.py`, completely
independent of this table — confirmed by grep: `app/workers/` has zero references to
`JobConfig`. Flipping "enabled" off does not stop an already-beat-scheduled job; editing
`cron_expression` governs nothing. A user looking at Settings reasonably concludes otherwise.
**Cited by:** `WORKERS_MODULE_AUDIT.md` §2.1, `CORE_CONFIG_MODULE_AUDIT.md` §3 (the fuller
field-by-field trace).
**Assessment:** genuinely incomplete — `CORE_CONFIG_MODULE_AUDIT.md` frames this explicitly as
"needs a decision" (wire JobConfig up as the real scheduler source, or strip the now-inert UI
controls); neither direction has been taken.

### 8. 8 of 13 Intelligence endpoints — real computation, zero frontend caller
**Real half:** `/intelligence/{recommendations, recommendations/{id}, outcomes, goals,
dashboard}` plus all four `/*/trend` routes are live, mounted, and return real computed data
(confirmed via the Intelligence audit's live curls).
**Missing half:** grepped `frontend/src` and `backend/tests` for every path literal — zero
callers outside `apiService.js`'s other 5 wired calls. `/intelligence/recommendations` even
name-collides with a separate, actually-used router — two independent implementations of
"list recommendations" exist, only one is live.
**Cited by:** `INTELLIGENCE_MODULE_AUDIT.md` §1, §4, §6 Tier 2.
**Assessment:** explicitly an open decision, not resolved — the audit frames it as "API-ahead-
of-UI surface (keep, maybe build UI later) vs. remove," and no call has been made either way.
One concrete, connectable instance: `GET /intelligence/outcomes` is real and unwired, while the
frontend's own **Decisions → Outcomes tab** (`OutcomesTab.jsx`) never fetches anything at all —
its `tabState` is a static `useState` initialized to `'ready'` with no setter ever called
(per `UI_BUGS_AUDIT.md` 1.1, still true today). Two halves of the same feature exist, on
opposite sides, unconnected.

### 9. `AssetScore.quality_score` / `.valuation_score` — now real, zero frontend surface
**Real half:** since `FUNDAMENTALS_SCORING_SCOPE.md` shipped, these are genuinely computed
(equities only) from real Yahoo fundamentals via `compute_quality_valuation_scores` and stored
per asset — no longer the old hardcoded `0.8`/`0.7` stubs.
**Missing half:** grepped the entire `frontend/src` tree — no component reads `quality_score`
or `valuation_score` in any form, confirmed fresh (not just at the time of the original
audit — re-checked after the fundamentals build landed).
**Cited by:** `FRONTEND_STATE_MODULE_AUDIT.md` §7 (flagged before the fundamentals build even
shipped, as a forward-looking "is this intentional" question).
**Assessment:** genuinely incomplete and now more clearly so than when first flagged — the
backend half didn't exist yet at the time of the original finding; it does now, and the
frontend gap is unchanged. No decision recorded either way.

### 10. `ProviderFactory.get_fallback_chain()` — retry-across-providers logic never built to use it
**Real half:** the method resolves a priority-ordered list of *available* market-data
providers, confirmed working as a pure selection helper (`factory.py:52`).
**Missing half:** it is never called anywhere in application code — confirmed by fresh grep
(only other hit is descriptive text in `PROVIDERS.md`). Every real ingestion call site
hardcodes one provider and never advances to a fallback on failure; the "fallback chain"
CLAUDE.md/PROVIDERS.md describe does not exist at runtime.
**Cited by:** `MARKET_MODULE_AUDIT.md` §1, finding #4.
**Assessment:** stalled, not decided against — reads as a partially-built retry feature (the
selection half exists) whose actual retry-on-failure half was never written.

### 11. Redis quote cache — write-only, with a latent key-mismatch bug for whoever builds the reader
**Real half:** `cache_quote(quote.symbol, ...)` is called on every successful ingest
(`workers/ingestion/tasks.py:31`).
**Missing half:** `get_cached_quote(asset_id)` has zero callers anywhere — confirmed by fresh
grep. Worth noting for whoever eventually wires a reader: the writer keys the cache by
*symbol*, but the reader function (and every sibling cache) expects an *asset_id* key — a
reader built to match the established convention would silently 100%-miss against this
writer's key shape.
**Cited by:** `MARKET_MODULE_AUDIT.md` §3, finding #9.
**Assessment:** genuinely stalled, not decided — no product reason found for leaving it
write-only; looks like an unfinished cache-aside implementation.

### 12. Watchlist `previousClose` — no real previous-close data source exists anywhere
**Real half:** `_fetch_asset_info` returns a `previousClose` field on every watchlist row, and
the frontend has working Day-Δ rendering logic ready to use it (`Watchlist.jsx`).
**Missing half:** the backend always sets `previousClose = currentPrice` — there is no
previous-close data source anywhere in the codebase (no separate quote timestamped
"yesterday," no daily-close snapshot read). Confirmed unchanged today. The frontend has an
equality-check guard (`price !== previousClose`) that suppresses the resulting fake 0.00% by
falling through to a dash — so nothing fabricated is currently visible — but the column can
never show a real day-change number for any watchlist row, and a genuine zero-day-change asset
is indistinguishable from this permanently-broken case.
**Cited by:** `WATCHLIST_MODULE_AUDIT.md` §3, §4.6.
**Assessment:** intentionally deferred, with the deferral explicitly named as such — the audit
frames a real fix as "the same class of work as other deferred gaps," not urgent since nothing
fabricated is currently rendered.

### 13. Portfolio performance history — frontend chart built, no backend endpoint exists at all
**Real half:** `PfPerformanceChart.jsx` is a real, self-contained chart component.
`apiService.fetchPortfolioHistory()` exists as a named client method other code calls.
**Missing half:** `fetchPortfolioHistory()`'s entire body is `return null` with the comment
"No backend history endpoint" — confirmed still true today; there is no
`/portfolio/.../history`-shaped route anywhere in the backend. Dashboard's "Portfolio
Progress" (90D Δ / vs. bench / drift) depends on the same missing data and is empty for the
same reason.
**Cited by:** `UI_BUGS_AUDIT.md` 1.1, 2.2b.
**Assessment:** honestly labeled today (the stub was relabeled "not built yet" rather than a
masquerading empty state, per `UI_BUGS_AUDIT.md`'s housekeeping note) — a real, acknowledged
gap, not a decision either way on whether to build it.

### 14. Recommendation dismiss reason — real field, no UI to set a real value
**Real half:** `RecommendationOutcome.dismiss_reason` is a real column; the backend correctly
stores and returns whatever string is passed to `dismiss_recommendation(reason=...)`, and the
frontend now reads `outcome.dismiss_reason` correctly (the mapping bug that used to drop this
was fixed).
**Missing half:** every frontend call site invokes `dismiss(rec.id)` with no second argument —
confirmed by grep, all four call sites across `RecommendationsFeed.jsx`/`Decisions.jsx` omit
the reason. There is no UI (input box, dropdown, modal) that lets a user type or pick a real
dismiss reason; every dismissal is silently the hardcoded default (`'User dismissed'` on the
frontend side, and the backend receives `None`/its own default too).
**Cited by:** `FRONTEND_STATE_MODULE_AUDIT.md` finding #1 (dormant half), `UI_BUGS_AUDIT.md`
§0 housekeeping.
**Assessment:** genuinely stalled — the storage/display plumbing is real and correct now; the
input surface was simply never built.

### 15. Applied-recommendation → Transaction correlation — no structured link, only free text
**Real half:** `apply_recommendation` creates a real `Transaction` row and embeds the
recommendation's id in its free-text `notes` field
(`f"Applied recommendation {rec.id} (...)"`).
**Missing half:** `Transaction` has no `recommendation_id` column — confirmed by reading the
entity. The frontend's only way to identify "this transaction came from applying a
recommendation" is a fragile `kind` guess that the prior audit found broken (since partially
fixed — the outcome-field mapping bug is resolved) and that still has no real correlation key
to fall back on if the guess ever fails.
**Cited by:** `FRONTEND_STATE_MODULE_AUDIT.md` finding #2 (deferred fix half).
**Assessment:** genuinely incomplete, explicitly named as a real backend-contract change that
was deferred, not built.

---

## Newly found in Phase 3 (not previously documented in any audit)

### 16. Monitoring's `/monitoring/*` surface (7 endpoints) — real, correct, entirely uncurled by any UI
**Real half:** all 7 endpoints (`assets/{id}/health`, `providers`, `failed-ingestions`,
`dependencies`, `health/aggregate`, plus the renamed backup/restore-verify pair) are live and
return correct, non-fabricated data — confirmed still true, including `FailedIngestion` rows
(which *do* have a real backend reader via this surface, correcting an internal
inconsistency in `WORKERS_OBSERVABILITY_SCOPE.md`, which described `FailedIngestion` as having
"no API endpoint anywhere" — it does, it's just curl-only).
**Missing half:** confirmed by fresh grep — no route, nav entry, page, or component anywhere
in `frontend/src` calls any `/monitoring/*` or `/health*` path. The entire module is reachable
only by curling it directly; Docker's own healthcheck is the one real, non-human consumer.
**Cited by:** `MONITORING_MODULE_AUDIT.md` §1, §4 Tier 2 item 4 (partially — the doc names the
UI question but doesn't connect it to the `FailedIngestion`-has-a-reader correction above).
**Assessment:** explicitly an open decision in the source doc ("ops surface, curl it yourself"
vs. "should have a dashboard") — not resolved either way.
