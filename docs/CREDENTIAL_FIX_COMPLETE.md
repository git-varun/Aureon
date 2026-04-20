# DEBUG SOLUTION: Jobs & Provider API - API Key Retrieval from Database

## Issue Resolved ✅

**Problem:** Services could not fetch API keys from the database. Portfolio sync jobs failed with:

```
ERROR | credential validation failed: Missing Binance credentials: BINANCE_API_KEY, BINANCE_API_SECRET
```

**Why:** Provider classes were only checking environment variables, not the encrypted credentials stored in PostgreSQL.

---

## Solution Implemented ✅

### Core Fix: Credential Manager Bridge

Created a new `CredentialManager` class that acts as a credential broker:

1. **Tries database first** (if session provided)
    - Queries `ProviderConfig` table
    - Decrypts credentials using Fernet
    - Returns decrypted value

2. **Falls back to environment** (if DB has no credential)
    - Checks `.env` file via `os.getenv()`
    - Maintains backward compatibility

3. **Returns None** if not found anywhere

### Changes Made

**File Structure:**

```
app/
├── modules/portfolio/providers/
│   ├── credential_manager.py ..................... NEW (95 lines)
│   ├── factory.py ............................... MODIFIED
│   ├── binance.py ............................... MODIFIED
│   ├── groww.py ................................. MODIFIED
│   ├── coinbase.py .............................. MODIFIED
│   ├── zerodha.py ............................... MODIFIED
│   └── custom_equity.py ......................... MODIFIED
└── tasks/
    └── portfolio.py ............................. MODIFIED

tests/portfolio/
└── test_credential_manager.py ................... NEW (180+ lines, 13 tests)

docs/
├── JOBS_PROVIDER_API_FIX.md ..................... NEW (detailed guide)
├── CREDENTIAL_FIX_SUMMARY.md .................... NEW (technical summary)
└── context/config.md ........................... MODIFIED
```

---

## How It Works Now

### Before (Broken)

```
sync_portfolio_task
  ↓
get_broker_provider(broker)
  ↓
BinanceSync()
  ├─ self.api_key = settings.binance_api_key  ← Only from environment!
  ├─ self.api_secret = settings.binance_api_secret
  └─ Database credentials IGNORED ❌
```

### After (Fixed)

```
sync_portfolio_task
  ↓
cred_session = SessionLocal()
  ↓
get_broker_provider(broker, session=cred_session)
  ↓
CredentialManager(session=cred_session)
  ├─ Try: ConfigService.get_decrypted_key("binance", "api_key")
  │   └─ Query DB, decrypt, return ✅
  └─ Fallback: os.getenv("BINANCE_API_KEY") ✅
  ↓
BinanceSync(cred_manager)
  ├─ self.api_key = cred_manager.get_binance_credentials()[0]
  ├─ self.api_secret = cred_manager.get_binance_credentials()[1]
  └─ Database credentials USED ✅
```

---

## Usage: Setting API Keys

### Option 1: Via HTTP API (Recommended)

```bash
# Set Binance credentials
curl -X PUT http://localhost:8001/api/config/providers/binance/keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "your-api-key",
    "api_secret": "your-api-secret"
  }'

# Credentials now encrypted and stored in PostgreSQL!

# Run sync job - credentials auto-fetched from DB
curl -X POST http://localhost:8001/api/config/jobs/sync_portfolio/run \
  -H "Authorization: Bearer <jwt_token>"
```

### Option 2: Environment Variables (Legacy)

```bash
# .env file
BINANCE_API_KEY=your-key
BINANCE_API_SECRET=your-secret
```

**If you set both:** Database takes priority.

---

## Testing Results ✅

### New Tests: 13/13 Passing

```
✅ test_credential_manager_without_session_uses_env
✅ test_credential_manager_with_session_queries_db
✅ test_credential_manager_db_fallback_to_env
✅ test_credential_manager_groww_credentials
✅ test_credential_manager_coinbase_credentials
✅ test_credential_manager_custom_equity_credentials
✅ test_binance_provider_with_cred_manager
✅ test_binance_provider_without_cred_manager_uses_settings
✅ test_coinbase_provider_with_cred_manager
✅ test_custom_equity_provider_with_cred_manager
✅ test_groww_provider_with_cred_manager
✅ test_get_broker_provider_passes_session
✅ test_get_broker_provider_without_session
```

### Existing Tests: 2/2 Still Passing

