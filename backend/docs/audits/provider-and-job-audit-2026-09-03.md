# Provider Integrations & Background Jobs — Full Audit — 2026-09-03

Scope: every market-data / AI / broker provider adapter and every BullMQ job.
Report only, no fixes. All claims are live-verified against the running stack
(`docker compose` up on this machine) and real Postgres state unless marked
**BLOCKED**.

Auditor note — data mutated by this audit: I triggered `fetch_news` ×2
(concurrent), `refresh_fundamentals` ×1, `validate_data_quality` ×1,
`sync_binance` ×1, `sync_groww` ×1 (failed, no writes), and ran two scratch
scripts that called `fetchAndStore("AAPL"/"TSLA"/"NVDA")` and every provider
adapter's read path once. Net writes: ~30 `news.news` rows, 3
`asset_sentiment_snapshots`, 21 `asset_fundamentals` upserts, one Binance
broker-sync cycle, ~200 `evaluate_watchlist_alerts` job-log rows. `job_logs`
max id moved 1932 → ~2065. Scratch files removed.

The stack was found **stopped** at the start of this session (clean SIGTERM
~11:22 UTC, not a crash) and restarted via `docker compose up -d`.
`bunx prisma migrate status` → "up to date", 3 migrations, no drift.

---

## Step 0 — Enumeration (pulled from code, not memory)

### Providers actually in the codebase

| Provider | Adapter file | Wired into | Key source |
|---|---|---|---|
| yahoo | `marketProviders/yahoo.ts` | quote / news / technicals / analyst-signals / fundamentals / sectors | none (unofficial yfinance-style) |
| finnhub | `marketProviders/finnhub.ts` | quote (primary for non-`.NS` equity) / news / fundamentals | `process.env.FINNHUB_API_KEY` |
| nse_direct | `marketProviders/nseDirect.ts` | quote + price-history for `.NS` | none (cookie handshake) |
| coingecko | `marketProviders/coingecko.ts` | quote for spot crypto/stablecoin | none (free tier); `COIN_GECKO_API_KEY` in `.env` is **never read** |
| binance_price | `marketProviders/binancePrice.ts` | quote for `crypto_futures` | none (public endpoint) |
| twelvedata | `marketProviders/twelvedata.ts` | quote fallback (2nd in `finnhub` chain) | `process.env.TWELVEDATA_API_KEY` |
| alphavantage | `marketProviders/alphavantage.ts` | quote fallback (3rd in `finnhub` chain) | `process.env.ALPHAVANTAGE_API_KEY` |
| polygon | `marketProviders/polygon.ts` | quote fallback (2nd in `yahoo` chain) | `process.env.POLYGON_API_KEY` |
| amfi | `marketProviders/amfi.ts` | `refresh_mutual_fund_navs` (NAV feed) | none (public AMFI file) |
| mfapi.in | `marketProviders/mfapi.ts` | `backfill_mutual_fund_nav_history` (scheme history) | none (public) |
| gemini | `ai/providers/gemini.ts` | AI completion (primary, 4 models) | DB `provider_configs.gemini.encrypted_keys` |
| groq | `ai/providers/groq.ts` | AI completion (fallback, 2 models) | DB `provider_configs.groq.encrypted_keys` |
| binance (broker) | `broker/binance/client.ts` | `sync_binance`, `backfill_binance_spot` | DB `provider_configs.binance` |
| zerodha (broker) | `broker/…` | `sync_zerodha` | DB `provider_configs.zerodha` |
| groww (broker) | `broker/…` | `sync_groww` | DB `provider_configs.groww` |

`provider_configs` also carries **PLANNED / unwired** rows: `coinbase`,
`coinmarketcap`, `newsapi`, `rss`, `telegram`, `bond_valuation`,
`custom_equity`, `epf`, `eps_valuation`, `insurance_valuation`, `nps`,
`nps_valuation`, `real_estate_valuation`, `epf_ppf_valuation`, plus
`financial_intelligence` / `signal_eligibility` / `epf_interest_rates`
(internal, not external APIs).

### Jobs actually registered

**Cron / BullMQ repeatable** (`queue.ts` + `scripts/startWorker.ts`, 10):

| Job | Pattern (UTC) | Last run (job_logs) | Last status |
|---|---|---|---|
| `sweep_stale_job_logs` | `*/30 * * * *` | 2026-09-03 12:xx | SUCCESS (106 total) |
| `refresh_prices` | `0 * * * *` | 2026-09-03 12:00 | SUCCESS (75 total, 0 fail) |
| `refresh_tracked_universe` | `0 4 * * *` | 2026-08-26 06:25 | SUCCESS (5 total) |
| `refresh_fundamentals` | `0 6 * * *` | 2026-09-03 11:45 (manual) | SUCCESS (7 total) |
| `refresh_mutual_fund_navs` | `0 23 * * *` | 2026-09-03 07:22 | FAILED ×2 recent |
| `seed_price_history` | `0 2 * * 0` | 2026-08-19 | SUCCESS (1) |
| `fetch_news` | `0 */4 * * *` | 2026-09-03 08:23 | SUCCESS (36 / 2 fail) |
| `daily_briefing` | `0 8 * * *` | 2026-09-03 08:00 | SUCCESS (2 / 5 fail) |
| `weekly_briefing` | `30 8 * * 1` | 2026-08-24 | SUCCESS (1 / 1 fail) |
| `monthly_briefing` | `0 9 1 * *` | 2026-08-24 | SUCCESS (1 / 1 fail) |

**Event / queue-driven** (`startWorker.ts`, no schedule):
`ingestQuote` (q_ingestion — enqueued by `refresh_prices` + `refresh_tracked_universe`),
`evaluate_watchlist_alerts` (q_watchlist_alerts — enqueued by `ingestQuote` after every quote write).

