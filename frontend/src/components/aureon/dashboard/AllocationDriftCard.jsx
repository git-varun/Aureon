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
