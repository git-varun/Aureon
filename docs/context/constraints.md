# Constraints

## Security
- `SECRET_KEY` is required — no default, app refuses to start without it
- `debug=False`, `log_level=INFO` are prod defaults — only override in dev
- `ENABLE_API_DOCS=false` in prod — set `true` only for local dev
- JWT uses PyJWT only — `python-jose` removed; do not re-add
- Auth endpoints are rate-limited: `/login` 10/min, `/register` 5/min, `/refresh` 20/min

## Schema management
- **Never add new statements to `db_patcher.py`** — it is frozen
- All schema changes go through Alembic revisions in `backend/alembic/versions/`
- `db_patcher.py` runs at every startup for backward compat — do not remove it

## Data isolation
- Every query on `positions`, `transactions`, `signals`, `recommendations` must filter by `user_id`
- `assets` table is global (shared across users) — no user_id filter needed there
- `build_state_payload(session, cache, cache_key_fn, user_id)` requires `user_id` — never call without it from a request context

## API
- `GET /api/portfolio/state` (legacy) is deleted — do not recreate it
- All data endpoints require `require_auth` (not `get_current_user`) unless intentionally public
- Pool: `pool_size=10, max_overflow=5` — do not reduce

## Docker
- API runs `uvicorn --workers 2` — never `--reload` in production
- All credentials come from env vars — no hardcoded passwords in docker-compose.yml