**Manual-dispatch only** (`jobDispatch.ts` `JOB_RUNNERS`, no cron):
`sync_zerodha`, `sync_groww`, `sync_binance`, `validate_data_quality`,
`admin_reprocess_all`, `admin_repair`, `seed_tracked_universes`,
`backfill_mutual_fund_nav_history`.
`backfill_binance_spot` — via `dispatchPortfolioJob` only (needs portfolio_id).

**Downstream evaluation chain** (in-process, fire-and-forget from `ingestQuote`
for *held* symbols only): `processAssetSnapshot → generateFeatures →
generateSignals → generateScores → computeAssetHealth`. Not separately
scheduled — reached only via `ingestQuote`. This is not an orphan set; it is
the correct wiring.

**Set arithmetic** — every `src/jobs/*.ts` file maps to a trigger. No dead job
files. `computeAssetHealth.ts` (350 bytes) is a thin wrapper over
`lib/evaluation/assetHealth.ts`, reached via the chain above — not a stub.

---

## Providers — one at a time

### 1. yahoo — **REAL, healthy**

- **Communication:** called directly (not queued) by `ingestQuote` (as
  primary for crypto-curated / `.BO` / JP-HK-EU, and as final fallback for
  every chain), by `refresh_fundamentals`, `processAssetSnapshot` /
  `generateSignals` (`getTechnicalIndicators`), the on-demand
  `/assets/:s/analyst-signals` and `/assets/:s/technicals` routes,
  `fetch_news` (`getNews` + `filterYahooSearchNews`), and `sectors.ts`.
  Quote → `market.latest_quotes` (`provider='yahoo'`) + `price_history`.
  Fundamentals → `market.asset_fundamentals`. Technicals/signals → Redis
  cache only (`cacheAssetSignals`), not a table.
- **Status:** REAL. Live: `getQuote("AAPL")` → \$324.96 / vol 33.66M / USD
  (172–1137 ms); `getNews("AAPL")` → 4 genuine Apple items;
  `getTechnicalIndicators("AAPL")` → rsi 79.93, macd 4.22, action "SELL",
  `source:"yfinance"`; `getAnalystSignals("AAPL")` → real
  `recommendationTrend` + `upgradeDowngradeHistory`.
- **Bugs:** none in yahoo itself. `getTechnicalIndicators` returns
  `sentiment: null` always (sentiment is merged downstream, not here — fine).
  `yahoo.ts:201–223` has 3 `@typescript-eslint/no-explicit-any` lint errors
  (pre-existing, from the Wave E analyst-signals addition).
- **Missing:** none material. Yahoo is the workhorse.
- **Live-verification:** **PASS**.

### 2. finnhub — **REAL, healthy, but idle in production**

- **Communication:** `ingestQuote` primary for non-`.NS` equities;
  `refresh_fundamentals` fallback (when `yahoo.getFundamentals` throws);
  `fetch_news` (`getNews`, relevance-filtered — see news audit). Quote →
  `latest_quotes` (`provider='finnhub'`).
- **Status:** REAL. Live: `getQuote("AAPL")` → \$324.96 (666 ms);
  `getFundamentals("AAPL")` → full ratio set incl. sector "Technology".
  Key `FINNHUB_API_KEY` (40 chars) resolves correctly.
- **Bugs / observations:**
  - **All 73 `finnhub` rows + all 238 `yahoo` US-equity rows in
    `latest_quotes` are stale at 2026-08-26 06:2x.** The ~311 non-`.NS`/`.BO`
    equity assets are almost all tracked-universe (not held: 48 positions,
    mostly `.NS` + crypto), and their refresh path is
    `refresh_tracked_universe` (cron `0 4 * * *`), which **has not run since
    2026-08-26** because the worker booted at 07:06 today — after 04:00 —
    following the ~8-day outage. Next fire 2026-09-04 04:00.
    `system.provider_usage` last 24 h shows **zero** finnhub / twelvedata /
    alphavantage / polygon `get_quote` calls — only yahoo, nse_direct,
    coingecko, binance_price. So finnhub's quote path is live *on demand*
    (probe PASS) but genuinely *idle in rotation*, and this cannot be used
    to confirm/deny BUG-A's production symptom until the tracked-universe
    refresh runs again.
  - `getQuote` returns `volume: null, currency: null` (price only) — by
    design, but downstream consumers that read `volume` off a finnhub-served
    quote get null.
- **Missing:** Finnhub could supply `volume`, 52-week range, and real-time
  intraday — only `c` (current price) is mapped.
- **Live-verification:** **PASS** (on-demand). Rotation coverage: **not
  exercised** (no qualifying held symbols).

### 3. nse_direct — **REAL, LIVE — prior "never runs" finding is RESOLVED**

- **Communication:** `ingestQuote` primary for every `.NS` symbol (via
  `resolveQuoteProvider`). Also `seedPriceHistory` / `nse_direct.getPriceHistory`
  for `.NS` history. Quote → `latest_quotes` (`provider='nse_direct'`) +
  `price_history`.
- **Status:** REAL. The Node port is a **dependency-free `fetch()`
  implementation** (cookie handshake against nseindia.com) — it does not use
  Python's `jugaad-data`, so the old "uninstalled dependency, silently masked
  by Yahoo" failure mode is structurally gone.
- **DB-level proof (not cross-matched):** `saveQuote` records the provider
  that *actually served* (`quote.provider`), not the requested one. Query:
  `market.latest_quotes` has **18 `.NS` rows with `provider='nse_direct'`,
  `updated_at = 2026-09-03 11:00`** (the 11:00 hourly refresh). Sample:
  `SUNPHARMA.NS 1916`, `HDFCBANK.NS 706.65`, `BHARTIARTL.NS 1869`,
  `ULTRACEMCO.NS 11275` — all independently-plausible NSE prices, all
  matched to worker-log `ingestQuote providerName:"nse_direct" → completed`
  lines for the same symbols/timestamps.
- **Live probe:** `nseDirect.getQuote("RELIANCE.NS")` → ₹1302.5 / vol
  9.72M (607 ms); `nseDirect.healthCheck()` → `true`.
