import React from 'react';

export function PfFreshnessBar({ onRefresh }) {
  const pts = [
    { label: 'Prices',   ts: '—', ok: false },
    { label: 'Snapshot', ts: '—', ok: false },
    { label: 'AI eval',  ts: '—', ok: false },
  ];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:0, padding:'7px 14px', borderRadius:8, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', marginBottom:22 }}>
      {pts.map((p, i) => (
        <React.Fragment key={p.label}>
          {i > 0 && <span style={{ width:1, height:14, background:'rgba(255,255,255,0.07)', margin:'0 14px' }}/>}
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5 }}>
            <span style={{ width:5, height:5, borderRadius:999, flexShrink:0, background:p.ok ? 'var(--sage-500)' : 'var(--dusk-500)' }}/>
            <span style={{ color:'var(--ink-30)', fontWeight:500 }}>{p.label}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--ink-50)' }}>{p.ts}</span>
          </span>
        </React.Fragment>
      ))}
      <span style={{ flex:1 }}/>
      <button onClick={onRefresh} className="du3-cta ghost" style={{ fontSize:11, padding:'0 8px', height:24 }}>↻ Refresh</button>
    </div>
  );
}
