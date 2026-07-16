# Provider Sync Toggle + Pilot Reference Docs — Scope

Status: **draft for review, no implementation yet**

Scoping pass covering two independent small features. Both investigated live
against current code (2026-07-16), not assumed from prior docs. No schema
changes, no toggle, no reference docs written — this file is the findings +
plan only.

**Handoff note**: `AUREON_HANDOFF_PHASE4.md` (named in the task brief) does
not exist in the repo. `Aureon handoff phase3.md` is the most recent handoff
file present, and matches the latest commits (`b8e49f4` added
`WORKERS_OBSERVABILITY_SCOPE.md` / `FUNDAMENTALS_SCORING_SCOPE.md`, both
referenced from Phase 3's "remaining modules" list). Proceeded using Phase 3
+ the accumulated root-level `*_AUDIT.md`/`*_SCOPE.md` files as the discipline
reference. Flag if Phase 4 exists somewhere else (e.g. uncommitted, or a
different filename) — this doc didn't find or read it.

**Layout note**: `CLAUDE.md`'s described backend layout (`domain/entities/`,
`domain/services/`, `infrastructure/repositories/`, `api/v1/<resource>.py`
per-resource) does not match what's on disk. The real structure (since commit
`52f09a9`, 2026-07-07, "modularize backend into core + modules") is
`app/modules/{market,portfolio,ai,news}/{entities,services,api,providers,...}`
plus a shared `app/core/{entities,services,api,providers,repositories}` for
cross-cutting pieces (config, users, observability). `app/workers/` is
unchanged. This scope doc uses real paths throughout; `CLAUDE.md` itself
looks stale post-restructure and is worth a separate correction pass.

Git status was clean at the start of this pass (no uncommitted work, no
stray files beyond the known `.claude/worktrees/doctor-trim-claudemd`
worktree, which is unrelated and not touched).

======================================================================

## Part 1 — Provider sync toggle: prerequisite check

### Findings

**1. No explicit provider/source column on Position or Transaction — and none is needed.**

Verified against **live schema** (`docker exec aureon_postgres psql -U postgres
-d aureon -c "\d portfolio.positions"` / `\d portfolio.transactions` / `\d
market.assets`), not just the ORM — no drift found; every live column matches
the model 1:1, no undocumented `source`/`provider` column exists anywhere.

- `Transaction` (`app/modules/portfolio/entities/portfolio.py:19`) has an
  explicit `broker: Mapped[str | None]` column (values: `"binance"`,
  `"zerodha"`, `"groww"`, `"groww_mf"`, `"import"`, or null for
  NPS/EPF/CDSL-CAS imports which set it differently — see
  `portfolio_importer.py`).
- `Position` (`portfolio.py:50`) has **no** broker/source/provider column at
  all — only `wallet` (`spot`/`futures_usdm`/`futures_coinm`), which is a
  Binance-internal concept, not a cross-broker provenance field.
- `Asset` (`app/modules/market/entities/market.py:80`) has no
  provider/source field either — by design, Assets are global/shared across
  all brokers and market-data providers (a stock or coin is the same Asset
  row regardless of which broker sync created it).

This turned out not to matter, because **the toggle doesn't need to gate on
stored-row provenance at all** — see finding 3. A toggle built on filtering
existing Position/Transaction rows by inferred provenance would indeed be
fragile (Position has literally nothing to infer from), but that's not the
mechanism available or needed here.

**2. Provenance for future writes is available, just not stored on Position.**

`Transaction.broker` is set explicitly per-row at write time
(`portfolio_importer.py:228`, `PortfolioService.sync_binance_holdings` etc.).
`Position` rows are derived/upserted from Transactions +
live broker snapshots (`PortfolioService._sync_futures_positions`,
`recalculate_position`), keyed by `(portfolio_id, symbol)` — the broker that
created a given Position isn't recorded because Positions aren't literally
"from" one broker in the same sense Transactions are (a symbol could in
principle be touched by more than one sync path). Not a gap that blocks the
toggle — see below.

