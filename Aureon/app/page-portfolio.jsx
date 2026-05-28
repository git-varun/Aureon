/* ============================================================
   Aureon — Portfolio + Assets index pages
   ============================================================ */

const TableHead = ({ cols }) => (
  <div style={{
    display:'grid',gridTemplateColumns: cols.map(c=>c.w).join(' '),
    gap:12,padding:'10px 16px',
    fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',
    color:'var(--ink-30)',fontWeight:600,
    borderBottom:'1px solid rgba(255,255,255,0.06)',
  }}>
    {cols.map((c,i) => <div key={i} style={{textAlign:c.align||'left'}}>{c.label}</div>)}
  </div>
);

const HoldingsRow = ({ h, go, recBadge }) => {
  const v = valueOf(h), pl = plOf(h);
  const costIsZero = !h.cost || h.cost === 0;
  const plPct = costIsZero ? null : plPctOf(h);
  const wt = v / NET_WORTH;
  return (
    <button onClick={() => go('assets', h.class, h.ticker)} style={{
      display:'grid',gridTemplateColumns:'1.6fr 0.9fr 1fr 1fr 1fr 1fr 1fr 0.5fr',
      gap:12,padding:'12px 16px',width:'100%',textAlign:'left',
      borderBottom:'1px solid rgba(255,255,255,0.04)',
      background:'transparent',cursor:'pointer',color:'inherit',
      transition:'background 120ms var(--ease-std)',
    }}
    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
    onMouseLeave={e => e.currentTarget.style.background='transparent'}
    >
      <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0}}>
        <div style={{
          width:32,height:32,borderRadius:8,
          display:'flex',alignItems:'center',justifyContent:'center',
          background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',
          fontFamily:'var(--font-mono)',fontSize:10.5,fontWeight:600,color:'var(--ink-10)',letterSpacing:'0.04em',
        }}>{h.ticker.slice(0,4)}</div>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{h.ticker}</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{h.name}</div>
        </div>
        {recBadge && <span style={{
          marginLeft:'auto',fontSize:9.5,padding:'2px 6px',borderRadius:999,letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600,
          background:'rgba(201,168,106,0.14)',color:'var(--aurum-100)',border:'1px solid rgba(201,168,106,0.30)',
        }}>Rec</span>}
      </div>
      <div style={{alignSelf:'center'}}>
        <TierChip tier={h.tier}/>
      </div>
      <div style={{alignSelf:'center',fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-10)'}}>
        ${h.price.toLocaleString(undefined, {minimumFractionDigits: h.price<10?2:2, maximumFractionDigits:2})}
      </div>
      <div style={{alignSelf:'center',display:'flex',justifyContent:'flex-start'}}>
        <Sparkline data={PRICE_SERIES[h.ticker] || [h.cost, h.price]} w={64} h={20}/>
      </div>
      <div style={{alignSelf:'center',fontFamily:'var(--font-mono)',fontSize:13,color: h.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'}}>
        {h.dayPct===0 ? '—' : (h.dayPct>=0?'▲':'▼')+' '+(Math.abs(h.dayPct)*100).toFixed(2)+'%'}
      </div>
      <div style={{alignSelf:'center',fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-00)'}}>
        ${Math.round(v).toLocaleString()}
      </div>
      <div style={{alignSelf:'center'}}>
        {costIsZero ? (
          <div title="Cost basis not recorded" style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-40)'}}>—</div>
        ) : (
          <div style={{fontFamily:'var(--font-mono)',fontSize:13,color: pl>=0?'var(--sage-500)':'var(--crimson-500)'}}>
            {pl>=0?'+':'−'}${Math.round(Math.abs(pl)).toLocaleString()}
          </div>
        )}
        <span
          title={costIsZero ? 'Cost basis not recorded' : undefined}
          style={{
            display:'inline-flex',alignItems:'center',marginTop:3,
            padding:'1px 6px',borderRadius:4,
            fontFamily:'var(--font-mono)',fontSize:10.5,
            background: costIsZero ? 'rgba(255,255,255,0.06)' : pl>=0 ? 'rgba(111,174,136,0.10)' : 'rgba(209,107,107,0.10)',
            color: costIsZero ? 'var(--ink-40)' : pl>=0 ? 'var(--sage-500)' : 'var(--crimson-500)',
          }}>
          {costIsZero ? '—' : `${plPct>=0?'+':'−'}${(Math.abs(plPct)*100).toFixed(1)}%`}
        </span>
      </div>
      <div style={{alignSelf:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)',textAlign:'right'}}>
        {(wt*100).toFixed(1)}%
      </div>
    </button>
  );
};

const Portfolio = ({ go }) => {
  const { search, allRecs, active } = useApp();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('value');

  const assetRecs = useMemo(() => {
    const map = {};
    allRecs.filter(r => active.includes(r.id) && r.scope?.kind==='asset').forEach(r => map[r.scope.ref] = true);
    return map;
  }, [allRecs, active]);

  const filtered = useMemo(() => {
    let h = HOLDINGS.slice();
    if (filter !== 'all') h = h.filter(x => x.tier === filter);
    if (search) h = h.filter(x => (x.ticker+' '+x.name+' '+CLASS_LABEL[x.class]).toLowerCase().includes(search.toLowerCase()));
    if (sort === 'value') h.sort((a,b) => valueOf(b)-valueOf(a));
    if (sort === 'day') h.sort((a,b) => b.dayPct - a.dayPct);
    if (sort === 'pl') h.sort((a,b) => plPctOf(b) - plPctOf(a));
    if (sort === 'ticker') h.sort((a,b) => a.ticker.localeCompare(b.ticker));
    return h;
  }, [filter, sort, search]);

  const totals = useMemo(() => ({
    value: filtered.reduce((s,h) => s + valueOf(h), 0),
    pl:    filtered.reduce((s,h) => s + plOf(h), 0),
    cost:  filtered.reduce((s,h) => s + costOf(h), 0),
  }), [filtered]);

  return (
    <>
      <div style={{padding:'8px 0 18px',display:'flex',alignItems:'flex-end',gap:32,borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:18,flexWrap:'wrap'}}>
        <div>
          <Eyebrow>Portfolio value</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:42,fontWeight:500,color:'var(--ink-00)',letterSpacing:'-0.02em',marginTop:6,lineHeight:1}}>
            ${Math.round(totals.value).toLocaleString()}
          </div>
        </div>
        <div>
          <Eyebrow>Unrealized P/L</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:24,fontWeight:500,color: totals.pl>=0?'var(--sage-500)':'var(--crimson-500)',marginTop:6}}>
            {totals.pl>=0?'+':'−'}${Math.round(Math.abs(totals.pl)).toLocaleString()}
            <span style={{fontSize:14,marginLeft:8,color:'var(--ink-30)'}}>({((totals.pl/totals.cost)*100).toFixed(1)}%)</span>
          </div>
        </div>
        <div>
          <Eyebrow>Holdings</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:24,fontWeight:500,color:'var(--ink-00)',marginTop:6}}>
            {filtered.length}<span style={{color:'var(--ink-40)',fontSize:14,marginLeft:6}}>of {HOLDINGS.length}</span>
          </div>
        </div>
        <div style={{flex:1,minWidth:280,display:'flex',justifyContent:'flex-end',gap:8,alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
            {[['all','All'],['active','Active'],['semi','Semi'],['passive','Passive']].map(([k,l]) => (
              <button key={k} onClick={() => setFilter(k)} style={{
                padding:'5px 12px',fontSize:11.5,borderRadius:6,border:'none',cursor:'pointer',
                background: filter===k ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: filter===k ? 'var(--ink-00)' : 'var(--ink-30)',
              }}>{l}</button>
            ))}
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{
            padding:'7px 12px',fontSize:12,borderRadius:8,
            background:'var(--canvas)',border:'1px solid rgba(255,255,255,0.10)',
            color:'var(--ink-10)',fontFamily:'var(--font-ui)',cursor:'pointer',colorScheme:'dark',outline:'none',
          }}>
            <option value="value">Sort: Value</option>
            <option value="day">Sort: Today change</option>
            <option value="pl">Sort: P/L %</option>
            <option value="ticker">Sort: Ticker</option>
          </select>
        </div>
      </div>

      <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
        <TableHead cols={[
          { label:'Asset',  w:'1.6fr' },
          { label:'Tier',   w:'0.9fr' },
          { label:'Price',  w:'1fr' },
          { label:'60d',    w:'1fr' },
          { label:'Day Δ',  w:'1fr' },
          { label:'Value',  w:'1fr' },
          { label:'Unreal P/L', w:'1fr' },
          { label:'Wt',     w:'0.5fr', align:'right' },
        ]}/>
        {filtered.length === 0 ? (
          <div style={{padding:40,textAlign:'center',color:'var(--ink-30)'}}>No holdings match.</div>
        ) : filtered.map(h => (
          <HoldingsRow key={h.id} h={h} go={go} recBadge={!!assetRecs[h.ticker]}/>
        ))}
      </div>

      <div style={{marginTop:14,fontSize:11.5,color:'var(--ink-40)',display:'flex',gap:18,alignItems:'center'}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}><span style={{width:7,height:7,background:'var(--aurum-500)',borderRadius:2}}/> Rec badge → asset has an active recommendation</span>
        <span>·</span>
        <span>Passive assets (real estate, retirement, insurance) contribute to net worth and allocation, not signals.</span>
      </div>
      <div style={{height:24}}/>
    </>
  );
};

