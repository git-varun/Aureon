/* ============================================================
   Aureon — Merged Portfolio (analysis-first, grouped by class)
   Replaces both Portfolio and AssetsIndex.
   ============================================================ */

/* Aggregate analytics per class */
const classAnalytics = (items) => {
  const value = items.reduce((s,h) => s + valueOf(h), 0);
  const cost  = items.reduce((s,h) => s + costOf(h), 0);
  const pl    = value - cost;
  const plPct = cost ? pl / cost : 0;
  const dayPct = items.reduce((s,h) => s + (h.dayPct||0) * valueOf(h), 0) / (value || 1);
  // Risk proxy: weighted beta
  const beta = items.reduce((s,h) => s + (h.beta||0) * valueOf(h), 0) / (value || 1);
  return { value, cost, pl, plPct, dayPct, beta };
};

/* Build a 60d aggregated series for the class (weighted) */
const classSeries = (items) => {
  // Use first active series we have or synth
  const sample = items.map(h => PRICE_SERIES[h.ticker] || genSeries(h.ticker, h.price, 60, 0.015, 0));
  if (!sample.length) return null;
  const n = Math.min(...sample.map(s => s.length));
  const totalCurr = items.reduce((s,h) => s + valueOf(h), 0) || 1;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let v = 0;
    items.forEach((h, idx) => {
      const series = sample[idx];
      const factor = series[i] / series[n-1];
      v += valueOf(h) * factor;
    });
    out[i] = v;
  }
  return out;
};

