# Quality & Valuation Scoring — Scope

Status: **draft for review, no implementation yet**

## 1. Why this exists

`quality_score` / `valuation_score` on `AssetScore` are currently always `None`
(`recommendation.py:449-452`), explicitly marked `unavailable_inputs`, on purpose —
a prior fix removed hardcoded `0.8`/`0.7` placeholders rather than let fabricated
scores drive real decisions. But `_score_and_materialize` (`recommendation.py:80-90`)
requires **both** to be non-`None` before it will run the rule engine at all:

```python
required_factors = (
    features.momentum_score, features.volatility_score, features.sentiment_score,
    scores.quality_score, scores.valuation_score,
)
if any(f is None for f in required_factors):
    return None  # recommendation materialization never runs
```

So no asset — regardless of how good its momentum/volatility/sentiment data is —
ever gets a BUY/REDUCE/AVOID/HOLD recommendation today. This build supplies real
`quality_score`/`valuation_score` so materialization can turn on.

## 2. Scope decision: equities only, real. Everything else stays "unavailable" by design.

The portfolio spans equity (NSE/US via Zerodha/Groww), crypto (Binance spot +
futures), mutual funds, NPS, EPF. Checked what's actually reachable:

- **NPS/EPF are never quoted.** `_TRADEABLE_ASSET_CLASSES` (`portfolio.py:356`)
  is `{stock, stocks, equity, mutual_fund, etf, crypto}` — NPS/EPF are
  manually-valued, never get a `LatestQuote` row, and therefore never enter the
  ingestion → snapshot → features → scores pipeline at all. There is nothing to
  score; this isn't a gap, it's structural.
- **Crypto has no fundamentals analog.** P/E, P/B, ROE, debt ratios don't apply
  to BTC/ETH. A crypto-specific "quality" proxy (network activity, staking
  yield, etc.) is a different feature with its own data source — out of scope
  here.
- **Mutual funds are marked tradeable but have no fundamentals provider.**
  Grepped the codebase: there's no AMFI/NAV provider, and yfinance doesn't carry
  Indian MF fundamentals. Funds need expense-ratio/NAV-based metrics, which is a
  different methodology and a different data source than equities. Out of scope
  here; stays `unavailable`.
- **Equities are the only class where real data exists today**, via a source
  already integrated (see §3).

**Recommendation: this build computes real `quality_score`/`valuation_score`
for `asset_class == "equity"` only.** Crypto/funds/retirement continue
returning `unavailable_inputs` — not a regression, the honest state. Flagging
this for explicit confirmation since it determines everything downstream.

## 3. Data source: no new provider needed

Yahoo (`yahoo/provider.py`) is already integrated and already fetches
`ticker.info` inside `get_quote()` — but only extracts `currentPrice`/`volume`
from it. That same dict carries fundamentals unused today:

`trailingPE`, `forwardPE`, `priceToBook`, `returnOnEquity`, `debtToEquity`,
`profitMargins`, `revenueGrowth`, `earningsGrowth`, `dividendYield`, `beta`,
`marketCap`, `sector`, `industry`. Verified none of these field names appear
anywhere else in the codebase — fully unused.

Finnhub declares `Capability.FUNDAMENTALS` (`finnhub/provider.py:24`) but
implements no fundamentals method — a declared-but-dead capability, not a
usable source. No new provider integration needed for v1; add an optional
`get_fundamentals(symbol) -> dict` to `YahooAdapter`, same pattern as the
existing optional `get_technical_indicators` (`MarketDataProvider` already
defines that as non-abstract, default `NotImplementedError` —
`interfaces.py:78-81`).

Known limitation: yfinance fundamentals coverage for NSE (`.NS`) tickers is
patchy (large-caps generally populated, smaller names often have several
fields missing). This is the normal case, not an edge case — see §5.2.

## 4. Storage: a dedicated `AssetFundamentals` table, not `AssetSnapshot` columns

`AssetSnapshot` already has `pe_ratio` and `market_cap` columns — both always
written as `None` today. But `AssetSnapshot` has one row per asset
(PK = `asset_id` alone) and is **rebuilt on every quote cycle**:
`process_asset_snapshot` runs on the ~300s quote-refresh cadence and
`build_snapshot` unconditionally upserts `pe_ratio=None, market_cap=None`
(`snapshot.py:33-34`) into those columns every time
(`asset_snapshot.py:25,39` — a plain overwrite, not a merge). Putting
fundamentals columns on `AssetSnapshot` and populating them on a *daily* cadence
(§7) means the next 300s quote cycle nulls them out again within minutes —
the storage choice and the cadence design directly conflict.

