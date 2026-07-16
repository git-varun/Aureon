# Mutual Fund / NPS / EPF NAV Ingestion — Scope

Status: **draft for review, no implementation yet**

## 1. Why this exists

Mutual fund, NPS, and EPF holdings never get a live valuation today. Tracing the
actual price-resolution path confirms this precisely:

`resolve_position_price` (`portfolio.py:58-96`) checks `LatestQuote` first, and
only falls back to `Position.avg_buy_price` (labeled `price_source="cost_basis"`)
when no `LatestQuote` row exists for the symbol:

```python
quote = session.scalar(select(LatestQuote).filter_by(symbol=pos.symbol))
if quote and quote.price is not None:
    ...
return PositionPrice(float(pos.avg_buy_price), "cost_basis", None, None)
```

`ensure_asset_exists` (`market.py:106-146`) explicitly never seeds a
`LatestQuote` row: *"LatestQuote is intentionally NOT seeded here: it must only
ever hold a real ingested (or manually-entered) price."* And the only writer of
`LatestQuote` — `ingest_quote`/`ingest_all_quotes` (`workers/ingestion/tasks.py`)
— routes every non-`crypto_futures` symbol to the `yahoo` adapter:

```python
provider_name = "binance_price" if asset_class == "crypto_futures" else "yahoo"
```

`list_symbols_for_quote_ingestion()` pulls from *all* `Asset` rows regardless of
class, so `mutual_fund`/`nps`/`epf` symbols already get fanned into this hourly
cycle today and presumably fail against Yahoo every time (Yahoo has no ISIN-
keyed Indian MF/NPS/EPF tickers) — a pre-existing, silent, per-symbol failure
this build will need to stop causing, not just leave alone. Flagged here since
it's adjacent but distinct from the "add a new feed" work.

**Net effect today:** an MF/NPS/EPF position's value is frozen at whatever
`avg_buy_price` was set to at the last statement import (`recalculate_position`
copies the imported `broker_snapshot` transaction's price into
`Position.avg_buy_price` — see §3), and never refreshes between re-imports.

## 2. What's already there vs. what's missing

Checked before assuming:

- **`import_cdsl_cas` already parses real NAV and throws it away.**
  `parse_cdsl_cas` (`portfolio_importer.py:482-590`) builds a payload with both
  `avg_buy_price` (historical cost-basis NAV) and `current_price` (the actual
  NAV as of the CAS statement date, parsed straight out of the PDF tables). But
  `import_cdsl_cas` (`portfolio.py:554-611`) only ever reads
  `p["avg_buy_price"]` — `p["current_price"]` is never referenced anywhere
  after `parse_cdsl_cas` returns. This is the cheapest, most concrete gap to
  close (§4).
- **`parse_nps_statement` also parses a real per-scheme NAV** (`current_nav`,
  `portfolio_importer.py:684`) from the statement CSV, and unlike CDSL CAS,
  `import_nps_statement` *does* use it — but only as `Transaction.price` (cost
  basis feeding `Position.avg_buy_price`), never into `LatestQuote`. Same gap,
  different asset class (§6).
- **`RetirementProvider`** (`interfaces.py:188-193`) is a real interface —
  `class RetirementProvider(ProviderProtocol): @abstractmethod def sync(...)`
  — but has zero implementations anywhere in the repo. Confirmed via grep.
- **`epf`/`nps`/`mf` broker-type `ProviderConfig` rows are `PLANNED`** (never
  implemented), and **`epf_ppf_valuation`/`nps_valuation` provider rows are
  marked `ACTIVE` but are dead** — grepped every reference; nothing in the
  codebase ever looks these names up by string or by `provider_type ==
  "valuation"`. There is no interest-accrual formula or valuation engine
  behind them; they're inert `ProviderConfig` rows that only render in the
  Settings/Providers UI as roadmap placeholders. This contradicts the stated
  seeding policy (only providers with a real adapter get `ACTIVE`/`PARTIAL` —
  see `config.py:99-103`) — worth a cleanup note, not fixed in this build.
