# Settings → Portfolio Management / Allocation — Scope

Status: **scoping pass only, no implementation** (`BUGS_AND_REDESIGN_AUDIT.md` Part B,
"Portfolio: 'Management' / 'Allocation'" — flagged there as "needs clarification: does the user
want these built for the first time").

Git status at start: clean except the same 9 pre-existing uncommitted files from prior sessions
(`config.py`, `portfolio.py` api+service, `portfolio_importer.py`, `apiService.js`,
`PfImportCenter.jsx`, `JobConfig.jsx`, `ProviderConfig.jsx`, `Settings.jsx`) — unrelated
in-progress work (Danger Zone reset, Binance backfill, NPS multi-format parsing, portfolio-scoped
job dispatch guard), untouched by this pass. `BUGS_AND_REDESIGN_AUDIT.md` also untracked, from
the prior session.

Both nav entries route to the generic `EmptySection` stub today (`Settings.jsx:1141-1142`),
whose own placeholder copy already states the intended scope accurately:
- `portfolio-mgmt`: *"Create and manage named portfolios"*
- `alloc-targets`: *"Set target weights by asset class"*

The headline finding of this pass: **both of these already have complete, working backend APIs.**
Neither needs new backend work to reach a functional first version — this is "wire up existing
data/endpoints into a form," not "design and build a feature from scratch." The real scope
questions are UX/product decisions layered on top of what already exists, plus one real
pre-existing correctness gap that "Portfolio Management" would surface for the first time.

---

## 1. Portfolio Management

### What already exists (live-verified)

**Full CRUD is already implemented and working**, just with no Settings-page UI:

- `POST /portfolio/portfolios` → `PortfolioService.create_portfolio` — creates a named
  `Portfolio` row. Already called from `Onboarding.jsx:690` (first-run portfolio creation) and
  from nowhere else in the app after onboarding.
- `GET /portfolio/portfolios` → `list_portfolios` — full list, no user-scoping filter (there's no
  `user_id`/`owner_id` column on `Portfolio` at all — consistent with CLAUDE.md's
  single-user/no-multi-tenancy stance; this is "multiple named buckets for one user," e.g.
  "Trading" vs. "Retirement," not multi-tenant isolation).
- `PUT /portfolio/portfolios/{id}` → `update_portfolio` — rename, audit-logged
  (`portfolio_update` action).
- `DELETE /portfolio/portfolios/{id}` → `delete_portfolio` — **a real hard delete**, audit-logged.
  All child rows (`Position`, `Transaction`, `PortfolioSnapshot`, `BinanceBackfillProgress`) carry
  `ForeignKey(..., ondelete="CASCADE")` to `portfolio.portfolios.id` — deleting a portfolio
  silently wipes every position/transaction/snapshot under it at the DB level, with **no
  soft-delete/archive path, no confirmation step beyond whatever the UI would add, no undo**.
- `apiService.js` only wraps two of the four today — `listPortfolios()` (line 32) and
  `createPortfolio(name)` (line 35), both already in live use (Sidebar, Onboarding). **No
  `updatePortfolio`/`deletePortfolio` wrapper exists yet** — trivial to add (same
  `handleRequest(API.put/delete(...))` pattern as every other wrapper in the file), but real,
  not-yet-written frontend surface, unlike the backend routes themselves.
- The frontend already has a **live, working multi-portfolio switcher**:
  `PortfolioContext.jsx` holds `portfolios`/`activePortfolio`/`switchPortfolio`, persists the
  selection to `localStorage`, and `Sidebar.jsx:63-72` renders a `<select>` dropdown bound to it —
  but only `{portfolios.length > 1 && (...)}`, so it's invisible today because exactly one
  portfolio row exists (`Default Portfolio`, confirmed live in Postgres, created 2026-07-20).

So "Portfolio Management" isn't really asking "can the user have more than one portfolio" — that
machinery already runs end-to-end (create in Onboarding → appears in Sidebar switcher → every
`activePortfolioId`-scoped query re-fetches on switch, confirmed by reading `switchPortfolio`'s
`invalidateQueries({queryKey: ["portfolio"]})`). It's asking **"where does the user manage
portfolios outside of onboarding and the Sidebar dropdown"** — rename, delete, and see them all
in one place, none of which exist as a UI surface today.

### The real gap this surfaces: `get_user_context()`'s `.first()`

`app/api/dependencies.py:160-171`:
```python
def get_user_context(db: Session, user: User):
    """Resolves or creates the default Portfolio context on the fly."""
    portfolio = db.query(Portfolio).first()
    ...
```

Three endpoints resolve their portfolio this way instead of taking `portfolio_id` from the
caller: `POST /manual-assets`, `PUT /manual-assets/{symbol}/valuation`, and `POST /sync`
(broker sync-all). None of them accept a `portfolio_id` in their request body or path — they
always operate on **whichever `Portfolio` row `.first()` returns** (undefined ordering without an
explicit `ORDER BY`; in practice today, insertion order), **regardless of which portfolio is
currently active in the Sidebar switcher.**

This is silent today because there's only one portfolio row, so `.first()` and "the active one"
are trivially the same row. **The moment a second portfolio exists — which "Portfolio
Management" is explicitly about enabling — this becomes a real, user-visible correctness bug**:
a user viewing "Retirement" in the Sidebar, adding a manual asset via `+ Manual asset`, could
silently have it written into "Default Portfolio" instead, with no error and no indication
anything went to the wrong place.

**This isn't optional cleanup — it's a blocking dependency.** Building a Management UI that lets
users create a second portfolio, without first fixing these three endpoints to take an explicit
`portfolio_id`, would ship a feature that actively creates data-integrity bugs the moment it's
used as intended. `PfHoldingsTable`'s `+ Manual asset` button and `Settings → Providers`' sync
triggers are the two real call sites affected — both already have `activePortfolioId` available
in their component tree (confirmed: `PfHoldingsTable`'s parent `Portfolio.jsx` already has it) so
the frontend-side fix is mechanical once the backend accepts the parameter. Not fixed in this
pass — flagging as prerequisite, not deciding whether it blocks or ships alongside.

### Proposed scope (if pursued)

1. New Settings page section (`portfolio-mgmt`) rendering `GET /portfolio/portfolios` as a list:
   name, position count, market value (reuse `GET /portfolios/{id}/snapshot`), created date.
2. Rename inline (`PUT`), using the existing endpoint.
3. Create new portfolio (`POST`), same endpoint `Onboarding.jsx` already calls.
4. Delete — **needs its own confirmation UX given the hard-cascade-delete behavior confirmed
   above**: at minimum a "type the portfolio name to confirm" pattern (this codebase already has
   this exact pattern for Danger Zone reset, per the in-progress uncommitted work referenced
   above — reuse it) and an explicit warning of what's cascade-deleted (position count,
   transaction count, cannot be undone).
5. Fix `get_user_context()`'s three call sites to require `portfolio_id` from the caller (backend)
   and pass `activePortfolioId` (frontend) — see above.

### Open questions (product decisions, not made here)

- **Is a second portfolio a real, wanted use case**, or is the underlying ask actually
  "sub-account / bucket tagging within one portfolio" (e.g. "Retirement" as a filter, not a
  separate `Portfolio` row)? The existing schema and Sidebar switcher are built for the former.
  Confirm before building — building the Management UI is easy; migrating away from
  multiple-`Portfolio`-rows later if the real ask was tagging would not be.
- Does delete need a soft-delete/archive tier instead of the current hard cascade delete, given
  how destructive it already is via direct API call today? Not decided here.
- Should `+ Manual asset` / broker sync silently start requiring `portfolio_id` (breaking anyone
  who might call these endpoints directly, e.g. scripts), or should the fix be additive
  (optional `portfolio_id`, defaulting to current `.first()` behavior for backward compat)? Not
  decided here — leans toward "just fix it," since these are internal app endpoints with no
  external API consumers documented anywhere in this codebase, but worth a decision, not an
  assumption.

---

## 2. Allocation (Target weights by asset class)

### What already exists (live-verified)

This one is **almost entirely built already** — smaller scope than Portfolio Management by a
wide margin.

- `config.allocation_targets` table is real, live, and already seeded: 7 rows
  (`stocks`, `crypto`, `funds`, `bonds`, `real_estate`, `retirement`, `insurance`), `target_pct`
  stored as basis points (e.g. `4600` = 46.00%), matching exactly the hardcoded fallback constant
  `CLASS_TARGET` in `frontend/src/components/aureon/utils.js` — these look like they were seeded
  once, by hand or by migration, to mirror the frontend's original hardcoded default, and have
  never been edited since (`band_low_pct`/`band_high_pct` are `NULL` on every row — never set).
- Full backend API already exists: `GET /config/allocation_targets` (returns
  `{asset_class: target_pct}`, already consumed) and `PUT /config/allocation_targets/{asset_class}`
  (`target_pct`, `band_low_pct`, `band_high_pct`, `notes` — all writable, audit-logged as
  `config_allocation_target_upsert`).
- `apiService.js` already has both wrappers: `getAllocationTargets()` and
  `upsertAllocationTarget(assetClass, payload)` — the PUT wrapper exists and is **currently called
  from nowhere in the frontend**.
- `useAureonData.js:81-87` already fetches targets via `GET` and feeds them into `classTarget`,
  used by `AllocationDriftCard` (dashboard + Portfolio page) and `PfAllocationSection` to compute
  drift (`actual - target`). **This is real, live, already-wired data** — the only missing piece
  is a way to edit it.
- Confirmed durable across Data Reset: `allocation_targets` is not referenced anywhere in
  `data_reset.py`'s delete scopes, so it survives every reset scope by omission — it behaves like
  the same class of durable user-preference config as `ProviderConfig`/`JobConfig`, not
  transactional portfolio data. (Worth noting explicitly in the reset UI's scope list if not
  already — not confirmed either way here, out of scope for this pass.)

### What's genuinely unused today: `band_low_pct` / `band_high_pct`

The schema and API already support a tolerance band per asset class (e.g. "target 46%, acceptable
40–52%"), but:
- Every row has both as `NULL` — never set via any code path found.
- `AllocationDriftCard`'s severity coloring (`dc()`, line 7) uses **hardcoded** thresholds
  (±1pp / ±3pp drift) uniformly across all classes, not the per-class bands.

Building the Allocation settings UI is a natural place to decide whether to also wire these bands
in (per-class custom severity thresholds) or leave them unused for now and only expose
`target_pct` editing. The columns/API already support the richer version at no extra backend
cost — the only added scope is `AllocationDriftCard`'s `dc()` function reading per-class bands
instead of the constant, if pursued.

### Proposed scope (if pursued)

1. New Settings page section (`alloc-targets`) rendering `GET /config/allocation_targets` as an
   editable list — one row per asset class, editable `target_pct` (validate: all rows should
   plausibly sum to ~100%, though nothing enforces that server-side today — client-side warning
   only, not a hard block, since partial/in-progress editing is a normal workflow).
2. `PUT` on blur/save per row, using the existing endpoint and `apiService.upsertAllocationTarget`
   — no backend change needed for this minimal version.
3. Optional (see above): also expose `band_low_pct`/`band_high_pct` per row, and update
   `AllocationDriftCard`'s `dc()` to use them when present, falling back to the current ±1/±3pp
   constants when a class has no band set (since all 7 rows are `NULL` today, this must have a
   sane default or every row would show as "unset" until manually configured).
4. Confirm whether new asset classes need to be addable here too, or whether the class list stays
   fixed at the 7 that exist today — `PUT /allocation_targets/{asset_class}` takes an arbitrary
   `asset_class` string per the route signature, so the backend doesn't restrict this; not
   decided here whether the UI should.

### Open questions (product decisions, not made here)

- Bands: build the richer per-class-tolerance version now (schema/API already support it, small
  incremental frontend cost), or ship target-only editing and leave bands for later? Leans toward
  "ship target-only first, bands later" purely on scope-discipline grounds (CLAUDE.md §2,
  "minimum code that solves the problem") — but this is the user's call, not decided here.
- Should editing a target immediately affect `AllocationDriftCard` server-side computations
  (e.g. cached snapshot allocation percentages), or is it purely a client-side comparison target
  with no backend recompute needed? Live-verified: `generate_portfolio_snapshot`'s `allocation`
  dict is actual-holdings-derived, entirely independent of `allocation_targets` — so no, editing
  a target cannot desync anything server-side; this is confirmed safe, not an open question.

---

## Summary

| Section | Backend | Frontend wiring | Real blocker before shipping |
|---|---|---|---|
| Portfolio Management | Full CRUD exists (`create`/`list`/`update`/`delete`) | Partial — switcher + onboarding-create exist, no Settings surface | `get_user_context()`'s `.first()` in 3 endpoints (manual-assets ×2, sync) silently ignores the active portfolio the moment a 2nd portfolio exists — should be fixed alongside, not after |
| Allocation | Full CRUD exists (`GET`/`PUT` allocation_targets), already read by drift UI | Read-only consumption exists; `PUT` wrapper exists, unused | None found — this is close to a pure "add a form" task |

Neither section needs new database schema or new backend endpoints for a first, functional
version. Allocation is materially the smaller of the two: it's missing exactly one UI form.
Portfolio Management is missing the UI *and* has one real pre-existing correctness gap that
matters only once the UI makes multi-portfolio a realistic, encouraged workflow instead of a
latent, unused capability.
