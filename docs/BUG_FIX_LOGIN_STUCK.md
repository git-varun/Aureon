# Bug Fix: "Initializing Investment OS..." Stuck State

**Date:** April 18, 2026  
**Issue:** After login, UI displays "Initializing Investment OS..." and never loads dashboard  
**Root Cause:** Missing effect to load state after authentication  
**Status:** ✅ FIXED

---

## The Problem

When a user signed in via the `SignIn` component:

1. ✅ `SignIn` component calls `onLogin()` callback
2. ✅ App state sets `isAuthenticated = true`
3. ❌ But `loadState()` was never called after authentication
4. ❌ So `state` remained `null`
5. ❌ App displayed "Initializing Investment OS..." indefinitely

**Old Code Flow:**

```javascript
// ❌ BROKEN
useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
        setIsAuthenticated(true);
        loadState();  // Only runs on mount, not after login!
    }
}, []);  // Empty dependency array = only runs once on mount
```

This worked for page refreshes (token persisted in localStorage), but NOT for fresh login flows.

---

## The Solution

Split into two effects:

1. **Effect 1:** Check for existing token on mount

```javascript
useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
        setIsAuthenticated(true);  // Just set the flag
    }
}, []);  // Only on mount
```

2. **Effect 2:** Load state whenever authentication changes

```javascript
useEffect(() => {
    if (isAuthenticated) {
        loadState();  // Runs after login, refresh, or navigation
    }
}, [isAuthenticated]);  // Dependency on isAuthenticated = runs when it changes
```

**New Code Flow:**

```javascript
// ✅ FIXED
1. User logs in via SignIn
   └─ onLogin() called
   └─ setIsAuthenticated(true)
   
2. React detects isAuthenticated dependency change
   └─ Triggers second useEffect
   └─ Calls loadState()
   
3. loadState() fetches portfolio data
   └─ Sets state
   └─ Dashboard renders
```

---

## What Changed

**File:** `/frontend/src/App.jsx`

**Lines 33-45:**

```javascript
// ⌨️ CHECK AUTHENTICATION ON MOUNT
useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
        setIsAuthenticated(true);  // Removed loadState() from here
    }
}, []);

// ⌨️ LOAD STATE WHEN AUTHENTICATED (NEW)
useEffect(() => {
    if (isAuthenticated) {
        loadState();  // Now runs whenever authenticated changes
    }
}, [isAuthenticated]);  // Dependency on authentication state
```

---

## Testing the Fix

### Test 1: Fresh Login

1. ✅ Open http://localhost:5173
2. ✅ Click "Register" → Create account
3. ✅ Should automatically load dashboard (not stuck!)
4. ✅ Portfolio data should appear

### Test 2: Fresh Login (Existing Account)

1. ✅ Click logout (if still logged in)
2. ✅ Click "Sign In" tab
3. ✅ Enter credentials
4. ✅ Should automatically load dashboard
5. ✅ No "Initializing..." message

### Test 3: Page Refresh

1. ✅ Already logged in? Refresh page (F5)
2. ✅ Should load dashboard immediately
3. ✅ Token persists from localStorage

### Test 4: Token Expiration

1. ✅ While logged in, open DevTools (F12)
2. ✅ Delete `access_token` from localStorage
3. ✅ Refresh page
4. ✅ Should redirect to login
5. ✅ Should show "Session expired" message

---

## Why This Works

The key is using **effect dependencies** to trigger effects at the right time:

| Effect   | Trigger             | Purpose                                |
|----------|---------------------|----------------------------------------|
| Effect 1 | `[]` (mount only)   | Check for persisted token on app start |
| Effect 2 | `[isAuthenticated]` | Load state whenever user authenticates |

When `onLogin()` is called → `isAuthenticated` changes → Effect 2 runs → `loadState()` called → Dashboard loads ✅

---

## Summary

**Before:** Login → stuck on "Initializing..."  
**After:** Login → automatic dashboard load ✅

The fix was to separate concerns into two effects, one for mount-time checks and one for authentication-triggered
actions.

---

## Related Code

**SignIn Component:** `/frontend/src/components/SignIn.jsx`

- Calls `onLogin()` after successful authentication

**Logout Component:** `/frontend/src/components/Logout.jsx`

- Clears tokens and calls `onLogout()`
- Which calls `handleLogout()` in App.jsx
- Which sets `isAuthenticated = false`

**App.jsx:** `/frontend/src/App.jsx`

- Manages overall auth state
- Handles 401 responses
- Coordinates between SignIn/Logout components and dashboard

---

**Status:** ✅ Fixed and tested

Now the authentication flow works seamlessly:  
Sign In → `onLogin()` → `isAuthenticated` changes → `loadState()` triggers → Dashboard loads 🚀

