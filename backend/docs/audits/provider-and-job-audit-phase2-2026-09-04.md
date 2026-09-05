# Provider Integrations & Background Jobs — Phase 2 Deep Integration Audit — 2026-09-04

Follow-up to `provider-and-job-audit-2026-09-03.md` (phase 1). Phase 1 mapped
every provider and job and live-verified most in isolation. This pass targets
three things a single-pass probe structurally could not do, plus phase-1
close-outs. Report only, no fixes. Same DB-proof discipline as phase 1.

---

## Mutation log — every induced change + revert

Baseline at session start (2026-09-04 ~13:00 UTC):
- `config.job_logs` max id = **3002**
- `system.failed_ingestions` count = **705**
- `bunx prisma migrate status` — "Database schema is up to date", 3 migrations, no drift

| # | Change | Target | Revert action | Reverted / verified |
|---|---|---|---|---|
| 1 | `SET ai:cooldown:gemini:<model>` = 1 EX 600, for all 3 GEMINI_MODELS | Redis (circuit-breaker keys) | `DEL` all 3 keys | ✅ `redis KEYS ai:cooldown:*` → empty; `GET /analytics/ai/single/MSFT` returned a fresh gemini take afterward |
| 2 | `FINNHUB_API_KEY=deliberately_bad_key_phase2_audit` | `docker compose exec -e` — **process-scoped env of one throwaway `bun` process only**, never written to `.env`, `provider_configs`, or the running backend/worker | process exited (code 0) | ✅ container's real env unaffected; live backend never saw the override |
| 3 | `SET provider_cooldown:coingecko` = 1 EX 120 | Redis | `DEL` (inside the same scratch script) | ✅ script printed `exists: 0`; `redis KEYS provider_cooldown:*` → empty |

