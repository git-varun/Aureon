import React, { useState, useMemo } from 'react';
import { AllocDonut } from '@/components/aureon/ui';
import { CLASS_LABEL, colorForAllocEntries, valueOf } from '@/components/aureon/utils';

function AllocationBars({ entries, classTarget, showTarget }) {
  if (!entries?.length) return (
    <div style={{ padding:'28px 16px', textAlign:'center', fontSize:13, color:'var(--ink-40)' }}>No allocation data</div>
  );
  const mx = Math.max(...entries.map(([,v]) => v), 0.01);
  const colors = colorForAllocEntries(entries);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
      {entries.map(([k,v]) => {
        const tgt = classTarget[k];
        const drift = tgt ? (v - tgt) : null;
        return (
          <div key={k} style={{ display:'grid', gridTemplateColumns:'112px 1fr 56px', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:7, height:7, borderRadius:2, flexShrink:0, background:colors[k]||'var(--ink-50)' }}/>
              <span style={{ fontSize:12, color:'var(--ink-20)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{CLASS_LABEL[k]||k}</span>
            </div>
            <div style={{ position:'relative', height:6, borderRadius:999, background:'rgba(255,255,255,0.05)' }}>
              <div style={{ width:`${(v/mx)*100}%`, height:'100%', borderRadius:'inherit', background:colors[k]||'var(--ink-50)', opacity:0.85 }}/>
              {showTarget && tgt && (
                <span style={{ position:'absolute', top:-3, bottom:-3, width:1, left:`${(tgt/mx)*100}%`, background:'rgba(255,255,255,0.5)' }}/>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5, justifyContent:'flex-end' }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--ink-20)' }}>{(v*100).toFixed(1)}%</span>
              {drift!=null && Math.abs(drift)>0.005 && (
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:Math.abs(drift)>0.05?'var(--crimson-500)':Math.abs(drift)>0.02?'var(--dusk-500)':'var(--ink-50)' }}>
                  {drift>0?'+':''}{(drift*100).toFixed(1)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PfAllocationSection({ holdings, allocByClass, classTarget, classTargetsLoading, classTargetsError, classTargetsUsingDefaults, cashNotTracked }) {
  const [tab, setTab] = useState('class');

  const classBars = useMemo(() =>
    Object.entries(allocByClass).sort((a,b) => b[1]-a[1]),
  [allocByClass]);

  // CATEGORICAL_PALETTE (utils.js) has 8 colorblind-safe slots — beyond that,
  // reused hues stop being visually distinct, so anything past the top 7
  // named sectors folds into "Other" rather than repeating a color.
  const MAX_SECTOR_SLOTS = 7;
  const sectorBars = useMemo(() => {
    const total = holdings.reduce((s,h) => s + valueOf(h), 0) || 1;
    const map = {};
    holdings.forEach(h => { const k = h.sector||'Other'; map[k]=(map[k]||0)+valueOf(h)/total; });
    const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]);
    if (sorted.length <= MAX_SECTOR_SLOTS + 1) return sorted;
    const top = sorted.slice(0, MAX_SECTOR_SLOTS);
    const restTotal = sorted.slice(MAX_SECTOR_SLOTS).reduce((s,[,v]) => s+v, 0);
    const otherIdx = top.findIndex(([k]) => k === 'Other');
    if (otherIdx >= 0) top[otherIdx] = ['Other', top[otherIdx][1] + restTotal];
    else top.push(['Other', restTotal]);
    return top.sort((a,b) => b[1]-a[1]);
  }, [holdings]);

  const barData = tab==='class' ? classBars : sectorBars;
  const donutData = tab==='class' ? allocByClass : Object.fromEntries(barData);

  if (!holdings.length) return (
    <div style={{ padding:'40px 24px', textAlign:'center', border:'1px dashed rgba(255,255,255,0.10)', borderRadius:12, background:'rgba(255,255,255,0.012)' }}>
      <div style={{ fontFamily:'var(--font-heading)', fontSize:15, fontWeight:600, color:'var(--ink-20)', marginBottom:6 }}>No holdings</div>
      <div style={{ fontSize:13, color:'var(--ink-40)' }}>Import your portfolio to see allocation.</div>
    </div>
  );

  return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontFamily:'var(--font-heading)', fontSize:14, fontWeight:600, color:'var(--ink-10)' }}>Allocation breakdown</span>
        <div style={{ display:'flex', gap:2, padding:3, borderRadius:7, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
          {[['class','Asset Class'],['sector','Sector']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding:'5px 12px', fontSize:11.5, borderRadius:5, border:'none', cursor:'pointer', fontFamily:'var(--font-ui)', background:tab===k?'rgba(255,255,255,0.09)':'transparent', color:tab===k?'var(--ink-00)':'var(--ink-40)' }}>{l}</button>
          ))}
        </div>
      </div>
      {cashNotTracked && (
        <div style={{ padding:'8px 18px', fontSize:10.5, color:'var(--ink-50)', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          Based on holdings only — cash balance isn't tracked yet
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:0 }}>
        <div style={{ padding:'20px', display:'flex', alignItems:'center', justifyContent:'center', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
          <AllocDonut alloc={Object.keys(donutData).length ? donutData : { stocks: 1 }} size={148}/>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <AllocationBars entries={barData} classTarget={classTarget} showTarget={tab==='class' && !classTargetsLoading}/>
          {tab==='class' && (
            <div style={{ marginTop:10, fontSize:11, color: classTargetsError ? 'var(--crimson-500)' : 'var(--ink-50)' }}>
              {classTargetsLoading
                ? 'Loading your saved target weights…'
                : classTargetsError
                ? "Couldn't load your target weights — showing allocation only, no target markers"
                : classTargetsUsingDefaults
                ? 'No saved targets yet — showing suggested starter weights, not your saved targets'
                : 'Vertical bar = target weight · drift label turns amber >2pp, red >5pp'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