/* ---------- Assets index — grouped by class ---------- */
const AssetsIndex = ({ go }) => {
  const { allRecs, active } = useApp();
  const grouped = useMemo(() => {
    const g = {};
    HOLDINGS.forEach(h => { (g[h.class] = g[h.class] || []).push(h); });
    return g;
  }, []);
  const recsByAsset = useMemo(() => {
    const m = {};
    allRecs.filter(r => active.includes(r.id)).forEach(r => {
      if (r.scope?.kind === 'asset') m[r.scope.ref] = r;
    });
    return m;
  }, [allRecs, active]);

  const order = ['stocks','crypto','funds','bonds','real_estate','retirement','insurance'];
  const allocs = allocByClass();

  return (
    <>
      <div style={{padding:'8px 0 18px',borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:18}}>
        <Eyebrow>Asset classes</Eyebrow>
        <div style={{fontFamily:'var(--font-heading)',fontSize:24,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.015em',marginTop:6}}>
          Seven classes · ${Math.round(NET_WORTH).toLocaleString()} under management
        </div>
        <div style={{fontSize:12,color:'var(--ink-30)',marginTop:6,maxWidth:680}}>
          Active assets receive real-time signals and recommendations. Semi-active receive low-frequency recommendations. Passive (real estate, retirement, insurance) are tracked for net worth and allocation only.
        </div>
      </div>

      {order.map(cls => {
        const items = grouped[cls] || []; if (!items.length) return null;
        const value = items.reduce((s,h) => s + valueOf(h), 0);
        const tier = items[0].tier;
        return (
          <section key={cls} style={{marginBottom:24}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'baseline',gap:14}}>
                <h3 style={{margin:0,fontFamily:'var(--font-heading)',fontSize:18,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em'}}>{CLASS_LABEL[cls]}</h3>
                <TierChip tier={tier}/>
                <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-30)'}}>
                  ${Math.round(value).toLocaleString()} · {((value/NET_WORTH)*100).toFixed(1)}% · target {((CLASS_TARGET[cls]||0)*100).toFixed(0)}%
                </span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <div style={{width:120}}>
                  <MiniBar value={(allocs[cls]||0)} target={CLASS_TARGET[cls]} max={0.5}/>
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)'}}>{items.length} {items.length===1?'holding':'holdings'}</span>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:10}}>
              {items.map(h => (
                <button key={h.id} onClick={() => go('assets', h.class, h.ticker)} style={{
                  textAlign:'left',cursor:'pointer',padding:'12px 14px',borderRadius:10,
                  background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)',color:'inherit',
                }}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{h.ticker}</span>
                    {recsByAsset[h.ticker] && (
                      <span style={{fontSize:9.5,padding:'2px 6px',borderRadius:999,letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600,
                        background:'rgba(201,168,106,0.14)',color:'var(--aurum-100)'}}>Rec</span>
                    )}
                  </div>
                  <div style={{fontSize:11.5,color:'var(--ink-30)',marginBottom:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{h.name}</div>
                  <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:8}}>
                    <div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:16,color:'var(--ink-00)',fontWeight:500}}>${Math.round(valueOf(h)).toLocaleString()}</div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:11,color: plOf(h)>=0?'var(--sage-500)':'var(--crimson-500)'}}>
                        {plOf(h)>=0?'+':'−'}{(Math.abs(plPctOf(h))*100).toFixed(1)}% all-time
                      </div>
                    </div>
                    {h.tier !== 'passive' && <Sparkline data={PRICE_SERIES[h.ticker] || [h.cost,h.price]} w={70} h={22}/>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <div style={{height:24}}/>
    </>
  );
};

Object.assign(window, { Portfolio, AssetsIndex });
