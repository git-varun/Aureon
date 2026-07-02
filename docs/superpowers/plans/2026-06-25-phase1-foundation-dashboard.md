# Phase 1 — Foundation + Dashboard Alignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Aureon React frontend into 100% visual/behavioural parity with the frozen prototype for shared primitives and the Dashboard page.

**Architecture:** The prototype's pattern of independent per-card state machines (`useCardData`) is extracted into a shared hook. New dashboard cards stub their data fetches — all return `null`, triggering empty states until the backend is wired. The Dashboard root derives its portfolio summary state from the existing `useAureonData` hook and passes it down; no new API calls are added.

**Tech Stack:** React 18, React Router v6, inline CSS (matching prototype), existing `useFmtMoney` hook, existing `useApp` / `useAureonData` hooks.

## Global Constraints

- Do NOT modify `apiService.js`, `store.jsx`, `useAureonData.js`, or any existing hook
- Do NOT add new React Query calls
- Do NOT call backend APIs
- Stub fetch functions return `null` → empty state
- CSS uses inline styles matching prototype exactly (no new CSS modules for new components)
- All existing routes and paths unchanged
- Dev server: `cd frontend && npm run dev` → http://localhost:3000

---

### Task 1: Add `useCardData` hook

**Files:**
- Create: `frontend/src/hooks/useCardData.js`

**Interfaces:**
- Produces: `useCardData(fetchFn) → { status: 'loading'|'ready'|'empty'|'error', data, error, refetch }`

- [ ] **Step 1: Create the hook**

```js
// frontend/src/hooks/useCardData.js
import { useState, useEffect, useRef } from 'react';

/**
 * Per-card async state machine.
 * status: 'loading' | 'ready' | 'empty' | 'error'
 * null/[] data → 'empty'. Error thrown → 'error'.
 */
export function useCardData(fetchFn) {
  const fn = useRef(fetchFn);
  fn.current = fetchFn;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let dead = false;
    setState(s => ({ ...s, status: 'loading', error: null }));
    fn.current()
      .then(d => {
        if (!dead) setState({
          status: (d == null || (Array.isArray(d) && !d.length)) ? 'empty' : 'ready',
          data: d,
          error: null,
        });
      })
      .catch(e => {
        if (!dead) setState({ status: 'error', data: null, error: e?.message || 'Unknown error' });
      });
    return () => { dead = true; };
  }, [tick]);

  return { ...state, refetch: () => setTick(t => t + 1) };
}
```

- [ ] **Step 2: Verify it exists**

```bash
ls frontend/src/hooks/useCardData.js
```
Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useCardData.js
git commit -m "feat: add useCardData per-card state machine hook"
```

---

### Task 2: Add shared card primitives to `ui.jsx`

**Files:**
- Modify: `frontend/src/components/aureon/ui.jsx` (append exports at bottom)

**Interfaces:**
- Produces: `Sk`, `RBtn`, `Cerr`, `Cmt`, `CS` (exported from ui.jsx)
- Consumes: nothing new

- [ ] **Step 1: Append to `frontend/src/components/aureon/ui.jsx`**

Add these four exports at the bottom of the file (after the existing `AllocDonut` export):

```jsx
/** Shimmer skeleton block. h=height, w=width, r=borderRadius */
export const Sk = ({ h = 14, w = '100%', r = 5 }) => (
  <div style={{
    height: h, width: w, borderRadius: r,
    background: 'rgba(255,255,255,0.07)',
    animation: 'shimmer 1.5s ease-in-out infinite',
  }} />
);

/** Card-level refresh icon button */
export const RBtn = ({ onRefresh }) => (
  <button
    onClick={onRefresh}
    title="Refresh"
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)', padding: 0, lineHeight: 0, display: 'inline-flex', borderRadius: 4 }}
    onMouseEnter={e => e.currentTarget.style.color = 'var(--ink-20)'}
    onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-40)'}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  </button>
);

/** Card error state with optional retry button */
export const Cerr = ({ msg, retry }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
    <span style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(209,107,107,0.10)', border: '1px solid rgba(209,107,107,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crimson-500)', flexShrink: 0 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </span>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-20)' }}>Failed to load</div>
      <div style={{ fontSize: 11, color: 'var(--ink-40)', marginTop: 1 }}>{msg}</div>
    </div>
    {retry && (
      <button onClick={retry} className="du3-cta" style={{ height: 26, fontSize: 11, padding: '0 10px', flexShrink: 0 }}>
        Retry
      </button>
    )}
  </div>
);

/** Card empty state */
export const Cmt = ({ msg = 'No data available' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--ink-40)' }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
    </svg>
    <span style={{ fontSize: 12 }}>{msg}</span>
  </div>
);

/** Shared card surface style object — spread into inline style */
export const CS = {
  padding: '16px 18px',
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
};
```

- [ ] **Step 2: Add shimmer keyframe to index.css**

In `frontend/src/index.css`, append:

```css
@keyframes shimmer {
  0%, 100% { opacity: 0.38; }
  50% { opacity: 0.78; }
}
```

- [ ] **Step 3: Start dev server and verify no import errors**

```bash
cd frontend && npm run dev 2>&1 | head -20
```
Expected: "Local: http://localhost:3000/" with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/aureon/ui.jsx frontend/src/index.css
git commit -m "feat: add Sk/RBtn/Cerr/Cmt/CS shared card primitives"
```

---

### Task 3: Create `PortfolioHistoryChart` component

**Files:**
- Create: `frontend/src/components/aureon/dashboard/PortfolioHistoryChart.jsx`

**Interfaces:**
- Consumes: `snapshots: Array<{ ts: Date|string, value: number }>`, `range: '1W'|'1M'|'3M'|'1Y'|'ALL'`, `height?: number`
- Produces: SVG chart matching prototype exactly

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/aureon/dashboard/PortfolioHistoryChart.jsx
import React from 'react';

const RANGE_DAYS = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'ALL': Infinity };

export function PortfolioHistoryChart({ snapshots, range, height = 170 }) {
  if (!snapshots?.length) return null;

  const days = RANGE_DAYS[range] || 90;
  const vis  = snapshots.slice(-Math.min(days, snapshots.length));
  const vals = vis.map(s => s.value);
  const mn   = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const up   = vals[vals.length - 1] >= vals[0];
  const hex  = up ? '#6FAE88' : '#D16B6B';
  const W = 800, H = height, pt = 6, pb = 22;
  const xi = i => (i / (vis.length - 1)) * W;
  const yv = v => pt + (1 - (v - mn) / r) * (H - pt - pb);
  const d  = vis.map((s, i) => (i ? 'L' : 'M') + xi(i).toFixed(1) + ' ' + yv(s.value).toFixed(1)).join(' ');
  const fd = dt => new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const lx = [0, Math.floor((vis.length - 1) / 2), vis.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      <defs>
        <linearGradient id="phcGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hex} stopOpacity="0.18" />
          <stop offset="1" stopColor={hex} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line key={i} x1={0} x2={W}
          y1={pt + t * (H - pt - pb)} y2={pt + t * (H - pt - pb)}
          stroke="rgba(255,255,255,0.04)" />
      ))}
      <path d={d + ` L${xi(vis.length - 1)} ${H - pb} L0 ${H - pb} Z`} fill="url(#phcGrad)" />
      <path d={d} fill="none" stroke={hex} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {lx.map((idx, i) => (
        <text key={i}
          x={i === 0 ? 2 : i === 2 ? W - 2 : xi(idx)} y={H - 5}
          textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
          fontSize="10" fontFamily="var(--font-mono)" fill="rgba(255,255,255,0.22)">
          {fd(vis[idx].ts)}
        </text>
      ))}
      <circle
        cx={xi(vis.length - 1)} cy={yv(vals[vals.length - 1])}
        r="3.5" fill={hex} stroke="var(--canvas)" strokeWidth="1.5"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/PortfolioHistoryChart.jsx
