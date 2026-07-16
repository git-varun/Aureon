# Aureon — Handoff to Phase 3 (Module-by-Module Data-Integrity Audits)

**Context for the new chat:** paste this whole file as the first message.
This builds on AUREON_HANDOFF_PHASE2.md (still accurate, don't re-read it
unless you need Phase 1/2's original detail — this doc summarizes what
matters going forward). If using the SPAR/DO mode convention, restate it
in the new chat.

---

## 1. What Aureon is

Local-first, single-user Investment Operating System. FastAPI + PostgreSQL
+ Redis + Celery + RabbitMQ backend, React/Vite frontend, Docker Compose.
Full detail in AUREON_HANDOFF_PHASE2.md §1 — unchanged.

## 2. FIRST ACTION IN THE NEW CHAT — confirm pending work landed

The previous session ended mid-flow on Fix U/V/W (real sentiment
computation — see §4). The diff had been requested but not yet shown, and
commits had not been confirmed. **Before starting any new audit, check
`git log` and `git status` to confirm Fix U/V/W actually got committed.**
If not, finish that first: get the diff shown, split into logical commits
(ingestion-time sentiment / aggregation / evaluation-features wiring),
commit, report hashes. Only then proceed to new work.

## 3. Working discipline established across Phase 2 and this audit chain
(carry forward, do not relitigate)

- **Audit before modifying**, always. One scoped task per CC session, diff
  review before accept, explicit "stop and ask, don't guess" on ambiguity.
- **Tiered triage on every audit**: findings get sorted into (1) mechanical
  fixes with no design question — do immediately, (2) fixes needing one
  explicit decision — SPAR or ask before implementing, (3) architecture/
  reliability work or unrequested feature scope — defer to backlog, don't
  build speculatively.
- **The core recurring bug pattern, confirmed across every module audited
  so far**: a value is computed/fetched correctly, then either (a)
  silently dropped/mismapped before reaching its consumer, (b) allowed to
  go stale with no signal, or (c) — the most severe variant, found
  repeatedly — **fabricated**: a hardcoded constant or "neutral" default
  substituted when real data is absent, indistinguishable from a real
  value to the consumer. Category (c) is a direct violation of this
  project's no-fake-data policy and gets fixed on sight, not deferred,
  regardless of what else is in scope for that session.
- **Live verification over static reasoning, always**, even when static
  reasoning found zero issues — this has repeatedly caught real bugs
  static analysis missed (a 20s hang, a cache-seeding bug that silently
  defeated an earlier fix, confirmation that a "fixed" function wasn't
  actually the one running in production).
- **When two functions duplicate the same logic and one gets fixed,
  check whether the other is the one actually running.** This is the
  single most important lesson from this session: Fix I fixed
  `generate_recommendations`'s null-handling, but `materialize_for_asset`
  — a near-identical, undiscovered sibling function — was the one
  actually running on the live hourly pipeline, and kept fabricating
  data for days after Fix I "shipped." The fix that mattered was finding
  and fixing the live path, then consolidating both into one shared
  function so this can't silently recur.
- **A direct-DB write/cleanup bypasses whatever cache-invalidation the
  service layer normally does** — always check what Redis keys a table
  feeds before doing raw-SQL cleanup, and invalidate them explicitly.
- **SPAR unrequested scope expansion before building it.** Per-holding
  freshness, watchlist asset_id bridging, currency fields, and a real
  provider-fallback-chain were all found buildable during audits and all
  correctly deferred — audits surfacing "this could be built" is not the
  same as "this should be built now." Check against what was actually
  asked for.
- **Decisions requiring product/design judgment get flagged and asked,
  not inferred** — null-handling shape (skip vs. explicit "unavailable"
  state), threshold values, consolidation timing, deletion of stale data.
  Mechanical fixes (typed exceptions, deduplication, key-naming
  consistency) don't need this.
- **Reference doc upkeep**: if a session's audit/scope work materially
  changes what's true about a piloted folder (`market/`, `portfolio/`),
  update that folder's `reference.md` as part of the same session/commit —
  not a separate maintenance task, not deferred. If the folder doesn't have
  a `reference.md` yet and the work touching it would take more than ~3
  sentences to summarize, that's a signal to create one following the
  template in `PROVIDER_TOGGLE_AND_PILOT_DOCS_SCOPE.md` §Part 2.

## 4. What happened since Phase 2 closed

**Market-module audit** (`MARKET_MODULE_AUDIT.md`, untracked — full findings
list still there for reference), fixed across three tiers:
- **Tier 1** (data fabrication) — `fba51ab`: hardcoded fallback price
  (`_get_asset_price_at_time` returning `100.0`), recommendation engine
  defaulting missing factors to fake neutrals, `assets.py` fabricating
  fundamentals (PE/RSI/market cap/etc.) with hardcoded multipliers, and
  `ensure_asset_exists` seeding a fake `LatestQuote(price=0.0)` for every
  new symbol (root cause of several downstream mislabeling bugs).
- **Tier 2** (staleness signal) — `48e45cd`/`9cace81`: per-quote
  `quote_age_status` field, centralized the 6x-duplicated price-fallback
  pattern in `intelligence.py` into `resolve_position_price()`, and fixed
  the dashboard's "Prices: Live" badge reading snapshot-regeneration
  recency instead of actual market-quote freshness.
- **Tier 3** (small cleanup) — `415e361`/`e0ca6af`/`4e0af8b`: quote-cache
  key mismatch, watchlist's wrong exchange-label heuristic, dropped
  provider/timestamp at persistence.
