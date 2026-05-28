/* ============================================================
   Aureon — Markets page (India primary, Global secondary)
   ============================================================ */

const MarketsPage = ({ go }) => {
  const [region, setRegion] = useState('IN');
  const indices = INDICES.filter(i => region==='ALL' || i.region===region);
  const universe = IN_UNIVERSE.filter(u => (region==='ALL' || u.region===region) && u.class==='stocks');

  const gainers = TOP_MOVERS.gainers.map(s => IN_UNIVERSE.find(u => u.sym===s)).filter(Boolean);
  const losers  = TOP_MOVERS.losers.map(s => IN_UNIVERSE.find(u => u.sym===s)).filter(Boolean);

  return (
    <>
      {/* Region tabs + market clock */}
      <div style={{display:'flex',alignItems:'center',gap:14,paddingBottom:14,marginBottom:18,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <div style={{display:'flex',gap:4,padding:4,borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          {[['IN','India'],['US','United States'],['EU','Europe'],['AS','Asia'],['ALL','All regions']].map(([k,l]) => (
            <button key={k} onClick={() => setRegion(k)} style={{
              padding:'6px 14px',fontSize:12,borderRadius:6,border:'none',cursor:'pointer',
              background: region===k ? 'rgba(201,168,106,0.14)' : 'transparent',
              color: region===k ? 'var(--aurum-100)' : 'var(--ink-30)',
              fontWeight: region===k ? 500 : 400,
            }}>{l}</button>
          ))}
        </div>
        <div style={{flex:1}}/>
        <MarketClock region={region}/>
      </div>

      {/* Indices strip */}
      <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(indices.length,4)}, 1fr)`,gap:10,marginBottom:18}}>
        {indices.slice(0,4).map(idx => (
          <div key={idx.sym} className="layer-1" style={{padding:'14px 16px'}}>
            <div style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{idx.sym}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color:'var(--ink-00)',marginTop:6,letterSpacing:'-0.01em'}}>
              {idx.value.toLocaleString('en-IN', {maximumFractionDigits:2})}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:12,color: idx.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'}}>
                {idx.dayPct>=0?'▲':'▼'} {(Math.abs(idx.dayPct)*100).toFixed(2)}%
              </span>
              <Sparkline data={genSeries(idx.sym, idx.value, 30, 0.012, idx.dayPct>0?0.001:-0.001)} w={70} h={18} fill={false}/>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14,marginBottom:14}}>
        {/* Sector heatmap */}
        <section className="layer-1" style={{padding:'16px 18px'}}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <Eyebrow>Sector heatmap · NIFTY</Eyebrow>
              <div style={{fontSize:12,color:'var(--ink-30)',marginTop:4}}>Tile size = index weight · color = today's change</div>
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center',fontSize:11,color:'var(--ink-40)'}}>
              <span style={{display:'inline-flex',alignItems:'center',gap:5}}><span style={{width:10,height:10,background:'var(--crimson-500)',opacity:0.7,borderRadius:2}}/>−2%</span>
              <span style={{display:'inline-flex',alignItems:'center',gap:5}}><span style={{width:10,height:10,background:'rgba(255,255,255,0.06)',borderRadius:2}}/>0</span>
              <span style={{display:'inline-flex',alignItems:'center',gap:5}}><span style={{width:10,height:10,background:'var(--sage-500)',opacity:0.7,borderRadius:2}}/>+2%</span>
            </div>
          </div>
          <SectorHeatmap sectors={NIFTY_SECTORS}/>
        </section>

        {/* Movers */}
        <section className="layer-1" style={{padding:'16px 18px'}}>
          <Eyebrow>Top movers · today</Eyebrow>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:12}}>
            <div>
              <div style={{fontSize:10.5,color:'var(--sage-500)',fontWeight:600,letterSpacing:'0.10em',textTransform:'uppercase',marginBottom:6}}>Gainers</div>
              {gainers.map(g => g && (
                <button key={g.sym} onClick={() => go('terminal', g.sym)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'5px 0',background:'none',border:'none',color:'inherit',cursor:'pointer',textAlign:'left'}}>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:'var(--ink-10)',fontWeight:600}}>{g.sym}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--sage-500)'}}>+{(g.dayPct*100).toFixed(2)}%</span>
                </button>
              ))}
            </div>
            <div>
              <div style={{fontSize:10.5,color:'var(--crimson-500)',fontWeight:600,letterSpacing:'0.10em',textTransform:'uppercase',marginBottom:6}}>Losers</div>
              {losers.map(g => g && (
                <button key={g.sym} onClick={() => go('terminal', g.sym)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'5px 0',background:'none',border:'none',color:'inherit',cursor:'pointer',textAlign:'left'}}>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:'var(--ink-10)',fontWeight:600}}>{g.sym}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--crimson-500)'}}>{(g.dayPct*100).toFixed(2)}%</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Themes */}
      <SectionHead eyebrow="Discovery · curated" title="Themes for today" meta="6 themes · refreshed 14:00"/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:10,marginBottom:18}}>
        {THEMES.map(t => (
          <button key={t.id} onClick={() => go('theme', t.id)} className="layer-1" style={{padding:'14px 16px',textAlign:'left',cursor:'pointer',color:'inherit',background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)'}}
            onMouseEnter={e => e.currentTarget.style.borderColor='rgba(201,168,106,0.25)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.06)'}
          >
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{fontFamily:'var(--font-heading)',fontSize:13.5,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.005em'}}>{t.name}</div>
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,color: t.ret1m>=0?'var(--sage-500)':'var(--crimson-500)'}}>{t.ret1m>=0?'+':''}{(t.ret1m*100).toFixed(1)}% · 1m</span>
            </div>
            <div style={{fontSize:11.5,color:'var(--ink-30)',lineHeight:1.45}}>{t.desc}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)',marginTop:8}}>{t.count} assets · View detail →</div>
          </button>
        ))}
      </div>

      {/* Universe table */}
      <SectionHead eyebrow={region==='IN' ? 'India universe' : region==='US' ? 'United States' : region==='EU' ? 'Europe' : region==='AS' ? 'Asia ex-India' : 'All regions'} title="Equities" meta={`${universe.length} symbols`}/>
      <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1.4fr 0.7fr 1fr 0.8fr 1fr 0.7fr',gap:12,padding:'10px 18px',fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div>Symbol</div><div>Exch</div><div>Price</div><div>Day Δ</div><div>30d</div><div style={{textAlign:'right'}}>M-cap</div>
        </div>
        {universe.map(u => (
          <button key={u.sym} onClick={() => go('terminal', u.sym)} style={{
            display:'grid',gridTemplateColumns:'1.4fr 0.7fr 1fr 0.8fr 1fr 0.7fr',gap:12,padding:'12px 18px',width:'100%',
            background:'transparent',border:'none',borderBottom:'1px solid rgba(255,255,255,0.04)',
            cursor:'pointer',color:'inherit',textAlign:'left',alignItems:'center',
          }}
          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{u.sym}</div>
              <div style={{fontSize:11.5,color:'var(--ink-30)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:280}}>{u.name}</div>
            </div>
            <span style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600}}>{u.ex}</span>
            <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-10)'}}>{u.region==='IN'?fmtINR(u.price):fmtUSD(u.price)}</span>
            <span style={{fontFamily:'var(--font-mono)',fontSize:12,color: u.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'}}>{u.dayPct>=0?'▲':'▼'} {(Math.abs(u.dayPct)*100).toFixed(2)}%</span>
            <Sparkline data={genSeries(u.sym, u.price, 30, 0.018, u.dayPct>0?0.001:-0.001)} w={80} h={20}/>
            <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)',textAlign:'right'}}>{u.mcap}</span>
          </button>
        ))}
      </div>
      <div style={{height:32}}/>
    </>
  );
};

const MarketClock = ({ region }) => {
  const map = {
    IN: { open:true, label:'NSE/BSE open · 14:22 IST · closes 15:30' },
    US: { open:true, label:'NYSE/NASDAQ open · 09:52 ET · closes 16:00' },
    EU: { open:true, label:'LSE/Xetra open · 14:52 CET · closes 17:30' },
    AS: { open:false, label:'TYO/HKG closed · opens 09:00 JST' },
    ALL:{ open:true, label:'Multiple sessions' },
  };
  const m = map[region];
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)'}}>
      <span style={{width:6,height:6,borderRadius:999,background:m.open?'var(--sage-500)':'var(--ink-40)',boxShadow:m.open?'0 0 0 3px rgba(111,174,136,0.16)':'none'}}/>
      {m.label}
    </div>
  );
};

const SectorHeatmap = ({ sectors }) => {
  // squarified-ish layout: 4 cols, weights determine width
  const total = sectors.reduce((s,x) => s + x.wt, 0);
  const tone = (pct) => {
    const max = 0.025;
    const p = Math.max(-1, Math.min(1, pct/max));
    if (p >= 0) return `rgba(111,174,136, ${0.10 + p*0.55})`;
    return `rgba(209,107,107, ${0.10 + (-p)*0.55})`;
  };
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(12, 1fr)',gap:4,minHeight:200}}>
      {sectors.map(s => {
        const cols = Math.max(2, Math.round((s.wt/total)*12));
        return (
          <div key={s.name} style={{
            gridColumn: `span ${cols}`,minHeight:60,
            padding:'10px 12px',borderRadius:6,
            background: tone(s.dayPct),border:'1px solid rgba(255,255,255,0.04)',
            display:'flex',flexDirection:'column',justifyContent:'space-between',
          }}>
            <div style={{fontFamily:'var(--font-heading)',fontSize:12,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.005em'}}>{s.name}</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)'}}>{(s.wt*100).toFixed(1)}%</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,color: s.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'}}>
                {s.dayPct>=0?'+':''}{(s.dayPct*100).toFixed(2)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

Object.assign(window, { MarketsPage });