- **An `mfapi` price-provider row already exists**, `status: "PLANNED"`,
  and the frontend already has a UI label for it —
  `frontend/src/pages/aureon/Onboarding.jsx:36`:
  `mfapi: { ..., name: 'MFAPI', kind: 'Price', scope: 'Mutual fund NAVs' }`.
  Someone already anticipated this build. Whether to reuse this row/name for
  the AMFI adapter (§5) or introduce a distinct `amfi` row is an open question
  (§9).

## 3. How EPF/NPS get valued today (traced end to end)

Statement-import snapshot, not a valuation provider:

1. `parse_nps_statement`/`parse_epf_statement` extract a point-in-time
   NAV (NPS, per scheme) or lump-sum balance (EPF, no per-unit concept) from
   the uploaded statement.
2. `import_nps_statement`/`import_epf_statement` (`portfolio.py:613-827`)
   upsert a `Transaction(kind="broker_snapshot", broker="nps"/"epf", price=...)`.
3. `recalculate_position` (`portfolio.py:302-404`) has no `kind="trade"`
   ledger for these, so it falls back to the latest `broker_snapshot` and
   copies its price straight into `Position.avg_buy_price`.
4. `resolve_position_price` finds no `LatestQuote` row (§1) and returns that
   frozen `avg_buy_price` as `price_source="cost_basis"`.

There's also a separate manual-entry path (`POST /manual-assets`,
`_TRADEABLE_ASSET_CLASSES` check at `portfolio/api/portfolio.py:356`) for
users who'd rather type in `current_value` directly — unrelated to either
statement import or the dead valuation-provider rows.

**`_TRADEABLE_ASSET_CLASSES = {"stock", "stocks", "equity", "mutual_fund",
"etf", "crypto"}`** — mutual funds *are* tradeable (quantity × NAV, same shape
as equities) and already flow through the ingestion → snapshot → features →
scores pipeline structurally, just with no data source. NPS/EPF are excluded
by design — "no meaningful quantity/price split" per the comment at
`portfolio.py:353-355`. NPS is a partial exception in practice: it does have
real per-scheme units/NAV internally (see `parse_nps_statement`), it's just
not classified as tradeable at the API/manual-asset layer. EPF is a true
lump-sum balance with no NAV concept at all.

## 4. Piece A — wire CDSL CAS's already-parsed NAV into `LatestQuote`

Smallest, most concrete, no new provider, no migration.

**Change:** in `import_cdsl_cas`, when `p["current_price"]` is present, upsert
`LatestQuote` (same `upsert_quote`-style pattern already used by
`IngestionRepository`, keyed by `symbol`, `provider="cas_cdsl_import"`) in
addition to the existing cost-basis `Transaction` write. No schema change
needed: `LatestQuote` has no `price_source` column — that value is computed at
read time by `resolve_position_price`, which already handles this correctly
with zero extra plumbing:
- Not flagged `is_manual` (no `Asset.metadata_payload.sector == "Manual"`).
- Not `price == 0` (real parsed NAV).
- → falls straight into `price_source="market"`, `quote_age_status` computed
  from `updated_at` (the import timestamp).

**Why this is worth doing even though it's still a snapshot, not a live
feed:** `current_nav` (actual NAV as of the CAS statement date) is a
materially better number than `avg_buy_price` (historical purchase-time cost,
unrelated to current value) — even if both go stale between statement
uploads, one is a genuinely better "best available" price. Same logic applies
to `import_nps_statement`'s already-parsed `current_nav` (§6) — same fix,
same file, same pattern, trivially bundled.

**Known rough edge:** `_quote_age_status` uses 5-min/15-min live/fresh bands
(`portfolio.py:36-37`) designed for continuously-traded equities. A mutual
fund NAV is genuinely only ever as fresh as its last statement import or
AMFI's once-daily publish (§5) — it will always read "stale" under those
bands, which is misleading (a fund NAV that's 20 hours old is *normal*, not
degraded). Flagged for §9, not decided here.

## 5. Piece B — ongoing NAV beyond CAS imports: AMFI is real and reachable

Checked, not assumed. AMFI (Association of Mutual Funds in India) publishes an
official daily NAV file, confirmed live and fetched directly:

```
https://www.amfiindia.com/spages/NAVAll.txt   (redirects to portal.amfiindia.com)
```

