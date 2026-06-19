# Aureon Frontend — Core Screens Sub-Project Design

**Date:** 2026-06-01
**Scope:** Sub-project 2 of 3 in the full Aureon design alignment migration.
**Approach:** Structural patch (Approach B) — align layout structure and swap in ds.jsx primitives. All business logic, hooks, and API contracts preserved.

---

## Context

Foundation (sub-project 1) is complete: sidebar trimmed to 6 items, `ds.jsx` created with 13 shared primitives. This sub-project migrates the 5 core screens to design parity using those primitives.

The Aureon design reference (`Aureon/app/`) is the single source of truth. Every layout proportion, component hierarchy, and primitive usage in this spec is derived from it.

---

## What Changes

### Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/aureon/dashboard/LifecycleStrip.jsx` | Fix route targets: signals→`/decisions?tab=signals`, activity→`/decisions?tab=activity` |
| `frontend/src/components/aureon/dashboard/SupportingStrip.jsx` | Fix route target: signals→`/decisions?tab=signals` |
| `frontend/src/pages/aureon/Dashboard.jsx` | Fix "Review all" navigation: `/recommendations`→`/decisions?tab=recommendations` |
| `frontend/src/pages/aureon/Decisions.jsx` | Replace inline tab rendering with `Tabs` from ds.jsx |
| `frontend/src/pages/aureon/Portfolio.jsx` | Replace local filter chips with `FilterBar` from ds.jsx; verify header grid proportions |
| `frontend/src/pages/aureon/AssetDetail.jsx` | Add breadcrumb; replace inline "not found" state with `ErrorState` from ds.jsx |
| `frontend/src/pages/aureon/Transactions.jsx` | Remove Activity tab; replace stat header, TypeBadge, table, confirm modal with ds.jsx primitives |

### Files with No Changes

- `frontend/src/components/aureon/dashboard/Hero.jsx` — already pixel-perfect (60px mono, correct 3-col grid)
- `frontend/src/components/aureon/dashboard/Hero.module.css` — already correct
- `frontend/src/components/aureon/dashboard/GoalProgress.jsx` — matches design
- `frontend/src/components/aureon/dashboard/TopHoldingsRow.jsx` — matches design
- `frontend/src/components/aureon/dashboard/PortfolioProgress.jsx` — matches design
- `frontend/src/components/aureon/dashboard/WiredDecisionUnit.jsx` — matches design
- `frontend/src/components/aureon/portfolio/ClassRow.jsx` — matches design
- `frontend/src/components/aureon/portfolio/HoldingSubRow.jsx` — matches design
- `frontend/src/components/aureon/portfolio/LogTradeModal.jsx` — keep
- `frontend/src/pages/aureon/Activity.jsx` — keep (used as tab panel inside Decisions)
- All backend files, API service, hooks

---

## Screen 1: Dashboard

### Layout

The design layout order is correct and already implemented:

```
Hero (3-col: networth · insight · donut)
PortfolioProgress (collapsible)
LifecycleStrip (5 steps)
GoalProgress (2 cards)
SectionHead → Active recommendations
Decision units
SectionHead → Top positions
TopHoldingsRow (5 cards)
SupportingStrip (3 cards)
```

### Changes

**LifecycleStrip.jsx** — Fix stale route targets. Two stages currently navigate to dead routes:

```jsx
// Before
{ k: 'Input', route: 'signals', ... }
{ k: 'Outcome', route: 'activity', ... }

// After
{ k: 'Input', route: 'decisions', ... }   // navigates to /decisions?tab=signals
{ k: 'Outcome', route: 'decisions', ... } // navigates to /decisions?tab=activity
```

The navigate call should use React Router's navigate with search params:
```jsx
// stage with tab mapping
const ROUTE_MAP = {
  signals:         '/decisions?tab=signals',
  recommendations: '/decisions?tab=recommendations',
  activity:        '/decisions?tab=activity',
};
// onClick: navigate(ROUTE_MAP[stage.route] || '/' + stage.route)
```

