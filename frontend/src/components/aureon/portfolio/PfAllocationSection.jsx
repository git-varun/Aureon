import React, { useState, useMemo } from 'react';
import { AllocDonut } from '@/components/aureon/ui';
import { CLASS_LABEL, CLASS_TARGET, valueOf } from '@/components/aureon/utils';

const ALLOC_PALETTE = {
  stocks:'#C9A86A', funds:'#D4B888', bonds:'#7AA8D4', crypto:'#D4A257',
  real_estate:'#6FAE88', retirement:'#8A909B', insurance:'#4B4F57',
  Tech:'#C9A86A', Healthcare:'#6FAE88', Financials:'#7AA8D4', 'Layer 1':'#D4A257',
  Broad:'#D4B888', Intl:'#8A909B', Treasury:'#7AA8D4', Aggregate:'#8A909B',
  Residential:'#6FAE88', 'Target 2045':'#969CA6', 'Self-managed':'#7AA8D4', 'Whole life':'#4B4F57',
  'Mega cap':'#C9A86A', 'Large cap':'#D4B888', 'Index fund':'#7AA8D4',
  'Fixed income':'#6FAE88', Crypto:'#D4A257', Illiquid:'#8A909B', Other:'#4B4F57',
};

const MCAP_MAP = {
  NVDA:'Mega cap', AAPL:'Mega cap', MSFT:'Mega cap', GOOGL:'Mega cap',
  JPM:'Large cap', JNJ:'Large cap', BTC:'Crypto', ETH:'Crypto', SOL:'Crypto',
  VTI:'Index fund', VXUS:'Index fund', TLT:'Fixed income', AGG:'Fixed income',
};

function AllocationBars({ entries, showTarget }) {
  if (!entries?.length) return (
    <div style={{ padding:'28px 16px', textAlign:'center', fontSize:13, color:'var(--ink-40)' }}>No allocation data</div>
  );
  const mx = Math.max(...entries.map(([,v]) => v), 0.01);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
      {entries.map(([k,v]) => {
        const tgt = CLASS_TARGET[k];
        const drift = tgt ? (v - tgt) : null;
        return (
          <div key={k} style={{ display:'grid', gridTemplateColumns:'112px 1fr 56px', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:7, height:7, borderRadius:2, flexShrink:0, background:ALLOC_PALETTE[k]||'var(--ink-50)' }}/>
              <span style={{ fontSize:12, color:'var(--ink-20)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{CLASS_LABEL[k]||k}</span>
            </div>
            <div style={{ position:'relative', height:6, borderRadius:999, background:'rgba(255,255,255,0.05)' }}>
              <div style={{ width:`${(v/mx)*100}%`, height:'100%', borderRadius:'inherit', background:ALLOC_PALETTE[k]||'var(--ink-50)', opacity:0.85 }}/>
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

export function PfAllocationSection({ holdings, allocByClass }) {
  const [tab, setTab] = useState('class');

  const classBars = useMemo(() =>
    Object.entries(allocByClass).sort((a,b) => b[1]-a[1]),
  [allocByClass]);

  const sectorBars = useMemo(() => {
    const total = holdings.reduce((s,h) => s + valueOf(h), 0) || 1;
    const map = {};
    holdings.forEach(h => { const k = h.sector||'Other'; map[k]=(map[k]||0)+valueOf(h)/total; });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [holdings]);

  const mcapBars = useMemo(() => {
    const total = holdings.reduce((s,h) => s + valueOf(h), 0) || 1;
    const map = {};
    holdings.forEach(h => {
      const k = MCAP_MAP[h.ticker] || (h.tier==='passive'?'Illiquid':'Other');
      map[k] = (map[k]||0) + valueOf(h)/total;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [holdings]);

  const barData = tab==='class' ? classBars : tab==='sector' ? sectorBars : mcapBars;
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
          {[['class','Asset Class'],['sector','Sector'],['mcap','Market Cap']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding:'5px 12px', fontSize:11.5, borderRadius:5, border:'none', cursor:'pointer', fontFamily:'var(--font-ui)', background:tab===k?'rgba(255,255,255,0.09)':'transparent', color:tab===k?'var(--ink-00)':'var(--ink-40)' }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:0 }}>
        <div style={{ padding:'20px', display:'flex', alignItems:'center', justifyContent:'center', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
          <AllocDonut alloc={Object.keys(donutData).length ? donutData : { stocks: 1 }} size={148}/>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <AllocationBars entries={barData} showTarget={tab==='class'}/>
          {tab==='class' && <div style={{ marginTop:10, fontSize:11, color:'var(--ink-50)' }}>Vertical bar = target weight · drift label turns amber &gt;2pp, red &gt;5pp</div>}
        </div>
      </div>
    </div>
  );
}
