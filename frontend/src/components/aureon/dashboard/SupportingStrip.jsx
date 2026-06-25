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