**SupportingStrip.jsx** — Fix the Signals card route:
```jsx
// Before
{ t: 'Signals · inputs', route: 'signals' }
// After
{ t: 'Signals · inputs', route: null, href: '/decisions?tab=signals' }
// Or: use navigate('/decisions?tab=signals') in onClick
```

**Dashboard.jsx** — Fix "Review all" button navigation:
```jsx
// Before
onClick={() => navigate('/recommendations')}
// After
onClick={() => navigate('/decisions?tab=recommendations')}
```

---

## Screen 2: Decisions

### Layout (from design)

```
[tab bar: Recommendations | Signals | Activity | Briefings]  [DecisionTrackRecord]
─────────────────────────────────────────────────────────────────────────────────
[active tab panel]
```

### Changes

Replace the inline tab rendering in `Decisions.jsx` with `Tabs` from `ds.jsx`.

**Before (inline):**
```jsx
<div role="tablist" style={{ display:'flex', justifyContent:'space-between', ... }}>
  <div style={{ display:'flex', gap:22, marginBottom:-1 }}>
    {DECISION_TABS.map((t) => {
      const on = t.id === tab;
      return (
        <button key={t.id} role="tab" style={{ borderBottom:'2px solid '+(on?'var(--aurum-100)':'transparent'), ... }}>
          {t.label}
          {c != null && <span style={{ ... }}>{c}</span>}
        </button>
      );
    })}
  </div>
  <DecisionTrackRecord />
</div>
```

**After:**
```jsx
import { Tabs } from '@/components/aureon/ds';

<div style={{ display:'flex', alignItems:'center', gap:0, borderBottom:'1px solid rgba(255,255,255,0.07)', marginBottom:24, flexWrap:'wrap' }}>
  <Tabs
    tabs={[
      { id:'recommendations', label:'Recommendations', badge: active.length },
      { id:'signals',         label:'Signals',         badge: signals.length },
      { id:'activity',        label:'Activity',        badge: activity.length },
      { id:'briefings',       label:'Briefings' },
    ]}
    active={tab}
    onChange={setTab}
  />
  <div style={{ flex:1, minWidth:16 }}/>
  <div style={{ paddingBottom:2 }}>
    <CalibrationPanel activity={activity}/>
  </div>
</div>
```

Tab state remains `useState` initialized from the `?tab=` URL param — no routing change needed. `Tabs` calls `setTab(id)` directly. `CalibrationPanel` (the existing accuracy stat component in Decisions.jsx) stays in place at the right edge of the tab bar.

The `Tabs` component in ds.jsx renders its own `borderBottom` and `marginBottom`. When embedded in the Decisions flex row (which also has `borderBottom`), extend `Tabs` to accept a `standalone` prop (default `true`) that controls whether it renders the bottom border and margin — set `standalone={false}` in Decisions to avoid doubling.

---

## Screen 3: Portfolio

### Layout (from design)

```
[eyebrow] Portfolio value · all classes
[48px mono value]   │   Diversification text (font-heading, 14px)
[delta row]         │   [donut 84px + legend]
──────────────────────────────────────────────────────────
FilterBar: All · Stocks · Crypto · Funds · Bonds · …
[Log trade button — top right]
ClassRow (Stocks) ▸ expandable
ClassRow (Crypto) ▸ expandable
...
```

### Changes

**Header grid** — verify the `Portfolio.module.css` (if any) uses `grid-template-columns: minmax(0,1.3fr) minmax(0,1fr) auto` and `gap: 32px`. If Portfolio.jsx uses an inline header, align to:
```jsx
<header style={{
  padding: '8px 0 22px', marginBottom: 22,
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) auto',
  gap: 32, alignItems: 'end',
}}>
```

