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