**3. The toggle mechanism already exists, end-to-end, today.**

Confirmed `_run_broker_sync()` is the *sole* caller of `sync_binance_holdings`/
`sync_zerodha_holdings`/`sync_groww_holdings`/`_sync_futures_positions`
(`grep -rn "sync_binance_holdings\|sync_zerodha_holdings\|sync_groww_holdings\|_sync_futures_positions" app` —
only definitions in `portfolio.py` and the three gated call sites in
`tasks.py:258/263/268`). No other endpoint, admin/repair job, or test-only
path writes to Position/Transaction from a broker sync outside this one
gated door. This is what makes finding 3 below actually true rather than
just true-for-the-paths-checked.

This is the headline finding. `ProviderConfig.enabled`
(`app/core/entities/config.py:24`) is a real, already-wired boolean,
structurally separate from `encrypted_keys` (confirmed in
`ConfigService.update_provider`, `app/core/services/config.py:189` — only
`enabled`/`config` are written, never touches `encrypted_keys`).

It's already checked at **every** dispatch point for a broker sync:

- `ConfigService.dispatch_job()` (`app/core/services/config.py:501`) — for
  the three provider-backed jobs (`sync_zerodha`/`sync_binance`/
  `sync_groww`), checks `cfg.enabled` *before even queuing the Celery task*,
  logging a clean "not configured" job-log entry and raising
  `ConfigurationError` if disabled.
- `_run_broker_sync()` (`app/workers/ingestion/tasks.py:191`) —
  belt-and-suspenders check inside the task itself via
  `ProviderFactory.get(provider_name, required=False)`
  (`app/core/providers/factory.py:26`), which returns `None` and skips with
  a warning log if `cfg.enabled` is false.

Both the manual "Sync Now" path (`POST /portfolio/sync`, dispatches via
`dispatch_job`) and the task body itself independently honor `enabled`.
**Disabling a provider today already fully stops it from creating/updating
Assets, Positions, or Transactions** — no schema change required.

It's also already exposed end-to-end in the UI: `ProviderConfig.jsx`
(`frontend/src/components/aureon/profile/ProviderConfig.jsx:120`) renders an
Enable/Disable button per provider (`handleToggle` →
`apiService.updateProvider(name, {enabled})` → `PUT
/config/providers/{provider_name}`, `app/core/api/config.py:123`).

**4. Credential storage is confirmed structurally separate.**

`ProviderConfig.encrypted_keys` (Fernet-encrypted JSON) is a distinct column
from `enabled`. Toggling `enabled` off/on never touches `encrypted_keys` —
re-enabling requires no re-entry of the key, which is exactly the stated
goal. One real coupling worth knowing: `set_provider_key()` and
`set_provider_keys_bulk()` (`config.py:211`, `:267`) both unconditionally set
`p.enabled = True` as a side effect of saving a key. So if a user disables
Binance and later rotates/re-enters a key (e.g. after Binance forces a new
API key), the provider silently flips back to enabled. Not a blocker — just
means "disable" and "delete key" are different actions with different
side effects, worth surfacing in any UI copy if this gets touched again.

**5. Settings UI precedent: `ProviderConfig.jsx` already *is* the pattern.**

Not just a precedent to reuse — the Enable/Disable toggle described in the
task's goal is the exact same UI element already shipped in
`ProviderConfig.jsx` (provider list at `provider-list` tab in Settings). The
EPF rate-config form (Phase 3) is a *different*, heavier pattern (structured
config fields, not a binary toggle) and isn't the right template here; the
existing per-provider Enable/Disable button already is.

### Tier breakdown

Given the above, there is effectively **nothing left to build** for the
stated goal as described. What actually needs deciding:

- **Tier 1 (mechanical, no open question)**: none — the toggle already does
  what was asked. If the only ask was "confirm this works," it's confirmed.