git commit -m "feat: add PortfolioHistoryChart (SVG, range-selectable)"
```

---

### Task 4: Create `PortfolioSummaryHero` component

**Files:**
- Create: `frontend/src/components/aureon/dashboard/PortfolioSummaryHero.jsx`

**Interfaces:**
- Consumes: `data: { value, dayDelta, dayDeltaPct, lastUpdated, snapshots }|null`, `status: string`, `error: string|null`, `refetch: ()=>void`
- Produces: Hero block matching prototype — large net worth, day delta, range chart

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/aureon/dashboard/PortfolioSummaryHero.jsx
import React, { useState } from 'react';
import { Sk, Cerr, CS, Eyebrow, RBtn } from '../ui';
import { PortfolioHistoryChart } from './PortfolioHistoryChart';
import { useFmtMoney } from '@/hooks/useFmtMoney';

const agoFmt = d => {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

const RANGES = ['1W', '1M', '3M', '1Y', 'ALL'];

export function PortfolioSummaryHero({ data: D, status: S, error: E, refetch }) {
  const [range, setRange] = useState('3M');
  const fmt = useFmtMoney();

  return (
    <div style={{ ...CS, marginBottom: 16 }}>
      {S === 'loading' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.85fr)', gap: 32, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Sk h={11} w={130} /><Sk h={50} w={215} /><Sk h={15} w={160} />
            <div style={{ marginTop: 14 }}><Sk h={10} w={80} r={3} /><div style={{ marginTop: 5 }}><Sk h={14} w={205} /></div></div>
          </div>
          <Sk h={170} r={8} />
        </div>
      )}

      {S === 'error' && <Cerr msg={E} retry={refetch} />}

      {S === 'ready' && D && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.85fr)', gap: 32, alignItems: 'center' }}>
          {/* Left — value + metadata */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Eyebrow>Portfolio value</Eyebrow>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--sage-500)', boxShadow: '0 0 0 3px rgba(111,174,136,0.18)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)' }}>{agoFmt(D.lastUpdated)}</span>
                <RBtn onRefresh={refetch} />
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 52, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--ink-00)', lineHeight: 1 }}>
              {fmt(D.value, 'INR', { dp: 0 })}
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: D.dayDelta >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)' }}>
                {D.dayDelta >= 0 ? '▲' : '▼'} {fmt(Math.abs(D.dayDelta), 'INR', { dp: 0 })} · {D.dayDelta >= 0 ? '+' : ''}{(D.dayDeltaPct * 100).toFixed(2)}%
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-50)' }}>today</span>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-50)', fontWeight: 600 }}>Last updated</div>
              <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-30)' }}>
                {new Date(D.lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                <span style={{ color: 'var(--ink-60)', margin: '0 5px' }}>·</span>
                {new Date(D.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Right — chart */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              {RANGES.map(p => (
                <button key={p} onClick={() => setRange(p)} style={{
                  padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: range === p ? 'rgba(201,168,106,0.12)' : 'transparent',
                  color: range === p ? 'var(--aurum-100)' : 'var(--ink-40)',
                  border: 'none', cursor: 'pointer', borderRadius: 4,
                }}>{p}</button>
              ))}
            </div>
            <PortfolioHistoryChart snapshots={D.snapshots} range={range} height={168} />
          </div>
        </div>
      )}

      {S === 'empty' && (
        <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13 }}>
          No portfolio data — connect a provider to see your net worth here.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/PortfolioSummaryHero.jsx
git commit -m "feat: add PortfolioSummaryHero matching prototype"
```

---

### Task 5: Create `PortfolioHealthCard`

**Files:**
- Create: `frontend/src/components/aureon/dashboard/PortfolioHealthCard.jsx`

**Interfaces:**
- Consumes: `useCardData`, `Sk`, `RBtn`, `Cerr`, `Cmt`, `CS`, `Eyebrow` (all from existing modules)
- Produces: Self-contained card with loading/empty/error/ready states

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/aureon/dashboard/PortfolioHealthCard.jsx
import React from 'react';
import { useCardData } from '@/hooks/useCardData';
import { Sk, RBtn, Cerr, Cmt, CS, Eyebrow } from '../ui';

const toneCol = k =>
  k === 'pos' ? 'var(--sage-500)' : k === 'warn' ? 'var(--dusk-500)' : 'var(--crimson-500)';

const stub = async () => {
  await new Promise(r => setTimeout(r, 600 + Math.random() * 300));
  return null; // backend not yet integrated
};

export function PortfolioHealthCard() {
  const { status, data, error, refetch } = useCardData(stub);

  return (
    <div style={{ ...CS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Eyebrow>Portfolio health</Eyebrow><RBtn onRefresh={refetch} />
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Sk h={48} w={48} r={999} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Sk h={18} w={80} /><Sk h={11} w={55} />
            </div>
          </div>
          {[0, 1, 2, 3].map(i => <Sk key={i} h={11} />)}
        </div>
      )}

      {status === 'error' && <Cerr msg={error} retry={refetch} />}
      {status === 'empty' && <Cmt msg="Health data unavailable" />}

      {status === 'ready' && data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <svg width="50" height="50" viewBox="0 0 50 50" style={{ flexShrink: 0 }}>
              <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
              <circle cx="25" cy="25" r="20" fill="none"
                stroke={toneCol(data.toneKey)} strokeWidth="3.5"
                strokeDasharray={`${(data.score / 100) * 125.7} 125.7`}
                strokeLinecap="round" transform="rotate(-90 25 25)"
                style={{ transition: 'stroke-dasharray 650ms var(--ease-decel)' }} />
              <text x="25" y="29.5" textAnchor="middle" fontSize="12"
                fontFamily="var(--font-mono)" fontWeight="500" fill="var(--ink-00)">{data.score}</text>
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: toneCol(data.toneKey) }}>{data.label}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-50)', marginTop: 2 }}>out of 100</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.checks.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                <span style={{ width: 15, height: 15, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c.ok ? 'rgba(111,174,136,0.12)' : 'rgba(209,107,107,0.10)', color: c.ok ? 'var(--sage-500)' : 'var(--crimson-500)' }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {c.ok ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
                  </svg>
                </span>
                <span style={{ flex: 1, color: 'var(--ink-20)' }}>{c.text}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)' }}>{c.detail}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/PortfolioHealthCard.jsx
