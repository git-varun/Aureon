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
