import React from 'react';
import {Sk} from '@/components/aureon/ui';

export function PfSummaryHero({
                                  netWorth,
                                  investedValue,
                                  unrealizedPnl,
                                  realizedPnl,
                                  dayDelta,
                                  loading,
                                  fmt,
                                  onSnapshot,
                                  onLogTrade
                              }) {
  if (loading && !netWorth) return (
    <div style={{ marginBottom:28, padding:'22px 24px', borderRadius:14, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <Sk h={11} w={140} />
        <Sk h={46} w={240} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px 28px', marginTop:8 }}>
          {[0,1,2,3,4,5].map(i => <Sk key={i} h={48} />)}
        </div>
      </div>
    </div>
  );

  if (!netWorth && !loading) return (
    <div style={{ padding:'40px 24px', textAlign:'center', border:'1px dashed rgba(255,255,255,0.10)', borderRadius:12, background:'rgba(255,255,255,0.012)', marginBottom:28 }}>
      <div style={{ fontFamily:'var(--font-heading)', fontSize:15, fontWeight:600, color:'var(--ink-20)', marginBottom:6 }}>No portfolio data</div>
      <div style={{ fontSize:13, color:'var(--ink-40)', maxWidth:400, margin:'0 auto 14px', lineHeight:1.6 }}>Import your holdings or connect a provider to see your portfolio summary.</div>
      <span style={{ fontSize:12, color:'var(--ink-50)' }}>Use the Import Center below ↓</span>
    </div>
  );

  const dayDlt = dayDelta?.dollars ?? 0;
  const dayPct = dayDelta?.pct ?? 0;
    // Invested/Unrealized P/L/Realized P/L come from the portfolio snapshot
    // (cached up to 15 min); Current Value is deliberately computed live from
    // holdings instead (keeps the allocation chart's numerator/denominator on
    // one source — see useAureonData.js). After a price move these won't sum
    // to Current Value — the hint below is so that reads as "different as-of
    // times", not a bug. Unrealized P/L is market-value movement only;
    // Realized P/L is cumulative closed futures PnL/funding/commission
    // (USDⓈ-M wallet only — see snapshot.ts) — the two no longer share one
    // blended tile.
  const snapshotHint = 'As of last portfolio snapshot — may lag Current Value, which is live.';
  const metricGrid = [
    { label:'Invested',       val: investedValue != null ? fmt(investedValue, 'INR', {dp:0}) : '—', sub:null, hint: snapshotHint },
    { label:'Current Value',  val: netWorth ? fmt(netWorth, 'INR', {dp:0}) : '—', sub:null },
    { label:'Unrealized P/L', val: unrealizedPnl != null ? fmt(unrealizedPnl, 'INR', {dp:0}) : '—', sub:null, col: unrealizedPnl != null ? (unrealizedPnl >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)') : undefined, hint: snapshotHint },
      {
          label: 'Realized P/L',
          val: realizedPnl != null ? fmt(realizedPnl, 'INR', {dp: 0}) : '—',
          sub: 'closed futures PnL, funding & fees',
          col: realizedPnl != null ? (realizedPnl >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)') : undefined,
          hint: snapshotHint
      },
    { label:'XIRR',           val:'—',  sub:'annualized return',          col:'var(--aurum-300)' },
    { label:'CAGR',           val:'—',  sub:'cost → current value',       col:'var(--aurum-300)' },
  ];

  return (
    <div style={{ marginBottom:28, padding:'22px 24px', borderRadius:14, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', display:'grid', gridTemplateColumns:'1fr auto', gap:32, alignItems:'start' }}>
      <div>
        <div style={{ fontSize:10.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:600, marginBottom:8 }}>Net Worth · all classes</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:48, fontWeight:500, color:'var(--ink-00)', letterSpacing:'-0.025em', lineHeight:1, marginBottom:8 }}>
          {netWorth ? fmt(netWorth, 'INR', {dp:0}) : '—'}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          {dayDlt !== 0 && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:13, color:dayDlt>=0?'var(--sage-500)':'var(--crimson-500)', fontWeight:500 }}>
              {dayDlt>=0?'▲':'▼'} {fmt(Math.abs(dayDlt), 'INR', {dp:0})} ({dayDlt>=0?'+':'−'}{(Math.abs(dayPct)*100).toFixed(2)}%) today
            </span>
          )}
          <span style={{ width:1, height:14, background:'rgba(255,255,255,0.10)' }}/>
          <button onClick={onSnapshot} className="du3-cta ghost" style={{ fontSize:11, padding:'0 8px', height:24 }}>♥ Take snapshot</button>
          <button onClick={onLogTrade} className="du3-cta ghost" style={{ fontSize:11, padding:'0 8px', height:24 }}>+ Log trade</button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px 28px', minWidth:480 }}>
        {metricGrid.map(m => (
          <div key={m.label}>
            <div style={{ fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-50)', fontWeight:600, marginBottom:3 }}>
              {m.label}{m.hint && <span title={m.hint} style={{ marginLeft:4, cursor:'help', color:'var(--ink-40)' }}>ⓘ</span>}
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:15, fontWeight:500, color:m.col||'var(--ink-00)', letterSpacing:'-0.01em' }}>{m.val}</div>
            {m.sub && <div style={{ fontSize:10.5, color:'var(--ink-40)', marginTop:2 }}>{m.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
