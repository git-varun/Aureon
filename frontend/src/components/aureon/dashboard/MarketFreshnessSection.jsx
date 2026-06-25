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