git commit -m "feat: add PortfolioHealthCard (loading/empty/error/ready)"
```

---

### Task 6: Create `DiversificationCard`

**Files:**
- Create: `frontend/src/components/aureon/dashboard/DiversificationCard.jsx`

**Interfaces:**
- Consumes: `useCardData`, `Sk`, `RBtn`, `Cerr`, `Cmt`, `CS`, `Eyebrow`
- Produces: Self-contained card

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/aureon/dashboard/DiversificationCard.jsx
import React from 'react';
import { useCardData } from '@/hooks/useCardData';
import { Sk, RBtn, Cerr, Cmt, CS, Eyebrow } from '../ui';

const stub = async () => {
  await new Promise(r => setTimeout(r, 640 + Math.random() * 310));
  return null;
};

export function DiversificationCard() {
  const { status, data, error, refetch } = useCardData(stub);

  return (
    <div style={{ ...CS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Eyebrow>Diversification</Eyebrow><RBtn onRefresh={refetch} />
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Sk h={34} w={110} /><Sk h={8} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {[0, 1, 2, 3].map(i => <Sk key={i} h={46} />)}
          </div>
        </div>
      )}

      {status === 'error' && <Cerr msg={error} retry={refetch} />}
      {status === 'empty' && <Cmt msg="Diversification data unavailable" />}

      {status === 'ready' && data && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 500, color: 'var(--ink-00)' }}>{data.score}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-50)' }}>/100</span>
            <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 500, color: data.score >= 75 ? 'var(--sage-500)' : data.score >= 55 ? 'var(--dusk-500)' : 'var(--crimson-500)' }}>{data.label}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 'inherit', width: `${data.score}%`, background: data.score >= 75 ? 'var(--sage-500)' : data.score >= 55 ? 'var(--dusk-500)' : 'var(--crimson-500)', transition: 'width 600ms var(--ease-decel)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Asset classes', v: data.classCount },
              { l: 'Sectors',       v: data.sectors },
              { l: 'Top class',     v: data.topClass },
              { l: 'Max weight',    v: (data.topPct * 100).toFixed(1) + '%' },
            ].map(({ l, v }) => (
              <div key={l} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 3 }}>{l}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: 'var(--ink-00)' }}>{v}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/DiversificationCard.jsx
git commit -m "feat: add DiversificationCard (loading/empty/error/ready)"
```

---

### Task 7: Create `ConcentrationCard`

**Files:**
- Create: `frontend/src/components/aureon/dashboard/ConcentrationCard.jsx`

**Interfaces:**
- Consumes: `useCardData`, `Sk`, `RBtn`, `Cerr`, `Cmt`, `CS`, `Eyebrow`
- Produces: Self-contained card

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/aureon/dashboard/ConcentrationCard.jsx
import React from 'react';
import { useCardData } from '@/hooks/useCardData';
import { Sk, RBtn, Cerr, Cmt, CS, Eyebrow } from '../ui';

const stub = async () => {
  await new Promise(r => setTimeout(r, 560 + Math.random() * 280));
  return null;
};

export function ConcentrationCard() {
  const { status, data, error, refetch } = useCardData(stub);

  const riskCol = !data ? 'var(--ink-30)'
    : data.score <= 30 ? 'var(--crimson-500)'
    : data.score <= 55 ? 'var(--dusk-500)'
    : 'var(--sage-500)';

  const riskRgb = riskCol === 'var(--sage-500)' ? '111,174,136'
    : riskCol === 'var(--dusk-500)' ? '212,162,87'
    : '209,107,107';

  return (
    <div style={{ ...CS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Eyebrow>Concentration</Eyebrow><RBtn onRefresh={refetch} />
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Sk h={44} w={44} r={8} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Sk h={16} w={70} /><Sk h={10} w={50} />
            </div>
          </div>
          <Sk h={6} />
          {[0, 1, 2].map(i => <Sk key={i} h={11} />)}
        </div>
      )}

      {status === 'error' && <Cerr msg={error} retry={refetch} />}
      {(status === 'empty' || (status === 'ready' && !data)) && <Cmt msg="Concentration data unavailable" />}

      {status === 'ready' && data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `rgba(${riskRgb},0.12)`, border: `1px solid rgba(${riskRgb},0.22)` }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: riskCol }}>{data.score}</span>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: riskCol }}>{data.label}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-50)', marginTop: 2 }}>out of 100 · HHI {data.hhi != null ? data.hhi.toFixed(3) : '—'}</div>
            </div>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 'inherit', width: `${data.score}%`, background: riskCol, transition: 'width 600ms var(--ease-decel)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { l: 'Top holding', v: data.topHolding ?? '—' },
              { l: 'Top weight',  v: data.topPct != null ? `${(data.topPct * 100).toFixed(1)}%` : '—' },
              { l: 'Holdings',    v: data.holdingCount ?? '—' },
            ].map(({ l, v }) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-40)' }}>{l}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 500, color: 'var(--ink-10)' }}>{v}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/ConcentrationCard.jsx