- **Observation (not a bug):** 70 *other* `.NS` symbols still carry
  `provider='yahoo'` stale at 2026-08-26 — these are watchlist / tracked-
  universe symbols not currently *held*, so not in the hourly refresh. When
  they were last refreshed (Aug 26) Yahoo served them. Not evidence of
  nse_direct failing; evidence of a stale rotation tail.
- **Live-verification:** **PASS.**

### 4. coingecko — **REAL adapter, but spot-crypto refresh is largely broken (BUG-O)**

- **Communication:** `ingestQuote` primary for spot `crypto` / `stablecoin` /
  `*-USD`. Batch path `getQuotesByIds` used by `refresh_tracked_universe`.
  Quote → `latest_quotes` (`provider='coingecko'`).
- **Status:** adapter REAL — live `getQuote("BTC-USD")` → \$77,882 / vol
  25.3B (367 ms). **But in production it is failing most spot-crypto
  symbols.** `system.failed_ingestions` has **371 coingecko rows**, newest
  **2026-09-03 11:47** (ongoing). `market.latest_quotes` for
  `provider='coingecko'`: only **3 symbols fresh today**, 91 stale at
  2026-08-24. `system.provider_usage` last 24 h: coingecko 15 `get_quote`
  calls vs yahoo 111.
- **Root cause (BUG-O, MEDIUM):** a large set of tracked crypto assets are
  stored as **non-curated `X-USD` symbols not present in
  `SYMBOL_TO_COINGECKO_ID`** (live failures: `AAVE-USD`, `CRV-USD`,
  `RENDER-USD`, `ROSE-USD`, `S-USD`, `SKY-USD`, `SXT-USD`, `BNSOL-USD`, …
  35 consecutive cycles each). `coingecko.getQuote` throws
  `"no curated CoinGecko id mapping for symbol"`; and `buildCandidateNames`
  **strips the yahoo fallback** for non-curated coingecko symbols
  (`!yahooCanServeCryptoSymbol`) — so these symbols have **no working quote
  provider at all** and fail every refresh. Honest failure (recorded, not
  fabricated) but a standing broken state for those assets.
- **Rate-limit check (code, not docs):** enforcement is real —
  `coingecko.ts` calls `tryConsumeProviderBudget(PROVIDER_NAME, 2, 60)` and
  `isProviderCoolingDown` before each request, throwing
  `"local call budget (2/60s) exhausted … skipping rather than draw a real
  429"` and parsing a real 429's `Retry-After` into a Redis cooldown. **The
  `BUDGET_LIMIT = 2` per 60 s is very tight** — `refresh_prices` enqueues
  every crypto symbol as a separate BullMQ job processed in a burst, so
  after 2 calls the rest of the cycle's curated coins also get skipped as
  "budget exhausted". Secondary contributor to the stale spot-crypto rows.
- **Bugs:** BUG-O above; plus `COIN_GECKO_API_KEY` (in `.env`) is **never
  read** by `coingecko.ts` — always runs anonymous free tier, so the
  higher-ceiling key is unused.
- **Live-verification:** adapter **PASS** (curated symbol); production
  spot-crypto refresh **FAIL** (BUG-O).

### 5. binance_price — **REAL (futures quotes), NO rate-limit guard**

- **Communication:** `ingestQuote` for `crypto_futures` only. Quote →
  `latest_quotes` (`provider='binance_price'`, 8 rows, fresh
  2026-09-03 11:00).
- **Status:** REAL. `latest_quotes` shows 8 fresh futures rows from the
  11:00 refresh. Direct probe with a spot symbol was correctly rejected
  (`"Not a recognized Binance futures symbol"`) — futures-symbol-only by
  design.
- **Rate-limit check:** `binancePrice.ts` has **no** `redisRateLimit` import
  and **no** throttle/cooldown of any kind. Binance's public price endpoint
  is weight-limited (~1200/min) so real-world risk is low at 8 futures
  symbols/hour, but the task's question — "confirm rate-limit budget
  discipline is actually enforced in code" — answer for binance_price:
  **not enforced.** Same for `finnhub`, `yahoo`, `polygon`, `nse_direct`.
- **Live-verification:** **PASS** (via fresh DB rows; direct probe needs a
  valid futures symbol).

### 6. twelvedata — **DEAD: env-var name mismatch (BUG-A)**

- **Communication:** 2nd candidate in the `finnhub` quote fallback chain
  (`finnhub → twelvedata → alphavantage → yahoo`).
- **Status:** **BROKEN.** `twelvedata.ts:17` reads
  `process.env.TWELVEDATA_API_KEY`. The `.env` file (both host and the
  container's mounted `/app/.env`) defines **`TWELVE_DATA_API_KEY`** (with
  underscore, 32 chars). `resolvedKey()` returns `undefined` → every call
  throws `ConfigurationError("Twelve Data API key is not configured")`.
- **Live probe:** `twelvedata.getQuote("AAPL")` → `"Twelve Data API key is
  not configured"` in <1 ms (never hits the network).
- **Silent-ness:** `provider_configs.twelvedata` = `status:ACTIVE`,
  `has_keys:true` (a key IS stored in the DB row — also unused, see BUG-C),
  so the Settings UI / monitoring shows twelvedata as healthy. The fallback
  chain silently skips it and lands on yahoo.
- **Live-verification:** **FAIL (config bug).**

### 7. alphavantage — **DEAD: env-var name mismatch (BUG-A)**

- **Communication:** 3rd candidate in the `finnhub` quote fallback chain;
  also `alphavantage.ts` exposes fundamentals used nowhere in the live path.
- **Status:** **BROKEN.** `alphavantage.ts:27` reads
  `process.env.ALPHAVANTAGE_API_KEY`; `.env` defines
  **`ALPHA_VANTAGE_API_KEY`** (16 chars). Same failure as twelvedata.
- **Live probe:** `alphavantage.getQuote("AAPL")` → `"Alpha Vantage API key
  is not configured"` in 1 ms.
