# EPF Interest-Accrual Estimate — Scope

Status: **draft for review, no implementation yet**

## 1. Why this exists

`NAV_INGESTION_SCOPE.md` §7 concluded EPF has no safe automatable feed and
recommended it stay fully out of scope. That's still true for *real* data —
EPFO has no public API, and the passbook is credential-gated (UAN+OTP). But
the decision has since changed for a narrower thing: not "fetch real EPF
data automatically," but "compute a clearly-labeled *estimate* from data we
already have for real," so an EPF position isn't frozen at whatever balance
was last uploaded, indefinitely, with no indication of how stale that number
is. This doc scopes that estimate — mechanics, rate source, trigger,
price_source/UI contract, and failure modes — as a real feature build, not a
bug fix.

**The two real inputs**, confirmed in code, not assumed:

- **Contribution history.** `import_epf_statement` (`portfolio.py:755-864`)
  writes one `Transaction(kind="broker_trade", broker="epf")` per wage-month
  row, each with a real `transaction_date` and combined
  Employee+Employer+Pension `price` (amount). `parse_epf_statement`
  (`portfolio_importer.py:796-978`) parses these from the passbook's
  transaction table — real, dated, per-contribution data.
- **The last known real balance.** Each statement import also upserts one
  `Transaction(kind="broker_snapshot", broker="epf")` per UAN, holding the
  passbook's **Closing Balance** as of the statement's date
  (`h["current_value"]`, `h["as_of_date"]`) — `recalculate_position` copies
  this into `Position.avg_buy_price`, which is what renders today via
  `price_source="cost_basis"`.

Everything else — the annual interest rate, and the projection formula
connecting these two real inputs to an estimate of the *current* balance —
has to be built or manually configured. That's this doc's scope.

## 2. EPF interest mechanics, traced precisely (not approximated)

Confirmed against EPFO's actual published mechanism (not inferred from the
codebase, since none of this exists there yet):

- **Interest is calculated monthly, on the running balance, but credited
  (added to the account) only once a year, on 31 March** of the financial
  year (April–March). Until then, monthly interest amounts are computed and
  accumulated *off to the side* — they do **not** compound into the running
  balance month-to-month within the year.
- **Monthly interest formula:** `interest_month = opening_balance_of_month ×
  (annual_rate / 12)`, where `opening_balance_of_month` is the balance as of
  the start of that calendar month **before** that month's own contribution
  is added.
- **Contributions earn interest starting the month *after* they're made** —
  a contribution posted in April first appears in the opening balance used
  for May's interest calculation, not April's.
- **The annual total is the sum of all 12 months' interest**, added as a
  single lump sum at FY-end. Once credited, it becomes part of next year's
  opening balance — so compounding *is* real, just annual, not monthly.
- **Real-world crediting lag confirmed:** EPFO frequently doesn't actually
  post the FY's interest into passbooks until months after 31 March (a
  current example as of this doc: FY2025-26's 8.25% rate is being credited
  around July 2026, roughly a 3-4 month lag past FY-end). This means even a
  perfectly-computed "credited" balance can be ahead of what a freshly
  re-downloaded real passbook would show, for months. The estimate has to
  communicate *two* time dimensions, not one: "as of when is this estimate
  computed" and "as of when would EPFO's own books actually agree."

**Does the monthly/annual-crediting distinction matter vs. a naive
projection, and by how much?** Checked with a concrete worked example
(hypothetical, since no real annotated passbook was available to check
against, but numerically exact per the formula above): opening balance
₹100,000, twelve equal ₹10,000 monthly contributions, 8.25% annual rate.

- **Precise EPFO formula** (sum of monthly opening-balance interest,
  contribution-lag respected): **₹12,787.50** for the year.
- **Naive average-balance approximation** (`(opening + closing) / 2 × rate`,
  a common simplified approach): **₹13,200** — **≈3.2% too high** in this
  even-contribution case.
- The naive method's error is **not constant** — it grows with how
  front-loaded contributions are (a lump sum credited in April vs. spread
  evenly vs. concentrated near FY-end changes the naive method's overstatement
  materially, since it ignores exactly when each rupee started earning
  interest).

**Conclusion: the real formula is fully computable from real data (contribution
dates + amounts + a rate), so it should be implemented precisely — this is
not a case where only the output needs an "estimate" label while the
mechanics are approximated. The mechanics can be exact; only the eventual
number is provisional (pending real EPFO crediting and any rate-year gaps,
§6).**