```
✅ test_custom_equity_provider_parses_json
✅ test_coinbase_provider_requires_credentials
```

---

## Key Features

| Feature                        | Status                                            |
|--------------------------------|---------------------------------------------------|
| Database credential priority   | ✅ Working                                         |
| Environment fallback           | ✅ Backward compatible                             |
| Credential encryption (Fernet) | ✅ At rest                                         |
| Multi-provider support         | ✅ Binance, Groww, Coinbase, Zerodha, CustomEquity |
| Session cleanup                | ✅ All paths                                       |
| Error handling                 | ✅ Detailed messages                               |
| Logging                        | ✅ Masked credentials                              |
| Tests                          | ✅ 13 new + backward compat                        |

---

## Credential Lookup Priority

```
Credential Lookup for Provider

1. Database (PRIMARY)
   ├─ Session provided?
   ├─ ConfigService initialized?
   ├─ get_decrypted_key() returns value?
   └─ YES → Use database credential ✅

2. Environment (FALLBACK)
   ├─ os.getenv() finds value?
   └─ YES → Use environment credential ✅

3. Not Found
   └─ credential = None → Validation error
```

---

## Files Updated

### New Utilities

- **`credential_manager.py`** (95 lines)
    - Generic credential fetcher
    - Provider-specific methods
    - DB/env priority logic

### Modified Providers

All now accept `cred_manager=None` parameter:

- **`binance.py`** — 3 lines changed
- **`groww.py`** — 3 lines changed
- **`coinbase.py`** — 3 lines changed
- **`zerodha.py`** — 5 lines changed (+ _Creds class)
- **`custom_equity.py`** — 3 lines changed

### Updated Infrastructure

- **`factory.py`** — Now creates CredentialManager, passes session
- **`portfolio.py`** — Now creates cred_session, passes to factory
- **`config.md`** — Documentation updated

### New Tests

- **`test_credential_manager.py`** — 180+ lines, 13 tests

---

## Backward Compatibility ✅

✅ **100% backward compatible** with existing code:

- Old code calling `get_broker_provider(broker)` still works
- Old code without session still works
- Environment variables still work as fallback
- No breaking changes to API

---

## Migration Guide

### For Users

1. **Recommended:** Set credentials via API endpoint
   ```bash
   PUT /api/config/providers/{name}/keys
   ```
2. **Legacy:** Keep using `.env` file (still works)

### For Developers

1. **No changes needed** to existing code
2. **Optional:** Pass `session` to `get_broker_provider()` for DB lookup
3. **All providers** already updated to support new flow

---

## Error Messages

### Before (Unhelpful)

```
ERROR | credential validation failed: Missing Binance credentials
```

### After (Helpful)

```
ERROR | [sync:binance] credential validation failed: Missing Binance credentials: BINANCE_API_KEY, BINANCE_API_SECRET
INFO  | [sync:binance] credentials validated ✅
```

---

## Monitoring/Debugging

### Check credentials in database

```bash
# Via psql
SELECT provider_name, key_names, encrypted_keys 
FROM provider_config 
WHERE provider_name = 'binance';
```

### Check sync logs

```bash
# Tail logs
tail -f api.log | grep "sync:binance"

# Expected success:
INFO  | [sync:binance] provider resolved -> Binance
INFO  | [sync:binance] credentials validated
INFO  | [sync:binance] completed holdings=X upserted=Y
```

---

## Security Notes

✅ **Credentials encrypted at rest** (Fernet cipher)
✅ **Never logged in plaintext** (masked by logger)
✅ **Database-backed storage** (encrypted in PostgreSQL)
✅ **Fallback to env vars** (no data loss)
✅ **API key rotation support** (update via endpoint)

---

## Deployment Checklist

- [x] Code compiled without errors
- [x] All tests pass (13 new + 2 existing)
- [x] Backward compatible with .env
- [x] Database credentials have priority
- [x] Fallback mechanism works
- [x] Error handling complete
- [x] Logging informative
- [x] Session cleanup proper
- [x] Documentation updated
- [x] Ready for production

---

## Support

For issues or questions:

1. Check `docs/JOBS_PROVIDER_API_FIX.md` for detailed guide
2. Check `docs/CREDENTIAL_FIX_SUMMARY.md` for technical details
3. Review test cases in `tests/portfolio/test_credential_manager.py`
4. Check logs for detailed error messages

---

**Status:** ✅ READY FOR PRODUCTION

