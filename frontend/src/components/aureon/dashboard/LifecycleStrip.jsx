// frontend/src/components/aureon/dashboard/LifecycleStrip.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store';
import { useAureonData } from '@/hooks/useAureonData';
import { Sk } from '../ui';

const ROUTE_MAP = {
  signals:         '/decisions?tab=signals',
  recommendations: '/decisions?tab=recommendations',
  activity:        '/decisions?tab=activity',
};

export function LifecycleStrip() {
  const navigate = useNavigate();
  const { allRecs, active, applied, hydrated } = useApp();
  const { signals, loading } = useAureonData();

  const status = (loading || !hydrated) ? 'loading' : 'ready';
  const pendingConfirmation = applied.filter(a => a.pending).length;

  const stages = [
    { k: 'Input',          v: signals.length,           sub: 'signals',     accent: false, route: 'signals'         },
    { k: 'Interpretation', v: allRecs.length,            sub: 'interpreted', accent: false, route: 'recommendations' },
    { k: 'Decision',       v: active.length,             sub: 'ready',       accent: true,  route: 'recommendations' },
    { k: 'Confirmation',   v: pendingConfirmation,       sub: 'pending',     accent: false, route: 'recommendations' },
    { k: 'Outcome',        v: applied.length,            sub: 'applied',     accent: false, route: 'activity'        },
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
              : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--ink-00)', fontWeight: 500 }}>
                  {s.v}
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
