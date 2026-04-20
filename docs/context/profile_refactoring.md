# Profile & Config Pages Refactoring

## Summary

Split monolithic Profile component into 3 dedicated pages (User Profile, Provider Config, Job Config) with proper MVC
backend and auth validation.

## Files Created/Modified

### Frontend (React/Vite)

- `frontend/src/components/Profile/` — New directory with 4 files
    - `index.jsx` — Tab container (Profile | Providers | Jobs)
    - `UserProfile.jsx` — User info editing
    - `ProviderConfig.jsx` — API key management
    - `JobConfig.jsx` — Job scheduling
- `frontend/src/api/apiService.js` — Added new methods (users/me, config/*)
- `frontend/src/App.jsx` — Import from Profile/index

### Backend (FastAPI/MVC)

- `app/modules/users/schemas.py` — UserProfileResponse, UserProfileUpdate, UserPasswordUpdate
- `app/modules/users/routes.py` — GET/PUT /api/users/me, POST /api/users/me/password
- `app/modules/config/schemas.py` — Provider/Job/Log response schemas
- `app/modules/config/routes.py` — Routes moved to /api/config/providers/*, /api/config/jobs/*
- `app/core/security.py` — Added hash_password(), verify_password()

### Config

- `requirements.txt` — Added passlib[bcrypt], cryptography

## API Endpoints

### Users (NEW)

```
GET    /api/users/me                    # Get profile
PUT    /api/users/me                    # Update profile
POST   /api/users/me/password           # Change password
```

### Config Providers (REFACTORED)

```
GET    /api/config/providers                     # List providers
PUT    /api/config/providers/{name}              # Toggle enable
PUT    /api/config/providers/{name}/keys         # Set API key
```

### Config Jobs (REFACTORED)

```
GET    /api/config/jobs                         # List jobs
PUT    /api/config/jobs/{name}                  # Update cron/enabled
POST   /api/config/jobs/{name}/run              # Trigger job
GET    /api/config/jobs/{name}/logs             # Get logs
```

**All endpoints require:** `Depends(require_auth)` → Returns 401 if no valid JWT

## Auth Implementation

✅ JWT verification with HS256
✅ User ID extraction from token
✅ Active user check (is_active=True)
✅ Bcrypt password hashing for password change
✅ Token expiry validation

## Key Design Decisions

1. **Separate Pages** — Better UX, easier maintenance
2. **Tab Navigation** — Single control center view
3. **/api/config/** prefix — Namespace separation
4. **Strict Auth** — require_auth on all endpoints
5. **Pydantic Schemas** — Request/response validation
6. **Service Layer** — Business logic abstraction