**FilterBar** — replace the local filter chip implementation with `FilterBar` from ds.jsx:
```jsx
import { FilterBar } from '@/components/aureon/ds';

// Before: local inline button group or custom chips
// After:
<FilterBar
  options={['all', 'stocks', 'crypto', 'funds', 'bonds', 'real_estate', 'retirement', 'insurance']}
  value={filter}
  onChange={setFilter}
/>
```

Labels should be capitalised for display but values remain lowercase slugs. `FilterBar` receives the raw values — if display labels differ, pass `options` as `[{ value, label }]` objects. The current ds.jsx `FilterBar` takes `string[]` — if the portfolio needs labelled options, extend `FilterBar` to accept `{ value: string, label: string }[]` as an overload.

---

## Screen 4: Asset Detail

### Layout (from design)

```
Assets / TICKER                          ← breadcrumb
[ticker mono bold]  [name]  [price]  [day%]  [tier chip]
[price chart with event markers]
[position block: value · P&L · weight · cost basis]
[rec card if active rec exists]
[signals for this asset]
```

### Changes

**Breadcrumb** — add above the existing header:
```jsx
<div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:'var(--ink-40)', marginBottom:14 }}>
  <button onClick={() => navigate('/assets')} className="du3-cta ghost" style={{ padding:0, fontSize:11.5 }}>Assets</button>
  <span>/</span>
  <span style={{ color:'var(--ink-20)' }}>{ticker}</span>
</div>
```

**"Not found" state** — replace the inline div with `ErrorState`:
```jsx
import { ErrorState } from '@/components/aureon/ds';

// Before
if (!asset) return (
  <div style={{ padding:40, color:'var(--ink-30)' }}>
    Asset not found. <button ...>Back to portfolio</button>
  </div>
);

// After
if (!asset) return (
  <ErrorState
    title="Asset not found"
    body={`No data for ticker "${ticker}".`}
    actions={<button className="du3-cta ghost" onClick={() => navigate('/portfolio')}>Back to portfolio</button>}
  />
);
```

---

## Screen 5: Transactions

### Layout (from design)

```
[eyebrow] Ledger
[stat row: count · buys/contrib · sells · net cash flow]
──────────────────────────────────────────────────────────
[search input] [type select] [broker select] [date from] [date to] [clear]
                                                          [Log transaction →]
[table: date · type · asset/name · qty · price · total · delete]
```

### Changes

**Remove Activity tab** — delete the `useSearchParams` tab routing and all Activity-tab-related code:
```jsx
// Remove:
import Activity from './Activity';
const [searchParams] = useSearchParams();
const activeTab = searchParams.get('tab') || 'transactions';
// ... tab bar rendering
// ... {activeTab === 'activity' && <Activity />}
```

The Transactions page becomes a single-view pure ledger. The `/activity` route already redirects to `/decisions?tab=activity` in AureonShell.jsx — no routing changes needed.

**Stat header** — replace inline stats with `StatGrid` + `MetricCard`:
```jsx
import { StatGrid, MetricCard } from '@/components/aureon/ds';

// Before: inline flex row with Eyebrow + large mono numbers
// After:
<StatGrid cols={4} gap={12} style={{ marginBottom: 20 }}>
  <MetricCard label="Transactions" value={filtered.length} sub={filtered.length !== txns.length ? `of ${txns.length}` : undefined} />
  <MetricCard label="Buys / Contrib" value={buys} tone="pos" />
  <MetricCard label="Sells" value={sells} tone="neg" />
  <MetricCard label="Net cash flow" value={fmtMoney(netFlow)} tone={netFlow >= 0 ? 'pos' : 'neg'} />
</StatGrid>
```

**TypeBadge → StatusBadge** — replace the local `TypeBadge` component:
```jsx
import { StatusBadge } from '@/components/aureon/ds';

// Variant mapping:
const TXN_VARIANT = {
  BUY: 'pos', SELL: 'neg', DIVIDEND: 'warn',
  INTEREST: 'warn', BONUS: 'pos', SPLIT: 'info',
};

// Before: <TypeBadge type={txn.transaction_type} />
// After:  <StatusBadge variant={TXN_VARIANT[displayType(txn.transaction_type)] ?? 'neu'}>
//           {displayType(txn.transaction_type)}
//         </StatusBadge>
```

