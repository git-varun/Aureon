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
          {/* TODO(feature): no benchmark-comparison or drift-vs-target data source exists yet — these are permanent placeholders, not loading states. See frontend audit finding "PortfolioProgress placeholder stats". */}
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
                {/* TODO(feature): no benchmark-comparison data source exists yet — permanent placeholder, not a loading state. */}
                <ProgressStat label="vs Bench" value="—" sub="backend provides" tone="neu" />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
