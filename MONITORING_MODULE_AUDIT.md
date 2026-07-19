# Monitoring Module Audit

Date: 2026-07-16
Scope: end-to-end audit of the "Monitoring" module — backend and frontend,
live verification against the running stack (docker compose, API on
:8002). First full audit of this module (one of the four never-audited
modules from the original Phase 3 candidate list).

**Headline: backend is real and functionally correct; the module has
zero frontend presence; and two of its seven endpoints fabricate a
specific claim they don't actually check.**

---

## 1. What "Monitoring" actually is

Two backend surfaces, both live and mounted:

- **`app/api/v1/monitoring.py`** → `/api/v1/monitoring/*`, 7 endpoints:
  `assets/{id}/health`, `providers`, `failed-ingestions`, `dependencies`,
  `health/aggregate`, `backups/verify`, `restore/verify`. Backed by
  `MonitoringService` (`app/core/services/monitoring.py`) +
  `MonitoringRepository` (`app/core/repositories/monitoring.py`).
- **`app/core/api/system/health.py`** → `/api/v1/health` and
  `/api/v1/health/score`. Shares `MonitoringRepository` with the module
  above (same DB/Redis/Celery dependency checks, duplicated rather than
  reused). `/health` is the one real consumer in the stack: it's the
  Dockerfile's `HEALTHCHECK` and `docker-compose.yml`'s `api` service
  healthcheck (both `curl -f http://localhost:8002/api/v1/health`).
  `/health/score` delegates to `HealthScoreEngine`
  (`app/core/observability/health.py`).

**There is no frontend "Monitoring" destination.** Confirmed by grep and
by reading `routes.js` / `BottomNav.jsx` / `pages/aureon/` /
`components/aureon/`: no route, nav entry, page, or component named or
labeled Monitoring exists. `apiService.js` never calls any
`/monitoring/*` or `/health*` path — the only "health"-named frontend
call (`getPortfolioHealth`) hits a completely unrelated endpoint
(`/intelligence/portfolio-health`, AI module). The single grep hit for
"monitoring" in `frontend/src` is unrelated marketing copy in
`flow.jsx` ("Aureon is monitoring your portfolio...").

So: **"Monitoring" is an ops/API surface only.** Its one live consumer is
Docker's own healthcheck loop, not a human via the UI. Everything else
under `/api/v1/monitoring/*` is reachable only by curling it directly.

## 2. Overlap check against prior audit findings

Explicitly reconciled, per the task brief, against three things built or
found earlier this session-chain:

- **TaskRun / Celery signal handlers** (`system.task_runs`,
  `app/workers/celery_app.py`) — **zero overlap.** `MonitoringRepository`
  never queries `TaskRun`. Confirmed by grep: `TaskRunRepository` has
  exactly two references in the whole backend — its own file and the
  three signal handlers in `celery_app.py` that write to it. The one
  `select(TaskRun...)` inside `task_run.py` is `mark_terminal` looking up
  its own just-created row to update it, not an external read. **Nothing
  outside that file reads `task_runs` back out anywhere** — no endpoint,
  no service. It's a write-only audit trail today.
- **`audit_logs`** (`system.audit_logs`, `app/core/services/audit.py`) —
  **zero overlap.** `log_audit_action` has real, numerous callers
  (portfolio, recommendation, ai, config services — ~15 call sites), so
  the table is actively written. But same pattern as TaskRun: **grep
  finds no reader anywhere.** Monitoring doesn't expose it; nothing else
  does either.
- **`HealthScoreEngine` / `ErrorFingerprinter`**
  (`app/core/observability/health.py`) — **partial, direct overlap.**
  `health_engine` is used by both `/api/v1/health/score` (health.py) and
  the four global exception handlers in `main.py` (attaches a
  `fingerprint` field to error responses). This *is* part of what a user
  would call "Monitoring" if it had a UI — it's just wired into the
  `/health` router file rather than `/monitoring/*`, and, like
  everything else here, has no frontend.