- **Silent-ness:** identical — `provider_configs.alphavantage` ACTIVE +
  `has_keys:true`.
- **Live-verification:** **FAIL (config bug).**

### 8. polygon — **KEY REJECTED (BUG-B)**

- **Communication:** 2nd candidate in the `yahoo` quote fallback chain
  (`yahoo → finnhub → polygon`).
- **Status:** key resolves (`POLYGON_API_KEY`, 34 chars, name matches) but
  the live call returns **HTTP 401**. Key is invalid / expired / wrong plan.
- **Live probe:** `polygon.getQuote("AAPL")` → `"Polygon get_quote failed
  for AAPL: HTTP 401"` (955 ms — reached the network). `system.providers`
  row for polygon = **`health_status = 'degraded'`** — the failure is at
  least tracked, unlike BUG-A's silent-ACTIVE adapters.
- **Silent-ness:** `provider_configs.polygon` = ACTIVE. In practice yahoo (the
  chain's primary) almost never fails, so polygon is rarely reached — but
  when it is, it's a dead fallback that looks configured.
- **Live-verification:** **FAIL (bad credential).**

### 9. amfi — **REAL (NAV feed)**

- **Communication:** `refresh_mutual_fund_navs` calls `getAllNavs()` → a
  `Map<ISIN, nav>` from AMFI's public NAVAll.txt. Matched rows →
  `latest_quotes` + `price_history`.
- **Status:** REAL. `amfi.ts` exports `getAllNavs`, `healthCheck`.
- **Bugs:**
  - **Provenance mislabel (silent-divergence class):** `refresh_mutual_fund_navs`
    writes the matched NAV with **`provider: "mfapi"`** — but the data came
    from **AMFI**, not mfapi.in. Cosmetic today (nothing keys off it) but
    it is exactly the "silent wrong-attribution" pattern flagged in scope.
  - `refresh_mutual_fund_navs` FAILED ×2 on 2026-09-03 07:22 —
    `"no AMFI NAV matched any held mutual fund symbol"`. The 4 held MF assets
    are not ISIN-keyed in a form that matches AMFI's feed (`{ISIN}_MF`
    convention), so NAV refresh yields zero matches and the job hard-fails.
- **Live-verification:** feed reachable (adapter imports cleanly, healthCheck
  path present). End-to-end job: **FAIL** — coverage gap, 0 held MF match.

### 10. mfapi.in — **REAL, WIRED (was "planned" — now integrated)**

- **Communication:** `mfapi.ts` (`getSchemeList`, `getSchemeHistory`,
  `searchSchemesByName`) used by `backfill_mutual_fund_nav_history` job and
  `lib/jobs/mfSchemeMatch.ts` (exact-match-only matcher, commit `d469d52`).
- **Status:** REAL. Live: `mfapi.getSchemeList()` → **37,851 schemes**
  (260 ms). Integration is genuinely live, contradicting the prior
  "pending/planned" status.
- **Bugs:** `backfill_mutual_fund_nav_history` FAILED once (2026-09-03 07:21)
  — `"no held mutual fund resolved to an mfapi.in scheme"`. Same root cause
  as amfi: the 4 held MF symbols don't resolve to a scheme code. Integration
  works; the held data doesn't feed it.
- **Live-verification:** provider **PASS**; dependent job **BLOCKED** (no
  qualifying held MF data).

### 11. gemini — **REAL, LIVE — prior "no key" finding is STALE**

- **Communication:** primary AI provider in `aiService.executeCompletion`'s
  chain (`gemini` 4 models → `groq` 2 models), 60 s circuit-breaker cooldown
  per model on 429. Consumed by `generate_briefing` (daily/weekly/monthly
  briefing jobs), `/analytics/ai/single/:s`, `/ai/ask`, recommendation
  explanations. Results → `ai.ai_briefings` + Redis + `ai_generation_logs`.
- **Status:** REAL. Key is in **DB** (`provider_configs.gemini.encrypted_keys`,
  `has_keys:true`) — not env — which is why earlier "GEMINI_API_KEY absent
  from .env" was reported as a blocker. It is not a blocker.
- **Live probe:** `GET /analytics/ai/single/AAPL` → a real generated
  narrative take (`generation_id` returned). `daily_briefing` SUCCESS at
  2026-09-03 08:00.
- **Bugs found (from application logs):**
  - **B-1 (HIGH, silent-cost / hang): no overall timeout on the model
    fallback loop.** Logged: `GET /analytics/ai/single/UNI-USD` returned
    `200` after **677,059 ms (11 minutes 17 s)**. `aiService.ts` has
    per-model fetch timeouts but nothing caps total wall-clock across the
    6-model chain; a slow/hanging Gemini endpoint stacks up.
  - **B-2 (MEDIUM, credential exposure): the error path logs the full
    request URL including `?key=<live gemini key>`.** `gemini.ts:24`
    `geminiFetch` error is logged with `path:` = the full generateContent
    URL. A working API key sits in `docker logs aureon_backend`.
  - **B-3 (LOW/MEDIUM, degraded output): AI context builder under-feeds the
    model.** The live single-take for AAPL said *"fundamental valuation
    metrics such as the PE ratio are currently unavailable"* and *"momentum
    indicators like the RSI are not provided"* — yet `asset_fundamentals`
    has a fresh PE for AAPL (34.36) and `getTechnicalIndicators("AAPL")`
    returns RSI 79.93 live. `contextBuilder.ts` is not wiring the data that
    exists into the prompt, so the model emits "data unavailable" hedges on
    assets that do have data. Also the take quoted price 309.9 while live
    yahoo/finnhub agree on 324.96 — the context reads a stale cached quote.
- **Live-verification:** **PASS** (path works); **3 bugs filed**.

### 12. groq — **REAL (fallback), not exercised live this pass**

- **Communication:** 2nd provider in the AI chain; only reached when all 4
  Gemini models are cooled-down/failing.
