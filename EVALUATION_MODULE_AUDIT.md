# Evaluation Module Audit

Scope: the computation chain `process_asset_snapshot → generate_features →
generate_signals → generate_scores → compute_asset_health`
(`backend/app/workers/{snapshots,evaluation,monitoring}/*.py` plus the
services they call: `app/modules/market/services/snapshot.py`,
`app/modules/ai/services/evaluation.py`, `app/modules/ai/services/
recommendation.py`, `app/modules/market/services/asset_health.py`). Same lens
as the market/news/workers/core-config audits, narrowed to the scoring/signal
*logic itself*, not its already-audited upstream inputs. All paths relative
to `backend/` unless noted. Live-verified against the running stack
(`aureon_postgres`, `aureon_redis`, `aureon_worker`) on 2026-07-12.

**Headline finding**: the workers audit (§2.6) stated "no fabrication was
found anywhere in this chain — confirmed clean." That was true for the chain
*plumbing* (task orchestration, caching, chaining) but not for the scoring
math one layer down, inside `RecommendationService.generate_and_score_asset`.
Live DB data confirms fabricated neutral defaults are actively shipping in
`evaluation.asset_scores` right now (see 1.1).

---

## Tier 1 — fabrication / silent-failure (fix regardless of other scope)

### 1.1 `generate_and_score_asset` fabricates 0.5 for missing momentum/volatility/sentiment before scoring

`app/modules/ai/services/recommendation.py:405-407`:

```python
momentum = features_dict["momentum_score"] if features_dict["momentum_score"] is not None else 0.5
volatility = features_dict["volatility_score"] if features_dict["volatility_score"] is not None else 0.5
sentiment = features_dict["sentiment_score"] if features_dict["sentiment_score"] is not None else 0.5
```

`validate_features()` (`ai/services/evaluation.py:19-41`) is called just before this
(line 398) but only asserts `price is not None` (`_check_missing_values`,
line 19-20) — it does **not** check momentum/volatility/sentiment. So an
asset with three of five features genuinely unavailable sails through
"validation" and gets scored as if momentum/volatility/sentiment were each
exactly neutral (0.5), rather than skipping the scoring run or writing a
row that honestly says "under-determined."

This is the *same class* of bug the market audit fixed upstream for
sentiment/fundamentals defaults, reintroduced one layer downstream, in code
that runs on every `generate_scores` task execution for every asset with a
features row.

**Live confirmation** (`evaluation.asset_scores`, 2026-07-12 10:00 run):

```
 ETHUSDT-USDM  | quality=0.8 | valuation=0.7 | recommendation=0.5   (sentiment NULL)
 S-USD         | quality=0.8 | valuation=0.7 | recommendation=0.5   (sentiment NULL)
 UNI-USD       | quality=0.8 | valuation=0.7 | recommendation=0.5   (sentiment NULL)
 SUIUSDT-USDM  | quality=0.8 | valuation=0.7 | recommendation=0.5   (sentiment NULL)
```

`0.4*0.5 + 0.3*(1-0.5) + 0.3*0.5 = 0.5` exactly — the textbook signature of
an all-defaults run. Confirmed directly (not just inferred from the
arithmetic) by re-querying `market.asset_features` for these same four
symbols: `momentum_score`, `volatility_score`, and `sentiment_score` are
**all three `NULL`** for `ETHUSDT-USDM`/`S-USD`/`UNI-USD`/`SUIUSDT-USDM` —
this is genuinely an all-inputs-missing case, not a coincidental 0.5. This
is indistinguishable, to any downstream reader of `asset_scores`, from a
genuinely-computed neutral 0.5. It's exposed directly
via `GET /assets/{asset_id}/scores` (`ai/api/evaluation.py:12-20` →
`EvaluationService.get_asset_scores`), so this reaches API consumers as a
real score, not a "data unavailable" signal.

