# Crypto symbol/value rendering audit — LD* wrapper tokens & *_PERP futures

Status: **CHECKPOINT — audit only, no code changed.** Working tree had pre-existing
uncommitted changes unrelated to this audit (see "Working tree" note below);
nothing in this file's investigation touched code.

All findings below were live-verified against the running stack (`aureon_api`,
`aureon_postgres`) on 2026-07-16, portfolio `199dc55b-f7d0-4a8c-8ba2-19d4ec1c2817`,
via `GET /api/v1/portfolio/portfolios/{id}/positions`, `GET /api/v1/assets?search=`,
and direct `psql` reads of `market.latest_quotes` / `market.price_history`.

## Working tree note

`git status` at session start showed unrelated uncommitted changes (deleted
`app/domain/`/`app/infrastructure/` `__init__.py` shims, modified files across
several modules) plus several untracked scope docs and `backend/scripts/init.sql`.
This matches previously-recorded context: known in-progress refactor/cleanup work
on this branch, not something this session touched or needs to resolve. Flagging
per instructions, but not blocking — this audit made no edits.

---

## Class 1: Binance COIN-M perpetual futures (BTCUSD_PERP-COINM, ETHUSD_PERP-COINM)

**Symbol reality check — resolved, not a mystery:** only the `-COINM`-suffixed
symbols exist as *positions* (`BTCUSD_PERP-COINM`, `ETHUSD_PERP-COINM`).
Binance's USDⓈ-M side of this portfolio is held under entirely different pair
names (`BTCUSDT-USDM`, `ETHUSDT-USDM`, via `WALLET_SUFFIXES` in
`backend/app/core/binance.py`) — those are not the same instrument as
`BTCUSD_PERP`. The bare `BTCUSD_PERP`/`ETHUSD_PERP` in the symptom description
is simply the **display name**, not a separate symbol: `/assets?search=` for
`BTCUSD_PERP-COINM` returns `"name": "BTCUSD_PERP"` (set from Binance's raw
`symbol` field in `_sync_futures_positions`, `portfolio.py:1210,1219` —
`raw_symbol` becomes `name`, `f"{raw_symbol}-{suffix}"` becomes the ticker).
The brief's four-item symptom list is two positions, ticker and display name
both listed.

**Live data pulled for `BTCUSD_PERP-COINM`:**
```json
{
  "symbol": "BTCUSD_PERP-COINM", "wallet": "futures_coinm",
  "avg_buy_price": 66025.68, "leverage": 2.0,
  "liquidation_price": 44400.57, "unrealized_pnl": -0.00014,
  "side": "LONG", "price": 64068.7, "price_source": "market",
  "quote_age_status": "stale"
}
```
`GET /api/v1/assets?search=BTCUSD_PERP-COINM` → `price: 64068.7, dayPct: 0.0216,
class: "crypto"` (real, non-fabricated values — 98 PriceHistory rows spanning
9 days for this asset).

### Finding 1.1 — CONFIRMED, no bug: liquidation price is not misrouted

`Position.liquidation_price` is a dedicated column
(`backend/app/modules/portfolio/services/portfolio.py:1238`,
`_sync_futures_positions`), written from Binance's own `positionRisk`
response, never conflated with current value/price. Value calc
(`generate_portfolio_snapshot`, `portfolio.py:560-567`) correctly uses
margin + unrealized PnL for futures, not `qty * markPrice`. Frontend
(`PfHoldingsTable.jsx:118-121`, `HoldingSubRow.jsx:31-34`) reads
`h.liquidationPrice` into its own dedicated "Liq." field, never overwriting
price/value. **The user's suspicion that Liq. lands in the wrong field does
not reproduce — this path is correct as built.**

### Finding 1.2 — CONFIRMED, real bug, and this is the actual "0.0%" symptom: COIN-M P/L% collapses to ~0.0% because contracts and coin-quantity units are mixed

The Holdings table row layout for a futures position
(`HoldingSubRow.jsx:24-54`) is: `[LONG 2x]` · `Liq. $X` · `—` (day Δ,
correctly guarded) · `$value` · **`P/L%`** (last column). "Liq. ₹X — ₹Y —
0.0%" is this exact row — the trailing `0.0%` is the **P/L% column**, not day
change. Live-computed from the two COIN-M positions:

- `BTCUSD_PERP-COINM`: `qty=5.0, avg_buy_price=66025.68, leverage=2.0,
  unrealized_pnl=-0.00013908` → `margin = |5×66025.68|/2 = 165,064.19` →
  `plPct = -0.00013908/165064.19 ≈ -8.4e-10` → renders **"−0.0%"**.
- `ETHUSD_PERP-COINM`: same shape → **"−0.0%"**.

Root cause (`frontend/src/components/aureon/utils.js:19-24`,
`marginOf(h) = |qty*cost|/leverage`, `plPctOf(h) = plOf(h)/costOf(h)`): for
Binance **USDⓈ-M** futures, `positionAmt` (→ `qty`) is coin-denominated (e.g.
BTC), so `qty × entryPrice(USD) / leverage` is a real USD margin figure. For
**COIN-M** futures, Binance's `positionAmt` is denominated in **contracts**,
not coins (a COIN-M contract is a fixed-notional instrument — e.g. $100/
contract for BTCUSD, $10/contract for ETHUSD; verify exact contract sizes
against Binance's dapi docs before implementing, not assumed here), and
`unRealizedProfit` for COIN-M is denominated in the **settlement coin** (BTC/
ETH), not USD. `margin = |qty(contracts) × entryPrice(USD)| / leverage`
therefore computes a number with no real financial meaning (contracts × USD
price is not a notional value), and dividing a BTC-denominated `unrealized_pnl`
by that inflated, wrong-unit denominator produces a number that rounds to
0.0% regardless of the position's actual P/L. This is not a display bug on
top of correct data — the underlying `margin`/`valueOf`/`costOf`/`plPctOf`
math in `utils.js` is wrong specifically for the `futures_coinm` wallet (it
was written assuming USDⓈ-M's coin-denominated `positionAmt` semantics apply
to both wallets). Same shape of bug likely also affects backend
`generate_portfolio_snapshot`'s margin calc (`portfolio.py:560-567` — same
`qty * avg_buy_price / leverage` formula) for the futures class total in
`market_value`, and `unrealized_pnl` stored raw in `Position` without a
currency/unit tag distinguishing coin-denominated (COIN-M) from
USD-denominated (USDⓈ-M) PnL.

### Finding 1.3 — CONFIRMED, real bug, but latent (not the reported symptom): `_compute_day_pct` returns 0.0 as a "no data" sentinel, indistinguishable from a genuine 0.0% day change

`backend/app/modules/market/services/market.py:207-221`:
```python
def _compute_day_pct(self, asset_id):
    if not asset_id: return 0.0
    latest = self.repo.get_latest_price_history(asset_id)
    if not latest: return 0.0
    ...
    if not prior or float(prior.price) == 0 or prior.id == latest.id: return 0.0
    return round(...)
```
Every "can't compute" branch returns `0.0`, not `None`. The one place this
*can* surface as `None` is `market.py:605` (`self._compute_day_pct(...) if
quote else None`) — but only when there's no `LatestQuote` row at all. This is
a genuine fabrication bug independent of Finding 1.2 — worth fixing — but it
is **not** the mechanism behind the reported symptom: the Holdings table's Day
Δ column is already correctly guarded to `—` for futures in both
`PfHoldingsTable.jsx:126` and `HoldingSubRow.jsx:38-44`, so this sentinel
never reaches the screen for the row the brief describes. It's a live risk
for three *other* components that render dayPct without checking
`isFutures(h)` — `TopHoldingsRow.jsx:23-24`, `AssetDetail.jsx:587,721-722`
(also coerces `null` to `0` at line 587, compounding it), and
`Terminal.jsx:284-285,945-946` — but none of those render "Liq.", so none of
them are the specific row in the symptom description. Keep as a separate,
lower-urgency Tier 1 item, not folded into the P/L fix.

### Finding 1.4 — Tier 3 note, not a bug: `ex`/`region` hardcoded to `"NSE"`/`"IN"` for every asset