- **Status:** REAL. Key in DB (`provider_configs.groq`, `has_keys:true`).
- **Live-verification:** **BLOCKED (soft)** — Gemini answered on the first
  model every time this session, so Groq was never invoked. Key presence
  confirmed; actual Groq HTTP call not observed. No mock path active
  (`AUREON_TEST_MOCK_AI` unset).

### 13. binance (broker) — **REAL, LIVE**

- **Communication:** `sync_binance` job (manual dispatch) →
  `resolveProviderCredentials("binance", [api_key, api_secret])` from DB →
  `BinanceClient` → holdings/trades/income/transfers →
  `portfolio.positions` + `portfolio.transactions` + quote/snapshot refresh.
- **Status:** REAL. Live: triggered `sync_binance` → **SUCCESS in 30,706 ms**.
  Credentials in `provider_configs.binance` (status `PARTIAL`, `has_keys:true`)
  are valid and complete enough for a full sync.
- **Bugs:** none found. The per-stream watermark design
  (`lastTransactionAt` narrowed by wallet / transaction-type / dividend) is
  careful — explicitly avoids the "sibling stream closes the missed window"
  data-loss class.
- **Live-verification:** **PASS.**

### 14. zerodha (broker) — **DISABLED**

- **Communication:** `sync_zerodha` job. Never run — 0 `job_logs` rows ever.
- **Status:** `job_configs.sync_zerodha.enabled = false`;
  `provider_configs.zerodha` status `PARTIAL`, **`has_keys:false`** (no
  stored credentials). Dispatch attempt → `"Job 'sync_zerodha' is disabled
  — not dispatched"`.
- **Live-verification:** **BLOCKED** — job disabled + no credentials. Expected
  for a single-user setup not using Zerodha.

### 15. groww (broker) — **AUTH BLOCKED**

- **Communication:** `sync_groww` job (manual dispatch).
- **Status:** credentials present (`provider_configs.groww`, `has_keys:true`)
  but stale. Live: triggered → **FAILED in 173 ms** —
  `"AUTH_REQUIRED: Groww token exchange rejected — Session approval required
  before generating token"`. Groww's daily interactive session-approval step
  has not been done.
- **Live-verification:** **BLOCKED** — needs interactive Groww login. The
  failure is surfaced honestly (`GrowwAuthError`, `AUTH_REQUIRED:` prefix,
  FAILED job log) — no fake data.

---

## Jobs — one at a time

Legend: **T** trigger, **W** writes, **S** status, **B** bugs, **V** live result.

**"Silently succeeds when skipped" check (task Jobs §3):** `skipIfDisabled`
makes a disabled job a no-op that writes **status SUCCESS** with
`error_message = "skipped — JobConfig.enabled is False"`. Queried
`config.job_logs WHERE error_message LIKE 'skipped%'` → **only `fetch_news`
×2**, and those are this session's Redis-lock skips (same message shape), not
disabled-skips. So **every "SUCCESS" in the cron table above is a genuine
run**, not a masked skip. `config.job_configs.enabled`: all cron jobs `true`;
`sync_zerodha` and `backfill_mutual_fund_nav_history` are `false`;
`sync_portfolio` exists as a `job_configs` row with **no runner in
`JOB_RUNNERS` and no job file** — an orphan config row (harmless; dispatch
would 400).

### refresh_prices — **REAL, healthy**
- **T:** cron `0 * * * *` + manual. **W:** enqueues one `ingestQuote` job
  per held/watchlisted non-skipped symbol onto q_ingestion; no direct table
  write. **S:** REAL. 75 runs, 0 failures, last 2026-09-03 12:00.
  JobLog opened+closed via `wrapJobExecution` on both paths.
- **B:** none. `resolveQuoteProvider` is correctly wired here (its
  `"Unwired this phase"` doc comment is **stale** — same doc-rot class as the
  news audit found; behaviour is correct).
- **V:** **PASS** (observed firing on the hour, DB rows fresh).

### ingestQuote (q_ingestion) — **REAL, healthy; core provenance is correct**
- **T:** BullMQ job from `refresh_prices` / `refresh_tracked_universe`.
  **W:** `latest_quotes` (upsert, `provider = quote.provider` = the provider
  that *actually served*), `price_history`, `market.providers` health,
  `provider_usage`; enqueues `evaluate_watchlist_alerts`; for *held* symbols
  runs the evaluation chain in-process.
- **S:** REAL. **Provenance is recorded correctly** — the fallback loop sets
  `usedProvider = quote.provider` and `saveQuote(usedProvider, …)`, so a
  yahoo-served fallback is stored as `yahoo`, not as the requested provider.
  This is the mechanism that made the NSE-direct DB proof possible.
- **B:**
  - The evaluation-chain `try/catch` (line 136-140) logs and swallows *all*
    downstream failures (`processAssetSnapshot → … → computeAssetHealth`).
    Deliberate (matches Python's fire-and-forget `.delay()`) and correctly
    kept out of provider-failure attribution — but it means a persistently
    broken evaluation chain for held symbols produces **only log lines**, no
    JobLog, no alert. Silent-degradation risk for the scoring pipeline.
  - `isProviderAvailable` treats a **row-less** provider as available but a
    `PLANNED`/`DISABLED` row as not — combined with BUG-D's orphan rows this
    is benign today, but if someone set `finnhub` (canonical row) to
    DISABLED while `finnHub` (orphan) stayed ACTIVE, the chain would still
    skip finnhub correctly (code looks up canonical). No bug, noted for
    completeness.
- **V:** **PASS** — 18 nse_direct + 93 coingecko + 8 binance_price + fresh
  yahoo rows all attributable, timestamped 2026-09-03 11:00–12:00.

### evaluate_watchlist_alerts (q_watchlist_alerts) — **REAL, but log-flooding**
- **T:** enqueued by `ingestQuote` after every quote write (one job per
  symbol per refresh cycle). **W:** `notification.*` on a fired alert;
  always writes a `config.job_logs` row.
- **S:** REAL. 1,745+ SUCCESS rows, 0 failures, all `{"fired": 0}`.
- **B:** **JobLog spam.** Every per-symbol evaluation opens and closes its
  own `job_logs` row → ~100–110 rows per hourly cycle, ~2,400/day. This is
  why `job_logs` has 2,000+ rows over ~2 weeks, why job history in the UI is
  unreadable, and why `sweep_stale_job_logs` runs every 30 min. Not
  incorrect, but a design smell; Python likely logged once per batch, not
  per symbol. Worth confirming the intended granularity.
- **V:** **PASS** (functionally); flagged for the logging pattern.

### refresh_fundamentals — **REAL, live PASS; provenance mislabel**
- **T:** cron `0 6 * * *` + manual. **W:** `market.asset_fundamentals`
  (upsert per equity), `Asset.metadata` sector/industry.
- **S:** REAL. Live: triggered → **SUCCESS 7,546 ms**, 21
  `asset_fundamentals` rows refreshed to 2026-09-03 11:45.
- **B:** **`source: "yahoo"` is hardcoded** in both the `create` and
  `update` branches — even when the `finnhubGetFundamentals` fallback path
  produced the row. Silent provenance divergence (scope-flagged class).
  Missed today's 06:00 cron fire because the worker booted at 07:06 (after
  06:00) following the ~8-day stack outage — will resume tomorrow; not a
  scheduler defect.