Net: Monitoring, TaskRun, and audit_logs are three genuinely separate
pieces of infrastructure that don't talk to each other. Two of the three
(TaskRun, audit_logs) are write-only with no read path anywhere in the
codebase — not just missing from Monitoring specifically. That's a
real gap, but building the read side wasn't in scope for this audit and
is exactly the kind of unrequested-scope-expansion the working
discipline says to flag, not build (Tier 3, below).

## 3. No-fake-data check

Live-tested all 7 `/api/v1/monitoring/*` endpoints plus `/health` and
`/health/score` against the running stack (real data, not mocked).

**Correct, no fabrication found:**
- `get_dependencies_status` / `/health` — Postgres, Redis, Celery checks
  each have their own try/except that reports the *actual* exception
  string (`f"unhealthy: {e}"` / `f"unknown: {e}"`), never silently
  downgrades a real exception into "healthy". Verified live: returned
  `{"postgresql":"healthy","redis":"healthy","celery":"healthy"}`
  against the running stack, and the logic correctly requires all three
  to be explicitly `"healthy"`-ish before reporting `UP`/`healthy`
  overall — an exception on any one of them flips the aggregate.
- `get_provider_health` / provider status in `/health` — reflects a real
  column (`Provider.health_status`) written by
  `IngestionRepository.mark_provider_healthy` /
  `mark_provider_degraded` on actual ingestion outcomes. Live-verified:
  currently shows `yahoo: degraded`, which is real — see the
  `failed-ingestions` finding below — not a hardcoded default.
- `get_asset_health` — delegates to `AssetHealthService.compute`
  (`app/modules/market/services/asset_health.py`), which already
  implements the tri-state "unknown vs. healthy vs. unhealthy" pattern
  correctly (`_dimension_status`, `evaluate_health_status`): a
  dimension with no data returns `"unknown"` explicitly rather than
  defaulting to a neutral-looking "healthy". This is the fix pattern the
  project has been applying elsewhere, already done right here.
- `get_failed_ingestions` — live-verified: returns real, current
  failures. As of this audit, 48+ recent rows, all
  `provider: yahoo`, all `"No price returned by Yahoo Finance for symbol
  LD{ETH,BTC,SKY,USDT,ATOM,SXT}-USD"`, recurring roughly hourly. These
  are Binance Earn-wrapper symbols (`LD*`) — the same ones merged into
  their underlying asset in commit `d55884e`. Yahoo Finance is being
  queried for symbols that structurally don't exist there, and it's
  been failing continuously with nobody able to see it (no frontend
  surface for this endpoint at all). **Not a Monitoring-module bug** —
  the ingestion code correctly logs the real failure — but it's a
  concrete illustration of point 1: real, actionable failure data exists
  and is invisible. Flagged here for the ingestion/watchlist audit
  owners, not proposed for a fix in this pass (out of scope).

**Fabrication found — Tier 1, both endpoints:**

- **`verify_backups` (`/monitoring/backups/verify`)** — does not verify
  backups. It counts rows in the live `Transaction` table and returns
  `"status": "verified"` with the message *"Database verification
  checked. Active ledger has N transactions."* No backup file is read,
  no `pg_dump`/`pg_restore` is invoked, no separate backup artifact is
  touched at all — it's a proxy over the *live* database, not a check of
  whether a *backup* exists or is restorable. The endpoint name and
  response shape (`"status": "verified"`) assert something was verified
  that categorically wasn't. This is the project's core fabrication
  pattern (category c: a value presented as a real check result when no
  such check ran) applied to an ops-facing claim rather than a UI value
  — same defect class, different audience.
