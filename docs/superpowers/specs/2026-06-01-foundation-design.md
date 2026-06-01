# Aureon Frontend — Foundation Sub-Project Design

**Date:** 2026-06-01
**Scope:** Sub-project 1 of 3 in the full Aureon design alignment migration.
**Goal:** Establish a production-quality shared design system and align the app shell with the Aureon design reference before any screen-level migrations begin.

---

## Context

The Aureon design reference lives in `Aureon/app/` — a standalone JSX prototype with hardcoded data. The current frontend is a fully-wired React/Vite app with React Router and React Query. The `Aureon/` folder is the single source of truth for layouts, spacing, typography, components, and visual hierarchy.

This sub-project covers Phases 1–3 of the full migration (design audit, gap analysis, design system extraction) plus Phase 4 item 1 (Shell/Navigation). The remaining screens are handled in sub-projects 2 and 3.

---

## What Changes

### Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/aureon/shell/Sidebar.jsx` | Remove Watchlist and Assets nav items; trim to 6 items matching design exactly |
| `frontend/src/components/aureon/shell/Sidebar.module.css` | Visual alignment pass to match design sidebar styling |
| `frontend/src/AureonShell.jsx` | Remove `watchlistCount` prop passed to Sidebar (Watchlist nav item removed) |

### Files Created

| File | Purpose |
|------|---------|
| `frontend/src/components/aureon/ds.jsx` | New design system primitive library (13 components) |

### Files with No Changes

- `frontend/src/styles/aureon/shell.css` — fully aligned, no gaps
- `frontend/src/styles/aureon/tokens.css` — fully aligned
- `frontend/src/styles/aureon/colors_and_type.css` — fully aligned
- `frontend/src/components/aureon/ui.jsx` — stays as-is; remains the data-visualization primitive file
- `frontend/src/components/aureon/shell/TopBar.jsx` — functional parity confirmed; no changes
- All page files — belong to sub-projects 2 and 3

---

## Section 1: CSS

**No changes required.** The frontend's `shell.css`, `tokens.css`, and `colors_and_type.css` are faithful ports of `Aureon/lib/`. The frontend additionally loads Satoshi via Fontshare CDN, which is an improvement over the design which assumed Satoshi was locally installed.

---

## Section 2: Sidebar Restructure

The design sidebar has **6 nav items** in 3 groups. The current sidebar has 8 items (Watchlist and Assets are extra).

### Design structure (authoritative)

```
Daily
  Dashboard
  Decisions       [badge: active decision count, gold]

Markets
  Markets
  Terminal

You
  Portfolio       [badge: holding count]
  Transactions

─────────────────
[User avatar popup → Settings / Sign out]
```

### Changes

- **Remove** Watchlist from Markets group. Watchlist becomes a tab within the Markets page (handled in sub-project 2).
- **Remove** Assets from You group. Assets are accessed via Terminal search and Portfolio drill-down (no standalone nav).
- **Keep** all routes registered in `routes.js` — `/watchlist` and `/assets/:ticker` deep links continue to work; they just have no sidebar entry.
- **Keep** the user avatar popup at the bottom with Settings and Sign out. The design does not put Notifications in the popup; remove that menu item from the popup.
- **Remove** the `unreadCount` badge from the avatar button. The design's avatar button shows initials only, with no notification count overlay.

### Sidebar.jsx after change

```
Groups:   Daily | Markets | You
Items:    Dashboard | Decisions | Markets | Terminal | Portfolio | Transactions
Bottom:   User avatar → [Settings] [---] [Sign out]
```

---

## Section 3: TopBar

No changes. The current TopBar has full functional and visual parity with the design:
- Page title + subtitle block
- Centered search bar with ⌘K shortcut → CommandPalette
- GlobalJobsPill, RunMenu, CurrencyMenu in the actions area
- Live IST clock with NSE open/closed indicator

---

## Section 4: Design System — `ds.jsx`

A new file at `frontend/src/components/aureon/ds.jsx` containing 13 shared primitives. All use inline styles and existing `shell.css` class names (`layer-1`, `layer-2`, `du3-cta`, etc.). No new CSS files.

Screens import from this file for layout and display needs. `ui.jsx` is unchanged and continues to serve data-visualization components (Sparkline, PriceChart, StrengthDot, TierChip, SectionHead).

### Primitive catalog

#### Layout group

**`PageHeader`** — top-of-page title block with eyebrow, title, optional meta string, and right-side actions slot.
```jsx
<PageHeader
  eyebrow="Portfolio · all holdings"
  title="Portfolio"
  meta="18 positions"
  actions={<button>Log trade</button>}
  border={true}   // default true; adds bottom hairline
/>
```

