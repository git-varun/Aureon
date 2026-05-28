/* ============================================================
   Aureon — Theme Detail Page
   AI-curated theme: performance · constituents · fundamentals
   technical signals · interactive AI chat + re-evaluate
   ============================================================ */

/* ---- Synthetic constituent data per theme ---- */
const THEME_CONSTITUENTS = {
  'rate-cut': [
    { sym:'TLT',       name:'iShares 20+yr Treasury',   weight:0.22, ret1m:+0.041, signal:'Buy' },
    { sym:'HDFCBANK',  name:'HDFC Bank',                weight:0.18, ret1m:+0.028, signal:'Hold' },
    { sym:'SBIN',      name:'State Bank of India',      weight:0.16, ret1m:+0.034, signal:'Buy' },
    { sym:'LT',        name:'Larsen & Toubro',          weight:0.14, ret1m:+0.019, signal:'Hold' },
    { sym:'BAJFINANCE',name:'Bajaj Finance',            weight:0.12, ret1m:+0.052, signal:'Buy' },
    { sym:'AGG',       name:'iShares Core US Bond',     weight:0.10, ret1m:+0.018, signal:'Hold' },
    { sym:'POWERGRID', name:'Power Grid Corp',          weight:0.08, ret1m:+0.024, signal:'Hold' },
  ],
  'capex': [
    { sym:'LT',        name:'Larsen & Toubro',          weight:0.24, ret1m:+0.071, signal:'Strong Buy' },
    { sym:'ULTRACEMCO',name:'UltraTech Cement',         weight:0.18, ret1m:+0.058, signal:'Buy' },
    { sym:'BHEL',      name:'BHEL Ltd',                 weight:0.16, ret1m:+0.082, signal:'Buy' },
    { sym:'ABB',       name:'ABB India',                weight:0.14, ret1m:+0.064, signal:'Hold' },
    { sym:'SIEMENS',   name:'Siemens India',            weight:0.12, ret1m:+0.049, signal:'Hold' },
    { sym:'KEC',       name:'KEC International',        weight:0.10, ret1m:+0.091, signal:'Strong Buy' },
    { sym:'CUMMINS',   name:'Cummins India',            weight:0.06, ret1m:+0.033, signal:'Hold' },
  ],
  'el-niño': [
    { sym:'HINDUNILVR',name:'Hindustan Unilever',       weight:0.28, ret1m:+0.012, signal:'Hold' },
    { sym:'NESTLEIND', name:'Nestlé India',             weight:0.22, ret1m:+0.024, signal:'Hold' },
    { sym:'DABUR',     name:'Dabur India',              weight:0.18, ret1m:+0.019, signal:'Buy' },
    { sym:'GODREJCP',  name:'Godrej Consumer',          weight:0.16, ret1m:+0.031, signal:'Buy' },
    { sym:'BRITANNIA', name:'Britannia Industries',     weight:0.16, ret1m:+0.008, signal:'Hold' },
  ],
  'ai-india': [
    { sym:'INFY',      name:'Infosys Ltd',              weight:0.26, ret1m:+0.092, signal:'Strong Buy' },
    { sym:'TCS',       name:'Tata Consultancy Svcs',    weight:0.22, ret1m:+0.074, signal:'Buy' },
    { sym:'WIPRO',     name:'Wipro Ltd',                weight:0.18, ret1m:+0.081, signal:'Buy' },
    { sym:'HCLTECH',   name:'HCL Technologies',         weight:0.16, ret1m:+0.068, signal:'Buy' },
    { sym:'TECHM',     name:'Tech Mahindra',            weight:0.12, ret1m:+0.112, signal:'Strong Buy' },
    { sym:'MPHASIS',   name:'Mphasis Ltd',              weight:0.06, ret1m:+0.094, signal:'Buy' },
  ],
  'green-energy': [
    { sym:'ADANIGREEN',name:'Adani Green Energy',       weight:0.24, ret1m:+0.048, signal:'Buy' },
    { sym:'TATAPOWER', name:'Tata Power',               weight:0.20, ret1m:+0.039, signal:'Hold' },
    { sym:'SJVN',      name:'SJVN Ltd',                 weight:0.16, ret1m:+0.062, signal:'Buy' },
    { sym:'NHPC',      name:'NHPC Ltd',                 weight:0.14, ret1m:+0.044, signal:'Hold' },
    { sym:'POWERGRID', name:'Power Grid Corp',          weight:0.14, ret1m:+0.031, signal:'Hold' },
    { sym:'CESC',      name:'CESC Ltd',                 weight:0.12, ret1m:+0.028, signal:'Hold' },
  ],
  'small-cap': [
    { sym:'KPITTECH',  name:'KPIT Technologies',        weight:0.14, ret1m:+0.034, signal:'Buy' },
    { sym:'DEEPAK',    name:'Deepak Nitrite',           weight:0.13, ret1m:+0.028, signal:'Hold' },
    { sym:'BALAMINES', name:'Balaji Amines',            weight:0.12, ret1m:+0.055, signal:'Buy' },
    { sym:'NAVINFLUOR',name:'Navin Fluorine',           weight:0.12, ret1m:+0.038, signal:'Buy' },
    { sym:'ELECON',    name:'Elecon Engineering',       weight:0.12, ret1m:+0.029, signal:'Hold' },
    { sym:'SUVENPHAR', name:'Suven Pharma',             weight:0.11, ret1m:+0.019, signal:'Hold' },
    { sym:'HAPPYHF',   name:'Happy Forgings',           weight:0.11, ret1m:+0.041, signal:'Buy' },
    { sym:'GULFOILLUB',name:'Gulf Oil Lubricants',      weight:0.09, ret1m:+0.022, signal:'Hold' },
    { sym:'BORORENEW', name:'Boro Renewables',          weight:0.06, ret1m:+0.067, signal:'Strong Buy' },
  ],
};