Note this is *not* currently reaching the `Recommendation` table — the
in-progress fix in `_score_and_materialize`
(`recommendation.py:74-89`, uncommitted) correctly skips materializing a
`Recommendation` when any of `momentum_score/volatility_score/sentiment_score/
quality_score/valuation_score` is `None`. But `quality_score` and
`valuation_score` are *never* `None` (see 1.2) — they're always a computed
float — so that guard cannot catch this case; the fabricated `asset_scores`
row is what's actually being read at line 476 (`scores = self.repo.
get_latest_score(asset_id)`), and it's already been laundered from `None` to
`0.7`/`0.8` by the time the guard runs.

**Fix direction**: `generate_and_score_asset` should skip persisting a score
(analogous to `_score_and_materialize`'s `None` skip) when a required input
feature is missing, or `AssetScore` needs a per-field "computed from N/5
inputs" honesty marker — a decision for the user, but the current silent
0.5-substitution is the exact fabrication pattern called out in scope.

### 1.2 `quality_score`/`valuation_score` are near-constant placeholders, not computed scores

`recommendation.py:420-421`:

```python
quality_score = 0.8 + (0.05 if sentiment > 0.6 else 0.0)
valuation_score = 0.7 + (0.1 if momentum < 0.4 else 0.0)  # lower momentum is undervalued
```

Live data confirms this: across 20 sampled assets, `quality_score` is `0.8`
for every single one, `valuation_score` is `0.7` or `0.8` for every single
one (§ query in 1.1). There is no fundamentals input at all —
`AssetSnapshot.market_cap` and `.pe_ratio` are hardcoded `None` at the point
of construction (`market/services/snapshot.py:33-34`), and `LatestQuote`
(`market/entities/market.py:11-19`) has no market-cap/PE columns to source
them from in the first place. So "quality" and "valuation" are labels on a
formula that's actually just "0.8, nudged by sentiment" and "0.7, nudged by
momentum" — neither has anything to do with quality or valuation as those
terms are normally understood in this domain, and a user reading these
scores has no way to know they're not real.

This differs from 1.1 in kind: 1.1 is "real formula, fake inputs
substituted for missing data." This is "the formula itself is a stub that
was never wired to real valuation/quality data," always producing a
near-constant regardless of data availability. Flagging as Tier 1 because
the effect on the end user is the same as fabrication — a specific,
plausible-looking number is presented as computed when it isn't — but the
right fix is a product decision (build real quality/valuation scoring, or
relabel/hide these fields until there's real data), not a one-line patch.
Surfacing, not prescribing.

### 1.3 Yahoo's `get_technical_indicators` uses `(rsi_val or 50)` — silently fabricates neutral RSI on both `None` and legitimate `0`

`app/modules/market/providers/market_data/yahoo/provider.py:154-155`:

```python
action = "SELL" if (rsi_val or 50) > 70 else "BUY" if (rsi_val or 50) < 30 else "HOLD"
trend = "Overbought" if (rsi_val or 50) > 70 else "Oversold" if (rsi_val or 50) < 30 else "Neutral"
```

Two bugs in one line:
- When `rsi_val is None` (insufficient price history, `_calculate_rsi`
  returned `NaN`), this silently substitutes the neutral value `50`,
  producing `action="HOLD"`, `trend="Neutral"` — a fabricated reading, not an
  honest "unavailable." This is exactly the pattern task scope calls out as
  Tier 1 regardless of what else is in scope.
- `or` treats a legitimate `rsi_val == 0.0` (extreme all-down-days RSI,
  rare but valid) identically to `None`, silently reclassifying a real
  "SELL"-territory reading as neutral `HOLD`. Independent correctness bug,
  same line.

This feeds `signals_dict["action"]`, cached via `cache_asset_signals`
(`workers/evaluation/signals.py:30-33`) and read back in
`generate_and_score_asset` (`recommendation.py:403`) to nudge
`recommendation_score` by ±0.1. The nudge logic itself
(`recommendation.py:413-417`) correctly treats `action is None` as
"no adjustment" — but this fallback never lets `action` be `None` in the
first-input-missing case, because the `or 50` already converted "unknown"
into "neutral" one layer up.

**Fix direction**: use `rsi_val is None` explicitly instead of truthiness,
and propagate `action=None`/`trend=None` when RSI couldn't be computed
(the function already does this correctly in its full-failure fallback path,
lines 183-188 — just not in the partial-computation path above it).

---

## Tier 2 — signal/observability gaps (needs a decision, not a silent fix)

### 2.1 Observability gap (workers audit §2.6) — confirmed still true, mapped precisely

`JobLog` (`config.job_logs`, `app/core/entities/config.py:71-82`) is the
**active**, DB-backed, queryable run-history table — written by
`_wrap_job_execution` (`app/workers/ingestion/tasks.py:103`) for exactly the
admin/broker/briefing/news/seed jobs listed at its 14 call sites
(`tasks.py:170-426`: `sync_portfolio`, `sync_zerodha/binance/groww`,
`refresh_prices`, `fetch_news`, `daily/weekly/monthly_briefing`,
`seed_price_history`, `seed_market_universe`, `admin_reprocess_all`,
`admin_repair`, `validate_data_quality`). None of
`process_asset_snapshot`, `generate_features`, `generate_signals`,
`generate_scores`, or `compute_asset_health` are in that list — confirmed by
grep, zero references to `JobLog`/`_wrap_job_execution` anywhere under
`app/workers/{snapshots,evaluation,monitoring}/`. So this chain writes to
`JobLog` at no stage, consistent with the workers audit's §2.6 framing.

Separately — and this is a second, distinct table, worth not conflating with
`JobLog` — `JobRun` (`system.job_runs`, `app/core/entities/system.py:50-64`)
also exists, with its own repository
(`app/core/repositories/job_runs.py`), and has **zero call sites anywhere in
the codebase** outside its own definition and repository — not used by this
chain, not used by the admin jobs either. It's fully dead infrastructure,
not a partially-used one; see 3.6.

What visibility *does* exist today for this chain, given neither table is
written:
- Structured `logger.info`/`logger.warning` lines at each stage
  (`ContextManager` correlation via `evaluation_id`/`asset_id` in
  `recommendation.py:382,470`), readable only via raw container/file logs,
  not queryable by asset or time range from the app.
- Celery's own `task_failure` signal — visible in `aureon_worker` container
  logs, not indexed by asset, not surfaced to any API or UI.
- `AssetHealth.status` (`compute_asset_health`, the *last* stage) going
  `STALE`/`DEGRADED` — the only queryable signal, and only visible **after**
  the SLA window has already elapsed (`SLA_QUOTE_MAX_AGE_SEC=300s`,
  `SLA_SIGNAL_MAX_AGE_SEC=3600s`, `app/core/config.py:47-50`), i.e. minutes
  to an hour after the actual failure, and only if `compute_asset_health`
  itself still ran (it won't, if an earlier stage failed — see 2.3).

Concretely missing: no per-stage success/failure counter, no
"`generate_features` failure rate, last hour," no way to answer "did the
chain even run for asset X today" without cross-referencing snapshot/feature/
score timestamps by hand. A real fix could route this chain through
`JobLog` the same way the admin jobs are (one `_wrap_job_execution`-style
wrapper per chain stage, or one per chain run), or resurrect/replace `JobRun`
for per-asset granularity — either is out of scope to build this pass;
flagging as backlog-scale, consistent with the workers audit.

### 2.2 Recommendation commit is incidental, not explicit — chain leaves an asset in a genuinely inconsistent state on one specific failure path

Traced the commit boundaries through `generate_scores` →
`RecommendationService.generate_and_score_asset` →
`materialize_for_asset` → `_score_and_materialize` →
`update_financial_intelligence_pipeline`, all on one `SessionLocal()`
(`workers/evaluation/scoring.py:13`, plain `Session.close()` on exit — no
autocommit, confirmed via `sessionmaker(autocommit=False, ...)`,
`app/core/database.py:45`):

1. `FeatureSnapshot` insert + explicit `commit()` — `recommendation.py:436-437`.
2. `AssetScore` upsert + explicit `commit()` — `recommendation.py:449-450`.
3. `materialize_for_asset` → `_score_and_materialize` does
   `repo.upsert(rec)` / `upsert_explanation` / `upsert_outcome` — all
   **flush-only**, no commit (`ai/repositories/recommendation.py:93-166`).
4. `materialize_for_asset` then calls
   `update_financial_intelligence_pipeline()`, which does its own,
   logically-unrelated "outcome realized_impact" work and calls
   `self.session.commit()` at `recommendation.py:529` — this is the commit
   that actually persists the `Recommendation`/`RecommendationExplanation`/
   `RecommendationOutcome` rows from step 3, as a side effect of being on the
   same session/transaction.

So today, `Recommendation` persistence works, but only because a commit
issued for an unrelated purpose three call-frames away happens to cover it.
If anything between step 3 and line 529 raises (e.g.
`intel_svc._get_asset_price_at_time` in the `applied_outcomes` loop,
`recommendation.py:504-520`, hits a bad transaction/DB record for an
unrelated recommendation), the exception propagates up through
`materialize_for_asset` → `generate_and_score_asset` → the Celery task body,
which has no `try/except`. The session then just closes
(`with SessionLocal() as session:`, `scoring.py:13`) — `Session.close()`
without a prior commit rolls back the pending transaction. Net effect for
that run: `FeatureSnapshot` and `AssetScore` **are** committed (steps 1-2,
already-flushed transactions), but the `Recommendation` row for **this**
asset silently never gets written, with no distinguishing log line — the
`AI Recommendation materialization started` log fires but `completed` never
does, and the Celery task shows FAILURE only in raw logs (see 2.1).

This is architecturally fragile independent of whether it's misfiring today
(9 `recommendation.recommendations` rows currently, all with plausible
non-fabricated confidence scores when checked live — the `_score_and_
materialize` `None`-skip is working as intended for the common case).

**Live-verified the mechanism directly** (not just reasoned from SQLAlchemy
docs), inside `aureon_api`, against the live DB:

```python
with SessionLocal() as s:
    s.add(JobRun(id=test_id, job_name="audit_test_no_commit"))
    s.flush()
    # visible in same session: True