`market.py:606-607, 625-626` (`search`/`get_universe`) hardcode
`"ex": "NSE", "region": "IN"` for literally every asset regardless of actual
exchange — nonsensical for Binance crypto/futures. Confirmed this field is
**not** wired into the portfolio holdings object in `useAureonData.js`, so it
doesn't affect the Holdings table/dashboard. It does reach `PfActivityFeed.jsx`
via a different data path (`t.region`) and the `Markets.jsx`/`Terminal.jsx`
asset-search-driven views. Pre-existing, unrelated to this symptom — flagging
per audit brief, not folding into this fix plan.

---

## Class 2: Binance Earn "Ledger" wrapper tokens (LD*)

**Live data pulled for `LDUSDT-USD`:**
```json
{
  "symbol": "LDUSDT-USD", "wallet": "spot", "quantity": 196.57,
  "avg_buy_price": 0.0, "price": 0.0, "price_source": "unavailable"
}
```
`GET /api/v1/assets?search=LDUSDT-USD` → `price: 0.0, dayPct: 0.0` — the
**fabricated zero reaches the API response directly**, not just internal
state.

`market.latest_quotes` confirms a `price=0` row exists for every `LD*` symbol
(`LDUSDT-USD, LDSXT-USD, LDBTC-USD, LDETH-USD, LDATOM-USD, LDSKY-USD`), all
timestamped at the original Binance sync (2026-07-07 14:10:4x), with
`provider` blank. This is **not** written by `ingest_quote`/`save_quote` (that
path always sets a real provider name and only fires on a successful,
non-zero-price provider response — Yahoo's adapter raises `ProviderError`
rather than ever returning 0, confirmed in
`backend/app/modules/market/providers/market_data/yahoo/provider.py:100`).
Given the blank provider and exact-match sync timestamp, this looks like
local dev/demo seed data rather than a row a real sync run would produce today
— but the *downstream handling* of a price=0 quote is a real, general bug
independent of how this particular row got there (see 2.1), and there's a
second, independent path that would fabricate the same zero on a real sync
even with no such row present (see 2.2).

### Finding 2.1 — CONFIRMED, real bug: `resolve_position_price` labels price=0 as "unavailable" but still returns the numeric 0.0

`backend/app/modules/portfolio/services/portfolio.py:226-227`:
```python
if quote.price == 0:
    return PositionPrice(0.0, "unavailable", None, None, None, currency)
```
The docstring above it (line 205-209) explicitly reasons through *why* this
case shouldn't be labeled `"market"` — but the fix stops at relabeling
`price_source`; the `price` field itself stays `0.0` instead of becoming
`None`. `frontend/src/hooks/useAureonData.js:111` then does
`pos.price ?? assetData.price ?? pos.avg_buy_price ?? null` — since backend
`price` is `0.0` (not `null`), the `??` chain accepts it immediately, and
every consumer that checks `h.price == null ? '—' : ...` (both
`PfHoldingsTable.jsx:115,128` and `TopHoldingsRow.jsx:22`) renders `$0.00`
instead of "—". This is the single clearest, most direct instance of the "no
fake data" policy violation in this audit — it isn't LD-specific, it will
happen for **any** symbol that ends up with a `price=0` `LatestQuote` row
(the code comment names mutual_fund/NPS/EPF as the originally-intended case
too).

### Finding 2.2 — CONFIRMED, real bug (deeper, structural): LD* tokens have no price source at all, by design gap, independent of Finding 2.1

