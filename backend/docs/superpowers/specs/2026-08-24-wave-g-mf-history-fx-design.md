# Wave G: Mutual Fund Price History + FX Cross-Check — Design

## Context

The original provider audit flagged two gaps: mutual funds have no price
history (only today's NAV), and there's "no FX support anywhere." Investigation
before this design showed the FX half of that premise is stale — live
(`open.er-api.com`, cached) and historical (Frankfurter, persisted to
`fx_rate_history`) FX conversion already exist and work
(`src/lib/fx.ts`). The MF-history half is real but narrower than it looked:
`recordPriceHistory` already gets called from the daily AMFI bulk-NAV job, so
`PriceHistory` has been accumulating MF NAVs forward-only since that fix
landed. What's actually missing is backfill of pre-existing history, and a way
to resolve MF identity for funds that only have a name-slug symbol (no ISIN).

## Scope

1. Backfill full NAV history for **held** mutual fund assets that have a
   resolvable ISIN.
2. Attempt to resolve ISIN for held mutual funds that currently only have a
   name-slug symbol (no ISIN), non-destructively.
3. One-time live verification that the existing FX mechanism (live +
   historical) is accurate, cross-checked against an independent source. No
   FX code ships unless that verification turns up a real problem — if it
   does, that becomes its own follow-up, not folded into this wave.

## 1. MF NAV history backfill

### Provider choice: mfapi.in, not AMFI's `DownloadNAVHistoryReport_Po.aspx`

Live-checked both:
- AMFI's own per-scheme history page returns an empty JS-driven frameset (200
  OK, no data) — it requires form POST/session handling to extract anything,
  which is fragile to scrape and undocumented.
- `mfapi.in` (community-run, sourced from AMFI data) returns clean JSON:
  `GET https://api.mfapi.in/mf/{schemeCode}` returns `{ meta: { scheme_code,
  scheme_name, isin_growth, isin_div_reinvestment, ... }, data: [{ date, nav
  }] }` — full daily history since scheme inception, no auth needed.
  `GET https://api.mfapi.in/mf` returns the full scheme list (~5.7MB) with
  `schemeCode`, `schemeName`, `isinGrowth`, `isinDivReinvestment` per entry.

Use mfapi.in. It's an unofficial third-party API — a real dependency-risk
tradeoff — but the existing job already tags `LatestQuote.provider` as
`"mfapi"` even though it currently sources from AMFI's raw bulk file, which
reads as this having already been anticipated.

### Matching held assets to a scheme code

For MF assets whose `symbol` is `{ISIN}_MF` (the ISIN-preferred path,
confirmed live via `mfSymbolFor` in `src/lib/importers/mfSymbol.ts`): fetch
and cache the mfapi.in scheme list, build an `isin -> schemeCode` map from
`isinGrowth`/`isinDivReinvestment`, and look up each held MF's ISIN directly.
This is an exact match — no fuzzy logic involved.

### Backfill job

New job `src/jobs/backfillMutualFundNavHistory.ts`, following the existing
manually-triggered pattern (`src/jobs/refreshMutualFundNavs.ts` +
`scripts/triggerRefreshMutualFundNavs.ts`):

1. List held mutual_fund assets (positions with quantity > 0), same query
   shape as `listMutualFundAssetsWithQuotes()`.
2. Resolve each to a scheme code (ISIN match, see above; falls through to
   §2 for slug-only assets).
3. For each resolved scheme, `GET /mf/{schemeCode}`, parse `data[]`, and
   write through the existing `recordPriceHistory(tx, assetId, symbol, nav,
   timestamp)` path — same idempotent `createMany` + `skipDuplicates`
   deterministic-UUID write equities/crypto already use, so reruns are safe.
4. Report matched / unmatched / written-row-count, same shape as the existing
   job's `unmatched` reporting.

No new DB table or migration — this reuses `PriceHistory` as-is.

## 2. Resolving ISIN for slug-only held MFs

Only funds Groww's holdings-snapshot import produces (no ISIN column in that
source at all) hit this path; CAS PDF and other CSV imports already write
ISIN-based symbols via `mfSymbolFor` whenever the source has one.

For each held, slug-only MF asset: call mfapi.in's `GET
/mf/search?q=<name>` (server-side name search — no custom fuzzy-matching
code needed) using the asset's stored display name (not the truncated
40-char symbol slug, to avoid truncation-induced false negatives).

**Match policy:** auto-accept only an exact match after normalizing both
sides (uppercase, strip non-alphanumerics) — the same normalization
`mfSymbol()` already applies. Anything short of exact gets logged as
"needs manual review," not auto-applied. Given this project's history with
financial-identity bugs (GBp/GBP, the ledger multiplier bugs), a wrong
fuzzy match would silently attach one fund's price history to a different
fund — that risk isn't worth the coverage gain.

On an exact match: store the resolved `{ isin, schemeCode }` in
`Asset.metadata` (existing freeform `Json?` field, no migration). Do **not**
rewrite `Asset.symbol` — `LatestQuote` is keyed by symbol as its id, so a
live rename would orphan the current-quote row. The stored metadata is used
only by the backfill job in §1 to resolve a scheme code for history
purposes; it doesn't change how the asset is identified anywhere else in the
app.

## 3. FX cross-check (verification only, no code)

Live-verify the existing mechanism instead of building a new one:

- Compare `getFxRates()` (live, open.er-api.com) against
  `getHistoricalFxToInr()` (Frankfurter, today's date) for 2-3 pairs
  (USD/INR, GBP/INR, EUR/INR).
- Cross-check both against a third, independently-sourced rate looked up
  directly during verification (not code — a manual/web lookup at
  verify-time).
- Report the deltas. If all three agree within a small tolerance (e.g. ~1%),
  no FX changes ship. If they don't, that's flagged as a separate follow-up
  investigation, not fixed inline in this wave.

## Testing

- Unit: scheme-code matching (ISIN exact match, name exact-match-only
  policy — including a case that must NOT auto-match).
- Integration: backfill job against a real held MF, asserting `PriceHistory`
  rows land correctly and reruns don't duplicate (`skipDuplicates` behavior).
- Live verification (manual, part of this wave's sign-off, not automated
  tests): real historical NAV for a real held fund rendering in the existing
  price-history chart UI; the FX delta check in §3.

## Out of scope

- Any FX code changes (pending the cross-check outcome).
- Fuzzy/best-effort matching for ambiguous fund-name searches.
- Backfilling non-held mutual_fund Asset rows.
- Backfilling equities' history further than already covered by
  `getPriceHistory`.