# session closes here, no commit

with SessionLocal() as s2:
    # row visible in a fresh session: False
```

Confirmed: flush-without-commit is silently rolled back on `Session.close()`
— the exact mechanism 2.2 depends on. (Test row never persisted; verified
`select count(*) from system.job_runs where job_name='audit_test_no_commit'`
= 0 afterward, no residue left in the DB.) This confirms the failure mode is
real, not just theoretically possible — a `Recommendation` write that has
been flushed but not yet reached line 529's commit will vanish if anything
between them raises.

Flagging as a decision point: either commit explicitly at the end of
`materialize_for_asset` (make the dependency intentional) or split
`update_financial_intelligence_pipeline`'s unrelated outcome-update work
onto its own transaction so a failure there can't retroactively undo an
already-decided recommendation write.

### 2.3 `generate_signals` silently no-ops (not a Celery failure) when the quote is missing

`workers/evaluation/signals.py:22-24`:

```python
quote = MarketRepository(session).get_quote_by_asset_id(aid)
if not quote:
    logger.warning(f"LatestQuote not found for asset: {aid}")
    return
```

No exception raised — Celery marks this task `SUCCESS`. `generate_scores`
and `compute_asset_health` are never enqueued for this asset on this cycle.
There's no distinct signal for "chain stopped here, on purpose-ish" versus
"chain completed normally" — both look like a clean task completion from
the task-result/monitoring side, compounding the 2.1 gap (a `WARNING` log
line is the only trace).

### 2.4 `get_technical_indicators` is called twice per asset per cycle, seconds apart, for two different consumers that don't share the result — **RESOLVED**

`process_asset_snapshot` (`workers/snapshots/asset_snapshot.py:28`) calls
`adapter.get_technical_indicators(symbol)` to build `AssetSnapshot`
(rsi/momentum/volatility). `generate_signals` (`workers/evaluation/
signals.py:28`) — the *next* stage in the same chain, run moments later for
the same `asset_id`/`symbol` — calls the exact same
`adapter.get_technical_indicators(symbol)` again, independently, to build
the cached `signals_dict`. Each call does a full `yf.Ticker(symbol).history()`
+ `.news` round-trip (`yahoo/provider.py:137-165`) — this is two live
external calls per asset per cycle where one would do, doubling Yahoo
request volume for this chain.

Beyond the redundant cost, it's a consistency gap, not just an efficiency
one: the two calls aren't guaranteed to observe the same tick (price/RSI can
move between them), so `AssetSnapshot.rsi`/`.momentum_score` and the cached
`signals_dict`'s `rsi`/`action`/`trend` can silently describe two different
moments for the same asset within the same logical "cycle." Not fabrication
— both values are genuinely computed, just from two separate
fetches — but worth fixing by threading the first call's result through the
chain (e.g. `process_asset_snapshot` passes `indicators` to `generate_
features`, which passes it to `generate_signals`) rather than recomputing.

**Resolution (2026-07-12)**: confirmed live before fixing that both call
sites resolve the same `symbol` from the same `get_quote_by_asset_id(aid)`
lookup and call the identical adapter method — genuinely redundant, not two
different scopes. `process_asset_snapshot` now passes its fetched
`indicators` through `generate_features` to `generate_signals`, which uses
them directly instead of re-fetching. Standalone callers that invoke
`generate_features` directly (admin reprocess/backfill/repair, which skip
`process_asset_snapshot`) pass no indicators, so `generate_signals` still
fetches its own there — no duplication existed on that path to begin with.
Live-verified: patched `get_technical_indicators` with a call counter and
ran the full chain eagerly for a real asset — 1 call (was 2); standalone
`generate_features` invocation still makes its own 1 call.

### 2.5 Threshold/weight provenance (task 4) — **updated 2026-07-12, post-1a/1b**

Every scoring weight and signal threshold in this chain, and where it
actually comes from. Documentation only — no values changed in this pass.

| Constant | Value | Location | Source | Note |
|---|---|---|---|---|
| `SLA_QUOTE_MAX_AGE_SEC` | 300 | `app/core/config.py:47` | Pydantic-Settings config, env-overridable | Round number but a deliberate freshness window, not placeholder-shaped |
| `SLA_FUNDAMENTALS_MAX_AGE_SEC` | 86400 | `app/core/config.py:48` | Pydantic-Settings config, env-overridable | **Dead threshold** — grepped for any `_evaluate_fundamentals_sla`-style consumer; none exists. `AssetHealth.fundamentals_age_seconds` is hardcoded `None` at `asset_health.py:123` and never evaluated against this. Direct consequence of 3.1 (no fundamentals writer) |
| `SLA_NEWS_MAX_AGE_SEC` | 3600 | `app/core/config.py:49` | Pydantic-Settings config, env-overridable | Freshness window |
| `SLA_SIGNAL_MAX_AGE_SEC` | 3600 | `app/core/config.py:50` | Pydantic-Settings config, env-overridable | Freshness window |
| RSI action/trend thresholds (`> 70` SELL/Overbought, `< 30` BUY/Oversold) | 70 / 30 | `yahoo/provider.py:158-159` | Hardcoded Python constant, no config | Standard textbook RSI overbought/oversold convention, not arbitrary |
| `momentum_score = rsi / 100.0` | — | `market/services/snapshot.py:26` | Hardcoded formula | Design choice (RSI as a 0-1 momentum proxy), not a fabricated value |
| 1a partial-`recommendation_score` weights (momentum/volatility/sentiment) | 0.4 / 0.3 / 0.3 | `recommendation.py:417-428` (`generate_and_score_asset`) | Hardcoded Python constants, no config | Same weights as the pre-1a all-present formula, renormalized over whichever inputs are actually available so relative weighting is preserved when partial |
| Action nudge on `recommendation_score` (BUY/SELL) | ±0.1 | `recommendation.py:435-438` | Hardcoded Python constant, no config | Applied only when the weighted partial score was computable |
| `_score_and_materialize` rule-engine gates (BUY: `valuation>=0.7, momentum>=0.5, sentiment>=0.5`; AVOID: `sentiment<0.3, momentum<0.4`; REDUCE: `valuation<0.4, volatility>=0.6`) | — | `recommendation.py:106-129` | Hardcoded Python constants, no config | Reviewed/kept as-is by the prior market audit's fix. **Currently unreachable in practice**: the `None`-skip guard (`recommendation.py:80-90`) requires `quality_score`/`valuation_score` non-`None`, and those are permanently `None` as of 1b until real fundamentals scoring is built — so the BUY/REDUCE/HOLD branches don't execute today. AVOID doesn't depend on quality/valuation and is unaffected. This is a known, explicitly-deferred state (see conversation decision "leave dark, no rule-engine changes"), not a bug fixed in this pass |
| `_score_and_materialize` confidence-factor weights (BUY 0.4/0.3/0.3, AVOID 0.5/0.5, REDUCE 0.5/0.5, HOLD 0.5/0.5) | — | `recommendation.py:110,116,122,128` | Hardcoded Python constants, no config | Internally coherent (each branch's weights sum to 1.0). Same reachability caveat as the gates above for BUY/REDUCE/HOLD (all reference `valuation` and/or `quality`) |
| `quality_score`/`valuation_score` placeholder formula | — | *(removed in 1b)* | — | Was `0.8 + (0.05 if sentiment>0.6)` / `0.7 + (0.1 if momentum<0.4)` — suspiciously round, no real inputs, fixed as Tier 1 fabrication; now always `None` (unavailable) until real fundamentals data exists |

No untuned-placeholder-style constants found beyond the already-fixed
0.8/0.7 (1b). Nothing renamed or retuned here — flagging only, per scope.

---

## Tier 3 — cleanup

### 3.1 `AssetSnapshot.market_cap` / `.pe_ratio` are schema columns with no writer — **re-checked 2026-07-12, NOT dead, not removed**

Hardcoded `None` at construction (`market/services/snapshot.py:33-34`)
because `LatestQuote` has no source column for either
(`market/entities/market.py:11-19`). Re-grepped for every read/write site
before deciding whether to remove: these columns are **actively read**, not
just written-`None`-and-ignored — `market/services/assets.py:58-60,148-149`
exposes them via the asset detail API (`pe_ratio`/`market_cap`/`peRatio`/
`marketCap`), `market/services/market.py:223-224,245` reads them into
snapshot/feature payloads, and `ai/services/evaluation.py:75,85,97` carries
`market_cap` through `FeatureGenerationService`. Since there are real
consumers depending on the columns existing (even though they're always
`None` today), removing them would break those call sites — this doesn't
meet "zero read/write sites," so **not removed**. Still genuinely
unpopulated (honest `None`, not fabricated) and still the root cause of
1.2/quality-valuation's stub — the real fix remains backfilling from a
fundamentals provider, a deferred build, same as before.

**New finding while re-checking, out of this audit's scope — RESOLVED
2026-07-12**:
`ai/services/ai.py:812-813` (`get_single_asset_take`, the single-asset AI
briefing endpoint — not part of the `process_asset_snapshot → ... →
compute_asset_health` chain this audit covers) defaulted `rsi` to `50.0` and
`pe` to `25.0` when `AssetSnapshot.rsi`/`.pe_ratio` were `None`, then fed
those fabricated numbers into the LLM prompt as if real (`f"RSI: {rsi:.1f} |
PE Ratio: {pe:.1f}"`). Since `pe_ratio` is *always* `None` today, every
single-asset AI take was being given a fabricated "PE Ratio: 25.0" with no
disclosure. Fixed as a follow-up: both `rsi` and `pe` now render `"N/A"`
in the prompt when unavailable (matching this file's existing `N/A`
convention elsewhere), and the prompt explicitly instructs the model not
to invent values for `N/A`-marked metrics. Checked for shared lineage with
assets.py's already-fixed fabricated-fundamentals bug (market audit #26) —
unrelated code, not a shared function, same anti-pattern reappearing
independently. Live-verified the prompt sent for a real asset no longer
contains "25.0"/"50.0"; the LLM's actual generated output couldn't be
checked end-to-end (no GEMINI/GROQ credentials in this dev environment) —
worth a follow-up spot-check once credentials are available.