`sync_binance_holdings` (`portfolio.py:1147-1157`) merges Earn balances into
spot quantity under the **raw** Earn asset symbol (`LDUSDT`, `LDBTC`, ...) with
`"avg_price": 0.0` hardcoded (line 1151) — there is no cost-basis source for
Earn positions at all, confirmed by the method's own docstring
(line 1129-1131: *"Binance's account/position endpoints report current
balances only, not historical cost basis for Spot/Earn"*). Nowhere in the
codebase — `binance/provider.py`, `portfolio.py`, `core/binance.py`, the CSV
importer — is the `LD` prefix stripped or mapped back to its underlying asset
(`LDBTC` → `BTC`, `LDUSDT` → `USDT`, 1:1 NAV in Binance's Simple Earn Flexible
product). `ingest_all_quotes` (`workers/ingestion/tasks.py:114-118`) routes
every non-`crypto_futures` asset to the **Yahoo** provider — which obviously
has no `LDUSDT-USD`/`LDBTC-USD` ticker and will reliably raise
`ProviderError` on every attempt, so a real production sync would never
populate a quote for these symbols at all. Falling through to
`resolve_position_price`'s final branch (`portfolio.py:233`,
`return PositionPrice(float(pos.avg_buy_price), "cost_basis", None, None,
None, currency)`) hits the **hardcoded `avg_buy_price = 0.0`** from
`sync_binance_holdings` — producing the exact same fabricated `$0.00` via a
second, independent path that doesn't even depend on the seed-data quote rows
found in Finding 2.1. **This is a genuine data gap, not just a silent-failure
bug** — Aureon has never had a way to price Binance Earn positions. Scoping
question below.

---

## Resolution plan

### Tier 1 — fabrication/silent-failure fixes, ready to execute on approval, no open questions

