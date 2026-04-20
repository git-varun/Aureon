# Config Module Context

## Module: config

### Endpoints (`/api/config`)

| Method | Path                     | Description                      |
|--------|--------------------------|----------------------------------|
| GET    | `/providers`             | List all provider configs        |
| PUT    | `/providers/{name}`      | Toggle provider enabled/disabled |
| PUT    | `/providers/{name}/keys` | Set/clear a provider API key     |
| GET    | `/jobs`                  | List all job configs             |
| PUT    | `/jobs/{name}`           | Update job schedule/enabled      |
| POST   | `/jobs/{name}/run`       | Manually trigger a job           |
| GET    | `/jobs/{name}/logs`      | Get job execution logs           |

All endpoints require `require_auth`.

### Schemas

- `ProviderConfigResponse` — `key_names: List[str]`, `keys_status: Dict[str, bool]` (never plaintext keys)
- `ProviderKeyResponse` — wraps single `ProviderConfigResponse` under `provider`
- `JobLogResponse` — fields: `started_at`, `ended_at`, `error_message`, `task_id`, `duration_ms`
- `JobConfigResponse` — fields: `cron_schedule`, `last_status`, `last_run_at`, `next_run_at`

### Services (`ConfigService`)

Key methods:

- `get_all_providers()` / `get_provider(name)` / `get_provider_dict(name)` — provider CRUD
- `update_provider(name, enabled)` — toggle enabled
- `set_provider_key(name, key_name, value)` — Fernet-encrypt and store key
- `set_provider_keys_bulk(name, keys)` — batch key update
- `get_decrypted_key(name, key_name)` — fetch decrypted key from DB
- `dispatch_job(job_name)` — Celery dispatch by name, returns task_id string
- `log_job_start(name, task_id)` / `log_job_end(log_id, status, error)` — job log lifecycle
- `seed_defaults(db)` — idempotent seed of providers + jobs on startup

### Credential Manager (`CredentialManager`)

New utility class handles credential fetching with database priority:

- Fetches credentials from DB first via `get_decrypted_key()`
- Falls back to environment variables if DB key not found
- Used by broker providers during initialization
- Located: `app/modules/portfolio/providers/credential_manager.py`
- Methods: `get_binance_credentials()`, `get_groww_credentials()`, `get_coinbase_credentials()`,
  `get_zerodha_credentials()`, `get_custom_equity_credentials()`

### Job Dispatch Registry (`ConfigService.dispatch_job`)

| job_name         | Celery task                            |
|------------------|----------------------------------------|
| `sync_portfolio` | `sync_portfolio_task` (one per broker) |
| `refresh_prices` | `refresh_prices_task`                  |
| `fetch_news`     | `fetch_news_task`                      |
| `daily_briefing` | `global_briefing_task`                 |
| `run_signals`    | `generate_signals_task`                |

### Key Design Decisions

- `key_names` stored as JSON array in DB; returned as `List[str]` in API
- `encrypted_keys` stored as JSON dict of Fernet-encrypted values; never exposed in API
- Credentials now fetched from DB first via `CredentialManager`, fallback to env vars
- Providers receive `CredentialManager` via constructor to support DB credentials
- Portfolio task passes DB session to provider factory for credential access