Considered:
- **(a) Add typed columns to `AssetSnapshot`.** Consistent with the existing
  `pe_ratio`/`market_cap` precedent, but breaks under the current
  quote-cycle upsert behavior as described above — would additionally require
  changing `build_snapshot` to preserve fundamentals fields instead of
  hardcoding `None`, which touches quote-refresh code outside this feature's
  natural boundary.
- **(b) Stuff raw fundamentals into `AssetSnapshot.payload` JSON.** Avoids the
  overwrite problem (payload already survives across cycles by being replaced
  wholesale each time with `indicators`, not merged with fundamentals — so
  this still doesn't survive), and loses typing/queryability. Not viable either.
- **(c) New `AssetFundamentals` table, one row per asset, written only by the
  daily fundamentals task.** Typed and queryable like (a), but cadence-isolated
  from the quote-refresh cycle like (b) intends — no other task touches it, so
  nothing nulls it out between daily runs.

**Recommendation: (c).** A small new table (`asset_id` PK/FK to
`asset_snapshot.asset_id`, one column per metric, `updated_at`) mirroring
`AssetHealth`'s shape, populated only by the new daily fundamentals task.
Needs one migration.

`AssetHealth.fundamentals_age_seconds` (`market.py:54`) and
`SLA_FUNDAMENTALS_MAX_AGE_SEC = 86400` (`config.py:48`) already exist and are
currently unused — the original schema was pre-scoped for a fundamentals
pipeline on a *daily* cadence, distinct from the 300s quote-refresh SLA. This
build fills that pre-existing hook rather than inventing a new one.

## 5. Scoring methodology

### 5.1 Metric split and polarity

`_score_and_materialize` reads `valuation >= 0.7` as "strong underpricing" (BUY
gate) and `valuation < 0.4` as overvalued (REDUCE gate, `recommendation.py:106,118`).
**High `valuation_score` = cheap.** Easy to invert by accident — calling it out
explicitly so it's checked at implementation and in review.

| Score | Metric | Direction |
|---|---|---|
| `valuation_score` | trailing P/E | lower → higher score (cheaper = higher) |
| `valuation_score` | P/B | lower → higher score (cheaper = higher) |
| `valuation_score` | dividend yield | **higher → higher score** (more yield = cheaper/more value) — opposite of P/E and P/B, easy to get wrong |
| `quality_score` | ROE, profit margins, revenue growth | higher → higher score |
| `quality_score` | debt/equity | lower → higher score |

`market_cap` is not a scoring input — it already has a separate life (position
sizing, diversification) and isn't a quality/valuation signal by itself.

### 5.2 Normalization: absolute bands, not sector-relative percentile

Considered sector-relative percentile ranking (score = percentile within
sector peers). Rejected for v1:

- The only sector mapping that exists (`SYMBOL_SECTOR_MAP`, `market.py:31-40`)
  covers just the 30-symbol canonical seed universe. Real portfolios (Zerodha/
  Groww holdings) aren't restricted to that list — most imported holdings would
  have no sector at all, so sector-relative ranking wouldn't generalize past
  the seed set.
- Even within `SYMBOL_SECTOR_MAP`, most sectors have 3-5 members (Financials: 3,
  Telecom: 1, Auto: 1) — too few peers for a percentile rank to mean anything.
  "IT" also pools US mega-cap tech (AAPL, MSFT, NVDA) with Indian IT services
  (TCS, Infosys) under one bucket, which have structurally different valuation
  multiples — pooling them would produce misleading percentiles, not just noisy
  ones.

**Recommendation: fixed absolute thresholds per metric**, mapped to a 0-1
score via clamped linear interpolation between a "cheap/strong" bound and an
"expensive/weak" bound (e.g. P/E ≤ 15 → 1.0, P/E ≥ 40 → 0.0, linear between).
Bounds need to be stated as explicit reviewable constants in the implementation
plan, not invented ad hoc during coding — this scope doc is not the place to
finalize exact numbers, but the shape of the approach is what's being decided
here. Sector-aware bands are a legitimate future refinement once sector
coverage extends past the seed universe; not v1.

### 5.3 Partial data — the common case, not an edge case

yfinance fundamentals for NSE tickers routinely have some fields missing.
Per [[feedback_no_fake_data_policy]] (in memory: never fabricate/fill missing
data), a missing P/B cannot default to a neutral value. Follow the pattern
already used for `recommendation_score` in this same file
(`recommendation.py:411-442`): renormalize the weighted average over whichever
metrics are actually present, and append the missing ones to
`unavailable_inputs`.

**Cutoff below which the whole score goes `unavailable` rather than partial:**
recommend requiring at least 2 of the 3 valuation metrics and 2 of the 4
quality metrics present — a single-metric "quality score" is not a signal the
BUY/REDUCE gates should be allowed to act on. This is a judgment call, flagged
for confirmation, not inferred from existing code (no precedent for a cutoff
threshold exists yet — `recommendation_score` computes from as few as 1 of 3
inputs today).

## 6. Downstream impact — flagging, not fixing

**Under this scope, crypto never gets a recommendation, permanently.**
`_score_and_materialize` requires both `quality_score` and `valuation_score`
non-`None`. Since §2 scopes real fundamentals to equities only, BTC-USD/ETH-USD
(which do flow through the full ingestion → snapshot → features → scores
pipeline today, unlike NPS/EPF) will keep `quality_score`/`valuation_score` as
`None` forever — permanently dark, not "unavailable until this build ships."
If crypto recommendations driven by momentum/sentiment/volatility alone are
wanted, that requires an asset-class-aware relaxation of the
`_score_and_materialize` gate — a rule-engine change, correctly out of scope
per the point below, but worth deciding explicitly rather than discovering
after this ships that crypto still never recommends anything.

The rule engine's thresholds (`valuation >= 0.7` → BUY, `< 0.4` → REDUCE,
`0.5 * quality + 0.5 * (1 - volatility)` for HOLD confidence) were never tuned
against real fundamentals-derived scores — they were written against the old
fabricated `0.7`/`0.8` constants, which by definition always satisfied the BUY
gate. Real scores will have a different, wider distribution. **Recalibrating
those thresholds is explicitly out of scope for this build** — this build's
job is to stop returning `None`. Whether `0.7`/`0.4` are still the right cut
points once real numbers are flowing is a follow-up, not silently bundled in.

