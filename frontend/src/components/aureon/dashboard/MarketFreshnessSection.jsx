// frontend/src/components/aureon/dashboard/MarketFreshnessSection.jsx
import React from 'react';
import { SectionHead } from '../ui';

const FRESH = {
  live:    { color: 'var(--sage-500)',  rgb: '111,174,136', label: 'Live'    },
  fresh:   { color: 'var(--aurum-100)', rgb: '201,168,106', label: 'Fresh'   },
  stale:   { color: 'var(--dusk-500)',  rgb: '212,162,87',  label: 'Stale'   },
  unknown: { color: 'var(--ink-40)',    rgb: '111,116,128', label: 'Unknown' },
};

// Per-tile live/fresh cutoffs (ms). Above `fresh` = stale. Each is floored on
// the tile's actual backing cadence, not a generic guess:
//  - prices: same live/fresh bands the backend applies per-quote in
//            resolve_position_price (app/modules/portfolio/services/portfolio.py,
//            Fix L) — this tile shows the oldest real market quote among the
//            portfolio's positions (Fix M), not portfolio-snapshot regeneration
//            recency, so the two must stay in sync intentionally
//  - news:   fetch_news's real Celery beat interval — "news-refresh" runs
//            every 4h (app/workers/celery_app.py)
//  - ai:     daily_briefing has no beat_schedule entry at all (manual-trigger
//            only, same root cause as the broker-sync backlog item) — bands
//            reflect the documented daily intent, widened since there's no
//            automated run to hold it to a tighter window
const THRESHOLDS = {
  prices: { live: 5 * 60_000, fresh: 15 * 60_000 },
  news:   { live: 4 * 3_600_000, fresh: 8 * 3_600_000 },
  ai:     { live: 24 * 3_600_000, fresh: 72 * 3_600_000 },
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

// Never returns null — a missing/invalid timestamp is a distinct 'unknown'
// state (job never completed successfully), not the same as 'stale' (ran
// before, now past threshold), and must not make the tile disappear.
const deriveItem = (isoStr, thresholds, n = '—') => {
  if (!isoStr) return { at: null, n: '—', status: 'unknown' };
  const at = new Date(isoStr);
  if (isNaN(at.getTime())) return { at: null, n: '—', status: 'unknown' };
  const ageMs = Date.now() - at.getTime();
  const status = ageMs < thresholds.live ? 'live' : ageMs < thresholds.fresh ? 'fresh' : 'stale';
  return { at, n, status };
};

/** Derives freshness data from the `freshness` prop passed in from useAureonData */
export function MarketFreshnessSection({ freshness }) {
  if (!freshness) return null;

  const data = {
    prices: deriveItem(freshness.refresh_prices, THRESHOLDS.prices, freshness.refresh_prices_count ?? '—'),
    news: deriveItem(freshness.fetch_news, THRESHOLDS.news),
    ai: deriveItem(freshness.daily_briefing, THRESHOLDS.ai),
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHead eyebrow="Data freshness" title="Market freshness" />
      <div style={{ display: 'flex', gap: 12 }}>
        <FItem icon={ICONS.prices} title="Prices" item={data.prices} />
        <FItem icon={ICONS.news} title="News" item={data.news} />
        <FItem icon={ICONS.ai} title="AI Evaluation" item={data.ai} />
      </div>
    </div>
  );
}
