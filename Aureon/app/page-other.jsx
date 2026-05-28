/* ============================================================
   Aureon — Signals + Recommendations + Activity pages
   ============================================================ */

const Signals = ({ go }) => {
  const { search } = useApp();
  const [kind, setKind] = useState('all');
  const [sev, setSev] = useState('all');

  const filtered = useMemo(() => {
    let s = SIGNALS.slice();
    if (kind !== 'all') s = s.filter(x => x.kind === kind);
    if (sev !== 'all') s = s.filter(x => x.severity === sev);
    if (search) s = s.filter(x => (x.asset+' '+x.text+' '+x.kind).toLowerCase().includes(search.toLowerCase()));
    return s;
  }, [kind, sev, search]);

  const kinds = ['all','momentum','sentiment','allocation','volatility','fundamentals','macro','news'];
  const sevs = ['all','high','med','low'];

  return (
    <>
      <div style={{padding:'10px 14px',marginBottom:18,borderRadius:10,background:'rgba(212,162,87,0.06)',border:'1px solid rgba(212,162,87,0.20)',fontSize:12.5,color:'var(--ink-10)',display:'flex',alignItems:'center',gap:10}}>
        <span style={{color:'var(--dusk-500)'}}>⚠</span>
        <span><b style={{color:'var(--ink-00)',fontWeight:500}}>Signals are inputs.</b> See <button onClick={() => go('recommendations')} className="du3-cta ghost" style={{padding:'0 4px',height:'auto',fontSize:12.5}}>Recommendations</button> for decisions.</span>
      </div>

      <div style={{display:'flex',gap:24,alignItems:'flex-end',paddingBottom:14,marginBottom:14,borderBottom:'1px solid rgba(255,255,255,0.05)',flexWrap:'wrap'}}>
        <div>
          <Eyebrow>Today</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:36,fontWeight:500,color:'var(--ink-00)',marginTop:6,lineHeight:1}}>{SIGNALS.length}</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:4}}>signals detected</div>
        </div>
        <div>
          <Eyebrow>High severity</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:24,fontWeight:500,color:'var(--crimson-500)',marginTop:6}}>{SIGNALS.filter(s=>s.severity==='high').length}</div>
        </div>
        <div>
          <Eyebrow>Linked to recs</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:24,fontWeight:500,color:'var(--aurum-100)',marginTop:6}}>{SIGNALS.filter(s=>s.linkedRec).length}</div>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <select value={kind} onChange={e => setKind(e.target.value)} style={{padding:'7px 12px',fontSize:12,borderRadius:8,background:'var(--canvas)',border:'1px solid rgba(255,255,255,0.10)',color:'var(--ink-10)',fontFamily:'var(--font-ui)',colorScheme:'dark',cursor:'pointer',outline:'none'}}>
            {kinds.map(k => <option key={k} value={k}>{k==='all'?'All kinds':k}</option>)}
          </select>
          <select value={sev} onChange={e => setSev(e.target.value)} style={{padding:'7px 12px',fontSize:12,borderRadius:8,background:'var(--canvas)',border:'1px solid rgba(255,255,255,0.10)',color:'var(--ink-10)',fontFamily:'var(--font-ui)',colorScheme:'dark',cursor:'pointer',outline:'none'}}>
            {sevs.map(k => <option key={k} value={k}>{k==='all'?'All severities':k}</option>)}
          </select>
        </div>
      </div>

      <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'80px 80px 110px 90px 1fr 120px',gap:12,padding:'10px 18px',fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div>Time</div><div>Asset</div><div>Kind</div><div>Severity</div><div>Detection</div><div style={{textAlign:'right'}}>Linked</div>
        </div>
        {filtered.map(s => {
          const sevColor = s.severity==='high' ? 'var(--crimson-500)' : s.severity==='med' ? 'var(--dusk-500)' : 'var(--ink-30)';
          return (
            <div key={s.id} style={{display:'grid',gridTemplateColumns:'80px 80px 110px 90px 1fr 120px',gap:12,padding:'12px 18px',fontSize:12.5,alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-30)'}}>{s.ts}</span>
              <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-00)',fontWeight:600,letterSpacing:'0.04em'}}>{s.asset}</span>
              <span style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--ink-20)',fontWeight:500}}>{s.kind}</span>
              <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:sevColor}}>
                <span style={{width:6,height:6,borderRadius:999,background:sevColor}}/>{s.severity}
              </span>
              <span style={{color:'var(--ink-10)'}}>{s.text}</span>
              <span style={{textAlign:'right'}}>
                {s.linkedRec ? (
                  <button onClick={() => go('recommendations')} className="du3-cta" style={{padding:'2px 10px',height:24,fontSize:11}}>View rec →</button>
                ) : <span style={{fontSize:11,color:'var(--ink-40)'}}>no action</span>}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{padding:32,textAlign:'center',color:'var(--ink-30)'}}>No signals match.</div>}
      </div>
      <div style={{height:32}}/>
    </>
  );
};