## 7. Sizing

No comparable prior build was found in git history to size against directly
(searched for a "NAV ingestion" commit referenced informally — not found), so
this is sized in absolute terms:

- 1 migration: new `AssetFundamentals` table (P/E, P/B, ROE, debt/equity,
  profit margin, revenue growth, dividend yield, `updated_at`) per §4c.
- 1 provider method: `YahooAdapter.get_fundamentals(symbol)`, extracting the
  already-fetchable `ticker.info` fields (no new external dependency).
- 1 new scoring function (equities-only quality/valuation calc + partial-data
  renormalization + cutoff logic), called from `generate_and_score_asset`
  (`recommendation.py:375-499`) in place of the current hardcoded `None`s.
- 1 ingestion wiring change: a fundamentals fetch on the existing daily
  `SLA_FUNDAMENTALS_MAX_AGE_SEC` cadence, decoupled from the 300s quote
  refresh (fundamentals don't change intraday; no need to hit yfinance's
  heavier `.info` call on every price cycle).
- `AssetHealth.compute()` already has an unused `fundamentals_age_seconds`
  slot (`asset_health.py:132`, currently hardcoded `None`) — wire it to the
  new fundamentals snapshot timestamp.

This is a self-contained, moderate build: no new provider, no new Celery
infra pattern (reuses the existing task-chain and `_skip_if_disabled`/SLA
conventions), one migration, one new scoring function.

## 8. Open questions for confirmation before implementation

1. Equities-only real scoring, crypto/funds/NPS/EPF stay `unavailable` — agree?
2. New `AssetFundamentals` table (§4c) — agree, given the quote-cycle overwrite
   problem with putting fundamentals on `AssetSnapshot` directly?
3. Absolute threshold bands (not sector-percentile) for v1 — agree, given the
   sector-coverage gap for non-seed holdings?
4. Minimum-metrics-present cutoff (2-of-3 valuation, 2-of-4 quality) before a
   partial score is computed at all, vs. always computing from whatever's
   present (mirroring `recommendation_score`'s more permissive existing rule)?
5. Rule-engine threshold recalibration (§6) — confirmed out of scope / follow-up?
6. Crypto will permanently never get a recommendation under this scope (§6) —
   acceptable, or should an asset-class-aware gate relaxation (letting crypto
   materialize off momentum/volatility/sentiment alone, skipping the
   quality/valuation requirement) be scoped in alongside this build rather
   than left as an unscoped follow-up?
