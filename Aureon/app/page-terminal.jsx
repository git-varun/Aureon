/* ============================================================
   Aureon — Asset Terminal: search · power view · discovery
   With Cmd+K palette
   ============================================================ */

const Terminal = ({ go, sym }) => {
  const [query, setQuery] = useState('');
  const [pickedSym, setPickedSym] = useState(sym || 'RELIANCE');
  const [tab, setTab] = useState('overview');
  const [chartKind, setChartKind] = useState('area'); // area · line · candle

  const picked = IN_UNIVERSE.find(u => u.sym === pickedSym) || IN_UNIVERSE[0];
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return IN_UNIVERSE.filter(u => (u.sym + ' ' + u.name + ' ' + u.sector).toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  const ai = TERMINAL_AI[picked.sym];
  const series = useMemo(() => genSeries(picked.sym, picked.price, 60, 0.018, picked.dayPct>0?0.001:-0.001), [picked.sym]);
  const fmt = (n) => picked.region==='IN' ? fmtINR(n) : fmtUSD(n);

  return (
    <>
      {/* Header */}
      <div style={{display:'flex',alignItems:'baseline',gap:14,marginBottom:14}}>
        <div>
          <Eyebrow>Asset terminal</Eyebrow>
          <h2 style={{margin:'4px 0 0',fontFamily:'var(--font-heading)',fontSize:22,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.015em'}}>Look up an asset</h2>
        </div>
        <div style={{flex:1}}/>
        <div style={{fontSize:11,color:'var(--ink-40)'}}>Press <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-20)',padding:'2px 6px',background:'rgba(255,255,255,0.04)',borderRadius:3}}>⌘K</span> from anywhere</div>
      </div>

      {/* Big search */}
      <div style={{position:'relative',marginBottom:14}}>
        <div style={{
          display:'flex',alignItems:'center',gap:12,height:54,padding:'0 18px',borderRadius:12,
          background:'rgba(255,255,255,0.03)',border:'1px solid rgba(201,168,106,0.20)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-100)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            value={query} onChange={e => setQuery(e.target.value)} autoFocus
            placeholder="Search RELIANCE, TCS, NVDA, NIFTYBEES, BTC, PPF…"
            style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--ink-00)',fontSize:15,fontFamily:'var(--font-ui)'}}
          />
          <span style={{fontSize:10.5,color:'var(--ink-40)'}}>{IN_UNIVERSE.length} symbols across NSE · BSE · NASDAQ · MF · GOI</span>
        </div>
        {results.length > 0 && (
          <div className="layer-1" style={{position:'absolute',left:0,right:0,top:60,zIndex:10,padding:6,maxHeight:340,overflowY:'auto'}}>
            {results.map(r => (
              <button key={r.sym} onClick={() => { setPickedSym(r.sym); setQuery(''); }} style={{
                display:'grid',gridTemplateColumns:'1.4fr 0.6fr 1fr 0.7fr',gap:12,width:'100%',padding:'10px 12px',
                background:'transparent',border:'none',borderRadius:8,cursor:'pointer',color:'inherit',textAlign:'left',
              }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:12.5,color:'var(--ink-00)',fontWeight:600,letterSpacing:'0.04em'}}>{r.sym}</div>
                  <div style={{fontSize:11,color:'var(--ink-30)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.name}</div>
                </div>
                <span style={{fontSize:10,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,alignSelf:'center'}}>{r.ex}</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-10)',alignSelf:'center'}}>{r.region==='IN'?fmtINR(r.price):fmtUSD(r.price)}</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:r.dayPct>=0?'var(--sage-500)':'var(--crimson-500)',alignSelf:'center',textAlign:'right'}}>{r.dayPct>=0?'+':''}{(r.dayPct*100).toFixed(2)}%</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Picked asset terminal view */}
      <div className="layer-1" style={{padding:'18px 22px',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:18,flexWrap:'wrap'}}>
          <div style={{
            width:48,height:48,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',
            background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
            fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em',
          }}>{picked.sym.slice(0,4)}</div>
          <div>
            <div style={{display:'flex',alignItems:'baseline',gap:10}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{picked.sym}</span>
              <span style={{fontSize:10,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,padding:'2px 6px',background:'rgba(255,255,255,0.04)',borderRadius:999}}>{picked.ex} · {picked.region}</span>
            </div>
            <div style={{fontFamily:'var(--font-heading)',fontSize:18,fontWeight:600,color:'var(--ink-10)',marginTop:2}}>{picked.name}</div>
            <div style={{fontSize:11.5,color:'var(--ink-40)',marginTop:4}}>{CLASS_LABEL[picked.class] || picked.class} · {picked.sector}</div>
          </div>
          <div style={{flex:1}}/>
          <div>
            <Eyebrow>Last</Eyebrow>
            <div style={{fontFamily:'var(--font-mono)',fontSize:30,fontWeight:500,color:'var(--ink-00)',marginTop:4,letterSpacing:'-0.01em'}}>{fmt(picked.price)}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:13,color:picked.dayPct>=0?'var(--sage-500)':'var(--crimson-500)',marginTop:4}}>{picked.dayPct>=0?'▲':'▼'} {(Math.abs(picked.dayPct)*100).toFixed(2)}% today</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <button onClick={() => alert('Added to watchlist')} className="du3-cta ghost" style={{padding:'0 14px'}}>+ Watchlist</button>
            <button onClick={() => go('assets', picked.class, picked.sym)} className="du3-cta" style={{padding:'0 14px'}}>Open in detail →</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:0,marginTop:18,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          {['overview','chart','fundamentals','news','technical','ai'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:'10px 14px',background:'none',border:'none',cursor:'pointer',
              fontSize:12.5,letterSpacing:'-0.005em',
              color: tab===t ? 'var(--ink-00)' : 'var(--ink-40)',
              borderBottom:'2px solid '+(tab===t?'var(--aurum-500)':'transparent'),
              fontWeight: tab===t?500:400,textTransform:'capitalize',
            }}>{t==='ai'?'AI take':t}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{paddingTop:16}}>
          {tab==='overview' && (
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:18,alignItems:'stretch'}}>
              <ChartCard series={series} kind={chartKind} setKind={setChartKind} dayPct={picked.dayPct}/>
              <div>
                <Eyebrow>Quick stats</Eyebrow>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 18px',marginTop:10}}>
                  {[
                    ['Open',  fmt(picked.price * 0.998)],
                    ['High',  fmt(picked.price * 1.012)],
                    ['Low',   fmt(picked.price * 0.984)],
                    ['Vol',   '8.42M'],
                    ['52W H', fmt(picked.price * 1.18)],
                    ['52W L', fmt(picked.price * 0.72)],
                    ['M-cap', picked.mcap],
                    ['Class', CLASS_LABEL[picked.class] || picked.class],
                  ].map(([k,v]) => (
                    <div key={k}>
                      <div style={{fontSize:10.5,color:'var(--ink-40)',letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600}}>{k}</div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-00)',marginTop:3}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab==='chart' && <ChartCard series={series} kind={chartKind} setKind={setChartKind} dayPct={picked.dayPct} large/>}
          {tab==='fundamentals' && <FundamentalsTab picked={picked}/>}
          {tab==='news' && <NewsTab picked={picked}/>}
          {tab==='technical' && <TechnicalTab picked={picked}/>}
          {tab==='ai' && <AITakeTab picked={picked} ai={ai} go={go}/>}
        </div>
      </div>

      {/* Discovery row */}
      <SectionHead eyebrow="Discovery" title="Themes" meta="curated by Aureon"/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:10}}>
        {THEMES.slice(0,6).map(t => (
          <button key={t.id} onClick={() => go('theme', t.id)} className="layer-1" style={{
            padding:'12px 14px',textAlign:'left',cursor:'pointer',color:'inherit',
            background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor='rgba(201,168,106,0.25)'}
          onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.06)'}
          >
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontFamily:'var(--font-heading)',fontSize:13,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.005em'}}>{t.name}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:t.ret1m>=0?'var(--sage-500)':'var(--crimson-500)'}}>{t.ret1m>=0?'+':''}{(t.ret1m*100).toFixed(1)}%</span>
            </div>
            <div style={{fontSize:11,color:'var(--ink-30)',lineHeight:1.4}}>{t.desc}</div>
            <div style={{marginTop:8,fontSize:10.5,color:'var(--ink-40)'}}>{t.count} instruments · View detail →</div>
          </button>
        ))}
      </div>
      <div style={{height:32}}/>
    </>
  );
};

/* ---- Multi-style chart card ---- */
const ChartCard = ({ series, kind, setKind, dayPct, large }) => {
  const [tf, setTf] = useState('1M');
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div style={{display:'flex',gap:0}}>
          {['1D','1W','1M','3M','1Y','ALL'].map(p => (
            <button key={p} onClick={() => setTf(p)} style={{
              padding:'4px 10px',fontSize:11,fontFamily:'var(--font-mono)',
              background: tf===p ? 'rgba(201,168,106,0.12)' : 'transparent',
              color: tf===p ? 'var(--aurum-100)' : 'var(--ink-30)',
              border:'none',cursor:'pointer',borderRadius:4,
            }}>{p}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:0,padding:2,borderRadius:6,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          {[['line','Line'],['area','Area'],['candle','Candle']].map(([k,l]) => (
            <button key={k} onClick={() => setKind(k)} style={{
              padding:'4px 10px',fontSize:11,
              background: kind===k ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: kind===k ? 'var(--ink-00)' : 'var(--ink-30)',
              border:'none',cursor:'pointer',borderRadius:4,
            }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{width:'100%',aspectRatio:'16/5',minHeight:80}}>
        <FlexChart series={series} kind={kind} height={large?320:200} dayPct={dayPct} flexible/>
      </div>
    </div>
  );
};

const FlexChart = ({ series, kind='area', height=220, dayPct=0, flexible=false }) => {
  if (!series || !series.length) return null;
  const w = 800, h = height, pad = { l:44, r:14, t:12, b:24 };
  const min = Math.min(...series), max = Math.max(...series);
  const r = max - min || 1;
  const x = (i) => pad.l + (i/(series.length-1))*(w-pad.l-pad.r);
  const y = (v) => pad.t + (1 - (v-min)/r)*(h-pad.t-pad.b);
  const c = dayPct>=0 ? 'var(--sage-500)' : 'var(--crimson-500)';
  const ticks = [min, min + r*0.25, min + r*0.5, min + r*0.75, max];
  const fmt = (t) => t > 1000 ? Math.round(t).toLocaleString() : t.toFixed(2);

  if (kind === 'candle') {
    // group every 2 points into a "candle" with synthetic OHLC
    const cands = [];
    for (let i = 0; i < series.length; i += 2) {
      const o = series[i], cl = series[i+1] || o;
      const hi = Math.max(o, cl) * (1 + 0.004 * ((i*7)%5)/5);
      const lo = Math.min(o, cl) * (1 - 0.004 * ((i*11)%5)/5);
      cands.push({ i, o, c:cl, h:hi, l:lo });
    }
    const cw = (w - pad.l - pad.r) / cands.length * 0.62;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:'100%',height:flexible?'100%':height,display:'block'}}>
        {ticks.map((t,i) => (
          <g key={i}>
            <line x1={pad.l} x2={w-pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.04)"/>
            <text x={pad.l-6} y={y(t)+4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{fmt(t)}</text>
          </g>
        ))}
        {cands.map((cd,i) => {
          const cx = x(cd.i);
          const up = cd.c >= cd.o;
          const col = up ? 'var(--sage-500)' : 'var(--crimson-500)';
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={y(cd.h)} y2={y(cd.l)} stroke={col} strokeWidth="1"/>
              <rect x={cx - cw/2} y={y(Math.max(cd.o,cd.c))} width={cw} height={Math.max(1, Math.abs(y(cd.c)-y(cd.o)))} fill={col} opacity={up?0.85:0.85}/>
            </g>
          );
        })}
        <text x={pad.l} y={h-6} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">60d ago</text>
        <text x={w-pad.r} y={h-6} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">today</text>
      </svg>
    );
  }

  const d = series.map((v,i) => (i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:'100%',height:flexible?'100%':height,display:'block'}}>
      {ticks.map((t,i) => (
        <g key={i}>
          <line x1={pad.l} x2={w-pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.04)"/>
          <text x={pad.l-6} y={y(t)+4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{fmt(t)}</text>
        </g>
      ))}
      {kind==='area' && (
        <>
          <defs><linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={dayPct>=0?'#6FAE88':'#D16B6B'} stopOpacity="0.30"/><stop offset="1" stopColor={dayPct>=0?'#6FAE88':'#D16B6B'} stopOpacity="0"/></linearGradient></defs>
          <path d={d + ` L ${x(series.length-1)} ${h-pad.b} L ${x(0)} ${h-pad.b} Z`} fill="url(#areaG)"/>
        </>
      )}
      <path d={d} fill="none" stroke={c} strokeWidth={kind==='line'?1.4:1.6}/>
      <text x={pad.l} y={h-6} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">60d ago</text>
      <text x={w-pad.r} y={h-6} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">today</text>
    </svg>
  );
};

const FundamentalsTab = ({ picked }) => {
  const rows = picked.region==='IN' ? [
    ['P/E', picked.sector==='IT'?'28.4':'22.1'],['P/B','3.2'],['ROE','18.6%'],['Div yield','1.4%'],
    ['EPS · TTM', picked.region==='IN'?'₹64.2':'$3.42'],['Book value', picked.region==='IN'?'₹284':'$24.1'],
    ['Debt/Equity','0.34'],['Promoter holding','46.8%'],
  ] : [
    ['P/E','32.4'],['PEG','1.2'],['ROE','24.1%'],['Div yield','0.5%'],
    ['EPS · TTM','$6.42'],['Beta','1.21'],['Debt/Equity','0.62'],['Float','15.3B sh'],
  ];
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:14}}>
      {rows.map(([k,v]) => (
        <div key={k} style={{padding:'12px 14px',borderRadius:8,background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{fontSize:10.5,color:'var(--ink-40)',letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600}}>{k}</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:18,fontWeight:500,color:'var(--ink-00)',marginTop:6}}>{v}</div>
        </div>
      ))}
    </div>
  );
};

const NewsTab = ({ picked }) => {
  const items = [
    { ts:'2h', sent:+0.4, t:`${picked.name} reports beat on Q4 revenue; guidance reaffirmed.` },
    { ts:'8h', sent:-0.2, t:`Brokerage downgrades ${picked.sym} citing valuation; price target unchanged.` },
    { ts:'1d', sent:+0.1, t:`Sector rotation favors ${picked.sector}; flows turn positive.` },
    { ts:'2d', sent:-0.3, t:`Macro print pressures ${picked.region==='IN'?'INR':'USD'}; rate-sensitive names lag.` },
  ];
  return (
    <div style={{display:'grid',gap:8}}>
      {items.map((n,i) => (
        <div key={i} style={{display:'grid',gridTemplateColumns:'50px 60px 1fr',gap:14,padding:'10px 14px',borderRadius:8,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.04)',alignItems:'center'}}>
          <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)'}}>{n.ts}</span>
          <span style={{fontFamily:'var(--font-mono)',fontSize:11,color: n.sent>=0?'var(--sage-500)':'var(--crimson-500)'}}>sent {n.sent>=0?'+':''}{n.sent.toFixed(1)}</span>
          <span style={{fontSize:13,color:'var(--ink-10)'}}>{n.t}</span>
        </div>
      ))}
      <div style={{fontSize:11,color:'var(--ink-40)',marginTop:6}}>Aureon summarizes; no full article body in-product.</div>
    </div>
  );
};

const AITakeTab = ({ picked, ai, go }) => {
  if (!ai) return <Empty>No AI take yet for this asset. Aureon prepares takes for assets in your portfolio + watchlist.</Empty>;
  return (
    <div className="layer-1" style={{padding:'16px 18px'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
        <StrengthDot strength={ai.strength}/>
        <span style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>AI take</span>
      </div>
      <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em',lineHeight:1.4}}>{ai.take}</div>
      <div style={{marginTop:14,display:'flex',gap:10}}>
        <button onClick={() => go('recommendations')} className="du3-cta">Open recommendations →</button>
        <button onClick={() => go('signals')} className="du3-cta ghost">View signals</button>
      </div>
    </div>
  );
};

/* ---- Technical Tab — empty state + simulated signal generation ---- */
const TechnicalTab = ({ picked }) => {
  const [generating, setGenerating] = useState(false);
  const [signals, setSignals] = useState(null);

  useEffect(() => { setSignals(null); setGenerating(false); }, [picked.sym]);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      const rsi = 38 + Math.floor(Math.random() * 34);
      const macd = ((Math.random() - 0.4) * 2).toFixed(3);
      const trend = rsi > 60 ? 'Bullish' : rsi < 42 ? 'Bearish' : 'Neutral';
      const trendColor = trend === 'Bullish' ? 'var(--sage-500)' : trend === 'Bearish' ? 'var(--crimson-500)' : 'var(--ink-30)';
      setSignals({ rsi, macd, trend, trendColor, bb:'Within bands', confidence: 50 + Math.floor(Math.random() * 30) });
    }, 2000);
  };

  if (!signals) {
    return (
      <div style={{padding:'32px 24px',textAlign:'center',background:'rgba(255,255,255,0.025)',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12}}>
        <div style={{width:40,height:40,borderRadius:999,background:'rgba(201,168,106,0.10)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',marginTop:12}}>
          No signal generated yet
        </div>
        <div style={{fontSize:13,color:'var(--ink-30)',maxWidth:320,margin:'6px auto 0',lineHeight:1.5}}>
          Generate a technical signal for {picked.sym} using RSI, MACD and Bollinger Bands.
        </div>
        <button
          disabled={generating}
          onClick={handleGenerate}
          onMouseEnter={e => { if (!generating) e.currentTarget.style.background='rgba(201,168,106,0.22)'; }}
          onMouseLeave={e => { if (!generating) e.currentTarget.style.background='rgba(201,168,106,0.14)'; }}
          style={{
            marginTop:18,display:'inline-flex',alignItems:'center',gap:8,
            height:36,padding:'0 20px',borderRadius:8,
            background:'rgba(201,168,106,0.14)',border:'1px solid rgba(201,168,106,0.35)',
            color:'var(--aurum-100)',fontSize:13,fontFamily:'var(--font-ui)',fontWeight:500,
            cursor:generating?'not-allowed':'pointer',opacity:generating?0.7:1,
          }}>
          {generating ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="2" strokeLinecap="round"
                   style={{animation:'spin 1s linear infinite',flexShrink:0}}>
                <circle cx="12" cy="12" r="9" strokeDasharray="40 80"/>
              </svg>
              Generating…
            </>
          ) : 'Generate Signal'}
        </button>
      </div>
    );
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
      {[
        ['RSI · 14', signals.rsi, signals.rsi > 70 ? 'Overbought' : signals.rsi < 30 ? 'Oversold' : 'Neutral', signals.rsi > 60 ? 'var(--sage-500)' : signals.rsi < 42 ? 'var(--crimson-500)' : 'var(--ink-00)'],
        ['MACD', signals.macd, Number(signals.macd) > 0 ? 'Positive crossover' : 'Negative crossover', Number(signals.macd) > 0 ? 'var(--sage-500)' : 'var(--crimson-500)'],
        ['Bollinger', 'Mid', signals.bb, 'var(--ink-00)'],
        ['Trend', signals.trend, `Confidence ${signals.confidence}%`, signals.trendColor],
      ].map(([k,v,sub,color]) => (
        <div key={k} style={{padding:'14px 16px',borderRadius:10,background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{k}</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color,marginTop:8}}>{v}</div>
          <div style={{fontSize:11,color:'var(--ink-40)',marginTop:4}}>{sub}</div>
        </div>
      ))}
    </div>
  );
};

/* ---- Cmd+K palette (global) ---- */
const CommandPalette = ({ open, setOpen, go }) => {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState(-1);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  if (!open) return null;

  const qLow = q.trim().toLowerCase();

  const assetResults = qLow
    ? HOLDINGS.filter(h => (h.ticker + ' ' + h.name).toLowerCase().includes(qLow)).slice(0, 6)
    : [];

  const allPages = [
    {l:'Dashboard',r:'dashboard'},{l:'Portfolio',r:'portfolio'},{l:'Markets',r:'markets'},
    {l:'Terminal',r:'terminal'},{l:'Watchlist',r:'watchlist'},{l:'Recommendations',r:'recommendations'},
    {l:'Signals',r:'signals'},{l:'Activity',r:'activity'},{l:'Settings',r:'settings'},
  ];
  const pageResults = qLow
    ? allPages.filter(n => n.l.toLowerCase().includes(qLow)).slice(0, 4)
    : [];

  const flat = [
    ...assetResults.map(h => ({ type:'asset', data:h })),
    ...pageResults.map(p => ({ type:'page', data:p })),
  ];

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[activeIdx];
      if (!item) return;
      if (item.type === 'asset') { setOpen(false); go('assets', item.data.class, item.data.ticker); }
      else { setOpen(false); go(item.data.r); }
    }
  };

  return (
    <div onClick={() => setOpen(false)} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(6px)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'14vh'}}>
      <div onClick={e => e.stopPropagation()} style={{
        width:'min(580px, 92vw)',borderRadius:16,overflow:'hidden',
        background:'rgba(22,24,28,0.96)',border:'1px solid rgba(255,255,255,0.10)',
        boxShadow:'0 30px 80px rgba(0,0,0,0.55)',backdropFilter:'blur(40px)',
      }}>
        {/* Search input — unchanged */}
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-100)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            autoFocus value={q}
            onChange={e => { setQ(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search assets, jump to a page…"
            style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--ink-00)',fontSize:15,fontFamily:'var(--font-ui)'}}
          />
          <span style={{fontSize:10.5,color:'var(--ink-40)',padding:'2px 6px',background:'rgba(255,255,255,0.04)',borderRadius:3,fontFamily:'var(--font-mono)'}}>esc</span>
        </div>

        <div style={{maxHeight:'50vh',overflowY:'auto',padding:6}}>
          {/* Default suggestions */}
          {!q.trim() && (
            <div style={{padding:'12px 14px',fontSize:11,color:'var(--ink-40)'}}>
              <div style={{letterSpacing:'0.12em',textTransform:'uppercase',fontWeight:600,marginBottom:6}}>Suggestions</div>
              {['RELIANCE','TCS','INFY','NVDA','BTC-INR'].map(s => {
                const u = IN_UNIVERSE.find(x => x.sym === s);
                return (
                  <button key={s} onClick={() => { setOpen(false); go('terminal', s); }}
                    style={{display:'block',width:'100%',padding:'8px 0',background:'none',border:'none',color:'var(--ink-20)',textAlign:'left',cursor:'pointer',fontSize:13}}>
                    <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-00)',letterSpacing:'0.04em',marginRight:8}}>{s}</span>{u?.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Assets group */}
          {assetResults.length > 0 && (
            <div>
              <div style={{padding:'8px 12px 4px',fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Assets</div>
              {assetResults.map((h, i) => {
                const isActive = activeIdx === i;
                return (
                  <div key={h.id}
                    onMouseEnter={() => { setHoveredIdx(i); setActiveIdx(i); }}
                    onMouseLeave={() => setHoveredIdx(-1)}
                    onClick={() => { setOpen(false); go('assets', h.class, h.ticker); }}
                    style={{
                      display:'flex',alignItems:'center',gap:10,
                      height:42,padding:'0 12px',cursor:'pointer',borderRadius:6,
                      background: isActive ? 'rgba(201,168,106,0.08)' : 'transparent',
                      boxShadow: isActive ? 'inset 2px 0 0 var(--aurum-500)' : 'none',
                    }}>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-00)',background:'rgba(255,255,255,0.08)',borderRadius:4,padding:'2px 6px',flexShrink:0}}>
                      {h.ticker}
                    </span>
                    <span style={{flex:1,fontSize:13,color:'var(--ink-10)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {h.name}
                    </span>
                    {isActive && (
                      <div style={{display:'flex',gap:4,flexShrink:0}}>
                        <span onClick={e => { e.stopPropagation(); setOpen(false); go('assets', h.class, h.ticker); }}
                          style={{fontSize:11,color:'var(--ink-30)',padding:'2px 8px',background:'rgba(255,255,255,0.06)',borderRadius:999,cursor:'pointer'}}>
                          Open detail
                        </span>
                        <span onClick={e => { e.stopPropagation(); setOpen(false); go('terminal', h.ticker); }}
                          style={{fontSize:11,color:'var(--ink-30)',padding:'2px 8px',background:'rgba(255,255,255,0.06)',borderRadius:999,cursor:'pointer'}}>
                          Terminal
                        </span>
                      </div>
                    )}
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',flexShrink:0,minWidth:80}}>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-20)'}}>{fmtMoney(h.price,'USD',{dp:2})}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:11,color: h.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'}}>
                        {h.dayPct>=0?'+':''}{(h.dayPct*100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Divider */}
          {assetResults.length > 0 && pageResults.length > 0 && (
            <div style={{height:1,background:'rgba(255,255,255,0.06)',margin:'4px 6px'}}/>
          )}

          {/* Pages group */}
          {pageResults.length > 0 && (
            <div>
              <div style={{padding:'8px 12px 4px',fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Pages</div>
              {pageResults.map((n, i) => {
                const flatIdx = assetResults.length + i;
                const isActive = activeIdx === flatIdx;
                return (
                  <button key={n.r}
                    onClick={() => { setOpen(false); go(n.r); }}
                    onMouseEnter={() => { setHoveredIdx(flatIdx); setActiveIdx(flatIdx); }}
                    onMouseLeave={() => setHoveredIdx(-1)}
                    style={{
                      display:'block',width:'100%',padding:'8px 12px',borderRadius:6,
                      background: isActive ? 'rgba(201,168,106,0.08)' : 'transparent',
                      border:'none',outline:'none',
                      boxShadow: isActive ? 'inset 2px 0 0 var(--aurum-500)' : 'none',
                      color:'var(--ink-10)',textAlign:'left',cursor:'pointer',
                      fontSize:13,fontFamily:'var(--font-ui)',
                    }}>
                    Go to <span style={{color:'var(--ink-00)'}}>{n.l}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {q.trim() && flat.length === 0 && (
            <div style={{padding:'32px 24px',textAlign:'center'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin:'0 auto 10px',display:'block'}}>
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
              <div style={{fontSize:13,color:'var(--ink-30)'}}>No results for "{q}"</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Terminal, CommandPalette, FlexChart, ChartCard, TechnicalTab });