- **Tier 2 (needs one explicit decision)**:
  - Is "stops future syncs" sufficient, or does the user also want
    already-synced Positions/Transactions from a disabled provider to be
    hidden/excluded from portfolio views while disabled (a display-layer
    filter)? That *would* need Position provenance, which doesn't exist
    today and isn't free to add (Position has no broker column, and
    backfilling one from Transaction history for existing rows is
    non-trivial where multiple brokers could theoretically touch the same
    symbol). Confirm this is out of scope before assuming "toggle" means
    only "stop future writes."
  - Decide whether the `set_provider_key` auto-re-enable side effect
    (finding 4) is acceptable as-is or should be changed (e.g. key rotation
    shouldn't silently re-enable a provider the user deliberately paused).
- **Tier 3 (defer)**: n/a — no larger gaps found.

**6. Disabling the `binance` broker does not touch crypto price quotes.**
Confirmed live: `config.provider_configs` has two separate rows —
`binance` (`provider_type=broker`) and `binance_price`
(`provider_type=price`) — both independently `enabled`. The broker sync
gate (`enabled` on `binance`) only feeds `sync_binance_task`; quote
ingestion for crypto (`ingest_quote`, `app/workers/ingestion/tasks.py:117`)
resolves `binance_price` separately. So disabling the broker to stop
new/updated Positions/Transactions leaves live price updates on existing
crypto holdings completely unaffected — the toggle is scoped exactly to
"stop syncing new data from this source," not "stop pricing this asset
class."

**7. Scope is the API/live-sync path only — file import is untouched.**
`enabled=False` gates `dispatch_job`/`_run_broker_sync`, which is the API
broker-sync path (`POST /portfolio/sync`). It does **not** gate
`portfolio_importer.parse_transaction_file` — manually uploading a Binance
trade-history CSV would still create/update rows even with the `binance`
provider disabled, since that path never calls `ProviderFactory.get()` or
checks `ProviderConfig.enabled` at all. This is very likely the correct
reading of "provider sync toggle" (a plain reading of "sync" is the live API
path, and CSV import is already a manual, one-off, user-initiated action
that has its own "did I mean to do this" friction) — but it should be
stated explicitly if this gets built, since it's an easy gap to assume away.

**Bottom line: Part 1's premise — "would need a provenance field as a
prerequisite" — is false.** The toggle is already live. If the user tries it
and it doesn't behave as expected, that's a bug in already-shipped code, not
a missing feature.

======================================================================

## Part 2 — Pilot reference docs: format + folder selection

### Churn signal (git log, since the 2026-07-07 modularization — prior
history is under the old `domain/`-based layout and isn't comparable)

| Folder | Commits touching it |
|---|---|
| `backend/app/modules/market` | 67 |
| `backend/app/modules/portfolio` | 51 |
| `backend/app/modules/ai` | 49 |
| `backend/app/core/api` | 17 |
| `backend/app/modules/news` | 14 |
| `backend/app/workers/ingestion` | 10 |

Matches the handoff-doc trail: `MARKET_MODULE_AUDIT.md`,
`CRYPTO_SYMBOL_RENDERING_AUDIT.md`, `NAV_INGESTION_SCOPE.md`,
`FUNDAMENTALS_SCORING_SCOPE.md` all point at `market`; `EPF_ESTIMATE_SCOPE.md`
and the existing `PROVIDERS.md` point at `portfolio`. `ai` is a close third
but has less accumulated audit-doc backing so far (touched via Fix H/I/Q per
Phase 3, no standalone module audit yet).

### Recommended pilots: `backend/app/modules/market` and
`backend/app/modules/portfolio`

Reasoning:
- Highest and second-highest churn — most likely to keep changing, so most
  likely to actually get the doc kept current if the regeneration trigger
  (below) is followed.
- Both already have multiple audit/scope docs to point to (no doc invention
  needed to populate the template — real links exist today).
- **`portfolio` already has a doc living in the folder**:
  `app/modules/portfolio/PROVIDERS.md`, referenced directly from
  `CLAUDE.md`. This is directly relevant precedent, but it's a
  **counter-example, not a template**: it's 563 lines of restated
  mechanism detail (broker sync order, credential storage, auth-error
  string-matching, parser column-mapping tables, etc.) — a genuine
  duplicated knowledge dump, exactly what Part 2's brief says not to build.
  It independently confirms this scope doc's Part 1 finding #3 (manual-only
  sync, no beat wiring) almost verbatim, which is a live demonstration of
  the drift risk: two documents now say the same thing about the same code,
  and only one of them will get updated next time it changes. Piloting the
  new thin format in `portfolio` gives a concrete opportunity to replace
  `PROVIDERS.md` with a pointer doc + delete the duplication, rather than
  adding a third document.

