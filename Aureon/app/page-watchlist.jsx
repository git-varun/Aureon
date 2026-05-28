/* ============================================================
   Aureon — Watchlist (lists, alerts, sparklines)
   ============================================================ */

/* SEED_WATCHLIST in data-india.jsx is a flat array of symbols.
   Wrap it into named lists here for the watchlist UI. */
const WATCH_LISTS = [
  { id:'l-prime',  name:'Prime',           symbols: SEED_WATCHLIST,                        alerts: 4 },
  { id:'l-india',  name:'India momentum',  symbols: ['BHARTIARTL','SBIN','INFY','LT','ICICIBANK'], alerts: 2 },
  { id:'l-funds',  name:'SIPs & funds',    symbols: ['PPFAS-FLEXI','QUANT-SMALL','MIRAE-LARGE','AXIS-BLUE','NIFTYBEES'], alerts: 1 },
  { id:'l-global', name:'Global tech',     symbols: ['NVDA','AAPL','MSFT','GOOGL','TSLA','ASML'], alerts: 3 },
];

const Watchlist = ({ go }) => {
  const [activeList, setActiveList] = useState(WATCH_LISTS[0].id);
  const list = WATCH_LISTS.find(l => l.id === activeList) || WATCH_LISTS[0];
  const items = list.symbols.map(s => IN_UNIVERSE.find(u => u.sym === s)).filter(Boolean);

  return (
    <>
      <SectionHead eyebrow="Watchlist" title={list.name} meta={`${items.length} symbols · ${list.alerts || 0} alerts armed`}/>

      {/* List tabs */}
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {WATCH_LISTS.map(l => (
          <button key={l.id} onClick={() => setActiveList(l.id)} style={{
            padding:'6px 12px',fontSize:12,borderRadius:6,cursor:'pointer',
            background: activeList===l.id ? 'rgba(201,168,106,0.14)' : 'rgba(255,255,255,0.025)',
            color: activeList===l.id ? 'var(--aurum-100)' : 'var(--ink-30)',
            border:'1px solid '+(activeList===l.id?'rgba(201,168,106,0.30)':'rgba(255,255,255,0.06)'),
            fontWeight: activeList===l.id ? 500 : 400,
          }}>{l.name} · {l.symbols.length}</button>
        ))}
        <button className="du3-cta ghost" style={{padding:'0 12px',fontSize:12}}>+ New list</button>
      </div>

      {/* Table */}
      <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1.5fr 0.6fr 0.9fr 0.7fr 1fr 0.9fr 0.5fr',gap:12,padding:'10px 18px',fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div>Symbol</div><div>Exch</div><div>Price</div><div>Day Δ</div><div>30d</div><div>Alert</div><div></div>
        </div>
        {items.map(u => {
          const ai = TERMINAL_AI[u.sym];
          return (
            <div key={u.sym} style={{
              display:'grid',gridTemplateColumns:'1.5fr 0.6fr 0.9fr 0.7fr 1fr 0.9fr 0.5fr',gap:12,padding:'12px 18px',
              borderBottom:'1px solid rgba(255,255,255,0.04)',alignItems:'center',
            }}>
              <button onClick={() => go('terminal', u.sym)} style={{display:'flex',alignItems:'center',gap:10,background:'none',border:'none',color:'inherit',cursor:'pointer',textAlign:'left',padding:0}}>
                <div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{u.sym}</div>
                  <div style={{fontSize:11.5,color:'var(--ink-30)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:240}}>{u.name}</div>
                  {ai && <div style={{fontSize:10.5,color:'var(--aurum-100)',marginTop:3,letterSpacing:'-0.005em'}}>· AI: {ai.take.slice(0, 56)}…</div>}
                </div>
              </button>
              <span style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600}}>{u.ex}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-10)'}}>{u.region==='IN'?fmtINR(u.price):fmtUSD(u.price)}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:12,color: u.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'}}>{u.dayPct>=0?'▲':'▼'} {(Math.abs(u.dayPct)*100).toFixed(2)}%</span>
              <Sparkline data={genSeries(u.sym, u.price, 30, 0.018, u.dayPct>0?0.001:-0.001)} w={90} h={22}/>
              <AlertChip sym={u.sym} price={u.price}/>
              <button onClick={() => alert('Removed (demo)')} className="du3-cta ghost" style={{padding:'0 10px',fontSize:11}}>−</button>
            </div>
          );
        })}
      </div>
      <div style={{height:32}}/>
    </>
  );
};

const AlertChip = ({ sym, price }) => {
  // pseudo-random whether an alert is set
  const armed = (sym.charCodeAt(0) + sym.charCodeAt(1)) % 3 !== 0;
  if (!armed) {
    return <button className="du3-cta ghost" style={{padding:'0 10px',fontSize:11}}>+ alert</button>;
  }
  const above = (sym.charCodeAt(2) % 2) === 0;
  const target = above ? price * 1.05 : price * 0.95;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--aurum-100)'}}>
      <span style={{width:6,height:6,borderRadius:999,background:'var(--aurum-500)'}}/>
      {above?'≥':'≤'} ₹{Math.round(target).toLocaleString('en-IN')}
    </span>
  );
};

Object.assign(window, { Watchlist });