git commit -m "feat: add ConcentrationCard (loading/empty/error/ready)"
```

---

### Task 8: Create `AllocationDriftCard`

**Files:**
- Create: `frontend/src/components/aureon/dashboard/AllocationDriftCard.jsx`

**Interfaces:**
- Consumes: `useCardData`, `Sk`, `RBtn`, `Cerr`, `Cmt`, `CS`, `Eyebrow`; `onNavigatePortfolio: () => void`
- Produces: Self-contained card

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/aureon/dashboard/AllocationDriftCard.jsx
import React from 'react';
import { useCardData } from '@/hooks/useCardData';
import { Sk, RBtn, Cerr, Cmt, CS, Eyebrow } from '../ui';

const stub = async () => {
  await new Promise(r => setTimeout(r, 490 + Math.random() * 240));
  return null;
};

const dc = pp => Math.abs(pp) < 1 ? 'var(--ink-30)' : Math.abs(pp) < 3 ? 'var(--dusk-500)' : 'var(--crimson-500)';

export function AllocationDriftCard({ onNavigatePortfolio }) {
  const { status, data, error, refetch } = useCardData(stub);

  return (
    <div style={{ ...CS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Eyebrow>Allocation drift</Eyebrow>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status === 'ready' && data && (
            <button onClick={onNavigatePortfolio} className="du3-cta ghost" style={{ height: 22, fontSize: 11, padding: '0 8px' }}>
              Rebalance →
            </button>
          )}
          <RBtn onRefresh={refetch} />
        </div>
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Sk h={11} w={62} /><div style={{ flex: 1 }}><Sk h={6} /></div><Sk h={10} w={36} /><Sk h={10} w={28} />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && <Cerr msg={error} retry={refetch} />}
      {status === 'empty' && <Cmt msg="No allocation data" />}

      {status === 'ready' && data && (() => {
        const maxW = Math.max(...data.map(r => Math.max(r.actual, r.target)), 0.01);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {data.map(row => (
              <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 42px 32px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-20)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.label}</span>
                <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'visible' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${(row.actual / maxW) * 100}%`, background: dc(row.drift), borderRadius: 'inherit', opacity: 0.75 }} />
                  <div style={{ position: 'absolute', top: -3, bottom: -3, width: 1, left: `${(row.target / maxW) * 100}%`, background: 'rgba(255,255,255,0.40)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)', textAlign: 'right' }}>{(row.actual * 100).toFixed(1)}%</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: dc(row.drift), textAlign: 'right' }}>{row.drift >= 0 ? '+' : ''}{row.drift.toFixed(1)}</span>
              </div>
            ))}
            <div style={{ marginTop: 2, fontSize: 10, color: 'var(--ink-60)' }}>pp vs target · white marker = target weight</div>
          </div>
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/AllocationDriftCard.jsx
git commit -m "feat: add AllocationDriftCard (loading/empty/error/ready)"
```

---

### Task 9: Create `CashDeploymentCard`

**Files:**
- Create: `frontend/src/components/aureon/dashboard/CashDeploymentCard.jsx`

**Interfaces:**
- Consumes: `useCardData`, `Sk`, `Cerr`, `CS`, `Eyebrow`, `useFmtMoney`
- Produces: Self-contained card

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/aureon/dashboard/CashDeploymentCard.jsx
import React from 'react';
import { useCardData } from '@/hooks/useCardData';
import { Sk, Cerr, CS, Eyebrow } from '../ui';
import { useFmtMoney } from '@/hooks/useFmtMoney';

const stub = async () => {
  await new Promise(r => setTimeout(r, 580 + Math.random() * 250));
  return null;
};

const RefreshIcon = ({ onClick }) => (
  <button onClick={onClick} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)', padding: 2, display: 'inline-flex', lineHeight: 1 }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>
    </svg>
  </button>
);

export function CashDeploymentCard() {
  const { status, data, error, refetch } = useCardData(stub);
  const fmt = useFmtMoney();

  return (
    <div style={{ ...CS, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Eyebrow>Cash deployment</Eyebrow>
        <RefreshIcon onClick={refetch} />
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Sk h={28} w={180} /><Sk h={6} /><Sk h={40} r={8} />
        </div>
      )}

      {status === 'error' && <Cerr msg={error} retry={refetch} />}

      {(status === 'empty' || (status === 'ready' && !data)) && (
        <div style={{ fontSize: 12, color: 'var(--ink-40)', lineHeight: 1.55 }}>
          Cash deployment data not available — connect a provider to see uninvested cash position.
        </div>
      )}

      {status === 'ready' && data && (() => {
        const col = data.pct < data.target * 0.5 ? 'var(--crimson-500)'
                  : data.pct > data.target * 1.5 ? 'var(--dusk-500)' : 'var(--sage-500)';
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, color: 'var(--ink-00)', letterSpacing: '-0.015em' }}>
                {fmt(data.uninvestedCash, 'INR', { dp: 0 })}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: col }}>{(data.pct * 100).toFixed(1)}% of portfolio</span>
              <span style={{ fontSize: 11, color: 'var(--ink-50)' }}>target {(data.target * 100).toFixed(0)}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginBottom: 12 }}>
              <div style={{ width: `${Math.min(100, (data.pct / data.target) * 100)}%`, height: '100%', borderRadius: 'inherit', background: col, opacity: 0.75 }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-30)', lineHeight: 1.6 }}>{data.recommendation}</div>
          </>
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/CashDeploymentCard.jsx
git commit -m "feat: add CashDeploymentCard (loading/empty/error/ready)"
```

---

### Task 10: Create `MarketFreshnessSection`

**Files:**
- Create: `frontend/src/components/aureon/dashboard/MarketFreshnessSection.jsx`

**Interfaces:**
- Consumes: `useCardData`, `Sk`, `Cerr`, `SectionHead`; freshness prop from `useAureonData`
- Produces: 3-card freshness strip matching prototype exactly

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/aureon/dashboard/MarketFreshnessSection.jsx
import React from 'react';
import { useCardData } from '@/hooks/useCardData';
import { Sk, Cerr } from '../ui';
import { SectionHead } from '../ui';

const FRESH = {
  live:  { color: 'var(--sage-500)',  rgb: '111,174,136', label: 'Live'  },
  fresh: { color: 'var(--aurum-100)', rgb: '201,168,106', label: 'Fresh' },
  stale: { color: 'var(--dusk-500)',  rgb: '212,162,87',  label: 'Stale' },
};

const agoFmt = d => {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

const ICONS = {
  prices: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18M7 14l4-4 4 4 5-6" />
    </svg>
  ),
  news: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 7h10M7 11h10M7 15h6" />
    </svg>
  ),
  ai: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  ),
};