### Proposed template (half-page)

```markdown
# <folder path> — reference

**What's here**: <1-2 sentences, plain description of the folder's
responsibility — not a restatement of file names>.

**Why it's shaped this way**: <1-2 sentences on the one or two most
non-obvious structural decisions, if any. Omit if nothing is non-obvious.>

**Details / history**: see —
- `<AUDIT_OR_SCOPE_DOC.md>` — <one clause on what it covers>
- `<AUDIT_OR_SCOPE_DOC.md>` — <one clause on what it covers>

_Last touched: <date>, by <doc name/commit that prompted the update>._
```

### Worked example — `backend/app/modules/portfolio/`

```markdown
# backend/app/modules/portfolio/ — reference

**What's here**: everything that turns broker data (live API sync or
statement/CSV import) into Portfolio/Position/Transaction rows, plus
portfolio-level valuation (snapshots, FX conversion, EPF/NPS estimate
pricing).

**Why it's shaped this way**: broker sync (`providers/broker/*`) and file
import (`services/portfolio_importer.py`) are two separate code paths for
the same destination tables — sync is live/authenticated, import is
stateless parsing of exported statements (Zerodha/Groww/Binance/CDSL
CAS/NPS/EPF). Position has no per-broker provenance column by design; broker
attribution lives only on `Transaction.broker`.

**Details / history**: see —
- `EPF_ESTIMATE_SCOPE.md` — EPF interest-accrual estimate design
- `PROVIDER_TOGGLE_AND_PILOT_DOCS_SCOPE.md` §Part 1 — provider enable/
  disable mechanism (sync gating, credential separation)
- `Aureon handoff phase3.md` §4 — COIN-M margin fix, LD*-Earn wrapper merge

_Last touched: 2026-07-16, by this scope doc._
```

(`PROVIDERS.md`'s content, once this pilot lands, should be trimmed to what
isn't already covered by an audit/scope doc and the rest deleted — a
follow-up action, not part of this scoping pass.)

### Regeneration trigger

Proposed wording, to be added to the handoff doc's working-discipline
section (the actual Phase 4 doc once it exists, or appended to Phase 3 in
the interim):

> **Reference doc upkeep**: if a session's audit/scope work materially
> changes what's true about a piloted folder (`market/`, `portfolio/`),
> update that folder's `reference.md` as part of the same session/commit —
> not a separate maintenance task, not deferred. If the folder doesn't have
> a `reference.md` yet and the work touching it would take more than ~3
> sentences to summarize, that's a signal to create one following the
> template in `PROVIDER_TOGGLE_AND_PILOT_DOCS_SCOPE.md` §Part 2.

This keeps the trigger inside the same discipline that already governs "did
you write a scope/audit doc for this work" — no new standing task.

======================================================================

## Summary of asks for the user

1. **Part 1**: confirm the toggle-as-it-exists (disable Binance → API sync
   jobs no-op, price quotes on existing holdings unaffected, CSV import
   still works regardless, credentials untouched, re-enable works) is
   actually what was wanted, or whether the Tier 2 question (hide
   already-synced rows from a disabled provider, or also block CSV import)
   is also in scope — the row-hiding case *would* need new work (and
   possibly a Position-level provenance column).
2. **Part 2**: confirm `market` + `portfolio` as the two pilots, and confirm
   the plan to eventually fold `PROVIDERS.md` into the new format rather
   than keeping both.

No implementation started. Waiting for review.
