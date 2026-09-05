# News Pipeline Audit — 2026-09-03

Scope: Yahoo news, Finnhub company-news, `fetchNews` job, VADER sentiment,
`aggregateAssetSentiment`, `news_assets` linkage. Report only — no fixes.

Auditor note (data was mutated by this audit): to satisfy the "trigger
fetchNews for real" check I POSTed `/config/jobs/fetch_news/run` twice (ports
8010 and 3000 both proxy to the same backend). That wrote **120 new
`news.news` rows** (78 → 198), refreshed `last_news_fetch_at` for ~10 assets,
and **caused** the one FAILED job row discussed below. Every "accumulated
data" figure in this report is the **pre-trigger** state (78 rows / 8 assets)
unless marked otherwise.

---

## 1. Confirmed working (live proof)

| Item | Evidence |
|---|---|
| **Finnhub API key** | `FINNHUB_API_KEY=d96e…` present. Live `getNews("AAPL")` → 20 items; `getNews("BTC-USD")` → 20 items. Phase 9 could not test this (no key then). **Now working.** |
| **Yahoo `getNews` + `filterYahooSearchNews`** | Live `getNews("AAPL")` → 4 items, all genuinely Apple (John Ternus CEO, foldable iPhone ×2, BofA note). The relatedTickers filter is still doing its job for a real current query. |
| **Job executes end-to-end** | Manual trigger → job 1891 SUCCESS in 9.7 s. 120 real articles fetched, VADER `sentiment_score` computed and written on every row, `job_logs` row opened and closed with `ended_at` + `duration_ms`. `news_assets` links created (newest article now 2026-09-03 07:14). |
| **`aggregateAssetSentiment` is wired AND running** | `news.asset_sentiment_snapshots` has 21 rows, `max(snapshot_date) = 2026-09-03`. Called from `generateFeatures.ts:14`, which is chained from `processAssetSnapshot.ts`. See §2 — the "unwired" doc comment is stale. |
| **`aggregateAssetSentiment` math** | Recency half-life + confidence shrink logic reads correctly; snapshots for today exist and are non-null. |
| **No duplicate / orphan rows** | 0 duplicate URLs, 0 `news_assets` rows with a missing `news_id`, 0 with a missing `asset_id`. |
| **Analyst-signals separation holds** | `getAnalystSignals` (yahoo.ts:190) reads `yf.quoteSummary` (`recommendationTrend`, `upgradeDowngradeHistory`, `earningsTrend`, `financialData`) live and does not persist. Zero references to `news.news`, `news_assets`, `sentiment_score`, or `aggregateAssetSentiment`. The two features share only the word "signals" and the Yahoo vendor. No overlap or conflict. |
| **Symbol rotation is fair** | `listQuotedSymbols` orders `ORDER BY a.last_news_fetch_at ASC NULLS FIRST` (crypto quota 4, rest 6), and `markNewsFetchAttempted` stamps `last_news_fetch_at` in a `finally`. Least-recently-fetched first → coverage rotates across the universe given continuous uptime. |
| **Budget headroom** | `0 */4 * * *` → 6 runs/day × ≤10 symbols × 2 providers ≈ 120 provider calls/day (~60 Finnhub, ~60 Yahoo). Loop is sequential `await` per symbol → no burst. Finnhub free tier is 60/**minute**; Yahoo unofficial. Effectively unlimited headroom. |

---

## 2. Degraded / changed since Phase 9

### 2a. `aggregateAssetSentiment` "unwired" comment is now false (stale doc, not a bug)
`sentiment.ts:43-45` still says *"Unwired this phase — Python's only call site is
generate_features … which has no Node port yet."* A later wave ported it:
`generateFeatures.ts` exists, imports `aggregateAssetSentiment`, calls it at
line 14, and `generateFeaturesFor` (features.ts:31-39) reads the resulting
`asset_sentiment_snapshots.avg_sentiment_7d` into `AssetFeatures.sentiment_score`.
The pipeline is live and producing snapshots dated today. The user's concern
("wired without actually porting generate_features") does **not** apply — the
port exists. Only the comment is wrong. Same stale wording in `generateFeatures.ts:7`.

### 2b. `fetchNews.ts` comment claims no schedule exists — also false
`fetchNews.ts:43-44`: *"Manual-trigger entrypoint only this phase — no BullMQ
repeatable schedule is registered anywhere."* Wrong: `registerFetchNewsSchedule`
(`queue.ts:157`, cron `0 */4 * * *`) is called at `scripts/startWorker.ts:61`
and the boot log confirms `news-refresh (0 */4 * * * UTC)` registered.

### 2c. Python parity comparison — no longer relevant
Phase 9 could not diff News against a live Python server. That is now moot:
Python was deleted from the repo on 2026-08-16 (per CLAUDE.md). There is no
Python server anywhere to diff against. The serializer-level parity Phase 9
established by reading code is the ceiling and there is nothing left to close.

---

## 3. Bugs found

### BUG-1 — Finnhub news has zero relevance filtering (mis-attribution at scale)
**Severity: high.** Phase 9's fix (`filterYahooSearchNews`, drops items whose
`relatedTickers` don't include the symbol) was applied to Yahoo only.
`finnhub.getNews` (finnhub.ts:105-136) takes `data.slice(0, 20)` **verbatim** —
whatever `company-news?symbol=X` returns is attributed to X with no check.

Evidenced three independent ways:
- **Live `getNews("AAPL")`** returned *"Warren Buffett's biggest bet has a
  dividend secret"*, *"How many employees does UnitedHealth have in 2026?"*,
  *"US judge rejects bid to break up Google's ad business"* — all tagged AAPL.
- **Live `getNews("BTC-USD")`** company-news returns generic market copy;
  fresh post-trigger rows tagged `TSLA` include *"European Stocks Close Mostly
  Lower in Tuesday Trading; Bonds Rise"* and *"Konko AI Secures $6 Million"*
  (both `source=finnhub`).
- **Accumulated pre-trigger data**: every off-topic headline under `BTC-USD`
  was `source=finnhub` — *"Nvidia Earnings Report To Keep Next Week Busy"*,
  *"Bessent Triggers The Nightmare Scenario For The Bond Market"*, *"What
  Moved Markets This Week"*.

This is the exact risk class Phase 9 flagged for Yahoo ("mis-attributing an
off-topic story into news_assets/sentiment"), still fully open on the Finnhub
side. It pollutes both `news_assets` links and per-asset sentiment aggregates.
Note Finnhub's `company-news` payload has no `relatedTickers` equivalent, so
the Yahoo fix isn't directly portable — needs a different approach (headline
symbol/name match, or accept Finnhub as low-precision).

### BUG-2 — `linkNewsAssets` has an uncaught P2002 race
**Severity: medium** (needs concurrent runs; those are reachable — see below).
`fetchAndStore` guards its `news.create` against the concurrent-writer race
(news.ts:90-96, catches P2002). Its sibling `linkNewsAssets` does the same
check-then-create (`findUnique` → `create`, news.ts:121-126) with **no P2002
catch**. My double-dispatch produced job 1890 FAILED:
`Invalid prisma.news_assets.create() … Unique constraint failed on the fields:
(news_id, asset_id)`. The failing run aborts mid-loop, so a partial cycle is
also a data-completeness issue, not just a noisy log.

**Reachability:** `fetch_news` is **not** in `PROVIDER_REQUIRED_JOBS`
(jobDispatch.ts:59-64), and the job lock is acquired *only* for
provider-required jobs (jobDispatch.ts:107-111). So `fetch_news` has **no
concurrency guard at all** — two manual dispatches, or one manual dispatch
overlapping the 4-hourly cron run, all execute in parallel. Not every-cycle,
but a real user action (double-click "Run", or "Run" during a scheduled fire).

### BUG-3 — entire Indian-equity (`.NS`) universe produces zero news + burns calls
**Severity: low-medium** (coverage gap, known-ish).
- Finnhub `company-news` for `.NS` symbols → **HTTP 403** (free tier), which
  `getNews` converts to a thrown `ProviderError`.
- Yahoo `search("TITAN.NS")` → **0 news items** (and `filterYahooSearchNews`
  would drop them anyway — Yahoo `relatedTickers` use bare `TITAN`, not
  `TITAN.NS`).
- Result: both providers fail → `fetchAndStore` throws → per-symbol failure.
  Job 450 (2026-08-21) FAILED with *"all 10 symbol(s) had total provider
  failure … GAIL.NS, PFC.NS, BEL.NS, DLF.NS, TITAN.NS, HAL.NS"*.
- Each `.NS` symbol in rotation costs 1 wasted Finnhub call (the 403) per
  cycle and contributes to spurious whole-cycle FAILED job logs when the
  10-symbol slate is NSE-heavy. ~6 wasted calls/day per Indian symbol in
  rotation.

### BUG-4 — same article from two providers = two rows
**Severity: low.** Dedup key is `url` only (news.ts:53, unique constraint on
`url`). *"FSS or TSLA: Which Is the Better Value Stock Right Now?"* landed as
id 220 (`source=finnhub`) and id 224 (`source=yahoo`) in the same run —
different vendor URLs for the same story. Double-counts into sentiment.

---

## 4. Still genuinely unverified

### 4a. VADER sentiment quality on financial headlines (not a bug — a fitness question)
Pre-trigger, **38 of 78 rows (49%) scored exactly 0.000**, including headlines
with obvious directional sentiment: *"Bitcoin Explodes Higher…"*, *"Bitcoin
Roars Back — The Next Bull Cycle May Have Begun"*, *"Why Bitcoin's Bottom May
Not Be In Yet"*. VADER's lexicon has no finance register ("explodes", "roars
back", "surge", "headwinds" are neutral/absent to it). Where VADER *does* fire,
the sign is usually plausible (*"…surge boosts Robinhood, Coinbase"* → +0.318;
*"European Stocks Close Mostly Lower"* → −0.572). The code comment claims
numeric parity with Python's `vaderSentiment` — that's a Node-vs-Python port
claim and is credible (same lexicon/algo). **What's unverified is whether
VADER is the right tool at all** for this input; ~half the corpus carries no
signal. Downstream, `aggregateAssetSentiment`'s 2-day / 7-day half-lives mean
today's snapshots are computed almost entirely from >9-day-old articles
(pre-trigger) decayed to near-zero — so `AssetFeatures.sentiment_score` was
effectively inert for the whole downtime window regardless of VADER quality.

### 4b. Scheduled `fetch_news` resuming on cron — not yet observed post-boot
See §5. The 8-day gap is explained (stack was down). The worker re-registered
`news-refresh` at 07:06 today; next scheduled fire is 08:00 UTC. Not verified
firing on its own yet — only the manual dispatch is proven this session.

---

## 5. The 8-day job gap — NOT a news bug

Initial read looked alarming: `fetch_news` last ran 2026-08-26 06:25, and a
delayed BullMQ job dated 2026-09-02 12:00 UTC sits in
`bull:q_scheduled_jobs:delayed` un-promoted. But:

- `docker inspect aureon_backend_worker` → `RestartCount=0`,
  `StartedAt=2026-09-03T07:06:04Z`.
- **Zero `config.job_logs` rows of *any* job_name between 2026-08-26 07:00
  and 2026-09-03 06:00.** Not news-specific — nothing ran.
- Every "recent" job_log (`sweep_stale_job_logs` 07:30, `refresh_prices`
  07:06, `evaluate_watchlist_alerts` 07:07) is post-boot **today**.
  `refresh_mutual_fund_navs` 07:22 and `backfill_mutual_fund_nav_history`
  07:21 (one run ever) are manual dispatches this morning (matches the recent
  MF NAV commits) — cron for those is `0 23 * * *`.
- The delayed job at Sep-2 12:00 is a leftover from a prior short-lived boot
  (its `timestamp` field decodes to 2026-09-02 11:06:52). `sweep-stale-job-logs`
  has an identically-overdue delayed entry and fired fine at 07:30, so an
  overdue delayed entry does **not** freeze the chain.
- The news-refresh job hashes show a clean `processedOn`/`finishedOn` chain
  through 2026-08-24, and job_log 1246 fired at exactly 16:00:00 — the cron
  worked historically.

**Conclusion:** the worker/stack was simply not running for ~8 days. No
scheduler defect, no news-specific fault. `fetch_news` should resume on the
4-hourly cron now that the worker is up (unverified until the 08:00 UTC fire).
One minor loose end: BullMQ's `:delayed` / `:failed` / `repeat:*` sets carry
a lot of stale iteration keys (hundreds for `sweep-stale-job-logs`) —
housekeeping, not correctness.

---

## 6. Priority summary (for triage — no fixes applied)

| # | Issue | Severity | Notes |
|---|---|---|---|
| BUG-1 | Finnhub news: no relevance filter → mis-attribution into `news_assets` + sentiment | High | Yahoo fix never extended to Finnhub; no `relatedTickers` equiv, needs different approach |
| BUG-2 | `linkNewsAssets` uncaught P2002 under concurrent `fetch_news` (no job lock on this job) | Medium | Fix already exists in sibling `fetchAndStore`; job 1890 is a live repro |
| 4a | VADER unfit for ~half of financial headlines (49% score 0.000) | Medium | Fitness question, not a port bug; compounded by half-life decay during downtime |
| BUG-3 | `.NS` universe: 403 from Finnhub + 0 from Yahoo → wasted calls + spurious whole-cycle FAILED logs | Low-Med | Coverage limit |
| BUG-4 | Cross-provider duplicate rows (url-only dedup) | Low | Double-counts into sentiment |
| 2a/2b | Stale "unwired" / "no schedule" doc comments in `sentiment.ts`, `generateFeatures.ts`, `fetchNews.ts` | Low | Doc rot only; behaviour is correct |
| §5 | Stale BullMQ delayed/failed/repeat keys | Low | Housekeeping |