Semicolon-delimited, ISIN-keyed, updated daily:
```
Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
119551;INF209KA12Z1;INF209KA13Z9;Aditya Birla Sun Life Banking & PSU Debt Fund - DIRECT - IDCW;106.6946;10-Jul-2026
```
Covers every AMC/scheme in India (thousands of rows across the full file), no
authentication, no key. AMFI also serves historical NAV via a separate
endpoint, capped at 90 days per request. Several third-party wrappers
(mfapi.in, tigzig, GitHub `amfinav`) exist but the official source itself is
directly fetchable — no need to depend on an unofficial intermediary.

**Symbol/join key:** existing CDSL-CAS-derived MF symbols are already
ISIN-based (`f"{isin}_MF"`, `portfolio_importer.py:573`) — AMFI's file is
ISIN-keyed too, so the join is direct with no new symbol scheme needed.

**Provider shape:** `MarketDataProvider.get_quote(symbol) -> NormalizedQuote`
is built around one HTTP call per symbol (matching Yahoo/Finnhub/Polygon,
which are all single-ticker APIs). AMFI is the opposite shape — one bulk file
covering everything, refreshed once daily. Forcing that through
`get_quote(symbol)` called once per held MF symbol would mean re-downloading
and re-parsing the entire multi-thousand-row file per symbol per task run.
**Recommend:** the ingestion task downloads and parses the file once per run,
builds an ISIN→NAV dict in memory, then iterates only the ISINs actually held
(via a new `list_mutual_fund_assets_with_quotes()`-style repo method,
mirroring `list_equity_assets_with_quotes()` at `ingestion.py:107-118`) and
upserts `LatestQuote` directly — same overall shape as
`refresh_fundamentals_task` (`workers/ingestion/tasks.py:408-451`), not the
per-symbol `ingest_quote` fan-out shape used for equities.

**Cadence:** AMFI publishes once daily (typically after market close). A
dedicated daily beat entry, e.g. `crontab(hour=23, minute=0)`, analogous to
`refresh-fundamentals` — **not** the existing hourly `refresh-prices`
cadence. This also requires explicitly excluding `mutual_fund`-class symbols
from the generic `ingest_all_quotes` → Yahoo routing (§1's pre-existing
failure-generating bug) so the new daily task is the only writer.

**Provider registration:** either promote the existing `mfapi` `ProviderConfig`
row to `ACTIVE` (reusing the name already surfaced in
`Onboarding.jsx`) or add a new `amfi` row — open question (§9).

## 6. Piece C — NPS: real API or not? Checked, mixed answer

NPS is structurally closer to mutual funds than to EPF — it has real
per-scheme NAV and units (confirmed in `parse_nps_statement`). But there is
**no official machine-readable bulk feed equivalent to AMFI's `NAVAll.txt`**.
What exists:

- NPSCRA/Protean (the NPS Central Recordkeeping Agency, migrated from
  `npscra.nsdl.co.in` to `npscra.proteantech.in`) has a public **NAV search
  web page** (`nav-search.php`) — a page for humans, not a documented API.
- Third-party trackers (`npsnav.in`, GitHub `rishikeshsreehari/npsnav`) exist
  and claim daily-updated per-PFM/scheme NAV, but these are unofficial —
  they scrape or replicate the NPSCRA page, with no published SLA or terms
  guaranteeing continued access, format stability, or accuracy.

**This is a real, qualitatively different risk than AMFI**, not just "less
convenient." Building against an official daily file (§5) vs. building
against a third party's scrape of a government portal not intended for
programmatic access are different commitments — the former is a data
pipeline, the latter is a dependency on someone else's scraper staying up.

**Recommendation for v1:** ship the same statement-import NAV wiring as
CDSL CAS (§4) for NPS — `import_nps_statement` already parses `current_nav`
per scheme; the fix is identical (write it into `LatestQuote` in addition to
`Transaction.price`, no new provider, no migration). **Defer a live/automated
NPS feed as a separate, explicitly-flagged decision** — whether to depend on
an unofficial scraper-backed source is a product/risk call, not a technical
one, and shouldn't be bundled into this build's default scope.

## 7. Piece D — EPF: checked, no viable automated feed exists

