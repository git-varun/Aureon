/* ============================================================
   Aureon — Asset detail page
   ============================================================ */

const AssetDetail = ({ ticker, go }) => {
  const { allRecs, active, apply } = useApp();
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingSig, setGeneratingSig] = useState(false);
  const [expandedSigs, setExpandedSigs] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, [ticker]);

  if (loading) {
    return (
      <>
        <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11.5,color:'var(--ink-40)',marginBottom:14,opacity:0.4}}>
          <span>Assets</span><span>/</span><span>···</span>
        </div>
        <div style={{display:'flex',alignItems:'flex-start',gap:24,paddingBottom:20,borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:22}}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:48,height:48,borderRadius:10,background:'rgba(255,255,255,0.06)'}}/>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{width:180,height:18,borderRadius:4,background:'rgba(255,255,255,0.07)',animation:'pulse 1.2s ease-in-out infinite'}}/>
              <div style={{width:280,height:14,borderRadius:4,background:'rgba(255,255,255,0.04)',animation:'pulse 1.2s ease-in-out infinite 0.15s'}}/>
            </div>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </>
    );
  }

  const h = HOLDINGS.find(x => x.ticker === ticker);
  const u = IN_UNIVERSE.find(x => x.sym === ticker);
  const inPortfolio = !!h;

  const asset = h ? {
    ticker:h.ticker, name:h.name, class:h.class, sector:h.sector,
    price:h.price, dayPct:h.dayPct, tier:h.tier, beta:h.beta,
  } : u ? {
    ticker:u.sym, name:u.name, class:u.class, sector:u.sector,
    price:u.price, dayPct:u.dayPct, tier:'active', beta:null,
  } : null;

  if (!asset) return (
    <div style={{padding:40,color:'var(--ink-30)'}}>Asset not found. <button onClick={() => go('assets')} className="du3-cta ghost">Back to assets</button></div>
  );

  const ex = ASSET_EXTRAS[ticker] || {};
  const series = PRICE_SERIES[ticker] || (u ? genSeries(ticker, asset.price, 60, 0.018, asset.dayPct > 0 ? 0.001 : -0.001) : null);
  const rec = allRecs.find(r => r.scope?.kind==='asset' && r.scope.ref === ticker && active.includes(r.id));
  const sigs = (ex.signals||[]).map(id => SIGNAL_BY_ID[id]).filter(Boolean);
  const events = inPortfolio ? [
    { i: Math.floor((series||[]).length*0.45), label:'Trim · 5/4' },
    { i: Math.floor((series||[]).length*0.78), label:'Add · 5/22' },
  ] : [];

  // Portfolio-only financials
  const v   = h ? valueOf(h) : null;
  const pl  = h ? plOf(h)   : null;
  const wt  = h ? valueOf(h) / NET_WORTH : null;
  const plPct = h && h.cost > 0 ? plPctOf(h) : null;

  const openModal = (rec, onConfirm) => setModal({ rec, onConfirm });

  return (
    <>
      {/* Breadcrumb */}
      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11.5,color:'var(--ink-40)',marginBottom:14}}>
        <button onClick={() => go('assets')} className="du3-cta ghost" style={{padding:'2px 6px',height:'auto',fontSize:11.5}}>Assets</button>
        <span>/</span>
        <button onClick={() => go('assets')} className="du3-cta ghost" style={{padding:'2px 6px',height:'auto',fontSize:11.5}}>{CLASS_LABEL[asset.class]}</button>
        <span>/</span>
        <span style={{color:'var(--ink-10)',fontFamily:'var(--font-mono)'}}>{asset.ticker}</span>
      </div>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',gap:24,paddingBottom:20,borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:22,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{
            width:48,height:48,borderRadius:10,
            display:'flex',alignItems:'center',justifyContent:'center',
            background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
            fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em',
          }}>{asset.ticker.slice(0,4)}</div>
          <div>
            <div style={{display:'flex',alignItems:'baseline',gap:10}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{asset.ticker}</span>
              <TierChip tier={asset.tier}/>
            </div>
            <div style={{fontFamily:'var(--font-heading)',fontSize:18,fontWeight:600,color:'var(--ink-10)',letterSpacing:'-0.01em',marginTop:2}}>{asset.name}</div>
            <div style={{fontSize:11.5,color:'var(--ink-40)',marginTop:4}}>{CLASS_LABEL[asset.class]} · {asset.sector}</div>
            {!inPortfolio && (
              <span style={{
                display:'inline-block',marginTop:8,
                background:'rgba(122,168,212,0.10)',border:'1px solid rgba(122,168,212,0.25)',
                borderRadius:999,padding:'3px 10px',
                color:'var(--azure-500, #7AA8D4)',fontSize:11,fontWeight:600,letterSpacing:'0.10em',textTransform:'uppercase',
              }}>Not in portfolio</span>
            )}
          </div>
        </div>
        <div style={{flex:1,minWidth:120}}/>
        <div>
          <Eyebrow>Last price</Eyebrow>
          <div style={{fontFamily:'var(--font-mono)',fontSize:36,fontWeight:500,color:'var(--ink-00)',marginTop:6,lineHeight:1,letterSpacing:'-0.015em'}}>
            {fmtMoney(asset.price,'USD',{dp:2})}
          </div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:13,color: asset.dayPct>=0?'var(--sage-500)':'var(--crimson-500)',marginTop:6}}>
            {asset.dayPct>=0?'▲':'▼'} {(Math.abs(asset.dayPct)*100).toFixed(2)}% today
          </div>
        </div>
      </div>

      {/* Chart */}
      {asset.tier !== 'passive' && series && (
        <section className="layer-1" style={{padding:'14px 18px 4px',marginBottom:18}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
            <div>
              <Eyebrow>Price · 60-day</Eyebrow>
              <div style={{fontSize:12,color:'var(--ink-30)',marginTop:4}}>Markers show prior recommendations applied to this asset</div>
            </div>
            <div style={{display:'flex',gap:0}}>
              {['1D','1W','1M','3M','1Y','ALL'].map((p,i) => (
                <button key={p} style={{
                  padding:'4px 10px',fontSize:11,fontFamily:'var(--font-mono)',
                  background: i===2 ? 'rgba(201,168,106,0.12)' : 'transparent',
                  color: i===2 ? 'var(--aurum-100)' : 'var(--ink-30)',
                  border:'none',cursor:'pointer',borderRadius:4,
                }}>{p}</button>
              ))}
            </div>
          </div>
          <PriceChart series={series} events={events} height={220}/>
        </section>
      )}

      {/* AI panel */}
      <SectionHead
        eyebrow="Decision · what to do with this position"
        title="AI panel"
        meta={rec ? '1 active · history below' : 'No active recommendation'}
      />
      {rec ? (
        <DecisionUnit rec={rec} activeIds={active} onCommit={apply} onUndo={()=>{}} onResolveConflict={()=>{}} openModal={openModal}/>
      ) : (
        <div className="layer-1" style={{padding:'18px 20px',display:'flex',alignItems:'center',gap:14}}>
          <span style={{width:8,height:8,borderRadius:999,background:'var(--ink-40)'}}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-10)'}}>Hold — no action</div>
            <div style={{fontSize:12.5,color:'var(--ink-30)',marginTop:2}}>Position is on target. Aureon will surface a recommendation when signals warrant.</div>
          </div>
          <button className="du3-cta ghost" onClick={() => go('signals')}>View signals →</button>
        </div>
      )}

      {/* History — portfolio only */}
      {inPortfolio && (
        <div style={{marginTop:10,padding:'10px 14px',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:8,fontSize:11.5,color:'var(--ink-30)'}}>
          <span style={{color:'var(--ink-20)',fontWeight:500,marginRight:8}}>History</span>
          2 prior decisions · last applied 7d ago (Hold)
        </div>
      )}

      {/* Fundamentals + Signals */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:22}}>
        <section className="layer-1" style={{padding:'14px 18px'}}>
          <Eyebrow>Fundamentals</Eyebrow>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 24px',marginTop:12}}>
            {[
              ['P/E', ex.pe!=null ? ex.pe : '—'],
              ['PEG', ex.peg!=null ? ex.peg : '—'],
              ['Yield', ex.yield!=null ? (ex.yield*100).toFixed(2)+'%' : '—'],
              ['Market cap', ex.mcap || '—'],
              ['Beta', asset.beta || '—'],
              ['Rev · 1y', ex.rev1y || '—'],
            ].map(([k,val]) => (
              <div key={k}>
                <div style={{fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{k}</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:16,fontWeight:500,color:'var(--ink-00)',marginTop:4}}>{val}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="layer-1" style={{padding:'14px 18px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'baseline',gap:10}}>
              <Eyebrow>Signals · inputs only</Eyebrow>
              <span style={{fontSize:11,color:'var(--ink-40)'}}>{sigs.length} detected</span>
            </div>
            <button
              disabled={generatingSig}
              onClick={() => { setGeneratingSig(true); setTimeout(() => setGeneratingSig(false), 1800); }}
              style={{
                display:'inline-flex',alignItems:'center',gap:6,
                height:28,padding:'0 12px',borderRadius:6,
                background:'transparent',border:'1px solid rgba(255,255,255,0.10)',
                color:generatingSig?'var(--ink-40)':'var(--ink-20)',
                fontSize:12,fontFamily:'var(--font-ui)',cursor:'pointer',
              }}>
              {generatingSig ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                     style={{animation:'spin 1s linear infinite'}}>
                  <circle cx="12" cy="12" r="9" strokeDasharray="40 80"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              )}
              {generatingSig ? 'Generating…' : 'Generate Signal'}
            </button>
          </div>
          {sigs.length === 0 ? (
            <Empty>No active signals on this position.</Empty>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {sigs.map(s => {
                const action = /trim|reduce|harvest/i.test(s.linkedRec||'') ? 'SELL' : /add|buy/i.test(s.linkedRec||'') ? 'BUY' : 'HOLD';
                const bStyle = {
                  BUY:  { bg:'rgba(111,174,136,0.10)', border:'rgba(111,174,136,0.25)', color:'var(--sage-500)' },
                  SELL: { bg:'rgba(209,107,107,0.10)', border:'rgba(209,107,107,0.25)', color:'var(--crimson-500)' },
                  HOLD: { bg:'rgba(255,255,255,0.06)', border:'rgba(255,255,255,0.12)', color:'var(--ink-30)' },
                }[action];
                const conf = s.severity==='high' ? 78+(s.id.charCodeAt(4)%10) : s.severity==='med' ? 58+(s.id.charCodeAt(4)%12) : 40+(s.id.charCodeAt(4)%14);
                const filled = Math.round(conf/10);
                const expanded = expandedSigs.has(s.id);
                const linkedRecObj = s.linkedRec ? allRecs.find(r => r.id === s.linkedRec) : null;
                return (
                  <div key={s.id}>
                    <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:10,padding:'10px 0',alignItems:'start',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <span style={{
                        padding:'2px 8px',borderRadius:4,marginTop:1,flexShrink:0,
                        background:bStyle.bg,border:`1px solid ${bStyle.border}`,
                        color:bStyle.color,fontFamily:'var(--font-mono)',
                        fontSize:10,fontWeight:600,letterSpacing:'0.08em',
                      }}>{action}</span>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:12.5,color:'var(--ink-10)',lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{s.text}</div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:5}}>
                          <div style={{display:'flex',gap:2}}>
                            {Array.from({length:10},(_,i) => (
                              <span key={i} style={{width:8,height:3,borderRadius:1,background: i < filled ? 'var(--aurum-500)' : 'rgba(255,255,255,0.10)'}}/>
                            ))}
                          </div>
                          <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)'}}>{conf}%</span>
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)'}}>{s.ts}</div>
                        <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--ink-40)',marginTop:2}}>{s.kind}</div>
                      </div>
                      {linkedRecObj ? (
                        <button onClick={() => setExpandedSigs(prev => {
                          const next = new Set(prev);
                          next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                          return next;
                        })} style={{
                          background:'none',border:'none',cursor:'pointer',padding:2,color:'var(--ink-40)',
                          transform:expanded?'rotate(180deg)':'rotate(0deg)',transition:'transform 160ms var(--ease-std)',
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                      ) : <span/>}
                    </div>
                    {linkedRecObj && expanded && (
                      <div style={{
                        marginLeft:16,marginBottom:6,padding:'8px 12px',
                        background:'rgba(201,168,106,0.06)',
                        borderLeft:'1px solid rgba(201,168,106,0.18)',
                        borderRadius:'0 6px 6px 0',
                        display:'flex',alignItems:'center',gap:10,
                        animation:'cardEnter 160ms var(--ease-decel)',
                      }}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,color:'var(--ink-10)',fontWeight:500}}>{linkedRecObj.title}</div>
                          <div style={{fontSize:11,color:'var(--aurum-100)',marginTop:2,fontFamily:'var(--font-mono)'}}>{linkedRecObj.action} · {linkedRecObj.impactOneLine}</div>
                        </div>
                        <button onClick={() => go('recommendations')} className="du3-cta ghost" style={{padding:'0 10px',height:26,fontSize:11,flexShrink:0}}>Apply →</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{fontSize:11,color:'var(--ink-40)',marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
            Signals are inputs. Decisions live in <button onClick={() => go('recommendations')} className="du3-cta ghost" style={{padding:'0 4px',height:'auto',fontSize:11}}>Recommendations</button>.
          </div>
        </section>
      </div>

      {/* Position section — portfolio only; replaced with CTA for non-portfolio */}
      {inPortfolio && h ? (
        <section className="layer-1" style={{padding:'14px 18px',marginTop:14}}>
          <Eyebrow>Position</Eyebrow>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:24,marginTop:12}}>
            {[
              ['Quantity', h.qty.toLocaleString(undefined, {maximumFractionDigits:4})],
              ['Avg cost', fmtMoney(h.cost,'USD',{dp:2})],
              ['Value', fmtMoney(v,'USD',{dp:0})],
              ['Unreal P/L', plPct != null
                ? (pl>=0?'+':'−')+fmtMoney(Math.abs(pl),'USD',{dp:0})+' · '+(plPct>=0?'+':'−')+(Math.abs(plPct)*100).toFixed(1)+'%'
                : fmtMoney(Math.abs(pl),'USD',{dp:0})],
              ['Weight', wt != null ? (wt*100).toFixed(2)+'%' : '—'],
            ].map(([k,val],i) => (
              <div key={k}>
                <div style={{fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{k}</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:18,fontWeight:500,
                  color: i===3 && pl<0 ? 'var(--crimson-500)' : i===3 ? 'var(--sage-500)' : 'var(--ink-00)',
                  marginTop:4,letterSpacing:'-0.01em'}}>{val}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="layer-1" style={{padding:'14px 18px',marginTop:14,display:'flex',alignItems:'center',gap:10}}>
          <div style={{flex:1,fontSize:13,color:'var(--ink-30)'}}>This asset is not in your portfolio.</div>
          <button className="du3-cta ghost" onClick={() => alert('Add to watchlist (demo)')}>Add to Watchlist</button>
          <button onClick={() => alert('Record position (demo)')} style={{
            height:32,padding:'0 14px',borderRadius:6,cursor:'pointer',fontSize:13,fontFamily:'var(--font-ui)',fontWeight:500,
            background:'rgba(201,168,106,0.14)',border:'1px solid rgba(201,168,106,0.35)',color:'var(--aurum-100)',
          }}>Buy / Record Position</button>
        </section>
      )}

      <div style={{height:32}}/>
      {modal && <ActionConfirmationModal rec={modal.rec} onCancel={() => setModal(null)} onConfirm={() => { modal.onConfirm?.(); setModal(null); }}/>}
    </>
  );
};

Object.assign(window, { AssetDetail });