### 3.2 `FeatureSnapshot` is write-only — inserted every scoring cycle, read nowhere — **re-confirmed 2026-07-12, unchanged**

`FeatureSnapshotsRepository` (`ai/repositories/feature_snapshots.py`) still
has exactly one method, `insert`. Re-grepped the full codebase: only the
entity definition, this repository, and the one `insert()` call site in
`generate_and_score_asset` remain — still inserted every `generate_scores`
run, still never queried back anywhere. Per the task instructions this
needs a retention decision (intentional audit trail needing a reader, vs.
dead weight) rather than a mechanical delete, so **not touched** — re-
flagged as still accurate and still deferred.

### 3.3 `_check_missing_values`/`_check_numeric_ranges`/`_check_outliers` names overpromise — **RESOLVED**

Renamed to `_check_price_present`/`_check_price_numeric_range`/
`_check_price_outliers` (`ai/services/evaluation.py`), matching what they
actually check. No behavior change — these are private, single-file helpers
with no external call sites. `validate_features` also got a short docstring
noting momentum/volatility/sentiment/market_cap are intentionally not
validated here (handled downstream as partial/unavailable per 1a/1b).

### 3.4 `signal_age_seconds` degrades to snapshot freshness, not signal freshness, on cache miss — **checked, not a bug, documented**