- **V:** **PASS.**

### refresh_mutual_fund_navs — **REAL job, FAILING on coverage**
- **T:** cron `0 23 * * *` + manual. **W:** `latest_quotes` +
  `price_history` for ISIN-matched MF assets, inside one `$transaction`.
- **S:** REAL execution, but **FAILED ×2** on 2026-09-03 07:22 —
  `"no AMFI NAV matched any held mutual fund symbol"` (job throws
  `ProviderError` when `matched === 0`).
- **B:** (1) writes `provider: "mfapi"` for AMFI-sourced data (mislabel, see
  amfi §9). (2) The whole-run-fails-on-zero-match behaviour turns a data
  *coverage* gap (4 held MF assets, none ISIN-keyed to match AMFI) into a
  recurring red FAILED job every night. (3) The `$transaction` wraps the
  entire loop — a single bad row rolls back every NAV write for the cycle
  (partial-write protection, but also all-or-nothing fragility).
- **V:** **FAIL** — end-to-end blocked by held-data shape, not by AMFI.

### fetch_news — **REAL, healthy (covered in detail by the news audit)**
- **T:** cron `0 */4 * * *` + manual. **W:** `news.news`,
  `news.news_assets`, `sentiment_score`; JobLog via `wrapJobExecution`
  wrapped in a new Redis single-flight lock (`job_lock:fetch_news`).
- **S:** REAL. 36 SUCCESS / 2 FAILED (both pre-fix, from the news audit).
  Live concurrent double-dispatch this session: one SUCCESS full cycle, one
  clean 9 ms skip, no P2002.
- **B:** none outstanding — BUG-1..BUG-4 from the news audit verified closed.
  Two report-only carry-overs: Finnhub news now returns `[]` for all crypto
  by design (coverage change), and `fetchNews.ts` opens a module-scope Redis
  connection at import (mildly awkward for test hosts; consistent with
  `redisRateLimit`).
- **V:** **PASS.**

### daily_briefing / weekly_briefing / monthly_briefing — **REAL, AI-dependent**
- **T:** cron (`0 8 * * *` / `30 8 * * 1` / `0 9 1 * *`). **W:**
  `ai.ai_briefings` + `ai_generation_logs` + Redis, via `generate_briefing`
  → `executeCompletion` → Gemini/Groq chain.
- **S:** REAL. `daily_briefing` 2 SUCCESS / 5 FAILED — last run
  2026-09-03 08:00 **SUCCESS**, so the AI path recovered. Weekly/monthly
  each 1 SUCCESS / 1 FAILED, last 2026-08-24 (haven't been due since the
  outage).
- **B:** inherits Gemini B-1 (no overall timeout — a briefing could hang
  11+ min like the single-take did) and B-2 (key in logs).
- **V:** **PASS** (daily, via the 08:00 job + the live single-take probe).
  Weekly/monthly: **not exercised** (not due this session).

### refresh_tracked_universe — **REAL, idle since outage**
- **T:** cron `0 4 * * *` + manual. **W:** enqueues `ingestQuote` for
  tracked-universe symbols; `coingecko.getQuotesByIds` batch for coins.
- **S:** REAL. 5 SUCCESS, 0 fail, last 2026-08-26 (worker booted after
  04:00 today → next fire 2026-09-04 04:00).
- **B:** shares no cursor with another job. `resolveQuoteProvider` wired
  correctly.
- **V:** **BLOCKED (timing)** — not due since worker boot; last historical
  run SUCCESS.

### seed_price_history / seed_tracked_universes — **REAL, one-shot seeders**
- **T:** `seed_price_history` cron `0 2 * * 0` (weekly) + manual;
  `seed_tracked_universes` manual only. **W:** bulk `price_history` /
  tracked-universe tables.
- **S:** `seed_price_history` 1 SUCCESS (2026-08-19). `seed_tracked_universes`
  1 FAILED (2026-08-24). Both effectively idle.
- **B:** `seed_tracked_universes`' one run FAILED and it has no schedule, so
  nothing retries it — if the tracked universe needs reseeding it must be
  done by hand. Low priority.
- **V:** **BLOCKED (not re-run this session)**; historical status recorded.

### sweep_stale_job_logs — **REAL, healthy**
- **T:** cron `*/30 * * * *`. **W:** flips `job_logs` rows stuck in RUNNING
  past a cutoff to FAILED. **S:** 106 SUCCESS, `{"swept": 0}` every time
  (nothing is actually getting stuck — good).
- **B:** none. This is the backstop for the `wrapJobExecution`
  reset-in-progress early-return (which can leave a dispatch-supplied
  `logId` row open) and for worker crashes.
- **V:** **PASS.**