/* ---------- Recommendations feed ---------- */
const RecommendationsFeed = ({ go }) => {
  const { allRecs, active, applied, dismissed, apply, dismiss } = useApp();
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('all');
  const [strength, setStrength] = useState('all');

  const activeList = allRecs.filter(r => active.includes(r.id));
  const filteredActive = activeList.filter(r => {
    if (filter !== 'all' && r.action !== filter) return false;
    if (strength !== 'all' && r.strength !== strength) return false;
    return true;
  });

  const openModal = (rec, onConfirm) => setModal({ rec, onConfirm });

  return (
    <>
      <div style={{display:'flex',alignItems:'flex-end',gap:24,paddingBottom:18,borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:18,flexWrap:'wrap'}}>
        <div>
          <Eyebrow>Active</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:36,fontWeight:500,color:'var(--ink-00)',marginTop:6,lineHeight:1}}>{active.length}</div>
        </div>
        <div>
          <Eyebrow>Applied</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:24,fontWeight:500,color:'var(--sage-500)',marginTop:6}}>{applied.length}</div>
        </div>
        <div>
          <Eyebrow>Dismissed</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:24,fontWeight:500,color:'var(--ink-30)',marginTop:6}}>{dismissed.length}</div>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <select value={strength} onChange={e => setStrength(e.target.value)} style={{padding:'7px 12px',fontSize:12,borderRadius:8,background:'var(--canvas)',border:'1px solid rgba(255,255,255,0.10)',color:'var(--ink-10)',fontFamily:'var(--font-ui)',colorScheme:'dark',cursor:'pointer',outline:'none'}}>
            <option value="all">All strengths</option>
            <option value="recommended">Recommended</option>
            <option value="consider">Consider</option>
            <option value="conflict">Conflict</option>
            <option value="hold">Hold</option>
          </select>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{padding:'7px 12px',fontSize:12,borderRadius:8,background:'var(--canvas)',border:'1px solid rgba(255,255,255,0.10)',color:'var(--ink-10)',fontFamily:'var(--font-ui)',colorScheme:'dark',cursor:'pointer',outline:'none'}}>
            <option value="all">All actions</option>
            <option>Reduce</option><option>Add</option><option>Hold</option><option>Rebalance</option><option>Harvest</option><option>Ladder</option>
          </select>
        </div>
      </div>

      <SectionHead eyebrow="Active · awaiting your decision" title="Active recommendations" meta={`${filteredActive.length} of ${activeList.length}`}/>
      {filteredActive.length === 0 ? (
        <div style={{padding:'32px 24px',textAlign:'center',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12,background:'rgba(255,255,255,0.015)'}}>
          <div style={{fontSize:14,color:'var(--ink-20)',fontFamily:'var(--font-heading)',fontWeight:600,marginBottom:6}}>No active recommendations</div>
          <div style={{fontSize:12.5,color:'var(--ink-40)',marginBottom:16}}>Aureon generates recommendations when signals warrant action.</div>
          <button onClick={() => alert('AI briefing queued (demo)')} className="du3-cta" style={{background:'rgba(201,168,106,0.14)',border:'1px solid rgba(201,168,106,0.35)',color:'var(--aurum-100)'}}>Run AI briefing →</button>
        </div>
      ) : (
        <div style={{display:'grid',gap:10}}>
          {filteredActive.map(rec => (
            <div key={rec.id} style={{position:'relative'}}>
              <DecisionUnit rec={rec} activeIds={active} onCommit={apply} onUndo={()=>{}} onResolveConflict={()=>{}} openModal={openModal}/>
              <button onClick={() => dismiss(rec.id, 'User dismissed')} style={{
                position:'absolute',top:14,right:14,zIndex:1,
                padding:'2px 8px',fontSize:10.5,borderRadius:4,
                background:'transparent',border:'1px solid rgba(255,255,255,0.06)',color:'var(--ink-40)',cursor:'pointer',
              }}>Dismiss</button>
            </div>
          ))}
        </div>
      )}

      {applied.length > 0 && (
        <>
          <SectionHead eyebrow="Applied" title="Recently applied" meta={`${applied.length} this session`}/>
          <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
            {applied.map(a => {
              const r = allRecs.find(x => x.id === a.id); if (!r) return null;
              return (
                <div key={a.id} style={{display:'grid',gridTemplateColumns:'80px 100px 1fr 110px 100px',gap:12,padding:'12px 18px',fontSize:12.5,alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-30)'}}>{a.ts}</span>
                  <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-10)',fontWeight:600}}>{r.action}</span>
                  <span style={{color:'var(--ink-10)'}}>{r.title} · {r.impactOneLine}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--sage-500)'}}>realized {a.realized}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)',textAlign:'right'}}>vs {a.predicted}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {dismissed.length > 0 && (
        <>
          <SectionHead eyebrow="Dismissed" title="Dismissed" meta={`${dismissed.length}`}/>
          <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
            {dismissed.map(d => {
              const r = allRecs.find(x => x.id === d.id); if (!r) return null;
              return (
                <div key={d.id} style={{display:'grid',gridTemplateColumns:'80px 100px 1fr 1fr',gap:12,padding:'12px 18px',fontSize:12.5,alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.04)',opacity:0.7}}>
                  <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-30)'}}>{d.ts}</span>
                  <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-30)'}}>{r.action}</span>
                  <span style={{color:'var(--ink-20)'}}>{r.title}</span>
                  <span style={{fontSize:11,color:'var(--ink-40)',textAlign:'right'}}>{d.reason}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div style={{height:32}}/>

      {modal && <ActionConfirmationModal rec={modal.rec} onCancel={() => setModal(null)} onConfirm={() => { modal.onConfirm?.(); setModal(null); }}/>}
    </>
  );
};

/* ---------- Activity ledger ---------- */
const Activity = ({ go }) => {
  const { activity } = useApp();
  const [kind, setKind] = useState('all');
  const [undoneIds, setUndoneIds] = useState(new Set());
  const [removedIds, setRemovedIds] = useState(new Set());

  const handleUndo = (id) => {
    setUndoneIds(prev => new Set([...prev, id]));
    setTimeout(() => setRemovedIds(prev => new Set([...prev, id])), 120);
  };

  const filtered = activity.filter(a => (kind === 'all' || a.kind === kind) && !removedIds.has(a.id));

  const counts = {
    applied:      activity.filter(a => a.kind==='applied').length,
    dismissed:    activity.filter(a => a.kind==='dismissed').length,
    contribution: activity.filter(a => a.kind==='contribution').length,
  };

  const groups = {};
  filtered.forEach(a => { const day = a.ts.split('·')[0].trim(); (groups[day] = groups[day] || []).push(a); });

  return (
    <>
      <div style={{display:'flex',alignItems:'flex-end',gap:24,paddingBottom:18,borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:18,flexWrap:'wrap'}}>
        <div>
          <Eyebrow>Last 30 days</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:36,fontWeight:500,color:'var(--ink-00)',marginTop:6,lineHeight:1}}>{activity.length}</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:4}}>entries</div>
        </div>
        <div><Eyebrow>Applied</Eyebrow><div style={{fontFamily:'var(--font-mono)',fontSize:22,color:'var(--sage-500)',marginTop:6}}>{counts.applied}</div></div>
        <div><Eyebrow>Dismissed</Eyebrow><div style={{fontFamily:'var(--font-mono)',fontSize:22,color:'var(--ink-30)',marginTop:6}}>{counts.dismissed}</div></div>
        <div><Eyebrow>Contributions</Eyebrow><div style={{fontFamily:'var(--font-mono)',fontSize:22,color:'var(--ink-10)',marginTop:6}}>{counts.contribution}</div></div>
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:6,padding:4,borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          {[['all','All'],['applied','Applied'],['dismissed','Dismissed'],['contribution','Contributions']].map(([k,l]) => (
            <button key={k} onClick={() => setKind(k)} style={{padding:'5px 12px',fontSize:11.5,borderRadius:6,border:'none',cursor:'pointer',background: kind===k ? 'rgba(255,255,255,0.07)' : 'transparent',color: kind===k ? 'var(--ink-00)' : 'var(--ink-30)'}}>{l}</button>
          ))}
        </div>
      </div>

      {Object.entries(groups).map(([day, items]) => (
        <section key={day} style={{marginBottom:20}}>
          <div style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,marginBottom:8,paddingLeft:4}}>{day}</div>
          <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
            {items.map(a => {
              const tone = a.kind==='applied' ? 'var(--sage-500)' : a.kind==='dismissed' ? 'var(--ink-40)' : 'var(--azure-500, #7AA8D4)';
              const icon = a.kind==='applied' ? '✓' : a.kind==='dismissed' ? '✕' : '+';
              const fading = undoneIds.has(a.id);
              const canUndo = a.kind === 'applied' || a.kind === 'dismissed';
              return (
                <div key={a.id} style={{
                  display:'flex',alignItems:'center',gap:16,
                  padding:'12px 18px',fontSize:12.5,
                  borderBottom:'1px solid rgba(255,255,255,0.04)',
                  opacity: fading ? 0 : 1,
                  transition:'opacity 120ms ease',
                }}>
                  {/* Left: icon + content */}
                  <span style={{width:22,height:22,borderRadius:999,display:'inline-flex',alignItems:'center',justifyContent:'center',background:`color-mix(in oklab, ${tone} 18%, transparent)`,color:tone,fontSize:11,flexShrink:0}}>{icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
                      <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-10)',fontWeight:600}}>{a.action}</span>
                      <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-00)',fontWeight:600,letterSpacing:'0.04em'}}>{a.asset}</span>
                      <span style={{fontSize:11.5,color:'var(--ink-20)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.detail}</span>
                    </div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)',marginTop:2}}>{a.ts.split('·')[1]?.trim() || a.ts}</div>
                  </div>
                  {/* Right: amount + undo */}
                  <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                    {a.realized && (
                      <span style={{fontFamily:'var(--font-mono)',fontSize:11,textAlign:'right'}}>
                        <span style={{color:'var(--sage-500)'}}>{a.realized}</span>
                        {a.predicted && <span style={{color:'var(--ink-40)'}}> vs {a.predicted}</span>}
                      </span>
                    )}
                    {canUndo && !fading && (
                      <button
                        onClick={() => handleUndo(a.id)}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                        style={{
                          display:'inline-flex',alignItems:'center',gap:5,
                          height:26,padding:'0 10px',borderRadius:6,cursor:'pointer',
                          background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.10)',
                          color:'var(--ink-20)',fontSize:12,fontFamily:'var(--font-ui)',
                        }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
                        </svg>
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <div style={{height:32}}/>
    </>
  );
};

/* ---------- AI Briefings archive ---------- */
// TODO: fetch from apiService.fetchBriefingHistory() — GET /analytics/ai/briefings?limit=30
const MOCK_BRIEFINGS = [
  { id:'b-1', date:'Thu, 22 May · 07:00 IST', trend:'Constructive', trendColor:'var(--sage-500)', trendBg:'rgba(111,174,136,0.10)', trendBorder:'rgba(111,174,136,0.28)', action:'HOLD', confidence:74, summary:'Markets opened steady. Portfolio allocation within target bands. NVDA momentum reversal flagged — consider trim. Bond allocation 2pp below target — ladder opportunity forming.' },
  { id:'b-2', date:'Wed, 21 May · 07:00 IST', trend:'Neutral',      trendColor:'var(--aurum-100)', trendBg:'rgba(201,168,106,0.10)', trendBorder:'rgba(201,168,106,0.28)', action:'HOLD', confidence:61, summary:'Mixed signals across tech and financials. BTC volatility elevated above 90th percentile — trim signal queued. SIP contribution of ₹25,000 scheduled today via Groww.' },
  { id:'b-3', date:'Tue, 20 May · 07:00 IST', trend:'Cautious',     trendColor:'var(--crimson-500)', trendBg:'rgba(201,82,82,0.10)', trendBorder:'rgba(201,82,82,0.28)', action:'REDUCE', confidence:82, summary:'Macro print stronger than expected. Tech allocation 6pp above target — rebalance recommendation queued. AGG add opportunity identified on yield spike.' },
  { id:'b-4', date:'Mon, 19 May · 07:00 IST', trend:'Constructive', trendColor:'var(--sage-500)', trendBg:'rgba(111,174,136,0.10)', trendBorder:'rgba(111,174,136,0.28)', action:'ADD', confidence:69, summary:'Portfolio outperformed NIFTY 50 by 0.3pp last week. Momentum across financials and telecom positive. BHARTIARTL target raised by 2 analysts.' },
  { id:'b-5', date:'Fri, 16 May · 07:00 IST', trend:'Neutral',      trendColor:'var(--aurum-100)', trendBg:'rgba(201,168,106,0.10)', trendBorder:'rgba(201,168,106,0.28)', action:'HOLD', confidence:55, summary:'4 decisions applied this week, 1 dismissed. Net cash freed: +$3,200. Portfolio drift: stocks 5.8pp above target — rebalance building.' },
];

const AIBriefings = ({ go }) => {
  const [running, setRunning] = useState(false);
  const [briefings, setBriefings] = useState(MOCK_BRIEFINGS);

  const runNow = () => {
    setRunning(true);
    // TODO: call apiService.runGlobalAI() then apiService.fetchBriefingHistory()
    setTimeout(() => {
      setRunning(false);
      const now = new Date();
      setBriefings(b => [{
        id:'b-'+Date.now(),
        date:now.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})+' · '+now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})+' IST',
        trend:'Constructive',trendColor:'var(--sage-500)',trendBg:'rgba(111,174,136,0.10)',trendBorder:'rgba(111,174,136,0.28)',
        action:'HOLD',confidence:70+Math.floor(Math.random()*15),
        summary:'On-demand briefing complete. Portfolio signals reviewed. No new high-confidence recommendations — current positions within target bands.',
      },...b]);
    }, 2400);
  };

  return (
    <>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',paddingBottom:18,borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:18}}>
        <div>
          <Eyebrow>Morning briefing history</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:36,fontWeight:500,color:'var(--ink-00)',marginTop:6,lineHeight:1}}>{briefings.length}</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:4}}>briefings</div>
        </div>
        <button onClick={runNow} disabled={running} className="du3-cta"
          style={{background:'rgba(201,168,106,0.14)',border:'1px solid rgba(201,168,106,0.35)',color:'var(--aurum-100)',display:'inline-flex',alignItems:'center',gap:8}}>
          {running ? (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>Running…</>
          ) : 'Run now'}
        </button>
      </div>

      {briefings.length === 0 ? (
        <div style={{padding:'48px 24px',textAlign:'center',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12,background:'rgba(255,255,255,0.015)'}}>
          <div style={{fontSize:14,color:'var(--ink-20)',fontFamily:'var(--font-heading)',fontWeight:600,marginBottom:6}}>No briefings yet</div>
          <div style={{fontSize:12.5,color:'var(--ink-40)'}}>Run your first AI briefing using the Run button above.</div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {briefings.map(b => (
            <div key={b.id} className="layer-1" style={{padding:'16px 20px'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:'var(--ink-40)'}}>{b.date}</span>
                <span style={{fontSize:10.5,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',padding:'2px 8px',borderRadius:4,background:b.trendBg,border:`1px solid ${b.trendBorder}`,color:b.trendColor}}>{b.trend}</span>
                <span style={{
                  fontSize:10.5,fontFamily:'var(--font-mono)',fontWeight:600,padding:'2px 8px',borderRadius:4,
                  background:b.action==='ADD'?'rgba(111,174,136,0.10)':b.action==='REDUCE'?'rgba(209,107,107,0.10)':'rgba(255,255,255,0.06)',
                  border:b.action==='ADD'?'1px solid rgba(111,174,136,0.25)':b.action==='REDUCE'?'1px solid rgba(209,107,107,0.25)':'1px solid rgba(255,255,255,0.10)',
                  color:b.action==='ADD'?'var(--sage-500)':b.action==='REDUCE'?'var(--crimson-500)':'var(--ink-30)',
                }}>{b.action}</span>
                <span style={{flex:1}}/>
                <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)'}}>Conf {b.confidence}%</span>
              </div>
              <div style={{fontSize:13,color:'var(--ink-10)',lineHeight:1.6}}>{b.summary}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{height:32}}/>
    </>
  );
};

Object.assign(window, { Signals, RecommendationsFeed, Activity, AIBriefings });