Re-examined whether this reports genuinely wrong staleness — it doesn't.
`process_asset_snapshot` and `generate_signals` run back-to-back in the
same chain execution and, as of 2.4's fix, now share the same fetched
indicators — so the `AssetSnapshot.updated_at` fallback is a close proxy
for actual signal freshness in practice, if anything tighter than before.
This is a naming/clarity gap, not a correctness bug: the field doesn't
*guarantee* it's measuring signal freshness specifically, it just usually
is. Left the logic as-is and added an in-code comment explaining the
conflation at `market/services/asset_health.py:97-105`.

### 3.5 No duplicate/dead scoring *logic* found (duplicate *calls* are covered separately at 2.4)

Checked for a second copy of the rule-engine math
(`0.4 * momentum`, `quality_score = 0.8`, etc.) anywhere else in the
codebase — single occurrence, in `_score_and_materialize`
(shared by `generate_recommendations` and `materialize_for_asset`, already
deduplicated by the in-progress uncommitted refactor in
`recommendation.py`). No dead scoring/signal functions found in
`evaluation/{features,scoring,signals}.py` themselves — each of the three
worker files is a thin Celery-task wrapper with a single call path, no
unreachable branches. The one duplication found in this chain is a
duplicate *external call*, not duplicate logic — see 2.4.