/* ---- Log Trade Modal ---- */
const LogTradeModal = ({ onClose }) => {
  const { setToast } = useApp();
  const [form, setFormState] = useState({
    ticker:'', type:'BUY', qty:'', price:'',
    date: new Date().toISOString().slice(0,10),
    broker:'zerodha', notes:'',
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const set = (k,v) => setFormState(f => ({...f,[k]:v}));

  const onSearch = (q) => {
    setQuery(q); set('ticker', q);
    setResults(q.trim() ? IN_UNIVERSE.filter(u => (u.sym+' '+u.name).toLowerCase().includes(q.toLowerCase())).slice(0,8) : []);
  };
  const pick = (u) => { set('ticker', u.sym); set('price', String(u.price)); setQuery(u.sym); setResults([]); };

  const submit = () => {
    if (!form.ticker || !form.qty || !form.price) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setToast({ text:`${form.type} ${form.ticker} logged` });
      onClose();
    }, 600);
  };

  const fieldStyle = {width:'100%',padding:'9px 12px',borderRadius:7,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',color:'var(--ink-10)',fontSize:13,outline:'none',boxSizing:'border-box'};
  const labelStyle = {fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,display:'block',marginBottom:6};

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:800,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'min(520px,92vw)',borderRadius:14,background:'rgba(18,20,24,0.97)',border:'1px solid rgba(255,255,255,0.10)',boxShadow:'0 30px 80px rgba(0,0,0,0.55)',backdropFilter:'blur(40px)',animation:'cardEnter 220ms var(--ease-decel)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div>
            <div style={{fontFamily:'var(--font-heading)',fontSize:16,fontWeight:600,color:'var(--ink-00)'}}>Log a trade</div>
            <div style={{fontSize:11.5,color:'var(--ink-40)',marginTop:2}}>Record a transaction manually</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--ink-40)',cursor:'pointer',fontSize:16}}>✕</button>
        </div>

        <div style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:14}}>
          {/* Ticker */}
          <div>
            <label style={labelStyle}>Ticker / symbol</label>
            <div style={{position:'relative'}}>
              <input value={query} onChange={e=>onSearch(e.target.value)} placeholder="e.g. NVDA, RELIANCE, BTC-INR" style={fieldStyle}/>
              {results.length > 0 && (
                <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',zIndex:10,background:'rgba(18,20,24,0.97)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:8,overflow:'hidden',boxShadow:'0 8px 32px rgba(0,0,0,0.40)'}}>
                  {results.map(u => (
                    <button key={u.sym} onClick={()=>pick(u)}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                      style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'8px 12px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-00)',fontWeight:600,minWidth:80}}>{u.sym}</span>
                      <span style={{fontSize:12,color:'var(--ink-30)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Type */}
          <div>
            <label style={labelStyle}>Type</label>
            <div style={{display:'flex',gap:6,padding:3,borderRadius:7,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
              {['BUY','SELL','DIVIDEND','SPLIT'].map(t => (
                <button key={t} onClick={()=>set('type',t)} style={{
                  flex:1,padding:'6px 4px',fontSize:11.5,borderRadius:5,border:'none',cursor:'pointer',
                  background: form.type===t ? (t==='BUY'?'rgba(111,174,136,0.16)':t==='SELL'?'rgba(209,107,107,0.16)':'rgba(201,168,106,0.14)') : 'transparent',
                  color: form.type===t ? (t==='BUY'?'var(--sage-500)':t==='SELL'?'var(--crimson-500)':'var(--aurum-100)') : 'var(--ink-30)',
                }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Qty + Price */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={labelStyle}>Quantity</label>
              <input type="number" value={form.qty} onChange={e=>set('qty',e.target.value)} placeholder="0.00" style={{...fieldStyle,fontFamily:'var(--font-mono)'}}/>
            </div>
            <div>
              <label style={labelStyle}>Price per unit</label>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--ink-30)',fontFamily:'var(--font-mono)',pointerEvents:'none'}}>₹</span>
                <input type="number" value={form.price} onChange={e=>set('price',e.target.value)} placeholder="0.00" style={{...fieldStyle,paddingLeft:24,fontFamily:'var(--font-mono)'}}/>
              </div>
            </div>
          </div>

          {/* Date + Broker */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={form.date} onChange={e=>set('date',e.target.value)} style={{...fieldStyle,colorScheme:'dark'}}/>
            </div>
            <div>
              <label style={labelStyle}>Broker</label>
              <select value={form.broker} onChange={e=>set('broker',e.target.value)} style={fieldStyle}>
                {['zerodha','groww','binance','manual'].map(b=><option key={b} value={b}>{b.charAt(0).toUpperCase()+b.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes <span style={{color:'var(--ink-40)',textTransform:'none',letterSpacing:0,fontSize:10}}>(optional)</span></label>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="e.g. Averaging down on dip"
              style={{...fieldStyle,resize:'vertical',minHeight:56,fontFamily:'var(--font-ui)'}}/>
          </div>
        </div>

        <div style={{display:'flex',gap:10,padding:'14px 20px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          <button onClick={onClose} className="du3-cta ghost" style={{flex:1}}>Cancel</button>
          <button onClick={submit} disabled={submitting||!form.ticker||!form.qty||!form.price} className="du3-cta"
            style={{flex:2,background:'rgba(201,168,106,0.14)',border:'1px solid rgba(201,168,106,0.35)',color:'var(--aurum-100)',opacity:(!form.ticker||!form.qty||!form.price)?0.5:1}}>
            {submitting ? 'Logging…' : `Log ${form.type}`}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Portfolio — analysis-first, grouped by class
   Each class is a glass-layered analytics block; deep table inside.
   ============================================================ */
const Portfolio = ({ go }) => {
  const { search } = useApp();
  const [filter, setFilter] = useState('all');
  const [showTrade, setShowTrade] = useState(false);

  const grouped = useMemo(() => {
    const g = {};
    HOLDINGS.forEach(h => { (g[h.class] = g[h.class] || []).push(h); });
    return g;
  }, []);

  const order = ['stocks','crypto','funds','bonds','retirement','real_estate','insurance'];
  const allocs = allocByClass();
  const visibleClasses = order.filter(c => grouped[c] && grouped[c].length);

  // Header totals
  const totals = useMemo(() => {
    const value = HOLDINGS.reduce((s,h) => s + valueOf(h), 0);
    const cost  = HOLDINGS.reduce((s,h) => s + costOf(h), 0);
    return { value, cost, pl: value - cost, plPct: (value-cost)/cost };
  }, []);

  return (
    <>
      {/* Header — analysis-first summary */}
      <header style={{padding:'8px 0 22px',marginBottom:22,borderBottom:'1px solid rgba(255,255,255,0.05)',display:'grid',gridTemplateColumns:'minmax(0,1.3fr) minmax(0,1fr) auto',gap:32,alignItems:'end'}}>
        <div>
          <Eyebrow>Portfolio value · all classes</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:48,fontWeight:500,letterSpacing:'-0.02em',color:'var(--ink-00)',marginTop:6,lineHeight:1}}>
            {fmtMoney(totals.value,'USD',{dp:0})}
          </div>
          <div style={{marginTop:8,display:'flex',gap:14,fontFamily:'var(--font-mono)',fontSize:13}}>
            <span style={{color: totals.pl>=0?'var(--sage-500)':'var(--crimson-500)'}}>
              {totals.pl>=0?'+':'−'}{fmtMoney(Math.abs(totals.pl),'USD',{dp:0})} ({totals.plPct>=0?'+':''}{(totals.plPct*100).toFixed(1)}%)
            </span>
            <span style={{color:'var(--ink-40)'}}>unrealized · all-time</span>
          </div>
        </div>
        <div style={{paddingLeft:32,borderLeft:'1px solid rgba(255,255,255,0.06)'}}>
          <Eyebrow>Diversification</Eyebrow>
          {HOLDINGS.length > 0 ? (
            <div style={{fontFamily:'var(--font-heading)',fontSize:14,color:'var(--ink-10)',marginTop:8,lineHeight:1.5,maxWidth:360}}>
              {visibleClasses.length} asset classes · {HOLDINGS.length} holdings. Stocks 6pp above target — rebalance pending.
            </div>
          ) : (
            <div style={{marginTop:8}}>
              <div style={{fontSize:13,color:'var(--ink-40)',marginBottom:10}}>No holdings yet. Connect a broker to get started.</div>
              <button onClick={() => go('settings')} className="du3-cta ghost" style={{fontSize:12,padding:'0 12px',height:28}}>Connect broker →</button>
            </div>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <button onClick={() => setShowTrade(true)} className="du3-cta ghost" style={{padding:'0 12px',height:30,fontSize:12}}>+ Log trade</button>
          <AllocDonut alloc={allocs} size={120}/>
        </div>
      </header>

      {/* Tier filter */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
        <span style={{fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Filter</span>
        <div style={{display:'flex',gap:4,padding:4,borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          {[['all','All tiers'],['active','Active'],['semi','Semi'],['passive','Passive']].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding:'6px 12px',fontSize:11.5,borderRadius:6,border:'none',cursor:'pointer',
              background: filter===k ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: filter===k ? 'var(--ink-00)' : 'var(--ink-30)',
            }}>{l}</button>
          ))}
        </div>
        <span style={{flex:1}}/>
        <span style={{fontSize:11,color:'var(--ink-40)'}}>Click a class to expand its holdings table</span>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {visibleClasses.map(cls => {
          let items = grouped[cls];
          if (filter !== 'all') items = items.filter(h => h.tier === filter);
          if (search) items = items.filter(h => (h.ticker+' '+h.name).toLowerCase().includes(search.toLowerCase()));
          if (!items.length) return null;
          return <ClassBlock key={cls} cls={cls} items={items} totalValue={totals.value} go={go}/>;
        })}
        {HOLDINGS.length === 0 && (
          <div style={{padding:'40px 24px',textAlign:'center',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12,background:'rgba(255,255,255,0.015)'}}>
            <div style={{fontSize:14,color:'var(--ink-30)',marginBottom:12}}>No holdings found. Connect a broker to import your portfolio.</div>
            <button onClick={() => go('settings')} className="du3-cta" style={{background:'rgba(201,168,106,0.14)',border:'1px solid rgba(201,168,106,0.35)',color:'var(--aurum-100)'}}>Connect broker →</button>
          </div>
        )}
      </div>

      <div style={{marginTop:18,fontSize:11.5,color:'var(--ink-40)',lineHeight:1.55,maxWidth:760}}>
        Passive assets (real estate, retirement, insurance) contribute to net worth and allocation but don't receive real-time signals. Active and semi-active tiers feed the decision engine.
      </div>
      <div style={{height:32}}/>
      {showTrade && <LogTradeModal onClose={() => setShowTrade(false)}/>}
    </>
  );
};

/* One block per asset class — analytics by default, table on expand */
const ClassBlock = ({ cls, items, totalValue, go }) => {
  const [open, setOpen] = useState(false);
  const a = classAnalytics(items);
  const wt = a.value / totalValue;
  const targetWt = CLASS_TARGET[cls] || 0;
  const drift = wt - targetWt;
  const series = useMemo(() => classSeries(items), [items]);
  const tier = items[0]?.tier || 'active';

  return (
    <section className="layer-1" style={{
      padding:0,overflow:'hidden',
      background:'rgba(255,255,255,0.02)',
      border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,
    }}>
      {/* Analytics row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:0}}>
        <button onClick={() => setOpen(o => !o)} style={{
          display:'grid',gridTemplateColumns:'1.4fr 1.1fr 1.1fr 1fr 1.4fr auto',gap:18,alignItems:'center',
          padding:'18px 22px',background:'transparent',border:'none',cursor:'pointer',color:'inherit',textAlign:'left',
          transition:'background 120ms var(--ease-std)',
        }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
          {/* Class title */}
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{
                width:8,height:8,borderRadius:2,
                background:({stocks:'#C9A86A',funds:'#D4B888',bonds:'#7AA8D4',crypto:'#D4A257',real_estate:'#6FAE88',retirement:'#8A909B',insurance:'#4B4F57'})[cls],
              }}/>
              <h3 style={{margin:0,fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em'}}>{CLASS_LABEL[cls]}</h3>
              <TierChip tier={tier}/>
            </div>
            <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:6}}>{items.length} {items.length===1?'holding':'holdings'}</div>
          </div>

          {/* Value + day */}
          <div>
            <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Value</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:18,fontWeight:500,color:'var(--ink-00)',marginTop:4,letterSpacing:'-0.005em'}}>{fmtMoney(a.value,'USD',{dp:0})}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:11,color: a.dayPct>=0?'var(--sage-500)':'var(--crimson-500)',marginTop:2}}>
              {a.dayPct===0 ? '— today' : (a.dayPct>=0?'▲':'▼')+' '+(Math.abs(a.dayPct)*100).toFixed(2)+'% today'}
            </div>
          </div>

          {/* P/L visualization */}
          <div>
            <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Unrealized P/L</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:18,fontWeight:500,color: a.pl>=0?'var(--sage-500)':'var(--crimson-500)',marginTop:4,letterSpacing:'-0.005em'}}>
              {a.pl>=0?'+':'−'}{fmtMoney(Math.abs(a.pl),'USD',{dp:0})}
            </div>
            <PLBar pl={a.pl} cost={a.cost}/>
          </div>

          {/* Allocation bar */}
          <div>
            <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Allocation</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:18,fontWeight:500,color:'var(--ink-00)',marginTop:4}}>{(wt*100).toFixed(1)}%</div>
            <AllocBar wt={wt} target={targetWt}/>
            <div style={{fontFamily:'var(--font-mono)',fontSize:10.5,color: Math.abs(drift)>0.02?'var(--dusk-500)':'var(--ink-40)',marginTop:3}}>
              target {(targetWt*100).toFixed(0)}% · drift {drift>=0?'+':''}{(drift*100).toFixed(1)}pp
            </div>
          </div>

          {/* Trend */}
          <div>
            <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,marginBottom:6}}>Trend · 60d</div>
            {series && tier !== 'passive' ? (
              <Sparkline data={series} w={170} h={36}/>
            ) : (
              <div style={{fontSize:11,color:'var(--ink-40)',fontStyle:'italic'}}>passive · n/a</div>
            )}
            {tier !== 'passive' && (
              <div style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)',marginTop:3}}>
                risk β {a.beta.toFixed(2)}
              </div>
            )}
          </div>

          <span style={{
            display:'inline-flex',alignItems:'center',justifyContent:'center',width:24,height:24,borderRadius:6,
            background:'rgba(255,255,255,0.04)',color:'var(--ink-30)',
            transition:'transform 220ms var(--ease-std)',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </button>

        {/* Drill-down table — only when open */}
        {open && (
          <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',background:'rgba(0,0,0,0.18)',animation:'cardEnter 220ms var(--ease-decel)'}}>
            <div style={{display:'grid',gridTemplateColumns:'1.4fr 0.7fr 1fr 1fr 1fr 1fr 0.6fr',gap:12,padding:'10px 22px',fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
              <div>Holding</div><div>Tier</div><div>Price</div><div>60d</div><div>Day Δ</div><div>Value</div><div style={{textAlign:'right'}}>P/L</div>
            </div>
            {items.map(h => (
              <button key={h.id} onClick={() => go('assets', h.class, h.ticker)} style={{
                display:'grid',gridTemplateColumns:'1.4fr 0.7fr 1fr 1fr 1fr 1fr 0.6fr',gap:12,padding:'12px 22px',width:'100%',
                background:'transparent',border:'none',borderBottom:'1px solid rgba(255,255,255,0.04)',color:'inherit',cursor:'pointer',textAlign:'left',alignItems:'center',
              }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:12.5,color:'var(--ink-00)',fontWeight:600,letterSpacing:'0.04em'}}>{h.ticker}</div>
                  <div style={{fontSize:11.5,color:'var(--ink-30)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:240}}>{h.name}</div>
                </div>
                <TierChip tier={h.tier}/>
                <span style={{fontFamily:'var(--font-mono)',fontSize:12.5,color:'var(--ink-10)'}}>${h.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                <Sparkline data={PRICE_SERIES[h.ticker] || [h.cost,h.price]} w={72} h={20}/>
                <span style={{fontFamily:'var(--font-mono)',fontSize:12,color: h.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'}}>{h.dayPct===0?'—':(h.dayPct>=0?'▲':'▼')+' '+(Math.abs(h.dayPct)*100).toFixed(2)+'%'}</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:12.5,color:'var(--ink-00)'}}>{fmtMoney(valueOf(h),'USD',{dp:0})}</span>
                {(() => {
                  const noBase = !h.cost || h.cost === 0;
                  const pl = plOf(h);
                  const plPct = noBase ? null : plPctOf(h);
                  return (
                    <span style={{textAlign:'right'}}>
                      <span
                        title={noBase ? 'Cost basis not recorded' : undefined}
                        style={{
                          display:'inline-flex',alignItems:'center',
                          padding:'1px 6px',borderRadius:4,
                          fontFamily:'var(--font-mono)',fontSize:11,
                          background: noBase ? 'rgba(255,255,255,0.06)' : pl>=0 ? 'rgba(111,174,136,0.10)' : 'rgba(209,107,107,0.10)',
                          color: noBase ? 'var(--ink-40)' : pl>=0 ? 'var(--sage-500)' : 'var(--crimson-500)',
                        }}>
                        {noBase ? '—' : `${plPct>=0?'+':'−'}${(Math.abs(plPct)*100).toFixed(1)}%`}
                      </span>
                    </span>
                  );
                })()}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const PLBar = ({ pl, cost }) => {
  const pct = cost ? Math.min(1, Math.abs(pl)/cost) : 0;
  const sign = pl >= 0;
  return (
    <div style={{display:'flex',height:5,borderRadius:999,marginTop:6,background:'rgba(255,255,255,0.04)',overflow:'hidden',position:'relative'}}>
      <div style={{width:`${pct*100}%`,background: sign?'var(--sage-500)':'var(--crimson-500)',opacity:0.85}}/>
    </div>
  );
};

const AllocBar = ({ wt, target }) => {
  const max = Math.max(0.45, target * 1.5);
  return (
    <div style={{position:'relative',height:5,borderRadius:999,marginTop:6,background:'rgba(255,255,255,0.04)',overflow:'visible'}}>
      <div style={{width:`${Math.min(100,(wt/max)*100)}%`,height:'100%',background:'var(--aurum-500)',borderRadius:'inherit',opacity:0.85}}/>
      {target > 0 && (
        <span style={{position:'absolute',top:-3,bottom:-3,width:1,left:`${Math.min(100,(target/max)*100)}%`,background:'var(--ink-10)',opacity:0.7}}/>
      )}
    </div>
  );
};

Object.assign(window, { Portfolio, ClassBlock, LogTradeModal });
