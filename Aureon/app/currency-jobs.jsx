/* ============================================================
   Aureon — Currency layer + Jobs layer + TopBar primitives
    Loaded after main-v2 collaborators but before
   main-v4 so the latter can wrap AppProvider with ShellProvider.
   ============================================================ */

const ShellContext = React.createContext(null);
const useShell = () => React.useContext(ShellContext);

/* ---------- Job definitions: which manual jobs surface where ---------- */
const JOB_DEFS = {
  dashboard: [
    { id:'j-prices',    name:'Refresh price data',      desc:'Pull last close from connected providers',    duration: 1600 },
    { id:'j-briefing',  name:'Run AI briefing',         desc:'Portfolio · macro · news synthesis',          duration: 2400 },
    { id:'j-providers', name:'Sync providers',          desc:'Reconcile holdings across brokers',           duration: 2000 },
  ],
  portfolio: [
    { id:'j-prices',    name:'Refresh price data',      desc:'Latest close across positions',               duration: 1600 },
    { id:'j-analytics', name:'Recompute analytics',     desc:'Drift · attribution · risk metrics',          duration: 2200 },
    { id:'j-providers', name:'Sync providers',          desc:'Pull fresh holdings from brokers',            duration: 2000 },
  ],
  assets: [
    { id:'j-prices',    name:'Refresh price',           desc:'Latest close for this asset',                 duration: 1200 },
    { id:'j-ai',        name:'Run AI analysis',         desc:'On-demand AI take · appends below existing',  duration: 2600 },
    { id:'j-news',      name:'Refresh sentiment & news',desc:'Pull latest brokerage and news flow',         duration: 1800 },
  ],
  signals: [
    { id:'j-signals',   name:'Regenerate signals',      desc:'Momentum · sentiment · allocation · vol',     duration: 2000 },
    { id:'j-news',      name:'Refresh sentiment',       desc:'Recompute sentiment scores',                  duration: 1600 },
  ],
  watchlist: [
    { id:'j-prices',    name:'Refresh prices',          desc:'Last close for watchlist symbols',            duration: 1400 },
    { id:'j-alerts',    name:'Re-evaluate alerts',      desc:'Check armed thresholds against latest',       duration: 1200 },
  ],
};

/* AI take synthesizer — for "Run AI analysis" on Asset Detail */
const _AI_PHRASES_POS = [
  'Earnings momentum and operating leverage support a constructive setup; consensus revisions are tracking higher.',
  'Cash flow conversion is improving sequentially; valuation premium is justified by re-rating odds.',
  'Order book visibility into FY27 is firming; margin glide path is intact.',
  'Sector rotation favors the name; institutional positioning has room to add.',
];
const _AI_PHRASES_NEU = [
  'Mixed signal: tape strength offset by stretched positioning; size discipline matters more than direction here.',
  'Catalysts are balanced over the next 4–6 weeks; await the next print before adding.',
  'Position sizing within current band; no thesis change.',
];
const _AI_PHRASES_NEG = [
  'Negative revision pressure persists; downside skew dominates over a 1-month window.',
  'Demand softness in domestic verticals is not yet priced; trim into rallies.',
  'Volatility regime is elevated; risk-adjusted reward asymmetric to the downside short-term.',
];
const _AI_TONES = [
  { label:'Constructive', color:'var(--sage-500)',    bg:'rgba(111,174,136,0.10)',  border:'rgba(111,174,136,0.28)',  bag:_AI_PHRASES_POS },
  { label:'Neutral',      color:'var(--aurum-100)',   bg:'rgba(201,168,106,0.10)',  border:'rgba(201,168,106,0.28)',  bag:_AI_PHRASES_NEU },
  { label:'Cautious',     color:'var(--crimson-500)', bg:'rgba(201,82,82,0.10)',    border:'rgba(201,82,82,0.28)',    bag:_AI_PHRASES_NEG },
];
const synthesizeAITake = (ticker) => {
  const tone = _AI_TONES[Math.floor(Math.random()*_AI_TONES.length)];
  const phrase = tone.bag[Math.floor(Math.random()*tone.bag.length)];
  return { tone:tone.label, color:tone.color, bg:tone.bg, border:tone.border, text:phrase, confidence: 0.58 + Math.random()*0.32 };
};