## 3. A real gap the mechanics expose: EPS (pension) doesn't earn interest

Checked, not assumed, and this matters: **only the Employee + Employer EPF
contribution earns interest — the EPS (pension) portion does not.** EPS is a
separate defined-benefit pension scheme; it doesn't accrue interest the way
the EPF portion does.

The current data model doesn't preserve this split in a queryable form.
`parse_epf_statement` computes `employee`/`employer`/`pension` amounts
per-row internally, but `import_epf_statement` only writes their **combined
sum** into `Transaction.price` — the breakdown survives only inside the
free-text `notes` description (`"{wage_month}: Employee ₹X | Employer ₹Y |
Pension ₹Z"`), not as structured columns. Same for the holdings snapshot:
`current_value` is `Employee + Employer + Pension` combined, with no
per-component split stored anywhere.

**This means an estimate computed from the data model as it exists today
would apply interest to the *entire* combined balance, including the
EPS share that shouldn't earn any — a real, quantifiable overstatement
(EPS is nominally 8.33% of wages vs. up to 12%+12% for EPF, so on the order
of a fifth to a quarter of total contributions, growing every year as a
fixed share). Two ways to resolve this, not decided here (§7):**

1. **Extend the schema** to store `employee`/`employer`/`pension` as
   separate structured amounts (new columns on `Transaction`, or a JSON
   breakdown field) so the estimate can correctly exclude the pension share
   from the interest-bearing principal. Real schema work, not just a
   formula.
2. **Ship v1 knowingly approximate**, applying interest to the full combined
   balance, and disclose this specific, named limitation in the estimate's
   UI basis text (not silently) — e.g. "estimate includes pension balance in
   the interest-bearing principal; actual EPF-only interest may be
   ~15-25% lower."

Recommend **option 2 for v1** (no schema migration required, ships faster)
but this is exactly the kind of mechanics-level shortcut the task explicitly
asked to be surfaced rather than silently taken — flagging for confirmation,
not deciding unilaterally.

## 4. Rate source

Checked the codebase first: **grepped for any existing EPF/EPFO interest
rate value or config key — none exists anywhere.** No API, official or
unofficial, publishes this rate; EPFO announces it annually (a Ministry of
Labour/EPFO decision, typically communicated well after the FY it applies
to, per the crediting-lag point in §2). **This has to be a manually-maintained
config value.**

**Recommend reusing the existing `ProviderConfig.config` JSON-blob pattern**,
same shape already used for `financial_intelligence` and `signal_eligibility`
rows (`config.py:135-136`) — a new `provider_type: "config"` row, e.g.
`provider_name: "epf_interest_rates"`, with:

```json
{"rates": {"2023-2024": 8.15, "2024-2025": 8.25, "2025-2026": 8.25}, "updated_at": "2026-07-13"}
```

**Keyed per financial year, not a single scalar** — this is a deliberate
departure from a naive "current rate" value: a position whose last statement
is more than one FY stale needs the *historical* rate(s) for every FY the
projection spans, not just the latest one. A single-scalar rate would be
wrong the moment a user goes more than a year between statement uploads,
which given EPF's manual-passbook-download friction is a realistic, even
likely, case.

**Editing path:** the existing generic `PUT /config/providers/{provider_name}`
endpoint already accepts an arbitrary `config: Dict[str, Any]` body
(`core/api/config.py:26`, confirmed) — no new endpoint required to *set* the
rate table. There is, however, **no frontend UI today for editing a
provider's `config` blob** (checked `ProviderConfig.jsx` — the Settings UI
only edits `enabled` and per-key credential values, never the `config` JSON
field directly). A user could still set it via a raw API call, but a
dedicated small settings form (a short table: FY → rate%) would be the
realistic way anyone actually maintains this. Sizing that as part of this
build or a fast-follow is an open question (§7).

**Staleness surfacing:** since this is a real annually-changing published
number (not a live feed), "staleness" here specifically means: *the rate for
a FY the current projection spans hasn't been entered yet.* Recommend: if the
projection needs a FY's rate that isn't present in the config, **do not fall
back to the most recent known rate silently** — treat it the same as "no
rate configured" (§6, degrades to `unavailable`). A silent fallback would
quietly misrepresent one year's estimate using a different year's rate,
which the no-fake-data policy in
[[feedback_no_fake_data_policy]] argues against — approximating a specific
missing input rather than surfacing the gap.

## 5. Computation trigger and storage: on-read, no new table

Traced against how `resolve_position_price` (`portfolio.py:58-96`) already
works, same discipline as `NAV_INGESTION_SCOPE.md` §8's storage analysis:

- **This should compute on-read, not on a schedule, and needs no new
  table.** Unlike the NAV pieces (where `LatestQuote` holds a value that's
  genuinely correct until the next refresh, so pre-computing and storing it
  is the right shape), an EPF estimate's whole premise is "project forward
  from the last known point to *right now*" — the elapsed-time term in the
  formula is only correct if evaluated at read time. Storing a computed
  value would go stale the instant it's written, for no benefit (there's no
  expensive external call to amortize the way there is for AMFI's bulk file
  in `NAV_INGESTION_SCOPE.md` §5 — this is pure arithmetic over already-local
  data).
- **`resolve_position_price` is architecturally the right place**, following
  its existing shape: it already does one extra query (`session.get(Asset,
  ...)`) inline for the `is_manual` check (line 82-83). Adding
  `if asset and asset.asset_class == "epf":` as another branch, before the
  existing `LatestQuote` check (EPF never has one — confirmed no writer
  targets `asset_class="epf"` anywhere, matching `NAV_INGESTION_SCOPE.md`
  §7's finding), fits the same pattern.
- **Cost is higher than the existing branches, but bounded and local.** The
  existing checks are O(1) (`LatestQuote` row lookup, one `Asset` lookup).
  The EPF estimate needs the *full* `broker_trade` contribution history for
  the symbol (to replay the monthly-opening-balance formula from the last
  `broker_snapshot` forward) — a bounded query (contributions are monthly,
  so even a decade of history is ~120 rows), not unbounded, but a real
  per-position-render cost that the other branches don't have. Given
  `resolve_position_price` is called per-position (not batched) in several
  places (`intelligence.py` calls it in a loop at lines 249, 329, 379, 464,
  659, 701), this is worth being aware of for portfolios with many EPF
  positions — though in practice a person has one, or a small handful of,
  EPF accounts (one per employer/UAN), so this is unlikely to be a real
  bottleneck. Flagging rather than pre-optimizing.

## 6. The price_source / UI contract

**Recommend `price_source = "epf_estimated"`** — structurally distinct from
every existing value (`"market"`, `"cost_basis"`, `"manual"`,
`"unavailable"`), impossible to confuse with a real ingested quote, matching
the precedent `NAV_INGESTION_SCOPE.md` set for provenance-labeling
(`price_source="market"` vs `"cost_basis"` §9).

**What has to travel with it isn't just the string** — an estimate is only
honest if its basis is visible: the frontend needs, at minimum, (a) the
statement date the projection started from, (b) the rate(s) used, and (c)
the as-of date the estimate is computed for ("now"). `PositionSchema`
already has room for exactly this kind of side-channel metadata (it added
`quote_age_status`, `schemas.py:81`, for the NAV work) — the EPF estimate
needs an equivalent, e.g. `epf_estimate_basis: {"as_of": "...",
"statement_date": "...", "rate_pct": 8.25, "note": "..."}`.

**Checked how much frontend plumbing already exists for this — less than it
might look like.** `price_source` is barely surfaced in the frontend today:

- `useAureonData.js:232` is the *only* place it's read at all, and only to
  filter which positions count toward the dashboard's "Prices" freshness
  tile (`price_source === 'market'`).
- The holdings table's existing "Manual" badge
  (`PfHoldingsTable.jsx:99`, `isManual = h.tier === 'passive'`) — the closest
  visual precedent for "this number isn't a real market price" — is actually
  driven by `Asset.tier`, **not** `price_source`, and `price_source` isn't
  even present in the `holdings` view-model `useAureonData.js` builds
  (`useAureonData.js:110-128` maps `pos.price`/`pos.avg_buy_price` but drops
  `pos.price_source` entirely).

**This means an "Estimated" badge is new plumbing end to end, not a
copy-paste of an existing pattern:** thread `price_source` (+ the basis
metadata above) through `useAureonData.js`'s holdings mapping, then add a
new badge — visually distinct from the existing blue "Manual" chip (a
different color/label, e.g. amber/dashed-border "Estimated", with a tooltip
or expandable detail rendering the basis fields) — in `PfHoldingsTable.jsx`
and anywhere else per-position price is rendered (worth a quick audit at
implementation time for other consumers, e.g. `AssetDetail.jsx`).
**Sizing this as real frontend work, not a footnote, per the task's
requirement for "a third, clearly different visual treatment."**

## 7. Failure / edge cases — explicit reasoning, not silent choices

**Recommend degrading to `price_source="unavailable"` (no estimate
attempted) rather than computing a low-confidence guess, in these cases —
reasoning stated per case, not asserted:**

1. **No rate configured for a FY the projection spans** (§4). Reasoning: a
   silent fallback (reuse last known rate, or skip that FY's interest
   entirely) would produce a number that looks precise but is quietly wrong
   in a specific, undisclosed way — worse than no number, per
   [[feedback_no_fake_data_policy]].
2. **No `broker_snapshot` exists yet at all** (never imported / first-ever
   EPF statement not yet uploaded). Reasoning: there's no real starting
   balance to project from — nothing to estimate *from*, not a staleness
   problem.

**Recommend NOT degrading — a contribution-history gap (missed statement
re-uploads between two real snapshots) should not, by itself, block the
estimate:**

Reasoning: the projection's only real dependency is (a) the last known
`broker_snapshot` balance/date and (b) the rate table for every FY between
then and now — it does **not** depend on having a `broker_trade` contribution
row for every single month in between. A user who re-uploads their passbook
once a year, or skips a year, still has a perfectly legitimate last-known
balance to project forward from; missing contribution rows in the gap just
mean the projection uses the FY-level opening-balance formula (§2) with
whatever contributions *are* known, which understates the true balance
slightly if contributions were missed from the record (a real, disclosable
limitation — same "basis" transparency as §6 — not a reason to refuse to
estimate at all). Flagging this distinction explicitly since "gaps" was
named in the prompt as a case to reason about, not assume: a *rate* gap is a
hard stop; a *contribution-row* gap is not.

## 8. Sizing — pieces, if this proceeds

No prior EPF-estimate build found in git history (same negative-result
search performed for the two prior scope docs).

1. **Rate config row.** Smallest. One new `ProviderConfig` row
   (`provider_type: "config"`), no migration, uses existing generic
   config-set endpoint. Manual data entry only (no settings-UI form yet —
   §4's open question).
2. **Estimate formula + `resolve_position_price` branch.** The real
   monthly-opening-balance/annual-credit formula (§2), reading contribution
   history + the rate config, gated behind the failure/edge-case rules in
   §7. No new table, no migration. Moderate — mostly the formula's replay
   logic and the multi-FY-spanning case (§4), not plumbing.
3. **`price_source="epf_estimated"` + basis metadata on `PositionSchema`.**
   Small backend addition once #2 exists.
4. **Frontend badge + basis display.** Real, separate frontend work per §6 —
   not bundled "for free" with #3, since `price_source` isn't wired through
   the holdings view-model at all today.
5. **EPS-exclusion schema work (§3, optional for v1).** Deferred by
   recommendation — ship v1 applying interest to the combined balance with
   an explicit disclosed caveat, revisit if the overstatement proves
   material enough to justify the schema change.

## 9. Open questions for confirmation before implementation starts

1. §3 — ship v1 applying interest to the full combined Employee+Employer+
   Pension balance (known overstatement, disclosed in the UI basis text), or
   is the EPS-exclusion schema work (structured employee/employer/pension
   columns) worth doing up front? This changes both `Transaction` schema and
   the formula, not just the formula.
2. §4 — rate config as a `ProviderConfig` row with a per-FY JSON rate table,
   set via the existing generic config-PUT endpoint? And is a small
   dedicated Settings-UI form (FY → rate%) in scope for this build, or a
   fast-follow (today there's no way to edit a provider's `config` blob from
   the UI at all)?
3. §4 — confirmed: a FY with no configured rate hard-stops the estimate
   (`unavailable`) rather than reusing the nearest known rate?
4. §6 — confirmed `price_source = "epf_estimated"` as the exact string, and
   agreement on the minimum basis metadata fields (`as_of`, `statement_date`,
   `rate_pct`, plus whatever covers multi-FY-spanning projections — a list of
   FY/rate pairs applied, not just one)?
5. §6 — frontend badge treatment: is a distinct color/label (e.g. amber
   "Estimated" vs. the existing blue "Manual" chip) with a tooltip/expandable
   basis detail sufficient, or is a more prominent treatment wanted (e.g. an
   inline caveat string always visible, not hidden behind a hover)?
6. §7 — agreed that a missing contribution row *within* a gap between real
   statements does not block the estimate, only a missing *rate* for a
   spanned FY does?
7. §5 — on-read computation via a `resolve_position_price` branch, mirroring
   the `is_manual`/`price==0` pattern already there — confirmed as the right
   home, rather than a separate service/module?