**Table → DataTable** — replace the custom `COL` grid table with `DataTable`:
```jsx
import { DataTable } from '@/components/aureon/ds';

const columns = [
  { key: 'date',   label: 'Date',   sortable: true },
  { key: 'type',   label: 'Type' },
  { key: 'asset',  label: 'Asset',  sortable: true },
  { key: 'qty',    label: 'Qty',    align: 'right', mono: true },
  { key: 'price',  label: 'Price',  align: 'right', mono: true },
  { key: 'total',  label: 'Total',  align: 'right', mono: true, sortable: true },
  { key: '_delete', label: '' },
];

// Rows are built from filtered txns. Each row includes:
// - _type_display: <StatusBadge> element
// - _delete_display: delete icon button
// Note: DataTable renders row[`_${key}_display`] if present, else row[key]
```

**Confirm modal → ModalShell** — replace the inline confirm div with `ModalShell`:
```jsx
import { ModalShell, ActionBar } from '@/components/aureon/ds';

// Before: inline conditional div rendered as confirm overlay
// After:
<ModalShell
  open={!!confirm}
  onClose={() => setConfirm(null)}
  title="Delete transaction?"
  subtitle={confirm ? `${confirm.type} ${confirm.ticker} · ${fmtDate(confirm.transaction_date)}` : ''}
  width="480px"
  footer={
    <ActionBar
      primary={<button className="du3-cta" style={{ background:'rgba(209,107,107,0.14)', borderColor:'rgba(209,107,107,0.35)', color:'var(--crimson-500)' }} onClick={() => doDelete(confirm)}>Delete</button>}
      secondary={<button className="du3-cta ghost" onClick={() => setConfirm(null)}>Cancel</button>}
    />
  }
>
  <p style={{ fontSize:13, color:'var(--ink-20)', lineHeight:1.6, margin:0 }}>
    Removing this transaction will recalculate the position for <strong style={{ color:'var(--ink-00)' }}>{confirm?.ticker}</strong>. This cannot be undone.
  </p>
</ModalShell>
```

**Keep unchanged:** existing `FilterBar` component (search + selects + date range — richer than ds.jsx chips), delete flow logic, LogTradeModal, all API calls.

---

## Success Criteria

- LifecycleStrip Signals and Outcome steps navigate to `/decisions?tab=signals` and `/decisions?tab=activity` respectively.
- SupportingStrip Signals card navigates to `/decisions?tab=signals`.
- Dashboard "Review all" button navigates to `/decisions?tab=recommendations`.
- Decisions tab bar renders using `Tabs` from ds.jsx; active tab shows gold underline; badge counts render correctly.
- Portfolio header matches design 3-col grid (`1.3fr 1fr auto`); `FilterBar` from ds.jsx renders filter chips.
- Asset Detail shows `Assets / TICKER` breadcrumb above the header.
- Asset Detail "not found" state uses `ErrorState` from ds.jsx.
- Transactions page has no Activity tab — renders only the transaction ledger.
- Transactions stat header uses `StatGrid` + `MetricCard`.
- Transactions table uses `DataTable` with sortable columns and correct tone coloring.
- Transactions type badges use `StatusBadge` with correct variant mapping.
- Transactions delete confirm uses `ModalShell`.
- No existing tests break.
- No existing API calls, hooks, or business logic are modified.

---

## Out of Scope

- Loading skeletons / empty states on Portfolio, Decisions tab panels — sub-project 3
- Markets, Watchlist, Terminal, Settings screens — sub-project 3
- Responsive / mobile layout — sub-project 3
- Dead code removal — sub-project 3
- `FilterBar` in ds.jsx extended to support labelled options (done if needed during implementation, else sub-project 3)
