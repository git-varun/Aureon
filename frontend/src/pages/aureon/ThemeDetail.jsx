/* Aureon — Theme Detail Page (Production)
   Full tab-based layout, UI parity with frozen prototype.
   Connects to real backend endpoints; never fabricates chart or metric data. */
import React, {useState, useEffect, useRef, useCallback} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {Eyebrow, Empty} from '@/components/aureon/ui';
import {apiService} from '@/api/apiService';
import {useApp} from '@/components/aureon/store';
import {ThemeForkDrawer} from '@/components/aureon/market/ThemeForkDrawer';
import toast from 'react-hot-toast';

/* ─── Signal metadata ────────────────────────────────────── */
const SKIND = {
    momentum:    {label:'Momentum',     c:'var(--aurum-500)',  bg:'rgba(201,168,106,0.08)'},
    sentiment:   {label:'Sentiment',    c:'var(--sage-500)',   bg:'rgba(111,174,136,0.07)'},
    macro:       {label:'Macro',        c:'#7AA8D4',           bg:'rgba(122,168,212,0.07)'},
    fundamentals:{label:'Fundamentals', c:'var(--ink-20)',     bg:'rgba(255,255,255,0.04)'},
    news:        {label:'News',         c:'var(--ink-30)',     bg:'rgba(255,255,255,0.03)'},
    allocation:  {label:'Allocation',   c:'var(--dusk-500)',   bg:'rgba(212,162,87,0.07)'},
};
const PULSE_META = {
    bullish:  {c:'var(--sage-500)',    bg:'rgba(111,174,136,0.10)', label:'Bullish'},
    positive: {c:'#7EB8A4',           bg:'rgba(111,174,136,0.07)', label:'Positive'},
    neutral:  {c:'var(--ink-30)',      bg:'rgba(255,255,255,0.04)', label:'Neutral'},
    cautious: {c:'var(--dusk-500)',    bg:'rgba(212,162,87,0.08)',  label:'Cautious'},
    bearish:  {c:'var(--crimson-500)', bg:'rgba(209,107,107,0.08)', label:'Bearish'},
};

/* ─── Helpers ─────────────────────────────────────────────── */
const cConfColor = (c) => c >= 80 ? 'var(--sage-500)' : c >= 65 ? 'var(--aurum-100)' : 'var(--crimson-500)';
const cConfBg    = (c) => c >= 80 ? 'rgba(111,174,136,0.12)' : c >= 65 ? 'rgba(201,168,106,0.12)' : 'rgba(209,107,107,0.12)';
const cMom       = (m) => m==='strong' ? {c:'var(--sage-500)',l:'Strong'} : m==='positive' ? {c:'#7EB8A4',l:'Positive'} : m==='weak' ? {c:'var(--crimson-500)',l:'Weak'} : {c:'var(--ink-30)',l:'Neutral'};
const sigColor   = (s) => !s ? 'var(--ink-40)' : s.includes('Strong') ? 'var(--sage-500)' : s==='Buy' ? '#7EB8A4' : s==='Hold' ? 'var(--ink-40)' : 'var(--crimson-500)';
const sevC       = (s) => s==='high'?'var(--aurum-500)':s==='med'?'var(--ink-30)':'var(--ink-50)';
const sevLabel   = (s) => s==='high'?'High':s==='med'?'Med':'Low';
const fmtRet     = (v) => v==null ? '—' : `${v>=0?'+':''}${(v*100).toFixed(1)}%`;

/* ─── Inline icons ───────────────────────────────────────── */
const CIcon = {
    back:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>,
    refresh: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>,
    fork:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M6 15.5a8 8 0 0 1 8-8h1.5"/></svg>,
    chat:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    edit:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1-2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
};
const CSpinner = ({s=13}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite',flexShrink:0}}>
        <circle cx="12" cy="12" r="9" strokeDasharray="40 80"/>
    </svg>
);

/* ─── Data normalizer ────────────────────────────────────── */
function normalizeTheme(raw, isSector) {
    if (!raw) return null;
    const constituents = (raw.constituents || raw.instruments || []).map(c => ({
        sym:    c.symbol || c.sym || c.ticker || '',
        name:   c.name || c.instrument_name || '',
        weight: c.weight || c.allocation || 0,
        ret1m:  c.ret_1m ?? c.ret1m ?? c.return_1m ?? null,
        signal: c.signal || c.recommendation || null,
    }));
    return {
        id:           raw.id || raw.theme_id || raw.sector_id || '',
        name:         raw.name || raw.sector_name || raw.theme_name || '',
        desc:         raw.description || raw.desc || '',
        count:        raw.constituent_count ?? raw.instrument_count ?? constituents.length,
        ret1m:        raw.ret_1m ?? raw.ret1m ?? raw.return_1m ?? null,
        vsBench:      raw.vs_bench    ?? raw.vs_nifty   ?? raw.vs_benchmark ?? null,
        maxDrawdown:  raw.max_drawdown ?? raw.maxDrawdown ?? null,
        annReturn:    raw.ann_return  ?? raw.annReturn  ?? raw.annualized_return ?? null,
        constituents,
        fundamentals: raw.fundamentals || {},
        tags:         raw.tags || [],
        type:         isSector ? 'Sector' : 'Theme · AI-curated',
    };
}

function normalizeNav(raw) {
    const pts = raw?.nav || raw?.snapshots || raw?.history || [];
    if (pts.length < 2) return null;
    return pts.map(p => p.value ?? p.nav_value ?? p.nav ?? 0);
}

function normalizeSignals(raw) {
    if (!raw) return {signals: [], summary: null};
    const signals = (raw.signals || (Array.isArray(raw) ? raw : [])).map(s => ({
        kind: s.kind || s.type || s.signal_type || 'news',
        sev:  s.sev || s.severity || s.level || 'low',
        sym:  s.sym || s.symbol || s.ticker || '—',
        text: s.text || s.description || s.message || '',
    }));
    const summary = raw.summary || null;
    return {signals, summary};
}

/* ─── Tab states ─────────────────────────────────────────── */
const TabSkeleton = ({rows=4}) => (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <style>{`@keyframes shimmerT{from{background-position:-200% 0}to{background-position:200% 0}}`}</style>
        {Array.from({length:rows}).map((_,i) => (
            <div key={i} style={{height:i===0?52:68,borderRadius:10,overflow:'hidden',position:'relative',background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.05)'}}>
                <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(255,255,255,0.00) 0%,rgba(255,255,255,0.04) 50%,rgba(255,255,255,0.00) 100%)',backgroundSize:'200% 100%',animation:'shimmerT 1.5s ease-in-out infinite'}}/>
            </div>
        ))}
    </div>
);

