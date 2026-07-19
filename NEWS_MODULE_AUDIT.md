# News Module Audit

**Date:** 2026-07-17 (IST) / 2026-07-16 late UTC
**Scope:** `backend/app/modules/news/` end to end — entities, repositories, services, API, the providers that feed it, the Celery ingestion path, frontend consumers, and how news reaches AI briefing context.
**Method:** Static read of every module file + live verification against the running Docker stack (Postgres on host port 5433, API on 8002), including a real ingestion cycle triggered through the actual service path.

**Pre-audit git state:** working tree was NOT clean — 3 modified files under `app/modules/ai/` (the Intelligence audit's approved, uncommitted fixes: target_corpus guard, dead `get_daily_briefing`/`get_weekly_briefing` removal, N/A-guards in `PortfolioContextBuilder`) plus 4 untracked prior audit docs. None of it touches `modules/news/`, so the audit proceeded read-only against that state rather than blocking.

---

## Architecture (as actually found)

The module lives at `app/modules/news/` with `api/news.py`, `entities/news.py`, `repositories/{news,asset_sentiment}.py`, `services/{news,sentiment}.py`. It has **no providers/ directory of its own** — news fetching rides on market-data providers that declare `Capability.NEWS` in the provider registry.

**Data flow (all steps live-verified):**

1. **Schedule.** Celery beat entry `news-refresh` → `fetch_news_task` every 4 hours (`crontab(minute=0, hour="*/4")`), gated by `_skip_if_disabled("fetch_news")`.
2. **Symbol selection.** `IngestionRepository.list_quoted_symbols(limit=10, crypto_quota=4)` — staleness-ordered rotation over `Asset.last_news_fetch_at` (NULLS FIRST) with 4 of 10 slots reserved for crypto. This is the crypto-sentiment-coverage fix from earlier this session-chain, and it is present and working.
3. **Fetch.** `NewsService.fetch_and_store(symbol)` asks `registry.list(Capability.NEWS)` for providers — **only `yahoo` and `finnhub` declare NEWS** — resolves each through `ProviderFactory.get(name, required=False)` (disabled providers skipped), fetches with retry, dedupes by URL.
4. **Sentiment at ingest.** Each new article's title is scored by VADER (`polarity_scores(title)["compound"]`, already on the documented -1..1 scale) and stored immutably on `News.sentiment_score`.
5. **Store + link.** Row in `news.news` (`summary` defaulted to title), then `_link_news_assets` joins via `LatestQuote.symbol` → `news.news_assets`.
6. **Aggregate.** `NewsSentimentService.aggregate_asset_sentiment` recomputes a recency-weighted, confidence-shrunk 7d/30d aggregate into `news.asset_sentiment_snapshots` on every `generate_features` run; `FeatureGenerationService` converts -1..1 → 0..1 once at the boundary and propagates **None honestly** when no snapshot exists.
7. **Serve.** `GET /api/v1/news` (grouped feed) and `GET /api/v1/news/{symbol}` (per-symbol, LIKE-matched). Frontend consumers: `AssetDetail.jsx` NewsSection and `Terminal.jsx` NewsPanel.

---

## Live-verification evidence

Stack note: `.env`'s `DATABASE_URL` points at `localhost:5432`, which is a **host-native Postgres with an empty `aureon` schema** — every table 0 rows. The live Docker stack maps its Postgres to **5433** and its API to **8002** (port 8000 is an unrelated Node server). All evidence below is from 5433/8002. Worth knowing when hand-querying, but not a code defect (containers use `aureon-db:5432` internally).

- **Real data:** 747 articles (748 after my test ingest), **100% sentiment-scored, 100% linked** to assets (747 `news_assets` rows), sources = `yahoo` only. Newest ingest 2026-07-16 20:00 UTC — **48 minutes before checking**, exactly on the 4-hour beat, so the pipeline is current, not stale.
- **TaskRun:** `fetch_news_task` has 2 rows, both SUCCESS, latest 2026-07-16 20:00:00 UTC. Only 2 because the TaskRun table shipped this session-chain; consistent with the beat cadence since.
- **Rotation coverage** (`Asset.last_news_fetch_at`): equity 36/43 attempted, **crypto 22/22 attempted** (10 with actual articles), index 8/8, mutual_fund 9/9, crypto_futures 7/7, retirement 2/2, stablecoin 1/1; nps 0/7 and epf 0/1 never attempted — correct, since they have no `LatestQuote` rows and `list_quoted_symbols` only rotates quoted symbols.
- **Sentiment snapshots:** 87 rows across 35 assets — equity 22, **crypto 6**, index 6, stablecoin 1; latest computed 2026-07-16 16:00 UTC. Crypto sentiment is flowing end to end post-fix.
- **Live ingestion trigger:** ran `NewsService.fetch_and_store("HDFCBANK.NS")` through the real service against the live DB: Yahoo returned 10 articles, 9 deduped by URL (already present), 1 inserted, linked, VADER-scored (samples: 0.6486, 0.34, 0.0). `before=9 new_count=1 after=10`.
- **Live API:** `GET /news/health` → ok; `GET /news/BTC-USD` → 10 real articles with real scores; `GET /news/ZZTESTNOSUCH` → `[]` (honest empty, no fabrication); `GET /news/BTC` → returns the BTC-USD articles (substring match — see F6).
- **Provider config (live):** yahoo enabled/ACTIVE; **finnhub enabled=false**; polygon enabled=false. Yahoo is the sole live news source.
- **Dead columns (live):** `content` and `relevance_score` populated in **0/748** rows; `summary = title` in **748/748** rows.

---

## Findings

### F1 — `POST /analytics/ai/news/batch` is a no-op that fabricates success — **Tier 2** (decision needed)

`app/modules/ai/api/ai.py:100` — the entire handler is:

```python
@router.post("/analytics/ai/news/batch")
def analyze_news_batch():
    return {"status": "success", "message": "News batch processed"}
```

Nothing is queued, fetched, or scored. It has **two live frontend callers**:
- `AdminPanel.jsx:21` — button labeled *"Analyze News Batch — Queue AI.news sentiment to score recent headlines"*, which displays the returned "success" to the user;
- `V4Context.jsx:133` — the `j-news` job trigger routes here.

This is the **fourth instance** of the "presents as working, does nothing" pattern this session-chain (after watchlist alerts pre-fix, the old Sign-out button, and Intelligence's dead briefing methods), and it additionally violates the no-fake-data policy: the response is a fabricated success message indistinguishable from a real one. Decision needed: (a) wire it to actually dispatch `fetch_news_task` (the honest interpretation of what the button claims), or (b) remove the endpoint and both frontend affordances. Not implemented in this pass.

### F2 — Polygon's `get_news` is dead code with a policy-violating error path — **Tier 3** (defer; note if Polygon news is ever wanted)

`polygon/provider.py:65` implements a full Polygon news-API client, but Polygon's `capabilities()` returns `[PRICE, OHLC, CORPORATE_ACTIONS]` — **no `Capability.NEWS`** — so `registry.list(Capability.NEWS)` never returns it and grep confirms no other caller. Unreachable today. Worse, its `except` clause does `logger.warning(...); return []` — the silent-swallow pattern the rest of the pipeline explicitly avoids (Yahoo/Finnhub raise `ProviderError`). Harmless while dead, but if anyone ever adds `Capability.NEWS` to Polygon, this error path silently converts provider failure into "no news". Flagging so it isn't inherited by accident.

### F3 — Single live news source; Finnhub's no-key path silently returns `[]` — **Tier 3**

With finnhub and polygon disabled in `provider_configs`, **Yahoo is the only news source**, and Yahoo's coverage gaps become permanent data gaps (mutual_fund: 9/9 attempted, 0 articles; crypto_futures: 7/7 attempted, 0 articles). That absence surfaces honestly (empty lists, null sentiment) — no policy violation — but it's a coverage limitation worth knowing.

Separately, `finnhub/provider.py:63`: if finnhub were **enabled but key-less/placeholder-keyed**, `get_news` returns `[]` instead of raising — it would count as a successful "attempted" provider in `fetch_and_store`, weakening the all-providers-failed detection and masking the misconfiguration. Unreachable today (disabled → factory returns None before the method is called), but the same inherited-later risk as F2.

### F4 — Sentiment is VADER-on-title-only; 40% of scores are exactly 0.0 — **Tier 3** (limitation, not a violation)

Per-article sentiment is computed once at ingest from the **headline text only** (`content` is never fetched — 0/748 rows). VADER yields compound 0.0 for any headline without lexicon words: **299/747 (40%) of live scores are exactly 0.0**. These are real computed scores, honestly stored and honestly rendered (frontend shows them as "neutral"), so no fake-data violation — but a title-only-neutral is weak evidence, and the aggregation layer already treats thin evidence correctly (confidence shrinkage). Answer to the audit's question 2: the crypto fix addressed *rotation/coverage*; the scoring itself is uniform across asset classes (same VADER path for everything), with no equity-specific gap found. The remaining gap is source coverage (F3), not scoring.

### F5 — Dead schema columns and duplicated summary — **Tier 3**

`News.content` and `News.relevance_score` are written by nothing, read by nothing, and null in all 748 live rows. `News.summary` is set to the title at ingest (`summary=payload.title`, 748/748 identical) and then rendered by the frontend as if it were a distinct summary. Not fabrication (it *is* the real title), but the field name over-promises. Candidates for a future schema-cleanup pass; not touched here.

### F6 — Symbol matching is substring-based (`LIKE %symbol%` / `.contains()`) — **Tier 3**

`NewsRepository.list_recent_news` uses `News.symbols.like(f"%{symbol}%")`, and the AI global-context builder (`ai.py:341`) uses `News.symbols.contains(s)`. Live-demonstrated: `GET /news/BTC` returns articles stored under `BTC-USD`. Benign-to-helpful today, but structurally it can cross-match (e.g. `SOL` ↔ `SOL-USD` is fine, but a future `META` vs `METALS.NS`-style pair would cross-contaminate, including into LLM prompt context). Low urgency because `symbols` is currently always a single exact symbol per row; flag for the backlog rather than fix.

### F7 — Minor dead/misleading bits — **Tier 1** (mechanical) / **Tier 3**

- `NewsService.fetch_and_store(symbol, is_crypto=False)` — `is_crypto` is used only in a log line; the sole caller (`tasks.py:312`) never passes it. Tier 1 removal candidate.
- `GET /news` (grouped all-news feed) and `apiService.fetchNews()` have **no frontend callers** — but the client method carries an explicit `// UI pending — news feed` comment, so this is documented WIP, not the presents-as-working pattern. Leave as is.
- `JobConfig.jsx:8` describes `fetch_news` as *"Scrape headlines and run **AI** sentiment analysis"* — sentiment is VADER (lexicon-based), not AI/LLM. Cosmetic label inaccuracy. Tier 3.
- `fetch_news_task` falls back to hardcoded `["AAPL", "TSLA", "RELIANCE.NS"]` when the DB has zero quoted symbols. It fetches *real* news for them, so not fake data — a bootstrap convenience only reachable on an empty universe. Tier 3, arguably fine.

---

## Explicit answers to the audit questions

1. **Data flow** — Yahoo (`yfinance` ticker.news) is the only live source; Finnhub implemented but disabled; Polygon implemented but unregistered for NEWS (F2). Celery `fetch_news_task` every 4h with staleness+crypto-quota rotation; TaskRun shows real SUCCESS runs on schedule.
2. **Sentiment** — correct end to end for every asset class that has articles; the crypto fix's rotation works (live-verified). Remaining gaps are *coverage* (Yahoo-only, F3) and *depth* (title-only VADER, F4), not correctness.
3. **No-fake-data** — **clean.** Empty symbol → `[]`; frontend renders honest states (`unassessed` for null sentiment, `empty` status, `No news available for {sym}` as a labeled empty state, error + retry on failure); AI context says "No news items found." and "Sentiment: N/A" — statements of absence, not fabricated values. The one violation is F1's fabricated success message.
4. **Provider failure handling** — honest in the live path: providers raise `ProviderError`; per-symbol total failure logs + marks the attempt; whole-cycle total failure raises and fails the TaskRun (matches the Monitoring-audit-confirmed pattern). The silent-swallow variants exist only in currently-unreachable code (F2, F3).
5. **Dead/stale code** — F1 (the big one), F2, F5, F7; all caller-verified by grep, none assumed.
6. **AI briefing consumption** — `PortfolioContextBuilder` injects up to 5 real News titles + real sentiment scores (or "N/A") into the LLM prompt; the mock-briefing block containing hardcoded `news_sentiment: 0.6` etc. is gated behind `AUREON_TEST_MOCK_AI=true` (test-only, documented) — **no target_corpus-style leak found.** The only theoretical prompt-contamination vector is F6's substring match, flagged above.

## Recommended next steps (not implemented)

1. **F1 (Tier 2, needs your call):** wire `/analytics/ai/news/batch` to dispatch `fetch_news_task`, or delete endpoint + AdminPanel button + `j-news` mapping.
2. **F7 first bullet (Tier 1):** drop the unused `is_crypto` parameter.
3. **F2/F3/F4/F5/F6 + remaining F7 (Tier 3):** add to `BACKLOG_SWEEP_SCOPE.md` on the next backlog pass.