### 3.6 `JobRun`/`JobRunsRepository` are fully dead code, not partially-used — **RESOLVED**

Cross-referenced from 2.1: `system.job_runs`
(`app/core/entities/system.py:50-64`) and its repository
(`app/core/repositories/job_runs.py`) had zero call sites anywhere in the
codebase outside their own definitions — not used by this chain, not used
by the `JobLog`-backed admin jobs either, not used by any API route. Distinct
from `JobLog` (2.1), which *is* actively written, just not by this chain.
Re-confirmed still zero call sites before removing. `system.job_runs` had 0
rows. Removed the entity, repository, and its domain-entities export;
dropped the table via migration `ad9c01814823`. If per-asset observability
(2.1) gets built later, it starts fresh rather than repurposing this.

---

## Chain integrity — live-verified current state (task 5/6)

Sampled `evaluation.asset_scores` / `market.asset_features` /
`recommendation.recommendations` together (2026-07-12): 20+ assets have
fresh, mutually-consistent `asset_features`/`asset_scores` timestamps
(same ~10:00:3x second window per asset, consistent with the chain firing
synchronously via `.delay()` fan-out). Only 9 `recommendation.recommendations`
rows exist against a much larger scored-asset universe — consistent with
`_score_and_materialize`'s `None`-skip working as designed for assets
missing a required factor, **not** evidence of chain breakage. No orphaned
"stale signal next to fresh features" state was observed for any sampled
asset. The one confirmed inconsistency risk is the incidental-commit
fragility in 2.2 (reasoned from code — did not force a live failure inside
`update_financial_intelligence_pipeline` in the running stack, since that
would require corrupting a real DB record to reproduce; the commit-boundary
trace is unambiguous from the code alone).