const TabError = ({msg, onRetry}) => (
    <div style={{padding:'36px 28px',textAlign:'center',border:'1px solid rgba(209,107,107,0.20)',borderRadius:12,background:'rgba(209,107,107,0.04)'}}>
        <div style={{width:40,height:40,borderRadius:999,background:'rgba(209,107,107,0.12)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:14}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--crimson-500)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        </div>
        <div style={{fontFamily:'var(--font-heading)',fontSize:16,fontWeight:600,color:'var(--ink-00)',marginBottom:6}}>Failed to load</div>
        <div style={{fontSize:12.5,color:'var(--ink-30)',marginBottom:18,maxWidth:340,margin:'0 auto 18px'}}>{msg||'Data unavailable. Please retry.'}</div>
        <button onClick={onRetry} className="du3-cta" style={{height:34,padding:'0 18px',display:'inline-flex',alignItems:'center',gap:7}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
            Retry
        </button>
    </div>
);

const TabEmpty = ({icon, title, body, cta}) => (
    <div style={{padding:'44px 28px',textAlign:'center',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12,background:'rgba(255,255,255,0.015)'}}>
        <div style={{width:48,height:48,borderRadius:999,background:'rgba(255,255,255,0.04)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:16,color:'var(--ink-40)'}}>
            {icon}
        </div>
        <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',marginBottom:6}}>{title}</div>
        <div style={{fontSize:13,color:'var(--ink-30)',maxWidth:360,margin:'0 auto 20px',lineHeight:1.55}}>{body}</div>
        {cta}
    </div>
);

/* ─── Dual-series chart ──────────────────────────────────── */
const ThemeDualChart = ({series, benchSeries, height=200}) => {
    if (!series?.length) return (
        <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8,border:'1px dashed rgba(255,255,255,0.08)',borderRadius:8,background:'rgba(255,255,255,0.015)'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>
            <span style={{fontSize:12,color:'var(--ink-40)'}}>No chart data yet — connect a provider to see performance history.</span>
        </div>
    );
    const w=800, h=height, pad={l:36,r:12,t:10,b:22};
    const bench = benchSeries?.length ? benchSeries : [];
    const allPts = [...series, ...bench];
    const minV=Math.min(...allPts)*0.996, maxV=Math.max(...allPts)*1.004;
    const range=maxV-minV||1;
    const xi=i=>pad.l+(i/(series.length-1))*(w-pad.l-pad.r);
    const yi=v=>pad.t+(1-(v-minV)/range)*(h-pad.t-pad.b);
    const p1=series.map((v,i)=>(i?'L':'M')+xi(i).toFixed(1)+' '+yi(v).toFixed(1)).join(' ');
    const p2=bench.map((v,i)=>(i?'L':'M')+xi(i).toFixed(1)+' '+yi(v).toFixed(1)).join(' ');
    const ticks=[minV+(maxV-minV)*0.1,minV+(maxV-minV)*0.5,minV+(maxV-minV)*0.9];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:'100%',height,display:'block'}}>
            <defs>
                <linearGradient id="themeAreaGradProd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#C9A86A" stopOpacity="0.16"/>
                    <stop offset="1" stopColor="#C9A86A" stopOpacity="0"/>
                </linearGradient>
            </defs>
            {ticks.map((t,i)=>(
                <g key={i}>
                    <line x1={pad.l} x2={w-pad.r} y1={yi(t)} y2={yi(t)} stroke="rgba(255,255,255,0.04)"/>
                    <text x={pad.l-5} y={yi(t)+4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{t.toFixed(1)}</text>
                </g>
            ))}
            <path d={p1+` L${xi(series.length-1)} ${h-pad.b} L${xi(0)} ${h-pad.b} Z`} fill="url(#themeAreaGradProd)"/>
            {p2 && <path d={p2} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" strokeDasharray="4 3"/>}
            <path d={p1} fill="none" stroke="var(--aurum-500)" strokeWidth="1.8"/>
            <text x={pad.l} y={h-5} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">90d ago</text>
            <text x={w-pad.r} y={h-5} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">today</text>
        </svg>
    );
};

/* ─── Collection scaffold (inline port) ─────────────────── */
const CollAction = ({label, busyLabel, onClick, kind='ghost', icon, busy, disabled}) => {
    const primary = kind==='primary';
    return (
        <button onClick={onClick} disabled={busy||disabled} style={{display:'flex',alignItems:'center',gap:7,height:34,padding:'0 14px',borderRadius:8,background:primary?'rgba(201,168,106,0.10)':'rgba(255,255,255,0.04)',border:'1px solid '+(primary?'rgba(201,168,106,0.28)':'rgba(255,255,255,0.08)'),color:primary?'var(--aurum-100)':'var(--ink-20)',fontSize:12.5,fontFamily:'var(--font-ui)',fontWeight:primary?500:400,cursor:(busy||disabled)?'not-allowed':'pointer',opacity:(busy||disabled)?0.7:1}}>
            {busy ? <CSpinner/> : icon}
            {busy ? (busyLabel||'Working…') : label}
        </button>
    );
};

const CollectionAIBanner = ({take, confidence, momentum, lastEval, rationale, risk}) => {
    const m = cMom(momentum);
    return (
        <div className="layer-1" style={{padding:'14px 18px',marginBottom:16,borderLeft:'3px solid var(--aurum-500)',borderRadius:'4px 10px 10px 4px'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:200}}>
                    <div style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--aurum-500)',fontWeight:600,marginBottom:6}}>AI Take</div>
                    <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:500,color:'var(--ink-00)',lineHeight:1.55}}>{take}</div>
                    <div style={{marginTop:8,display:'flex',gap:16,flexWrap:'wrap'}}>
                        {lastEval && <span style={{fontSize:11,color:'var(--ink-40)'}}>Last evaluated: {lastEval}</span>}
                        <span style={{fontSize:11,color:m.c}}>● {m.l} momentum</span>
                    </div>
                </div>
                {confidence != null && (
                    <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:32,fontWeight:500,color:cConfColor(confidence),lineHeight:1}}>{confidence}</div>
                        <div style={{fontSize:10,color:'var(--ink-40)',marginTop:2,letterSpacing:'0.06em',textTransform:'uppercase'}}>Confidence</div>
                    </div>
                )}
            </div>
            {(rationale||risk) && (
                <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.06)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {rationale && <div style={{fontSize:11.5,color:'var(--ink-30)'}}><span style={{color:'var(--sage-500)',fontWeight:600}}>Rationale: </span>{rationale}</div>}
                    {risk      && <div style={{fontSize:11.5,color:'var(--ink-30)'}}><span style={{color:'#D4A257',fontWeight:600}}>Risk: </span>{risk}</div>}
                </div>
            )}
        </div>
    );
};

