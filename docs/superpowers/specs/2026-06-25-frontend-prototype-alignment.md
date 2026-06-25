# Aureon Frontend → Prototype Alignment

**Date:** 2026-06-25  
**Scope:** Visual/behavioral parity — no backend integration, no API changes  
**Canonical source:** `Aureon_Prototype/app/`

---

## Goal

> **Current Frontend = Frozen Prototype**

Every page in `frontend/src/` must match the frozen prototype in:
layout, component hierarchy, navigation, visual states (loading/empty/error/ready),
interaction flow, spacing, typography, icons, cards, tables, panels, drawers, tabs, modals.

Preserve all existing placeholder data, mock hooks, and stub providers exactly.

---

## What is already in place

- **CSS/Design tokens** — `frontend/src/styles/aureon/` mirrors `Aureon_Prototype/lib/` exactly (tokens, shell, colors_and_type, du3/cm/ev/ofc classes)
- **Shell** — Sidebar, TopBar, Toast, BottomNav implemented; uses React Router (hash routing in prototype → React Router in frontend is intentional and preserved)
- **Data layer** — `store.jsx`, `useAureonData`, mock data all stay untouched
- **Auth components** — SignIn, SignUp, TwoFactor, Forgot screens exist; to be verified against `page-auth.jsx`

---

## Implementation strategy

**Sequential, page by page**, highest visual impact first. Each page is compared
line-by-line against its prototype counterpart; missing sections, states, and
components are added in place.

**Preserved invariants across all pages:**
- No API calls or backend integration
- No changes to `apiService.js`
- No changes to React Query hooks
- No changes to `store.jsx`, `useAureonData.js`
- CSS modules coexist with inline styles (prototype uses inline styles; retain both)
- React Router paths unchanged

---

## Per-page scope

### 1. Dashboard (`page-dashboard.jsx` → `Dashboard.jsx` + `components/aureon/dashboard/`)

**Prototype features to add:**
- Per-card independent data fetch state machine: `useCardData` pattern
  (loading shimmer → empty state → error with retry → ready)
- **Portfolio Health card** — score, label, checks[] — currently missing
- **Diversification card** — score, classCount, sectors — currently missing  
- **Concentration card** — HHI, top holding, count — currently missing
- **Allocation Drift card** — drift items per asset class — improve existing
- Shimmer skeleton (`Sk` component) on every card while loading
- Retry button (`RBtn`) on error states
- `Cerr` / `Cmt` error and empty state components
- DataFreshnessStrip improvements (prices/news/AI status dots)

### 2. Portfolio (`page-portfolio.jsx` → `Portfolio.jsx` + `components/aureon/portfolio/`)

**Prototype features to add:**
- Full loading/empty/error states per section
- Holdings table matches prototype column set and visual
- Summary header matches prototype layout
- Log-transaction CTA visible in correct location
- Asset class breakdown strip

### 3. Decisions (`page-decisions.jsx` + `page-decisions-recs.jsx` + `page-decisions-history.jsx` → `Decisions.jsx`)

**Prototype features to verify/add:**
- All 4 tabs: Recommendations, Signals, Activity, Briefings
- Recommendations tab: active/applied/dismissed sections
- Signals tab: signal feed with filter/sort
- Activity tab: decision log with outcome tracking
- Briefings tab: AI briefing history list
- DecisionBasket drawer behavior
- Decision lineage modal

### 4. Notifications (`page-notifications.jsx` → `Notifications.jsx`)

**Significant gap** — prototype has 493 lines vs current 145.
- Notification list with kind-colored dots and tone labels
- Mark-read / mark-all-read
- Filter by kind
- Empty state
- Loading skeleton
- Notification detail drawer

### 5. Onboarding (`page-onboarding.jsx` → `Onboarding.jsx`)

**Replace entirely** with prototype's 5-step flow:
1. **Organisation** — org name, timezone, base currency
2. **Portfolio** — portfolio name, risk profile, annual target, monthly savings
3. **Providers** — connect/disconnect Zerodha/Groww/Binance/EPFO/NPS/MFCentral
4. **Import** — trigger import, loading states, import progress
5. **Summary** — review + finish

Preserve existing stub state (no real API calls).
Includes loading skeletons (`OnbSkeleton`), error state (`OnbError`), provider status dots.

### 6. Authentication (`page-auth.jsx` → `components/auth/`)

Verify each screen (SignIn, SignUp, TwoFactor, Forgot) against prototype.
Both split-panel and centered layout variants (tweaks-driven in prototype → default to split in frontend).
Check: form validation UX, magic-link screen, phone OTP screen, Google auth screen.

### 7. Markets (`page-markets.jsx` → `Markets.jsx`)

- Verify indices strip, movers, sector heatmap
- Theme cards grid
- Crypto section
- Loading/empty/error states per section

### 8. Terminal (`page-terminal.jsx` → `Terminal.jsx`)

- Search behavior and results layout
- Asset detail panel within terminal
- Chart section (currently stubbed)
- Tabs within terminal (Overview, Technicals, Signals, News)

### 9. Watchlist (`page-watchlist.jsx` + `page-watchlist-utils.jsx` → `Watchlist.jsx`)

- List management (add/remove/reorder)
- Price alerts section
- AI takes per watchlist item
- Empty state for empty list

### 10. Theme Detail (`page-theme.jsx` → `ThemeDetail.jsx`)

- Theme header (name, description, AI summary)
- Holdings grid with performance
- Signal strip
- AI take section

### 11. Asset Detail (`page-asset.jsx` → `AssetDetail.jsx`)

- Verify section coverage: Overview, Signals, Activity, News
- Log transaction CTA
- Holding summary at top
- Technical indicators section

### 12. Settings (`page-settings*.jsx` → `Settings.jsx`)

Prototype has 7 sub-pages:
- User profile (`page-settings-user.jsx`)
- Portfolio settings (`page-settings-portfolio.jsx`)
- Providers (`page-settings-providers.jsx`)
- Org (`page-settings-org.jsx`)
- Jobs (`page-settings-jobs.jsx`)
- Backup (`page-settings-backup.jsx`)
- Shared (`page-settings-shared.jsx`)

Verify current Settings.jsx covers all sections; add missing ones.

---

## Component additions expected

| Component | Location | Purpose |
|---|---|---|
| `Sk` (Skeleton) | `components/aureon/primitives.jsx` | Shimmer loading block |
| `RBtn` (Refresh button) | `components/aureon/primitives.jsx` | Card-level retry |
| `Cerr` (Card error) | `components/aureon/primitives.jsx` | Error state with retry |
| `Cmt` (Card empty) | `components/aureon/primitives.jsx` | Empty state message |
| `useCardData` | `hooks/useCardData.js` | Per-card loading state machine |
| `HealthCard` | `components/aureon/dashboard/` | Portfolio health |
| `DiversificationCard` | `components/aureon/dashboard/` | Diversification score |
| `ConcentrationCard` | `components/aureon/dashboard/` | Concentration/HHI |
| `OnbSkeleton` | `pages/aureon/Onboarding.jsx` | Onboarding loading state |
| `OnbError` | `pages/aureon/Onboarding.jsx` | Onboarding error state |

---

## Constraints

- No backend work
- No API integration  
- No endpoint changes
- No business logic changes
- Preserve existing mock/stub data exactly
- Do not introduce regressions in existing pages
- Preserve component reuse where possible
- All existing routes and route paths stay the same

---

## Success criteria

Each page, when viewed in the browser, is visually and behaviorally identical
to the corresponding frozen prototype page — loading states, empty states,
error states, all interactive elements, layout, typography, and spacing.
