/* ============================================================
   Aureon — Sector Detail Page
   Performance · stocks · technical · news · AI chat
   ============================================================ */

const SECTOR_STOCKS = {
  'IT':            ['TCS','INFY','WIPRO','HCLTECH','TECHM','MPHASIS'],
  'Financials':    ['HDFCBANK','ICICIBANK','KOTAKBANK','SBIN','BAJFINANCE','AXISBANK'],
  'Energy':        ['RELIANCE','ONGC','BPCL','COALINDIA','IOC'],
  'FMCG':          ['HINDUNILVR','ITC','NESTLEIND','BRITANNIA','DABUR','GODREJCP'],
  'Auto':          ['TATAMOTORS','MARUTI','BAJAJ-AUTO','EICHERMOT','HEROMOTOCO'],
  'Pharma':        ['SUNPHARMA','DRREDDY','DIVISLAB','CIPLA','APOLLOHOSP'],
  'Metals':        ['TATASTEEL','HINDALCO','JSWSTEEL','VEDL','NMDC'],
  'Realty':        ['DLF','GODREJPROP','PRESTIGE','OBEROIRLTY','BRIGADE'],
  'Telecom':       ['BHARTIARTL','IDEA','TATACOMM'],
  'Power':         ['POWERGRID','NTPC','TATAPOWER','ADANIGREEN','CESC'],
  'Capital goods': ['LT','ABB','SIEMENS','BHEL','CUMMINS','KEC'],
  'Consumer':      ['TITAN','HAVELLS','BATAINDIA','VBL','MCDOWELLN'],
};

const SECTOR_AI = {
  'IT':            { confidence:88, momentum:'strong',   take:'GenAI deal flow accelerating across large-caps. Margin recovery on track; headcount stabilization confirms productivity gains. INFY and TECHM leading AI-native transformation.', rationale:'US tech spend recovery + AI services premium pricing driving re-rating.', risk:'Visa cost headwinds; BFSI client budget scrutiny in H2.' },
  'Financials':    { confidence:82, momentum:'positive', take:'Credit growth moderating to sustainable 14–15%. NIMs stabilizing post-rate cycle peak. HDFCBANK merger absorption nearing completion — re-rating possible.', rationale:'RBI policy pivot supportive; asset quality resilient across large private banks.', risk:'Unsecured retail stress emerging; watch credit card NPA trends in Q2.' },
  'Energy':        { confidence:74, momentum:'neutral',  take:'Reliance diversification buffering oil price softness. Upstream PSUs at attractive valuations but policy risk elevated. Green energy pivot undervalued by market.', rationale:'GRM normalization; RIL new energy capex ramping in earnest.', risk:'Crude price volatility; refining margin compression risk if demand slows.' },
  'FMCG':          { confidence:71, momentum:'neutral',  take:'Rural recovery gradual; urban premiumization sustaining. Input cost tailwind fading but pricing power intact in HPC. Volume growth acceleration expected in H2.', rationale:'Monsoon trajectory and government transfers boost rural demand outlook.', risk:'El Niño impact on rural sentiment; competitive intensity rising from D2C brands.' },
  'Auto':          { confidence:68, momentum:'neutral',  take:'Domestic CV cycle plateauing; PV premiumization continues. JLR outlook improving but domestic 2W recovery lagging. EV transition headwind for near-term margins.', rationale:'Festival demand sustaining PV; SUV mix driving ASP expansion.', risk:'Insurance regulation impact on 2W; EV cannibalization risk in FY27.' },
  'Pharma':        { confidence:79, momentum:'positive', take:'US generics pricing stabilizing; domestic formulations outperforming. CDMO opportunity emerging as China+1 plays out. Sun Pharma specialty build is a long-term structural positive.', rationale:'USFDA inspection clearances improving; para-IV pipeline robust.', risk:'Pricing pressure in US base generics; R&D productivity remaining a concern.' },
  'Metals':        { confidence:62, momentum:'neutral',  take:'China demand uncertainty overhang persists. Domestic infra capex supporting steel consumption. HRC spreads under pressure from global oversupply.', rationale:'India infrastructure spending provides a buffer against global softness.', risk:'China stimulus disappointment; iron ore price spike risk from supply disruptions.' },
  'Realty':        { confidence:85, momentum:'strong',   take:'Luxury residential demand at decade highs; pricing power in Tier 1 cities is strong. DLF and Godrej pre-sales at record levels. Office absorption recovering in Bengaluru/Mumbai.', rationale:'Low mortgage rates + urban migration driving sustained demand.', risk:'Interest rate reversal risk; regulatory changes in land permitting timelines.' },
  'Telecom':       { confidence:80, momentum:'positive', take:'ARPU expansion runway intact post tariff hikes. Bharti Airtel outperforming on enterprise + Africa segment. Data monetization inflection expected in 12 months.', rationale:'Consolidation benefits accruing to top 2 players; 5G capex cycle maturing.', risk:'BSNL revival could add competitive pressure in rural markets.' },
  'Power':         { confidence:76, momentum:'positive', take:'Transmission + generation capex supercycle intact. Renewable capacity additions accelerating. NTPC green pivot remains underappreciated by the street.', rationale:'Power demand growing 8% YoY; grid investment is mission-critical.', risk:'Distribution company payment delays; land acquisition risks for large projects.' },
  'Capital goods': { confidence:86, momentum:'strong',   take:'Order books at multi-year highs. LT, Siemens and ABB executing on industrial automation + data centre demand. Margins expanding on operating leverage.', rationale:'Government + private capex both accelerating simultaneously for first time in a decade.', risk:'Execution risk at scale; commodity cost passthrough delays could squeeze margins.' },
  'Consumer':      { confidence:73, momentum:'neutral',  take:'Premium segment resilient; mass market under pressure. Titan jewellery and Havells showing strong volume momentum. Prefer selective picks over broad exposure.', rationale:'Income polarization driving premiumization at the top end of consumption.', risk:'Rural stress impacting mass consumer; commodity cost pickup squeezing margins.' },
};