const CollectionScaffold = ({back, eyebrow, title, sub, metric, confidence, actions, ai, tabs, tab, setTab, children}) => (
    <>
        <div style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:18,flexWrap:'wrap'}}>
            {back && (
                <button onClick={back.onClick} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',color:'var(--ink-30)',cursor:'pointer',fontSize:12,fontFamily:'var(--font-ui)',padding:'6px 0',marginTop:2,flexShrink:0}}
                    onMouseEnter={e=>e.currentTarget.style.color='var(--aurum-100)'} onMouseLeave={e=>e.currentTarget.style.color='var(--ink-30)'}>
                    {CIcon.back}{back.label}
                </button>
            )}
            <div style={{flex:1,minWidth:200}}>
                <Eyebrow>{eyebrow}</Eyebrow>
                <div style={{display:'flex',alignItems:'center',gap:12,marginTop:4,flexWrap:'wrap'}}>
                    <h2 style={{margin:0,fontFamily:'var(--font-heading)',fontSize:24,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.02em'}}>{title}</h2>
                    {metric && (
                        <span style={{fontFamily:'var(--font-mono)',fontSize:14,color:metric.color||'var(--ink-00)',fontWeight:500}}>
                            {metric.text}
                            {metric.label && <span style={{fontSize:11,color:'var(--ink-40)',fontFamily:'var(--font-ui)',fontWeight:400,marginLeft:4}}>{metric.label}</span>}
                        </span>
                    )}
                    {confidence != null && (
                        <span style={{fontSize:10.5,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,padding:'3px 9px',borderRadius:999,background:cConfBg(confidence),color:cConfColor(confidence)}}>AI {confidence}% confident</span>
                    )}
                </div>
                {sub && <div style={{fontSize:12.5,color:'var(--ink-30)',marginTop:4}}>{sub}</div>}
            </div>
            {actions?.length > 0 && (
                <div style={{display:'flex',gap:8,flexShrink:0,marginTop:2,flexWrap:'wrap'}}>
                    {actions.map((a,i) => <CollAction key={i} {...a}/>)}
                </div>
            )}
        </div>
        {ai?.take && <CollectionAIBanner {...ai}/>}
        <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:16,flexWrap:'wrap'}}>
            {tabs.map(([id,label]) => (
                <button key={id} onClick={()=>setTab(id)} style={{padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12.5,color:tab===id?'var(--ink-00)':'var(--ink-40)',borderBottom:'2px solid '+(tab===id?'var(--aurum-500)':'transparent'),fontWeight:tab===id?500:400}}>{label}</button>
            ))}
        </div>
        {children}
        <div style={{height:32}}/>
    </>
);

