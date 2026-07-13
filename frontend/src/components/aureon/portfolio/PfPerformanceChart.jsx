import React, { useState } from 'react';
import { useCardData } from '@/hooks/useCardData';
import { Sk, Cerr } from '@/components/aureon/ui';
import { NotBuiltState } from '@/components/aureon/ds.jsx';

const stub = async () => {
  await new Promise(r => setTimeout(r, 620 + Math.random() * 200));
  return null;
};

const RANGES = [['1W',7],['1M',30],['3M',90],['6M',180],['1Y',252],['All',500]];

export function PfPerformanceChart() {
  const { status, data, error, refetch } = useCardData(stub);
  const [range, setRange] = useState(252);

  const rangeBar = (
    <div style={{ display:'flex', gap:2, padding:3, borderRadius:7, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
      {RANGES.map(([lbl,n]) => (
        <button key={lbl} onClick={() => setRange(n)} style={{ padding:'5px 11px', fontSize:11.5, borderRadius:5, border:'none', cursor:'pointer', fontFamily:'var(--font-ui)', background:range===n?'rgba(255,255,255,0.09)':'transparent', color:range===n?'var(--ink-00)':'var(--ink-40)' }}>{lbl}</button>
      ))}
    </div>
  );

  if (status === 'loading') return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', padding:'16px 20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <Sk h={14} w={120} />{rangeBar}
      </div>
      <Sk h={190} />
    </div>
  );

  if (status === 'error') return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', padding:'16px 20px' }}>
      <Cerr msg={error} retry={refetch} />
    </div>
  );

  const snapshots = data?.snapshots;
  if (!snapshots?.length) return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', padding:'16px 20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div/>{rangeBar}
      </div>
      <NotBuiltState
        title="Performance History"
        body="Portfolio history charting isn't built yet — there's no backend endpoint serving snapshot history, regardless of provider or holdings data."
      />
    </div>
  );

  const w=900, h=190, pad={l:56,r:16,t:10,b:28};
  const vals = snapshots.map(s => s.value);
  const min=Math.min(...vals), max=Math.max(...vals), rng=max-min||1;
  const x=i=>pad.l+(i/(snapshots.length-1))*(w-pad.l-pad.r);
  const y=v=>pad.t+(1-(v-min)/rng)*(h-pad.t-pad.b);
  const d=snapshots.map((s,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(s.value).toFixed(1)).join(' ');
  const fill=d+` L ${x(snapshots.length-1).toFixed(1)} ${h-pad.b} L ${x(0).toFixed(1)} ${h-pad.b} Z`;
  const c=vals[vals.length-1]>=vals[0]?'var(--sage-500)':'var(--crimson-500)';
  const pct=(vals[vals.length-1]-vals[0])/vals[0]*100;
  const ticks=[min,min+rng*0.5,max];
  const fmtTick=v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:`$${v.toFixed(0)}`;
  const fd=dt=>new Date(dt).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', padding:'16px 20px 10px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:13, color:pct>=0?'var(--sage-500)':'var(--crimson-500)', fontWeight:500 }}>{pct>=0?'▲':'▼'} {Math.abs(pct).toFixed(2)}%</span>
          <span style={{ fontSize:11.5, color:'var(--ink-50)' }}>{snapshots.length} snapshots</span>
        </div>
        {rangeBar}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width:'100%', height:190, display:'block' }}>
        <defs><linearGradient id="pfGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.14"/><stop offset="100%" stopColor={c} stopOpacity="0.01"/></linearGradient></defs>
        {ticks.map((t,i) => (<g key={i}><line x1={pad.l} x2={w-pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.04)"/><text x={pad.l-7} y={y(t)+4} textAnchor="end" fontSize="9.5" fontFamily="var(--font-mono)" fill="var(--ink-50)">{fmtTick(t)}</text></g>))}
        <path d={fill} fill="url(#pfGrad)"/>
        <path d={d} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={x(snapshots.length-1)} cy={y(vals[vals.length-1])} r="3.5" fill={c} stroke="var(--canvas)" strokeWidth="1.5"/>
        {snapshots[0] && <text x={pad.l} y={h-5} fontSize="9.5" fontFamily="var(--font-mono)" fill="var(--ink-50)">{fd(snapshots[0].ts)}</text>}
        <text x={w-pad.r} y={h-5} textAnchor="end" fontSize="9.5" fontFamily="var(--font-mono)" fill="var(--ink-50)">today</text>
      </svg>
    </div>
  );
}
