# FIX SUMMARY: Jobs & Provider API Credential Retrieval from Database

## Problem

When running portfolio sync jobs, providers were unable to fetch API keys, resulting in validation failures:

```
ERROR | credential validation failed: Missing Binance credentials: BINANCE_API_KEY, BINANCE_API_SECRET
```

## Root Cause

- Providers (Binance, Groww, Coinbase, Zerodha, CustomEquity) were reading credentials **only from environment variables
  **
- The system had encrypted API keys stored in **PostgreSQL database** (via `ConfigService`), but providers never checked
  the database
- **Gap:** No connection existed between broker providers and `ConfigService.get_decrypted_key()`

## Solution

### 1. New Credential Manager

**File:** `app/modules/portfolio/providers/credential_manager.py`

Acts as a credential broker with priority-based lookup:

1. **Primary (Database):** `ConfigService.get_decrypted_key()` — fetch from encrypted DB storage
2. **Fallback (Environment):** `os.getenv()` — backward compatible with existing .env setup

Key methods:

- `get_binance_credentials()` → (api_key, api_secret)
- `get_groww_credentials()` → (api_key, api_secret)
- `get_coinbase_credentials()` → (api_key, api_secret, passphrase)
- `get_zerodha_credentials()` → (api_key, api_secret, access_token, request_token)
- `get_custom_equity_credentials()` → (holdings_json, holdings_file)

### 2. Updated Providers

All broker providers now accept optional `CredentialManager`:

| Provider     | File               | Changes                                                      |
|--------------|--------------------|--------------------------------------------------------------|
| Binance      | `binance.py`       | `__init__(self, cred_manager=None)`                          |
| Groww        | `groww.py`         | `__init__(self, cred_manager=None)`                          |
| Coinbase     | `coinbase.py`      | `__init__(self, cred_manager=None)`                          |
| Zerodha      | `zerodha.py`       | `__init__(self, cred_manager=None)` + `_Creds` class updated |
| CustomEquity | `custom_equity.py` | `__init__(self, cred_manager=None)`                          |

### 3. Factory Enhancement

**File:** `app/modules/portfolio/providers/factory.py`

```python
def get_broker_provider(broker: str, session: Optional[Session] = None) -> AssetSource:
    cred_manager = CredentialManager(session)
    # Pass cred_manager to providers
```

### 4. Task Flow Update

**File:** `app/tasks/portfolio.py`

- Create database session before resolving provider
- Pass session to `get_broker_provider()` for credential access
- Properly close sessions in all code paths

## Architecture Diagram

```
Sync Job Request
    ↓
sync_portfolio_task
    ↓
cred_session = SessionLocal()  ← Create session for credentials
    ↓
get_broker_provider(broker, session=cred_session)
    ↓
CredentialManager(session=cred_session)
    ├─ Tier 1: Try ConfigService.get_decrypted_key()
    │   └─ Query PostgreSQL ProviderConfig table
    │   └─ Decrypt using Fernet key from settings.secret_key
    │   └─ Return decrypted credential
    ├─ Tier 2: Fall back to os.getenv()
    │   └─ Check environment variables
    │   └─ Return env var if set
    └─ Return None if not found
    ↓
Provider.__init__(cred_manager)
    └─ self.api_key = cred_manager.get_*_credentials()
    ↓
validate_credentials() ← Uses fetched credentials
    ↓
fetch_holdings() ← Authenticates with credentials
```

## Credential Lookup Priority

**For each credential:**

1. ✅ Database (ConfigService) → encrypted storage in PostgreSQL
2. ✅ Environment variable → from .env file
3. ❌ Not found → credential validation fails

## Testing

✅ **13 comprehensive tests created** (`tests/portfolio/test_credential_manager.py`):

- Database credential fetching
- Environment variable fallback
- Mixed scenarios (DB + env)
- Provider integration
- Factory with/without session

**All tests pass:**

```
13 passed in 1.28s
```

## Files Modified

### New Files

- `app/modules/portfolio/providers/credential_manager.py` (95 lines)
- `tests/portfolio/test_credential_manager.py` (180+ lines)
- `docs/JOBS_PROVIDER_API_FIX.md` (debugging guide)

### Modified Files

1. `app/modules/portfolio/providers/factory.py`
2. `app/modules/portfolio/providers/binance.py`
3. `app/modules/portfolio/providers/groww.py`
4. `app/modules/portfolio/providers/coinbase.py`
5. `app/modules/portfolio/providers/zerodha.py`
6. `app/modules/portfolio/providers/custom_equity.py`
7. `app/tasks/portfolio.py`
8. `docs/context/config.md`

## Usage Guide

### Setting credentials via API (recommended)

```bash
# Binance
curl -X PUT http://localhost:8001/api/config/providers/binance/keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "your-key",
    "api_secret": "your-secret"
  }'

# Run job - credentials auto-fetched from DB
curl -X POST http://localhost:8001/api/config/jobs/sync_portfolio/run \
  -H "Authorization: Bearer <token>"
```

### Fallback to environment variables

If DB has no credentials, system uses .env:

```bash
BINANCE_API_KEY=xxx
BINANCE_API_SECRET=yyy
```

## Backward Compatibility

✅ **100% backward compatible:**

- Existing .env files still work (Tier 2 fallback)
- Existing code calling providers without `cred_manager` still works
- New database storage is optional (only used if session provided)

## Performance Impact

- **Minimal:** One DB query per provider per sync (cached by ConfigService)
- Database query only happens if session provided
- No query if falling back to environment

## Security Improvements

✅ Credentials now encrypted at rest in database (Fernet)
✅ API keys never exposed in logs (masked by logger)
✅ Database credentials retrieved only when needed
✅ Environment fallback for backward compatibility

## Next Steps

1. **Deploy** the changes
2. **Test** with database credentials:
   ```bash
   # Clear env vars
   unset BINANCE_API_KEY BINANCE_API_SECRET
   
   # Set via API
   curl -X PUT http://localhost:8001/api/config/providers/binance/keys ...
   
   # Run sync - should succeed
   curl -X POST http://localhost:8001/api/config/jobs/sync_portfolio/run ...
   ```
3. **Monitor** sync logs for validation successes
4. **Users** should use `/api/config/providers/{name}/keys` endpoint to manage credentials

## Verification Checklist

- [x] All 13 tests pass
- [x] No syntax errors
- [x] Backward compatible with .env
- [x] Database credentials have priority
- [x] Fallback to env vars works
- [x] Session cleanup in all paths
- [x] Logging captures credential fetching
- [x] Error messages actionable

