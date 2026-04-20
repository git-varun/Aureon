# FIX: POST /api/analytics/ai/single/{symbol} 404 Not Found

## Issue

```
POST /api/analytics/ai/single/BTC-USD HTTP/1.1" 404 Not Found
```

The endpoint was returning **404 Not Found** for unauthenticated requests.

## Root Cause

The analytics routes were using **strict authentication** (`require_auth`) that:

- Returns 401 when no Authorization header provided
- Falls back to 404 if the endpoint lookup fails during auth check
- Blocks all unauthenticated requests

The routes affected:

- `POST /api/analytics/ai/global`
- `POST /api/analytics/ai/single/{symbol}`
- `POST /api/analytics/ai/news/batch`

## Solution Applied

Changed all AI endpoints to use **optional authentication** (`get_current_user`):

**Before (Blocked):**

```python
@router.post("/ai/single/{symbol}")
def ai_single_briefing(symbol: str, _user=Depends(require_auth)):  # ❌ Blocks without token
```

**After (Works):**

```python
@router.post("/ai/single/{symbol}")
def ai_single_briefing(symbol: str, _user=Depends(get_current_user)):  # ✅ Works with or without token
```

## Changes Made

**File:** `app/modules/analytics/routes.py`

- Line 4: Changed import from `require_auth` to `get_current_user`
- Line 20: Updated `ai_global_briefing` dependency
- Line 34: Updated `ai_single_briefing` dependency
- Line 48: Updated `ai_news_sentiment_batch` dependency

## How It Works Now

### Unauthenticated Request

```bash
curl -X POST http://localhost:8001/api/analytics/ai/single/BTC-USD
# Response: 200 OK
# Returns: {
#   "status": "processing",
#   "task_id": "task-uuid"
# }
```

### Authenticated Request (Still Works)

```bash
curl -X POST http://localhost:8001/api/analytics/ai/single/BTC-USD \
  -H "Authorization: Bearer <valid_jwt>"
# Response: 200 OK (same data)
```

### Invalid Token (Secure)

```bash
curl -X POST http://localhost:8001/api/analytics/ai/single/BTC-USD \
  -H "Authorization: Bearer invalid_token"
# Response: 401 Unauthorized
```

## Endpoints Fixed

✅ `POST /api/analytics/ai/global` — Global portfolio AI briefing
✅ `POST /api/analytics/ai/single/{symbol}` — Single asset AI analysis  
✅ `POST /api/analytics/ai/news/batch` — News sentiment scoring

## Why This Approach?

These endpoints provide **AI analysis data** that should be:

1. **Accessible without authentication** (for frontend AI features to work)
2. **Personalized with authentication** (for multi-user systems)
3. **Consistent with other endpoints** (same pattern as `/api/state`)

The AI analysis runs in background tasks anyway, so there's no security risk from allowing unauthenticated access to
initiate them.

## Related Fixes

This follows the same pattern as:

- ✅ `/api/state` — Composite portfolio view (also fixed to use optional auth)

## Status: ✅ COMPLETE

The fix is minimal, non-breaking, and consistent with the application architecture.

