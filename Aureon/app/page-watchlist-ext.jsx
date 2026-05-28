/* ============================================================
   Aureon — Watchlist with inline asset search
   Replaces v3 Watchlist. Search popover surfaces assets across
   the full IN_UNIVERSE with class grouping + "Already in list".
   ============================================================ */

const WATCH_LISTS = [
  { id:'l-prime',  name:'Prime',          symbols: SEED_WATCHLIST,                                                              alerts: 4 },
  { id:'l-india',  name:'India momentum', symbols: ['BHARTIARTL','SBIN','INFY','LT','ICICIBANK'],                                alerts: 2 },
  { id:'l-funds',  name:'SIPs & funds',   symbols: ['PPFAS-FLEXI','QUANT-SMALL','MIRAE-LARGE','AXIS-BLUE','NIFTYBEES'],          alerts: 1 },
  { id:'l-global', name:'Global tech',    symbols: ['NVDA','AAPL','MSFT','GOOGL','TSLA','ASML'],                                 alerts: 3 },
];

/* Asset class display labels — match Markets vocabulary */
const _W_CLASS_LABEL = {
  stocks:     'Equities',
  funds:      'Funds & ETFs',
  bonds:      'Bonds',
  crypto:     'Crypto',
  retirement: 'Retirement schemes',
};
const _W_CLASS_ORDER = ['stocks','funds','bonds','crypto','retirement'];

/* Search ranking: exact ticker > ticker prefix > ticker fuzzy > name fuzzy */
const _searchUniverse = (q, universe) => {
  const query = q.trim().toUpperCase();
  if (!query) return [];
  const out = [];
  for (const u of universe) {
    const sym = u.sym.toUpperCase();
    const name = u.name.toUpperCase();
    let score = -1, exact = false;
    if (sym === query)                  { score = 100; exact = true; }
    else if (sym.startsWith(query))     score = 80;
    else if (sym.includes(query))       score = 60;
    else if (name.startsWith(query))    score = 50;
    else if (name.includes(query))      score = 30;
    if (score >= 0) out.push({ u, score, exact });
  }
  return out.sort((a,b) => b.score - a.score);
};

const Watchlist = ({ go }) => {
  const v4 = useShell();
  const [activeListId, setActiveListId] = useState(WATCH_LISTS[0].id);
  // make lists live so we can add/remove
  const [lists, setLists] = useState(() => WATCH_LISTS.map(l => ({...l})));
  const list = lists.find(l => l.id === activeListId) || lists[0];

  const items = list.symbols.map(s => IN_UNIVERSE.find(u => u.sym === s)).filter(Boolean);

  const addToList = (sym) => {
    setLists(ls => ls.map(l => l.id === activeListId
      ? (l.symbols.includes(sym) ? l : { ...l, symbols:[sym, ...l.symbols] })
      : l));
  };
  const removeFromList = (sym) => {
    setLists(ls => ls.map(l => l.id === activeListId
      ? { ...l, symbols: l.symbols.filter(s => s !== sym) }
      : l));
  };

  return (
    <>
      <div style={{display:'flex',alignItems:'flex-start',gap:16,marginBottom:14}}>
        <div style={{flex:1,minWidth:0}}>
          <SectionHead eyebrow="Watchlist" title={list.name} meta={`${items.length} symbols · ${list.alerts || 0} alerts armed`}/>
        </div>
      </div>

      {/* List tabs */}
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {lists.map(l => (
          <button key={l.id} onClick={() => setActiveListId(l.id)} style={{
            padding:'6px 12px',fontSize:12,borderRadius:6,cursor:'pointer',
            background: activeListId===l.id ? 'rgba(201,168,106,0.14)' : 'rgba(255,255,255,0.025)',
            color: activeListId===l.id ? 'var(--aurum-100)' : 'var(--ink-30)',
            border:'1px solid '+(activeListId===l.id?'rgba(201,168,106,0.30)':'rgba(255,255,255,0.06)'),
            fontWeight: activeListId===l.id ? 500 : 400,
          }}>{l.name} · {l.symbols.length}</button>
        ))}
        <button className="du3-cta ghost" style={{padding:'0 12px',fontSize:12}}>+ New list</button>
      </div>

      {/* Inline asset search */}
      <WatchlistSearchBar onAdd={addToList} listSymbols={list.symbols}/>

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
              <AlertChip sym={u.sym} price={u.price} region={u.region}/>
              <button onClick={() => removeFromList(u.sym)} className="du3-cta ghost" style={{padding:'0 10px',fontSize:11}}>−</button>
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{padding:'28px 18px',textAlign:'center',color:'var(--ink-40)',fontSize:12.5}}>
            List is empty. Use the search above to add assets.
          </div>
        )}
      </div>
      <div style={{height:32}}/>
    </>
  );
};