/* ---------- V4 Provider: currency, jobs, AI runs ---------- */
const ShellProvider = ({ children }) => {
  const [currency, setCurrencyState] = useState(() => {
    const c = localStorage.getItem('aureon.currency');
    return SUPPORTED_CURRENCIES.includes(c) ? c : 'INR';
  });
  // keep the window flag in sync so fmtMoney can read it without context
  useEffect(() => {
    window.__aureonCurrency = currency;
    try { localStorage.setItem('aureon.currency', currency); } catch(_){}
  }, [currency]);

  const setCurrency = (c) => {
    if (SUPPORTED_CURRENCIES.includes(c)) setCurrencyState(c);
  };

  // Jobs
  const [running, setRunning]         = useState([]);          // [{runId, jobId, name, screen, ticker, progress, startedAt}]
  const [jobHistory, setJobHistory]   = useState({});          // { jobId: { last, status } }
  const [aiRuns, setAiRuns]           = useState({});          // ticker -> [{ id, ts, tone, color, text, confidence }]
  const tickRef = useRef(null);

  const runJob = ({ jobId, name, screen, ticker, durationMs, payload }) => {
    const runId = 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
    const dur = durationMs || 1800;
    setRunning(rs => [...rs, { runId, jobId, name, screen, ticker, progress: 0.02, startedAt: Date.now(), durationMs: dur }]);
  };

  // animation loop
  useEffect(() => {
    if (running.length === 0) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      const now = Date.now();
      let didComplete = false;
      setRunning(rs => {
        const next = [];
        for (const r of rs) {
          const p = Math.min(1, (now - r.startedAt) / r.durationMs);
          if (p >= 1) {
            didComplete = true;
            setJobHistory(h => ({ ...h, [r.jobId]: { last: now, status: 'ok' } }));
            if (r.jobId === 'j-ai' && r.ticker) {
              const take = synthesizeAITake(r.ticker);
              setAiRuns(a => ({
                ...a,
                [r.ticker]: [ ...(a[r.ticker] || []), { id: r.runId, ts: now, ...take } ],
              }));
            }
          } else {
            next.push({ ...r, progress: p });
          }
        }
        return next;
      });
    }, 80);
    return () => {};
  }, [running.length]);

  return (
    <ShellContext.Provider value={{
      currency, setCurrency,
      running, jobHistory, runJob,
      aiRuns,
    }}>{children}</ShellContext.Provider>
  );
};

/* ============================================================
   Currency Selector — compact dropdown in TopBar
   ============================================================ */
const CurrencyMenu = () => {
  const { currency, setCurrency } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const meta = CURRENCY_META[currency];

  return (
    <div ref={ref} style={{position:'relative'}}>
      <button onClick={() => setOpen(o => !o)} aria-label="Display currency" style={{
        display:'flex',alignItems:'center',gap:7,height:30,padding:'0 10px',
        borderRadius:6, cursor:'pointer',
        background: open ? 'rgba(201,168,106,0.10)' : 'rgba(255,255,255,0.03)',
        border:'1px solid '+(open?'rgba(201,168,106,0.30)':'rgba(255,255,255,0.07)'),
        color: open ? 'var(--aurum-100)' : 'var(--ink-10)',
        fontFamily:'var(--font-mono)', fontSize:11.5, letterSpacing:'0.04em',
        transition:'background 120ms var(--ease-std), border-color 120ms var(--ease-std)',
      }}>
        <span style={{opacity:0.75}}>{meta.symbol}</span>
        <span style={{fontWeight:600}}>{meta.code}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.5,transform:open?'rotate(180deg)':'none',transition:'transform 140ms var(--ease-std)'}}><path d="M2 4l3 3 3-3"/></svg>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:300,
          minWidth:240, padding:6,
          borderRadius:10, background:'rgba(18,20,24,0.96)',
          border:'1px solid rgba(255,255,255,0.10)',
          boxShadow:'0 24px 64px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.30)',
          backdropFilter:'blur(24px)',
          animation:'cardEnter 160ms var(--ease-decel)',
        }}>
          <div style={{fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,padding:'8px 10px 6px'}}>
            Display currency
          </div>
          {SUPPORTED_CURRENCIES.map(code => {
            const m = CURRENCY_META[code];
            const active = code === currency;
            return (
              <button key={code} onClick={() => { setCurrency(code); setOpen(false); }} style={{
                display:'grid', gridTemplateColumns:'22px 1fr auto', gap:10, alignItems:'center',
                width:'100%', padding:'8px 10px', borderRadius:6, cursor:'pointer',
                background: active ? 'rgba(201,168,106,0.14)' : 'transparent',
                border:'none', textAlign:'left',
                color: active ? 'var(--aurum-100)' : 'var(--ink-10)',
              }}>
                <span style={{fontFamily:'var(--font-mono)', fontSize:14, textAlign:'center', opacity:0.85}}>{m.symbol}</span>
                <span style={{display:'flex', flexDirection:'column', gap:2}}>
                  <span style={{fontFamily:'var(--font-mono)', fontSize:12, fontWeight:600, letterSpacing:'0.04em'}}>{m.code}</span>
                  <span style={{fontSize:11, color:'var(--ink-40)'}}>{m.name}</span>
                </span>
                {active && <span style={{fontSize:12, color:'var(--aurum-100)'}}>✓</span>}
              </button>
            );
          })}
          <div style={{fontSize:10.5,color:'var(--ink-40)',padding:'8px 10px 4px',borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:4,lineHeight:1.5}}>
            Converts all values at the presentation layer. Source currency is preserved internally.
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   Run Menu — contextual job triggers per screen
   ============================================================ */
