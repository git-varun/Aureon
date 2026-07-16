# Sentiment Computation — Design Options Audit

Audit-only, no code changed. Goal: lay out the real design choices for computing
real sentiment, since this is now the direct, confirmed blocker on the
recommendations feature (`materialize_for_asset` correctly skips any asset with
`NULL` `sentiment_score`, so recommendations stay empty until a real value
exists for at least momentum/volatility/sentiment/quality/valuation).

## 1. Current state — confirmed, nothing has changed

Two disconnected sentiment signals exist today, exactly as previously found:

- **`News.sentiment_score`** (`app/modules/news/entities/news.py:31`, documented range `-1 to 1`) — column exists, is never assigned anywhere in the codebase (confirmed again by a fresh grep), always `NULL`. Its only consumers are per-article: `NewsService.get_recent_news`/`get_all_recent` (`news.py:99,118`, feeds the frontend dot) and the daily-briefing context builder (`ai/services/ai.py:334`, which prints literally `"N/A"` for every article, forever).
- **`AssetFeatures.sentiment_score`** (0–1 scale, inferred from the recommendation rule engine's thresholds `>= 0.5` / `< 0.3`) — actually computed, but the entire chain is: `AssetHealthService`/signals/snapshot tasks call `ProviderFactory(...).get("yahoo").get_technical_indicators(symbol)` **unconditionally, for every asset regardless of its real provider** (`app/workers/snapshots/asset_snapshot.py`, `app/workers/evaluation/signals.py`) → inside that call, Yahoo independently re-fetches `ticker.news` a second, completely uncached time and does a bag-of-words count over titles only (`yahoo/provider.py:150-167`) → `sentiment_val` → `SnapshotService.build_snapshot` (`snapshot.py:28,38`) → `AssetSnapshot.sentiment_score` → `FeatureGenerationService.generate()` (`ai/services/evaluation.py:60,70`) simply **copies it wholesale**, no aggregation logic exists at that layer → `AssetFeatures.sentiment_score`.
- Binance/crypto assets: Yahoo's `get_technical_indicators` is still called with the crypto symbol (yfinance format), but Binance itself has no `NEWS` capability and isn't in the aggregation path at all — crypto assets get `sentiment=None` unless yfinance happens to have news for that ticker (rare/inconsistent).

**Also confirmed still true:** `NewsAsset` (the join table linking articles to assets, `news.py:36-42`) is written on every ingest (`NewsService._link_news_assets`) but **never read/joined anywhere** — pure write-only today. And `AssetSentimentSnapshot` (`news/entities/news.py:48-60`, with `avg_sentiment_7d`, `avg_sentiment_30d`, `article_count_7d`, `trend` columns) is fully modeled, imported once, and **never written or read by any code path** — it was clearly designed for exactly the aggregation this audit is about, and was never wired up.

**Scale mismatch to resolve, regardless of chosen option:** `News.sentiment_score` is documented `-1 to 1`; `AssetFeatures.sentiment_score`/the recommendation rule engine assume `0 to 1`. Whatever computes real sentiment must pick one canonical per-article scale and explicitly convert at the aggregation boundary — this isn't optional, it's a concrete bug waiting to happen if the two are wired together naively.

## 2. What actually needs sentiment — two legitimately different things, not a mistake

| Consumer | Field | Granularity |
|---|---|---|
| `RecommendationService` (`recommendation.py` — `_score_and_materialize`'s required factors) | `AssetFeatures.sentiment_score` | per-asset aggregate |
| `FinancialIntelligenceService` explanations (`intelligence.py:213-214`) | `AssetFeatures.sentiment_score` | per-asset aggregate |
| Frontend per-article dot (`AssetDetail.jsx`) | `News.sentiment_score` | per-article |
| Daily briefing article listing (`ai.py:334`) | `News.sentiment_score` | per-article |

These are **not required to be the same number** — they're different granularities that legitimately compose: per-article sentiment is a raw fact about one piece of text; per-asset sentiment is a derived aggregate over an asset's recent articles (mean, recency-weighted mean, etc.). The schema for exactly this composition already exists and is simply unused: `NewsAsset` links articles→assets, and `AssetSentimentSnapshot` was clearly built to hold the aggregate (`avg_sentiment_7d/30d`, `article_count_7d`, `trend`). Today's bug isn't "two sentiments that should be one" — it's that neither the per-article computation nor the aggregation step was ever actually implemented; `AssetFeatures.sentiment_score` instead gets a *different, redundant, Yahoo-only* per-article computation smuggled in directly, bypassing the News module entirely.

## 3. Options for computing real per-article sentiment

### (a) Bag-of-words, done properly
Move the existing pos/neg keyword-matching logic (already written, just misplaced) out of `yahoo/provider.py:get_technical_indicators` and into the news ingestion path (`NewsService.fetch_and_store`), applied uniformly to every article from every provider (not just Yahoo), populating `News.sentiment_score` at write time. Then aggregate per-asset via the existing `NewsAsset` join into `AssetFeatures.sentiment_score` (and, properly, into `AssetSentimentSnapshot`).
- **Effort:** low–medium — the classification logic already exists, it just needs relocating and generalizing.
- **Accuracy:** unchanged from today — still crude keyword counting on titles only, no negation/intensifier handling (e.g. "not bullish" would count as positive).
- **Dependencies/cost:** zero — pure Python, no network, no library.
- **Side benefit:** eliminates the redundant, uncached Yahoo-only re-fetch entirely (a second previously-flagged issue), and covers every provider/asset uniformly.
- **Residual gap:** crypto/Binance assets still get no sentiment unless a crypto-covering news provider exists — this is a provider-coverage gap, not something any sentiment-computation choice fixes on its own.

### (b) LLM classification via Gemini/Groq (already wired)
Reuse the existing multi-model fallback chain (`ai/services/ai.py:539-596`, `execute_completion`/circuit-breaker) to classify each article's sentiment via prompt at ingestion time.
- **Effort:** medium. `execute_completion` as it stands is heavyweight for this (it writes a full `AIGeneration` + `AIEvaluation` record and runs faithfulness/relevance checks meant for user-facing briefings) — using it as-is for ~hundreds of articles/day multiplies unrelated DB writes; a leaner path would call the provider's `.fetch()` directly, which is still real integration work plus a new prompt/parser.
- **Accuracy:** highest of the options — real language understanding, handles negation/nuance a keyword count can't.
- **Cost/dependency:** **real, ongoing external spend and latency per article** — at up to 10 symbols × ~10–20 articles per 4-hourly cycle, this is potentially hundreds of completions/day, against the *same shared, rate-limited* Gemini/Groq keys the daily briefing and Q&A features already depend on (via the same `CircuitBreaker`). This directly conflicts with this project's stated local-first/minimal-external-spend philosophy, and risks starving the actual AI-briefing feature of its free-tier rate-limit budget.
- **New failure mode, correctly handled per this thread's established pattern:** on API failure, do not fabricate — leave `sentiment_score` `NULL` for that article. But this means an asset can flip between "has sentiment" and "blocked again" depending on transient LLM outages/cooldowns, reintroducing the exact silent-blocking behavior this whole investigation started from, just intermittently instead of permanently.

### (c) Lightweight local sentiment library (e.g. VADER)
Add one small, pure-Python, no-network, no-model-download dependency (VADER is specifically tuned for short informal text like headlines/social posts) and run it at ingestion time, same integration point as (a).
- **Effort:** low — one new dependency, a few lines to call it, same aggregation step as (a).
- **Accuracy:** meaningfully better than raw bag-of-words (handles negation, degree modifiers, punctuation emphasis) while remaining deterministic and free; well-suited to short headline text specifically (its stated design target).
- **Cost/dependency:** zero external calls, negligible latency (sub-millisecond/headline), one small library addition — consistent with "local-first, zero/minimal external spend."
- This option **obsoletes (a) outright** — same integration point and cost profile, meaningfully better accuracy, no reason to hand-roll (a) once (c) is on the table.

### (d) Other approaches worth naming
- **Confidence/volume weighting in the aggregate step:** don't just average per-article scores — weight by recency and factor in article count (a single article shouldn't carry the same weight as ten). `AssetSentimentSnapshot.article_count_7d` was clearly designed with exactly this in mind — whichever option is chosen, the aggregation step should populate this table properly rather than inventing a parallel one.
- **Hybrid, opt-in LLM tier:** run (c) always-on as the default per-article computation (near-zero cost), and reserve LLM classification (b) for a specific, user-triggered "explain this sentiment"/spot-check feature rather than blanket per-article ingestion — captures most of (b)'s accuracy benefit for the cases a user actually cares about, without the recurring cost/rate-limit exposure of running it on every article automatically.
- **Cheapest possible "unblock," named for completeness, not recommended:** drop `sentiment_score` from the recommendation rule engine's required factors entirely and score on momentum/volatility/quality/valuation alone. This isn't a sentiment-computation fix at all — it changes what the recommendation model considers, which is a real product decision (not an audit finding) and works against the rule engine's own explicit BUY/AVOID conditions that weight sentiment deliberately. Naming it because it's the fastest path to non-empty recommendations if computing real sentiment turns out to be lower priority than expected — but it's a different task from this one.

**Recommendation: option (c).** It has (a)'s cost profile (zero, local, matches the project's stated philosophy) with meaningfully better accuracy, obsoletes the need to even consider (a) separately, and keeps the LLM budget free for the features that already depend on it. (b) remains available later as an opt-in enhancement per (d), not as the default path.