---

## Deferred (SPAR'd, not built this pass)

- **Real quality/valuation scoring** (1.2) — needs a fundamentals data
  source (market cap, P/E, or similar) before `quality_score`/
  `valuation_score` can be genuinely computed rather than stubbed constants.
  Out of scope: this is a new data pipeline, not a chain-logic fix.
  `AssetSnapshot.market_cap`/`.pe_ratio` stay in the schema (3.1 — actively
  read by real consumers, not dead) as the natural landing spot once this is
  built.
- **`_score_and_materialize` rule engine behavior with quality/valuation
  permanently unavailable** (surfaced during this pass, cross-referencing
  1a/1b and 2.5) — the BUY/REDUCE/HOLD branches and their confidence-score
  math directly reference `quality`/`valuation`, so they don't execute while
  those are `None` (the `None`-skip guard blocks them; AVOID is unaffected).
  Explicitly decided to leave this dark rather than reshape the rule engine
  — revisit once real quality/valuation scoring (above) exists, or sooner if
  the user wants recommendations to materialize off momentum/volatility/
  sentiment alone in the meantime.
- **Per-asset queryable job-run observability** (2.1) — a real run-history
  table for the evaluation chain, or routing Celery `task_failure` into a
  queryable store. `JobRun` (3.6) was removed as dead code, not repurposed,
  so this starts fresh if built. Backlog-scale, consistent with the workers
  audit's framing of the same gap.
