# Intelligence Module Audit

Date: 2026-07-17
Scope: end-to-end audit of the "Intelligence" module — backend and
frontend, live verification against a locally-started API instance
(`uvicorn` on :8001, real Postgres/Redis, current repo state on
`feature` branch). Last of the four originally-flagged never-audited
modules; per the handoff, touched by early Phase 2 work but never given
a standalone audit.

**Headline: the backend is real, computes off genuine data almost
everywhere, and is already null-safe in the places the market/news
audits taught this codebase to care about (recommendation performance
correctly returns `performance_available: false` instead of fabricating
a return off a missing price). But two live, currently-active
fabrication bugs feed real user-facing surfaces — one into the
dashboard's Portfolio Health card, one into every AI-generated briefing
and Q&A answer — and 8 of the module's 13 endpoints (including the
entire "goals" and "dashboard" surface) have zero frontend caller and
are reachable only by curling the API directly.**

---

## 1. What "Intelligence" actually is

`app/modules/ai/{api,services,repositories}/intelligence.py` —
`FinancialIntelligenceService` (1127 lines), `IntelligenceRepository`
(132 lines), a 13-endpoint router mounted at `/api/v1/intelligence/*`.
Confirmed **not** the same thing as the AI-briefing/recommendation-
scoring feature work already done this session-chain (fundamentals
scoring, crypto gate relaxation) — those live in
`app/modules/ai/services/{ai,recommendation}.py` and the `evaluation`
module. Intelligence is a separate layer that *reads* recommendations,
positions, and scores computed elsewhere and turns them into portfolio-
level analytics (health score, diversification, concentration, cash
deployment, goal progress, recommendation quality/calibration).

**No dedicated "Intelligence" UI destination.** It's not a page or nav
entry — it's woven into dashboard cards:

| Endpoint | Frontend caller |
|---|---|
| `GET /intelligence/portfolio-health` | `PortfolioHealthCard.jsx` |
| `GET /intelligence/diversification` | `DiversificationCard.jsx` |
| `GET /intelligence/concentration` | `ConcentrationCard.jsx` |
| `GET /intelligence/cash-opportunities` | `CashDeploymentCard.jsx` |
| `GET /intelligence/calibration` | `CalibrationStrip.jsx` |
| `GET /intelligence/recommendations` | **none** |
| `GET /intelligence/recommendations/{id}` | **none** |
| `GET /intelligence/outcomes` | **none** |
| `GET /intelligence/goals` | **none** |
| `GET /intelligence/dashboard` | **none** |
| `GET /intelligence/portfolio-health/trend` | **none** |
| `GET /intelligence/diversification/trend` | **none** |
| `GET /intelligence/recommendations/performance/trend` | **none** |
| `GET /intelligence/goals/trend` | **none** |

Confirmed by grepping `frontend/src` and `backend/tests` for every path
literal — zero hits outside `apiService.js`'s own 5 wired calls. The
`/intelligence/recommendations` name-collides with a *separate,
actually-used* router (`recommendation.py`, mounted at
`/api/v1/recommendation/recommendations`) — the frontend's
`listRecommendations()` calls that one, not this one. Two independent
recommendation-listing implementations exist; only one is live.

## 2. Overlap check against prior session-chain work

- **Evaluation module / AssetScore** (`quality_score`, `valuation_score`)
  — real, narrow overlap: `get_recommendation_explainability_v2` reads
  `AssetScore.recommendation_score/valuation_score/quality_score`
  directly off the repo, formats "unavailable" when null. Correct,
  matches the null-handling discipline established elsewhere. This
  method itself has no router endpoint — confirmed unreachable (see §4).
- **AssetHealth** — zero overlap. Intelligence never imports or queries
  it.
- **Watchlist alert evaluation** — zero overlap, different domain
  entirely.
- **Recommendation materialization (Fix Q)** — indirect but important
  overlap: every `FinancialIntelligenceService` method that reads
  recommendations (`get_recommendation_quality_metrics`,
  `get_confidence_calibration`, `get_investor_health_score`, etc.) reads
  the same `Recommendation` table Fix Q fixed. Live-checked: table is
  currently **empty** (0 rows) — the intentional post-Fix-Q state, not a
  bug. This directly triggers the §3 finding below.