/* ─── CollectionConstituents (inline port) ───────────────── */
const CollectionConstituents = ({rows, show={}, onOpen, emptyText}) => {
    if (!rows?.length) return <Empty>{emptyText||'No constituents available.'}</Empty>;
    const cols = ['1.7fr', show.weight?'1.1fr':null, '0.8fr', show.signal?'0.7fr':null, '0.55fr'].filter(Boolean).join(' ');
    const maxWt = Math.max(0.0001, ...rows.map(r => r.weight||0));
    return (
        <div className="layer-1" style={{padding:0,overflow:'hidden',border:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{display:'grid',gridTemplateColumns:cols,gap:12,padding:'10px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                {['Instrument', show.weight?'Weight':null, '1M Return', show.signal?'Signal':null, ''].filter(v=>v!==null).map((h,i) => (
                    <div key={i} style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{h}</div>
                ))}
            </div>
            {rows.map((c,i) => (
                <div key={c.sym+i} style={{display:'grid',gridTemplateColumns:cols,gap:12,padding:'12px 18px',borderBottom:i<rows.length-1?'1px solid rgba(255,255,255,0.04)':'none',alignItems:'center'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.018)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <div style={{minWidth:0}}>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:12.5,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.03em'}}>{c.sym}</div>
                        {c.name && <div style={{fontSize:11,color:'var(--ink-30)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>}
                    </div>
                    {show.weight && (
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{flex:1,height:6,borderRadius:999,background:'rgba(255,255,255,0.05)',overflow:'hidden'}}>
                                <span style={{display:'block',height:'100%',width:`${(c.weight/maxWt)*100}%`,background:'var(--aurum-500)',opacity:0.7}}/>
                            </span>
                            <span style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:'var(--ink-20)',width:42,textAlign:'right'}}>{(c.weight*100).toFixed(1)}%</span>
                        </div>
                    )}
                    <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:c.ret1m!=null?(c.ret1m>=0?'var(--sage-500)':'var(--crimson-500)'):'var(--ink-40)'}}>
                        {fmtRet(c.ret1m)}
                    </span>
                    {show.signal && <span style={{fontSize:9.5,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,color:c.signal?sigColor(c.signal):'var(--ink-40)'}}>{c.signal||'—'}</span>}
                    <button onClick={()=>onOpen&&onOpen(c)} title="Open in terminal"
                        style={{justifySelf:'end',fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',color:'var(--ink-30)',cursor:'pointer',fontFamily:'var(--font-ui)'}}
                        onMouseEnter={e=>{e.currentTarget.style.background='rgba(201,168,106,0.12)';e.currentTarget.style.borderColor='rgba(201,168,106,0.30)';e.currentTarget.style.color='var(--aurum-100)';}}
                        onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';e.currentTarget.style.color='var(--ink-30)';}}>
                        Open →
                    </button>
                </div>
            ))}
        </div>
    );
};

/* ─── CollectionTechnical (inline port) ─────────────────── */
const CollectionTechnical = ({intro, ctaLabel='Generate Signal', run}) => {
    const [phase, setPhase] = useState('idle');
    const [signals, setSignals] = useState(null);

    const start = () => {
        setPhase('fetching');
        Promise.resolve(run()).then(s=>{setSignals(s);setPhase('done');});
    };

    if (phase==='idle'||(phase==='fetching'&&!signals)) {
        const busy = phase==='fetching';
        return (
            <div style={{padding:'44px 24px',textAlign:'center',background:'rgba(255,255,255,0.015)',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12}}>
                <div style={{width:48,height:48,borderRadius:999,background:'rgba(201,168,106,0.08)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',marginBottom:6}}>No signal generated yet</div>
                <div style={{fontSize:13,color:'var(--ink-30)',maxWidth:320,margin:'0 auto 20px',lineHeight:1.5}}>{intro}</div>
                <button disabled={busy} onClick={start} style={{display:'inline-flex',alignItems:'center',gap:8,height:36,padding:'0 20px',borderRadius:8,background:'rgba(201,168,106,0.12)',border:'1px solid rgba(201,168,106,0.28)',color:'var(--aurum-100)',fontSize:13,fontFamily:'var(--font-ui)',fontWeight:500,cursor:busy?'not-allowed':'pointer',opacity:busy?0.7:1}}>
                    {busy ? <><CSpinner s={14}/>Generating…</> : ctaLabel}
                </button>
            </div>
        );
    }

    const {cards=[]} = signals||{};
    return (
        <div>
            <div style={{display:'grid',gridTemplateColumns:`repeat(${cards.length||4},1fr)`,gap:12,marginBottom:14}}>
                {cards.map(([k,v,sub,color]) => (
                    <div key={k} className="layer-1" style={{padding:'14px 16px'}}>
                        <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{k}</div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color,marginTop:8}}>{v}</div>
                        <div style={{fontSize:11,color:'var(--ink-40)',marginTop:4}}>{sub}</div>
                    </div>
                ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button onClick={()=>{setSignals(null);setPhase('idle');}} style={{fontSize:12,padding:'6px 14px',borderRadius:6,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',color:'var(--ink-30)',cursor:'pointer',fontFamily:'var(--font-ui)'}}>↺ Re-generate</button>
            </div>
        </div>
    );
};

/* ─── CollectionAIChat (inline, no window.claude) ───────── */
const CollectionAIChat = ({titleLabel, placeholder, suggestions, aiConf, lastEval}) => {
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const scrollRef = useRef(null);
    useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[chatHistory]);

    const send = () => {
        const msg = chatInput.trim();
        if (!msg) return;
        setChatInput('');
        setChatHistory(h=>[...h,{role:'user',text:msg},{role:'ai',text:'AI chat for themes is not yet connected to a backend endpoint. Re-evaluate using the header button to refresh the AI take.'}]);
    };

    return (
        <div style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:14,alignItems:'start'}}>
            <div className="layer-1" style={{padding:'16px 18px'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,paddingBottom:12,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{width:30,height:30,borderRadius:999,background:'rgba(201,168,106,0.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--aurum-500)'}}>{CIcon.chat}</div>
                    <div>
                        <div style={{fontSize:13,fontWeight:500,color:'var(--ink-00)'}}>{titleLabel}</div>
                        <div style={{fontSize:11,color:'var(--ink-40)'}}>Context-aware · AI-powered</div>
                    </div>
                </div>
                <div ref={scrollRef} style={{minHeight:220,maxHeight:340,overflowY:'auto',marginBottom:12,display:'flex',flexDirection:'column',gap:10}}>
                    {chatHistory.length===0 && (
                        <div style={{padding:'8px 0',display:'flex',flexDirection:'column',gap:6}}>
                            <div style={{fontSize:12,color:'var(--ink-40)',marginBottom:8}}>Suggested questions</div>
                            {suggestions.map(s=>(
                                <button key={s} onClick={()=>setChatInput(s)} style={{padding:'9px 12px',background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,color:'var(--ink-20)',fontSize:12.5,cursor:'pointer',textAlign:'left',fontFamily:'var(--font-ui)',lineHeight:1.4}}
                                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                                    onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.025)'}>{s}</button>
                            ))}
                        </div>
                    )}
                    {chatHistory.map((m,i)=>(
                        <div key={i} style={{padding:'10px 14px',borderRadius:10,fontSize:13,lineHeight:1.55,background:m.role==='user'?'rgba(201,168,106,0.08)':'rgba(255,255,255,0.03)',border:'1px solid '+(m.role==='user'?'rgba(201,168,106,0.15)':'rgba(255,255,255,0.06)'),color:m.role==='user'?'var(--aurum-100)':'var(--ink-10)',marginLeft:m.role==='user'?32:0,marginRight:m.role==='ai'?32:0}}>
                            {m.role==='ai'&&<div style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,marginBottom:4}}>Aureon</div>}
                            {m.text}
                        </div>
                    ))}
                </div>
                <div style={{display:'flex',gap:8}}>
                    <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={placeholder}
                        style={{flex:1,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'9px 14px',color:'var(--ink-00)',fontSize:13,fontFamily:'var(--font-ui)',outline:'none'}}/>
                    <button onClick={send} disabled={!chatInput.trim()} style={{height:38,padding:'0 16px',borderRadius:8,background:'rgba(201,168,106,0.12)',border:'1px solid rgba(201,168,106,0.28)',color:'var(--aurum-100)',fontSize:13,cursor:'pointer',fontFamily:'var(--font-ui)',opacity:!chatInput.trim()?0.5:1}}>Send</button>
                </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div className="layer-1" style={{padding:'14px 16px'}}>
                    <Eyebrow>Evaluation</Eyebrow>
                    <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:8}}>
                        {aiConf != null ? (
                            <>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                    <span style={{fontSize:11.5,color:'var(--ink-40)'}}>Confidence</span>
                                    <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-00)',fontWeight:500}}>{aiConf}%</span>
                                </div>
                                <div style={{height:3,borderRadius:99,background:'rgba(255,255,255,0.06)'}}>
                                    <div style={{width:`${aiConf}%`,height:'100%',borderRadius:99,background:aiConf>=80?'var(--sage-500)':'var(--aurum-500)'}}/>
                                </div>
                            </>
                        ) : (
                            <div style={{fontSize:12,color:'var(--ink-40)'}}>No evaluation yet</div>
                        )}
                        {lastEval && (
                            <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
                                <span style={{fontSize:11,color:'var(--ink-40)'}}>Last eval</span>
                                <span style={{fontSize:11,color:'var(--ink-30)'}}>{lastEval}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Signal summary bar ─────────────────────────────────── */
const ThemeSignalSummaryBar = ({summary}) => {
    const pm = PULSE_META[summary.pulse] || PULSE_META.neutral;
    return (
        <div className="layer-1" style={{padding:'16px 20px',marginBottom:12,borderLeft:'3px solid '+pm.c,borderRadius:'4px 10px 10px 4px'}}>
            <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:180}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                        <span style={{fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',fontWeight:600,color:'var(--ink-40)'}}>Signal Pulse</span>
                        <span style={{fontSize:10,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',padding:'2px 8px',borderRadius:999,background:pm.bg,color:pm.c}}>{pm.label}</span>
                    </div>
                    <div style={{fontFamily:'var(--font-heading)',fontSize:14,fontWeight:500,color:'var(--ink-10)',lineHeight:1.45}}>{summary.top}</div>
                </div>
                <div style={{display:'flex',gap:10,flexShrink:0}}>
                    {[{n:summary.bull,label:'Bullish',c:'var(--sage-500)',bg:'rgba(111,174,136,0.08)'},{n:summary.neu,label:'Neutral',c:'var(--ink-30)',bg:'rgba(255,255,255,0.04)'},{n:summary.bear,label:'Bearish',c:'var(--crimson-500)',bg:'rgba(209,107,107,0.07)'}].map(({n,label,c,bg})=>(
                        <div key={label} style={{textAlign:'center',padding:'8px 14px',borderRadius:8,background:bg,minWidth:56}}>
                            <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color:c,lineHeight:1}}>{n??0}</div>
                            <div style={{fontSize:10,color:'var(--ink-40)',marginTop:3,letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

/* ─── Signals tab ────────────────────────────────────────── */
const ThemeSignalsTab = ({signals, summary, loading, error, onRetry}) => {
    if (loading) return <TabSkeleton rows={5}/>;
    if (error)   return <TabError msg={error} onRetry={onRetry}/>;
    if (!signals?.length) return (
        <TabEmpty
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
            title="No signals yet"
            body="Signal feed for this theme hasn't been populated yet. Signals are generated as market data is processed."
        />
    );
    const ordered = [...signals].sort((a,b)=>{const m={high:0,med:1,low:2};return (m[a.sev]??2)-(m[b.sev]??2);});
    return (
        <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:14,alignItems:'start'}}>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {summary && <ThemeSignalSummaryBar summary={summary}/>}
                {ordered.map((sig,i)=>{
                    const km = SKIND[sig.kind]||SKIND.news;
                    return (
                        <div key={i} className="layer-1" style={{padding:'12px 16px',display:'flex',gap:14,alignItems:'flex-start',borderLeft:'2px solid '+(sig.sev==='high'?km.c:'transparent')}}>
                            <div style={{flexShrink:0,marginTop:2}}>
                                <span style={{display:'inline-block',width:8,height:8,borderRadius:999,background:km.c,boxShadow:`0 0 0 3px ${km.bg}`}}/>
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                                    <span style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600,color:km.c}}>{km.label}</span>
                                    <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--aurum-100)',background:'rgba(201,168,106,0.08)',border:'1px solid rgba(201,168,106,0.18)',borderRadius:4,padding:'1px 6px',letterSpacing:'0.04em'}}>{sig.sym}</span>
                                    <span style={{marginLeft:'auto',fontSize:9,letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600,color:sevC(sig.sev)}}>{sevLabel(sig.sev)}</span>
                                </div>
                                <div style={{fontSize:13,color:'var(--ink-10)',lineHeight:1.5}}>{sig.text}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {summary?.exp && (
                    <div className="layer-1" style={{padding:'14px 16px'}}>
                        <Eyebrow style={{marginBottom:10}}>AI Explanation</Eyebrow>
                        <div style={{fontSize:12.5,color:'var(--ink-10)',lineHeight:1.65,marginTop:8}}>{summary.exp}</div>
                    </div>
                )}
                <div className="layer-1" style={{padding:'14px 16px'}}>
                    <Eyebrow>Signal breakdown</Eyebrow>
                    <div style={{display:'flex',flexDirection:'column',gap:7,marginTop:8}}>
                        {Object.entries(SKIND).map(([k,km])=>{
                            const count = signals.filter(s=>s.kind===k).length;
                            if (!count) return null;
                            return (
                                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                    <div style={{display:'flex',alignItems:'center',gap:7}}>
                                        <span style={{width:6,height:6,borderRadius:999,background:km.c,display:'inline-block',flexShrink:0}}/>
                                        <span style={{fontSize:11.5,color:'var(--ink-40)'}}>{km.label}</span>
                                    </div>
                                    <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-10)',fontWeight:500}}>{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Fundamentals tab ───────────────────────────────────── */
const ThemeFundTab = ({fundamentals}) => {
    const f = fundamentals || {};
    const rows = [
        {k:'P/E Ratio',       v:f.pe      ?? f.price_earnings ?? null, note:'Price-to-earnings vs market avg'},
        {k:'P/B Ratio',       v:f.pb      ?? f.price_book     ?? null, note:'Price-to-book; quality premium indicator'},
        {k:'Return on Equity',v:f.roe                         ?? null, note:'Basket weighted-avg ROE'},
        {k:'Dividend Yield',  v:f.div_yield ?? f.divYield     ?? null, note:'Trailing 12M yield'},
        {k:'Debt / Equity',   v:f.debt_equity ?? f.debtEq     ?? null, note:'Balance sheet leverage proxy'},
        {k:'Beta',            v:f.beta                         ?? null, note:'Sensitivity to index movements'},
    ];
    const hasAny = rows.some(r => r.v != null);
    if (!hasAny) return (
        <TabEmpty
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>}
            title="No fundamentals data"
            body="Fundamental metrics for this theme's basket are not yet available from the backend."
        />
    );
    return (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {rows.map(({k,v,note})=>(
                <div key={k} className="layer-1" style={{padding:'14px 18px'}}>
                    <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,marginBottom:6}}>{k}</div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:26,fontWeight:500,color:'var(--ink-00)',lineHeight:1,marginBottom:6}}>{v??'—'}</div>
                    <div style={{fontSize:11.5,color:'var(--ink-40)',lineHeight:1.45}}>{note}</div>
                </div>
            ))}
        </div>
    );
};

/* ─── Overview tab ───────────────────────────────────────── */
const ThemeOverviewTab = ({theme, navSeries, constituents, fundamentals}) => {
    const f = fundamentals || {};
    return (
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14,alignItems:'start'}}>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div className="layer-1" style={{padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                        <Eyebrow>Performance vs Benchmark</Eyebrow>
                        <div style={{display:'flex',gap:14,fontSize:11}}>
                            <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-30)'}}>
                                <span style={{width:14,height:2,background:'var(--aurum-500)',display:'inline-block',borderRadius:1,flexShrink:0}}/>Theme basket
                            </span>
                            <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-40)'}}>
                                <span style={{width:14,height:2,background:'rgba(255,255,255,0.22)',display:'inline-block',borderRadius:1,flexShrink:0}}/>Benchmark
                            </span>
                        </div>
                    </div>
                    <ThemeDualChart series={navSeries} benchSeries={null} height={160}/>
                </div>

                {constituents.length > 0 && (
                    <div className="layer-1" style={{padding:'14px 16px'}}>
                        <Eyebrow style={{marginBottom:10}}>Top Holdings</Eyebrow>
                        <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr 0.6fr 0.6fr',gap:10,padding:'6px 0 8px',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                            {['Instrument','Weight','1M','Signal'].map((h,i)=>(
                                <div key={h} style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,textAlign:i>1?'right':'left'}}>{h}</div>
                            ))}
                        </div>
                        {constituents.slice(0,5).map((c,i)=>(
                            <div key={c.sym} style={{display:'grid',gridTemplateColumns:'1.6fr 1fr 0.6fr 0.6fr',gap:10,padding:'9px 0',borderBottom:i<Math.min(4,constituents.length-1)?'1px solid rgba(255,255,255,0.04)':'none',alignItems:'center'}}>
                                <div>
                                    <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600,color:'var(--ink-00)',letterSpacing:'0.04em'}}>{c.sym}</span>
                                    <span style={{fontSize:10.5,color:'var(--ink-40)',marginLeft:7}}>{c.name}</span>
                                </div>
                                <div style={{display:'flex',alignItems:'center',gap:6}}>
                                    <div style={{height:3,borderRadius:99,background:'rgba(255,255,255,0.06)',flex:1}}>
                                        <div style={{width:`${(c.weight||0)*100}%`,height:'100%',borderRadius:99,background:'var(--aurum-500)',opacity:0.65}}/>
                                    </div>
                                    <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)',minWidth:26,textAlign:'right'}}>{((c.weight||0)*100).toFixed(0)}%</span>
                                </div>
                                <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:c.ret1m!=null?(c.ret1m>=0?'var(--sage-500)':'var(--crimson-500)'):'var(--ink-40)',textAlign:'right'}}>{fmtRet(c.ret1m)}</span>
                                <span style={{fontSize:9.5,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,color:sigColor(c.signal),textAlign:'right'}}>{c.signal||'—'}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div className="layer-1" style={{padding:'14px 16px'}}>
                    <Eyebrow>Returns</Eyebrow>
                    <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:9}}>
                        {[
                            ['1M return',    fmtRet(theme.ret1m),     theme.ret1m!=null?(theme.ret1m>=0?'var(--sage-500)':'var(--crimson-500)'):'var(--ink-40)'],
                            ['vs Benchmark', theme.vsBench    ?? '—', theme.vsBench!=null?(parseFloat(theme.vsBench)>=0?'var(--sage-500)':'var(--crimson-500)'):'var(--ink-40)'],
                            ['Max drawdown', theme.maxDrawdown ?? '—', 'var(--crimson-500)'],
                            ['Annualised',   theme.annReturn   ?? '—', 'var(--ink-40)'],
                        ].map(([k,v,c])=>(
                            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span style={{fontSize:11.5,color:'var(--ink-40)'}}>{k}</span>
                                <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:c,fontWeight:500}}>{v}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {Object.keys(f).length > 0 && (
                    <div className="layer-1" style={{padding:'14px 16px'}}>
                        <Eyebrow>Fundamentals</Eyebrow>
                        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:9}}>
                            {[['P/E',f.pe??f.price_earnings],['ROE',f.roe],['Div yield',f.div_yield??f.divYield],['Beta',f.beta]].filter(([,v])=>v!=null).map(([k,v])=>(
                                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                    <span style={{fontSize:11.5,color:'var(--ink-40)'}}>{k}</span>
                                    <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-00)',fontWeight:500}}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="layer-1" style={{padding:'14px 16px'}}>
                    <Eyebrow>Basket</Eyebrow>
                    <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:9}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span style={{fontSize:11.5,color:'var(--ink-40)'}}>Instruments</span>
                            <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-10)',fontWeight:500}}>{theme.count}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Performance tab ────────────────────────────────────── */
const ThemePerfTab = ({theme, navSeries}) => {
    const [tf, setTf] = useState('3M');
    const retColor = theme.ret1m!=null?(theme.ret1m>=0?'var(--sage-500)':'var(--crimson-500)'):'var(--ink-40)';
    return (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div className="layer-1" style={{padding:'16px 18px'}}>
                <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14,flexWrap:'wrap'}}>
                    <div style={{display:'flex',gap:0}}>
                        {['1M','3M','6M','YTD','1Y'].map(p=>(
                            <button key={p} onClick={()=>setTf(p)} style={{padding:'5px 12px',fontSize:11,fontFamily:'var(--font-mono)',background:tf===p?'rgba(201,168,106,0.12)':'transparent',color:tf===p?'var(--aurum-100)':'var(--ink-30)',border:'none',cursor:'pointer',borderRadius:4}}>{p}</button>
                        ))}
                    </div>
                    <div style={{flex:1}}/>
                    <div style={{display:'flex',gap:16,fontSize:11}}>
                        <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-30)'}}>
                            <span style={{width:14,height:2,background:'var(--aurum-500)',display:'inline-block',borderRadius:1}}/>Theme basket
                        </span>
                        <span style={{display:'flex',alignItems:'center',gap:5,color:'var(--ink-40)'}}>
                            <span style={{width:14,height:2,background:'rgba(255,255,255,0.22)',display:'inline-block',borderRadius:1}}/>Benchmark
                        </span>
                    </div>
                </div>
                <ThemeDualChart series={navSeries} benchSeries={null} height={280}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                {[
                    ['1M return',    fmtRet(theme.ret1m),     retColor],
                    ['vs Benchmark', theme.vsBench    ?? '—', theme.vsBench!=null?(parseFloat(theme.vsBench)>=0?'var(--sage-500)':'var(--crimson-500)'):'var(--ink-40)'],
                    ['Annualised',   theme.annReturn   ?? '—', 'var(--ink-40)'],
                    ['Max drawdown', theme.maxDrawdown ?? '—', 'var(--crimson-500)'],
                ].map(([k,v,c])=>(
                    <div key={k} className="layer-1" style={{padding:'14px 16px'}}>
                        <div style={{fontSize:10,color:'var(--ink-40)',letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600}}>{k}</div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:500,color:c,marginTop:8}}>{v}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ─── Edit theme drawer ──────────────────────────────────── */
const ThemeEditDrawer = ({theme, onClose, onSaved}) => {
    const [name, setName] = useState(theme.name);
    const [desc, setDesc] = useState(theme.desc||'');
    const [saving, setSaving] = useState(false);

    useEffect(()=>{
        const fn = e=>{if(e.key==='Escape')onClose();};
        window.addEventListener('keydown',fn);
        return ()=>window.removeEventListener('keydown',fn);
    },[onClose]);

    const save = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await apiService.updateTheme(theme.id, {name:name.trim(), description:desc.trim()});
            onSaved(name.trim());
        } catch (err) {
            toast.error(err.message||'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1100,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(6px)',display:'flex',justifyContent:'flex-end'}}>
            <div onClick={e=>e.stopPropagation()} style={{width:'min(480px,96vw)',height:'100%',display:'flex',flexDirection:'column',background:'rgba(18,20,24,0.98)',borderLeft:'1px solid rgba(255,255,255,0.10)',boxShadow:'-30px 0 80px rgba(0,0,0,0.55)',backdropFilter:'blur(40px)',animation:'drawerIn 240ms var(--ease-decel)'}}>
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'18px 22px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0}}>
                    <div style={{flex:1}}>
                        <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--aurum-500)',fontWeight:600}}>Edit theme</div>
                        <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',marginTop:2}}>{theme.name}</div>
                    </div>
                    <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--ink-40)',padding:4,display:'inline-flex'}}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <div style={{flex:1,overflowY:'auto',padding:'20px 22px',display:'flex',flexDirection:'column',gap:20}}>
                    <div>
                        <label style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,display:'block',marginBottom:8}}>Theme name</label>
                        <input value={name} onChange={e=>setName(e.target.value)} style={{width:'100%',height:40,padding:'0 14px',borderRadius:8,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.10)',color:'var(--ink-00)',fontSize:14,fontFamily:'var(--font-ui)',outline:'none',boxSizing:'border-box'}}/>
                    </div>
                    <div>
                        <label style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,display:'block',marginBottom:8}}>Description</label>
                        <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} style={{width:'100%',padding:'10px 14px',borderRadius:8,resize:'vertical',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.10)',color:'var(--ink-00)',fontSize:13,fontFamily:'var(--font-ui)',outline:'none',lineHeight:1.55,boxSizing:'border-box'}}/>
                    </div>
                    {theme.tags?.length > 0 && (
                        <div>
                            <label style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,display:'block',marginBottom:8}}>Tags</label>
                            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                                {theme.tags.map(tag=>(
                                    <span key={tag} style={{display:'inline-flex',alignItems:'center',height:26,padding:'0 10px',borderRadius:999,background:'rgba(201,168,106,0.10)',border:'1px solid rgba(201,168,106,0.22)',color:'var(--aurum-100)',fontSize:11.5,fontWeight:500}}>{tag}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div style={{flexShrink:0,borderTop:'1px solid rgba(255,255,255,0.06)',padding:'14px 22px',display:'flex',gap:8}}>
                    <button onClick={onClose} className="du3-cta ghost" style={{flex:1,height:40}}>Cancel</button>
                    <button onClick={save} disabled={!name.trim()||saving} className="du3-cta primary" style={{flex:2,height:40,opacity:(!name.trim()||saving)?0.5:1,display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
                        {saving ? <><CSpinner s={14}/>Saving…</> : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ─── Recommendations tab ────────────────────────────────── */
const ThemeRecsTab = ({theme, allRecs, loading, error, onRetry}) => {
    if (loading) return <TabSkeleton rows={3}/>;
    if (error)   return <TabError msg={error} onRetry={onRetry}/>;
    const themeRecs = (allRecs||[]).filter(r =>
        r.scope?.ref === theme.id ||
        (theme.constituents||[]).some(c => r.scope?.ref === c.sym)
    );
    if (!themeRecs.length) return (
        <TabEmpty
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>}
            title="No recommendations"
            body="No active recommendations linked to this theme or its holdings. Re-run the AI evaluation to generate fresh recommendations."
        />
    );
    return (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontSize:12.5,color:'var(--ink-40)',marginBottom:6}}>Recommendations linked to <strong style={{color:'var(--ink-10)'}}>{theme.name}</strong>.</div>
            {themeRecs.map(rec=>{
                const rc = rec.action==='Add'||rec.action==='Buy' ? {c:'var(--sage-500)',bg:'rgba(111,174,136,0.08)',b:'rgba(111,174,136,0.20)'}
                         : rec.action==='Reduce'||rec.action==='Sell' ? {c:'var(--crimson-500)',bg:'rgba(209,107,107,0.08)',b:'rgba(209,107,107,0.20)'}
                         : {c:'var(--ink-30)',bg:'rgba(255,255,255,0.04)',b:'rgba(255,255,255,0.09)'};
                return (
                    <div key={rec.id} className="layer-1" style={{padding:'14px 18px',borderLeft:`3px solid ${rc.c}`,borderRadius:'4px 10px 10px 4px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap'}}>
                            <span style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700,color:rc.c,letterSpacing:'0.08em',padding:'2px 8px',borderRadius:4,background:rc.bg,border:`1px solid ${rc.b}`}}>{rec.action}</span>
                            <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--aurum-100)',background:'rgba(201,168,106,0.08)',border:'1px solid rgba(201,168,106,0.18)',borderRadius:4,padding:'1px 6px'}}>{rec.scope?.ref}</span>
                            <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)'}}>conf {rec.confidence}%</span>
                            <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-50)',marginLeft:'auto'}}>{rec.createdAt}</span>
                        </div>
                        <div style={{fontSize:13,color:'var(--ink-10)',lineHeight:1.5}}>{rec.title}</div>
                        {rec.impactOneLine && <div style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:rc.c,marginTop:5}}>{rec.impactOneLine}</div>}
                    </div>
                );
            })}
        </div>
    );
};

