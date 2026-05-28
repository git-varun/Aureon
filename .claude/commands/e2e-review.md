---
description: Run Playwright E2E tests on localhost and review results — reports failures, flags regressions, and surfaces coverage gaps
argument-hint: "[test-filter]"
allowed-tools: [Bash, Read, Glob, Grep]
---

# Aureon E2E Review

Run the Playwright test suite against the locally running app and produce a structured review of the results.

**Filter (optional):** "$ARGUMENTS"

---

## Pre-flight

1. Verify the frontend dev server is reachable:
   ```
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
   ```
   If it returns anything other than 200, stop and tell the user to run `npm run dev` in `frontend/`.

2. Verify the backend API is reachable:
   ```
   curl -s http://localhost:8000/api/auth/health
   ```
   If unreachable, warn the user but continue — some tests may still pass.

3. Check that `tests/.auth/user.json` exists in `frontend/`. If missing, run the setup project first:
   ```
   cd frontend && npx playwright test --project=setup
   ```

---

## Run Tests

Run from the `frontend/` directory. If `$ARGUMENTS` is provided, pass it as a grep filter:

```bash
# With filter
npx playwright test --project=aureon --grep "$ARGUMENTS" 2>&1

# Without filter  
npx playwright test --project=aureon 2>&1
```

Capture the full output including pass/fail counts, test names, and error messages.

---

## Analyse Results

After the run completes, produce a structured review with these sections:

### 1. Summary
- Total tests, passed, failed, skipped
- Total duration
- Pass rate (%)
- Whether all tests passed (green / yellow / red)

### 2. Failures (if any)
For each failing test:
- Test name and file location
- Error message (concise — one line if possible)
- Likely root cause (selector mismatch, API down, timing, logic bug, etc.)
- Suggested fix

### 3. Flaky / retried tests
List any tests that passed on retry. These indicate timing or race-condition issues and should be stabilised.

### 4. Coverage gaps
After reviewing the test file(s) in `frontend/tests/`, call out any major user flows NOT covered:
- Read `frontend/src/AureonShell.jsx` to get the full route list
- Compare routes against tests in `frontend/tests/aureon.spec.js`
- Flag any route or interaction type (CRUD, keyboard shortcut, error state) that has no test

### 5. Recommendations
Up to 5 concrete, prioritised actions:
- Fix: breaking failures that block confidence
- Stabilise: flaky tests needing `waitForResponse` or proper locators
- Add: missing test coverage worth adding
- Token: if `DEV_TOKEN` in `global.setup.js` is within 7 days of expiry (check `exp` claim by base64-decoding the payload), flag it for rotation

---

## Output Format

```
## E2E Review — <timestamp>

### Summary
✓ X passed   ✗ Y failed   ~ Z retried   (total duration)

### Failures
<numbered list or "None">

### Flaky Tests
<list or "None">

### Coverage Gaps
<list of uncovered routes / flows>

### Recommendations
1. ...
2. ...
```

Keep the output concise. Avoid repeating full stack traces — summarise and point to the file:line.