- **New, not-previously-flagged overlap found this audit: the AI
  briefing/Q&A feature.** `PortfolioContextBuilder.build_intelligence_context`
  (`app/modules/ai/services/ai.py:163`) calls **10** of
  `FinancialIntelligenceService`'s methods (health, diversification,
  concentration, cash, risk, quality, performance, scorecard,
  calibration, rule performance, goals) and stitches the results
  straight into the prompt sent to Gemini/Groq for both the scheduled
  briefing (`build_global_context`) and ad-hoc Q&A
  (`build_qa_context`). This was not on the prior audit's overlap list
  and matters a lot: **any fabrication in Intelligence doesn't just
  mis-render a dashboard card, it becomes an input the LLM treats as
  ground truth about the user's real finances.**
- **`User.monthly_saving` / goal-progress feature** (found during this
  audit, not previously known) — see §3, second finding. A real,
  user-editable goal-tracking feature (`GoalProgress.jsx` +
  `UserProfile.jsx` + `app/core/entities/system.py`'s
  `User.monthly_saving`) already exists and is live-wired. Intelligence's
  `get_goal_progress_metrics`/`get_goal_progress_trend` are a second,
  unrelated, hardcoded implementation of "goal progress" that never
  reads the real per-user value.

## 3. No-fake-data findings (Tier 1 — live and currently active)

**Finding A — `recommendation_outcomes_score` defaults to a fabricated
75.0 when there are zero recommendations, not "unavailable."**

`get_investor_health_score` (`intelligence.py:721-722`):
```python
quality_metrics = self.get_recommendation_quality_metrics()
s_outcomes = quality_metrics["acceptance_rate"] * 100.0 if quality_metrics["total_recommendations"] > 0 else 75.0
```
Live-verified right now against the real (empty) `recommendation`
schema:
```
$ curl .../intelligence/portfolio-health?portfolio_id=<real-portfolio>
{"investor_health_score": 30.0, "diversification_score": 0.0,
 "allocation_discipline_score": 50.0,
 "recommendation_outcomes_score": 75.0,   <-- fabricated
 "activity_consistency_score": 0.0, "position_count": 0}
```
This is the exact "neutral default substituted for missing data"
pattern the market and news audits already fixed twice
(`news_healthy` defaulting to `True`, the old `100.0` price fallback).
Right now the frontend's `PortfolioHealthCard.transform()` happens to
mask this specific response because `position_count === 0` short-
circuits to the "unavailable" empty state — but the fabrication fires
independently of position count. The moment this portfolio has real
positions but hasn't yet applied/dismissed a single recommendation (a
completely normal early state, and literally what "0 recommendations,
some positions" will look like the day recommendations start
generating again), the card will render "Decision outcomes ✓ 75/100" as
a real, positive signal that doesn't exist. Same constant, same bug
shape, appears unconditionally (not even gated by a count check) in the
dead `get_portfolio_health_trend` — see §4.

**Finding B — the AI briefing/Q&A prompt is fed a hardcoded fake
financial goal that contradicts the user's real, already-configured
one.**

`get_goal_progress_metrics` (`intelligence.py:743-744`):
```python
target_corpus = 50000000.0
monthly_saving = 75000.0
```
These are not read from anywhere — no config table, no user field, just
literals. Live-verified:
```
$ curl .../intelligence/goals?portfolio_id=<real-portfolio>
{"wealth_goals": {"current_net_worth": 662409.92,
  "target_corpus": 50000000.0, "monthly_saving": 75000.0, ...}}

$ curl .../users/me
{"monthly_saving": 25000.0, "target_profit_pct": 12.0, ...}
```
The user's **real, actively-maintained** monthly-saving target (25,000,
editable in Settings, rendered live on the dashboard by
`GoalProgress.jsx`) is 3x smaller than what this code silently
substitutes. `build_intelligence_context` puts the fabricated number
directly into the LLM prompt:
```python
lines.append(f"  - Wealth Goal: Current Net Worth {...}, Target {goals.get('wealth_goals', {}).get('target_corpus')}. ...")
```
So every AI-generated briefing or Q&A answer that discusses goal
progress is reasoning from a number the user never set and doesn't
match what's shown elsewhere in the same app. This endpoint has no
frontend caller (§1), so the fabrication is invisible in the dashboard
— but it's live in every LLM call today, silently, indistinguishable
from a real answer. This is the most severe finding in this audit:
unlike A, there's no accidental frontend guard masking it.

