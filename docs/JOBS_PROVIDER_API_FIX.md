# Jobs & Provider API Debug Fix - Credential Retrieval from Database

## Problem Identified

**Issue:** Services were unable to fetch API keys from the database. The error logs showed:

```
ERROR | credential validation failed: Missing Binance credentials: BINANCE_API_KEY, BINANCE_API_SECRET
```

**Root Cause:** Provider classes (Binance, Groww, Coinbase, Zerodha, CustomEquity) were only reading credentials from *
*environment variables** (via `app.core.config.settings`), ignoring the encrypted API keys stored in the **PostgreSQL
database** via the `ConfigService`.

The system had:

1. ✅ `ConfigService.get_decrypted_key()` — method to fetch decrypted keys from DB
2. ✅ Database tables (`ProviderConfig`) — storing encrypted API keys
3. ❌ **MISSING:** Connection between providers and ConfigService for credential retrieval

## Solution Implemented

### 1. Created `CredentialManager` (new utility class)

**File:** `app/modules/portfolio/providers/credential_manager.py`

Purpose: Acts as a credential broker with two-tier lookup:

- **Tier 1 (Priority):** Database via `ConfigService.get_decrypted_key()`
- **Tier 2 (Fallback):** Environment variables (backward compatible)

Key methods:

- `get_credential(provider, key_name, env_var)` — generic credential fetcher
- `get_binance_credentials()` — returns (api_key, api_secret)
- `get_groww_credentials()` — returns (api_key, api_secret)
- `get_coinbase_credentials()` — returns (api_key, api_secret, passphrase)
- `get_zerodha_credentials()` — returns (api_key, api_secret, access_token, request_token)
- `get_custom_equity_credentials()` — returns (holdings_json, holdings_file)

### 2. Modified Provider Classes

Updated all broker providers to accept optional `CredentialManager`:

#### `app/modules/portfolio/providers/binance.py`

```python
def __init__(self, cred_manager=None):
    if cred_manager:
        self.api_key, self.api_secret = cred_manager.get_binance_credentials()
    else:
        self.api_key = settings.binance_api_key  # fallback
        self.api_secret = settings.binance_api_secret
```

#### Similar changes to:

- `groww.py`
- `coinbase.py`
- `zerodha.py`
- `custom_equity.py`

### 3. Updated Provider Factory

**File:** `app/modules/portfolio/providers/factory.py`

Changed `get_broker_provider()` signature:

```python
def get_broker_provider(broker: str, session: Optional[Session] = None) -> AssetSource:
    cred_manager = CredentialManager(session)
    # ... pass cred_manager to provider constructors
```

### 4. Updated Portfolio Sync Task

**File:** `app/tasks/portfolio.py`

Now passes database session to the provider factory:

```python
cred_session = SessionLocal()
provider = get_broker_provider(broker, session=cred_session)
```

## Credential Lookup Flow

```
sync_portfolio_task starts
  ↓
create cred_session = SessionLocal()
  ↓
get_broker_provider(broker, session=cred_session)
  ↓
CredentialManager(session=cred_session) created
  ↓
BinanceSync(cred_manager=cred_manager) initialized
  ↓
cred_manager.get_binance_credentials()
  ├─ Try: ConfigService.get_decrypted_key("binance", "api_key")
  │   └─ Query PostgreSQL ProviderConfig table → decrypt → return
  └─ Fallback: os.getenv("BINANCE_API_KEY")
  ↓
validate_credentials() succeeds
  ↓
fetch_holdings() from Binance
```

## Usage

### Setting API Keys via API (recommended)

```bash
# Set Binance API credentials
curl -X PUT http://localhost:8001/api/config/providers/binance/keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d {
    "api_key": "your-binance-api-key",
    "api_secret": "your-binance-api-secret"
  }

# Run sync job - credentials will be fetched from DB
curl -X POST http://localhost:8001/api/config/jobs/sync_portfolio/run \
  -H "Authorization: Bearer <token>"
```

### Environment Variable Fallback (legacy)

If credentials are NOT in database, system falls back to `.env`:

```
BINANCE_API_KEY=xxx
BINANCE_API_SECRET=yyy
```

## Testing the Fix

### 1. Setup test data

```bash
# Add credentials to database
curl -X PUT http://localhost:8001/api/config/providers/binance/keys \
  -H "Authorization: Bearer <token>" \
  -d '{"api_key": "test_key", "api_secret": "test_secret"}'
```

### 2. Clear environment variables

```bash
unset BINANCE_API_KEY BINANCE_API_SECRET
```

### 3. Run sync task

```bash
curl -X POST http://localhost:8001/api/config/jobs/sync_portfolio/run \
  -H "Authorization: Bearer <token>"
```

### 4. Expected logs

```
INFO  | [sync:binance] provider resolved -> Binance
INFO  | [sync:binance] credentials validated
INFO  | [sync:binance] completed holdings=5 upserted=5
```

## Backward Compatibility

✅ **Fully backward compatible:**

- If credentials exist in DB → use database (new behavior)
- If not in DB, but in .env → use environment (legacy behavior)
- If in both → database takes priority

## Files Changed

1. **New:**
    - `app/modules/portfolio/providers/credential_manager.py` (95 lines)

2. **Modified:**
    - `app/modules/portfolio/providers/factory.py` (refactored)
    - `app/modules/portfolio/providers/binance.py` (constructor)
    - `app/modules/portfolio/providers/groww.py` (constructor)
    - `app/modules/portfolio/providers/coinbase.py` (constructor)
    - `app/modules/portfolio/providers/zerodha.py` (constructor + _Creds)
    - `app/modules/portfolio/providers/custom_equity.py` (constructor)
    - `app/tasks/portfolio.py` (session handling)
    - `docs/context/config.md` (documentation)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ HTTP /api/config/providers/{name}/keys (PUT)            │
│ ─ Stores encrypted keys in ProviderConfig table         │
└────────────────┬────────────────────────────────────────┘
                 │
    ┌────────────▼────────────────┐
    │ PostgreSQL Database         │
    │ ├─ ProviderConfig table     │
    │ │  ├─ encrypted_keys: JSON  │
    │ │  └─ Fernet encrypted      │
    └────────────┬────────────────┘
                 │
    ┌────────────▼──────────────────────────────────────┐
    │ sync_portfolio_task (Celery)                       │
    │ ├─ Creates cred_session = SessionLocal()           │
    │ └─ Calls get_broker_provider(broker, session)      │
    └────────────┬──────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────────────┐
    │ CredentialManager(session)                         │
    │ ├─ get_binance_credentials()                       │
    │ │  ├─ ConfigService.get_decrypted_key()            │
    │ │  │  └─ Query DB, decrypt, return                │
    │ │  └─ Fallback: os.getenv()                        │
    └────────────┬──────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────────────┐
    │ BinanceSync(cred_manager)                          │
    │ ├─ self.api_key, self.api_secret fetched!          │
    │ └─ validate_credentials() → ✅ SUCCESS             │
    └────────────────────────────────────────────────────���─┘
```

## Next Steps

1. ✅ Deploy changes
2. ✅ Test with database credentials
3. ✅ Verify fallback to env vars works
4. 🔄 Monitor sync_portfolio logs for validation successes
5. 🔄 Users should use `/api/config/providers/{name}/keys` endpoint to manage credentials

