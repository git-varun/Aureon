/* ============================================================
   Aureon — Refactor overlay
   Reassigns Dashboard, Signals, Portfolio, AssetsIndex, SettingsPage
   on window so v3.html picks them up.
   ============================================================ */

/* ============================================================
   1) PortfolioProgress — collapsible, default collapsed
   ============================================================ */
const PortfolioProgress = () => {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('net'); // net · alloc · bench
  const [range, setRange] = useState('1Y');

  // Synthesized progress series — anchored on current NET_WORTH
  const trend = useMemo(() => genSeries('net-worth', NET_WORTH, 90, 0.014, 0.0014), []);
  const benchTrend = useMemo(() => genSeries('benchmark', NET_WORTH * 0.96, 90, 0.012, 0.0011), []);
  const startVal = trend[0];
  const endVal = trend[trend.length-1];
  const delta = endVal - startVal;
  const deltaPct = delta / startVal;
  const benchDelta = (benchTrend[benchTrend.length-1] - benchTrend[0]) / benchTrend[0];
  const alpha = deltaPct - benchDelta;

  // Allocation evolution (synthesized monthly snapshots)
  const allocSnaps = useMemo(() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].slice(-9);
    const cur = allocByClass();
    return months.map((m, idx) => {
      const drift = (idx - months.length+1) * 0.005;
      return {
        m,
        stocks: Math.max(0.30, cur.stocks - drift*1.6),
        funds:  Math.max(0.10, cur.funds + drift*0.4),
        bonds:  Math.max(0.06, cur.bonds + drift*0.6),
        crypto: Math.max(0.04, (cur.crypto||0.05) + drift*0.2),
        other:  Math.max(0.10, 1 - (cur.stocks + cur.funds + cur.bonds + (cur.crypto||0.05)))
      };
    });
  }, []);

  return (
    <section style={{marginBottom:20}}>
      {/* Summary header — always visible */}
      <button onClick={() => setOpen(o => !o)} className="layer-1" style={{
        display:'flex',alignItems:'center',gap:18,width:'100%',
        padding:'14px 20px',cursor:'pointer',
        background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)',
        borderRadius:10,color:'inherit',textAlign:'left',
        transition:'background 120ms var(--ease-std), border-color 120ms var(--ease-std)',
      }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.035)'}
         onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{
            width:26,height:26,borderRadius:7,display:'inline-flex',alignItems:'center',justifyContent:'center',
            background:'rgba(201,168,106,0.10)',border:'1px solid rgba(201,168,106,0.18)',color:'var(--aurum-100)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>
          </span>
          <div>
            <div style={{fontFamily:'var(--font-heading)',fontSize:14,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.005em'}}>Portfolio progress</div>
            <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:2}}>Trend · allocation evolution · benchmark</div>
          </div>
        </div>

        <div style={{flex:1}}/>

        {/* Inline summary */}
        <div style={{display:'flex',gap:24,alignItems:'baseline'}}>
          <SummaryStat label="90d Δ" value={`${deltaPct>=0?'+':''}${(deltaPct*100).toFixed(1)}%`} tone={deltaPct>=0?'pos':'neg'}/>
          <SummaryStat label="vs Bench" value={`${alpha>=0?'+':''}${(alpha*100).toFixed(1)}pp`} tone={alpha>=0?'pos':'neg'}/>
          <SummaryStat label="Drift" value="4.2pp" tone="warn"/>
          <Sparkline data={trend} w={120} h={28}/>
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

      {/* Expanded detail */}
      {open && (
        <div className="layer-1" style={{
          marginTop:8,padding:'18px 20px',
          background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,
          animation:'cardEnter 220ms var(--ease-decel)',
        }}>
          {/* Tabs */}
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:14,flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:4,padding:3,borderRadius:8,background:'rgba(0,0,0,0.20)',border:'1px solid rgba(255,255,255,0.05)'}}>
              {[['net','Net worth trend'],['alloc','Allocation evolution'],['bench','vs Benchmark']].map(([k,l]) => (
                <button key={k} onClick={() => setTab(k)} style={{
                  padding:'6px 14px',fontSize:12,borderRadius:5,cursor:'pointer',border:'none',
                  background: tab===k ? 'rgba(201,168,106,0.14)' : 'transparent',
                  color: tab===k ? 'var(--aurum-100)' : 'var(--ink-30)',
                  fontWeight: tab===k ? 500 : 400,
                }}>{l}</button>
              ))}
            </div>
            <div style={{flex:1}}/>
            <div style={{display:'flex',gap:0}}>
              {['1M','3M','6M','1Y','ALL'].map(p => (
                <button key={p} onClick={() => setRange(p)} style={{
                  padding:'4px 10px',fontSize:11,fontFamily:'var(--font-mono)',
                  background: range===p ? 'rgba(201,168,106,0.12)' : 'transparent',
                  color: range===p ? 'var(--aurum-100)' : 'var(--ink-30)',
                  border:'none',cursor:'pointer',borderRadius:4,
                }}>{p}</button>
              ))}
            </div>
          </div>

          {tab === 'net' && (
            <div style={{display:'grid',gridTemplateColumns:'2.2fr 1fr',gap:24}}>
              <div>
                {trend.length === 0 ? (
                  <div style={{height:220,display:'flex',alignItems:'center',justifyContent:'center',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:8}}>
                    <span style={{fontSize:12,color:'var(--ink-40)'}}>No price history</span>
                  </div>
                ) : trend.length === 1 ? (
                  <>
                    <div style={{fontSize:12,color:'var(--ink-40)',fontStyle:'italic',marginBottom:8,textAlign:'center'}}>
                      Tracking started today — history builds daily
                    </div>
                    <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMid meet" style={{width:'100%',height:220,display:'block'}}>
                      <circle cx="400" cy="105" r="12" fill="rgba(201,168,106,0.25)"/>
                      <circle cx="400" cy="105" r="6" fill="var(--aurum-500)"/>
                      <text x="400" y="140" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="var(--ink-40)">today</text>
                    </svg>
                  </>
                ) : (
                  <FlexChart series={trend} kind="area" height={220} dayPct={deltaPct}/>
                )}
                <div style={{marginTop:10,fontSize:11.5,color:'var(--ink-40)',lineHeight:1.55}}>
                  Net worth tracked over 90 trading days. The line reflects mark-to-market across active and semi-active holdings; passive assets are updated quarterly.
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <ProgressStat label="Start" value={fmtMoney(startVal,'USD',{dp:0})} sub="90d ago"/>
                <ProgressStat label="Current" value={fmtMoney(endVal,'USD',{dp:0})} sub="today" highlight/>
                <ProgressStat label="Δ" value={`${delta>=0?'+':'−'}${fmtMoney(Math.abs(delta),'USD',{dp:0})}`} sub={`${deltaPct>=0?'+':''}${(deltaPct*100).toFixed(2)}%`} tone={delta>=0?'pos':'neg'}/>
                <ProgressStat label="Avg / mo" value={`+${fmtMoney(delta/3,'USD',{dp:0})}`} sub="last 3 months"/>
              </div>
            </div>
          )}

          {tab === 'alloc' && <AllocationEvolution snaps={allocSnaps}/>}

          {tab === 'bench' && (
            <div>
              <BenchmarkChart portfolio={trend} bench={benchTrend} height={220}/>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginTop:14}}>
                <ProgressStat label="Portfolio" value={`${(deltaPct*100).toFixed(2)}%`} sub="90d"  tone={deltaPct>=0?'pos':'neg'}/>
                <ProgressStat label="Benchmark" value={`${(benchDelta*100).toFixed(2)}%`} sub="NIFTY 50 90d"/>
                <ProgressStat label="Alpha" value={`${alpha>=0?'+':''}${(alpha*100).toFixed(2)}pp`} sub="excess return" tone={alpha>=0?'pos':'neg'} highlight/>
                <ProgressStat label="Tracking err" value="3.2%" sub="annualized"/>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const SummaryStat = ({ label, value, tone }) => {
  const color = tone==='pos' ? 'var(--sage-500)' : tone==='neg' ? 'var(--crimson-500)' : tone==='warn' ? 'var(--dusk-500)' : 'var(--ink-00)';
  return (
    <div style={{textAlign:'right'}}>
      <div style={{fontSize:9.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{label}</div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:14,fontWeight:500,color,marginTop:2}}>{value}</div>
    </div>
  );
};
const ProgressStat = ({ label, value, sub, tone, highlight }) => {
  const color = tone==='pos' ? 'var(--sage-500)' : tone==='neg' ? 'var(--crimson-500)' : 'var(--ink-00)';
  return (
    <div style={{
      padding:'12px 14px',borderRadius:8,
      background: highlight ? 'rgba(201,168,106,0.08)' : 'rgba(255,255,255,0.025)',
      border: '1px solid ' + (highlight ? 'rgba(201,168,106,0.20)' : 'rgba(255,255,255,0.05)'),
    }}>
      <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{label}</div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:17,fontWeight:500,color,marginTop:4,letterSpacing:'-0.005em'}}>{value}</div>
      {sub && <div style={{fontSize:11,color:'var(--ink-30)',marginTop:2}}>{sub}</div>}
    </div>
  );
};

