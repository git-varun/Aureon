import React, { useState, useMemo } from 'react';
import { TierChip, Sk, EpfEstimateBadge, EpfRateMissingHint } from '@/components/aureon/ui';
import { valueOf, valueOfBase, plOf, plPctOf, isFutures } from '@/components/aureon/utils';
import { useV4 } from '@/contexts/V4Context';

const COL = 'minmax(0,1.8fr) minmax(0,0.7fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,0.65fr) 76px';

function SortHdr({ col, sortC, sortD, onToggle, children }) {
  return (
    <button onClick={() => onToggle(col)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'inline-flex', alignItems:'center', gap:3, fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:sortC===col?'var(--aurum-300)':'var(--ink-40)', fontWeight:600, fontFamily:'var(--font-ui)' }}>
      {children}{sortC===col && <span style={{ fontSize:9, opacity:0.7 }}>{sortD>0?'↑':'↓'}</span>}
    </button>
  );
}

export function PfHoldingsTable({ holdings, loading, fmt, onLogTrade, onAddManual }) {
  const [q, setQ]         = useState('');
  const [cls, setCls]     = useState('all');
  const [sortC, setSortC] = useState('value');
  const [sortD, setSortD] = useState(-1);
  const { fxRates } = useV4();

  const filtered = useMemo(() => {
    let list = [...holdings];
    if (q) { const lq = q.toLowerCase(); list = list.filter(h => (h.ticker+' '+h.name).toLowerCase().includes(lq)); }
    if (cls !== 'all') {
      if (cls === 'passive') list = list.filter(h => h.tier === 'passive');
      else list = list.filter(h => h.class === cls);
    }
    list.sort((a,b) => {
      if (sortC === 'ticker') return sortD * (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);
      if (sortC === 'name')   return sortD * (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      if (sortC === 'day')    return sortD * ((a.dayPct||0) - (b.dayPct||0));
      if (sortC === 'pl')     return sortD * (plPctOf(a) - plPctOf(b));
      return sortD * (valueOfBase(a, fxRates) - valueOfBase(b, fxRates));
    });
    return list;
  }, [holdings, q, cls, sortC, sortD, fxRates]);

  const toggleSort = c => { if (sortC === c) setSortD(d => -d); else { setSortC(c); setSortD(-1); } };

  if (loading && holdings.length === 0) return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <div style={{ padding:'11px 16px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', gap:10 }}>
        <Sk h={30} w={210} /><Sk h={30} w={300} />
      </div>
      <div style={{ padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}><Sk h={10} /></div>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{ padding:'11px 16px', borderBottom:'1px solid rgba(255,255,255,0.03)', display:'grid', gridTemplateColumns:COL, gap:10 }}>
          {Array.from({length:8}).map((_, j) => <Sk key={j} h={14} />)}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', borderBottom:'1px solid rgba(255,255,255,0.05)', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'0 0 210px' }}>
          <svg style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', opacity:0.35 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search holdings…" style={{ width:'100%', paddingLeft:28, paddingRight:10, height:30, borderRadius:7, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'var(--ink-10)', fontSize:12.5, outline:'none' }}/>
        </div>
        <div style={{ display:'flex', gap:3, padding:3, borderRadius:7, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
          {[['all','All'],['stocks','Stocks'],['crypto','Crypto'],['funds','Funds'],['bonds','Bonds'],['retirement','Retirement'],['passive','Passive']].map(([k,l]) => (
            <button key={k} onClick={() => setCls(k)} style={{ padding:'5px 10px', fontSize:11, borderRadius:5, border:'none', cursor:'pointer', background:cls===k?'rgba(255,255,255,0.08)':'transparent', color:cls===k?'var(--ink-00)':'var(--ink-40)' }}>{l}</button>
          ))}
        </div>
        <span style={{ flex:1 }}/>
        <span style={{ fontSize:11, color:'var(--ink-50)' }}>{filtered.length} / {holdings.length}</span>
        <button onClick={onAddManual} className="du3-cta ghost" style={{ fontSize:11.5, padding:'0 10px', height:28 }}>+ Manual asset</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:COL, gap:10, padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <SortHdr col="ticker" sortC={sortC} sortD={sortD} onToggle={toggleSort}>Holding</SortHdr>
        <div style={{ fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:600 }}>Tier</div>
        <div style={{ fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:600 }}>Price</div>
        <div style={{ fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:600 }}>Qty</div>
        <SortHdr col="day" sortC={sortC} sortD={sortD} onToggle={toggleSort}>Day Δ</SortHdr>
        <SortHdr col="value" sortC={sortC} sortD={sortD} onToggle={toggleSort}>Value</SortHdr>
        <SortHdr col="pl" sortC={sortC} sortD={sortD} onToggle={toggleSort}>P/L</SortHdr>
        <div style={{ fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:600, textAlign:'right' }}>Actions</div>
      </div>
      <div style={{ maxHeight:560, overflowY:'auto' }}>
      {filtered.length === 0 ? (
        <div style={{ padding:'28px 16px', textAlign:'center', fontSize:13, color:'var(--ink-40)' }}>
          {q || cls !== 'all' ? 'No holdings match your filter.' : 'No holdings yet. Import your portfolio to get started.'}
        </div>
      ) : filtered.map(h => {
        const isManual = h.tier === 'passive';
        const isEstimated = h.priceSource === 'epf_estimated';
        const isRateMissing = h.unavailableReason === 'epf_rate_missing';
        const futures = isFutures(h);
        const pl = plOf(h);
        const plp = h.cost > 0 && h.price != null ? plPctOf(h) : null;
        const hCcy = h.currency || 'USD';
        const fmtVal = v => fmt ? fmt(v, hCcy, {dp:0}) : `$${Math.round(v).toLocaleString()}`;
        const fmtPrice = v => fmt ? fmt(v, hCcy, {dp:2}) : `$${v?.toFixed(2)}`;
        return (
          <div key={h.id || h.ticker} style={{ display:'grid', gridTemplateColumns:COL, gap:10, padding:'11px 16px', borderBottom:'1px solid rgba(255,255,255,0.03)', alignItems:'center', transition:'background 120ms' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:600, color:'var(--ink-00)', letterSpacing:'0.03em' }}>{h.ticker}</span>
                {isManual && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:'rgba(122,168,212,0.12)', color:'#7AA8D4', border:'1px solid rgba(122,168,212,0.22)', letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600 }}>Manual</span>}
                {isEstimated && <EpfEstimateBadge basis={h.epfEstimateBasis}/>}
                {isRateMissing && <EpfRateMissingHint/>}
              </div>
              <div style={{ fontSize:11.5, color:'var(--ink-40)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{h.name}</div>
            </div>
            <TierChip tier={h.tier}/>
            {futures ? (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:12.5, fontWeight:600, color: h.side === 'SHORT' ? 'var(--crimson-500)' : 'var(--sage-500)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {h.side === 'SHORT' ? 'SHORT' : 'LONG'} {h.leverage ? `${h.leverage}x` : ''}
              </span>
            ) : (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:12.5, color:isManual?'var(--ink-50)':'var(--ink-10)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {isManual ? <span style={{ fontSize:11, color:'var(--ink-50)' }}>Manual val.</span> : h.price == null ? '—' : fmtPrice(h.price)}
              </span>
            )}
            {futures ? (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--ink-40)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                Liq. {h.liquidationPrice != null ? fmtPrice(h.liquidationPrice) : '—'}
              </span>
            ) : (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:12.5, color:'var(--ink-30)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.qty == null ? '—' : h.qty >= 1 ? h.qty.toLocaleString() : h.qty.toFixed(4)}</span>
            )}
            <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:(h.dayPct == null || h.dayPct===0)?'var(--ink-50)':h.dayPct>0?'var(--sage-500)':'var(--crimson-500)' }}>
              {futures || h.dayPct == null || h.dayPct===0 ? '—' : `${h.dayPct>0?'▲':'▼'} ${(Math.abs(h.dayPct)*100).toFixed(2)}%`}
            </span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--ink-00)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.price == null ? '—' : fmtVal(valueOf(h))}</span>
            {plp != null ? (
              <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 6px', borderRadius:4, fontFamily:'var(--font-mono)', fontSize:11, background:pl>=0?'rgba(111,174,136,0.10)':'rgba(209,107,107,0.10)', color:pl>=0?'var(--sage-500)':'var(--crimson-500)' }}>
                {plp>=0?'+':'−'}{(Math.abs(plp)*100).toFixed(1)}%
              </span>
            ) : <span style={{ fontSize:11, color:'var(--ink-50)' }}>—</span>}
            <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
              {isManual
                ? <button onClick={() => onAddManual && onAddManual(h)} className="du3-cta ghost" style={{ fontSize:10.5, padding:'0 7px', height:24, whiteSpace:'nowrap' }}>Update val.</button>
                : <button onClick={() => onLogTrade && onLogTrade(h)} className="du3-cta ghost" style={{ fontSize:10.5, padding:'0 7px', height:24 }}>Trade</button>
              }
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