const _fmtAgo = (ts) => {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
};

const RunMenu = ({ screen, ticker }) => {
  const v4 = useShell();
  const { running, jobHistory, runJob } = v4;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const jobs = JOB_DEFS[screen] || [];
  if (jobs.length === 0) return null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // tick to refresh "Xs ago"
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(x => x+1), 5000);
    return () => clearInterval(t);
  }, []);

  const myRunning = running.filter(r => r.screen === screen && (!ticker || r.ticker === ticker));
  const isRunning = myRunning.length > 0;

  const handle = (j) => {
    runJob({
      jobId: j.id,
      name: j.name,
      screen,
      ticker,
      durationMs: j.duration,
    });
  };

  return (
    <div ref={ref} style={{position:'relative', display:'inline-flex'}}>
      <button onClick={() => setOpen(o => !o)} className="du3-cta ghost" style={{
        height:30, padding:'0 12px', display:'inline-flex', alignItems:'center', gap:8,
        background: isRunning ? 'rgba(201,168,106,0.08)' : (open?'rgba(255,255,255,0.05)':'rgba(255,255,255,0.025)'),
        border:'1px solid '+(isRunning?'rgba(201,168,106,0.28)':(open?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.07)')),
        color: isRunning ? 'var(--aurum-100)' : 'var(--ink-10)',
        fontSize:11.5, position:'relative', overflow:'hidden',
      }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
             style={{animation: isRunning ? 'spin 1.4s linear infinite' : 'none'}}>
          <path d="M2 8a6 6 0 1 0 1.5-4"/><path d="M2 2v4h4"/>
        </svg>
        <span>{isRunning ? `Running · ${myRunning.length}` : 'Run'}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.5,transform:open?'rotate(180deg)':'none',transition:'transform 140ms var(--ease-std)'}}><path d="M2 4l3 3 3-3"/></svg>
        {isRunning && (
          <span style={{
            position:'absolute', left:0, bottom:0, height:1.5,
            width: (myRunning.reduce((s,r)=>s+r.progress,0)/myRunning.length * 100) + '%',
            background:'var(--aurum-100)', transition:'width 90ms linear',
          }}/>
        )}
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:300,
          width:320, padding:6,
          borderRadius:10, background:'rgba(18,20,24,0.96)',
          border:'1px solid rgba(255,255,255,0.10)',
          boxShadow:'0 24px 64px rgba(0,0,0,0.55)',
          backdropFilter:'blur(24px)',
          animation:'cardEnter 160ms var(--ease-decel)',
        }}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',padding:'8px 10px 6px'}}>
            <span style={{fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Run · this screen</span>
            <button onClick={() => { location.hash = '/settings'; setOpen(false); }} style={{background:'none',border:'none',color:'var(--ink-40)',fontSize:10.5,cursor:'pointer',padding:0}}>All jobs →</button>
          </div>
          {jobs.map(j => {
            const r = running.find(x => x.jobId === j.id && x.screen === screen && (!ticker || x.ticker === ticker));
            const hist = jobHistory[j.id];
            const status = r ? 'running' : (hist ? 'ok' : 'idle');
            return (
              <button key={j.id} disabled={!!r} onClick={() => handle(j)} style={{
                display:'block', width:'100%', textAlign:'left',
                padding:'9px 10px', borderRadius:6, cursor: r ? 'wait' : 'pointer',
                background: r ? 'rgba(201,168,106,0.08)' : 'transparent',
                border:'none', marginBottom:2, position:'relative', overflow:'hidden',
              }}
              onMouseEnter={(e) => { if (!r) e.currentTarget.style.background='rgba(255,255,255,0.04)'; }}
              onMouseLeave={(e) => { if (!r) e.currentTarget.style.background='transparent'; }}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{
                    width:6, height:6, borderRadius:999,
                    background: status==='running' ? 'var(--aurum-100)' : status==='ok' ? 'var(--sage-500)' : 'rgba(255,255,255,0.20)',
                    boxShadow: status==='running' ? '0 0 0 3px rgba(201,168,106,0.18)' : 'none',
                  }}/>
                  <span style={{flex:1,fontSize:12.5,color:'var(--ink-00)',fontWeight:500}}>{j.name}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color: status==='running' ? 'var(--aurum-100)' : 'var(--ink-40)'}}>
                    {status==='running' ? `${Math.round((r?.progress||0)*100)}%` : (hist ? _fmtAgo(hist.last) : 'never')}
                  </span>
                </div>
                <div style={{fontSize:11,color:'var(--ink-40)',marginTop:3,paddingLeft:14,lineHeight:1.45}}>{j.desc}</div>
                {r && (
                  <span style={{
                    position:'absolute', left:0, bottom:0, height:1.5,
                    width: (r.progress*100)+'%',
                    background:'var(--aurum-100)', transition:'width 90ms linear',
                  }}/>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================
   Global Jobs Pill — appears in TopBar when any job is running.
   Persists across screens so users don't lose track.
   ============================================================ */
const GlobalJobsPill = () => {
  const { running } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (running.length === 0) return null;
  const avg = running.reduce((s,r) => s + r.progress, 0) / running.length;

  return (
    <div ref={ref} style={{position:'relative'}}>
      <button onClick={() => setOpen(o => !o)} style={{
        display:'inline-flex', alignItems:'center', gap:7,
        height:26, padding:'0 9px', borderRadius:999, cursor:'pointer',
        background:'rgba(201,168,106,0.12)', border:'1px solid rgba(201,168,106,0.28)',
        color:'var(--aurum-100)', fontFamily:'var(--font-mono)', fontSize:10.5,
        position:'relative', overflow:'hidden',
      }}>
        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
             style={{animation:'spin 1.4s linear infinite'}}>
          <path d="M2 8a6 6 0 1 0 1.5-4"/><path d="M2 2v4h4"/>
        </svg>
        <span>{running.length} running</span>
        <span style={{
          position:'absolute', left:0, bottom:0, height:1.5,
          width:(avg*100)+'%', background:'var(--aurum-100)', transition:'width 90ms linear',
        }}/>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:300,
          width:300, padding:6,
          borderRadius:10, background:'rgba(18,20,24,0.96)',
          border:'1px solid rgba(255,255,255,0.10)',
          boxShadow:'0 24px 64px rgba(0,0,0,0.55)',
          backdropFilter:'blur(24px)',
          animation:'cardEnter 160ms var(--ease-decel)',
        }}>
          <div style={{fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,padding:'8px 10px 6px'}}>
            Running jobs
          </div>
          {running.map(r => (
            <div key={r.runId} style={{padding:'8px 10px', borderRadius:6, position:'relative', overflow:'hidden'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:6,height:6,borderRadius:999,background:'var(--aurum-100)',boxShadow:'0 0 0 3px rgba(201,168,106,0.18)'}}/>
                <span style={{flex:1,fontSize:12.5,color:'var(--ink-00)'}}>{r.name}{r.ticker ? <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-40)',marginLeft:6}}>· {r.ticker}</span> : null}</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--aurum-100)'}}>{Math.round(r.progress*100)}%</span>
              </div>
              <div style={{fontSize:10.5,color:'var(--ink-40)',marginTop:2,paddingLeft:14,textTransform:'capitalize'}}>{r.screen}</div>
              <span style={{position:'absolute',left:0,bottom:0,height:1.5,width:(r.progress*100)+'%',background:'var(--aurum-100)',transition:'width 90ms linear'}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

Object.assign(window, {
  ShellContext, useShell, ShellProvider,
  JOB_DEFS, synthesizeAITake,
  CurrencyMenu, RunMenu, GlobalJobsPill,
});