Both A and B are mechanical to fix in the "stop fabricating, surface
absence honestly" sense (A: exclude the outcomes component from the
composite or mark it null when there are zero recommendations, matching
the Fix-S precedent; B: read `monthly_saving` off the real `User` row
that's already loaded via `current_user`). What target_corpus *should*
be — there's no real field for it anywhere in the schema — is a Tier 2
product question (see §6), not something to invent an answer for here.

## 4. Dead/stale code check

**Confirmed dead, unreachable from any frontend, backend caller, or
test** (checked by grepping every literal path/method name across
`frontend/src`, `backend/app`, `backend/tests`):

- `/intelligence/recommendations`, `/intelligence/recommendations/{id}`,
  `/intelligence/outcomes`, `/intelligence/goals`, `/intelligence/dashboard`,
  and all four `/*/trend` endpoints — 8 of 13 router endpoints, curl-only.
- `get_daily_briefing`, `get_weekly_briefing`, `get_monthly_briefing` —
  no router exposes them, nothing calls them. This isn't neutral dead
  code: it's the worst fabrication in the file, dormant.
  `get_daily_briefing` hardcodes `daily_return = 120.0`,
  `f"{p.symbol}: +1.2% daily change"` for literally any two positions,
  and `notable_news` as two **always-identical, static strings**
  regardless of any real market state ("Markets trade higher on
  positive global cues.", "Federal Reserve hints at interest rate cuts
  in upcoming cycle."). `get_weekly_briefing` hardcodes
  `weekly_return = net_worth * 0.024`, `"+5.2%"` / `"-1.8%"` fake
  per-position returns, and a hardcoded `weekly_return_percentage: 2.4`
  that doesn't even match the computed `weekly_return` above it. If
  anyone ever wires a router to these (the naming — "daily/weekly/
  monthly briefing" — strongly suggests they were meant to be exposed
  at some point), it ships fabricated data on day one. Recommend
  deleting rather than leaving as a trap — this is dead code whose
  entire content violates the no-fake-data policy, not dead code that's
  merely inert.
- `_get_portfolio_state_at_date`, the shared helper behind all three
  trend methods that touch price history, hardcodes
  `price = 100.0  # default` (`intelligence.py:826`) when no price
  history entry exists for an asset. This is the identical anti-pattern
  the market-module audit already found and fixed in
  `_get_asset_price_at_time` (which this same file also defines,
  correctly, at line 69 — returns `None` and documents why). Two
  sibling price-lookup functions in the same file, one fixed, one not —
  exactly the "check whether the other one is the live path" trap flagged
  in the handoff's working discipline. In this case the unfixed one
  (`_get_portfolio_state_at_date`) is confirmed dead (only reachable via
  the four unwired trend endpoints), so there's no live user impact
  today, but it's a second, independent latent copy of a bug already
  paid for once.

**Confirmed live** (reachable, real computation, not fabricated):
`get_portfolio_concentration_analysis`, `get_portfolio_diversification_score`,
`get_cash_deployment_opportunities`, `get_confidence_calibration`
(reachable via the wired `/calibration` endpoint, correctly returns all
zeros rather than fake numbers when recommendations are empty — verified
live), `get_recommendation_performance` (correctly returns
`performance_available: false` / `unavailable_reason` instead of a
fabricated return, per the comment explicitly citing this policy),
`_get_asset_price_at_time` (correctly `None`-safe, three-tier real
fallback: price history → snapshot → latest quote).

**`ai.ai_generations` / `ai.ai_feedback`** (per the audit brief, found
during the auth/identity pass): not part of Intelligence's own
tables/imports at all — they belong to `app/modules/ai/services/ai.py`.
Confirmed: `AIGeneration` is written on every AI call
(`ai.py:618`) but never queried back anywhere. `AIFeedback` is defined
in `entities/ai.py` and never referenced anywhere else in the codebase
— not written, not read. Same write-only/fully-unused pattern already
documented for `task_runs`/`audit_logs` in the Monitoring audit; noting
it here per the brief's explicit ask, but it's an AI-domain finding, not
an Intelligence-module one.

## 5. Other correctness issue found (not fabrication, a crash risk)

`PortfolioContextBuilder.build_intelligence_context`
(`ai.py:249`):
```python
for p in performance[:5]:
    lines.append(f"  - Rec {p.get('recommendation_id')} ({p.get('symbol')}): 30d Excess Return {p.get('excess_return_30d')*100:.1f}%, 90d {p.get('excess_return_90d')*100:.1f}%")
```
`get_recommendation_performance` can legitimately produce entries where
`excess_return_30d` is absent from the dict entirely
(`performance_available: False`, insufficient price history — the
correct, non-fabricating behavior per §4) or explicitly `None` (target
date price unavailable). Either case makes `p.get('excess_return_30d')`
return `None`, and `None * 100` raises `TypeError`, which would take
down `build_global_context`/`build_qa_context` — i.e. the entire AI
briefing/Q&A feature — the first time a recommendation without full
price coverage exists. **Not live-triggered**: the `recommendation`
table is currently empty and no AI provider key is configured in this
environment (confirmed at server startup: `gemini`/`groq` both
`missing_key`), so this environment can't currently reach this line
with real data. Flagged from direct code reading — confirmed real by
tracing both call sites in `get_recommendation_performance` that leave
these keys `None`/absent. Mechanical fix (guard with `is not None` or
default to `"N/A"` like the rest of the file already does everywhere
else), no design question.

## 6. Tiered summary

**Tier 1 — mechanical, fix on sight:**
1. `recommendation_outcomes_score` fabricated `75.0` default in
   `get_investor_health_score` (§3A) — mirror the Fix-S precedent
   (exclude/null the component, don't invent a neutral score).
2. Hardcoded `monthly_saving = 75000.0` in `get_goal_progress_metrics`/
   `get_goal_progress_trend` ignoring the real, already-live
   `User.monthly_saving` field — wire to the real value (§3B).
3. `None * 100` crash risk in `build_intelligence_context`'s
   performance-formatting loop (§5).
4. Delete `get_daily_briefing`/`get_weekly_briefing`/`get_monthly_briefing`
   — unreachable, and every number they'd return is fabricated (§4).
5. Fix or delete `_get_portfolio_state_at_date`'s `price = 100.0`
   fallback (§4) — same call as #4: it's dead, but it's a live copy of
   an already-fixed bug sitting in the file.

**Tier 2 — needs one explicit product decision, don't build
speculatively:**
- What `target_corpus` should be. There's no real field for it anywhere
  in the schema (unlike `monthly_saving`, which already has one).
  Options: add a real user-settable field (schema work), derive it from
  something else, or stop injecting the wealth-goal section into the AI
  context until a real value exists. This blocks a full fix of §3B —
  wiring `monthly_saving` is mechanical, but `target_corpus` needs a
  decision first.
- Whether the 8 unwired endpoints (`/goals`, `/dashboard`, `/outcomes`,
  the 4 `/trend` routes, `/recommendations*`) are intentional
  API-ahead-of-UI surface (keep, maybe eventually build the UI) or
  should be removed like the dead-code precedents elsewhere in this
  audit chain. Not touching without a decision — they're inert, not
  fabricating anything live (their fabrication risk only matters if/when
  wired up, see Tier 1 #4 for the ones that already fabricate even
  though dead).

**Tier 3 — deferred / minor:**
- Sector defaults to the string `"General"` when `Asset.metadata_payload`
  has no sector key (4+ call sites) — a categorical placeholder, not a
  fabricated numeric result; low severity but affects sector-
  concentration/diversification scoring for any asset without sector
  metadata (crypto, mostly). Worth knowing, not urgent.
- `ai.ai_feedback` fully unused (never read or written) and
  `ai.ai_generations` write-only — AI-domain, not Intelligence-module,
  noted per the audit brief's explicit ask (§4).

## 7. What wasn't broken

Worth stating plainly since most of the file reads clean: allocation
targets, price resolution (`resolve_position_price`, `_get_asset_price_at_time`),
concentration/diversification/cash-opportunity math, and calibration all
compute off real data with correct null-handling, matching the
discipline established by the market/news audits. This is not a module
that needs a rewrite — it needs the two live fabrication bugs above
fixed, the dead fabricating methods deleted, and a decision on
`target_corpus`.

---

No code changed in this pass. Server started locally for live
verification (`uvicorn` on :8001) was stopped afterward.