**`SectionCard`** — `layer-1` glass card for grouping content sections (settings panels, info blocks).
```jsx
<SectionCard
  title="User Profile"
  subtitle="Manage personal info"
  actions={<button>Edit</button>}
  padding="22px 24px"   // default
>
  {children}
</SectionCard>
```

**`StatGrid`** — uniform grid wrapper for MetricCards.
```jsx
<StatGrid cols={5} gap={8}>
  <MetricCard label="Input" value={24} sub="signals" />
  …
</StatGrid>
```

**`ActionBar`** — footer button row, used in settings and modals.
```jsx
<ActionBar
  primary={<button>Save changes</button>}
  destructive={<button>Delete</button>}
  secondary={<button>Cancel</button>}
  align="right"   // default
/>
```

#### Data display group

**`MetricCard`** — bordered numeric metric tile with label and optional delta.
```jsx
<MetricCard
  label="Total value"
  value="₹42.3L"
  sub="+18.4%"
  tone="pos"      // 'pos' | 'neg' | 'neu'
  onClick={() => navigate('/portfolio')}
/>
```

**`StatusBadge`** — inline type/status badge.
```jsx
<StatusBadge variant="pos">BUY</StatusBadge>
<StatusBadge variant="neg">SELL</StatusBadge>
<StatusBadge variant="warn">DIVIDEND</StatusBadge>
<StatusBadge variant="info">SPLIT</StatusBadge>
<StatusBadge variant="neu">NEUTRAL</StatusBadge>
```

**`DataTable`** — sortable styled table for Portfolio, Transactions, Assets.
```jsx
<DataTable
  columns={[
    { key: 'ticker', label: 'Asset', sortable: true },
    { key: 'value',  label: 'Value', sortable: true, align: 'right', mono: true },
    { key: 'pl',     label: 'P&L',   sortable: true, align: 'right', mono: true, tone: true },
  ]}
  rows={rows}
  onRowClick={(row) => navigate(`/assets/${row.ticker}`)}
  emptyState={<EmptyState title="No holdings" />}
/>
```
`tone: true` on a column means the cell auto-colorises positive/negative values.

#### Navigation group

**`Tabs`** — horizontal tab bar, used in Decisions, Terminal, Settings, Markets.
```jsx
<Tabs
  tabs={[
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'signals',         label: 'Signals' },
    { id: 'activity',        label: 'Activity', badge: 3 },
  ]}
  active={activeTab}
  onChange={setActiveTab}
/>
```

**`FilterBar`** — horizontal filter chip row, used in Portfolio, Transactions, Markets.
```jsx
<FilterBar
  options={['All', 'Stocks', 'Crypto', 'Funds', 'Bonds']}
  value={filter}
  onChange={setFilter}
/>
```

#### Feedback group

**`EmptyState`** — dashed border empty placeholder.
```jsx
<EmptyState
  title="No transactions yet"
  body="Your logged trades will appear here."
  actions={<button>Log first trade</button>}
/>
```

**`ErrorState`** — crimson-tinted error placeholder.
```jsx
<ErrorState
  title="Failed to load"
  body="Could not reach the server."
  actions={<button onClick={retry}>Retry</button>}
/>
```

#### Overlay group

**`ModalShell`** — full-screen scrim + centered panel. Replaces the `cm-scrim`/`cm-panel` pattern currently duplicated across pages.
```jsx
<ModalShell
  open={open}
  onClose={close}
  title="Confirm action"
  subtitle="This will affect your portfolio."
  width="640px"   // default
  footer={
    <ActionBar
      primary={<button onClick={confirm}>Confirm</button>}
      secondary={<button onClick={close}>Cancel</button>}
    />
  }
>
  {children}
</ModalShell>
```

**`Drawer`** — right-side slide-in panel using `drawer-in` animation.
```jsx
<Drawer
  open={open}
  onClose={close}
  title="RELIANCE · Asset detail"
  width="520px"   // default
>
  {children}
</Drawer>
```

---

## Success Criteria

- Sidebar renders exactly 6 nav items in 3 groups matching the design.
- `/watchlist` and `/assets/:ticker` routes remain functional (direct navigation still works).
- All 13 primitives are exported from `ds.jsx` and individually render without errors.
- `DataTable` renders a sortable table with correct tone coloring for P&L columns.
- `ModalShell` traps focus and closes on Escape key and scrim click.
- `Drawer` slides in from the right using the `drawer-in` animation.
- No existing tests break.
- No existing page functionality breaks.

---

## Out of Scope

- Screen-level migrations (Dashboard, Decisions, Portfolio, etc.) — sub-project 2
- Secondary screens (Watchlist, Markets, Terminal, Settings) — sub-project 3
- Loading/empty/error states on individual pages — sub-project 2 and 3
- Responsive / mobile layout — sub-project 3
- Dead code removal — sub-project 3
