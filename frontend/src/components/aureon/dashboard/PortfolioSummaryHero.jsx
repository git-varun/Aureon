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