- **Deferred (SPAR'd, in backlog)**: real fallback-chain retry logic,
  watchlist asset_id bridge, currency fields.

**Live-fabrication discovery mid-session (most severe finding of this
entire audit chain)**: `materialize_for_asset` — the function actually
running on the hourly automatic pipeline, not `generate_recommendations`
(which Fix I had already correctly fixed but which turned out to be
manual-trigger-only) — was fabricating sentiment/volatility/quality/
valuation on every null field, confirmed via direct DB query: **100% of
81 live `Recommendation` rows had been generated from fabricated
sentiment**, continuously, for ~4.5 days. Fixed (**Fix Q**) by
consolidating both functions into one shared `_score_and_materialize`.
The 81 fabricated rows were deleted (decision made, not flagged) after
confirming no real financial impact (linked transactions were all
HOLD/qty=0) — recommendations table was intentionally left empty rather
than populated with fake data, as the honest state until sentiment
actually existed.

**News-module audit** (audit report given inline in chat, not saved to a
file — recreate from conversation history if needed), fixed:
- **Fix R** — `fetch_news_task` swallowed all provider failures internally
  and always logged `SUCCESS`; fixed to distinguish real failure from
  "zero articles today," raising when every provider genuinely errors.
- **Fix S** — `AssetHealth.news_healthy` defaulted missing news data to
  `True` (healthy) instead of unknown; fixed with a proof (7-case matrix)
  that the overall health rollup is unchanged, no new false alarms.
- **Fix T** — frontend rendered every article with `sentiment_score: NULL`
  as if it were a genuine neutral assessment; fixed to show a distinct
  "unassessed" state.

**Sentiment computation** (the actual root cause unblocking recommendations,
audited then fixed as **Fix U/V/W** — ⚠️ commit status unconfirmed, see §2):
- Chose VADER (local, no-network, headline-tuned) over an LLM-based option
  — deliberately, to avoid recurring external cost/rate-limit exposure on
  the same shared keys the AI-briefing feature depends on.
- Fix U: real per-article `News.sentiment_score`, computed once at
  ingestion, for every provider (not just Yahoo) — removed the old
  redundant Yahoo-only bag-of-words re-fetch entirely.
- Fix V: recency-weighted, confidence-shrunk per-asset aggregation into
  the previously-unused `AssetSentimentSnapshot` table, riding the
  existing `generate_features` cadence (no new schedule). Explicit scale
  conversion (`-1..1` → `0..1`) at the one point it matters.
- Fix W: confirmed crypto/Binance assets correctly get `sentiment: None`
  (no fabrication), not a new feature.
- **Verified end-to-end, including the actual proof this whole chain was
  chasing: a real `Recommendation` row (HOLD, confidence 0.889) produced
  for AAPL from genuinely-computed sentiment, with no fabricated inputs
  anywhere in the chain.**
- One unverified edge: sentiment computation was only live-tested against
  Yahoo (Finnhub returned 0 articles during the test window) — code has no
  provider special-casing so should generalize, but re-verify against real
  non-Yahoo data when possible.

## 5. Backlog (accumulated, not yet actioned — check
AUREON_HANDOFF_PHASE2.md §4 for the pre-existing list, these are additions
since):

- Market-data fallback chain is dead/aspirational — documented, not built.
  Revisit only if a real sustained provider outage causes user-visible
  impact.
- Watchlist has no `asset_id` column at all — deferred alongside the
  existing per-holding-freshness gap.
- No currency field anywhere in Asset/LatestQuote/AssetSnapshot — real
  migration work, no confirmed live impact yet.
- `signal_healthy` (`asset_health.py`) has the identical silent-default-
  to-healthy bug `news_healthy` had before Fix S — found during Fix S,
  not fixed.
- `get_monthly_briefing` (`ai/services/intelligence.py`) has no router
  reaching it anywhere — works fine standalone, unclear if intentional.
- `Terminal.jsx`'s `NewsPanel` reads a mismatched field name
  (`n.sentiment || n.s`) against the real `sentiment_score` field —
  pre-existing, unrelated to the sentiment work, has always silently
  rendered "neutral" regardless of real data.
- Fix U/V/W's non-Yahoo provider path is unverified with live data
  (Finnhub returned 0 articles during testing) — re-check next time
  Finnhub actually returns articles.
- `AssetSnapshot.sentiment_score` left as a permanently-`None` legacy
  field rather than removed (would need a migration + touching two read
  sites outside Fix U/V/W's scope) — those two endpoints now consistently
  return null instead of intermittent stale values; more correct, but a
  visible behavior change worth knowing about.

## 6. Modules audited so far vs. remaining

**Audited and fixed**: portfolio (Phase 2's cache/error-handling work),
market (this session, Tiers 1-3), news + sentiment (this session), AI/
recommendation (touched via Fix H/I/Q, not a full standalone audit).

**Not yet audited with this same lens** (candidates for Phase 3, per the
stated plan to continue module-by-module): intelligence module beyond what
Fix H/L touched, evaluation module (features/scores/signals generation
logic itself, not just its consumers), core/config module, monitoring
module, watchlist module beyond the exchange-label fix, workers/celery
infrastructure holistically (beyond the specific tasks already touched),
auth/identity remnants (should be fully removed per Phase 1, worth a
confirming pass), frontend state management (`store.jsx`) more broadly.

**Suggested first move in the new chat, after §2's confirmation step**:
decide which module to audit next — no default has been chosen yet