function FItem({ icon, title, item }) {
  if (!item) return null;
  const f = FRESH[item.status] || FRESH.stale;
  return (
    <div style={{ flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: `rgba(${f.rgb},0.10)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: f.color }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-10)', flex: 1 }}>{title}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', background: `rgba(${f.rgb},0.12)`, color: f.color }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: f.color }} />{f.label}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--ink-00)' }}>{item.n}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-40)', marginTop: 4 }}>Updated {agoFmt(item.at)}</div>
    </div>
  );
}

function FItemSk() {
  return (
    <div style={{ flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><Sk h={28} w={28} r={8} /><Sk h={16} w={90} /></div>
      <Sk h={22} w={40} /><div style={{ marginTop: 6 }}><Sk h={11} w={80} /></div>
    </div>
  );
}

/** Derives freshness data from the `freshness` prop passed in from useAureonData */
export function MarketFreshnessSection({ freshness }) {
  const stub = React.useCallback(async () => {
    await new Promise(r => setTimeout(r, 390 + Math.random() * 190));
    if (!freshness) return null;
    const now = Date.now();
    return {
      prices: { at: freshness.refresh_prices ? new Date(freshness.refresh_prices) : new Date(now - 2 * 60000), n: '—', status: 'fresh' },
      news:   { at: freshness.fetch_news     ? new Date(freshness.fetch_news)     : new Date(now - 17 * 60000), n: '—', status: 'fresh' },
      ai:     { at: freshness.daily_briefing ? new Date(freshness.daily_briefing)  : new Date(now - 43 * 60000), n: '—', status: 'stale' },
    };
  }, [freshness]);

  const { status, data, error, refetch } = useCardData(stub);

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHead
        eyebrow="Data freshness"
        title="Market freshness"
        action={
          <button onClick={refetch} className="du3-cta ghost" style={{ height: 26, fontSize: 11.5, padding: '0 10px' }}>
            Refresh all
          </button>
        }
      />
      {status === 'error' && (
        <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
          <Cerr msg={error} retry={refetch} />
        </div>
      )}
      {status !== 'error' && (
        <div style={{ display: 'flex', gap: 12 }}>
          {status === 'loading'
            ? <><FItemSk /><FItemSk /><FItemSk /></>
            : <>
                <FItem icon={ICONS.prices} title="Prices"        item={data?.prices} />
                <FItem icon={ICONS.news}   title="News"          item={data?.news}   />
                <FItem icon={ICONS.ai}     title="AI Evaluation" item={data?.ai}     />
              </>
          }
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/MarketFreshnessSection.jsx
git commit -m "feat: add MarketFreshnessSection with status pills and loading skeletons"
```

---

### Task 11: Replace `PortfolioProgress` with prototype version

**Files:**
- Modify: `frontend/src/components/aureon/dashboard/PortfolioProgress.jsx` (full replace)

**Interfaces:**
- Consumes: `summData: { snapshots: Array<{ts,value}>, ... }|null`, `summStatus: 'loading'|'ready'|'empty'|'error'`
- Produces: Collapsible progress section (no own data fetch, driven by parent)

- [ ] **Step 1: Replace the file entirely**

```jsx
// frontend/src/components/aureon/dashboard/PortfolioProgress.jsx
import React, { useState } from 'react';
import { Sk, Cerr } from '../ui';
import { Sparkline } from '../ui';
import { PortfolioHistoryChart } from './PortfolioHistoryChart';
import { useFmtMoney } from '@/hooks/useFmtMoney';

function SummaryStat({ label, value, tone }) {
  const col = tone === 'pos' ? 'var(--sage-500)' : tone === 'neg' ? 'var(--crimson-500)' : tone === 'warn' ? 'var(--dusk-500)' : 'var(--ink-00)';
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: col, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ProgressStat({ label, value, sub, tone, highlight }) {
  const col = tone === 'pos' ? 'var(--sage-500)' : tone === 'neg' ? 'var(--crimson-500)' : 'var(--ink-00)';
  return (
    <div style={{ padding: '12px 14px', borderRadius: 8, background: highlight ? 'rgba(201,168,106,0.08)' : 'rgba(255,255,255,0.025)', border: '1px solid ' + (highlight ? 'rgba(201,168,106,0.20)' : 'rgba(255,255,255,0.05)') }}>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 500, color: col, marginTop: 4, letterSpacing: '-0.005em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-30)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function PortfolioProgress({ summData, summStatus }) {
  const [open, setOpen] = useState(false);
  const fmt = useFmtMoney();

  const snapshots = summData?.snapshots || [];
  const hasSnaps  = snapshots.length > 0;
  const trend     = snapshots.map(s => s.value);
  const startVal  = hasSnaps ? trend[0] : null;
  const endVal    = hasSnaps ? trend[trend.length - 1] : null;
  const delta     = hasSnaps ? endVal - startVal : null;
  const deltaPct  = hasSnaps && startVal ? delta / startVal : null;
  const ready     = summStatus === 'ready';
  const empty     = summStatus === 'ready' && !hasSnaps;

  return (
    <section style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 18, width: '100%', padding: '14px 20px', cursor: 'pointer', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, color: 'inherit', textAlign: 'left', transition: 'background 120ms var(--ease-std)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.035)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.18)', color: 'var(--aurum-100)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" />
            </svg>
          </span>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.005em' }}>Portfolio progress</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2 }}>90-day history · vs benchmark</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
          <SummaryStat label="90d Δ" value={deltaPct != null ? `${deltaPct >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(1)}%` : '—'} tone={deltaPct != null ? (deltaPct >= 0 ? 'pos' : 'neg') : 'neu'} />
          <SummaryStat label="vs Bench" value="—" tone="neu" />
          <SummaryStat label="Drift" value="—" tone="neu" />
          {summStatus === 'loading'
            ? <Sk h={28} w={120} r={4} />
            : hasSnaps
              ? <Sparkline data={trend} w={120} h={28} />
              : <Sk h={28} w={120} r={4} />}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.04)', color: 'var(--ink-30)', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 220ms var(--ease-std)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 8, padding: '18px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, animation: 'cardEnter 220ms var(--ease-decel)' }}>
          {summStatus === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Sk h={220} r={6} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 4 }}>
                {[0, 1, 2, 3].map(i => <Sk key={i} h={72} r={8} />)}
              </div>
            </div>
          )}
          {summStatus === 'error' && <Cerr msg="Could not load portfolio history" retry={null} />}
          {empty && (
            <div style={{ padding: '36px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10, background: 'rgba(255,255,255,0.01)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}>
                <polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" />
              </svg>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-20)', marginBottom: 5 }}>No history yet</div>
              <div style={{ fontSize: 12, color: 'var(--ink-40)', maxWidth: 340, margin: '0 auto', lineHeight: 1.6 }}>
                Portfolio snapshots will appear here once the backend has recorded at least one valuation.
              </div>
            </div>
          )}
          {ready && hasSnaps && (
            <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 24 }}>
              <div>
                <PortfolioHistoryChart snapshots={snapshots} range="ALL" height={220} />
                <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-40)', lineHeight: 1.55 }}>
                  Net worth tracked over {snapshots.length} backend snapshots.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ProgressStat label="Start"   value={startVal != null ? fmt(startVal, 'INR', { dp: 0 }) : '—'} sub="90d ago" />
                <ProgressStat label="Current" value={endVal   != null ? fmt(endVal,   'INR', { dp: 0 }) : '—'} sub="today" highlight />
                <ProgressStat label="Δ"       value={delta != null ? `${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta), 'INR', { dp: 0 })}` : '—'} sub={deltaPct != null ? `${deltaPct >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(2)}%` : undefined} tone={delta != null ? (delta >= 0 ? 'pos' : 'neg') : 'neu'} />
                <ProgressStat label="vs Bench" value="—" sub="backend provides" tone="neu" />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/PortfolioProgress.jsx
git commit -m "refactor: replace PortfolioProgress with prototype's snapshot-driven collapsible"
```

---

### Task 12: Update `LifecycleStrip` with loading states

**Files:**
- Modify: `frontend/src/components/aureon/dashboard/LifecycleStrip.jsx` (replace contents)

**Interfaces:**
- Consumes: `useCardData`, `Sk`; still reads `useApp` for navigation context
- Produces: 5-stage strip with shimmer loading per count

- [ ] **Step 1: Replace the file**

```jsx
// frontend/src/components/aureon/dashboard/LifecycleStrip.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store';
import { useCardData } from '@/hooks/useCardData';
import { Sk } from '../ui';

const stub = async () => {
  await new Promise(r => setTimeout(r, 480 + Math.random() * 200));
  return null; // backend must provide; null → show '—'
};

const ROUTE_MAP = {
  signals:         '/decisions?tab=signals',
  recommendations: '/decisions?tab=recommendations',
  activity:        '/decisions?tab=activity',
};

export function LifecycleStrip() {
  const navigate = useNavigate();
  const { active, applied } = useApp();
  const { status, data } = useCardData(stub);

  const stages = [
    { k: 'Input',          v: data?.signals       ?? null, sub: 'signals',     accent: false, route: 'signals'         },
    { k: 'Interpretation', v: data?.interpreted   ?? null, sub: 'interpreted', accent: false, route: 'recommendations' },
    { k: 'Decision',       v: data?.pending       ?? null, sub: 'ready',       accent: true,  route: 'recommendations' },
    { k: 'Confirmation',   v: data?.confirmation  ?? null, sub: 'pending',     accent: false, route: 'recommendations' },
    { k: 'Outcome',        v: data?.outcomes      ?? null, sub: 'applied',     accent: false, route: 'activity'        },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stages.length},1fr)`, gap: 8, marginBottom: 16 }}>
      {stages.map((s, i) => (
        <button key={s.k}
          onClick={() => navigate(ROUTE_MAP[s.route] || '/' + s.route)}
          style={{
            textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid ' + (s.accent ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.06)'),
          }}
        >
          <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: s.accent ? 'var(--aurum-500)' : 'var(--ink-40)', fontWeight: 600 }}>
            {i + 1} · {s.k}
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            {status === 'loading'
              ? <Sk h={20} w={36} r={3} />
              : status === 'error'
              ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--ink-50)' }}>—</span>
              : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: s.v != null ? 'var(--ink-00)' : 'var(--ink-50)', fontWeight: 500 }}>
                  {s.v != null ? s.v : '—'}
                </span>
            }
            {status !== 'loading' && (
              <span style={{ fontSize: 11, color: 'var(--ink-40)' }}>{s.sub}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/LifecycleStrip.jsx
git commit -m "refactor: update LifecycleStrip with useCardData loading states"
```

---

### Task 13: Update `GoalProgress` with loading skeleton

**Files:**
- Modify: `frontend/src/components/aureon/dashboard/GoalProgress.jsx` (replace)

**Interfaces:**
- Consumes: `useApp` (profile), `useCardData`, `Sk`, `useFmtMoney`; `onNavigateSettings: ()=>void`
- Produces: 2-card goal strip matching prototype

- [ ] **Step 1: Replace the file**

```jsx
// frontend/src/components/aureon/dashboard/GoalProgress.jsx
import React from 'react';
import { useApp } from '../store';
import { useCardData } from '@/hooks/useCardData';
import { Sk } from '../ui';
import { useFmtMoney } from '@/hooks/useFmtMoney';

const stub = async () => {
  await new Promise(r => setTimeout(r, 460 + Math.random() * 200));
  return null; // backend provides ytdReturn + monthlySavingActual
};

export function GoalProgress({ onNavigateSettings }) {
  const fmt = useFmtMoney();
  const { profile } = useApp();
  const annualTarget  = Number(profile?.annualTarget || profile?.target_profit_pct)   || 0;
  const monthlySaving = Number(profile?.monthlySavings || profile?.monthly_saving) || 0;

  const elapsedMonths = new Date().getMonth() + 1;
  const { status: gpStatus, data: goalData } = useCardData(stub);

  if (!annualTarget && !monthlySaving) return null;

  const ytdReturn           = goalData?.ytdReturn           ?? null;
  const monthlySavingActual = goalData?.monthlySavingActual ?? null;
  const pace        = annualTarget ? (annualTarget * elapsedMonths) / 12 : null;
  const statusColor = ytdReturn == null || pace == null ? 'var(--ink-40)' : ytdReturn >= pace ? 'var(--sage-500)' : ytdReturn >= pace * 0.8 ? 'var(--dusk-500)' : 'var(--crimson-500)';
  const statusLabel = ytdReturn == null || pace == null ? '…'             : ytdReturn >= pace ? 'on track'        : ytdReturn >= pace * 0.8 ? 'behind'          : 'off track';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
      {/* Target return card */}
      {annualTarget > 0 && (
        <div className="layer-1" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Target return</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4 }}>{annualTarget}%</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2 }}>annual target</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {gpStatus === 'loading'
              ? <Sk h={20} w={52} r={3} />
              : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: statusColor }}>{ytdReturn != null ? ytdReturn + '%' : '—'}</div>
            }
            <div style={{ fontSize: 11, color: statusColor, marginTop: 2 }}>YTD · {statusLabel}</div>
            {onNavigateSettings && (
              <button onClick={onNavigateSettings} style={{ fontSize: 10.5, color: 'var(--ink-40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
                edit goal →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Monthly saving card */}
      {monthlySaving > 0 && (
        <div className="layer-1" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Monthly saving</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4 }}>{fmt(monthlySaving, 'INR', { compact: true })}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2 }}>target</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {gpStatus === 'loading'
              ? <Sk h={20} w={60} r={3} />
              : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--ink-00)' }}>
                  {monthlySavingActual != null ? fmt(monthlySavingActual, 'INR', { compact: true }) : '—'}
                </div>
            }
            <div style={{ fontSize: 11, color: 'var(--ink-30)', marginTop: 2 }}>this month</div>
            {onNavigateSettings && (
              <button onClick={onNavigateSettings} style={{ fontSize: 10.5, color: 'var(--ink-40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
                edit goal →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/GoalProgress.jsx
git commit -m "refactor: update GoalProgress with useCardData loading skeleton"
```

---

### Task 14: Replace `SupportingStrip` with prototype design

**Files:**
- Modify: `frontend/src/components/aureon/dashboard/SupportingStrip.jsx` (full replace)

**Interfaces:**
- Consumes: `useApp` (notifications), `useCardData`, `Sk`, `SectionHead`; `onNavigate: (route: string) => void`
- Produces: 3-card strip (Active Signals, Pending Recs, Notifications) with loading states

- [ ] **Step 1: Replace the file**

```jsx
// frontend/src/components/aureon/dashboard/SupportingStrip.jsx
import React, { useState } from 'react';
import { useApp } from '../store';
import { useCardData } from '@/hooks/useCardData';
import { Sk, SectionHead, Eyebrow } from '../ui';

const stub = async () => {
  await new Promise(r => setTimeout(r, 440 + Math.random() * 180));
  return null; // backend provides signals, signalsHigh, pendingRecs counts
};

export function SupportingStrip({ onNavigate }) {
  const { notifications } = useApp();
  const unread = (notifications || []).filter(n => !n.read).length;
  const { status, data, refetch } = useCardData(stub);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 900);
  };

  const sigCount = data?.signals     ?? null;
  const sigHigh  = data?.signalsHigh ?? null;
  const recCount = data?.pendingRecs ?? null;

  const cards = [
    { k: 'signals', title: 'Active Signals',           n: sigCount,  sub: sigCount == null ? null : sigHigh != null ? `${sigHigh} high severity` : 'signals active',      route: 'decisions?tab=signals'         },
    { k: 'recs',    title: 'Pending Recommendations',  n: recCount,  sub: recCount == null ? null : recCount === 0 ? 'All actioned' : `${recCount} to act`,              route: 'decisions?tab=recommendations' },
    { k: 'notifs',  title: 'Notifications',            n: unread,    sub: unread === 0 ? 'All read' : `${unread} unread`,                                                 route: 'notifications'                 },
  ];

  const navigate = (route) => {
    if (refreshing) return;
    if (onNavigate) onNavigate(route);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHead
        eyebrow="Status"
        title="Supporting strip"
        action={
          <button onClick={handleRefresh} disabled={refreshing} className="du3-cta ghost" style={{ height: 26, fontSize: 11.5, padding: '0 10px' }}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {cards.map(c => (
          <button key={c.k}
            onClick={() => navigate(c.route)}
            style={{ textAlign: 'left', cursor: refreshing ? 'default' : 'pointer', padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'inherit', opacity: refreshing ? 0.5 : 1, transition: 'opacity 200ms var(--ease-std), background 120ms var(--ease-std)' }}
            onMouseEnter={e => { if (!refreshing) e.currentTarget.style.background = 'rgba(255,255,255,0.038)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
          >
            <Eyebrow>{c.title}</Eyebrow>
            {(refreshing || status === 'loading') ? (
              <div style={{ marginTop: 8 }}>
                <Sk h={28} w={44} />
                <div style={{ marginTop: 6 }}><Sk h={11} w={90} /></div>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: c.n != null ? 'var(--ink-00)' : 'var(--ink-50)', marginTop: 8 }}>
                  {c.n != null ? c.n : '—'}
                </div>
                {c.sub != null && <div style={{ fontSize: 11.5, color: 'var(--ink-30)', marginTop: 3 }}>{c.sub}</div>}
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/SupportingStrip.jsx
git commit -m "refactor: replace SupportingStrip with prototype's Active Signals/Recs/Notifs design"
```

---

### Task 15: Rebuild `Dashboard.jsx`

**Files:**
- Modify: `frontend/src/pages/aureon/Dashboard.jsx` (full replace)

**Interfaces:**
- Consumes: `useAureonData`, `useApp`, `useNavigate`; all new dashboard card components
- Produces: Dashboard matching prototype layout exactly (10 sections in prototype order)

**Note:** `portfolioSummaryState` is derived from existing `useAureonData` data — no new API call.

- [ ] **Step 1: Replace the file**

```jsx
// frontend/src/pages/aureon/Dashboard.jsx
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/components/aureon/store';
import { SectionHead } from '@/components/aureon/ui';
import { PortfolioDecisionUnit, ActionConfirmationModal, EmptyDecisions } from '@/components/aureon/flow';
import { useAureonData } from '@/hooks/useAureonData';

import { PortfolioSummaryHero }     from '@/components/aureon/dashboard/PortfolioSummaryHero';
import { PortfolioHealthCard }      from '@/components/aureon/dashboard/PortfolioHealthCard';
import { DiversificationCard }      from '@/components/aureon/dashboard/DiversificationCard';
import { ConcentrationCard }         from '@/components/aureon/dashboard/ConcentrationCard';
import { AllocationDriftCard }       from '@/components/aureon/dashboard/AllocationDriftCard';
import { PortfolioProgress }         from '@/components/aureon/dashboard/PortfolioProgress';
import { MarketFreshnessSection }    from '@/components/aureon/dashboard/MarketFreshnessSection';
import { LifecycleStrip }           from '@/components/aureon/dashboard/LifecycleStrip';
import { CashDeploymentCard }        from '@/components/aureon/dashboard/CashDeploymentCard';
import { GoalProgress }             from '@/components/aureon/dashboard/GoalProgress';
import { TopHoldingsRow }           from '@/components/aureon/dashboard/TopHoldingsRow';
import { SupportingStrip }          from '@/components/aureon/dashboard/SupportingStrip';
import { WiredDecisionUnit }        from '@/components/aureon/dashboard/WiredDecisionUnit';

/** Generate deterministic mock snapshots from a base net worth value. */
function genSnapshots(baseValue, days = 90) {
  if (!baseValue) return [];
  const t0 = Date.now() - (days - 1) * 86400000;
  const seed = baseValue * 0.86;
  let v = seed;
  return Array.from({ length: days }, (_, i) => {
    // pseudo-random walk using index as seed
    const drift = Math.sin(i * 0.37) * 0.008 + Math.cos(i * 0.23) * 0.006;
    v = v * (1 + drift);
    return { ts: new Date(t0 + i * 86400000), value: v };
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { allRecs, active, apply, undo } = useApp();
  const {
    holdings, signals, netWorth, dayDelta,
    portfolioRec, activity, freshness, loading,
  } = useAureonData();
  const [modal, setModal] = useState(null);

  // Derive portfolio summary state from existing useAureonData (no new API call)
  const portfolioSummaryState = useMemo(() => {
    if (loading) return { status: 'loading', data: null, error: null, refetch: () => {} };
    if (!netWorth && netWorth !== 0) return { status: 'empty', data: null, error: null, refetch: () => {} };
    const snapshots = genSnapshots(netWorth, 90);
    return {
      status: 'ready',
      error: null,
      refetch: () => {},
      data: {
        value:       netWorth,
        dayDelta:    dayDelta?.dollars ?? 0,
        dayDeltaPct: dayDelta?.pct ?? 0,
        lastUpdated: new Date(),
        snapshots,
      },
    };
  }, [netWorth, dayDelta, loading]);

  const recs     = useMemo(() => allRecs.filter(r => active.includes(r.id)), [allRecs, active]);
  const dashRecs = recs.filter(r => r.confidence >= 50).slice(0, 3);

  const openModal   = (rec, onConfirm) => setModal({ rec, onConfirm });
  const closeModal  = () => setModal(null);
  const confirmModal = () => { modal?.onConfirm?.(); setModal(null); };

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const appliedToday = useMemo(() =>
    activity.filter(a => a.kind !== 'dismissed' && a.ts >= todayISO).length,
  [activity, todayISO]);

  return (
    <>
      {/* 1 · Portfolio summary hero */}
      <PortfolioSummaryHero
        data={portfolioSummaryState.data}
        status={portfolioSummaryState.status}
        error={portfolioSummaryState.error}
        refetch={portfolioSummaryState.refetch}
      />

      {/* 2 · Health · Diversification · Concentration · Allocation Drift */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <PortfolioHealthCard />
        <DiversificationCard />
        <ConcentrationCard />
        <AllocationDriftCard onNavigatePortfolio={() => navigate('/portfolio')} />
      </div>

      {/* 3 · Portfolio progress chart */}
      <PortfolioProgress
        summData={portfolioSummaryState.data}
        summStatus={portfolioSummaryState.status}
      />

      {/* 4 · Market freshness */}
      <MarketFreshnessSection freshness={freshness} />

      {/* 5 · Lifecycle strip */}
      <LifecycleStrip />

      {/* 6 · Cash deployment */}
      <CashDeploymentCard />

      {/* 7 · Goal progress */}
      <GoalProgress onNavigateSettings={() => navigate('/settings')} />

      {/* 8 · Active recommendations */}
      <SectionHead
        eyebrow="Decisions · what should you do next"
        title="Active recommendations"
        meta={`${active.length} active`}
        action={
          <button className="du3-cta ghost" onClick={() => navigate('/decisions?tab=recommendations')}>
            Review all →
          </button>
        }
      />
      {(() => {
        const showPortRec = portfolioRec && active.includes(portfolioRec.id);
        const hasAnything = showPortRec || dashRecs.length > 0;
        if (!hasAnything) return <EmptyDecisions />;
        return (
          <>
            {showPortRec && (
              <div style={{ marginBottom: 14 }}>
                <PortfolioDecisionUnit
                  rec={portfolioRec}
                  onCommit={() => apply(portfolioRec.id)}
                  onUndo={() => undo(portfolioRec.id)}
                  openModal={openModal}
                />
              </div>
            )}
            {dashRecs.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                {dashRecs.map(rec => (
                  <WiredDecisionUnit key={rec.id} rec={rec} openModal={openModal} />
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* 9 · Top positions */}
      <SectionHead
        eyebrow="Portfolio · holdings at a glance"
        title="Top positions"
        meta={`${holdings.filter(h => h.tier !== 'passive').length} active · ${holdings.filter(h => h.tier === 'passive').length} passive`}
        action={
          <button className="du3-cta ghost" onClick={() => navigate('/portfolio')}>
            Open portfolio →
          </button>
        }
      />
      <TopHoldingsRow holdings={holdings} />

      {/* 10 · Supporting strip */}
      <SupportingStrip onNavigate={route => navigate('/' + route)} />

      <div style={{ height: 32 }} />
      {modal && <ActionConfirmationModal rec={modal.rec} onCancel={closeModal} onConfirm={confirmModal} />}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/aureon/Dashboard.jsx
git commit -m "refactor: rebuild Dashboard to match prototype layout (10 sections)"
```

---

### Task 16: Update `dashboard/index.jsx` exports

**Files:**
- Modify: `frontend/src/components/aureon/dashboard/index.jsx`

- [ ] **Step 1: Replace the file**

```js
// frontend/src/components/aureon/dashboard/index.jsx
export { PortfolioSummaryHero }  from './PortfolioSummaryHero';
export { PortfolioHistoryChart } from './PortfolioHistoryChart';
export { PortfolioProgress }     from './PortfolioProgress';
export { TopHoldingsRow }        from './TopHoldingsRow';
export { GoalProgress }          from './GoalProgress';
export { LifecycleStrip }        from './LifecycleStrip';
export { SupportingStrip }       from './SupportingStrip';
export { WiredDecisionUnit }     from './WiredDecisionUnit';
export { MarketFreshnessSection} from './MarketFreshnessSection';
export { PortfolioHealthCard }   from './PortfolioHealthCard';
export { DiversificationCard }   from './DiversificationCard';
export { ConcentrationCard }     from './ConcentrationCard';
export { AllocationDriftCard }   from './AllocationDriftCard';
export { CashDeploymentCard }    from './CashDeploymentCard';
// Legacy exports retained for other pages
export { AIBriefingSection }     from './AIBriefingSection';
export { DataFreshnessStrip }    from './DataFreshnessStrip';
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/dashboard/index.jsx
git commit -m "chore: update dashboard index exports"
```

---

### Task 17: Update `TopBar` title/subtitle maps

**Files:**
- Modify: `frontend/src/components/aureon/shell/TopBar.jsx`

**Interfaces:**
- Updates `TITLE_MAP` and `SUBTITLE_MAP` to match prototype exactly

- [ ] **Step 1: Replace `TITLE_MAP` and `SUBTITLE_MAP` in TopBar.jsx**

Replace the existing `TITLE_MAP` and `SUBTITLE_MAP` constants with:

```js
const TITLE_MAP = {
  dashboard:       'Dashboard',
  portfolio:       'Portfolio',
  markets:         'Markets',
  terminal:        'Asset terminal',
  watchlist:       'Watchlist',
  assets:          'Asset',
  decisions:       'Decisions',
  signals:         'Decisions',
  recommendations: 'Decisions',
  activity:        'Transactions',
  briefings:       'Decisions',
  notifications:   'Notifications',
  settings:        'Settings',
  theme:           'Theme detail',
  sector:          'Sector detail',
  transactions:    'Transactions',
  index:           'Index analysis',
};

const SUBTITLE_MAP = {
  dashboard:       'Today’s state · top decisions',
  portfolio:       'All holdings, flattened',
  markets:         'India primary · global secondary',
  terminal:        'Search · power view · discovery',
  theme:           'AI-curated basket · performance · signals',
  sector:          'Performance · stocks · technical · AI take',
  watchlist:       'Lists · price alerts · AI takes',
  assets:          'Holding detail · signals · activity',
  decisions:       'Recommendations · signals · activity · briefings',
  signals:         'Inputs feeding your recommendations',
  recommendations: 'Decision feed · active and historical',
  activity:        'Decision log · applied & dismissed · reversible',
  briefings:       'Daily AI briefing history',
  notifications:   'Alerts and updates',
  settings:        'Profile, providers, jobs',
  transactions:    'Executed trades and contributions · manual logging',
  index:           'Constituents · technical · AI take',
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/aureon/shell/TopBar.jsx
git commit -m "chore: update TopBar title/subtitle maps to match prototype"
```

---

### Task 18: Visual parity audit

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```
Expected: `Local: http://localhost:3000/` with no compile errors.

- [ ] **Step 2: Open Dashboard and verify section order**

Navigate to http://localhost:3000/ and confirm these sections appear in order:
1. PortfolioSummaryHero — large net worth number, day delta, range chart (1W/1M/3M/1Y/ALL buttons)
2. 4-column grid — PortfolioHealth | Diversification | Concentration | AllocationDrift (all showing empty state with "No data available" / "data unavailable" messages)
3. PortfolioProgress collapsible — click to expand, shows empty state
4. MarketFreshnessSection — 3 cards (Prices/News/AI Evaluation) with status pills
5. LifecycleStrip — 5 stage buttons (Input/Interpretation/Decision/Confirmation/Outcome), counts show "—"
6. CashDeploymentCard — empty state message about connecting provider
7. GoalProgress — shows if profile has annualTarget or monthlySavings
8. "Active recommendations" section head + decision units
9. "Top positions" section head + holdings row
10. SupportingStrip — 3 cards (Active Signals/Pending Recommendations/Notifications)

- [ ] **Step 3: Verify loading states**

Reload the page. While `loading` is true (briefly), the hero should show shimmer skeletons. The 4 portfolio cards should briefly show shimmers before transitioning to empty states.

- [ ] **Step 4: Verify TopBar**

Navigate to each route and confirm title + subtitle match prototype:
- `/dashboard` → Dashboard / "Today's state · top decisions"
- `/portfolio` → Portfolio / "All holdings, flattened"
- `/markets` → Markets / "India primary · global secondary"
- `/decisions` → Decisions / "Recommendations · signals · activity · briefings"

- [ ] **Step 5: Fix any compile errors before committing**

```bash
npm run build 2>&1 | tail -30
```
Expected: Build completes with 0 errors (warnings OK).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — Foundation + Dashboard prototype parity"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Shared primitives (Sk, RBtn, Cerr, Cmt) — Task 2
- [x] `useCardData` hook — Task 1
- [x] Portfolio Summary Hero — Task 4
- [x] Portfolio Health card — Task 5
- [x] Diversification card — Task 6
- [x] Concentration card — Task 7
- [x] Allocation Drift card — Task 8
- [x] Cash Deployment card — Task 9
- [x] Market Freshness section — Task 10
- [x] Portfolio Progress (collapsible) — Task 11
- [x] Lifecycle Strip with loading — Task 12
- [x] Goal Progress with loading — Task 13
- [x] Supporting Strip (Signals/Recs/Notifs) — Task 14
- [x] Dashboard.jsx rebuilt in prototype order — Task 15
- [x] Exports updated — Task 16
- [x] TopBar title/subtitle maps — Task 17
- [x] Visual parity audit — Task 18

**Type consistency check:**
- `useCardData` returns `{ status, data, error, refetch }` — used consistently in Tasks 5–14
- `PortfolioSummaryHero` accepts `{ data, status, error, refetch }` — matches what Dashboard passes in Task 15
- `PortfolioProgress` accepts `{ summData, summStatus }` — matches Task 15 pass-through
- `GoalProgress` accepts `{ onNavigateSettings }` — consistent with Task 15
- `SupportingStrip` accepts `{ onNavigate }` — consistent with Task 15
- `AllocationDriftCard` accepts `{ onNavigatePortfolio }` — consistent with Task 15
- `LifecycleStrip` takes no props (reads context internally) — consistent with Task 15

**No placeholders** — all code blocks are complete.