- **`verify_restore_procedures` (`/monitoring/restore/verify`)** — same
  shape. It checks whether every `Position.symbol` has a matching
  `LatestQuote` row and reports `"restore_integrity_check": "passed"` /
  `"status": "healthy"`. That's a live referential-integrity check
  between two current tables, not a test of any restore procedure —
  no backup is restored to a scratch DB, nothing about disaster recovery
  is exercised. Live-verified: currently returns `passed`, `0` orphans —
  which is a true statement about position/quote consistency, but a
  false one about "restore procedures" having been verified.

Both are safe, real code with no crash risk — they just answer a
different, easier question than the one their name and response promise.

**This isn't a case of "infrastructure that was never built" — a real
backup/restore mechanism exists elsewhere in the app and these endpoints
ignore it entirely.** `GET /portfolio/backup` (`export_backup`,
`portfolio.py:494`) exports transactions + watchlists as a downloadable
JSON file; `POST /portfolio/restore` (`restore_backup`, `portfolio.py:536`)
re-imports one, with a dry-run mode. Both are wired to the frontend
(`apiService.js:244-248`, called from `Settings.jsx`) — this is the
product's actual, user-facing backup/restore feature. `Dockerfile:43`'s
comment ("postgresql-client for backups") suggested a pg_dump-based
mechanism might exist too, but grepping the whole backend for
`pg_dump`/`pg_restore`/any backup celery task or cron job found nothing
— that comment appears to be describing intent or an unused dependency,
not a real second backup path.

So `verify_backups`/`verify_restore_procedures` don't verify the backup
mechanism that actually exists (never touch `/portfolio/backup`'s export
path, never attempt a restore dry-run) — they check unrelated proxies
(live transaction count; position/quote referential integrity) that
happen to share vocabulary with "backup" and "restore" but test neither.
**Recommend Tier 2**: needs one decision — either (a) rename these to
reflect what they actually check, or (b) make them verify the real
mechanism (e.g., confirm `/portfolio/backup` produces valid, importable
output). Not fixing unasked in this pass.

**Minor, adjacent finding — Tier 1:**

- **`AssetHealth.provider_name` is a hardcoded literal `"default"`**
  (`app/modules/market/services/asset_health.py:143`), never the actual
  data source (Yahoo/Binance/etc.). Confirmed live:
  `GET /monitoring/assets/{id}/health` returns
  `"provider_name":"default"` for an asset whose quote is live and
  fresh. The field name promises to identify which provider supplied
  the underlying data; it never does. Low severity (it's not a status
  claim, doesn't affect the `HEALTHY`/`STALE`/`DEGRADED` determination),
  but it's the same "field name says one thing, value says another"
  shape as the fabrication findings above. Mechanical fix if addressed
  (either wire in the real provider name from the quote, or drop the
  field) — no design question, so Tier 1, not urgent.

**Cross-cutting remnant — Tier 1, found here, belongs to the auth audit
family:** `app/core/api/system/health.py:107` —
`"google_oauth_configured": settings.GOOGLE_CLIENT_ID is not None` in
`/health`'s `configuration` block. Grepped: `GOOGLE_CLIENT_ID` has
exactly two references in the whole backend — its own definition in
`config.py` and this one read site. No Google OAuth flow exists
anywhere (consistent with `AUTH_IDENTITY_REMNANTS_AUDIT.md`'s finding
that the whole auth/identity path is dead). This is a dead-auth remnant
leaking into a live, Docker-healthchecked endpoint's output — currently
always reports `false`. Wasn't caught by the auth audit because it's a
config-plumbing usage, not an auth-flow usage. Same disposition as that
audit's Tier 1 items: safe to delete (drop the key + the now-unused
`GOOGLE_CLIENT_ID` setting) once someone's touching this file, not
urgent standalone.

## 4. Dead/stale code check