1. **`resolve_position_price` must return `None` price when unavailable, not `0.0` — and every reader of it must handle `None`, as a required part of this same step, not a follow-up.**
   File: `backend/app/modules/portfolio/services/portfolio.py:226-227`.
   Change `PositionPrice(0.0, "unavailable", ...)` → `PositionPrice(None, "unavailable", ...)`.
   Widen `PositionPrice.price` (and `resolve_position_price`'s return type) to
   `Optional[float]`. This **will break** `generate_portfolio_snapshot` as-is:
   line 556-557 does `price = pp.price` then line 569 `val = qty * price` —
   `qty * None` raises `TypeError` immediately, not a latent risk. Required
   sub-step, same commit: in `generate_portfolio_snapshot`, when `pp.price is
   None`, treat the position as contributing `0` to `market_value`/`total_invested`
   (matching today's *numeric* behavior of `qty*0`) while leaving the position
   itself visibly flagged `price_source="unavailable"` in the API response —
   i.e. preserve today's aggregate totals, fix only the per-position `price`
   field the frontend reads directly. Audit every other direct reader of
   `pp.price`/`resolve_position_price(...)` in this file and
   `backend/app/modules/portfolio/api/portfolio.py` in the same pass — do not
   ship the type change without confirming each call site.

2. **`_compute_day_pct` must return `None`, not `0.0`, when it can't compute a real change.**
   File: `backend/app/modules/market/services/market.py:207-221`.
   Change all three early-return `0.0`s (no asset_id, no latest sample, no
   valid prior sample) to `None`. Update the return type annotation
   (`-> float` → `Optional[float]`) and its two call sites
   (`market.py:605, 624`, currently `self._compute_day_pct(...) if quote else
   None` — simplify to just `self._compute_day_pct(...)` since the function
   now self-reports unavailability).

3. **Guard futures out of the Day Δ display consistently, matching the existing `PfHoldingsTable`/`HoldingSubRow` pattern (latent-risk cleanup, not the reported symptom — see Finding 1.3).**
   Files: `frontend/src/components/aureon/dashboard/TopHoldingsRow.jsx:23-24`,
   `frontend/src/pages/aureon/AssetDetail.jsx:587,721-722`,
   `frontend/src/pages/aureon/Terminal.jsx:284-285,945-946`.
   Import `isFutures` from `frontend/src/components/aureon/utils.js`
   (already used in the two components that get this right) and render `—`
   for futures positions instead of a numeric dayPct, same as
   `PfHoldingsTable.jsx:126`. `AssetDetail.jsx:587`'s `raw.dayPct ?? 0` should
   also stop coercing `null` to `0` — pass `null` through and let the render
   guard show `—`.

   Step 1 closes Finding 2.1 (and the same-shaped NPS/EPF/mutual-fund cases
   the code comment already names) — this is the fix for the LD* "$0.00"
   symptom. Steps 2 and 3 close Finding 1.3, a real but latent bug, not the
   futures "0.0%" the brief reported (that's Finding 1.2, Tier 2 below — it
   needs a decision on COIN-M contract-size handling, not just a null check).
   None of these three Tier 1 steps require a product decision.

### Tier 2 — requires a decision before implementation

**Decision: how should COIN-M futures margin/value/P&L be computed given the contracts-vs-coin unit mismatch (Finding 1.2)?**

This is the actual fix for the reported "0.0%" symptom. Two of the three
premises behind Finding 1.2 are already confirmed from data in hand, not
just theory:

- **`qty` is contracts, not coins, for COIN-M** — a genuine 5-*coin* BTC
  position moving 66025→64068 would show roughly −0.15 BTC unrealized PnL;
  the actual stored value is −0.00014, ~1000× smaller. A genuine 100-*coin*
  ETH position over that same kind of move would show roughly −3.6 ETH; the
  actual value is −0.013, ~270× smaller. Both rule out "qty is coin units."
- **`unrealized_pnl` is coin-denominated, not USD** — −0.00013908 read as
  USD would be a fraction of a cent, not a plausible PnL on a $165k-notional
  position; read as BTC (×64068.7 markPrice) it's ≈ **−$8.91**, consistent
  with roughly −3.6% on a $250 real margin (5 contracts × $100/contract ÷ 2×
  leverage = $250 → −8.91/250 ≈ −3.6%, in the right ballpark for a
  several-percent adverse move). Same check on ETH: −0.01344967 ETH ×
  $1905.75 ≈ **−$25.63**, against a $500 real margin (100 contracts × $10 ÷
  2× leverage) ≈ **−5.1%**. Both real P/L figures are clearly nonzero —
  confirming −0.0% on screen today is wrong, not a rounding artifact of a
  genuinely flat position.

The one premise this audit could **not** verify directly (no futures-capable
API credentials in this session) is the **exact contract size per symbol** —
$100/contract for BTCUSD-quoted and $10/contract for ETHUSD-quoted are the
commonly-documented Binance COIN-M values used in the sanity check above and
plausible given how well they reconcile, but must be confirmed against
Binance's live dapi `exchangeInfo` (`contractSize` field) before hardcoding
into the fix, not assumed from memory.

Given that, the fix is roughly: in `backend/app/modules/portfolio/services/portfolio.py:_sync_futures_positions`,
either (a) store a `contract_size` alongside the position (schema change) so
downstream margin math can do `qty(contracts) × contract_size / markPrice`
to get real coin notional, then convert to USD via `markPrice`, or
(b) convert at read time in `generate_portfolio_snapshot`/`utils.js`'s
`marginOf`/`plPctOf`, branching on `wallet === 'futures_coinm'` vs
`'futures_usdm'` with the correct formula for each. This also needs a
decision on where `unrealized_pnl`'s coin-denominated value gets converted to
a display currency (at write time when synced from Binance, using that
moment's markPrice, vs. at read time) — write-time conversion is simpler but
means the stored `unrealized_pnl` is frozen at sync-time FX/mark, not live;
read-time conversion needs the current markPrice available wherever
`plPctOf`/`valueOf` run (frontend `utils.js` doesn't currently have markPrice
independent of `h.price`, which *is* available — `h.unrealizedPnl * h.price`
converts coin-denominated PnL to USD, confirmed against the sanity-check
numbers above; note it's a **multiply**, since `price` is USD-per-coin and
PnL is in coin units — dividing would be a units error).

My recommendation: fix on the backend at sync time
(`_sync_futures_positions`), since that's where Binance's raw
contract/coin-denominated numbers are already being read — normalize
`unrealized_pnl` to USD there (multiply by that sync's `markPrice`, itself
available in the same `positionRisk` response) and store the properly-computed
USD notional margin as a new field rather than recomputing contracts×price in
three different places (backend snapshot, frontend `marginOf`). This avoids
duplicating unit-conversion logic in both Python and JS. But confirm the
contract-size assumption against live Binance API responses before
implementing — this audit did not have futures API credentials available to
verify directly.

**Decision: how should Binance Earn (`LD*`) wrapper token positions be priced?**

This is Finding 2.2. Three options, roughly ascending effort:

- **(a) Honest "unavailable" (minimum fix).** Do nothing beyond Tier 1 step 1
  — Earn positions already fall through to `cost_basis` with
  `avg_buy_price=0.0`, which after Tier 1 step 1 doesn't apply here (that
  branch is untouched, still returns a real `float` even if it's `0.0`).
  Additional one-line fix needed regardless of which option is chosen:
  `sync_binance_holdings` (`portfolio.py:1151`) should stop hardcoding
  `avg_price: 0.0` for Earn-derived rows and instead leave cost basis
  genuinely unknown, so `resolve_position_price`'s `cost_basis` fallback
  doesn't fabricate a zero either. Net effect: LD* positions show quantity
  and "—" for price/value everywhere, honestly, forever, until (b) or (c) is
  built.
- **(b) Strip `LD` prefix, reuse the underlying spot asset's quote (recommended).**
  `LDBTC` is Binance's 1:1-redeemable Flexible/Locked Earn wrapper for `BTC`
  — NAV tracks the underlying asset price directly (Simple Earn Flexible has
  no discount/premium). Add an `LD`-prefix strip + remap step, likely in
  `sync_binance_holdings` (map `LDBTC` → look up/reuse `BTC-USD`'s quote) or
  as a new branch in `resolve_position_price` keyed off symbol prefix. Needs
  a decision on *where* the remap lives (sync-time symbol merge with the
  spot `BTC-USD` position vs. a resolve-time price lookup keeping `LDBTC-USD`
  as its own Position/Asset row) — merging at sync time changes the
  Position model (fewer distinct symbols) more than resolving at read time
  does.
- **(c) Fetch Binance Simple Earn product APR/NAV directly** via
  `/sapi/v1/simple-earn/flexible/list`-style endpoints for a "true" Earn
  valuation including accrued interest not yet reflected in the underlying
  spot price. More accurate, more implementation surface (new provider
  method, new ingestion path), and the accrued-interest delta versus (b) is
  typically small for Flexible products.

My recommendation is **(b)**, with the sync-time-merge sub-choice (fold
Earn balances into the existing spot Position under the plain symbol, e.g.
`BTC-USD`, same as spot+Earn quantities are already merged in
`sync_binance_holdings:1134-1145` today) — Earn is functionally "locked spot"
and the code already treats it that way for quantity; extending that to
price is the smallest coherent change. This also fixes a second, related
issue visible in the live position list: every `LD*` symbol currently shows
up as a **separate line item alongside its bare-asset counterpart** —
`BTC-USD` + `LDBTC-USD`, `ETH-USD` + `LDETH-USD`, `USDT-USD` + `LDUSDT-USD`,
`ATOM-USD` + `LDATOM-USD` — i.e. the same coin's free balance and its Earn
balance are currently two separate holdings in the UI rather than one
consolidated position. Merging at sync time (option b) fixes both the
pricing gap and this double-listing in one change. But the split-vs-merge
choice is still your call — flag if you'd rather see the wrapper token kept
as its own visible line item (Locked Earn positions especially may be
something you want visible as locked/not-liquid, which merging into the spot
line would obscure).

**Until this is answered, apply Tier 1 step 1 only** — LD* tokens will
render as "—" (honest, non-fabricated) rather than "$0.00", with no further
work.

### Tier 3 — scope note, not folded into the above

The brief asked whether "no asset-class distinction exists yet for
margin/futures vs. spot" — checked, and **it does**: `wallet` on `Position`
(`spot`/`futures_usdm`/`futures_coinm`) and `asset_class="crypto_futures"` on
`Asset` are both real, populated, and correctly consumed for value/liquidation
math on the backend and for the (correctly-guarded) subset of frontend
components. The gap isn't a missing distinction — it's that the distinction
isn't consistently *consumed* everywhere dayPct is rendered (Finding 1.3,
folded into Tier 1). No separate scoping decision needed here beyond Tier 2's
LD* question.

Separately, `ex`/`region` hardcoded to `"NSE"/"IN"` for every asset
(Finding 1.4) is real but pre-existing, unrelated to this symptom, and out of
scope for this fix — noting it for a future pass rather than expanding this
one.