const THEME_AI_TAKES = {
  'rate-cut': {
    confidence:82, momentum:'positive',
    take:'Monetary policy pivot confirms thesis. Rate-sensitive sectors showing early re-rating; bond duration adding meaningful yield pickup. Overweight financials within basket.',
    rationale:'RBI signaling accommodation + global rate cycle turning. Duration trade constructive for 6–12 months.',
    risk:'Inflation surprise could delay cuts; watch CPI print and RBI forward guidance closely.',
    lastEval:'14:00 · today',
  },
  'capex': {
    confidence:88, momentum:'strong',
    take:'India capex supercycle intact. Order books at multi-year highs across infra and capital goods. Cement utilisation >85% signals pricing power ahead.',
    rationale:'Government capex at 3.4% of GDP + private capex revival in manufacturing and energy transition.',
    risk:'Election spending cliff after results; watch Q1 FY26 order intake for deceleration.',
    lastEval:'14:00 · today',
  },
  'el-niño': {
    confidence:71, momentum:'neutral',
    take:'Defensive positioning warranted. FMCG basket showing stable demand resilience vs market volatility. Monsoon below normal — pricing power emerging for select names.',
    rationale:'El Niño probability elevated; rural income pressure partly offset by government transfers.',
    risk:'Rural recovery could compress defensive premium if monsoon normalizes late in season.',
    lastEval:'14:00 · today',
  },
  'ai-india': {
    confidence:91, momentum:'strong',
    take:'AI services revenue mix expanding faster than consensus. Large-cap IT transitioning from project-based to AI-platform licensing — structurally higher margins ahead.',
    rationale:'GenAI deal TCV up 3× YoY; headcount decoupling from revenue confirming operating leverage.',
    risk:'US BFSI client budget cuts; visa policy uncertainty for onsite staffing costs.',
    lastEval:'14:00 · today',
  },
  'green-energy': {
    confidence:76, momentum:'positive',
    take:'Energy transition pipeline robust but execution risk elevated. Solar module costs falling 18% YoY — margin tailwind. Transmission bottleneck remains key constraint.',
    rationale:'500GW renewable target by 2030 implies 8× current installed base. Auction pipeline accelerating.',
    risk:'Grid integration delays; commodity volatility for module inputs and battery storage.',
    lastEval:'14:00 · today',
  },
  'small-cap': {
    confidence:68, momentum:'neutral',
    take:'Quality filter (ROE>18%, D/E<0.5) yielding alpha vs small-cap index. Selectivity critical — basket median ROE 22.4% with clean balance sheets. Watch liquidity in stress.',
    rationale:'Earnings momentum in niche B2B manufacturing and specialty chemicals outpacing large-cap peers.',
    risk:'Liquidity premium can compress sharply in risk-off environments. Position sizing is critical.',
    lastEval:'14:00 · today',
  },
};

const THEME_FUNDAMENTALS = {
  'rate-cut':     { pe:'18.4', pb:'2.8', roe:'16.2%', divYield:'2.1%', debtEq:'0.62', beta:'0.72' },
  'capex':        { pe:'28.6', pb:'4.2', roe:'19.8%', divYield:'0.8%', debtEq:'0.38', beta:'1.18' },
  'el-niño':      { pe:'52.4', pb:'8.6', roe:'24.1%', divYield:'1.4%', debtEq:'0.18', beta:'0.61' },
  'ai-india':     { pe:'26.8', pb:'5.4', roe:'28.6%', divYield:'1.2%', debtEq:'0.08', beta:'0.94' },
  'green-energy': { pe:'34.2', pb:'3.8', roe:'12.4%', divYield:'0.6%', debtEq:'0.94', beta:'1.32' },
  'small-cap':    { pe:'22.1', pb:'3.2', roe:'22.4%', divYield:'0.9%', debtEq:'0.28', beta:'1.24' },
};

/* ---- helpers ---- */
const mColor = (m) => m==='strong'?'var(--sage-500)':m==='positive'?'#7EB8A4':'var(--ink-30)';
const mLabel = (m) => m==='strong'?'Strong':m==='positive'?'Positive':'Neutral';
const signalColor = (s) => s.includes('Strong')?'var(--sage-500)':s==='Buy'?'#7EB8A4':s==='Hold'?'var(--ink-40)':'var(--crimson-500)';