/* ─── Related tab ────────────────────────────────────────── */
const ThemeRelatedTab = () => (
    <TabEmpty
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>}
        title="No related themes"
        body="Related theme linking is not yet available. This feature will show themes sharing macro drivers, sector overlap, or signal correlation."
    />
);

/* ════════════════════════════════════════════════════════════
   ThemeDetail — main page component
   ════════════════════════════════════════════════════════════ */
const TABS = [
    ['overview',        'Overview'],
    ['holdings',        'Holdings'],
    ['signals',         'Signals'],
    ['performance',     'Performance'],
    ['recommendations', 'Recommendations'],
    ['related',         'Related'],
    ['fundamentals',    'Fundamentals'],
    ['technical',       'Technical'],
    ['ai',              'Ask Aureon'],
];

/* ─── State helpers (Markets.jsx pattern) ──────────────── */
const mkLoading = () => ({loading:true, data:null, error:null});
const mkDone    = (data) => ({loading:false, data, error:null});
const mkErr     = (err) => ({loading:false, data:null, error:err?.message||'Failed to load'});

export default function ThemeDetail() {
    const navigate = useNavigate();
    const {themeId, sectorName} = useParams();
    const isSector = !!sectorName;

    /* main data — starts loading per Markets.jsx pattern */
    const [themeState, setThemeState] = useState(mkLoading());
    const [navSeries,  setNavSeries]  = useState(null);

    /* signals */
    const [sigsState, setSigsState] = useState({loading:false, signals:null, summary:null, error:null});

    /* ui */
    const [tab,      setTab]      = useState('overview');
    const [forkOpen, setForkOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);

    const {allRecs} = useApp();

    /* ── Load main theme — only setState in callbacks ── */
    useEffect(() => {
        const fn = isSector
            ? () => apiService.getMarketSectorDetail(sectorName)
            : () => apiService.getMarketTheme(themeId);
        fn()
            .then(raw => setThemeState(mkDone(normalizeTheme(raw, isSector))))
            .catch(err => setThemeState(mkErr(err)));
    }, [themeId, sectorName, isSector]);

    /* ── Load NAV chart (themes only) ── */
    useEffect(() => {
        if (!themeId) return;
        apiService.getThemeNav(themeId, 90)
            .then(raw => setNavSeries(normalizeNav(raw)))
            .catch(() => {});
    }, [themeId]);

    /* ── Load signals on demand ── */
    const loadSignals = useCallback(() => {
        if (!themeId) return;
        setSigsState({loading:true, signals:null, summary:null, error:null});
        apiService.getThemeSignals(themeId)
            .then(raw => {
                const {signals: sigs, summary} = normalizeSignals(raw);
                setSigsState({loading:false, signals:sigs, summary, error:null});
            })
            .catch(err => setSigsState({loading:false, signals:null, summary:null, error:err.message||'Failed to load signals'}));
    }, [themeId]);

    const switchTab = useCallback((t) => {
        setTab(t);
        if (t === 'signals' && sigsState.signals === null && !sigsState.loading) loadSignals();
    }, [sigsState, loadSignals]);

    if (themeState.loading) return (
        <div style={{display:'flex',flexDirection:'column',gap:10,paddingTop:8}}>
            <TabSkeleton rows={5}/>
        </div>
    );

    if (themeState.error || !themeState.data) return (
        <TabError
            msg={themeState.error||'Theme not found.'}
            onRetry={() => {
                const fn = isSector
                    ? () => apiService.getMarketSectorDetail(sectorName)
                    : () => apiService.getMarketTheme(themeId);
                fn().then(raw=>setThemeState(mkDone(normalizeTheme(raw,isSector)))).catch(err=>setThemeState(mkErr(err)));
            }}
        />
    );

    const theme = themeState.data;

    const retColor = theme.ret1m!=null ? (theme.ret1m>=0 ? 'var(--sage-500)' : 'var(--crimson-500)') : 'var(--ink-40)';

    const renderTab = () => {
        switch (tab) {
            case 'overview':
                return <ThemeOverviewTab theme={theme} navSeries={navSeries} constituents={theme.constituents} fundamentals={theme.fundamentals}/>;

            case 'holdings':
                return theme.constituents.length === 0
                    ? <TabEmpty
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
                        title="No holdings"
                        body="This theme has no constituent instruments configured yet."/>
                    : <CollectionConstituents
                        rows={theme.constituents}
                        show={{weight:true, signal:true}}
                        onOpen={c => navigate(`/markets/terminal/${c.sym}`)}
                        emptyText="No holdings resolved for this theme yet."/>;

            case 'signals':
                return <ThemeSignalsTab
                    signals={sigsState.signals}
                    summary={sigsState.summary}
                    loading={sigsState.loading}
                    error={sigsState.error}
                    onRetry={loadSignals}/>;

            case 'performance':
                return <ThemePerfTab theme={theme} navSeries={navSeries}/>;

            case 'recommendations':
                return <ThemeRecsTab
                    theme={theme}
                    allRecs={allRecs}
                    loading={false}
                    error={null}
                    onRetry={()=>{}}/>;

            case 'related':
                return <ThemeRelatedTab/>;

            case 'fundamentals':
                return <ThemeFundTab fundamentals={theme.fundamentals}/>;

            case 'technical':
                return <CollectionTechnical
                    key={theme.id}
                    intro={`Load signal data for the ${theme.count} instruments in this basket from the backend.`}
                    ctaLabel="Load Theme Signals"
                    run={() => apiService.getThemeSignals(theme.id)
                        .then(raw => {
                            const {signals: sigs} = normalizeSignals(raw);
                            const count = sigs?.length ?? 0;
                            const highSev = sigs?.filter(s => s.sev === 'high').length ?? 0;
                            const pulse = count === 0 ? '—'
                                : highSev > count / 2 ? 'Bullish'
                                : highSev > 0 ? 'Mixed' : 'Neutral';
                            const pc = pulse === 'Bullish' ? 'var(--sage-500)'
                                : pulse === 'Mixed' ? 'var(--aurum-100)'
                                : pulse === 'Neutral' ? 'var(--ink-30)'
                                : 'var(--ink-40)';
                            return {cards: [
                                ['RSI · 14',    '—', 'Not exposed by signals endpoint', 'var(--ink-40)'],
                                ['MACD',        '—', 'Not exposed by signals endpoint', 'var(--ink-40)'],
                                ['ADX · Trend', '—', 'Not exposed by signals endpoint', 'var(--ink-40)'],
                                ['Signal pulse', pulse, count > 0 ? `${count} signals · ${highSev} high severity` : 'No signals available', pc],
                            ]};
                        })
                        .catch(() => ({cards: [
                            ['RSI · 14',    '—', 'Not exposed by signals endpoint', 'var(--ink-40)'],
                            ['MACD',        '—', 'Not exposed by signals endpoint', 'var(--ink-40)'],
                            ['ADX · Trend', '—', 'Not exposed by signals endpoint', 'var(--ink-40)'],
                            ['Signal pulse', '—', 'Failed to load signals',          'var(--ink-40)'],
                        ]}))}/>;

            case 'ai':
                return <CollectionAIChat
                    titleLabel={`Ask Aureon about ${theme.name}`}
                    placeholder="Ask about constituents, risks, outlook, macro drivers…"
                    suggestions={[
                        `What's driving the ${theme.name} theme right now?`,
                        'Which holding has the best risk/reward ratio?',
                        'What macro events could break this theme thesis?',
                        'How does this theme correlate with rate movements?',
                        'Should I increase or reduce my position in this theme?',
                    ]}
                    aiConf={null}
                    lastEval={null}/>;

            default: return null;
        }
    };

    return (
        <>
            <CollectionScaffold
                back={{label:'Markets', onClick:()=>navigate('/markets')}}
                eyebrow={theme.type}
                title={theme.name}
                sub={`${theme.desc}${theme.count ? ` · ${theme.count} instruments` : ''}`}
                metric={theme.ret1m != null ? {text:fmtRet(theme.ret1m), label:'1M', color:retColor} : null}
                confidence={null}
                actions={[
                    {label:'Fork basket', icon:CIcon.fork, onClick:()=>setForkOpen(true)},
                    {label:'Edit theme',  icon:CIcon.edit,  onClick:()=>setEditOpen(true)},
                    {label:'Ask Aureon →', icon:CIcon.chat, onClick:()=>switchTab('ai')},
                ]}
                ai={null}
                tabs={TABS}
                tab={tab}
                setTab={switchTab}>
                {renderTab()}
            </CollectionScaffold>

            {forkOpen && (
                <ThemeForkDrawer
                    theme={{id:theme.id, name:theme.name, constituents:theme.constituents}}
                    onClose={()=>setForkOpen(false)}
                    onSaved={n=>{setForkOpen(false);toast.success(`Forked basket "${n}" saved`);}}/>
            )}

            {editOpen && (
                <ThemeEditDrawer
                    theme={theme}
                    onClose={()=>setEditOpen(false)}
                    onSaved={n=>{setEditOpen(false);setThemeState(s=>({...s,data:{...s.data,name:n}}));toast.success(`Theme "${n}" updated`);}}/>
            )}
        </>
    );
}
