# Core/Config Module Audit

Scope: `backend/app/core/**` — settings/env loading (`config.py`), `ConfigService`/`JobConfig`
(workers audit touched this tangentially at 2.1–2.4; this pass goes deeper), DB session /
dependency injection (`database.py`, `api/dependencies.py`), startup validation
(`validation.py`), and the shared exception hierarchy (`exceptions.py`). Same discipline as the
market/news/workers audits: audit before modifying, tiered triage, live verification over static
reasoning. Nothing in this report has been fixed — it's all reported for a decision, per the
scope this session was asked for ("audit... don't build deferred items").

Five parallel research passes fed this report (settings/env loading, JobConfig field mapping, DB
session lifecycle, startup validation, exception hierarchy); every Tier 1 finding below was then
independently live-verified against the running docker-compose stack, not taken on the
sub-passes' word.

---

## Tier 1 — fabrication-class / silent-failure

### 1. `_decrypt()` silently swallows decryption failure as an empty credential

`backend/app/core/services/config.py:34-39`:

```python
def _decrypt(token: str, context: str = "") -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except Exception as e:
        logger.error(f"Decryption failed [{context}] — {type(e).__name__}")
        return ""
```

Any decryption failure — corrupted ciphertext, or `SECRET_KEY` having changed since encryption
(a redeploy, a `.env` edit, a lost secret) — returns `""`, indistinguishable from "this
credential was never configured." This is called from `get_provider_key()`
(`config.py:338`, `return _decrypt(encrypted, ...) if encrypted else None`) for every provider
credential the Settings UI displays and every broker/AI key check. A user (or the `/health`
endpoint's `keys_status` logic) reading `""` cannot tell "not configured" from "corrupted, key
silently lost."

The codebase already names this exact risk next to the bug: `_decrypt_strict()`
(`config.py:41-45`) raises instead of swallowing, and its own docstring says *"a silent \"\"
would look like a legitimately-empty credential instead of a rotation failure"* — but that
strict variant is used **only** during key rotation (`config.py:300`). Every other call site
(Settings UI credential display, broker sync, AI provider key checks) still gets the
silent-swallow. Live-confirmed by reading the single call site (`get_provider_key`) that funnels
every non-rotation decrypt through `_decrypt()`, and confirming `_decrypt_strict` truly has no
other callers (grepped).

**Needs a decision, not a silent fix**: which call sites should surface decrypt failure as a
distinct state (e.g. `"corrupted"` in `keys_status`) vs. which can keep treating it as empty.
Mechanical once decided.

### 2. Two independent `get_db()` implementations double DB sessions on any route using `get_current_user` alongside `Depends(get_db)` from `core.database`

Two separate `get_db()` generator functions exist — `backend/app/core/database.py:47` and
`backend/app/api/dependencies.py:43` — both wrapping the same `SessionLocal`/engine, but as two
distinct Python callables. FastAPI's per-request dependency cache is keyed by callable identity,
so it does **not** dedupe across them.

`backend/app/modules/market/api/market.py` imports `get_db` directly from `app.core.database`
(line 9) for its theme routes (`list_themes`, `get_theme_detail`, `get_theme_signals`,
`get_theme_nav`, `fork_theme`, `update_theme` — `market.py:44-128`), while also depending on
`get_current_user` (imported from `app.api.dependencies`), which resolves through
`get_users_repo` → `api/dependencies.py`'s own local `get_db` (`dependencies.py:145-153`). Every
hit on one of these routes opens **two** independent `SessionLocal()` instances / checks out two
pooled connections for what is logically one request, and runs them as two independent
transactions (a write on one wouldn't be visible to a read on the other pre-commit).

**Live-verified deterministically** (not via noisy load-test timing — did that first, it was
inconclusive due to fast-completing queries and pool-cap noise from other services sharing the
same Postgres instance; replaced with a direct proof):

```
core.database.get_db session id: 131487315371568
api.dependencies.get_db session id: 131487208286752
same session object? False
same underlying connection pool? True
```

Two distinct `Session` objects, same pool — confirms the double-checkout mechanically, independent
of timing. Default pool is `pool_size=5, max_overflow=10` (15 total, no explicit override in
`database.py`) — this doubles pool pressure specifically on the theme-route family, and is the
same class of resource risk as the workers audit's `/health` pool-exhaustion finding (1.1), just
via a different mechanism (duplicate DI function, not an unbounded hang).

**Mechanical fix, no design decision**: delete the duplicate `get_db()` in
`api/dependencies.py`, import from `core.database` everywhere. Not applied here per this
session's scope (audit only).

### 3. JobConfig's Settings UI presents live scheduling control that doesn't exist

Already partially known from the workers audit (2.1: `JobConfig.enabled` never consulted by
beat; cron_expression stored but unread). This pass mapped every field against every
reader/writer and found the blast radius is wider than "the scheduler ignores a flag" — it's
**the UI actively misrepresenting operational state as live and controllable when it's neither**:

| Field | Written | Read | What it actually does |
|---|---|---|---|
| `enabled` | API `PUT /jobs/{name}`, seed defaults | API response only; UI renders a toggle | **Nothing.** Flipping it off does not stop an already-beat-scheduled job. Confirmed live this session: `grep -rn "JobConfig" backend/app/workers/` returns zero hits — the scheduler never imports the entity, let alone reads the field. |
| `cron_expression` | API `PUT /jobs/{name}` (user-tier only), seed defaults | API response only; UI shows/edits it as `cron_schedule` | **Nothing.** Beat's actual schedule is the hardcoded dict in `celery_app.py`, completely independent of this column. A user can edit a cron string that governs nothing. |
| `last_run_at` | `mark_job_ran()` — called **only** from the manual `POST /jobs/{name}/run` handler | UI renders `"last · {fmt(...)}"` | Only reflects manual "Run Now" clicks. For a beat-scheduled job like `refresh_prices` (fires hourly, automatically), this can sit blank or stale indefinitely even though the job runs constantly — beat's dispatch path never touches `JobConfig` at all. |
| `next_run_at` | **nowhere** — no assignment site exists anywhere | UI renders `"next · {fmt(...)}"`, always `null` | Fully dead column. UI still renders the row for it. |
| `job_tier` | seed defaults | `core/api/config.py:235` — gates whether `cron_expression` edits are allowed for `system`-tier jobs | The one field with a real effect — it locks editing of a column that itself does nothing once edited. |
| `config` (JSON blob) | **nowhere** | **nowhere** | Fully dead, no read or write site anywhere in `backend/app`. |

A user looking at the Settings UI reasonably concludes "flip this off and it stops running" or
"this shows when it'll run next." Neither is true. This is Tier 1 for the same reason the audit
chain treats hardcoded/neutral substitutions as fabrication-class: the UI surface **looks like**
real, live operational control and isn't — a fabricated signal, not fabricated data, but the same
failure mode from the user's perspective.

**Needs a decision** (this is the "needs a decision" half of the same root cause the workers
audit deferred at 2.1 — noting it here as Tier 1 because the *misrepresentation* itself, not the
missing wiring, is the fabrication-class problem): either wire `JobConfig` up as a real source of
truth (a dynamic beat scheduler that reads `enabled`/`cron_expression`, and every dispatch path —
including beat, not just manual — updates `last_run_at`), or strip the illusion (remove the
toggle/cron-edit/next-run UI controls, keep `JobConfig` purely as JobLog-linkage + read-only
display). See Tier 2/Deferred below — this is real feature-build scope either direction, not
mechanical.

### 4. `build_version` is a hardcoded literal, not derived from any real build state

`backend/app/core/api/system/health.py:106`: `build_version = "9A.3-production"`. Not sourced
from git SHA, a build-time env var, or any deploy metadata — a fixed string that reports the
same "production" version regardless of what's actually deployed or running. Found adjacent to
this session's earlier `/health` timeout fix in the same file. Confirmed via direct read — no
other assignment site, no env var, no file read backing it anywhere in the codebase.

**Mechanical fix once a real source is chosen** (e.g. `git rev-parse --short HEAD` baked in at
build time, or an env var set by the deploy pipeline) — flagging as Tier 1 because a hardcoded
"-production" suffix on a single-user local-first app (per CLAUDE.md, this app has no
prod/staging distinction) is itself worth a gut-check, not just a mechanical value swap.

---

## Tier 2 — needs a decision

### 2.1 Provider `get_quote()` error typing is inconsistent, and the retry infra it would feed has zero callers

`Yahoo.get_quote()` (`market/providers/market_data/yahoo/provider.py:99`) raises a raw
`ValueError` for "no price returned" with no surrounding try/except — propagates untyped, not as
`ProviderError`. `Binance.get_quote()` has the same gap (`binance/provider.py:56` raises
`ValueError`; the method's only `except` clause catches `requests.RequestException`, not this).
Finnhub and Polygon don't have this gap — both wrap the same shape of failure in an outer
`except Exception: raise ProviderError(...)` in the same method. `get_news()` across all four
providers is consistently `ProviderError`-typed (confirmed clean — matters because this
session's Fix R specifically catches `except ProviderError` in `fetch_news_task`).

Separately: `core/providers/retry.py`'s `with_retry` decorator (catches `ProviderError` where
`retryable=True`) has **zero callers anywhere in the codebase** — dead infrastructure that, if
ever wired to `get_quote()`, would silently fail to retry Yahoo/Binance failures specifically
(the untyped `ValueError` would propagate straight past a `ProviderError`-keyed retry check)
while working correctly for Finnhub/Polygon.

**Resolved**: Yahoo/Binance's typing was fixed to match Finnhub/Polygon (`get_quote`/`get_news`
now consistently raise `ProviderError` on all four providers). `with_retry` is wired up at the
two call sites that invoke provider `get_quote()`/`get_news()` — `ingest_quote` (`app/workers/
ingestion/tasks.py`) and `NewsService.fetch_and_store` (`app/modules/news/services/news.py`) —
via small `@with_retry()`-decorated wrapper functions, so a transient `ProviderError` gets
retried in-process (3 attempts, exponential backoff) before the caller's existing
failure-recording/fallback logic runs.

### 2.2 `_decrypt()` call-site policy (see Tier 1 #1)

Restated here as the decision half: which of the several `_decrypt()` call sites (Settings UI
credential display, broker sync at runtime, AI key checks) should surface corruption/rotation
failure distinctly vs. tolerate legitimate empty state as today.

### 2.3 JobConfig source-of-truth direction (see Tier 1 #3)

Restated here as the decision half: wire up vs. strip down. Real feature-build scope regardless
of direction chosen — see Deferred list.

---

## Tier 3 — cleanup

- **CLAUDE.md's exception hierarchy summary has drifted from the actual code** (same class of
  doc drift already fixed once this session for the workers-layout section). Actual structure in
  `backend/app/core/exceptions.py`: `AuthenticationError`, `AuthorizationError`, and
  `SecurityError` are all **direct siblings** of `AppException`, not nested as
  `SecurityError -> {AuthenticationError, AuthorizationError}` per CLAUDE.md. `PermissionDeniedError`
  extends `AuthorizationError`, not `SecurityError`. Doc-only, no runtime effect — HTTP status
  mapping in `app/api/main.py:146-170` was confirmed correct and unaffected (reads
  `http_status`/`category`/`severity`/`retryable` per-subclass; distinguishable 404/409/401/403/
  400/429/500/502/504 all reachable, not collapsed to a generic 500).
- **CLAUDE.md's Configuration section documents `BINANCE_*`/`ZERODHA_*`/`GROWW_*` as env-var
  broker credentials.** They don't exist anywhere in `backend/app/` or `.env` — broker
  credentials are actually DB-backed via `ProviderConfig.encrypted_keys` (the same table/column
  `_decrypt()` reads in Tier 1 #1). Doc drift, not a validation gap.
- **`validate_environment()`'s `API_PORT`/`FRONTEND_PORT` checks read via raw `os.getenv()`**
  (`backend/app/core/validation.py:19-27`) instead of through the pydantic `settings` object —
  inconsistent with the rest of the codebase's pattern, harmless since these aren't part of the
  `Settings` class and the check is best-effort/optional regardless.
- **`get_db()` (both copies) doesn't explicitly `db.rollback()` on an exception path before
  `close()`.** Not a live risk today — SQLAlchemy's pool `reset_on_return='rollback'` default
  issues a ROLLBACK at checkin regardless — but it's implicit/accidental correctness rather than
  explicit. Low priority.
- **`JobConfig.next_run_at` and `.config` (JSON blob) columns are fully dead** — no write site
  (`next_run_at`) or no read/write site at all (`config`) anywhere in `backend/app`. Cleanup
  candidate independent of the Tier 1/2.3 source-of-truth decision.
- **Finnhub/Polygon `get_quote()` have a cosmetic double-raise pattern**: an inner `ValueError` is
  raised then immediately caught by an outer `except Exception: raise ProviderError(...)` in the
  same method. No functional issue (contrast with Yahoo/Binance's real gap in 2.1) — could raise
  `ProviderError` directly instead of routing through `ValueError` first, purely for readability.

---

## Confirmed clean (checked, no finding)

- **Settings loading** (`config.py`): `DATABASE_URL`/`REDIS_URL` are required, no default —
  startup fails loudly if unset. `TESTING`/`TEST_DATABASE_URL` already has an explicit
  fail-fast `model_validator` refusing to fall back to the real `DATABASE_URL`. `SECRET_KEY`'s
  default is guarded by `validate_secrets_and_cors`, which rejects it when `DEBUG=False` (not
  silent). pydantic-settings' precedence (init kwargs > OS env vars > `.env` file > field
  defaults, confirmed for the installed version) means `docker-compose.yml`'s `environment:`
  block correctly wins over `.env` for every pydantic-loaded setting — the opposite of, and safer
  than, Celery's raw-env-var-override behavior found in the workers audit. No other
  library-level env-var blind spot (à la Celery's `CELERY_BROKER_URL`) was found across
  `database.py`, `redis.py`, or `alembic/env.py` — `alembic/env.py` explicitly overrides
  `sqlalchemy.url` from `settings.DATABASE_URL` in both offline/online paths, and `alembic.ini`
  has no `sqlalchemy.url` key at all to ever fall back to.
- **`validate_environment()` runs at both places that matter** — confirmed via grep, called from
  `app/api/main.py`'s FastAPI lifespan startup AND from both `worker_init`/`beat_init` Celery
  signals. The API server does not skip this check (a plausible gap this audit specifically went
  looking for and did not find).
- **AI/broker provider keys being unchecked at startup is by design, not a gap** — matches
  CLAUDE.md's documented policy ("fail loudly as `ProviderError` at time of use, not fabricate").
  `SLA_*`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `GOOGLE_CLIENT_ID`,
  `FRONTEND_BASE_URL` — all sane-defaulted tuning/optional-feature params that fail naturally at
  point of use; no silent-fabrication risk.
- **Worker task DB session hygiene** — all 5 evaluation/snapshot/monitoring tasks use
  `with SessionLocal() as session:` (correct auto-close/auto-rollback). All direct `SessionLocal()`
  calls in `ingestion/tasks.py` are wrapped in `try/finally: db.close()` with `db.rollback()` on
  every exception path (4/4 checked).
- **This session's own fixes are correctly typed** — `dispatch_job`'s bare `raise TimeoutError`
  is caught by the same function's outer `except Exception` and re-surfaced as `InfrastructureError`
  (internal control flow, not a typing bug); `ingest_quote`'s re-raise and `fetch_news_task`'s
  `raise ProviderError` are both correctly typed as written.

---

## Deferred — real feature-build scope, not mechanical (SPAR'd, not built)

1. **JobConfig source-of-truth direction** (Tier 1 #3 / Tier 2.3): either build a dynamic beat
   scheduler that reads `JobConfig.enabled`/`cron_expression` from the DB (nontrivial — Celery's
   beat schedule is normally static at process start; dynamic scheduling needs a custom
   scheduler class or a periodic re-read mechanism), or remove the now-inert UI controls and
   keep `JobConfig` as display+JobLog-linkage only. Same root cause the workers audit already
   deferred at 2.1, now confirmed to also corrupt the UI's presented state, not just real
   scheduler behavior — raises the stakes but doesn't change that this is a build, not a fix.
2. **AI service DB session hold, flagged but not live-verified.** A research pass flagged
   `get_ai_service` (`api/dependencies.py:155-156`, `AIService(db)`) as holding a
   `Depends(get_db)` session open for the full duration of the documented multi-model
   Gemini→Groq fallback chain (up to 6 sequential external HTTP calls with per-model cooldowns
   on HTTP 429) — the same *shape* as the already-fixed `/health` pool-exhaustion bug. This was
   **not** live-verified this session (didn't trace `AIService`'s actual call pattern or
   reproduce under load) — needs a dedicated pass before it's actionable, not assumed true off
   one fork's flag.
3. **`with_retry` wiring decision** (Tier 2.1's second half): whether to build out retry/circuit-
   breaker behavior for provider calls using the existing-but-unused decorator, or delete it.
   Design work either direction.

Nothing above has been modified. Report is deliberately fix-free per this session's scope.