Normal job runs triggered by this audit (expected mutations, not induced failures —
same discipline as phase 1's auditor note): `refresh_prices` ×3, `refresh_fundamentals`
×2 (concurrent), `sync_binance` ×1 (+1 rejected), `weekly_briefing` ×1,
`monthly_briefing` ×1, `backfill_binance_spot` ×2 (both FAILED — see BUG-Q),
`market/symbols/RELIANCE.NS/backfill` ×1, plus the `ingestQuote` /
`evaluate_watchlist_alerts` cascades those enqueue, and 4 scratch `ingestQuote`
calls (AAPL ×1, BTC-USD ×1, AAVE-USD ×1 no-op). End state: `job_logs` max id
3002 → **3119**; `failed_ingestions` 705 → **730**. `prisma migrate status` still
clean, no drift. Scratch file `backend/scratch_probe_phase2.ts` removed.

---

## Pre-flight code facts (settled by reading, before any induced failure)

### The single-flight lock is NOT generic — it is `fetch_news` + broker-jobs only
- `src/lib/jobs/wrapJobExecution.ts` has **no lock** — only the
  reset-in-progress guard, JobLog lifecycle, and `markJobRan`. Every scheduled
  job goes through this and gets **no** concurrency protection from it.
- The only true in-body single-flight lock is `src/jobs/fetchNews.ts`
  (`LOCK_KEY = "job_lock:fetch_news"`, `SET NX EX`, ~9 ms skip on contention).
- `src/lib/settings/jobDispatch.ts` has a second lock primitive
  (`tryAcquireJobLock`, key `job_lock:<jobName>`) but `dispatchWithRunner`
  **only calls it for `PROVIDER_REQUIRED_JOBS`** = `sync_zerodha`, `sync_binance`,
  `sync_groww`, `backfill_binance_spot`. All other manually-dispatched jobs
  (`refresh_prices`, `refresh_fundamentals`, `refresh_mutual_fund_navs`,
  `validate_data_quality`, briefings, seeds, `admin_*`) acquire **no lock**.
- **Consequence for §2:** for everything except `fetch_news` and the 4 broker
  jobs, concurrency testing is "observe the race", not "confirm the skip" —
  there is no skip path.

### Quote fallback chain (`src/jobs/ingestQuote.ts` + `routing.ts`)
- `ingestQuote(providerName, symbol)` — primary is passed in by the enqueuer
  (`refreshPrices.ts:37` `quotesQueue.add("ingestQuote", {providerName, symbol})`,
  **no `jobId`** → BullMQ does not deduplicate).
- `buildCandidateNames` = `[primary, ...QUOTE_FALLBACK_CANDIDATES[primary]]`
  minus two strips: `coingecko`→`yahoo` removed when `!yahooCanServeCryptoSymbol`;
  `finnhub` removed for `isNonUsExchangeSymbol`.
- `QUOTE_FALLBACK_CANDIDATES`: `yahoo→[finnhub,polygon]`, `nse_direct→[yahoo]`,
  `finnhub→[twelvedata,alphavantage,yahoo]`, `coingecko→[yahoo]`.
  `binance_price` has **no key** → chain is `[binance_price]` only.
- Fallback triggers **only on `ProviderError`** (`ingestQuote.ts:111`). Any other
  throw aborts the whole chain and is not attributed to a provider fallback.
- Provenance: `usedProvider = quote.provider` (what actually served), then
  `saveQuote(usedProvider, quote)` → `upsertQuote` writes `provider` = that value.
- `finnhub.resolvedKey()` reads `process.env.FINNHUB_API_KEY` **per call**
  (finnhub.ts:8-9) → a `-e` env override on a scratch process genuinely
  exercises the failure path.
- `backend/.env` key names: `FINNHUB_API_KEY` ✅ (correct), but
  `TWELVE_DATA_API_KEY` / `ALPHA_VANTAGE_API_KEY` (underscores) vs the adapters'
  `TWELVEDATA_API_KEY` / `ALPHAVANTAGE_API_KEY` → **BUG-A still live.**
  `COIN_GECKO_API_KEY` present, still never read. No `GEMINI_API_KEY` /
  `GROQ_API_KEY` in `.env` — both are DB-side (`config.provider_configs`).

### AI fallback chain (`src/lib/ai/aiService.ts` + `circuitBreaker.ts`)
- Chain: `["gemini", GEMINI_MODELS], ["groq", GROQ_MODELS]`.
  `GEMINI_MODELS = [gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.6-flash]`
  (**3**, not the 4 phase 1 stated). `GROQ_MODELS = [llama-3.3-70b-versatile,
  llama-3.1-8b-instant]`.
- Circuit-breaker key: `ai:cooldown:gemini:<model>` (namespace `ai`, value `"1"`, `EX`).
- A cooled-down model is a **fast `continue`** (`aiService.ts:330`) — no network
  attempt — so forcing groq via cooldown keys carries no BUG-B (11-min hang) risk
  on the Gemini side.
- `ai_generations.provider` / `.model` record the model that actually answered;
  `ai_briefings.model_used = genLog.model`.
- On total exhaustion, `executeCompletion` throws `ProviderError` at line 352-356
  **before** the `ai_generations.create` at line 363 → **no row is written** when
  every model fails.

---

## Section 1 — Forced-failure fallback verification

### 1a. AI chain `gemini → groq` — **FORCED. New BUG-P: groq tier is dead.**

- **Induced:** `SET ai:cooldown:gemini:<model>` for all 3 Gemini models (mutation
  #1), then `GET /api/v1/analytics/ai/single/AAPL`.
- **Observed:** HTTP 200 in ~0.5 s with body:
  `{"detail":"All models exhausted. Trace: {\"groq:llama-3.3-70b-versatile\":\"Groq
  request failed: 401 {\\\"error\\\":{\\\"message\\\":\\\"Invalid API Key\\\",...}}\",
  \"groq:llama-3.1-8b-instant\":\"...401 Invalid API Key...\"}}"}`.
- **`config.provider_configs` groq row:** `status=ACTIVE, enabled=true`,
  `encrypted_keys.api_key` present. So Settings UI / `GET /health` (which checks
  `["gemini","groq"]` key *presence*) report groq healthy. The decrypted key is
  **rejected by Groq with HTTP 401** on every model.
- **DB proof:** no new `ai.ai_generations` row was written (exhaustion path throws
  before the insert). This is the first-ever *live* groq invocation — phase 1
  could only confirm key presence.
- **Impact:** the AI fallback chain has **zero working fallback tier.** From the
  code (`aiService.ts:326-350`): both a `RateLimitError` (429 → 60 s cooldown
  tripped) *and* any other Gemini failure (logged, no cooldown) fall through to
  the next model, then to the groq loop. So whatever the Gemini failure mode —
  429 storm, endpoint down, BUG-B hang across all 3 models — the chain reaches
  groq and groq 401s. My test forced the 429/cooldown path specifically; the
  non-429 path reaches groq by the same loop structure. Result either way: every
  AI route and all 3 briefing jobs get a hard `ProviderError`, no degraded mode.
- **Revert:** `DEL` the 3 keys; `GET /analytics/ai/single/MSFT` then returned a
  fresh gemini take (`model` in `ai_generations` = gemini). ✅

### 1b. Quote chain `finnhub → twelvedata → alphavantage → yahoo` — **FORCED. BUG-A now directly observed.**

- **Induced:** scratch script inside the container with
  `-e FINNHUB_API_KEY=deliberately_bad_key_phase2_audit` (mutation #2), calling
  `ingestQuote("finnhub", "AAPL")` directly.
- **Observed (script output):**
  - `AAPL before`: `provider: "finnhub"`, updated `2026-09-04T05:24:35Z` (proves
    finnhub normally serves this symbol — valid A/B baseline).
  - `ingestQuote returned: true`
  - `AAPL after`: `provider: "yahoo"`, updated `2026-09-04T13:01:56Z`, price 328.21.
- **Chain that actually ran:** finnhub → HTTP 401 (`ProviderError`) → **twelvedata
  `ConfigurationError` "key not configured"** (dead, BUG-A) → **alphavantage
  `ConfigurationError`** (dead, BUG-A) → **yahoo served**. `latest_quotes.provider`
  recorded the real server (`yahoo`), not the requested `finnhub`. Provenance
  correct.
- **Settles BUG-A's production symptom question:** YES, it is observable — the
  `finnhub` chain is really **2 tiers (finnhub, yahoo)**, not 4. When finnhub
  fails, the two "resilience" tiers in between are silently no-ops and the request
  lands on the terminal yahoo fallback. No data lost (yahoo works), but the
  designed depth is absent. **Upgrade BUG-A: inferred → directly observed.**
- Note: the scratch process itself took several minutes of wall-clock, but the
  DB write timestamp (13:01:56) and `exit code 0` show the chain completed
  quickly; the tail time was the imported BullMQ `watchlistAlertsQueue` holding
  the event loop open after the work finished — a test-harness artifact, not a
  production latency.
- **Revert:** none needed — the bad key lived only in one throwaway process's env.
  Container `printenv` / real adapter unaffected. ✅

### 1c. Quote chain `coingecko → yahoo` (curated symbol) — **FORCED. Fallthrough works.**

- **Induced:** `SET provider_cooldown:coingecko` (mutation #3), then
  `ingestQuote("coingecko", "BTC-USD")`.
- **Observed:** `BTC-USD before` provider `yahoo` price 79388.17 → `after` provider
  `yahoo` price **79409.03**, updated `2026-09-04T13:05:06Z`. coingecko threw
  `ProviderError` ("cooling down after a real 429"), yahoo served (BTC-USD is
  curated → `yahooCanServeCryptoSymbol` true → yahoo NOT stripped). Fresh price +
  timestamp prove the fallthrough executed this cycle; provenance = `yahoo`.
- **Revert:** `DEL provider_cooldown:coingecko` inside the script; `exists: 0`
  confirmed. ✅

### 1d. Quote chain `coingecko` (non-curated `X-USD`) — **BUG-O directly observed + fresh production corroboration.**

- **No induction needed** — this is the standing broken state.
  `ingestQuote("coingecko", "AAVE-USD")` → threw
  `"coingecko: no curated CoinGecko id mapping for symbol AAVE-USD"`. **No
  fallback attempted** (yahoo stripped for non-curated), **no `latest_quotes`
  row written** (before & after both `null`), one `failed_ingestions` row added.
- **Production corroboration:** every `system.failed_ingestions` row written
  since session start (25 rows, 8 distinct symbols) is `provider='coingecko'`
  for a non-curated `X-USD` symbol — `AAVE-USD, BNSOL-USD, CRV-USD, RENDER-USD,
  ROSE-USD, S-USD, SKY-USD, SXT-USD` — each failing ~3× in the window (the 13:00
  `refresh_prices` cycle plus this audit's triggers), newest `13:06:28`. This is
  exactly the symbol set phase 1 named, still failing every cycle with live
  production traffic. Nothing else is failing ingestion.
- `AAVE-USD` and the rest have literally no working quote provider. **Upgrade
  BUG-O: inferred → directly observed.**

### 1e. Chains NOT force-tested — and why

| Chain | Why not forced |
|---|---|
| `nse_direct → yahoo` | nse_direct has **no per-call credential** to safely break (cookie handshake, no key). Forcing it would require network interception or touching shared state, both out of scope. Phase-1 historical evidence stands: 70 `.NS` rows carry `provider='yahoo'` from the Aug-26 refresh, proving the fallthrough has served real traffic. |
| `yahoo → finnhub → polygon` | yahoo has no credential to break; and tier 3 (polygon) is already known-dead (HTTP 401, BUG-I), so even a successful yahoo-failure test would only reach a dead provider. The middle tier (finnhub) is live and was exercised in reverse by test 1b. |
| `binance_price` | single-tier chain (no fallback key) — nothing to fall through to. |

---

## Section 2 — Concurrency / race safety

### 2a. `sync_binance` ×2 concurrent — **lock works.**

- Two `POST /config/jobs/sync_binance/run` fired in parallel.
- Result: one `{"status":"triggered", task_id:...}` **[200]**, one
  `{"detail":"Job 'sync_binance' is already running — rejected duplicate
  dispatch"}` **[409]**.
- `tryAcquireJobLock` (`SET NX EX`, TTL 600 s) in `dispatchWithRunner` correctly
  rejects the second dispatch before it starts. Confirms the phase-1
  `fetch_news` single-flight behaviour generalises to the 4 broker jobs — and
  **only** those.

### 2b. `refresh_fundamentals` ×2 concurrent — **no lock, both run fully, no corruption.**

- Two `POST /config/jobs/refresh_fundamentals/run` in parallel → **both [200]**.
- `config.job_logs`: rows **3069 and 3070**, both `SUCCESS`, timestamps fully
  overlapping (both `started_at ≈ 13:06:11.58`, both `ended_at ≈ 13:06:18.6-18.8`).
  Two complete concurrent executions of the same 21-asset upsert loop.
- `market.asset_fundamentals` after: still **21 rows, 21 distinct `asset_id`**,
  all `updated_at = 13:06:18` → no duplicate rows (upsert keyed on the
  `asset_id` unique index), no visible partial write, last-write-wins per row.
- **Cost of the race:** 2× the yahoo/finnhub API calls for every equity, 2×
  the `Asset.metadata` writes, 2 `job_logs` rows. No data corruption, but
  wasted external quota and a misleading double entry in Job History.

### 2c. `refresh_prices` / `ingestQuote` double-enqueue — **race is real, outcome is safe.**

- `refresh_prices` has no lock (code + a bare `POST …/run` [200] confirm). Two
  overlapping runs (cron + manual, or two manuals) each enqueue **one
  `ingestQuote` job per symbol with no `jobId`** → BullMQ runs both.
- Same symbol from `refresh_prices` **and** `refresh_tracked_universe` in an
  overlapping window → two `ingestQuote` runs for that symbol, racing
  `upsertQuote`.
- `upsertQuote` = Prisma `upsert` on the `symbol` unique index
  (`pk_latest_quotes`). For an **existing** symbol (the normal case) both racers
  take the UPDATE branch → last-write-wins, no error, no dup. For a **brand-new**
  symbol both could take CREATE → the loser can hit a P2002 unique violation →
  that one `ingestQuote` fails and writes a `failed_ingestions` row (honest, not
  corrupting). `getOrCreateAsset` / `getOrCreateProvider` inside the same `$transaction`
  have the same new-row race window.
- `recordPriceHistory` uses a deterministic `uuidv5(symbol-date)` id +
  `skipDuplicates` → fully idempotent under concurrency.
- **Net:** no corruption or partial write; the exposure is duplicated provider
  calls, doubled `provider_usage` rows (a write-only table, see §3), and a
  possible transient P2002 for genuinely new symbols.

### 2d. `evaluate_watchlist_alerts`

- No lock. Enqueued once per symbol per quote write. Only writes
  `notification.*` on a *fired* alert (rare); always writes a `job_logs` row.
  Concurrent runs for the same symbol are idempotent on the alert side; the
  only "race" symptom is more of the BUG-M `job_logs` flood.

### 2e. `refresh_mutual_fund_navs`, `sync_groww` — not separately re-tested

- `refresh_mutual_fund_navs`: no lock; wraps its writes in one `$transaction`
  (phase-1 BUG note) so a concurrent double-run is two serialized transactions,
  last-write-wins on the ISIN-matched rows (currently 0 matched — job fails
  before writing). `sync_groww` / `sync_zerodha`: same broker-lock path as 2a
  (would 409), but both are auth/disabled-blocked so not fired.

### 2f. Lock-uniformity conclusion

`wrapJobExecution`'s lock behaviour is **not** applied uniformly — it applies
*no* lock. Single-flight exists in exactly two places: the `fetch_news` job body,
and `dispatchWithRunner` for the 4 `PROVIDER_REQUIRED_JOBS`. Every other job can
be double-dispatched into a full concurrent re-run. No such re-run was found to
corrupt data (every write path is upsert-keyed or idempotent-by-id), but several
double external-API load and duplicate Job-History rows.

---

## Section 3 — Full consumer mapping per integration

Four read-only sub-audits (one per data domain). Full consumer tables are long;
the load-bearing findings:

### 3a. `latest_quotes` / `price_history` readers

- **~30 read sites** across portfolio pricing (`lib/prices.ts`, `lib/assets.ts`,
  `lib/snapshot.ts`), market routes (`lib/market/*.ts`, `chart.ts`, `sectors.ts`,
  `themes.ts`), the evaluation chain (`lib/evaluation/snapshot.ts` reads
  `price` **and `volume`**), watchlist, monitoring, AI context
  (`contextBuilder.ts:189+`, `intelligence.ts` historical reconstruction),
  recommendations, and `aiService.getSingleAssetTake`.
- **Schema note:** `LatestQuote` / `PriceHistory` have **no `currency` and no
  `source` column** — so no consumer can read currency/source provenance off a
  quote row. Currency is always re-derived (`inferCurrency` / `inferExchangeRegion`).
- **FINDING — `volume` null-gap (minor, graceful).** `chart.ts:41` exposes
  `volume` to the frontend chart and `evaluation/snapshot.ts:35` copies
  `quote.volume` into a fresh `price_history` row. finnhub `getQuote` returns
  `volume: null` (Finnhub `/quote` has no volume field). So any finnhub-served
  US-equity row → blank chart volume series + null `price_history.volume`. No
  consumer does arithmetic on `.volume` (all null-check) → no crash, silent
  coverage hole. Same class as BUG-K (consumer expects a field the provider
  doesn't feed) but benign.
- **FINDING — `provider` provenance has zero routing consumers.** No reader does
  `quote.provider === …` or filters/groups by it. `assetHealth.ts:119`
  *deliberately* hardcodes `provider_name = "default"` instead of reading it.
  → **BUG-H (mfapi/AMFI mislabel) has no functional downstream impact today.**
- **FINDING — `validateDataQuality` stale-quote check** (`:23`, >3-day cutoff)
  is provider/asset-class-blind → AMFI/mfapi NAV rows go "stale" over weekends
  and long holidays and generate false-positive audit noise.

### 3b. `asset_fundamentals` / snapshot / features / signals readers

- Readers: `lib/marketProviders/fundamentals.ts` (`GET …/fundamentals`),
  `lib/ai/fundamentalsScoring.ts` + `evaluation/scoring.ts` (quality/valuation
  scores, equities only), `assetHealth.ts` (only `updatedAt`),
  `lib/market/market.ts` (`GET …/snapshot`, `…/features`),
  `lib/market/assets.ts` (`getSignal` RSI-only; `getTechnicalsFromHistory`
  computes from `price_history`), `recommendation.ts` (held-only),
  `contextBuilder.ts`, `aiService.getSingleAssetTake`.
- **FINDING — no consumer reads `asset_fundamentals.source`.** `fundamentals.ts`
  derives `data_source` from row *existence*, not the column. → **BUG-H
  confirmed inert / downgrade to provenance-debuggability only.** (The
  on-demand `lib/marketProviders/fundamentals.ts:71-87` merge path *does* write
  a correct compound `"yahoo+finnhub"`; only the daily `refreshFundamentals.ts`
  job hardcodes `"yahoo"`.)
- **FINDING — column-coverage gap between the two fundamentals providers.**
  `yahoo.getFundamentals` does **not** return `eps, current_ratio, quick_ratio,
  gross_margin, operating_margin, high_52w, low_52w`; `finnhub.getFundamentals`
  does. So on the **yahoo primary path those 7 `asset_fundamentals` columns are
  written null**, and `GET …/fundamentals` returns null for eps/ratios/52w
  whenever yahoo succeeded (the normal case). `fundamentalsScoring` doesn't read
  them → no score impact, but the API surface is inconsistent by provider.
- **FINDING — `asset_fundamentals.market_cap` is never written by the daily
  job** — absent from both the create and update field lists in
  `refreshFundamentals.ts` though both providers return it. Masked at read time
  by a `snap.marketCap` fallback in `fundamentals.ts:152`.
- **CHECKED, NOT A BUG — dividend-yield units.** Live
  `finnhub.getFundamentals("AAPL")` returns `dividend_yield: 0.50534` — i.e.
  Finnhub's `dividendYieldIndicatedAnnual` is **already in percent** (AAPL's
  real yield ≈ 0.5 %), which matches the `asset_fundamentals.dividend_yield`
  column's percent convention that `yahoo.ts:96` also writes to
  (`summaryDetail.dividendYield * 100`). `fundamentals.ts:161` (`/100`) and
  `fundamentalsScoring.ts:73` (raw column value) are therefore consistent
  across both providers. The "passed through raw while siblings get `/100`"
  code asymmetry is real but harmless — Finnhub's raw value is in the units the
  column expects.
- **FINDING — BUG-K confirmed and larger than phase 1 framed it:**
  - `contextBuilder.ts` **never queries `asset_fundamentals` at all.**
    `buildGlobalContext` and `buildQaContext` inject only `assetSnapshot.rsi`,
    `payload.macd`, `assetScore.valuation/qualityScore`,
    `asset_features.volatility_score`. PE, P/B, ROE, margins, EPS, beta, 52-week
    range, debt/equity, dividend yield — **all populated in `asset_fundamentals`,
    all omitted from every AI prompt.**
  - `asset_snapshot.pe_ratio` is written **`null` by every path** —
    `processAssetSnapshot` (`evaluation/snapshot.ts:50`) sets `peRatio: null` on
    create and has no update that sets it; `assets.ts` asset-ensure sets it
    null. PE only ever lives in `asset_fundamentals`.
  - `getSingleAssetTake` (`aiService.ts:563`) and `GET …/snapshot`
    (`market.ts:25`) read PE off `snap.peRatio` → **always "N/A"/null for every
    symbol.** RSI in `getSingleAssetTake` is also always "N/A" for non-held
    symbols (the evaluation chain that populates `snapshot.rsi` runs only behind
    `if (isSymbolHeld(symbol))` at `ingestQuote.ts:137`).
  - A snapshot-free technicals source already exists
    (`getTechnicalsFromHistory`, computes RSI/MACD from `price_history`) and no
    AI path uses it.
  - → the phase-1 observation ("model says PE/RSI unavailable for AAPL while
    data exists") is **structural**, not a stale-cache fluke: the AI context
    builders query the wrong tables.

### 3c. `ai_briefings` / `ai_generations` / `news` readers

- Readers: `getBriefingHistory` + `contextBuilder.buildIntelligenceContext`
  (feeds last-3 briefing "vibes" back into every prompt) + `intelligence.ts`
  dashboard + `routes/portfolio/backup.ts` (full export) + frontend
  `AIBriefings.jsx`. News: `lib/news/news.ts` serializers, `sentiment.ts`
  aggregation, `contextBuilder.buildGlobalContext`, `evaluation/features.ts`.
- **FINDING — no provider-assumption bug (category clean).** Nothing hardcodes
  `"gemini"`, filters on `provider`, or applies per-model pricing.
  `getUsageSummary` groups by `(provider, model)` generically;
  `AIBriefings.jsx` and backup treat `model_used` as an opaque string. A row
  that says `"groq"` flows through unchanged. (Moot today given BUG-P, but the
  read side is ready for it.)
- **FINDING — crypto recommendations are coupled to news coverage.**
  `recommendation.ts:112` makes `features.sentiment_score` a **required** factor
  for crypto (returns null → writes nothing if it's null). Finnhub news returns
  `[]` for all crypto by design; if yahoo also yields nothing →
  `aggregateAssetSentiment` returns null → no `asset_sentiment_snapshots` row →
  `sentiment_score = null` → **the crypto asset never materialises a
  recommendation.** The equity path tolerates null sentiment
  (`scoring.ts:77-78` renormalises weights); the crypto path does not.
- **FINDING — `buildGlobalContext` news match is substring, not exact**
  (`contextBuilder.ts:197` `symbols: { contains: s }`) → a short ticker like
  `BTC` can pull unrelated rows' headlines into the prompt.
- **FINDING — `getBriefingHistory` hardcodes `briefing_type: "global"`**
  (`aiService.ts:547`) → the weekly/monthly briefings this audit just generated
  are written but **never surface** in `GET /analytics/ai/briefings` or the
  frontend history list.
- **FINDING — `buildQaContext` reads no news/sentiment** — only
  `asset_features.volatility_score`.

### 3d. Broker / provider-health / job-log readers

- **BUG-C confirmed — key source per provider:**
  - DB (`getDecryptedKey` / `resolveProviderCredentials`): gemini, groq,
    zerodha, binance, groww.
  - `process.env` **only**, never `getDecryptedKey`: finnhub (`finnhub.ts:9`),
    twelvedata (`twelvedata.ts:17`), alphavantage (`alphavantage.ts:27`),
    polygon (`polygon.ts:12`).
  - So `setProviderKey` writes to `provider_configs.encrypted_keys` for
    finnhub/twelvedata/alphavantage/polygon are **inert** — and
    `providerHealth.ts:56-59`'s health-check for those calls the same env-only
    adapter, so even the "test key" button ignores the stored value.
- **BUG-D confirmed — one generic iterator surfaces the orphans.**
  `getAllProviders()` (`lib/settings/providers.ts:94`, unfiltered `findMany`) →
  `GET /api/v1/settings/providers` renders **every** row including
  `finnHub` / `alphaVantage` / `twelveData` / `twelve_data` with editable key
  fields. `seedDefaultProviders` only knows the lowercase names, so it neither
  creates nor cleans them, and its PLANNED→ACTIVE promotion skips them. Nothing
  *acts* on the orphans, but the Settings UI is a silent-credential-loss trap.
- **FINDING — `provider_configs.status` is never reconciled against adapter
  reachability.** Four code paths gate on the identical rule
  (`enabled && status ∉ {PLANNED, DISABLED}`): `ingestQuote.ts:64`,
  `news.ts:26`, `jobDispatch.ts:118`, `runBrokerSync.ts:27`. They agree with
  each other but **not with reality** — `isProviderAvailable("twelvedata")`
  returns `true` (row ACTIVE), so `ingestQuote` keeps twelvedata in the chain,
  then the adapter throws `ConfigurationError` on the missing env var. This is
  exactly what §1b observed: two wasted candidate slots per finnhub-chain
  failure.
- **FINDING — `system.providers.health_status` and `isProviderAvailable` are
  fully disjoint.** `Provider.healthStatus` ("degraded" etc.) is written by
  `ingestionRepo` after every quote attempt and read **only** by monitoring
  endpoints. **No routing/availability decision reads it** — so polygon's
  `health_status='degraded'` (BUG-I) does not remove polygon from the yahoo
  fallback chain. Only a `provider_configs` status flip would.
- **FINDING — `system.provider_usage` is a write-only table.**
  `ingestionRepo.ts:35` inserts one row per quote; **no endpoint, job, or lib
  ever reads it**, and there is no sweep (unlike `job_logs`). Unbounded growth.
  Phase 1's "24 h usage" numbers came from direct SQL, not app code.
- **FINDING — `checkScheduledJobsHealth`** (`scheduleHealth.ts:38`) drives the
  top-level `GET /health` status off `job_logs` SUCCESS-recency for 10 named
  jobs → one stale/failing cron flips the whole service to "degraded".

---

## Close-outs from phase-1 blockers

### `weekly_briefing` / `monthly_briefing` — **NO LONGER BLOCKED.**

Both **are** manually dispatchable — they are in `JOB_RUNNERS`
(`jobDispatch.ts:46-47`), so `POST /config/jobs/weekly_briefing/run` and
`POST /config/jobs/monthly_briefing/run` work without waiting for the cron.
Fired both live:
- `weekly_briefing` → `job_logs` 3117 `SUCCESS` 9.35 s; new `ai.ai_briefings`
  row `briefing_type='weekly'`, `model_used='gemini-3.1-flash-lite'`, `created_at
  2026-09-04 13:07:05`.
- `monthly_briefing` → `job_logs` 3119 `SUCCESS` 19.85 s; new `ai_briefings` row
  `briefing_type='monthly'`, `model_used='gemini-3.1-flash-lite'`, `created_at
  2026-09-04 13:08:48`.

Both exercise the same `generateBriefing → executeCompletion → Gemini` path as
`daily_briefing`. They inherit Gemini B-1/B-2 (no wall-clock ceiling, key in
logs) and now BUG-P (no working fallback). Phase-1's "not exercised" is closed.
(Note §3c: these rows will not appear in the briefings history UI —
`getBriefingHistory` filters to `'global'` only.)

### `backfill_binance_spot` — **RAN FOR REAL. New BUG-Q.**

Route: `POST /api/v1/portfolio/portfolios/:id/sync/binance/backfill` (the
double `/portfolio/portfolios` is a real mount quirk). Triggered twice against
portfolio `bb887e2d-…`:
- Both dispatches accepted; both jobs **FAILED** — `job_logs` 3118
  `error_message = "Binance HTTP 400"`, duration 1.7 s.
- `GET …/backfill/status` shows the job **walked 84 of 85 symbols
  successfully** (`symbols_done: 84`, `trades_fetched: 30`, `trades_imported:
  0`), then died on symbol #85 — an entry literally named **`"dividend"`**
  (`{"symbol":"dividend","done":false,...}`). `client.getSpotTradesPage("dividend",
  …)` → Binance HTTP 400 (not a tradeable pair) → the whole job hard-fails.
- **Root cause (traced):** `backfillBinanceSpot` (`brokerSync.ts:833-839`) seeds
  its symbol universe from every existing `spot:*` `brokerReference` by
  `split(":")[1]`. But the broker-dividend import path writes references shaped
  `spot:dividend:<tranId>` (`brokerSync.ts:671`) — and `broker_dust` similarly
  (`spot:dust:…`). So `parts[1]` yields the *event type* `"dividend"`, not a
  trading pair, and `getBackfillSymbolUniverse` adds it to `candidates` with **no
  validation** (`brokerSync.ts:945` `for (const s of extraSymbols) candidates.add(s)`).
- **BUG-Q (MEDIUM, recurring false failure — same class as BUG-F):** the
  resume-optimisation symbol extraction misreads `spot:dividend:` /
  `spot:dust:` event references as trading pairs, injecting `"dividend"` (and
  potentially `"dust"`) into the pair list → guaranteed Binance HTTP 400 → the
  whole job goes **FAILED every run**, regardless of how much real work
  succeeded. `trades_imported: 0` throughout (the account's ~30 visible spot
  trades were already imported by prior syncs / dedup, and/or the 400 aborted
  before an import flush).
- Historical `job_logs` 130 shows a *different* earlier failure mode
  (`prisma.binance_backfill_progress.update()` on a missing record in
  `brokerSync.ts:490`) — a second fragility in the same job, not reproduced this
  session.
- Binance broker credentials themselves are valid (phase-1 `sync_binance` PASS,
  and the 84 symbol pages fetched fine here).

### `admin_reprocess_all` / `admin_repair` — **code-traced + scoped dry-run.**

- **No scoping payload exists.** `adminReprocessAllAssetsTask` /
  `adminRepairJobsTask` take only an optional `logId` — no asset filter.
  `reprocessAllAssets()` (`adminMaintenance.ts:52`) hardcodes a `findMany` over
  **every distinct `latest_quotes.assetId`**; `repairJobs()` scans **every
  `asset_snapshot` row** for a missing `asset_features` / `asset_score(v1.0.0)`.
  Both then call `fanOutGenerateFeatures` (batches of 10, `Promise.allSettled`
  per batch, awaited).
- Neither has a `job_configs` row or a cron entry; the only Node entrypoints are
  `scripts/triggerAdminReprocessAllAssets.ts` / `…RepairJobs.ts` and a raw
  `dispatchJob("admin_reprocess_all")` call (no such caller in the repo).
- **The scoped equivalent** is `adminBackfillAssets([assetId])` (same
  `fanOutGenerateFeatures` core), reachable via
  `POST /api/v1/market/symbols/:symbol/backfill`. Exercised live on
  `RELIANCE.NS` → `{"status":"queued","symbol":"RELIANCE.NS","task_id":null}`;
  DB after: `market.asset_snapshot` for RELIANCE.NS `updated_at 13:06:34`,
  `rsi 47.15`; `market.asset_features` `updated_at 13:06:56`. So the per-asset
  fan-out that `admin_reprocess_all` would run 500+ times is confirmed working;
  a full run would refresh features/signals/scores/health for every asset with
  a quote, 10 at a time, and (per phase-1) would be a large unsolicited
  mutation — still not run at full scale.

### `groq` — closed (see §1a / BUG-P). `zerodha`, `groww` — unchanged (still auth/disabled-blocked, not re-attempted).

---

## Wrap-up

### (a) Phase-1 findings this pass reclassified

| Bug | Phase-1 status | Phase-2 status |
|---|---|---|
| **BUG-A** (dead twelvedata/alphavantage → reduced fallback depth) | inferred; "production symptom not currently observable" | **directly observed** — forced finnhub failure fell straight through both dead tiers to yahoo; the `finnhub` chain is really 2-tier |
| **BUG-O** (non-curated `X-USD` coins have no quote provider) | inferred from `failed_ingestions` | **directly observed** — `ingestQuote("coingecko","AAVE-USD")` throws, no fallback, no row written |
| **BUG-K** (AI context under-fed) | "found by accident in one probe" | **confirmed structural** — `contextBuilder` never queries `asset_fundamentals`; `asset_snapshot.pe_ratio` is null on every write path; `getSingleAssetTake` reads the wrong column → PE/RSI always "N/A" |
| **BUG-C** (adapters ignore DB keys) | inferred from code | **confirmed** — env-only for finnhub/twelvedata/alphavantage/polygon; even the health-check button ignores stored keys |
| **BUG-D** (orphan camelCase provider rows) | inferred from code | **confirmed** — `getAllProviders()` unfiltered `findMany` surfaces them in the Settings UI with live key-entry fields |
| **BUG-H** (provenance mislabels) | "LOW-MED, wrong if anything keys off provenance" | **downgraded** — three consumer sub-audits found *zero* readers of quote `provider` or fundamentals `source` for any decision; `assetHealth` hardcodes `"default"`. Cosmetic/debuggability only, today |
| **BUG-I** (polygon 401) | dead fallback | **still dead**; additionally confirmed `system.providers.health_status='degraded'` does **not** remove it from the yahoo chain (health signal is monitoring-only) |
| **groq** blocker | "BLOCKED (soft) — key present, live call not observed" | **failed, not blocked** → new **BUG-P** |

### (b) New bugs found under forced-failure / concurrency / consumer-mapping

| # | Severity | Class | Bug |
|---|---|---|---|
| **P** | **HIGH** | dead fallback / silent-healthy | `groq` AI fallback tier returns **HTTP 401 "Invalid API Key"** on both models (forced live via circuit-breaker cooldown). `provider_configs.groq` is ACTIVE + has a stored key, so Settings/`/health` show it healthy. The AI chain has **no working fallback** — any full Gemini outage/cooldown → hard `ProviderError` on every AI route + all 3 briefing jobs, no degraded mode. |
| **Q** | **MEDIUM** | recurring false failure | `backfill_binance_spot`'s symbol-universe seeding (`brokerSync.ts:833` `brokerReference.split(":")[1]`) misreads `spot:dividend:<id>` / `spot:dust:<id>` **event-type** references as trading pairs and adds `"dividend"` (and potentially `"dust"`) to the pair list unvalidated → `getSpotTradesPage("dividend")` → Binance HTTP 400 → the whole job goes **FAILED every run** even after 84/85 real symbols processed cleanly. (Plus a second historical failure mode: `binance_backfill_progress.update()` on a missing record, `brokerSync.ts:490`.) |
| **R** | **LOW** | no concurrency guard | Only `fetch_news` and the 4 broker jobs have single-flight protection. `refresh_fundamentals` ×2 concurrent was observed running two full overlapping executions (`job_logs` 3069+3070, both SUCCESS) → 2× external API calls + duplicate Job-History rows. No data corruption (all quote/fundamentals/history writes are upsert-keyed or idempotent-by-id), but wasted quota and misleading history. `refresh_prices`/`ingestQuote` double-enqueue can additionally throw a transient P2002 for genuinely-new symbols. |
| **S** | **LOW** | unbounded write-only table | `system.provider_usage` — one INSERT per quote in `ingestionRepo.ts:35`, **zero readers anywhere in app code**, no sweep job. Grows forever. |
| **T** | **LOW** | silent no-materialisation | Crypto recommendations require a non-null `sentiment_score` (`recommendation.ts:112`); Finnhub returns no crypto news by design, so a crypto asset with no yahoo news never gets a `sentiment_snapshot` → never materialises a recommendation. Equity path renormalises around null sentiment; crypto path doesn't. |
| **U** | **LOW** | inconsistent API surface | `asset_fundamentals` columns `eps, current_ratio, quick_ratio, gross_margin, operating_margin, high_52w, low_52w` are populated only on the finnhub-fallback path (yahoo's adapter doesn't return them); `market_cap` is never written by the daily job at all. `GET …/fundamentals` returns null for these whenever yahoo served (the normal case). |
| — | note | UI gap | `getBriefingHistory` hardcodes `briefing_type='global'` → weekly/monthly briefings never appear in the history API/UI. |
| — | note | provider-blind check | `validateDataQuality` >3-day stale-quote check flags AMFI/mfapi NAV rows as stale over weekends/holidays (no NAV published) → false-positive audit noise. |

### (c) Every induced failure reverted cleanly — confirmation

| Induced change | Revert | Verified |
|---|---|---|
| 3× `ai:cooldown:gemini:*` Redis keys | `DEL` each | `redis KEYS ai:cooldown:*` → **empty**; live `GET /analytics/ai/single/MSFT` returned a fresh **gemini** completion |
| `FINNHUB_API_KEY=bad` | n/a — `docker compose exec -e` on one throwaway `bun` process; never touched `.env`, `provider_configs`, or the running backend/worker | process exited 0; container `printenv`/adapter unaffected; live backend never saw it |
| `provider_cooldown:coingecko` Redis key | `DEL` (in-script) | script printed `exists: 0`; `redis KEYS provider_cooldown:*` → **empty** |

`provider_configs` rows: **untouched** (verified — groq/gemini rows read-only via
`SELECT`). `bunx prisma migrate status` → "Database schema is up to date", no
drift, before and after. Scratch file `backend/scratch_probe_phase2.ts` removed.
`job_logs` max id 3002 → 3119, `failed_ingestions` 705 → 730 — all from expected
job/ingest runs enumerated in the mutation log, no orphaned RUNNING rows
(`sweep_stale_job_logs` backstop intact).