const AllocationEvolution = ({ snaps }) => {
  const palette = { stocks:'#C9A86A', funds:'#D4B888', bonds:'#7AA8D4', crypto:'#D4A257', other:'#6FAE88' };
  const labels = { stocks:'Stocks', funds:'Funds', bonds:'Bonds', crypto:'Crypto', other:'Other' };
  return (
    <div>
      {/* Stacked horizontal bars across time */}
      <div style={{display:'grid',gridTemplateColumns:'40px 1fr',gap:8,alignItems:'center'}}>
        {snaps.map((s,i) => (
          <React.Fragment key={i}>
            <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)',textAlign:'right'}}>{s.m}</span>
            <div style={{display:'flex',height:20,borderRadius:4,overflow:'hidden',background:'rgba(255,255,255,0.02)'}}>
              {['stocks','funds','bonds','crypto','other'].map(k => (
                <div key={k} style={{width:`${s[k]*100}%`,background:palette[k],opacity:0.85}}
                  title={`${labels[k]}: ${(s[k]*100).toFixed(1)}%`}/>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{display:'flex',gap:18,marginTop:14,flexWrap:'wrap'}}>
        {Object.entries(labels).map(([k,l]) => (
          <span key={k} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:'var(--ink-20)'}}>
            <span style={{width:10,height:10,borderRadius:2,background:palette[k]}}/>
            {l}
          </span>
        ))}
      </div>
      <div style={{marginTop:12,fontSize:11.5,color:'var(--ink-40)',lineHeight:1.55,maxWidth:720}}>
        Allocation shares by month. Stocks have drifted up over the last quarter; bonds added to close target gap.
      </div>
    </div>
  );
};

const BenchmarkChart = ({ portfolio, bench, height=220 }) => {
  // Normalize both to start = 100
  const norm = (s) => s.map(v => (v / s[0]) * 100);
  const p = norm(portfolio), b = norm(bench);
  const all = [...p, ...b];
  const min = Math.min(...all), max = Math.max(...all);
  const w = 800, h = height, pad = { l:48, r:14, t:12, b:24 };
  const r = max - min || 1;
  const x = (i) => pad.l + (i/(p.length-1))*(w-pad.l-pad.r);
  const y = (v) => pad.t + (1 - (v-min)/r)*(h-pad.t-pad.b);
  const path = (s) => s.map((v,i) => (i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:'100%',height,display:'block'}}>
      <defs>
        <linearGradient id="pAreaV3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9A86A" stopOpacity="0.22"/>
          <stop offset="1" stopColor="#C9A86A" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[min, (min+max)/2, max].map((t,i) => (
        <g key={i}>
          <line x1={pad.l} x2={w-pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.04)"/>
          <text x={pad.l-6} y={y(t)+4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{t.toFixed(0)}</text>
        </g>
      ))}
      <path d={path(p) + ` L ${x(p.length-1)} ${h-pad.b} L ${x(0)} ${h-pad.b} Z`} fill="url(#pAreaV3)"/>
      <path d={path(p)} fill="none" stroke="#C9A86A" strokeWidth="1.6"/>
      <path d={path(b)} fill="none" stroke="rgba(122,168,212,0.85)" strokeWidth="1.4" strokeDasharray="4 3"/>
      {/* Legend */}
      <g transform={`translate(${pad.l+8}, ${pad.t+8})`}>
        <rect width="160" height="36" rx="4" fill="rgba(0,0,0,0.35)"/>
        <line x1="10" x2="26" y1="14" y2="14" stroke="#C9A86A" strokeWidth="1.6"/>
        <text x="32" y="17" fontSize="11" fontFamily="var(--font-ui)" fill="var(--ink-10)">Portfolio</text>
        <line x1="10" x2="26" y1="28" y2="28" stroke="rgba(122,168,212,0.85)" strokeWidth="1.4" strokeDasharray="4 3"/>
        <text x="32" y="31" fontSize="11" fontFamily="var(--font-ui)" fill="var(--ink-10)">NIFTY 50</text>
      </g>
    </svg>
  );
};

/* ============================================================
   Goal progress widget
   ============================================================ */
const GoalProgress = ({ go }) => {
  const annualTarget = 20;
  const monthlySaving = 25000;
  if (!annualTarget && !monthlySaving) return null;

  const elapsedMonths = new Date().getMonth() + 1;
  const ytdReturn = 11.4; // synthetic YTD for prototype
  const pace = (annualTarget * elapsedMonths) / 12;
  const statusLabel = ytdReturn >= pace ? 'on track' : ytdReturn >= pace * 0.8 ? 'behind' : 'off track';
  const statusColor = ytdReturn >= pace ? 'var(--sage-500)' : ytdReturn >= pace * 0.8 ? 'var(--dusk-500)' : 'var(--crimson-500)';
  const thisMonthSaved = 42000;

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
      <div className="layer-1" style={{padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Target return</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color:'var(--ink-00)',marginTop:4}}>{annualTarget}%</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:2}}>annual target</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:20,fontWeight:500,color:statusColor}}>{ytdReturn}%</div>
          <div style={{fontSize:11,color:statusColor,marginTop:2}}>YTD · {statusLabel}</div>
          <button onClick={() => go('settings')} style={{fontSize:10.5,color:'var(--ink-40)',background:'none',border:'none',cursor:'pointer',padding:0,marginTop:4}}>edit goal →</button>
        </div>
      </div>
      <div className="layer-1" style={{padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>Monthly saving</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color:'var(--ink-00)',marginTop:4}}>{fmtINR(monthlySaving,{compact:true})}</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:2}}>/ month target</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:20,fontWeight:500,color:'var(--ink-00)'}}>{fmtINR(thisMonthSaved,{compact:true})}</div>
          <div style={{fontSize:11,color:'var(--ink-30)',marginTop:2}}>this month ›</div>
          <button onClick={() => go('settings')} style={{fontSize:10.5,color:'var(--ink-40)',background:'none',border:'none',cursor:'pointer',padding:0,marginTop:4}}>edit goal →</button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   New Dashboard — Hero + PortfolioProgress + rest unchanged
   ============================================================ */