- **Tunable rule-engine weights/thresholds** (2.5) — moving the recommendation
  rule engine's hardcoded constants into `ConfigService`/`config` schema, if
  the user wants them adjustable without a code change.
- **`FeatureSnapshot` retention/consumption** (3.2) — decide whether it's an
  intentional audit trail (needs a reader, e.g. a history endpoint) or dead
  weight (drop the insert). Re-confirmed still write-only, still deferred.
- ~~**`ai.py` single-asset take's fabricated RSI/PE defaults**~~ —
  **RESOLVED as a follow-up fix**, not deferred. See 3.1.

## Queue status (as of 2026-07-12)

All Tier 1 items (1a, 1b) and all mechanical Tier 2/3 items (2.4, 2.5
documentation, 3.3, 3.4, 3.6) are resolved. Remaining open items are all
deferred product/build decisions, not mechanical work: 1.2's real
fundamentals pipeline, the rule-engine-with-unavailable-quality/valuation
decision above, 2.1's observability table, 2.5's config-driven tunability,
3.2's `FeatureSnapshot` retention call, and the newly-surfaced 3.1 AI
briefing fabrication (out of this module's scope). 2.2 (incidental commit
boundary) and 2.3 (silent no-op on missing quote) were resolved in prior
commits (`4b23afc`, `60798ba`) ahead of this session.