/* ---------- Search bar with popover results ---------- */
const WatchlistSearchBar = ({ onAdd, listSymbols }) => {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => _searchUniverse(q, IN_UNIVERSE).slice(0, 24), [q]);
  const open = focused && q.trim().length > 0;

  // group by class, but always keep an exact-match row pinned at the top
  const exact = results.find(r => r.exact);
  const grouped = useMemo(() => {
    const byClass = {};
    for (const r of results) {
      if (r.exact) continue;
      const k = r.u.class;
      (byClass[k] = byClass[k] || []).push(r);
    }
    return _W_CLASS_ORDER
      .map(k => ({ key:k, label: _W_CLASS_LABEL[k] || k, items: byClass[k] || [] }))
      .filter(g => g.items.length > 0);
  }, [results]);

  // flat list for keyboard nav
  const flat = useMemo(() => {
    const out = [];
    if (exact) out.push(exact);
    grouped.forEach(g => g.items.forEach(i => out.push(i)));
    return out;
  }, [exact, grouped]);

  useEffect(() => { setActiveIdx(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setFocused(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(flat.length-1, i+1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i-1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = flat[activeIdx];
      if (pick) {
        const already = listSymbols.includes(pick.u.sym);
        if (!already) onAdd(pick.u.sym);
        setQ('');
      }
    } else if (e.key === 'Escape') {
      setFocused(false);
      e.target.blur();
    }
  };

  return (
    <div ref={ref} style={{position:'relative', marginBottom:14}}>
      <div style={{
        display:'flex',alignItems:'center',gap:10,
        height:38, padding:'0 14px',
        background:'rgba(255,255,255,0.03)',
        border:'1px solid '+(focused?'rgba(201,168,106,0.30)':'rgba(255,255,255,0.07)'),
        borderRadius: open ? '8px 8px 0 0' : 8,
        transition:'border-color 120ms var(--ease-std), border-radius 120ms var(--ease-std)',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--ink-40)'}}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKey}
          placeholder="Search assets to add — try a ticker like NVDA or TCS"
          style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--ink-00)',fontSize:13,fontFamily:'var(--font-ui)'}}
        />
        {q && <button onClick={() => setQ('')} style={{background:'none',border:'none',color:'var(--ink-40)',cursor:'pointer',fontSize:14,padding:'2px 4px'}}>×</button>}
        <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-40)',padding:'2px 5px',background:'rgba(255,255,255,0.04)',borderRadius:3}}>↵ add</span>
      </div>

      {open && (
        <div ref={listRef} style={{
          position:'absolute', top:'calc(100% - 1px)', left:0, right:0, zIndex:200,
          maxHeight:420, overflowY:'auto',
          background:'rgba(18,20,24,0.98)',
          border:'1px solid rgba(201,168,106,0.30)',
          borderTop:'1px solid rgba(255,255,255,0.06)',
          borderRadius:'0 0 10px 10px',
          boxShadow:'0 24px 64px rgba(0,0,0,0.55)',
          backdropFilter:'blur(24px)',
        }}>
          {flat.length === 0 ? (
            <div style={{padding:'18px 16px',fontSize:12.5,color:'var(--ink-40)',textAlign:'center'}}>
              No matches — try a ticker like <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-20)'}}>NVDA</span> or <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-20)'}}>TCS</span>.
            </div>
          ) : (
            <>
              {exact && (
                <>
                  <div style={{fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600,padding:'10px 14px 6px'}}>
                    Exact match
                  </div>
                  <SearchRow r={exact} active={flat.indexOf(exact)===activeIdx} already={listSymbols.includes(exact.u.sym)} onPick={() => { if (!listSymbols.includes(exact.u.sym)) onAdd(exact.u.sym); setQ(''); }}/>
                </>
              )}
              {grouped.map(g => (
                <div key={g.key}>
                  <div style={{fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,padding:'10px 14px 6px',borderTop: exact || grouped.indexOf(g)>0 ? '1px solid rgba(255,255,255,0.04)' : 'none'}}>
                    {g.label} · {g.items.length}
                  </div>
                  {g.items.map(r => (
                    <SearchRow key={r.u.sym} r={r} active={flat.indexOf(r)===activeIdx} already={listSymbols.includes(r.u.sym)} onPick={() => { if (!listSymbols.includes(r.u.sym)) onAdd(r.u.sym); setQ(''); }}/>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const SearchRow = ({ r, active, already, onPick }) => {
  const u = r.u;
  const initials = u.sym.slice(0,2);
  return (
    <button onClick={onPick} disabled={already} style={{
      display:'grid', gridTemplateColumns:'28px 1fr auto auto', gap:12, alignItems:'center',
      width:'100%', textAlign:'left',
      padding:'8px 14px', borderRadius:0, cursor: already ? 'default' : 'pointer',
      background: active && !already ? 'rgba(201,168,106,0.10)' : 'transparent',
      border:'none',
      borderLeft: active && !already ? '2px solid var(--aurum-100)' : '2px solid transparent',
      opacity: already ? 0.55 : 1,
    }}
    onMouseEnter={(e) => { if (!already && !active) e.currentTarget.style.background='rgba(255,255,255,0.03)'; }}
    onMouseLeave={(e) => { if (!already && !active) e.currentTarget.style.background='transparent'; }}>
      <span style={{
        width:24, height:24, borderRadius:5, display:'flex',alignItems:'center',justifyContent:'center',
        fontFamily:'var(--font-mono)',fontSize:9.5,fontWeight:600,letterSpacing:'0.04em',
        background:'rgba(201,168,106,0.08)',border:'1px solid rgba(201,168,106,0.18)',color:'var(--aurum-100)',
      }}>{initials}</span>
      <div style={{minWidth:0}}>
        <div style={{display:'flex',alignItems:'baseline',gap:8}}>
          <span style={{fontSize:13,color:'var(--ink-00)',fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:260}}>{u.name}</span>
          <span style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:'var(--ink-20)',letterSpacing:'0.04em',fontWeight:600}}>{u.sym}</span>
        </div>
        <div style={{fontSize:11,color:'var(--ink-40)',marginTop:2,display:'flex',gap:6,alignItems:'center'}}>
          <span>{_W_CLASS_LABEL[u.class] || u.class}</span>
          <span style={{width:2,height:2,borderRadius:999,background:'var(--ink-40)'}}/>
          <span>{u.sector}</span>
        </div>
      </div>
      <span style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.10em',color:'var(--ink-40)',fontWeight:600,textTransform:'uppercase'}}>{u.ex}</span>
      {already ? (
        <span style={{fontSize:10.5,color:'var(--sage-500)',fontFamily:'var(--font-mono)',padding:'3px 8px',background:'rgba(111,174,136,0.10)',border:'1px solid rgba(111,174,136,0.18)',borderRadius:999}}>In list</span>
      ) : (
        <span style={{fontSize:10.5,color:'var(--aurum-100)',fontFamily:'var(--font-mono)',padding:'3px 8px',background:'rgba(201,168,106,0.10)',border:'1px solid rgba(201,168,106,0.22)',borderRadius:999}}>+ Add</span>
      )}
    </button>
  );
};

const AlertChip = ({ sym, price, region }) => {
  // Seed initial state from existing random logic
  const seedArmed = (sym.charCodeAt(0) + sym.charCodeAt(1)) % 3 !== 0;
  const seedTarget = seedArmed
    ? Math.round((sym.charCodeAt(2) % 2) === 0 ? price * 1.05 : price * 0.95)
    : null;

  const [alertPrice, setAlertPrice] = useState(seedTarget);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const startEdit = () => { setInputVal(String(Math.round(price * 1.05))); setEditing(true); };

  const saveAlert = () => {
    const p = parseFloat(inputVal);
    if (!isNaN(p) && p > 0) {
      // TODO: call apiService.setWatchlistAlert(wlId, sym, p)
      setAlertPrice(p);
    }
    setEditing(false);
  };

  const clearAlert = () => {
    // TODO: call apiService.clearWatchlistAlert(wlId, sym)
    setAlertPrice(null);
  };

  if (editing) {
    return (
      <div style={{display:'flex',alignItems:'center',gap:4}}>
        <div style={{position:'relative'}}>
          <span style={{position:'absolute',left:6,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'var(--ink-30)',fontFamily:'var(--font-mono)',pointerEvents:'none'}}>₹</span>
          <input autoFocus type="number" value={inputVal} onChange={e=>setInputVal(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') saveAlert(); if(e.key==='Escape') setEditing(false); }}
            style={{width:90,height:24,padding:'0 6px 0 18px',borderRadius:4,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(201,168,106,0.35)',color:'var(--ink-00)',fontSize:11,fontFamily:'var(--font-mono)',outline:'none'}}/>
        </div>
        <button onClick={saveAlert} className="du3-cta" style={{padding:'0 8px',height:24,fontSize:11}}>Set</button>
        <button onClick={()=>setEditing(false)} className="du3-cta ghost" style={{padding:'0 6px',height:24,fontSize:11}}>✕</button>
      </div>
    );
  }

  if (!alertPrice) {
    return <button onClick={startEdit} className="du3-cta ghost" style={{padding:'0 10px',fontSize:11}}>+ alert</button>;
  }

  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--aurum-100)'}}>
      <span style={{width:6,height:6,borderRadius:999,background:'var(--aurum-500)'}}/>
      {alertPrice >= price ? '≥' : '≤'} {region==='IN' ? fmtINR(alertPrice,{dp:0}) : fmtUSD(alertPrice,{dp:0})}
      <button onClick={clearAlert} style={{background:'none',border:'none',color:'var(--ink-40)',cursor:'pointer',padding:0,fontSize:13,lineHeight:1}}>×</button>
    </span>
  );
};

Object.assign(window, { Watchlist });