const SECTOR_NEWS = {
  'IT':            [{ ts:'2h',  sent:+0.4, t:'GenAI deal TCV up 3× YoY — large Indian IT outperforming consensus on bookings.' },{ ts:'6h',  sent:+0.2, t:'INFY raises FY26 guidance citing AI services traction; analysts revise targets upward.' },{ ts:'1d',  sent:-0.1, t:'US BFSI discretionary spend cautious — enterprise tech budgets under review for H2.' }],
  'Financials':    [{ ts:'1h',  sent:+0.3, t:'HDFCBANK Q4 deposits up 22% — merger absorption concerns fading fast.' },{ ts:'4h',  sent:-0.2, t:'RBI flags unsecured retail stress; credit card NPAs up 40bps QoQ.' },{ ts:'1d',  sent:+0.1, t:'ICICIBANK pre-provision profit beats estimate; full-year guidance maintained.' }],
  'Energy':        [{ ts:'3h',  sent:-0.2, t:'Brent crude below $82 — GRM headwind for downstream PSUs widening.' },{ ts:'8h',  sent:+0.3, t:'Reliance JioEnergy signs 2GW solar agreement; green pivot accelerates.' },{ ts:'2d',  sent:0.0,  t:'ONGC dividend guidance maintained; upstream volumes broadly in line.' }],
  'FMCG':          [{ ts:'2h',  sent:+0.1, t:'IMD forecasts near-normal monsoon — rural FMCG demand revival expected in H2.' },{ ts:'5h',  sent:-0.1, t:'HUL Q4 volumes flat; premium mix driving revenue growth 4% YoY.' },{ ts:'1d',  sent:+0.2, t:'Dabur rural channel stocking recovering after Q3 destocking cycle.' }],
  'Auto':          [{ ts:'1h',  sent:-0.3, t:'Tata Motors JLR margin guidance cautious — CFO flags chip shortage tail risk.' },{ ts:'6h',  sent:+0.2, t:'Maruti SUV order backlog at 8 weeks; ASP up 7% on product mix.' },{ ts:'1d',  sent:+0.1, t:'2W registration data improves in April — rural recovery gaining traction.' }],
  'Pharma':        [{ ts:'3h',  sent:+0.3, t:'Sun Pharma US specialty portfolio approval — analysts upgrade to Buy.' },{ ts:'7h',  sent:+0.2, t:"Dr Reddy's CDMO pipeline gains traction; 3 new contracts signed in Q4." },{ ts:'2d',  sent:-0.1, t:'USFDA import alert on one Cipla facility; contained to 2 products only.' }],
  'Metals':        [{ ts:'2h',  sent:-0.3, t:'China PMI disappoints — steel futures fall 1.8% on weak demand outlook.' },{ ts:'9h',  sent:+0.1, t:'India HRC prices stable; domestic infra demand offsetting export weakness.' },{ ts:'2d',  sent:-0.2, t:'Tata Steel UK restructuring charge — one-time drag on consolidated P&L.' }],
  'Realty':        [{ ts:'1h',  sent:+0.5, t:'DLF pre-sales ₹4,200cr in Q4 — highest quarterly booking in company history.' },{ ts:'5h',  sent:+0.3, t:'Godrej Properties acquires 18-acre Mumbai land parcel at premium valuation.' },{ ts:'1d',  sent:+0.2, t:'Office leasing up 14% in Bengaluru and Hyderabad — IT demand recovering.' }],
  'Telecom':       [{ ts:'2h',  sent:+0.4, t:'Bharti Airtel ARPU hits ₹208 — tariff hike impact flowing through fully.' },{ ts:'6h',  sent:+0.1, t:'5G subscriber additions accelerating; monetization models emerging in enterprise.' },{ ts:'1d',  sent:-0.1, t:'BSNL 4G rollout faster than expected — rural market competitive pressure building.' }],
  'Power':         [{ ts:'3h',  sent:+0.3, t:'Power demand up 9.2% YoY in April — grid stress during peak hours.' },{ ts:'8h',  sent:+0.2, t:'NTPC 5GW green capacity addition confirmed on track for FY26.' },{ ts:'2d',  sent:-0.1, t:'State DISCOM dues up ₹900cr — payment timeline risk for generation companies.' }],
  'Capital goods': [{ ts:'1h',  sent:+0.4, t:'LT order inflows ₹72,000cr in Q4 — domestic and international both strong.' },{ ts:'4h',  sent:+0.3, t:'Siemens India data centre pipeline at ₹8,000cr — fastest-growing vertical.' },{ ts:'1d',  sent:+0.1, t:'ABB India margins expand 180bps — automation and digital revenue mix rising.' }],
  'Consumer':      [{ ts:'2h',  sent:+0.2, t:'Titan jewellery revenue +22% — wedding season demand sustaining through May.' },{ ts:'7h',  sent:-0.1, t:'Havells consumer volumes cautious in Q4; infrastructure segment remains strong.' },{ ts:'1d',  sent:+0.1, t:'Premium beer and spirits sustaining double-digit growth in urban markets.' }],
};