const Dashboard = ({ go }) => {
  const { allRecs, active, apply } = useApp();
  const [modal, setModal] = useState(null);
  const recs = useMemo(() => allRecs.filter(r => active.includes(r.id)), [allRecs, active]);
  const dashRecs = recs.filter(r => r.confidence >= 50).slice(0, 3);
  const portfolio = PORTFOLIO_REC;

  const openModal = (rec, onConfirm) => setModal({ rec, onConfirm });
  const closeModal = () => setModal(null);
  const confirmModal = () => { modal.onConfirm?.(); setModal(null); };

  return (
    <>
      <Hero/>
      <PortfolioProgress/>
      <LifecycleStrip go={go}/>
      <GoalProgress go={go}/>

      <SectionHead
        eyebrow="Decisions · what should you do next"
        title="Active recommendations"
        meta={`${active.length} active · updated 3 min ago`}
        action={<button className="du3-cta ghost" onClick={() => go('recommendations')}>Review all →</button>}
      />

      {dashRecs.length === 0 ? (
        <EmptyDecisions/>
      ) : (
        <>
          <div style={{marginBottom:14}}>
            <PortfolioDecisionUnit rec={portfolio} onCommit={() => apply('pr-rebalance')} openModal={openModal}/>
          </div>
          <div style={{display:'grid',gap:10}}>
            {dashRecs.map(rec => (
              <WiredDecisionUnit key={rec.id} rec={rec} openModal={openModal} go={go}/>
            ))}
          </div>
        </>
      )}

      <SectionHead
        eyebrow="Portfolio · holdings at a glance"
        title="Top positions"
        meta={`${HOLDINGS.filter(h=>h.tier!=='passive').length} active · ${HOLDINGS.filter(h=>h.tier==='passive').length} passive`}
        action={<button className="du3-cta ghost" onClick={() => go('portfolio')}>Open portfolio →</button>}
      />
      <TopHoldingsRow go={go}/>

      <SupportingStrip go={go}/>
      <div style={{height:32}}/>

      {modal && <ActionConfirmationModal rec={modal.rec} onCancel={closeModal} onConfirm={confirmModal}/>}
    </>
  );
};

Object.assign(window, { Dashboard, PortfolioProgress, GoalProgress });