const mkSeries = (id, ret1m, pts=90) => {
  let val=100; const arr=[val]; const seed=id.charCodeAt(0);
  for(let i=1;i<pts;i++){
    const trend=ret1m*0.3/pts;
    const noise=(Math.sin(i*seed*0.31+seed)*0.007)+((i*seed*31)%1000/1000-0.49)*0.013;
    val=val*(1+trend+noise); arr.push(val);
  }
  return arr;
};
const mkBench = (pts=90) => {
  let val=100; const arr=[val];
  for(let i=1;i<pts;i++){val=val*(1+0.00018+((i*37)%1000/1000-0.49)*0.010);arr.push(val);}
  return arr;
};

/* ================================================================
   ThemePage — main component
   ================================================================ */
const ThemePage = ({ go, themeId }) => {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const aiSeed = THEME_AI_TAKES[theme.id] || THEME_AI_TAKES['rate-cut'];
  const constituents = THEME_CONSTITUENTS[theme.id] || [];
  const fundamentals = THEME_FUNDAMENTALS[theme.id] || {};

  const [tab,          setTab]          = useState('overview');
  const [revaluating,  setRevaluating]  = useState(false);
  const [aiTake,       setAiTake]       = useState(aiSeed.take);
  const [aiConf,       setAiConf]       = useState(aiSeed.confidence);
  const [lastEval,     setLastEval]     = useState(aiSeed.lastEval);
  const [chatInput,    setChatInput]    = useState('');
  const [chatHistory,  setChatHistory]  = useState([]);
  const [chatLoading,  setChatLoading]  = useState(false);

  // Reset state when theme changes
  useEffect(() => {
    setTab('overview');
    setAiTake(THEME_AI_TAKES[theme.id]?.take || '');
    setAiConf(THEME_AI_TAKES[theme.id]?.confidence || 70);
    setLastEval(THEME_AI_TAKES[theme.id]?.lastEval || '');
    setChatHistory([]);
  }, [theme.id]);

  const themeSeries = useMemo(() => mkSeries(theme.id, theme.ret1m), [theme.id]);
  const benchSeries = useMemo(() => mkBench(), []);

  const retColor = theme.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)';
  const confColor = aiConf >= 80 ? 'var(--sage-500)' : aiConf >= 65 ? 'var(--aurum-100)' : 'var(--crimson-500)';

  const handleRevaluate = async () => {
    setRevaluating(true);
    try {
      const prompt = `You are Aureon, a concise AI investment analyst. Re-evaluate this investment theme in one sentence and output ONLY valid JSON.
Theme: ${theme.name}
Description: ${theme.desc}
Current 1M return: ${(theme.ret1m*100).toFixed(1)}%
Respond with this exact format: {"take":"<1–2 sentence analysis>","confidence":<integer 50-95>}`;
      const raw = await window.claude.complete(prompt);
      try {
        const m = raw.match(/\{[\s\S]*?\}/);
        const parsed = JSON.parse(m ? m[0] : '{}');
        if (parsed.take) setAiTake(parsed.take);
        if (parsed.confidence) setAiConf(Math.min(99, Math.max(30, parsed.confidence)));
      } catch { setAiTake(raw.slice(0, 220)); }
      const now = new Date();
      setLastEval(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} · today (refreshed)`);
    } catch (e) { console.error(e); }
    setRevaluating(false);
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatHistory(h => [...h, { role:'user', text:msg }]);
    setChatLoading(true);
    try {
      const ctx = `Investment theme: ${theme.name}\nDescription: ${theme.desc}\n1M return: ${(theme.ret1m*100).toFixed(1)}%\nConstituents: ${constituents.map(c=>c.sym).join(', ')}\nCurrent AI take: ${aiTake}`;
      const resp = await window.claude.complete({
        messages:[{ role:'user', content:`You are Aureon, a concise AI wealth advisor. Respond in 2–3 sentences max. Investment context:\n${ctx}\n\nUser question: ${msg}` }]
      });
      setChatHistory(h => [...h, { role:'ai', text:resp }]);
    } catch { setChatHistory(h => [...h, { role:'ai', text:'Unable to reach Aureon right now. Please try again in a moment.' }]); }
    setChatLoading(false);
  };

  return (
    <>
      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:18,flexWrap:'wrap'}}>
        <button onClick={() => go('terminal')} style={{
          display:'flex',alignItems:'center',gap:6,background:'none',border:'none',
          color:'var(--ink-30)',cursor:'pointer',fontSize:12,fontFamily:'var(--font-ui)',
          padding:'6px 0',marginTop:2,flexShrink:0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
          Terminal
        </button>
        <div style={{flex:1,minWidth:200}}>
          <Eyebrow>Theme · AI-curated</Eyebrow>
          <div style={{display:'flex',alignItems:'center',gap:12,marginTop:4,flexWrap:'wrap'}}>
            <h2 style={{margin:0,fontFamily:'var(--font-heading)',fontSize:24,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.02em'}}>{theme.name}</h2>
            <span style={{fontFamily:'var(--font-mono)',fontSize:14,color:retColor,fontWeight:500}}>
              {theme.ret1m>=0?'+':''}{(theme.ret1m*100).toFixed(1)}%
              <span style={{fontSize:11,color:'var(--ink-40)',fontFamily:'var(--font-ui)',fontWeight:400,marginLeft:4}}>1M</span>
            </span>
            <span style={{
              fontSize:10.5,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,
              padding:'3px 9px',borderRadius:999,
              background: aiConf>=80 ? 'rgba(111,174,136,0.12)' : aiConf>=65 ? 'rgba(201,168,106,0.12)' : 'rgba(209,107,107,0.12)',
              color: confColor,
            }}>AI {aiConf}% confident</span>
          </div>
          <div style={{fontSize:12.5,color:'var(--ink-30)',marginTop:4}}>{theme.desc} · {theme.count} instruments</div>
        </div>
        <div style={{display:'flex',gap:8,flexShrink:0,marginTop:2}}>
          <button
            onClick={handleRevaluate} disabled={revaluating}
            style={{
              display:'flex',alignItems:'center',gap:7,height:34,padding:'0 14px',borderRadius:8,
              background:'rgba(201,168,106,0.10)',border:'1px solid rgba(201,168,106,0.28)',
              color:'var(--aurum-100)',fontSize:12.5,fontFamily:'var(--font-ui)',fontWeight:500,
              cursor:revaluating?'not-allowed':'pointer',opacity:revaluating?0.7:1,
            }}>
            {revaluating
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite',flexShrink:0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
            }
            {revaluating ? 'Evaluating…' : 'Re-evaluate'}
          </button>
          <button onClick={() => setTab('ai')} style={{
            height:34,padding:'0 14px',borderRadius:8,
            background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
            color:'var(--ink-20)',fontSize:12.5,fontFamily:'var(--font-ui)',cursor:'pointer',
          }}>Ask AI →</button>
        </div>
      </div>

      {/* ── AI Take banner ── */}
      <div className="layer-1" style={{padding:'14px 18px',marginBottom:16,borderLeft:'3px solid var(--aurum-500)',borderRadius:'4px 10px 10px 4px'}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--aurum-500)',fontWeight:600,marginBottom:6}}>AI Take</div>
            <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:500,color:'var(--ink-00)',lineHeight:1.55}}>{aiTake}</div>
            <div style={{marginTop:8,display:'flex',gap:16,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'var(--ink-40)'}}>Last evaluated: {lastEval}</span>
              <span style={{fontSize:11,color:mColor(aiSeed.momentum)}}>● {mLabel(aiSeed.momentum)} momentum</span>
            </div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:32,fontWeight:500,color:confColor,lineHeight:1}}>{aiConf}</div>
            <div style={{fontSize:10,color:'var(--ink-40)',marginTop:2,letterSpacing:'0.06em',textTransform:'uppercase'}}>Confidence</div>
          </div>
        </div>
        <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.06)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div style={{fontSize:11.5,color:'var(--ink-30)'}}><span style={{color:'var(--sage-500)',fontWeight:600}}>Rationale: </span>{aiSeed.rationale}</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)'}}><span style={{color:'#D4A257',fontWeight:600}}>Risk: </span>{aiSeed.risk}</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:16}}>
        {[['overview','Overview'],['performance','Performance'],['constituents','Constituents'],['fundamentals','Fundamentals'],['technical','Technical'],['ai','AI Chat']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12.5,
            color: tab===id ? 'var(--ink-00)' : 'var(--ink-40)',
            borderBottom:'2px solid '+(tab===id?'var(--aurum-500)':'transparent'),
            fontWeight: tab===id ? 500 : 400,
          }}>{label}</button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab==='overview'      && <ThemeOverviewTab     theme={theme} series={themeSeries} benchSeries={benchSeries} constituents={constituents} fundamentals={fundamentals} ai={aiSeed} aiConf={aiConf}/>}
      {tab==='performance'   && <ThemePerfTab         theme={theme} series={themeSeries} benchSeries={benchSeries}/>}
      {tab==='constituents'  && <ThemeConstTab        constituents={constituents} go={go}/>}
      {tab==='fundamentals'  && <ThemeFundTab         fundamentals={fundamentals}/>}
      {tab==='technical'     && <ThemeTechTab         theme={theme}/>}
      {tab==='ai'            && (
        <ThemeAITab
          theme={theme} aiTake={aiTake} aiConf={aiConf} lastEval={lastEval}
          chatHistory={chatHistory} chatInput={chatInput} setChatInput={setChatInput}
          chatLoading={chatLoading} handleChat={handleChat}
          handleRevaluate={handleRevaluate} revaluating={revaluating}
        />
      )}
      <div style={{height:32}}/>
    </>
  );
};

/* ================================================================
   Overview Tab
   ================================================================ */
const ThemeOverviewTab = ({ theme, series, benchSeries, constituents, fundamentals, ai, aiConf }) => (
  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14,alignItems:'start'}}>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <Eyebrow>3-Month Performance vs Nifty 50</Eyebrow>
          <div style={{display:'flex',gap:14,fontSize:11}}>
            <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-30)'}}>
              <span style={{width:14,height:2,background:'var(--aurum-500)',display:'inline-block',borderRadius:1,flexShrink:0}}/>Theme basket
            </span>
            <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-40)'}}>
              <span style={{width:14,height:2,background:'rgba(255,255,255,0.22)',display:'inline-block',borderRadius:1,flexShrink:0}}/>Nifty 50
            </span>
          </div>
        </div>
        <ThemeDualChart series={series} benchSeries={benchSeries} height={160}/>
      </div>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <Eyebrow style={{marginBottom:10}}>Top Constituents</Eyebrow>
        <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr 0.6fr 0.6fr',gap:10,padding:'6px 0 8px',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
          {['Instrument','Weight','1M','Signal'].map((h,i) => (
            <div key={h} style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,textAlign:i>1?'right':'left'}}>{h}</div>
          ))}
        </div>
        {constituents.slice(0,5).map((c,i) => (
          <div key={c.sym} style={{
            display:'grid',gridTemplateColumns:'1.6fr 1fr 0.6fr 0.6fr',gap:10,
            padding:'9px 0',borderBottom:i<4?'1px solid rgba(255,255,255,0.04)':'none',alignItems:'center',
          }}>
            <div>
              <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{c.sym}</span>
              <span style={{fontSize:10.5,color:'var(--ink-40)',marginLeft:7}}>{c.name}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{height:3,borderRadius:99,background:'rgba(255,255,255,0.06)',flex:1}}>
                <div style={{width:`${c.weight*100}%`,height:'100%',borderRadius:99,background:'var(--aurum-500)',opacity:0.65}}/>
              </div>
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)',minWidth:26,textAlign:'right'}}>{(c.weight*100).toFixed(0)}%</span>
            </div>
            <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:c.ret1m>=0?'var(--sage-500)':'var(--crimson-500)',textAlign:'right'}}>
              {c.ret1m>=0?'+':''}{(c.ret1m*100).toFixed(1)}%
            </span>
            <span style={{fontSize:9.5,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,color:signalColor(c.signal),textAlign:'right'}}>{c.signal}</span>
          </div>
        ))}
      </div>
    </div>
    {/* Right column */}
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <Eyebrow>Key Metrics</Eyebrow>
        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:9}}>
          {[['Avg P/E',fundamentals.pe],['Avg ROE',fundamentals.roe],['Div yield',fundamentals.divYield],['Debt/Equity',fundamentals.debtEq],['Beta',fundamentals.beta]].map(([k,v]) => (
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11.5,color:'var(--ink-40)'}}>{k}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-00)',fontWeight:500}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <Eyebrow>AI Signals</Eyebrow>
        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:9}}>
          {[
            { label:'Momentum',    val:mLabel(ai.momentum), color:mColor(ai.momentum) },
            { label:'Confidence',  val:`${aiConf}%`,        color: aiConf>=80?'var(--sage-500)':'var(--aurum-100)' },
            { label:'Instruments', val:`${theme.count}`,    color:'var(--ink-10)' },
          ].map(s => (
            <div key={s.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11.5,color:'var(--ink-40)'}}>{s.label}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:s.color,fontWeight:500}}>{s.val}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <Eyebrow>Returns</Eyebrow>
        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:9}}>
          {[
            ['1M', `${theme.ret1m>=0?'+':''}${(theme.ret1m*100).toFixed(1)}%`, theme.ret1m>=0?'var(--sage-500)':'var(--crimson-500)'],
            ['vs Nifty', '+2.1%', 'var(--sage-500)'],
            ['Max drawdown', '-4.2%', 'var(--crimson-500)'],
            ['Ann. est.', `${(theme.ret1m*12*100).toFixed(0)}%`, 'var(--ink-10)'],
          ].map(([k,v,c]) => (
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11.5,color:'var(--ink-40)'}}>{k}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:c,fontWeight:500}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* ================================================================
   Performance Tab
   ================================================================ */
const ThemePerfTab = ({ theme, series, benchSeries }) => {
  const [tf, setTf] = useState('3M');
  const retColor = theme.ret1m>=0?'var(--sage-500)':'var(--crimson-500)';
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="layer-1" style={{padding:'16px 18px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14,flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:0}}>
            {['1M','3M','6M','YTD','1Y'].map(p => (
              <button key={p} onClick={() => setTf(p)} style={{
                padding:'5px 12px',fontSize:11,fontFamily:'var(--font-mono)',
                background: tf===p?'rgba(201,168,106,0.12)':'transparent',
                color: tf===p?'var(--aurum-100)':'var(--ink-30)',
                border:'none',cursor:'pointer',borderRadius:4,
              }}>{p}</button>
            ))}
          </div>
          <div style={{flex:1}}/>
          <div style={{display:'flex',gap:16,fontSize:11}}>
            <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-30)'}}><span style={{width:14,height:2,background:'var(--aurum-500)',display:'inline-block',borderRadius:1}}/>Theme basket</span>
            <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-40)'}}><span style={{width:14,height:2,background:'rgba(255,255,255,0.22)',display:'inline-block',borderRadius:1,borderStyle:'dashed'}}/>Nifty 50</span>
          </div>
        </div>
        <ThemeDualChart series={series} benchSeries={benchSeries} height={280}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
        {[
          ['1M return',    `${theme.ret1m>=0?'+':''}${(theme.ret1m*100).toFixed(1)}%`, retColor],
          ['vs Nifty 50',  '+2.1%',                                                      'var(--sage-500)'],
          ['Annualised',   `${(theme.ret1m*12*100).toFixed(0)}%`,                        'var(--ink-00)'],
          ['Max drawdown', '-4.2%',                                                       'var(--crimson-500)'],
        ].map(([k,v,c]) => (
          <div key={k} className="layer-1" style={{padding:'14px 16px'}}>
            <div style={{fontSize:10,color:'var(--ink-40)',letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600}}>{k}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color:c,marginTop:8}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ================================================================
   Constituents Tab
   ================================================================ */
const ThemeConstTab = ({ constituents, go }) => (
  <div className="layer-1">
    <div style={{display:'grid',gridTemplateColumns:'1.8fr 1fr 0.7fr 0.7fr 0.6fr',gap:12,padding:'10px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
      {['Instrument','Weight','1M return','Signal',''].map((h,i) => (
        <div key={h+i} style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,textAlign:i>1?'right':'left'}}>{h}</div>
      ))}
    </div>
    {constituents.map((c,i) => (
      <div key={c.sym} style={{
        display:'grid',gridTemplateColumns:'1.8fr 1fr 0.7fr 0.7fr 0.6fr',gap:12,
        padding:'12px 18px',borderBottom:i<constituents.length-1?'1px solid rgba(255,255,255,0.04)':'none',
        alignItems:'center',
      }}>
        <div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:12.5,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{c.sym}</div>
          <div style={{fontSize:11,color:'var(--ink-40)',marginTop:2}}>{c.name}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{height:3,borderRadius:99,background:'rgba(255,255,255,0.06)',flex:1}}>
            <div style={{width:`${c.weight*100}%`,height:'100%',borderRadius:99,background:'var(--aurum-500)',opacity:0.65}}/>
          </div>
          <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-20)',minWidth:28,textAlign:'right'}}>{(c.weight*100).toFixed(0)}%</span>
        </div>
        <span style={{fontFamily:'var(--font-mono)',fontSize:12.5,color:c.ret1m>=0?'var(--sage-500)':'var(--crimson-500)',textAlign:'right'}}>
          {c.ret1m>=0?'+':''}{(c.ret1m*100).toFixed(1)}%
        </span>
        <span style={{fontSize:9.5,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,color:signalColor(c.signal),textAlign:'right'}}>{c.signal}</span>
        <button onClick={() => go('terminal',c.sym)} style={{
          fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(255,255,255,0.04)',
          border:'1px solid rgba(255,255,255,0.06)',color:'var(--ink-30)',cursor:'pointer',
          fontFamily:'var(--font-ui)',
        }}>Open →</button>
      </div>
    ))}
  </div>
);

/* ================================================================
   Fundamentals Tab
   ================================================================ */
const ThemeFundTab = ({ fundamentals }) => {
  const metrics = [
    { k:'P/E Ratio',    v:fundamentals.pe,       sub:'Price-to-earnings (basket weighted avg)', bar:Math.min(100,parseFloat(fundamentals.pe)/60*100) },
    { k:'P/B Ratio',    v:fundamentals.pb,        sub:'Price-to-book (basket weighted avg)',     bar:Math.min(100,parseFloat(fundamentals.pb)/10*100) },
    { k:'ROE',          v:fundamentals.roe,       sub:'Return on equity',                        bar:Math.min(100,parseFloat(fundamentals.roe)/40*100) },
    { k:'Dividend yield',v:fundamentals.divYield, sub:'Trailing twelve months',                  bar:Math.min(100,parseFloat(fundamentals.divYield)/5*100) },
    { k:'Debt / Equity',v:fundamentals.debtEq,   sub:'Leverage (lower is safer)',               bar:Math.min(100,parseFloat(fundamentals.debtEq)/2*100) },
    { k:'Beta',         v:fundamentals.beta,      sub:'Market sensitivity vs Nifty 50',          bar:Math.min(100,parseFloat(fundamentals.beta)/2*100) },
  ];
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
      {metrics.map(m => (
        <div key={m.k} className="layer-1" style={{padding:'16px 18px'}}>
          <div style={{fontSize:10,color:'var(--ink-40)',letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600}}>{m.k}</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:28,fontWeight:500,color:'var(--ink-00)',marginTop:8,letterSpacing:'-0.01em'}}>{m.v}</div>
          <div style={{height:3,borderRadius:99,background:'rgba(255,255,255,0.06)',marginTop:14}}>
            <div style={{width:`${m.bar}%`,height:'100%',borderRadius:99,background:'var(--aurum-500)',opacity:0.55}}/>
          </div>
          <div style={{fontSize:10.5,color:'var(--ink-40)',marginTop:6}}>{m.sub}</div>
        </div>
      ))}
    </div>
  );
};

/* ================================================================
   Technical Tab
   ================================================================ */
const ThemeTechTab = ({ theme }) => {
  const [generating, setGenerating] = useState(false);
  const [signals,    setSignals]    = useState(null);

  useEffect(() => { setSignals(null); setGenerating(false); }, [theme.id]);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const rsi  = 40 + Math.floor(Math.random()*30);
      const macd = ((theme.ret1m>0?0.6:-0.4)+(Math.random()-0.4)*0.7).toFixed(3);
      const adx  = 18 + Math.floor(Math.random()*24);
      const conf = 54 + Math.floor(Math.random()*28);
      const trend = theme.ret1m>0.05 ? 'Bullish' : theme.ret1m>0 ? 'Mildly bullish' : 'Bearish';
      const trendColor = trend==='Bullish'?'var(--sage-500)':trend==='Mildly bullish'?'var(--aurum-100)':'var(--crimson-500)';
      setSignals({ rsi, macd, adx, conf, trend, trendColor });
      setGenerating(false);
    }, 1800);
  };

  if (!signals) return (
    <div style={{padding:'48px 24px',textAlign:'center',background:'rgba(255,255,255,0.015)',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12}}>
      <div style={{width:48,height:48,borderRadius:999,background:'rgba(201,168,106,0.08)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </div>
      <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',marginBottom:6}}>No signal generated yet</div>
      <div style={{fontSize:13,color:'var(--ink-30)',maxWidth:320,margin:'0 auto 20px',lineHeight:1.5}}>Generate a composite RSI + MACD + ADX technical signal across the {theme.count} instruments in the basket.</div>
      <button disabled={generating} onClick={handleGenerate} style={{
        display:'inline-flex',alignItems:'center',gap:8,height:36,padding:'0 20px',borderRadius:8,
        background:'rgba(201,168,106,0.12)',border:'1px solid rgba(201,168,106,0.28)',
        color:'var(--aurum-100)',fontSize:13,fontFamily:'var(--font-ui)',fontWeight:500,
        cursor:generating?'not-allowed':'pointer',opacity:generating?0.7:1,
      }}>
        {generating ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>Generating…</> : 'Generate Theme Signal'}
      </button>
    </div>
  );

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:14}}>
        {[
          ['RSI · 14',      signals.rsi,   signals.rsi>70?'Overbought':signals.rsi<30?'Oversold':'Neutral', signals.rsi>60?'var(--sage-500)':signals.rsi<40?'var(--crimson-500)':'var(--ink-00)'],
          ['MACD',          signals.macd,  Number(signals.macd)>0?'Positive crossover':'Negative crossover', Number(signals.macd)>0?'var(--sage-500)':'var(--crimson-500)'],
          ['ADX · Strength',signals.adx,   signals.adx>25?'Trending':'Ranging',                              signals.adx>25?'var(--sage-500)':'var(--ink-30)'],
          ['Basket trend',  signals.trend, `Confidence ${signals.conf}%`,                                    signals.trendColor],
        ].map(([k,v,sub,c]) => (
          <div key={k} className="layer-1" style={{padding:'14px 16px'}}>
            <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{k}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color:c,marginTop:8}}>{v}</div>
            <div style={{fontSize:11,color:'var(--ink-40)',marginTop:4}}>{sub}</div>
          </div>
        ))}
      </div>
      <button onClick={() => setSignals(null)} style={{
        fontSize:12,padding:'6px 14px',borderRadius:6,background:'rgba(255,255,255,0.04)',
        border:'1px solid rgba(255,255,255,0.06)',color:'var(--ink-30)',cursor:'pointer',fontFamily:'var(--font-ui)',
      }}>↺ Re-generate</button>
    </div>
  );
};

/* ================================================================
   AI Chat Tab
   ================================================================ */
const ThemeAITab = ({ theme, aiTake, aiConf, lastEval, chatHistory, chatInput, setChatInput, chatLoading, handleChat, handleRevaluate, revaluating }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory, chatLoading]);

  const suggestions = [
    `What's driving the ${theme.name} theme right now?`,
    'Which constituent has the best risk/reward ratio?',
    'What macro events could break this theme?',
    'How does this theme correlate with rate movements?',
  ];

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:14,alignItems:'start'}}>
      {/* Chat */}
      <div className="layer-1" style={{padding:'16px 18px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,paddingBottom:12,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{width:30,height:30,borderRadius:999,background:'rgba(201,168,106,0.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:'var(--ink-00)'}}>Ask Aureon about this theme</div>
            <div style={{fontSize:11,color:'var(--ink-40)'}}>Context-aware · AI-powered</div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{minHeight:220,maxHeight:340,overflowY:'auto',marginBottom:12,display:'flex',flexDirection:'column',gap:10}}>
          {chatHistory.length === 0 && (
            <div style={{padding:'16px 0',display:'flex',flexDirection:'column',gap:6}}>
              <div style={{fontSize:12,color:'var(--ink-40)',marginBottom:8}}>Suggested questions</div>
              {suggestions.map(s => (
                <button key={s} onClick={() => setChatInput(s)} style={{
                  padding:'9px 12px',background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)',
                  borderRadius:8,color:'var(--ink-20)',fontSize:12.5,cursor:'pointer',textAlign:'left',
                  fontFamily:'var(--font-ui)',lineHeight:1.4,
                }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                >{s}</button>
              ))}
            </div>
          )}
          {chatHistory.map((m,i) => (
            <div key={i} style={{
              padding:'10px 14px',borderRadius:10,fontSize:13,lineHeight:1.55,
              background: m.role==='user' ? 'rgba(201,168,106,0.08)' : 'rgba(255,255,255,0.03)',
              border:'1px solid '+(m.role==='user'?'rgba(201,168,106,0.15)':'rgba(255,255,255,0.06)'),
              color: m.role==='user' ? 'var(--aurum-100)' : 'var(--ink-10)',
              marginLeft: m.role==='user' ? 32 : 0,
              marginRight: m.role==='ai' ? 32 : 0,
            }}>
              {m.role==='ai' && <div style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,marginBottom:4}}>Aureon</div>}
              {m.text}
            </div>
          ))}
          {chatLoading && (
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',color:'var(--ink-40)',fontSize:13}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite',flexShrink:0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
              Aureon is thinking…
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{display:'flex',gap:8}}>
          <input
            value={chatInput} onChange={e=>setChatInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleChat()}
            placeholder="Ask about constituents, risks, outlook…"
            style={{
              flex:1,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',
              borderRadius:8,padding:'9px 14px',color:'var(--ink-00)',fontSize:13,
              fontFamily:'var(--font-ui)',outline:'none',
            }}
          />
          <button onClick={handleChat} disabled={!chatInput.trim()||chatLoading} style={{
            height:38,padding:'0 16px',borderRadius:8,
            background:'rgba(201,168,106,0.12)',border:'1px solid rgba(201,168,106,0.28)',
            color:'var(--aurum-100)',fontSize:13,cursor:'pointer',fontFamily:'var(--font-ui)',
            opacity:!chatInput.trim()||chatLoading?0.5:1,
          }}>Send</button>
        </div>
      </div>

      {/* Sidebar */}
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <div className="layer-1" style={{padding:'14px 16px'}}>
          <Eyebrow>Evaluation</Eyebrow>
          <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11.5,color:'var(--ink-40)'}}>Confidence</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-00)',fontWeight:500}}>{aiConf}%</span>
            </div>
            <div style={{height:3,borderRadius:99,background:'rgba(255,255,255,0.06)'}}>
              <div style={{width:`${aiConf}%`,height:'100%',borderRadius:99,background:aiConf>=80?'var(--sage-500)':'var(--aurum-500)'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
              <span style={{fontSize:11,color:'var(--ink-40)'}}>Last eval</span>
              <span style={{fontSize:11,color:'var(--ink-30)'}}>{lastEval}</span>
            </div>
          </div>
          <button onClick={handleRevaluate} disabled={revaluating} style={{
            marginTop:12,width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:7,
            height:34,borderRadius:8,
            background:'rgba(201,168,106,0.08)',border:'1px solid rgba(201,168,106,0.22)',
            color:'var(--aurum-100)',fontSize:12,fontFamily:'var(--font-ui)',
            cursor:revaluating?'not-allowed':'pointer',opacity:revaluating?0.7:1,
          }}>
            {revaluating
              ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>Evaluating…</>
              : '↺ Re-evaluate now'}
          </button>
        </div>
        <div className="layer-1" style={{padding:'14px 16px'}}>
          <Eyebrow>Current take</Eyebrow>
          <div style={{marginTop:8,fontSize:12.5,color:'var(--ink-10)',lineHeight:1.55,fontStyle:'italic'}}>{aiTake}</div>
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   Dual-series chart (theme + bench overlay)
   ================================================================ */
const ThemeDualChart = ({ series, benchSeries, height=200 }) => {
  if (!series?.length) return null;
  const w=800, h=height, pad={l:36,r:12,t:10,b:22};
  const allPts=[...series,...benchSeries];
  const minV=Math.min(...allPts)*0.996, maxV=Math.max(...allPts)*1.004;
  const range=maxV-minV||1;
  const xi=i => pad.l+(i/(series.length-1))*(w-pad.l-pad.r);
  const yi=v => pad.t+(1-(v-minV)/range)*(h-pad.t-pad.b);
  const p1=series.map((v,i)=>(i?'L':'M')+xi(i).toFixed(1)+' '+yi(v).toFixed(1)).join(' ');
  const p2=benchSeries.map((v,i)=>(i?'L':'M')+xi(i).toFixed(1)+' '+yi(v).toFixed(1)).join(' ');
  const ticks=[minV+(maxV-minV)*0.1,minV+(maxV-minV)*0.5,minV+(maxV-minV)*0.9];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:'100%',height,display:'block'}}>
      <defs>
        <linearGradient id="themeAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9A86A" stopOpacity="0.16"/>
          <stop offset="1" stopColor="#C9A86A" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {ticks.map((t,i) => (
        <g key={i}>
          <line x1={pad.l} x2={w-pad.r} y1={yi(t)} y2={yi(t)} stroke="rgba(255,255,255,0.04)"/>
          <text x={pad.l-5} y={yi(t)+4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{t.toFixed(1)}</text>
        </g>
      ))}
      <path d={p1+` L${xi(series.length-1)} ${h-pad.b} L${xi(0)} ${h-pad.b} Z`} fill="url(#themeAreaGrad)"/>
      <path d={p2} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" strokeDasharray="4 3"/>
      <path d={p1} fill="none" stroke="var(--aurum-500)" strokeWidth="1.8"/>
      <text x={pad.l} y={h-5} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">90d ago</text>
      <text x={w-pad.r} y={h-5} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">today</text>
    </svg>
  );
};

Object.assign(window, { ThemePage });
