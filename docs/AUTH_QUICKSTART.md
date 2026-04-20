# Auth System - Quick Start Guide

## For Developers

### 1. Starting the Application

```bash
# Backend
cd /home/dev-var/Personal/investment-os
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Frontend (new terminal)
cd frontend
npm run dev
# Access at http://localhost:5173
```

### 2. Testing Authentication

**Create a Test Account:**

1. Open http://localhost:5173
2. Click "Register" tab
3. Enter email: `test@example.com`
4. Enter password: `password123`
5. Enter name: `Test User`
6. Click "Create Account"

**Or Login with Existing Account:**

1. Click "Sign In" tab
2. Enter email and password
3. Click "Sign In"

### 3. API Endpoints Reference

| Endpoint             | Method | Body                                         | Response                                             |
|----------------------|--------|----------------------------------------------|------------------------------------------------------|
| `/api/auth/register` | POST   | `{email, password, first_name?, last_name?}` | `{access_token, refresh_token, token_type, user_id}` |
| `/api/auth/login`    | POST   | `{email, password}`                          | `{access_token, refresh_token, token_type, user_id}` |
| `/api/auth/refresh`  | POST   | `{refresh_token}`                            | `{access_token, token_type}`                         |
| `/api/auth/logout`   | POST   | `{refresh_token}`                            | `{status, message}`                                  |
| `/api/auth/health`   | GET    | —                                            | `{module, status}`                                   |

### 4. Using apiService in Components

```javascript
import {apiService} from '../api/apiService';

// Register
const result = await apiService.register('email@example.com', 'password', 'John', 'Doe');
localStorage.setItem('access_token', result.access_token);

// Login
const result = await apiService.login('email@example.com', 'password');
localStorage.setItem('access_token', result.access_token);

// Logout
await apiService.logout(refresh_token);
localStorage.removeItem('access_token');

// Refresh Token
const newTokens = await apiService.refreshToken(refresh_token);
```

### 5. localStorage Keys

After authentication, the following are stored:

```javascript
localStorage.access_token      // JWT for API requests
localStorage.refresh_token     // Token for refreshing access
localStorage.user_id           // Numeric user ID
localStorage.user_email        // User's email
localStorage.user_name         // User's display name
```

---

## Architecture Overview

```
Frontend (React)
    ↓
SignIn Component (Registration/Login)
    ↓
apiService (axios + interceptors)
    ↓
Backend (FastAPI)
    ↓
routes.py (HTTP layer)
    ↓
services.py (Business logic)
    ↓
models.py (Database)
```

### Key Files

**Backend:**

- `/app/modules/auth/routes.py` — HTTP endpoints
- `/app/modules/auth/services.py` — Business logic
- `/app/modules/auth/schemas.py` — Request/response models
- `/app/modules/auth/models.py` — ORM models (Token, User)

**Frontend:**

- `/frontend/src/components/SignIn.jsx` — Authentication UI
- `/frontend/src/components/Logout.jsx` — Logout dialog
- `/frontend/src/api/apiService.js` — API integration
- `/frontend/src/App.jsx` — Auth state management

---

## Common Tasks

### Protect a Route (Check Token)

The apiService automatically attaches the token. If endpoint returns 401:

```javascript
try {
    const data = await apiService.fetchState();
} catch (err) {
    if (err.response?.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('access_token');
        window.location.href = '/';  // Redirect to login
    }
}
```

### Check if User is Logged In

```javascript
const isLoggedIn = !!localStorage.getItem('access_token');
if (!isLoggedIn) {
    // Show login screen
}
```

### Get Current User Info

```javascript
const userId = localStorage.getItem('user_id');
const email = localStorage.getItem('user_email');
const name = localStorage.getItem('user_name');
```

### Add Bearer Token to Requests

The apiService does this automatically via interceptor:

```javascript
// All API calls automatically include:
Authorization: Bearer <access_token>
```

### Handle Expired Token

The backend returns 401 when token is expired. Handle in App.jsx:

```javascript
try {
    const data = await apiService.fetchState();
} catch (err) {
    if (err.response?.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    }
}
```

---

## Error Handling

### Invalid Credentials

```javascript
try {
    await apiService.login('email@example.com', 'wrongpass');
} catch (err) {
    console.error(err.message);  // "Invalid credentials"
}
```

### Email Already Registered

```javascript
try {
    await apiService.register('existing@example.com', 'pass');
} catch (err) {
    console.error(err.message);  // "Email already registered"
}
```

### Invalid/Expired Token

```javascript
// API returns 401
// App.jsx redirects to login automatically
```

---

## Testing with cURL

### Register

```bash
curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "first_name": "Test",
    "last_name": "User"
  }'
```

### Login

```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```

### Refresh Token

```bash
curl -X POST http://localhost:8001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "YOUR_REFRESH_TOKEN"}'
```

### Logout

```bash
curl -X POST http://localhost:8001/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "YOUR_REFRESH_TOKEN"}'
```

### Use Access Token

```bash
curl -X GET http://localhost:8001/api/state \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Troubleshooting

| Problem                               | Solution                                  |
|---------------------------------------|-------------------------------------------|
| "Failed to connect to Python Backend" | Check if backend is running on port 8001  |
| "Invalid credentials"                 | Verify email/password are correct         |
| "Email already registered"            | Use different email or login instead      |
| "Refresh token expired"               | Login again to get new tokens             |
| "Authorization header missing"        | Check apiService interceptor is working   |
| "CORS error"                          | Check backend has CORS middleware enabled |
| "TypeError: Cannot read tokens"       | Ensure localStorage is available          |

---

## Security Best Practices

✅ **Do:**

- Store tokens securely (localStorage is OK for demo)
- Always validate on backend (never trust client)
- Clear tokens on logout
- Check token expiration before using
- Use HTTPS in production
- Never log tokens to console in production

❌ **Don't:**

- Store tokens in sessionStorage (lost on refresh)
- Use `data-token` HTML attributes
- Hardcode credentials
- Send tokens in URL parameters
- Expose tokens in error messages
- Use without HTTPS in production

---

## Next Steps

1. ✅ Register and login working
2. ✅ Token persistence working
3. ✅ Logout functionality working
4. ⬜ Add password reset flow
5. ⬜ Add email verification
6. ⬜ Add 2FA support
7. ⬜ Add OAuth providers

---

**Questions?** Check `/app/modules/auth/` for implementation details or `/REFACTOR_AUTH_FULL.md` for full refactoring
documentation.

