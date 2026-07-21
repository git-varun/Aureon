import React from 'react';

// Same live/fresh bands as MarketFreshnessSection (dashboard), plus a
// snapshot band: the portfolio snapshot cache regenerates on-demand
// (see PortfolioService.generate_portfolio_snapshot), so its own updated_at
// reflects "how long since a valuation was last computed" — a distinct
// signal from raw quote freshness.
const THRESHOLDS = {
  prices:   { live: 5 * 60_000, fresh: 15 * 60_000 },
  snapshot: { live: 15 * 60_000, fresh: 60 * 60_000 },
  ai:       { live: 24 * 3_600_000, fresh: 72 * 3_600_000 },
};

const agoFmt = d => {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

// Missing/invalid timestamp is a distinct 'unknown' state, not 'stale'.
const deriveItem = (isoStr, thresholds) => {
  if (!isoStr) return { ts: '—', ok: false };
  const at = new Date(isoStr);
  if (isNaN(at.getTime())) return { ts: '—', ok: false };
  const ageMs = Date.now() - at.getTime();
  return { ts: agoFmt(isoStr), ok: ageMs < thresholds.fresh };
};

// AI eval needs a third state beyond fresh/stale: the last run can have
// genuinely FAILED (all AI models exhausted), which is a different, more
// severe signal than "just hasn't run in a while" and must render distinctly
// (error, not dusk-yellow) — see BUGS_AND_REDESIGN_AUDIT.md Part A #4.
const deriveAiEvalItem = (isoStr, status, thresholds) => {
  if (status === 'FAILED') return { ts: isoStr ? agoFmt(isoStr) : '—', ok: false, failed: true };
  return { ...deriveItem(isoStr, thresholds), failed: false };
};

export function PfFreshnessBar({ freshness, onRefresh }) {
  const pts = [
    { label: 'Prices',   ...deriveItem(freshness?.refresh_prices, THRESHOLDS.prices) },
    { label: 'Snapshot', ...deriveItem(freshness?.portfolio_snapshot, THRESHOLDS.snapshot) },
    { label: 'AI eval',  ...deriveAiEvalItem(freshness?.daily_briefing, freshness?.daily_briefing_status, THRESHOLDS.ai), title: freshness?.daily_briefing_status === 'FAILED' ? freshness?.daily_briefing_error : undefined },
  ];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:0, padding:'7px 14px', borderRadius:8, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', marginBottom:22 }}>
      {pts.map((p, i) => (
        <React.Fragment key={p.label}>
          {i > 0 && <span style={{ width:1, height:14, background:'rgba(255,255,255,0.07)', margin:'0 14px' }}/>}
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5 }} title={p.title}>
            <span style={{ width:5, height:5, borderRadius:999, flexShrink:0, background:p.failed ? 'var(--error-500, #e5484d)' : p.ok ? 'var(--sage-500)' : 'var(--dusk-500)' }}/>
            <span style={{ color:'var(--ink-30)', fontWeight:500 }}>{p.label}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--ink-50)' }}>{p.failed ? 'failed' : p.ts}</span>
          </span>
        </React.Fragment>
      ))}
      <span style={{ flex:1 }}/>
      <button onClick={onRefresh} className="du3-cta ghost" style={{ fontSize:11, padding:'0 8px', height:24 }}>↻ Refresh</button>
    </div>
  );
}