- **The 7 `/api/v1/monitoring/*` endpoints are not dead code** — they're
  live, mounted, and return correct data when curled. They're *unused by
  the product's UI*, which is a different thing from dead. This isn't
  the "presents as working, does nothing" pattern found in watchlist
  alerts or the old Sign-out button (those were UI elements a user could
  click that silently no-op'd); this is backend-only ops tooling nobody
  wired a UI to. Whether that's intentional (ops surface, curl it
  yourself) or an oversight (should have a dashboard) is a product
  decision, not a bug — flagged as Tier 3 below, not fixed here.
- `verify_backups` / `verify_restore_procedures` are the closest thing to
  the "presents as working" pattern in this module: they're live,
  return 200, and their names claim a specific kind of verification
  happened. Already covered in section 3.
- No unreachable code, no orphaned imports, no leftover mock/stub found
  in `monitoring.py` (service/repo/router) or `health.py`.

## 5. Does Monitoring monitor itself correctly?

**Yes, for the dependency/provider checks — verified live, no
silent-failure path found.**

- Postgres/Redis/Celery checks each isolate their own try/except; an
  exception in one never gets conflated with "everything's fine" for the
  others, and the aggregate (`get_aggregate_health`, `/health`'s
  `is_healthy`) requires every dependency to be explicitly healthy
  before reporting up/healthy — a thrown exception anywhere correctly
  flips it to DEGRADED, it doesn't get swallowed into a passing state.
- Provider health (`Provider.health_status`) is written by real
  ingestion outcomes (`mark_provider_healthy` / `mark_provider_degraded`
  in `IngestionRepository`), not a static default — confirmed live with
  a currently-degraded provider (`yahoo`) correctly showing as degraded
  in both `/monitoring/providers` and `/health`.
- The strongest evidence here is the live `yahoo: degraded` result
  itself: a genuine, currently-occurring ingestion failure (the `LD*`
  symbol errors in `failed-ingestions`) propagates correctly end-to-end
  through `Provider.health_status` into both `/monitoring/providers` and
  `/health`'s `providers` block, with no manual intervention. That's a
  real failure surfacing correctly, observed live, not just reasoned
  about statically. Didn't additionally force a full DB/Redis outage
  against docker compose's live personal environment — unnecessary here
  since the dependency-check code path was read in full and has no
  swallowed-exception branch between a real failure and the response
  (each check's `except` sets a status string describing the failure,
  never a default "healthy").
- `verify_backups` / `verify_restore_procedures` are the exception:
  their internal logic can't "silently fail" (no swallowed exceptions),
  but their `"verified"`/`"healthy"` status is disconnected from the
  thing their name claims to monitor, per section 3. A genuine backup
  failure would never be caught by these regardless of what they
  return, because they don't look at backups.

## Tier summary

**Tier 1 (mechanical, no design question):**
1. `AssetHealth.provider_name` hardcoded to `"default"` — wire to real
   source or drop the field.
2. `google_oauth_configured` dead-auth remnant in `/health`'s
   `configuration` block — drop alongside `GOOGLE_CLIENT_ID` setting.

**Tier 2 (needs one decision before implementing):**
3. `verify_backups` / `verify_restore_procedures` fabricate their
   headline claim — decide rename-to-match-reality vs. remove until a
   real backup/restore mechanism exists to check.
4. No frontend surface exists for any of this module — decide whether
   that's intentional (curl-only ops surface, leave as is) or whether a
   minimal ops/health page belongs in the product. Not assuming either
   way.

**Tier 3 (defer to backlog, not building speculatively):**
5. `task_runs` and `audit_logs` are both write-only with no read path
   anywhere in the codebase (not just absent from Monitoring). Same
   shape found in `ErrorFingerprinter.get_fingerprints()` — the
   per-error fingerprint is consumed (attached to each error response),
   but the aggregate accessor has zero callers, so the fingerprint
   dedup/counting that's its whole point is never read back either. All
   three are write-only observability today. A natural extension,
   explicitly not building it now — flagging per the SPAR discipline
   that "this could be built" isn't "this should be built."

No changes made in this pass — audit only, per instructions.