/* ---- deterministic series generators ---- */
const mkSectorSeries = (name, dayPct, pts = 90) => {
  const seed = name.charCodeAt(0) + name.length * 7;
  let val = 100; const arr = [val];
  for (let i = 1; i < pts; i++) {
    const trend = dayPct * 252 / pts * 0.38;
    const noise = (Math.sin(i * seed * 0.29 + seed) * 0.008) + ((i * seed * 43) % 1000 / 1000 - 0.49) * 0.013;
    val = val * (1 + trend + noise); arr.push(val);
  }
  return arr;
};
const mkSectorBench = (pts = 90) => {
  let val = 100; const arr = [val];
  for (let i = 1; i < pts; i++) { val = val * (1 + 0.00019 + ((i * 37) % 1000 / 1000 - 0.49) * 0.010); arr.push(val); }
  return arr;
};
const sentColor = s => s > 0.2 ? 'var(--sage-500)' : s < -0.2 ? 'var(--crimson-500)' : 'var(--ink-30)';

/* ================================================================
   SectorPage
   ================================================================ */
const SectorPage = ({ go, sectorName }) => {
  const name   = decodeURIComponent(sectorName || 'IT');
  const sector = NIFTY_SECTORS.find(s => s.name === name) || NIFTY_SECTORS[0];
  const ai     = SECTOR_AI[sector.name]   || SECTOR_AI['IT'];
  const news   = SECTOR_NEWS[sector.name] || [];
  const syms   = SECTOR_STOCKS[sector.name] || [];

  const [tab,         setTab]         = useState('overview');
  const [revaluating, setRevaluating] = useState(false);
  const [aiTake,      setAiTake]      = useState(ai.take);
  const [aiConf,      setAiConf]      = useState(ai.confidence);
  const [lastEval,    setLastEval]    = useState('14:00 · today');
  const [chatInput,   setChatInput]   = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    const a = SECTOR_AI[sector.name] || SECTOR_AI['IT'];
    setAiTake(a.take); setAiConf(a.confidence);
    setLastEval('14:00 · today'); setChatHistory([]); setTab('overview');
  }, [sector.name]);

  const series      = useMemo(() => mkSectorSeries(sector.name, sector.dayPct), [sector.name]);
  const benchSeries = useMemo(() => mkSectorBench(), []);

  const retColor  = sector.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)';
  const confColor = aiConf >= 80 ? 'var(--sage-500)' : aiConf >= 65 ? 'var(--aurum-100)' : 'var(--crimson-500)';
  const momColor  = ai.momentum === 'strong' ? 'var(--sage-500)' : ai.momentum === 'positive' ? '#7EB8A4' : 'var(--ink-30)';
  const momLabel  = ai.momentum === 'strong' ? 'Strong' : ai.momentum === 'positive' ? 'Positive' : 'Neutral';

  const handleRevaluate = async () => {
    setRevaluating(true);
    try {
      const prompt = `You are Aureon, a concise AI investment analyst. Re-evaluate this sector in 1–2 sentences and output ONLY valid JSON.
Sector: ${sector.name}
NIFTY weight: ${(sector.wt * 100).toFixed(1)}%
Today: ${sector.dayPct >= 0 ? '+' : ''}${(sector.dayPct * 100).toFixed(2)}%
Format: {"take":"...","confidence":<50-95>}`;
      const raw = await window.claude.complete(prompt);
      try {
        const m = raw.match(/\{[\s\S]*?\}/);
        const p = JSON.parse(m ? m[0] : '{}');
        if (p.take) setAiTake(p.take);
        if (p.confidence) setAiConf(Math.min(99, Math.max(30, p.confidence)));
      } catch { setAiTake(raw.slice(0, 220)); }
      const now = new Date();
      setLastEval(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} · today (refreshed)`);
    } catch (e) { console.error(e); }
    setRevaluating(false);
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim(); setChatInput('');
    setChatHistory(h => [...h, { role:'user', text:msg }]);
    setChatLoading(true);
    try {
      const ctx = `Sector: ${sector.name}\nNIFTY weight: ${(sector.wt*100).toFixed(1)}%\nToday: ${sector.dayPct>=0?'+':''}${(sector.dayPct*100).toFixed(2)}%\nKey stocks: ${syms.join(', ')}\nCurrent AI take: ${aiTake}`;
      const resp = await window.claude.complete({ messages:[{ role:'user', content:`You are Aureon, a concise AI wealth advisor. Respond in 2–3 sentences max.\nContext:\n${ctx}\n\nQuestion: ${msg}` }] });
      setChatHistory(h => [...h, { role:'ai', text:resp }]);
    } catch { setChatHistory(h => [...h, { role:'ai', text:'Unable to reach Aureon right now. Please try again.' }]); }
    setChatLoading(false);
  };

  return (
    <>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:18,flexWrap:'wrap'}}>
        <button onClick={() => go('markets')} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',color:'var(--ink-30)',cursor:'pointer',fontSize:12,fontFamily:'var(--font-ui)',padding:'6px 0',marginTop:2,flexShrink:0}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
          Markets
        </button>
        <div style={{flex:1,minWidth:200}}>
          <Eyebrow>Sector · NIFTY heatmap</Eyebrow>
          <div style={{display:'flex',alignItems:'center',gap:12,marginTop:4,flexWrap:'wrap'}}>
            <h2 style={{margin:0,fontFamily:'var(--font-heading)',fontSize:24,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.02em'}}>{sector.name}</h2>
            <span style={{fontFamily:'var(--font-mono)',fontSize:14,color:retColor,fontWeight:500}}>
              {sector.dayPct>=0?'+':''}{(sector.dayPct*100).toFixed(2)}%
              <span style={{fontSize:11,color:'var(--ink-40)',fontFamily:'var(--font-ui)',fontWeight:400,marginLeft:4}}>today</span>
            </span>
            <span style={{fontSize:10.5,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,padding:'3px 9px',borderRadius:999,background:aiConf>=80?'rgba(111,174,136,0.12)':aiConf>=65?'rgba(201,168,106,0.12)':'rgba(209,107,107,0.12)',color:confColor}}>AI {aiConf}% confident</span>
          </div>
          <div style={{fontSize:12.5,color:'var(--ink-30)',marginTop:4}}>NIFTY weight: {(sector.wt*100).toFixed(1)}% · {syms.length} tracked stocks</div>
        </div>
        <div style={{display:'flex',gap:8,flexShrink:0,marginTop:2}}>
          <button onClick={handleRevaluate} disabled={revaluating} style={{display:'flex',alignItems:'center',gap:7,height:34,padding:'0 14px',borderRadius:8,background:'rgba(201,168,106,0.10)',border:'1px solid rgba(201,168,106,0.28)',color:'var(--aurum-100)',fontSize:12.5,fontFamily:'var(--font-ui)',fontWeight:500,cursor:revaluating?'not-allowed':'pointer',opacity:revaluating?0.7:1}}>
            {revaluating
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite',flexShrink:0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
            }
            {revaluating ? 'Evaluating…' : 'Re-evaluate'}
          </button>
          <button onClick={() => setTab('ai')} style={{height:34,padding:'0 14px',borderRadius:8,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',color:'var(--ink-20)',fontSize:12.5,fontFamily:'var(--font-ui)',cursor:'pointer'}}>Ask AI →</button>
        </div>
      </div>

      {/* AI Take banner */}
      <div className="layer-1" style={{padding:'14px 18px',marginBottom:16,borderLeft:'3px solid var(--aurum-500)',borderRadius:'4px 10px 10px 4px'}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--aurum-500)',fontWeight:600,marginBottom:6}}>AI Take</div>
            <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:500,color:'var(--ink-00)',lineHeight:1.55}}>{aiTake}</div>
            <div style={{marginTop:8,display:'flex',gap:16,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'var(--ink-40)'}}>Last evaluated: {lastEval}</span>
              <span style={{fontSize:11,color:momColor}}>● {momLabel} momentum</span>
            </div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:32,fontWeight:500,color:confColor,lineHeight:1}}>{aiConf}</div>
            <div style={{fontSize:10,color:'var(--ink-40)',marginTop:2,letterSpacing:'0.06em',textTransform:'uppercase'}}>Confidence</div>
          </div>
        </div>
        <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.06)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div style={{fontSize:11.5,color:'var(--ink-30)'}}><span style={{color:'var(--sage-500)',fontWeight:600}}>Rationale: </span>{ai.rationale}</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)'}}><span style={{color:'#D4A257',fontWeight:600}}>Risk: </span>{ai.risk}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:16}}>
        {[['overview','Overview'],['stocks','Stocks'],['technical','Technical'],['news','News'],['ai','AI Chat']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12.5,color:tab===id?'var(--ink-00)':'var(--ink-40)',borderBottom:'2px solid '+(tab===id?'var(--aurum-500)':'transparent'),fontWeight:tab===id?500:400}}>{label}</button>
        ))}
      </div>

      {tab==='overview'  && <SecOverviewTab  sector={sector} series={series} benchSeries={benchSeries} ai={ai} aiConf={aiConf} syms={syms} news={news} go={go} momColor={momColor} momLabel={momLabel}/>}
      {tab==='stocks'    && <SecStocksTab    syms={syms} sector={sector} go={go}/>}
      {tab==='technical' && <SecTechTab      sector={sector}/>}
      {tab==='news'      && <SecNewsTab      news={news}/>}
      {tab==='ai'        && <SecAITab        sector={sector} aiTake={aiTake} aiConf={aiConf} lastEval={lastEval} chatHistory={chatHistory} chatInput={chatInput} setChatInput={setChatInput} chatLoading={chatLoading} handleChat={handleChat} handleRevaluate={handleRevaluate} revaluating={revaluating}/>}
      <div style={{height:32}}/>
    </>
  );
};

/* ---- Overview ---- */
const SecOverviewTab = ({ sector, series, benchSeries, ai, aiConf, syms, news, go, momColor, momLabel }) => (
  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14,alignItems:'start'}}>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <Eyebrow>90-day performance vs Nifty 50</Eyebrow>
          <div style={{display:'flex',gap:14,fontSize:11}}>
            <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-30)'}}><span style={{width:14,height:2,background:'var(--aurum-500)',display:'inline-block',borderRadius:1,flexShrink:0}}/>Sector</span>
            <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-40)'}}><span style={{width:14,height:2,background:'rgba(255,255,255,0.22)',display:'inline-block',borderRadius:1,flexShrink:0}}/>Nifty 50</span>
          </div>
        </div>
        <ThemeDualChart series={series} benchSeries={benchSeries} height={160}/>
      </div>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <Eyebrow>Latest News</Eyebrow>
        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:0}}>
          {news.slice(0,3).map((n,i) => (
            <div key={i} style={{display:'grid',gridTemplateColumns:'40px 56px 1fr',gap:12,padding:'9px 0',borderBottom:i<2?'1px solid rgba(255,255,255,0.04)':'none',alignItems:'center'}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)'}}>{n.ts}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:sentColor(n.sent)}}>sent {n.sent>=0?'+':''}{n.sent.toFixed(1)}</span>
              <span style={{fontSize:12.5,color:'var(--ink-10)',lineHeight:1.4}}>{n.t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <Eyebrow>Sector Stats</Eyebrow>
        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:9}}>
          {[
            ['NIFTY weight', `${(sector.wt*100).toFixed(1)}%`, 'var(--ink-10)'],
            ['Today', `${sector.dayPct>=0?'+':''}${(sector.dayPct*100).toFixed(2)}%`, sector.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'],
            ['Momentum', momLabel, momColor],
            ['AI confidence', `${aiConf}%`, aiConf>=80?'var(--sage-500)':'var(--aurum-100)'],
            ['Tracked stocks', `${syms.length}`, 'var(--ink-10)'],
          ].map(([k,v,c]) => (
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11.5,color:'var(--ink-40)'}}>{k}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:c,fontWeight:500}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="layer-1" style={{padding:'14px 16px'}}>
        <Eyebrow>Top Stocks</Eyebrow>
        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
          {syms.slice(0,5).map(sym => {
            const u = IN_UNIVERSE.find(x => x.sym === sym);
            return (
              <button key={sym} onClick={() => go('terminal', sym)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'none',border:'none',cursor:'pointer',color:'inherit',padding:'3px 0',textAlign:'left'}}
                onMouseEnter={e => e.currentTarget.style.opacity='0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity='1'}
              >
                <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-00)',fontWeight:600,letterSpacing:'0.04em'}}>{sym}</span>
                {u ? <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:u.dayPct>=0?'var(--sage-500)':'var(--crimson-500)'}}>{u.dayPct>=0?'+':''}{(u.dayPct*100).toFixed(2)}%</span>
                   : <span style={{fontSize:11,color:'var(--ink-40)'}}>→</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

/* ---- Stocks Tab ---- */
const SecStocksTab = ({ syms, sector, go }) => (
  <div className="layer-1">
    <div style={{display:'grid',gridTemplateColumns:'1.4fr 1.4fr 1fr 0.8fr 0.6fr',gap:12,padding:'10px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
      {['Symbol','Name','Price','Day Δ',''].map((h,i) => (
        <div key={h+i} style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{h}</div>
      ))}
    </div>
    {syms.map((sym, i) => {
      const u = IN_UNIVERSE.find(x => x.sym === sym);
      const seed = sym.charCodeAt(0) * 41;
      const synPrice = 800 + seed % 3200;
      const synPct   = ((seed * 17) % 100 - 50) / 2000 + sector.dayPct * 0.65;
      const price = u ? u.price : synPrice;
      const pct   = u ? u.dayPct : synPct;
      const name  = u ? u.name : sym;
      return (
        <div key={sym} style={{display:'grid',gridTemplateColumns:'1.4fr 1.4fr 1fr 0.8fr 0.6fr',gap:12,padding:'12px 18px',borderBottom:i<syms.length-1?'1px solid rgba(255,255,255,0.04)':'none',alignItems:'center'}}>
          <span style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{sym}</span>
          <span style={{fontSize:11.5,color:'var(--ink-30)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</span>
          <span style={{fontFamily:'var(--font-mono)',fontSize:12.5,color:'var(--ink-10)'}}>₹{price.toLocaleString('en-IN',{maximumFractionDigits:2})}</span>
          <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:pct>=0?'var(--sage-500)':'var(--crimson-500)'}}>{pct>=0?'+':''}{(pct*100).toFixed(2)}%</span>
          <button onClick={() => go('terminal', sym)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',color:'var(--ink-30)',cursor:'pointer',fontFamily:'var(--font-ui)'}}>Open →</button>
        </div>
      );
    })}
  </div>
);

/* ---- Technical Tab ---- */
const SecTechTab = ({ sector }) => {
  const [generating, setGenerating] = useState(false);
  const [signals, setSignals] = useState(null);
  useEffect(() => { setSignals(null); }, [sector.name]);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const rsi  = 38 + Math.floor((sector.name.charCodeAt(0) * 17 + 42) % 32);
      const macd = ((sector.dayPct > 0 ? 0.5 : -0.4) + ((sector.name.charCodeAt(0) * 31) % 100 / 100 - 0.4) * 0.6).toFixed(3);
      const adx  = 16 + Math.floor((sector.name.length * 19 + 12) % 26);
      const conf = 52 + Math.floor((sector.name.charCodeAt(0) * 11) % 30);
      const trend = sector.dayPct > 0.01 ? 'Bullish' : sector.dayPct > 0 ? 'Mildly bullish' : 'Bearish';
      const trendColor = trend === 'Bullish' ? 'var(--sage-500)' : trend === 'Mildly bullish' ? 'var(--aurum-100)' : 'var(--crimson-500)';
      setSignals({ rsi, macd, adx, conf, trend, trendColor });
      setGenerating(false);
    }, 1600);
  };

  if (!signals) return (
    <div style={{padding:'48px 24px',textAlign:'center',background:'rgba(255,255,255,0.015)',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12}}>
      <div style={{width:48,height:48,borderRadius:999,background:'rgba(201,168,106,0.08)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </div>
      <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',marginBottom:6}}>No signal generated</div>
      <div style={{fontSize:13,color:'var(--ink-30)',maxWidth:300,margin:'0 auto 20px',lineHeight:1.5}}>Generate a composite RSI + MACD + ADX technical signal for the {sector.name} sector.</div>
      <button disabled={generating} onClick={handleGenerate} style={{display:'inline-flex',alignItems:'center',gap:8,height:36,padding:'0 20px',borderRadius:8,background:'rgba(201,168,106,0.12)',border:'1px solid rgba(201,168,106,0.28)',color:'var(--aurum-100)',fontSize:13,fontFamily:'var(--font-ui)',fontWeight:500,cursor:generating?'not-allowed':'pointer',opacity:generating?0.7:1}}>
        {generating ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>Generating…</> : 'Generate Signal'}
      </button>
    </div>
  );

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:14}}>
        {[
          ['RSI · 14',       signals.rsi,   signals.rsi>70?'Overbought':signals.rsi<30?'Oversold':'Neutral',    signals.rsi>60?'var(--sage-500)':signals.rsi<40?'var(--crimson-500)':'var(--ink-00)'],
          ['MACD',           signals.macd,  Number(signals.macd)>0?'Positive crossover':'Negative crossover',   Number(signals.macd)>0?'var(--sage-500)':'var(--crimson-500)'],
          ['ADX · Strength', signals.adx,   signals.adx>25?'Trending':'Ranging',                                signals.adx>25?'var(--sage-500)':'var(--ink-30)'],
          ['Trend',          signals.trend, `Confidence ${signals.conf}%`,                                      signals.trendColor],
        ].map(([k,v,sub,c]) => (
          <div key={k} className="layer-1" style={{padding:'14px 16px'}}>
            <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{k}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color:c,marginTop:8}}>{v}</div>
            <div style={{fontSize:11,color:'var(--ink-40)',marginTop:4}}>{sub}</div>
          </div>
        ))}
      </div>
      <button onClick={() => setSignals(null)} style={{fontSize:12,padding:'6px 14px',borderRadius:6,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',color:'var(--ink-30)',cursor:'pointer',fontFamily:'var(--font-ui)'}}>↺ Re-generate</button>
    </div>
  );
};

/* ---- News Tab ---- */
const SecNewsTab = ({ news }) => (
  <div style={{display:'flex',flexDirection:'column',gap:8}}>
    {news.map((n,i) => (
      <div key={i} style={{display:'grid',gridTemplateColumns:'48px 64px 1fr',gap:14,padding:'12px 16px',borderRadius:10,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',alignItems:'center'}}>
        <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)'}}>{n.ts}</span>
        <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:sentColor(n.sent)}}>sent {n.sent>=0?'+':''}{n.sent.toFixed(1)}</span>
        <span style={{fontSize:13,color:'var(--ink-10)',lineHeight:1.45}}>{n.t}</span>
      </div>
    ))}
    <div style={{fontSize:11,color:'var(--ink-40)',marginTop:4,paddingLeft:4}}>Aureon summarizes news signals; sentiment scores are model-generated.</div>
  </div>
);

/* ---- AI Chat Tab ---- */
const SecAITab = ({ sector, aiTake, aiConf, lastEval, chatHistory, chatInput, setChatInput, chatLoading, handleChat, handleRevaluate, revaluating }) => {
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [chatHistory, chatLoading]);

  const suggestions = [
    `What's the near-term outlook for ${sector.name}?`,
    'Which stock in this sector has the best risk/reward?',
    `What macro factors drive the ${sector.name} sector?`,
    'How does this sector perform in a rate-cut cycle?',
  ];

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:14,alignItems:'start'}}>
      <div className="layer-1" style={{padding:'16px 18px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,paddingBottom:12,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{width:30,height:30,borderRadius:999,background:'rgba(201,168,106,0.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:'var(--ink-00)'}}>Ask Aureon about {sector.name}</div>
            <div style={{fontSize:11,color:'var(--ink-40)'}}>Context-aware · AI-powered</div>
          </div>
        </div>
        <div ref={scrollRef} style={{minHeight:220,maxHeight:340,overflowY:'auto',marginBottom:12,display:'flex',flexDirection:'column',gap:10}}>
          {chatHistory.length === 0 && (
            <div style={{padding:'8px 0',display:'flex',flexDirection:'column',gap:6}}>
              <div style={{fontSize:12,color:'var(--ink-40)',marginBottom:8}}>Suggested questions</div>
              {suggestions.map(s => (
                <button key={s} onClick={() => setChatInput(s)} style={{padding:'9px 12px',background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,color:'var(--ink-20)',fontSize:12.5,cursor:'pointer',textAlign:'left',fontFamily:'var(--font-ui)',lineHeight:1.4}}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                  onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                >{s}</button>
              ))}
            </div>
          )}
          {chatHistory.map((m,i) => (
            <div key={i} style={{padding:'10px 14px',borderRadius:10,fontSize:13,lineHeight:1.55,background:m.role==='user'?'rgba(201,168,106,0.08)':'rgba(255,255,255,0.03)',border:'1px solid '+(m.role==='user'?'rgba(201,168,106,0.15)':'rgba(255,255,255,0.06)'),color:m.role==='user'?'var(--aurum-100)':'var(--ink-10)',marginLeft:m.role==='user'?32:0,marginRight:m.role==='ai'?32:0}}>
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
        <div style={{display:'flex',gap:8}}>
          <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleChat()}
            placeholder={`Ask about ${sector.name} stocks, outlook…`}
            style={{flex:1,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'9px 14px',color:'var(--ink-00)',fontSize:13,fontFamily:'var(--font-ui)',outline:'none'}}
          />
          <button onClick={handleChat} disabled={!chatInput.trim()||chatLoading} style={{height:38,padding:'0 16px',borderRadius:8,background:'rgba(201,168,106,0.12)',border:'1px solid rgba(201,168,106,0.28)',color:'var(--aurum-100)',fontSize:13,cursor:'pointer',fontFamily:'var(--font-ui)',opacity:!chatInput.trim()||chatLoading?0.5:1}}>Send</button>
        </div>
      </div>
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
          <button onClick={handleRevaluate} disabled={revaluating} style={{marginTop:12,width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:7,height:34,borderRadius:8,background:'rgba(201,168,106,0.08)',border:'1px solid rgba(201,168,106,0.22)',color:'var(--aurum-100)',fontSize:12,fontFamily:'var(--font-ui)',cursor:revaluating?'not-allowed':'pointer',opacity:revaluating?0.7:1}}>
            {revaluating ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>Evaluating…</> : '↺ Re-evaluate now'}
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

Object.assign(window, { SectorPage });