EPFO (Employees' Provident Fund Organisation) has **no public API**. The
official passbook (`passbook.epfindia.gov.in`) is credential-gated — UAN +
password/OTP, i.e. logging in as the specific member. Third-party "EPFO
Passbook API" offerings (Surepass and similar) exist for enterprise KYC use
cases, but they work by automating that same login flow with the user's own
credentials against a government portal — a different, higher-risk category
(credential automation, ToS exposure) than a public data feed, and not
something to build without an explicit decision (§9).

EPF also has no NAV concept at all — it's a lump-sum balance that grows via
contributions (known, already captured per-row in `import_epf_statement`'s
transaction history) plus an annually-published interest rate (a single
government-set number, not a per-account feed). Computing an *estimated*
balance between statements via that rate is possible in principle, but it
would be a computed estimate presented alongside real ingested data — worth
weighing against [[feedback_no_fake_data_policy]] (never fabricate/fill
missing data; surface gaps rather than approximate them silently). An
explicitly-labeled estimate might be acceptable where a substitute for real
data would not be — that distinction is exactly the kind of call this scope
doc shouldn't make unilaterally.

**Recommendation: EPF stays out of scope entirely for this build.** No new
ingestion pipeline — not because it's low priority, but because no safe
automatable source exists. The statement-import path (re-upload periodically)
remains the only mechanism, same as today. `RetirementProvider` correctly
stays unimplemented for EPF.

## 8. Storage and cadence: does NAV hit the same overwrite problem as fundamentals?

Checked, not assumed — this is a real difference, not automatic.
`FUNDAMENTALS_SCORING_SCOPE.md` §4 documents that `AssetSnapshot` is
unconditionally overwritten by `process_asset_snapshot` on every quote cycle,
which is why fundamentals needed an isolated new table. Tracing the
equivalent path for NAV:

- **NAV's target is `LatestQuote`, not `AssetSnapshot`.** `LatestQuote` is
  upserted *per symbol* (`upsert_quote`, keyed by `symbol`, not a
  blanket per-asset overwrite of unrelated columns) — there's no
  "unconditionally null out this column every cycle" behavior the way
  `build_snapshot` hardcodes `pe_ratio=None`/`market_cap=None`.
- **The generic quote-refresh cycle cannot clobber a written NAV, verified,
  not assumed.** `YahooAdapter.get_quote` (`yahoo/provider.py:88-112`)
  explicitly raises `ProviderError` when no price field is populated:
  ```python
  if not price:
      raise ProviderError(f"No price returned by Yahoo Finance for symbol {symbol}")
  ```
  For an `ISIN_MF`-style symbol, `yfinance`'s `ticker.info` will have no
  `currentPrice`/`regularMarketPrice`/etc., so this always raises — and
  `ingest_quote` only calls `save_quote`/`upsert_quote` *after* `get_quote`
  returns successfully (`workers/ingestion/tasks.py`). The exception is
  raised, caught, and recorded via `record_failure` before ever reaching the
  upsert. There is no code path today where the hourly Yahoo cycle writes a
  `0.0` or otherwise overwrites a NAV value once one exists in `LatestQuote` —
  `LatestQuote.price` is `nullable=False` in any case, so even a `None`
  would fail the insert rather than silently zero it out.
- **This means the routing fix (§1/§5, excluding MF/NPS/EPF symbols from the
  generic Yahoo fan-out) is a noise/hygiene fix, not a safety dependency for
  Piece A or C.** Piece A/C can ship standalone, in front of Piece B, without
  their written NAVs being at risk from the pre-existing hourly cycle in the
  interim — confirmed by the code above, not inferred.

**Conclusion: no new table needed.** Unlike fundamentals, NAV can go through
the existing `LatestQuote`/`resolve_position_price` mechanism cleanly, and
Piece A/C are safe to ship before the routing fix, since the pre-existing
Yahoo cycle fails closed (raises) rather than writing a zero/overwriting
value for these symbols.

## 9. Sizing — independently shippable pieces

No prior NAV-ingestion build found in git history to size against (same
search performed as the fundamentals scope doc, same negative result).
Sized in absolute terms, same granularity as `FUNDAMENTALS_SCORING_SCOPE.md`:

1. **Piece A — CDSL CAS NAV wiring.** Smallest. One code change in
   `import_cdsl_cas` (write `current_price` into `LatestQuote`), no migration,
   no new provider. Same-shaped fix bundles trivially for
   `import_nps_statement`'s already-parsed `current_nav` (§6). **Self-contained,
   ships independently, no open questions blocking it except the freshness-band
   mismatch (§4) and the `price_source="market"` labeling choice (§9 below).**
2. **Piece B — AMFI daily feed.** New provider adapter (bulk-file shape, not
   per-symbol `get_quote`), new repo method, new daily Celery task + beat
   entry, provider-config row decision (reuse `mfapi` vs. new `amfi`), and the
   routing exclusion fix (§1/§8). Moderate, self-contained, no new table.
3. **Piece C — NPS statement-NAV wiring.** Same code shape as Piece A
   (near-zero additional cost once Piece A ships). A live/automated NPS feed
   (scraping-dependent, §6) is explicitly **not** bundled — flagged as a
   separate follow-up requiring its own risk sign-off.
4. **Piece D — EPF.** Out of scope entirely (§7). No work item.

Recommended sequencing: **A, then C (near-zero marginal cost), then B**
(the only piece needing a new provider/task/schedule). NPS live feed and any
EPF accrual estimation are explicitly deferred, not silently dropped.

## 10. Open questions for confirmation before implementation starts

1. Piece A (CDSL CAS) + Piece C (NPS statement-NAV) — same-shaped fix, ship
   together as one small build? Agreed the "frozen at last statement" status
   quo is worth improving even though it's still snapshot-not-live data?
2. Piece B (AMFI) — build the daily bulk-file adapter as scoped (§5), reusing
   the existing `mfapi` `ProviderConfig` row (renaming/repurposing it) rather
   than adding a new `amfi` row? Or keep them distinct?
3. NPS live/automated NAV feed (§6) — is depending on an unofficial
   scraper-backed source (no official NSDL/Protean API exists) acceptable, or
   should NPS stay statement-import-only (Piece C) until/unless an official
   API appears? This is a risk/product call, not decided here.
4. EPF (§7) — confirmed out of scope entirely (no safe automatable source),
   not even an interest-accrual estimate? Flagging explicitly since an
   estimate is technically possible but conflicts with the no-fake-data
   policy unless clearly labeled as an estimate, not a real balance.
5. `_quote_age_status`'s 5-min/15-min live/fresh bands (§4) will always show
   MF/NPS `LatestQuote` rows as "stale" once this ships, since NAVs only
   update once daily by design. Needs an asset-class-aware freshness band
   (e.g. NAV: live < 24h, fresh < 48h) — in scope for this build, or a
   follow-up?
6. Cleanup, out of scope but noted: the six `provider_type: "valuation"` rows
   (`bond_valuation`, `epf_ppf_valuation`, `eps_valuation`, `nps_valuation`,
   `insurance_valuation`, `real_estate_valuation`) are marked `ACTIVE` with
   zero implementation, contradicting the stated seeding policy. Worth a
   separate small cleanup (demote to `PLANNED` or remove) — not bundled here
   since it's unrelated to NAV ingestion specifically.
7. Should `ingest_all_quotes`'s routing bug (§1 — every non-`crypto_futures`
   asset, including `mutual_fund`/`nps`/`epf`, gets routed to Yahoo and fails
   silently every hour) be fixed as part of Piece B, or is it acceptable to
   fix it standalone/separately since it's a pre-existing issue this build
   merely makes more visible? (Confirmed in §8 this is a noise/hygiene fix,
   not a safety dependency — Piece A/C's written NAVs aren't at risk from it
   either way.)
8. Provenance labeling: `resolve_position_price` derives `price_source` from
   `is_manual`/`price==0`/else only — it never looks at `LatestQuote.provider`.
   So a statement-imported NAV (Piece A/C, potentially months stale between
   uploads) and a live daily-feed NAV (Piece B) will both render identically
   as `price_source="market"`, indistinguishable to the user or any
   downstream consumer. Given [[feedback_no_fake_data_policy]]'s emphasis on
   not letting stale/derived data pass as equivalent to real-time data,
   should statement-imported NAV carry a distinct `price_source` (e.g.
   `"nav_statement"` vs. `"nav_live"`) instead of collapsing into the
   existing `"market"` label? This is a separate concern from #5 (staleness
   *display* bands) — this is about *provenance*, not freshness.