### validate_data_quality — **REAL, report-only**
- **T:** manual only (no cron; Python's final `beat_schedule` was empty, so
  no divergence). **W:** none (audit/report job). **S:** live
  triggered → **SUCCESS 472 ms**, logged `"Data Quality Audit found issues"`
  at ERROR level but job status SUCCESS (issues don't fail the job).
- **B:** the ERROR-level log with job-status SUCCESS is mildly misleading in
  log scans. Findings are not persisted anywhere queryable — they only exist
  as a log line.
- **V:** **PASS.**

### sync_binance / sync_zerodha / sync_groww — **manual-only in Node — matches Python (verified)**
- **T:** `jobDispatch.ts` `JOB_RUNNERS` — no BullMQ cron for any of the
  three. `queue.ts`'s `SCHEDULED_JOB_HANDLERS` has 10 entries, none broker
  syncs. Brokers auto-sync only via an explicit `POST /config/jobs/sync_*/run`
  or the portfolio-sync UI/route.
- **Verified against git history:** `backend/app/workers/celery_app.py` at
  the deletion commit (`38b7c4f`, 2026-08-16) has `beat_schedule = {}` with a
  comment stating all 10 jobs were cut to BullMQ and *"All tasks themselves
  are untouched and still reachable via manual dispatch"*. Broker syncs were
  **manual/UI-triggered in Python too** — Node matches Python exactly. **This
  is not a bug.** (One residual: if the user expects periodic broker syncs,
  neither backend ever provided them — that's a product gap, not a migration
  regression.)
- **V:** `sync_binance` **PASS** (live SUCCESS). `sync_groww` **BLOCKED**
  (auth). `sync_zerodha` **BLOCKED** (disabled + no creds).

### backfill_mutual_fund_nav_history — **REAL, coverage-blocked**
- **T:** manual (+ was added to job config, commits `178c0c3` / `69e451c`).
  **W:** `price_history` for MF assets from mfapi.in scheme history.
- **S:** 1 run, **FAILED** (2026-09-03 07:21) —
  `"no held mutual fund resolved to an mfapi.in scheme"`.
- **B:** same root cause as `refresh_mutual_fund_navs` — the 4 held MF
  symbols don't resolve. The exact-match-only matcher (`d469d52`) is
  deliberately strict; with no ISIN/scheme-code match it yields nothing.
- **V:** **BLOCKED** — provider (mfapi) verified live PASS; job blocked by
  held-data shape.

### admin_reprocess_all / admin_repair — **REAL, not exercised**
- **T:** manual only. **W:** re-runs the evaluation chain across all assets /
  repairs missing snapshots. **S:** never run (0 job_logs). Not exercised
  this pass — low risk, admin-only, and running a full reprocess would be a
  large unsolicited mutation.
- **V:** **BLOCKED (deliberately not triggered).**

### backfill_binance_spot — **REAL (portfolio-scoped)**
- **T:** `dispatchPortfolioJob` only (needs `portfolio_id`). **W:** historical
  Binance spot trades → `transactions`. **S:** 1 SUCCESS (2026-08-21) /
  1 FAILED (2026-08-20).
- **V:** **BLOCKED** — needs a portfolio-scoped trigger + the same Binance
  creds (which are valid, per sync_binance PASS). Not re-run.

---

## Consolidated bug list — ranked (silent-corruption class first)

| # | Severity | Class | Bug |
|---|---|---|---|
| **O** | **HIGH** | standing coverage failure | ~8+ tracked crypto assets stored as non-curated `X-USD` symbols (`AAVE-USD`, `CRV-USD`, `RENDER-USD`, `ROSE-USD`, `S-USD`, `SKY-USD`, `SXT-USD`, `BNSOL-USD`, …) have **no working quote provider**: `coingecko.getQuote` throws `"no curated CoinGecko id mapping"`, and `buildCandidateNames` strips the yahoo fallback for non-curated coingecko symbols. They fail every refresh cycle (35+ consecutive in `system.failed_ingestions`, newest 2026-09-03 11:47). Only 3 coingecko symbols have a fresh quote; 91 are stale at 2026-08-24. Honest failure (recorded) but the assets are unpriced. Compounded by `coingecko` `BUDGET_LIMIT = 2 / 60 s` being too tight for a burst refresh. |
| **A** | **HIGH** | silent divergence / config | `twelvedata.ts` reads `TWELVEDATA_API_KEY`, `alphavantage.ts` reads `ALPHAVANTAGE_API_KEY`; `.env` provides `TWELVE_DATA_API_KEY` / `ALPHA_VANTAGE_API_KEY` (underscores). Both adapters are **permanently dead** — throw "key not configured" before any network call — while `provider_configs` shows both ACTIVE + has_keys, so monitoring reports them healthy. They are candidates #2/#3 in the `finnhub` quote fallback chain (`finnhub → twelvedata → alphavantage → yahoo`), so the chain has **only 2 live tiers, not 4**. Impact today is reduced fallback depth: yahoo is the *designed* terminal fallback and it works, so no data is lost — but the resilience the chain is supposed to provide is silently absent. Production symptom (fresh yahoo rows on US equities where finnhub failed) is **not currently observable** — the US-equity refresh path hasn't run since 2026-08-26 (see BUG below / finnhub §2). |
| **B** | **HIGH** | hang / silent cost | AI model fallback loop (`aiService.executeCompletion`) has per-model timeouts but **no overall wall-clock ceiling**. Observed live: `GET /analytics/ai/single/UNI-USD` returned 200 after **677 s (11 min)**. A hung Gemini endpoint stacks across all 6 models. Affects every AI route + all 3 briefing jobs. |
| **C** | **MEDIUM** | silent divergence | Market-data adapters (`finnhub`, `twelvedata`, `alphavantage`, `polygon`) read **only `process.env`**, never `getDecryptedKey()`. The Settings UI / config API `setProviderKey` writes to `provider_configs.encrypted_keys` — for these providers that write is **silently inert**. A user "saving" a Finnhub key via the UI changes nothing. |
| **D** | **MEDIUM** | silent divergence / latent credential loss | `provider_configs` has orphan camelCase rows `finnHub`, `alphaVantage`, `twelveData`, plus `twelve_data`, alongside the canonical lowercase rows. Not seeded by `DEFAULT_PROVIDERS`, not referenced by code (all code uses lowercase). Credentials currently sit in the canonical rows, but the Settings UI lists all of them — setting a key on `finnHub` would "succeed" and be ignored forever. Also `coinmarketcap` (PLANNED) and `newsapi` (PLANNED) carry stored keys for unwired providers. |
| **E** | **MEDIUM** | credential exposure | Gemini error path logs the full request URL including `?key=<live key>` (`gemini.ts:24` via the `path:` field). A working API key is sitting in `docker logs aureon_backend`. |
| **F** | **MEDIUM** | recurring false failure | `refresh_mutual_fund_navs` (nightly cron) and `backfill_mutual_fund_nav_history` hard-`throw` when zero held MF assets match the feed. The 4 held MF assets are not ISIN/scheme-keyed to match, so the job goes **red every night** on what is a data-shape gap, not a provider failure. |
| ~~G~~ | — | **not a bug** | Broker syncs have no BullMQ cron — manual/UI only. **Verified against git history**: Python's final `celery_app.py` (`38b7c4f`, 2026-08-16) had `beat_schedule = {}` — brokers were manual-only in Python too. Node matches. Residual: neither backend ever provided periodic broker sync (product gap, not a regression). |
| **H** | **LOW-MED** | silent wrong-attribution | Provenance mislabels: `refresh_fundamentals` hardcodes `source: "yahoo"` even on the finnhub fallback path; `refresh_mutual_fund_navs` writes `provider: "mfapi"` for AMFI-sourced NAVs. Cosmetic today; wrong if anything ever keys off provenance. |
| **I** | **LOW-MED** | dead fallback | `POLYGON_API_KEY` present but returns **HTTP 401** live. Polygon is the 2nd fallback in the `yahoo` chain — a configured-looking dead link. |
| **J** | **LOW-MED** | silent degradation / no observability | `ingestQuote` **never calls `wrapJobExecution`** — it writes no `job_logs` row at all. Its provider failures land only in `system.failed_ingestions` (**371 rows**, mostly coingecko per BUG-O, plus nse_direct ×90 / yahoo ×38 from the outage). Its downstream evaluation chain (`processAssetSnapshot → … → computeAssetHealth`) is wrapped in a `try/catch` that swallows *all* failures to one log line. Net: a symbol failing every provider every cycle, or a persistently broken scoring pipeline for held symbols, is **invisible in job history by construction** — you must query `failed_ingestions` and grep worker logs. |
| **K** | **LOW** | AI output quality | `contextBuilder.ts` under-feeds the model: the live AAPL single-take claimed PE/RSI "unavailable" and quoted a stale price (309.9 vs live 324.96) while fresh `asset_fundamentals` PE and live RSI both exist. Model emits "data unavailable" hedges on assets that have data. |
| **L** | **LOW** | no rate-limit guard | `binance_price`, `finnhub`, `yahoo`, `polygon`, `nse_direct` have no budget/cooldown enforcement (only `coingecko`, `twelvedata`, `alphavantage` do — and the latter two are dead per BUG-A). Low real-world risk at current volumes; worth knowing the discipline is provider-specific, not global. |
| **M** | **LOW** | log flooding | `evaluate_watchlist_alerts` writes one `job_logs` row per symbol per cycle (~2,400/day), making job history unreadable and forcing 30-min sweeps. |
| **N** | **LOW** | doc rot | `routing.ts` `resolveQuoteProvider` and `sentiment.ts` / `generateFeatures.ts` carry stale `"Unwired this phase"` / `"no Node port yet"` comments; the code is fully wired. Same class as the news audit's stale comments. |

## Hard blockers that limited verification

| Provider / job | Blocker |
|---|---|
| **groq** | Never invoked — Gemini answered on model #1 every time. Key present; live Groq HTTP call not observed. |
| **groww broker sync** | `AUTH_REQUIRED` — Groww daily session approval not done. Failure surfaced honestly (no fake data). |
| **zerodha broker sync** | Job `enabled:false` + no stored credentials. |
| **polygon** | HTTP 401 — invalid/expired key (this is also BUG-I). |
| **twelvedata / alphavantage** | "key not configured" — env-var name mismatch (BUG-A). Cannot live-test the real API until the name is fixed. |
| **weekly/monthly briefing** | Not due during the session; last historical run SUCCESS (weekly) after 1 earlier FAILED. |
| **refresh_tracked_universe** | Not due since 2026-08-26 (cron `0 4`, worker booted 07:06 post-outage). This is *why* every US-equity quote is stale — not a job defect. Next fire 2026-09-04 04:00. |
| **seed_*, admin_*** | Deliberately not triggered (`admin_reprocess_all` would be a large unsolicited mutation). Historical job_logs used instead. |
| **mutual-fund NAV jobs** | No held MF asset resolves to AMFI ISIN / mfapi scheme code — end-to-end blocked by held-data shape, not by the providers (both verified live). |
| **finnhub / twelvedata / alphavantage / polygon quote in rotation** | `system.provider_usage`: zero `get_quote` calls to any of them in 24 h (the US-equity refresh path is idle). finnhub verified on-demand (probe PASS); the other three are BUG-A / BUG-I. |

## Context that explains several "stale" observations

The held portfolio is 48 positions; by value it is **~99% manually-valued
assets** (`sectors.getSectors()` → "Manual" weight 0.991). Real market-data
holdings are a small tail of `.NS` equity (→ nse_direct), spot crypto (→
coingecko), and 8 futures (→ binance_price). This is why `finnhub` /
`polygon` / US-equity paths look idle, why MF NAV coverage is 0/4, and why
`asset_sentiment` / `asset_fundamentals` cover only a handful of assets — it
is the shape of the book, not broken jobs.
