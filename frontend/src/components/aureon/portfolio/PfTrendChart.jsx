import React, { useState, useCallback, useId } from 'react';
import { useCardData } from '@/hooks/useCardData';
import { apiService } from '@/api/apiService';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Sk, Cerr } from '@/components/aureon/ui';
import { EmptyState } from '@/components/aureon/ds.jsx';

const RANGES = [['1W',7],['1M',30],['3M',90],['6M',180],['1Y',365],['All',1825]];
const METRICS = [
  ['health', 'Health Score', 'investor_health_score', 'var(--sage-500)'],
  ['diversification', 'Diversification', 'diversification_score', 'var(--aurum-500)'],
];

export function PfTrendChart() {
  // useId() ids contain colons, which CSS's url(#...) fragment syntax can't
  // reference without escaping — strip them rather than fight CSS escaping rules.
  const gradId = 'pfTrendGrad-' + useId().replace(/:/g, '');
  const { activePortfolioId } = usePortfolio();
  const [range, setRange] = useState(90);
  const [metric, setMetric] = useState('health');

  const health = useCardData(
    useCallback(() => apiService.getPortfolioHealthTrend(activePortfolioId, range), [activePortfolioId, range])
  );
  const div = useCardData(
    useCallback(() => apiService.getDiversificationTrend(activePortfolioId, range), [activePortfolioId, range])
  );

  const refetchBoth = () => { health.refetch(); div.refetch(); };
  const active = metric === 'health' ? health : div;
  const [, , field, color] = METRICS.find(m => m[0] === metric);

  const rangeBar = (
    <div style={{ display:'flex', gap:2, padding:3, borderRadius:7, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
      {RANGES.map(([lbl,n]) => (
        <button key={lbl} onClick={() => { setRange(n); refetchBoth(); }} style={{ padding:'5px 11px', fontSize:11.5, borderRadius:5, border:'none', cursor:'pointer', fontFamily:'var(--font-ui)', background:range===n?'rgba(255,255,255,0.09)':'transparent', color:range===n?'var(--ink-00)':'var(--ink-40)' }}>{lbl}</button>
      ))}
    </div>
  );

  const metricBar = (
    <div style={{ display:'flex', gap:2, padding:3, borderRadius:7, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
      {METRICS.map(([key,label]) => (
        <button key={key} onClick={() => setMetric(key)} style={{ padding:'5px 11px', fontSize:11.5, borderRadius:5, border:'none', cursor:'pointer', fontFamily:'var(--font-ui)', background:metric===key?'rgba(255,255,255,0.09)':'transparent', color:metric===key?'var(--ink-00)':'var(--ink-40)' }}>{label}</button>
      ))}
    </div>
  );

  if (active.status === 'loading') return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', padding:'16px 20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        {metricBar}{rangeBar}
      </div>
      <Sk h={190} />
    </div>
  );

  if (active.status === 'error') return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', padding:'16px 20px' }}>
      <Cerr msg={active.error} retry={active.refetch} />
    </div>
  );

  const points = active.data;
  if (!points?.length) return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', padding:'16px 20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        {metricBar}{rangeBar}
      </div>
      <EmptyState
        title="Not enough history yet"
        body="Trend data appears once this portfolio has real transaction and price history behind it — check back after a few days of activity, or widen the range."
      />
    </div>
  );

  const w=900, h=190, pad={l:44,r:16,t:10,b:28};
  const vals = points.map(p => p[field]);
  const min=Math.min(...vals), max=Math.max(...vals), rng=max-min||1;
  const x=i=>pad.l+(i/(points.length-1||1))*(w-pad.l-pad.r);
  const y=v=>pad.t+(1-(v-min)/rng)*(h-pad.t-pad.b);
  const d=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p[field]).toFixed(1)).join(' ');
  const fill=d+` L ${x(points.length-1).toFixed(1)} ${h-pad.b} L ${x(0).toFixed(1)} ${h-pad.b} Z`;
  const c = color;
  const last = vals[vals.length-1], first = vals[0];
  const delta = last - first;
  const ticks=[min,min+rng*0.5,max];
  const fd=dt=>new Date(dt).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', padding:'16px 20px 10px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {metricBar}
          <span style={{ fontFamily:'var(--font-mono)', fontSize:13, color:delta>=0?'var(--sage-500)':'var(--crimson-500)', fontWeight:500 }}>{delta>=0?'▲':'▼'} {Math.abs(delta).toFixed(1)}</span>
          <span style={{ fontSize:11.5, color:'var(--ink-50)' }}>{points.length} points</span>
        </div>
        {rangeBar}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width:'100%', height:190, display:'block' }}>
        <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.14"/><stop offset="100%" stopColor={c} stopOpacity="0.01"/></linearGradient></defs>
        {ticks.map((t,i) => (<g key={i}><line x1={pad.l} x2={w-pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.04)"/><text x={pad.l-7} y={y(t)+4} textAnchor="end" fontSize="9.5" fontFamily="var(--font-mono)" fill="var(--ink-50)">{t.toFixed(0)}</text></g>))}
        <path d={fill} fill={`url(#${gradId})`}/>
        <path d={d} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={x(points.length-1)} cy={y(last)} r="3.5" fill={c} stroke="var(--canvas)" strokeWidth="1.5"/>
        {points[0] && <text x={pad.l} y={h-5} fontSize="9.5" fontFamily="var(--font-mono)" fill="var(--ink-50)">{fd(points[0].date)}</text>}
        <text x={w-pad.r} y={h-5} textAnchor="end" fontSize="9.5" fontFamily="var(--font-mono)" fill="var(--ink-50)">today</text>
      </svg>
    </div>
  );
}
