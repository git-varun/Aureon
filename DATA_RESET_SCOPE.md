# Data-Only Reset — Scope Doc

**Status: scoping only, no implementation. Do not proceed past this doc without
explicit sign-off on §1's table classification** — this feature is irreversible
by nature, higher bar than a normal audit.

Builds on `Aureon handoff phase3.md` working discipline, `WATCHLIST_MODULE_AUDIT.md`
§4.8 (asset_snapshot orphan/FK finding), and `PROVIDER_TOGGLE_AND_PILOT_DOCS_SCOPE.md`
(credential/data separation). Decisions already made, not relitigated here:
data-only reset (credentials/provider-config/JobConfig/user-settings survive),
support both full wipe and selective/scoped clearing, mandatory backup-first
with no bypass.

Repo note: actual backend root is `backend/` (no `investment-os/` prefix in
this checkout).

---

## 1. Table-by-table classification

Legend: **DATA** = in scope for reset · **SURVIVES** = config/credential, never
touched · **⚠ AMBIGUOUS** = flagged, not resolved here.

### `config` schema — all SURVIVE (per existing decision)
| Table | Notes |
|---|---|
| `provider_configs` | `encrypted_keys`/`enabled`/`config` — credentials, untouched by design |
| `job_configs` | enabled flags, schedule metadata — survives |
| `allocation_targets` | ⚠ **AMBIGUOUS** — user-set target allocation %/bands, same shape as `monthly_saving`/`target_profit_pct` (which explicitly survive), but nobody has named it in the decisions list. Recommend: treat as SURVIVES (it's user *preference*, not generated data), but flag for explicit confirmation. |
| `job_logs` | ⚠ **AMBIGUOUS** — this is job **execution history** (status/task_id/error/duration per run), not config, despite living in the `config` schema. It's generated data, not a setting. Recommend: treat as DATA (safe to clear, has no downstream FK dependents), but it sits in a schema whose other three tables all survive — worth an explicit call so "clear config schema" isn't assumed to mean "clear all of config.*". |

### `system` schema
| Table | Classification | Notes |
|---|---|---|
| `users` | ⚠ **AMBIGUOUS → recommend SURVIVES, but not via simple exclusion** | See §2.1 — this is the load-bearing case the task asked about. |
| `user_preferences` | **SURVIVES** | This *is* the monthly_saving/target_profit_pct/risk_profile/theme-ish settings row (no literal "theme" column — `MarketTheme` is an unrelated market-analysis construct, not UI theme). **CASCADE-deletes if `users` row is deleted** — see §2.1, this is why naive user-row deletion is wrong. |
| `providers` | DATA (global telemetry) | Not user data; ingestion/provider registry. Out of scope either way — not part of "my data." |
| `provider_usage` | DATA (global telemetry) | Usage/cost tracking per `Provider`. Out of scope, same reasoning. |
| `failed_ingestions` | DATA (global log) | Out of scope — ops log, not user data. |
| `task_runs` | DATA (global log) | Out of scope — Celery observability log. |
| `audit_logs` | ⚠ **AMBIGUOUS** | `actor_id` FKs to `users.id` (SET NULL). Arguably should survive a reset as the record *of* the reset itself (audit trail integrity) — recommend excluding from all reset scopes regardless of decision. |

### `notification` schema
| Table | Classification |
|---|---|
| `web_notifications` | DATA — per-user (`user_id` FK, CASCADE, nullable so some may be global broadcasts). In scope. |

### `market` schema — reference data (see open question, §3)
| Table | Classification | Notes |
|---|---|---|
| `assets` | Global reference | Ingestion-populated identity table |
| `latest_quotes` | Global reference | PK is `symbol`, not FK'd to anything |
| `asset_snapshot` | Global reference | **PK `asset_id` has no FK constraint to `assets.id`** — confirmed, matches WATCHLIST_MODULE_AUDIT §4.8 finding exactly. This is one of two disconnected "asset identity" chains in the schema (see §2.2). |
| `asset_features`, `asset_fundamentals`, `asset_health` | Global reference | All CASCADE from `asset_snapshot.asset_id` |
| `price_history` | Global reference | CASCADE from `assets.id` (the *other* identity chain) |
| `market_themes` | **Mixed** | Public/system themes (`is_public=True`, `owner_id=NULL`) are global reference; user-forked ones (`owner_id` set, CASCADE from `users.id`) are per-user DATA. Needs a `WHERE owner_id = <default_user>` filter, not a blanket table clear. |
| `theme_weights` | Global reference | Tied to `theme_id` string (not FK'd) — no clean way to split public vs. user-owned weights at the DB level since it doesn't distinguish; follows whatever `market_themes` decision resolves to, but can't be filtered by owner directly (would need a join through `market_themes.theme_id`). |

### `evaluation` schema — global reference
| Table | Classification |
|---|---|
| `asset_scores` | Global — CASCADE from `asset_snapshot.asset_id` |
| `feature_snapshots` | Global — CASCADE from `asset_snapshot.asset_id`, time-series, highest row-count table in the schema |

### `news` schema — global reference
| Table | Classification |
|---|---|
| `news`, `news_assets` | Global — ingestion-populated |
| `asset_sentiment_snapshots` | Global — **only FK in the codebase with no explicit `ondelete`** (defaults to RESTRICT), points at `assets.id` not `asset_snapshot.asset_id` (inconsistent with the rest of the schema, see §2.2) |

### `portfolio` schema — DATA, core scope
| Table | Classification | Notes |
|---|---|---|
| `portfolios` | DATA | Single row today (`get_user_context` does `.first()`, not scoped by user). Deleting it CASCADEs everything below and self-heals on next request. |
| `transactions` | DATA | Core ledger |
| `positions` | DATA | ⚠ **Premise corrected during backup/restore implementation**: true for spot positions (fully re-derivable via `recalculate_position`/`_apply_trade_cost_basis`, live-verified). **False for futures positions** (`wallet != 'spot'`) — these have zero backing `Transaction` rows at all; broker-sync (`_sync_futures_positions`) writes `Position` directly from the live Binance futures API response (`leverage`, `side`, `liquidation_price`, `unrealized_pnl`, `margin_usd`), so a transaction-based backup cannot capture or restore them. A reset that CASCADEs `portfolios` deletes them with no ledger to reconstruct from — recovery is "re-sync Binance" (credentials survive reset), not "restore from backup," unless backup is extended to snapshot raw futures Position rows too (with the caveat that `unrealized_pnl`/`liquidation_price` are live values, stale the instant they're persisted). Flagging as open, not resolved. |
| `snapshots` | DATA | Singleton per portfolio (PK = `portfolio_id`, despite the name it's not a history table) |

### `watchlist` schema — DATA
| Table | Classification |
|---|---|
| `watchlists` | DATA — CASCADE from `users.id` |
| `watchlist_symbols` | DATA — CASCADE from `watchlists.id` (both DB-level FK cascade and an ORM-level `cascade="all, delete-orphan"` — belt and suspenders) |

### `ai` schema — DATA
| Table | Classification |
|---|---|
| `ai_briefings` | ⚠ **AMBIGUOUS** — no user FK at all; briefing_type includes global/weekly/monthly *and* single-asset types. Functionally more like a cache of AI output than per-user history. Recommend: DATA (clear on full reset — it's AI-generated, re-creatable), but note it isn't cleanly "per-user" the way ai_generations is. |
| `ai_generations` | DATA — `user_id` SET NULL (nullable) |
| `ai_evaluations` | DATA — CASCADE from `ai_generations.id` |
| `ai_feedback` | DATA — CASCADE from `ai_generations.id`, `user_id` SET NULL |

### `recommendation` schema — DATA
| Table | Classification |
|---|---|
| `recommendations` | DATA — CASCADE from `asset_snapshot.asset_id` (⚠ see §2.2 — this couples recommendation-history reset to market-reference reset) |
| `recommendation_explanations`, `recommendation_outcomes` | DATA — CASCADE children of `recommendations` |

---

## 2. Dependency graph, traced live from the schema

### 2.1 — `system.users` row: confirm-and-refine the task's framing

Confirmed via `app/api/dependencies.py:138-146`:

```python
def get_current_user(users_repo=Depends(get_users_repo)) -> User:
    user = users_repo.get_by_id(DEFAULT_USER_ID)
    if not user:
        user = User(id=DEFAULT_USER_ID, email="local@aureon.app", is_active=True)
        user = users_repo.create(user)
        users_repo.session.commit()
    return user
```

`DEFAULT_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")` (`app/core/constants.py`) —
yes, a hardcoded default that self-heals on next request if the row is missing.
**But this is not simply "safe to delete, it comes back."** `UserPreference`
(the actual settings row — `monthly_saving`, `target_profit_pct`, `risk_profile`,
etc.) has `ondelete="CASCADE"` on `user_id → system.users.id`. Deleting `users`
would delete `user_preferences` too, and `serialize_user_profile` recreates it
with **hardcoded defaults** (`risk_profile="moderate"`, `target_profit_pct=12.0`,
`monthly_saving=25000.0`, `swing_trading_enabled=True`) — silently discarding
whatever the user had actually configured. That directly violates the "user
settings survive" decision, even though the *user row itself* self-heals.

**Conclusion: `system.users` must be excluded from deletion outright** — not
because the row is precious, but because deleting it is the only way
`user_preferences` gets destroyed as collateral. The correct reset mechanism
never touches `users` or `user_preferences`; it only deletes rows that FK to
`users.id` with CASCADE (`watchlists`, `market_themes.owner_id`-scoped rows)
or SET NULL (`ai_generations`, `ai_feedback`, `audit_logs.actor_id`) — i.e.
delete children, never the parent.

Same logic extends to `portfolio.portfolios`: `get_user_context` does
`db.query(Portfolio).first()` (not even keyed by user id) and recreates
`Portfolio(name="Default Portfolio")` if none exists. Deleting the single
`portfolios` row CASCADEs `transactions`/`positions`/`snapshots` cleanly and
self-heals on next request with an empty row — this one *is* a clean, safe
single-row-delete lever for a full portfolio-data wipe, unlike the `users` row.

### 2.2 — Two disconnected "asset identity" chains — confirms and sharpens WATCHLIST_MODULE_AUDIT §4.8

There are two separate PK/FK hubs for "an asset," not DB-linked to each other:

- **Chain A**: `market.assets.id` → `price_history.asset_id` (CASCADE), `news.news_assets.asset_id` (CASCADE), `news.asset_sentiment_snapshots.asset_id` (no ondelete, defaults RESTRICT)
- **Chain B**: `market.asset_snapshot.asset_id` (bare PK, no FK to `assets.id`) → `asset_features`/`asset_fundamentals`/`asset_health` (CASCADE), `evaluation.asset_scores`/`feature_snapshots` (CASCADE), `recommendation.recommendations` (CASCADE), `portfolio.transactions`/`positions` (SET NULL)

**Confirms the task's question directly: yes, a full reset needs a special-cased
cleanup step for `asset_snapshot`.** Deleting all `market.assets` rows will
**not** cascade to `asset_snapshot` or anything hanging off it — those rows
would become the exact same permanently-orphaned pattern §4.8 already found
for one-off `ensure_asset_exists` calls, just at full-table scale. A correct
full market-reference wipe must explicitly `DELETE FROM market.asset_snapshot`
(which then cascades through Chain B) **in addition to** `DELETE FROM
market.assets` (Chain A) — order doesn't matter between the two chains since
neither references the other, but each chain's own internal CASCADE order
must be respected (or just rely on CASCADE and delete the two root tables,
`assets` and `asset_snapshot`, in either order).

`asset_sentiment_snapshots` is the one exception with no `ondelete` (defaults
to RESTRICT) — a market-data wipe must delete this table's rows *before*
deleting `assets`, or the `assets` delete will fail outright.

### 2.3 — Recommendation deletion: does it cascade or orphan?

Confirmed: `recommendations.asset_id → asset_snapshot.asset_id` is **CASCADE**.
`transactions.recommendation_id → recommendations.id` is **SET NULL**.
`recommendation_explanations`/`recommendation_outcomes` are CASCADE children
of `recommendations`. `recommendation_outcomes.ledger_transaction_id →
transactions.id` is SET NULL.

So: deleting all `recommendations` rows directly is clean — no orphans,
`transactions.recommendation_id` just goes null, explanation/outcome children
cascade away. **But the reverse direction is the real finding**: because
`recommendations.asset_id` CASCADEs *from* `asset_snapshot`, a full
market-reference-data wipe (§2.2) will **implicitly delete all Recommendation
history** as a side effect, even if "AI/recommendation history" was meant to
be an independently selectable scope (§4). This is a real coupling the
selective-scope design must account for — see §4's ordering note.

### 2.4 — Full-wipe dependency order (if "wipe everything" is chosen)

1. `news.asset_sentiment_snapshots` (must precede `assets` — no ondelete)
2. `market.assets` (CASCADEs → `price_history`, `news.news_assets`)
3. `market.asset_snapshot` (CASCADEs → `asset_features`, `asset_fundamentals`,
   `asset_health`, `evaluation.asset_scores`, `evaluation.feature_snapshots`,
   `recommendation.recommendations` → its own CASCADE children →
   `transactions.recommendation_id` SET NULL as a side effect)
4. `portfolio.portfolios` (CASCADEs → `transactions`, `positions`, `snapshots`)
   — self-heals on next request
5. `watchlist.watchlists` scoped to default user (CASCADEs → `watchlist_symbols`)
   — or simply all rows, single-user system
6. `ai.ai_generations` (CASCADEs → `ai_evaluations`, `ai_feedback`)
7. `ai.ai_briefings` (no FK, delete directly)
8. `market.market_themes` filtered to `owner_id = DEFAULT_USER_ID` (public/
   system themes with `owner_id IS NULL` survive) — `theme_weights` rows for
   deleted themes become orphaned strings-by-`theme_id` unless also explicitly
   filtered/joined, since there's no FK to clean them up automatically
9. `config.job_logs` — independent, no dependents, order doesn't matter
10. Never touch: `system.users`, `system.user_preferences`, `config.*` (except
    `job_logs` per #9), `system.audit_logs`

---

## 3. Open question — does "market reference data" belong in a data-only reset?

Not resolved here, flagging per the task's instruction.

**Option A — narrow reset ("my data only")**: wipe only §2.4 steps 4-8
(portfolio/watchlist/AI/recommendation history), leave all of `market`/
`evaluation`/`news` alone. Fast (seconds), no re-ingestion needed, but not a
true "clean slate" — old prices/snapshots/scores persist untouched.

**Option B — full reset including market reference data**: also run steps
1-3. Slower (re-ingestion required to repopulate `assets`/`latest_quotes`/
`asset_snapshot`/etc. — real API calls against Yahoo/Finnhub/Polygon/Binance,
not instant), but a genuinely clean slate.

The complication for Option B specifically: **§2.3 means wiping market
reference data destroys recommendation history as an unavoidable side effect**,
even in a selective-clear world where "clear market reference data" and
"clear recommendation history" are nominally independent checkboxes (§4) —
if a user selects only "market reference data," recommendations disappear
too, whether they asked for that or not. This needs to be surfaced in the UI
copy for that specific scope option, not silently absorbed.

No recommendation made here — this is a product-judgment call the task
explicitly asked not to be resolved unilaterally.

---

## 4. Concrete selective-clear scopes

Proposed list, each independently selectable (multi-select checkboxes), full
wipe = all boxes checked:

1. **Portfolio data** — `transactions`, `positions`, `snapshots` (via deleting
   the `portfolios` row, self-heals)
2. **Watchlists** — `watchlists`, `watchlist_symbols`
3. **AI history** — `ai_generations`, `ai_evaluations`, `ai_feedback`,
   `ai_briefings`
4. **Recommendation history** — `recommendations`, `recommendation_explanations`,
   `recommendation_outcomes` — **UI copy must disclose**: also gets cleared
   implicitly if scope 5 is selected (§2.3/§3)
5. **Market reference data** *(only if §3 resolves to "yes, this should be
   selectable")* — `assets`, `latest_quotes`, `asset_snapshot` and everything
   CASCADE from it, `price_history`, `news.*`, `evaluation.*` — **UI copy must
   disclose**: this also clears scope 4 regardless of whether it's checked,
   and requires re-ingestion (real API calls, non-instant) to restore basic
   functionality
6. **Custom market themes** — `market_themes` filtered to the default user's
   forked/owned themes only (public/system themes untouched), plus their
   `theme_weights` (join-filtered by `theme_id`, since no FK exists to
   cascade this automatically)

Notifications (`web_notifications`) — not listed as its own scope; recommend
bundling into full-wipe only, or omitting from the picker entirely as too
minor to warrant its own checkbox (SPAR: flag, don't decide).

---

## 5. Backup-first enforcement — mechanism + a real gap

### What exists today

`GET /portfolio/backup` (`export_backup`, `portfolio.py:509-547`) exports
**only**: `transactions` (partial columns — drops `id`, `fees`, `taxes`,
`kind`, `broker_reference`, `recommendation_id`, `asset_id`, timestamps) and
`watchlists` (name + symbol list only). `POST /portfolio/restore` only
re-imports transactions — **the exported `watchlists` key is read for the
dry-run count and then silently discarded on actual restore**, no
`Watchlist`/`WatchlistSymbol` rows are ever recreated. This is a pre-existing
asymmetry, confirmed by reading the code directly, independent of this
scoping task but directly relevant to it.

### The gap this creates for backup-first enforcement

**If the reset feature's backup-first gate is "an export just happened," the
existing `/portfolio/backup` does not actually let you restore everything a
full reset could delete.** It covers scope 1 (partially) and scope 2 (export
only, restore is broken) from §4's list. It covers **none** of: AI history,
recommendation history, custom themes, or (if §3 resolves to include it)
market reference data. Treating today's backup as a complete safety net for
this feature would be presenting an incomplete guarantee as complete — the
same fabrication-adjacent pattern this audit chain has flagged before
(MONITORING_MODULE_AUDIT's `verify_backups`/`verify_restore_procedures`
finding is the direct precedent: a name/claim that promises more than the
code does).

**This needs to be resolved before backup-first can be "mandatory, no
bypass" in good faith** — either:
- (a) extend `/portfolio/backup`'s export to cover every DATA table in scope
  for whatever reset scopes are approved (and fix the watchlist-restore gap
  as part of the same work), or
- (b) scope backup-first enforcement per-reset-scope: e.g. a "clear AI
  history" action requires a backup that actually includes AI history, not
  just any recent transactions export.

Not deciding here — flagging because building backup-first enforcement on
top of today's backup endpoint without addressing this would ship a false
sense of safety on a genuinely destructive feature.

### Proposed enforcement mechanism (mechanism only, contingent on the gap above being resolved)

Token/receipt approach, not a time-window check — a time window ("backup
within last N minutes") can't prove the backup covered the *right* scope
(e.g. a transactions-only backup from 2 minutes ago doesn't cover an "AI
history" reset). Concretely:

1. Export endpoint returns a receipt (e.g. a hash of the export content +
   which scopes it covered + a short-lived signed token) alongside the file.
2. Reset endpoint requires that token, validates it names a superset of the
   scopes being reset, and rejects otherwise with a specific message ("your
   last backup didn't include AI history — export again before clearing it").
3. Token expires quickly (e.g. 10 minutes) so a stale backup can't be reused
   to authorize a reset of data that changed since.

This is a mechanism sketch, not a spec — needs review alongside whichever
option from the gap above is chosen.

---

## 5.1 Redis cache invalidation — not optional, per the handoff's own discipline

The handoff's working discipline (`Aureon handoff phase3.md` §3) states directly:
*"A direct-DB write/cleanup bypasses whatever cache-invalidation the service
layer normally does — always check what Redis keys a table feeds before doing
raw-SQL cleanup, and invalidate them explicitly."* A reset is exactly this
pattern at maximum scale, and per CLAUDE.md `app/core/redis.py` caches
(`cache_quote`, `cache_asset_snapshot`, AI briefing results — "stored in
AIBriefing and also cached in Redis") feed `GET /api/state`, the frontend's
primary data source. Clearing tables without invalidating the keys they feed
means the app keeps serving deleted data from cache after a reset — the exact
"cache silently defeated the fix" failure mode the handoff already caught once
this audit chain.

This applies at both reset granularities: an "AI history" clear needs the AI
briefing cache invalidated; a "market reference data" clear (if §3 resolves to
Option B) needs quote/asset-snapshot caches invalidated too. **Not enumerating
the exact key list here** (implementation detail, deferred) — but asserting
that whichever reset scopes get built must include an explicit Redis
invalidation step per table cleared, not just the DB delete. Any implementation
plan for this feature should open by tracing which cache keys each in-scope
table feeds, the same way the market-module audit did for quote staleness.

### Concurrency with background ingestion

Celery beat runs on its own schedule regardless of a reset in progress. A
market-reference wipe (§2.4 steps 1-3) racing against the hourly pipeline could
have a worker re-insert an `asset_sentiment_snapshots` row between step 1 and
step 2 (making the RESTRICT-constrained `assets` delete fail), or repopulate
`asset_snapshot` right after it's cleared. A destructive reset likely needs to
pause the relevant workers/beat schedule (or take some kind of lock) before
running, not just run the deletes in dependency order and hope nothing
interleaves. Flagging for the same reason as the UI friction note — this is a
design constraint to account for, not something to build unilaterally here.

---

## 6. UI/UX shape (brief)

- Lives in **Settings**, a dedicated "Danger Zone" section — consistent with
  where backup/restore already lives (`Settings.jsx`, per
  MONITORING_MODULE_AUDIT.md's finding that backup/restore is already wired
  there).
- Given irreversibility: typed confirmation phrase (not just a checkbox) —
  e.g. type the exact word "RESET" or the specific scope name being cleared,
  plus a second explicit "yes, I understand this cannot be undone" checkbox.
  Double-confirmation (typed phrase + separate confirm click) matches the
  severity; a single modal "Are you sure?" does not.
- Full wipe vs. selective clear should be visually distinct actions, not one
  button with a scope picker buried in a modal — the blast-radius difference
  is large enough to warrant separate entry points.
- Not a full design pass per the task's scope — flagging placement and
  friction level only.

---

## Summary — what needs a decision before implementation

1. **§1**: sign off on the table classification, especially `allocation_targets`,
   `job_logs`, `ai_briefings`, `audit_logs` (all flagged ambiguous).
2. **§3**: does "data-only reset" include market/news/evaluation reference
   data, or only portfolio/watchlist/AI/recommendation history? Real UX and
   time-cost tradeoff either way, and a real coupling to recommendation
   history either way (§2.3).
3. **§5**: today's `/portfolio/backup` doesn't cover enough of the data a
   reset could delete to be a complete safety net as-is — needs either an
   export extension or per-scope enforcement before "mandatory backup-first,
   no bypass" is honest.
4. **§5.1**: any implementation must include explicit Redis cache invalidation
   per table cleared (not just DB deletes), and should account for pausing
   ingestion workers during a reset to avoid a race with the hourly pipeline.

No implementation has been started. Stopping here per the task's instruction.