## 4. Ingestion-time-once vs. periodic recompute

**Per-article `News.sentiment_score`: compute once, at ingestion, immutable thereafter.** A headline's sentiment is a fixed property of fixed text — there's no reason to recompute it unless the *method* changes (VADER version bump, or a future switch to LLM classification), which is a one-time backfill/migration concern for existing rows, not a recurring job.

**Per-asset aggregate (`AssetFeatures.sentiment_score` / `AssetSentimentSnapshot`): recompute periodically** — but this isn't "recomputing sentiment," it's recomputing a rolling-window aggregate as new articles arrive and old ones age out of the 7d/30d window, exactly analogous to how momentum/volatility already get recomputed every cycle from fresh price data. This should ride the existing `generate_features` cadence (already runs per-asset on every quote-ingestion cycle) rather than introduce a new schedule.

## 5. What happens to the recommendation pipeline once sentiment is real

**It just works — no coordination needed.** The skip-on-null logic shipped this session (`_score_and_materialize`) was built exactly for this transition: the moment `AssetFeatures.sentiment_score` becomes non-null for an asset (the next `generate_features` run after news + aggregation exist for it), the very next `generate_and_score_asset` → `materialize_for_asset` cycle will naturally produce a real `Recommendation` row for that asset — no flag, no manual re-trigger, no migration required.

Two things worth setting expectations on, not fixing:
- The 81 previously-fabricated rows were already purged this session — the table is currently empty by design. Recommendations reappearing "from nothing" once sentiment exists is the intended effect, not a regression to investigate.
- There will be a natural latency window (up to ~1 hour, bounded by the hourly quote-refresh cadence) between "an asset's news was aggregated" and "its recommendation reflects it" — the same lag every other derived feature (momentum, volatility) already has relative to its inputs, not a new problem introduced by fixing sentiment.

## Bottom line

Recommended path: **(c) local VADER-style sentiment at ingestion**, aggregated per-asset via the already-modeled-but-unused `NewsAsset`/`AssetSentimentSnapshot` tables, computed once per article and recomputed only as a rolling aggregate on the existing feature-generation cadence. This removes the redundant Yahoo-only re-fetch as a side effect, covers every news-capable provider uniformly, costs nothing, and requires no changes to the recommendation pipeline itself — it was already built to pick this up automatically. No implementation performed; this is the input to a separate fix-scoping decision.
