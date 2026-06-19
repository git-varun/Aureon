/* Aureon — Decisions hub (Recommendations + Signals + Activity + Briefings). */
import React, {useMemo, useState, useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'react-hot-toast';
import {useApp} from '@/components/aureon/store';
import {useAureonData, AUREON_STATE_KEY} from '@/hooks/useAureonData';
import {Eyebrow, SectionHead, Empty} from '@/components/aureon/ui';
import {DecisionUnit, ActionConfirmationModal} from '@/components/aureon/flow';
import {AIBriefingSection} from '@/components/aureon/dashboard';
import {LogTradeModal} from '@/components/aureon/portfolio/LogTradeModal';
import {apiService} from '@/api/apiService';
import {useFmtMoney} from '@/hooks/useFmtMoney';
import {DecisionBasket} from '@/components/aureon/DecisionBasket';
import {needsModal} from '@/components/aureon/utils';
import {Tabs, ErrorState, Drawer} from '@/components/aureon/ds';

const RecommendationSkeleton = () => (
    <div className="layer-1 skeleton-pulse" style={{
        display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden'
    }}>
        <style>{`
            @keyframes pulse-shimmer {
                0%, 100% { opacity: 0.15; }
                50% { opacity: 0.35; }
            }
            .skeleton-pulse {
                animation: pulse-shimmer 1.8s ease-in-out infinite;
            }
        `}</style>
        {/* Recommendation Header Skeleton */}
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 8, width: '60%'}}>
                <div style={{width: 8, height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.2)'}}/>
                <div style={{height: 18, width: '40%', background: 'rgba(255,255,255,0.08)', borderRadius: 4}}/>
                <div style={{height: 14, width: '20%', background: 'rgba(255,255,255,0.05)', borderRadius: 3}}/>
            </div>
            {/* Confidence indicator skeleton */}
            <div style={{height: 12, width: 60, background: 'rgba(255,255,255,0.06)', borderRadius: 2}}/>
        </div>

        {/* Rationale Skeleton */}
        <div style={{background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px'}}>
            <div style={{height: 10, width: '15%', background: 'rgba(255,255,255,0.04)', borderRadius: 2, marginBottom: 8}}/>
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                <div style={{height: 12, width: '85%', background: 'rgba(255,255,255,0.06)', borderRadius: 3}}/>
                <div style={{height: 12, width: '70%', background: 'rgba(255,255,255,0.06)', borderRadius: 3}}/>
            </div>
        </div>

        {/* Impact Skeleton */}
        <div>
            <div style={{height: 10, width: '10%', background: 'rgba(255,255,255,0.04)', borderRadius: 2, marginBottom: 8}}/>
            <div style={{height: 14, width: '30%', background: 'rgba(255,255,255,0.06)', borderRadius: 3}}/>
        </div>

        {/* Actions Skeleton */}
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12}}>
            <div style={{display: 'flex', gap: 8, width: '50%'}}>
                <div style={{height: 28, width: 65, background: 'rgba(255,255,255,0.04)', borderRadius: 6}}/>
                <div style={{height: 28, width: 65, background: 'rgba(255,255,255,0.04)', borderRadius: 6}}/>
                <div style={{height: 28, width: 65, background: 'rgba(255,255,255,0.04)', borderRadius: 6}}/>
            </div>
            <div style={{height: 30, width: 80, background: 'rgba(255,255,255,0.06)', borderRadius: 6}}/>
        </div>
    </div>
);

/* ─── Signals helpers (lifted from Signals.jsx) ─── */
const inferDirection = (s) => {
    const txt = (s.text || '').toLowerCase();
    if (s.kind === 'momentum') return txt.includes('negative') || txt.includes('reset') ? 'bear' : 'bull';
    if (s.kind === 'sentiment') return txt.includes('dropped') || txt.includes('negative') ? 'bear' : 'bull';
    if (s.kind === 'volatility') return 'neutral';
    if (s.kind === 'fundamentals') return txt.includes('beat') || txt.includes('reaffirmed') || txt.includes('reduced') || txt.includes('+') ? 'bull' : 'neutral';
    if (s.kind === 'macro') return txt.includes('+bp') ? 'bear' : 'neutral';
    return 'neutral';
};

const sigConfidence = (s) => {
    const c = (s.id || 'xxx').charCodeAt(3) || 42;
    return s.severity === 'high' ? 78 + (c % 10) : s.severity === 'med' ? 60 + (c % 12) : 42 + (c % 14);
};

const DirectionChip = ({d}) => {
    const m = {
        bull:    {col: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.10)',  border: 'rgba(111,174,136,0.30)',  label: 'Bullish', arrow: '↑'},
        bear:    {col: 'var(--crimson-500)', bg: 'rgba(209,107,107,0.10)',  border: 'rgba(209,107,107,0.30)',  label: 'Bearish', arrow: '↓'},
        neutral: {col: 'var(--ink-30)',      bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', label: 'Neutral', arrow: '·'},
    }[d];
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 999,
            background: m.bg, border: `1px solid ${m.border}`, color: m.col,
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 0.6}}>{m.arrow}</span>
            {m.label}
        </span>
    );
};

const ConfidenceBar = ({v}) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 8, minWidth: 120}}>
        <div style={{flex: 1, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden'}}>
            <div style={{
                width: `${v}%`, height: '100%',
                background: v >= 70 ? 'var(--aurum-500)' : v >= 50 ? 'var(--dusk-500)' : 'var(--ink-30)',
                borderRadius: 'inherit',
            }}/>
        </div>
        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-20)', width: 28, textAlign: 'right'}}>{v}</span>
    </div>
);

const SignalCard = ({s}) => {
    const [open, setOpen] = useState(false);
    const dir = inferDirection(s);
    const conf = sigConfidence(s);
    const sevColor = s.severity === 'high' ? 'var(--crimson-500)' : s.severity === 'med' ? 'var(--dusk-500)' : 'var(--ink-30)';
    return (
        <article style={{padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)'}}>
            <header style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap'}}>
                <div style={{width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>
                    {(s.asset || 'PORT').slice(0, 4)}
                </div>
                <div style={{minWidth: 0}}>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{s.asset ?? 'PORT'}</span>
                        <span style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>{s.kind}</span>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: 'var(--ink-40)'}}>
                        <span style={{display: 'inline-flex', alignItems: 'center', gap: 5}}>
                            <span style={{width: 5, height: 5, borderRadius: 999, background: sevColor}}/>{s.severity}
                        </span>
                        <span>·</span>
                        <span style={{fontFamily: 'var(--font-mono)'}}>{s.ts}</span>
                    </div>
                </div>
                <div style={{flex: 1}}/>
                <DirectionChip d={dir}/>
            </header>
            <div style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: 18, alignItems: 'center'}}>
                <p style={{margin: 0, fontSize: 13.5, color: 'var(--ink-10)', lineHeight: 1.55}}>{s.text}</p>
                <div>
                    <div style={{fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 4, textAlign: 'right'}}>Confidence</div>
                    <ConfidenceBar v={conf}/>
                </div>
            </div>
            <footer style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                <button onClick={() => setOpen(o => !o)} className="du3-cta ghost" style={{padding: '4px 10px', fontSize: 11.5}}>
                    {open ? '▴ Hide reasoning' : '▾ Show reasoning'}
                </button>
                <div style={{flex: 1}}/>
                {s.linkedRec
                    ? <button className="du3-cta" style={{padding: '4px 12px', fontSize: 11.5}}>View recommendation →</button>
                    : <span style={{fontSize: 11, color: 'var(--ink-40)'}}>No action · informational</span>
                }
            </footer>
            {open && (
                <div style={{marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.20)', border: '1px solid rgba(255,255,255,0.05)'}}>
                    <p style={{margin: 0, fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.6}}>
                        {({momentum: '60-day slope · 14-day RSI · 50/200d MA cross.', sentiment: 'Aggregated from news headlines, analyst notes, and social channels. 48h decay.', allocation: 'Compares current weight to target; flagged on |Δ| > 2pp.', volatility: 'Realized vol (14d) vs trailing 1y distribution.', fundamentals: 'Revisions, P/E drift, ROE/ROIC trend.', macro: 'Rates, FX, inflation prints. Filtered by exposure mapping.', news: 'Material event from filing or wire; sentiment-scored.'})[s.kind] || 'Detector output composited across multiple inputs.'}
                    </p>
                </div>
            )}
        </article>
    );
};

/* ─── AI Briefings helpers ─── */
const TONE_MAP = {
    Bullish:  {label: 'Constructive', color: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.10)', border: 'rgba(111,174,136,0.28)'},
    Neutral:  {label: 'Neutral',      color: 'var(--aurum-100)',   bg: 'rgba(201,168,106,0.10)', border: 'rgba(201,168,106,0.28)'},
    Bearish:  {label: 'Cautious',     color: 'var(--crimson-500)', bg: 'rgba(201,82,82,0.10)',   border: 'rgba(201,82,82,0.28)'},
    Sideways: {label: 'Sideways',     color: 'var(--ink-30)',      bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)'},
    Volatile: {label: 'Volatile',     color: 'var(--crimson-400)', bg: 'rgba(201,82,82,0.06)',   border: 'rgba(201,82,82,0.20)'},
};
const ACTION_COLOR = {BUY: 'var(--sage-500)', SELL: 'var(--crimson-500)', HOLD: 'var(--aurum-100)'};

function fmtDateTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-IN', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}) + ' IST';
}

const BasketConfirmModal = ({ recs, onCancel, onConfirm }) => {
    const fmtCash = useFmtMoney();
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);
    const cash = recs.reduce((s, r) => s + (r.impact?.cash || 0), 0);
    const modalCount = recs.filter(r => needsModal(r)).length;
    return (
        <div className="cm-scrim" onMouseDown={(e) => e.target===e.currentTarget && onCancel()}>
            <div className="cm-panel layer-3" style={{width:'min(560px,94vw)'}}>
                <div className="cm-head">
                    <div>
                        <div style={{fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Confirm basket</div>
                        <h2 style={{fontFamily:'var(--font-heading)',fontSize:22,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em',marginTop:6}}>
                            Commit {recs.length} {recs.length===1?'decision':'decisions'}
                        </h2>
                        <p style={{margin:'6px 0 0',fontSize:13,color:'var(--ink-30)',maxWidth:460}}>
                            {modalCount > 0
                                ? `${modalCount} of these ${modalCount===1?'is a portfolio- or class-level action that':'are portfolio- or class-level actions that'} normally need individual confirmation. Review the set before committing.`
                                : 'Review the set before committing.'}
                        </p>
                    </div>
                    <button className="du3-cta ghost" onClick={onCancel} style={{flexShrink:0}}>✕</button>
                </div>
                <div className="cm-body">
                    <div style={{display:'grid',gap:8}}>
                        {recs.map(r => (
                            <div key={r.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:12,alignItems:'center',padding:'11px 13px',borderRadius:9,background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)'}}>
                                <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600,color:'var(--ink-00)'}}>{r.action}</span>
                                <span style={{fontSize:12.5,color:'var(--ink-20)',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.title} · <span style={{color:'var(--ink-40)'}}>{r.impactOneLine}</span></span>
                                {needsModal(r) && <span style={{fontSize:9.5,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,color:'var(--dusk-500)',whiteSpace:'nowrap'}}>needs review</span>}
                            </div>
                        ))}
                    </div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:14,padding:'11px 14px',borderRadius:9,background:'rgba(201,168,106,0.06)',border:'1px solid rgba(201,168,106,0.16)'}}>
                        <span style={{fontSize:11.5,color:'var(--ink-30)',letterSpacing:'0.04em'}}>Combined cash freed</span>
                        <span style={{fontFamily:'var(--font-mono)',fontSize:15,fontWeight:500,color: cash>=0?'var(--sage-500)':'var(--ink-00)'}}>{cash ? fmtCash(cash, 'USD', {dp: 0}) : '—'}</span>
                    </div>
                </div>
                <div className="cm-foot" style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                    <button className="du3-cta ghost" onClick={onCancel}>Cancel</button>
                    <button className="du3-cta primary" onClick={onConfirm}>Commit {recs.length} {recs.length===1?'decision':'decisions'} →</button>
                </div>
            </div>
        </div>
    );
};

/* ─── Tab content components ─── */
function RecommendationsTab({ onViewLineage }) {
    const {allRecs, active, applied, dismissed, apply, applyBatch, dismiss, undo} = useApp();
    const [modal, setModal] = useState(null);
    const [filter, setFilter] = useState('all');
    const [strength, setStrength] = useState('all');

    // Staging and snoozing states
    const [staged, setStaged] = useState([]);
    const [snoozed, setSnoozed] = useState([]);
    const [basketModal, setBasketModal] = useState(null);

    const activeList = allRecs.filter(r => active.includes(r.id));
    const filteredActive = activeList.filter(r => {
        if (snoozed.includes(r.id)) return false;
        if (filter !== 'all' && r.action !== filter) return false;
        if (strength !== 'all' && r.strength !== strength) return false;
        return true;
    });
    const snoozedRecs = activeList.filter(r => snoozed.includes(r.id));

    const openModal = (rec, onConfirm) => setModal({rec, onConfirm});

    // Staging/Basket handlers
    const stagedRecs = activeList.filter(r => staged.includes(r.id) && !snoozed.includes(r.id));
    const toggleStage = (id) => setStaged(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    const stageHighConf = () => setStaged(activeList.filter(r => r.confidence >= 70 && r.action !== 'Hold' && !snoozed.includes(r.id)).map(r => r.id));
    const commitBasket = () => {
        const ids = stagedRecs.map(r => r.id);
        if (!ids.length) return;
        setBasketModal(ids);
    };
    const confirmBasket = () => { if (basketModal) { applyBatch(basketModal); setStaged([]); setBasketModal(null); } };
    const clearBasket = () => setStaged([]);
    const snooze = (id) => {
        setSnoozed(s => s.includes(id) ? s : [...s, id]);
        setStaged(s => s.filter(x => x !== id));
    };
    const resume = (id) => setSnoozed(s => s.filter(x => x !== id));

    useEffect(() => {
        const onKey = (e) => {
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
            if (!staged.length) return;
            if (e.key === 'c' || e.key === 'C') { e.preventDefault(); commitBasket(); }
            else if (e.key === 'Escape') setStaged([]);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [staged, snoozed, basketModal]);

    const selStyle = {padding: '7px 12px', fontSize: 12, borderRadius: 8, background: 'var(--canvas)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-10)', colorScheme: 'dark', outline: 'none'};

    return (
        <>
            <div style={{display: 'flex', alignItems: 'flex-end', gap: 24, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 18, flexWrap: 'wrap'}}>
                <div>
                    <Eyebrow>Active</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, lineHeight: 1}}>{active.length}</div>
                </div>
                <div>
                    <Eyebrow>Applied</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, color: 'var(--sage-500)', marginTop: 6}}>{applied.length}</div>
                </div>
                <div>
                    <Eyebrow>Dismissed</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, color: 'var(--ink-30)', marginTop: 6}}>{dismissed.length}</div>
                </div>
                <div style={{flex: 1}}/>
                {allRecs.length > 0 && (
                    <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                        <button onClick={stageHighConf} className="du3-cta ghost" style={{height:32,fontSize:12,whiteSpace:'nowrap'}}>⊕ Stage all ≥ 70%</button>
                        <select value={strength} onChange={e => setStrength(e.target.value)} style={selStyle}>
                            <option value="all">All strengths</option>
                            <option value="recommended">Recommended</option>
                            <option value="consider">Consider</option>
                            <option value="conflict">Conflict</option>
                            <option value="hold">Hold</option>
                        </select>
                        <select value={filter} onChange={e => setFilter(e.target.value)} style={selStyle}>
                            <option value="all">All actions</option>
                            <option>Reduce</option><option>Add</option><option>Hold</option>
                            <option>Rebalance</option><option>Harvest</option><option>Ladder</option>
                        </select>
                    </div>
                )}
            </div>

            <SectionHead eyebrow="Active · awaiting your decision" title="Active recommendations" meta={`${filteredActive.length} of ${activeList.length - snoozedRecs.length}`}/>
            {filteredActive.length === 0 ? (
                <div style={{padding:'32px 24px',textAlign:'center',border:'1px dashed rgba(255,255,255,0.10)',borderRadius:12,background:'rgba(255,255,255,0.015)'}}>
                    <div style={{fontSize:14,color:'var(--ink-20)',fontFamily:'var(--font-heading)',fontWeight:600,marginBottom:6}}>No active recommendations</div>
                    <div style={{fontSize:12.5,color:'var(--ink-40)',marginBottom:16}}>Aureon generates recommendations when signals warrant action.</div>
                    <button onClick={() => {
                        const briefingsTab = document.querySelector('button[role="tab"]:nth-child(4)');
                        if (briefingsTab) briefingsTab.click();
                    }} className="du3-cta" style={{background:'rgba(201,168,106,0.14)',border:'1px solid rgba(201,168,106,0.35)',color:'var(--aurum-100)'}}>Run AI briefing →</button>
                </div>
            ) : (
                <div style={{display: 'grid', gap: 10}}>
                    {filteredActive.map(rec => {
                        const isStaged = staged.includes(rec.id);
                        return (
                            <DecisionUnit
                                key={rec.id}
                                rec={rec}
                                activeIds={active}
                                onCommit={apply}
                                onUndo={undo}
                                onResolveConflict={() => {}}
                                openModal={openModal}
                                onStage={toggleStage}
                                onSnooze={snooze}
                                onDismiss={dismiss}
                                isStaged={isStaged}
                                onViewLineage={onViewLineage}
                            />
                        );
                    })}
                </div>
            )}

            {snoozedRecs.length > 0 && (
                <>
                    <SectionHead eyebrow="Snoozed · waiting on signal" title="Snoozed" meta={`${snoozedRecs.length}`}/>
                    <div className="layer-1" style={{padding:0,overflow:'hidden',marginBottom:4}}>
                        {snoozedRecs.map(r => (
                            <div key={r.id} style={{display:'grid',gridTemplateColumns:'90px 1fr auto',gap:12,padding:'12px 18px',fontSize:12.5,alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                                <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-10)',fontWeight:600}}>{r.action}</span>
                                <span style={{color:'var(--ink-20)'}}>{r.title} · <span style={{color:'var(--ink-40)'}}>{r.impactOneLine}</span></span>
                                <button onClick={() => resume(r.id)} className="du3-cta ghost" style={{padding:'0 12px',height:28,fontSize:11.5}}>Resume</button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <DecisionBasket stagedRecs={stagedRecs} onCommit={commitBasket} onClear={clearBasket} onUnstage={toggleStage}/>

            {applied.length > 0 && (
                <>
                    <SectionHead eyebrow="Applied" title="Recently applied" meta={`${applied.length} this session`}/>
                    <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                        {applied.map(a => {
                            const r = allRecs.find(x => x.id === a.id);
                            if (!r) return null;
                            return (
                                <div key={a.id} style={{display: 'grid', gridTemplateColumns: '80px 100px 1fr 110px 100px 100px', gap: 12, padding: '12px 18px', fontSize: 12.5, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                                    <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-30)'}}>{a.ts}</span>
                                    <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)', fontWeight: 600}}>{r.action}</span>
                                    <span style={{color: 'var(--ink-10)'}}>{r.title} · {r.impactOneLine}</span>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sage-500)'}}>realized {a.realized}</span>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)'}}>vs {a.predicted}</span>
                                    <button onClick={() => onViewLineage?.(r.id)} className="du3-cta ghost" style={{height: 26, fontSize: 11.5, padding: '0 8px', marginLeft: 'auto'}}>Lineage</button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {dismissed.length > 0 && (
                <>
                    <SectionHead eyebrow="Dismissed" title="Dismissed" meta={`${dismissed.length}`}/>
                    <div className="layer-1" style={{padding: 0, overflow: 'hidden', opacity: 0.8}}>
                        {dismissed.map(d => {
                            const r = allRecs.find(x => x.id === d.id);
                            if (!r) return null;
                            return (
                                <div key={d.id} style={{display: 'grid', gridTemplateColumns: '80px 100px 1fr 1fr 100px', gap: 12, padding: '12px 18px', fontSize: 12.5, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                                    <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-30)'}}>{d.ts}</span>
                                    <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-30)'}}>{r.action}</span>
                                    <span style={{color: 'var(--ink-20)'}}>{r.title}</span>
                                    <span style={{fontSize: 11, color: 'var(--ink-40)'}}>{d.reason}</span>
                                    <button onClick={() => onViewLineage?.(r.id)} className="du3-cta ghost" style={{height: 26, fontSize: 11.5, padding: '0 8px', marginLeft: 'auto'}}>Lineage</button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {modal && <ActionConfirmationModal rec={modal.rec} onCancel={() => setModal(null)} onConfirm={() => { modal.onConfirm?.(); setModal(null); }}/>}
            {basketModal && <BasketConfirmModal recs={allRecs.filter(r => basketModal.includes(r.id))} onCancel={() => setBasketModal(null)} onConfirm={confirmBasket}/>}
            <div style={{height: 32}}/>
        </>
    );
}

function SignalsTab() {
    const {search} = useApp();
    const {signals: SIGNALS} = useAureonData();
    const [kind, setKind] = useState('all');
    const [sev, setSev] = useState('all');
    const [dir, setDir] = useState('all');

    const filtered = useMemo(() => {
        let s = SIGNALS.slice();
        if (kind !== 'all') s = s.filter(x => x.kind === kind);
        if (sev  !== 'all') s = s.filter(x => x.severity === sev);
        if (dir  !== 'all') s = s.filter(x => inferDirection(x) === dir);
        if (search) s = s.filter(x => (x.asset + ' ' + x.text + ' ' + x.kind).toLowerCase().includes(search.toLowerCase()));
        return s;
    }, [SIGNALS, kind, sev, dir, search]);

    const grouped = useMemo(() => {
        const g = {};
        filtered.forEach(s => { const key = s.asset ?? 'Portfolio'; (g[key] = g[key] || []).push(s); });
        return Object.entries(g);
    }, [filtered]);

    const selStyle = {padding: '8px 12px', fontSize: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--ink-10)', fontFamily: 'var(--font-ui)', cursor: 'pointer'};

    return (
        <>
            <div style={{display: 'flex', gap: 32, alignItems: 'flex-end', paddingBottom: 18, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap'}}>
                <div>
                    <Eyebrow>Today</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, lineHeight: 1}}>{SIGNALS.length}</div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4}}>signals detected</div>
                </div>
                <div>
                    <Eyebrow>High severity</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--crimson-500)', marginTop: 6}}>{SIGNALS.filter(s => s.severity === 'high').length}</div>
                </div>
                <div>
                    <Eyebrow>Bullish · Bearish</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, marginTop: 6}}>
                        <span style={{color: 'var(--sage-500)'}}>{SIGNALS.filter(s => inferDirection(s) === 'bull').length}</span>
                        <span style={{color: 'var(--ink-40)', margin: '0 6px'}}>·</span>
                        <span style={{color: 'var(--crimson-500)'}}>{SIGNALS.filter(s => inferDirection(s) === 'bear').length}</span>
                    </div>
                </div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                    <select value={kind} onChange={e => setKind(e.target.value)} style={selStyle}>
                        {['all', 'momentum', 'sentiment', 'allocation', 'volatility', 'fundamentals', 'macro', 'news'].map(k => <option key={k} value={k}>{k === 'all' ? 'All kinds' : k}</option>)}
                    </select>
                    <select value={sev} onChange={e => setSev(e.target.value)} style={selStyle}>
                        {['all', 'high', 'med', 'low'].map(k => <option key={k} value={k}>{k === 'all' ? 'All severities' : k}</option>)}
                    </select>
                    <select value={dir} onChange={e => setDir(e.target.value)} style={selStyle}>
                        <option value="all">All directions</option>
                        <option value="bull">Bullish</option>
                        <option value="bear">Bearish</option>
                        <option value="neutral">Neutral</option>
                    </select>
                </div>
            </div>
            {grouped.length === 0
                ? <div style={{padding: 32, textAlign: 'center', color: 'var(--ink-30)', fontSize: 13}}>No signals match the filters.</div>
                : grouped.map(([asset, items]) => (
                    <section key={asset} style={{marginBottom: 24}}>
                        <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, paddingLeft: 4}}>
                            <span style={{fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--ink-10)'}}>{asset}</span>
                            <span style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{items.length} signal{items.length > 1 ? 's' : ''}</span>
                        </div>
                        <div style={{display: 'grid', gap: 10}}>{items.map(s => <SignalCard key={s.id} s={s}/>)}</div>
                    </section>
                ))
            }
            <div style={{height: 32}}/>
        </>
    );
}

function ActivityTab({ onViewLineage }) {
    const {activity, undo} = useApp();
    const queryClient = useQueryClient();
    const [kind, setKind] = useState('all');
    const [undoneIds, setUndoneIds] = useState(new Set());
    const [removedIds, setRemovedIds] = useState(new Set());
    const [editingTxn, setEditingTxn] = useState(null);

    const handleDelete = async (a) => {
        if (!window.confirm(`Delete the transaction for ${a.asset}?`)) return;
        try {
            const txId = parseInt(a.id.replace('t-', ''));
            await apiService.deleteTransaction(txId);
            toast.success('Transaction deleted');
            queryClient.invalidateQueries({queryKey: AUREON_STATE_KEY});
        } catch (err) {
            toast.error(apiService.cleanError(err));
        }
    };

    const handleUndo = (a) => {
        const undoId = a.extId || a.ext_id || null;
        setUndoneIds(prev => new Set([...prev, a.id]));
        setTimeout(() => { setRemovedIds(prev => new Set([...prev, a.id])); if (undoId) undo(undoId); }, 120);
    };

    const filtered = activity.filter(a => (kind === 'all' || a.kind === kind) && !removedIds.has(a.id));
    const counts = {
        applied: activity.filter(a => a.kind === 'applied').length,
        dismissed: activity.filter(a => a.kind === 'dismissed').length,
        contribution: activity.filter(a => a.kind === 'contribution').length,
        trade: activity.filter(a => a.kind === 'trade').length,
    };

    const tsDatePart = (ts) => ts.includes('·') ? ts.split('·')[0].trim() : ts.split(' ')[0].trim();
    const tsTimePart = (ts) => ts.includes('·') ? (ts.split('·')[1]?.trim() || ts) : (ts.split(' ').slice(1).join(' ') || ts);

    const groups = {};
    filtered.forEach(a => { const day = tsDatePart(a.ts); (groups[day] = groups[day] || []).push(a); });

    return (
        <>
            {editingTxn && <LogTradeModal transaction={editingTxn} onClose={(refresh) => { setEditingTxn(null); if (refresh) { queryClient.invalidateQueries({queryKey: AUREON_STATE_KEY}); queryClient.invalidateQueries({queryKey: ['transactions']}); } }}/>}

            {/* Info banner */}
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 20}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0, marginTop: 1}}>
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
                </svg>
                <p style={{margin: 0, fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.55}}>
                    <strong style={{color: 'var(--ink-00)'}}>Acted by mistake?</strong> Reverse any applied or dismissed decision below — even after the undo window closes. Reversing restores the recommendation to Active and logs a correction.
                </p>
            </div>

            {/* Stats + filter */}
            <div style={{display: 'flex', alignItems: 'flex-end', gap: 24, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 18, flexWrap: 'wrap'}}>
                <div>
                    <Eyebrow>Last 30 days</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, lineHeight: 1}}>{activity.length}</div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4}}>entries</div>
                </div>
                <div><Eyebrow>Applied</Eyebrow><div style={{fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--sage-500)', marginTop: 6}}>{counts.applied}</div></div>
                <div><Eyebrow>Dismissed</Eyebrow><div style={{fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--ink-30)', marginTop: 6}}>{counts.dismissed}</div></div>
                <div><Eyebrow>Contributions</Eyebrow><div style={{fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--ink-10)', marginTop: 6}}>{counts.contribution}</div></div>
                <div><Eyebrow>Trades</Eyebrow><div style={{fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--aurum-100)', marginTop: 6}}>{counts.trade}</div></div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', gap: 6, padding: 4, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
                    {[['all', 'All'], ['applied', 'Applied'], ['dismissed', 'Dismissed'], ['contribution', 'Contributions'], ['trade', 'Trades']].map(([k, l]) => (
                        <button key={k} onClick={() => setKind(k)} style={{padding: '5px 12px', fontSize: 11.5, borderRadius: 6, border: 'none', cursor: 'pointer', background: kind === k ? 'rgba(255,255,255,0.07)' : 'transparent', color: kind === k ? 'var(--ink-00)' : 'var(--ink-30)'}}>{l}</button>
                    ))}
                </div>
            </div>

            {activity.length === 0 ? (
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: '30vh', textAlign: 'center'}}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    <div style={{fontSize: 14, color: 'var(--ink-20)', fontWeight: 500}}>No activity yet</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6}}>Applied and dismissed recommendations will appear here as a timestamped ledger.</div>
                </div>
            ) : (
                Object.entries(groups).map(([day, items]) => (
                    <section key={day} style={{marginBottom: 20}}>
                        <div style={{fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 8, paddingLeft: 4}}>{day}</div>
                        <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                            {items.map(a => {
                                const tone = a.kind === 'applied' ? 'var(--sage-500)' : a.kind === 'dismissed' ? 'var(--ink-40)' : '#7AA8D4';
                                const icon = a.kind === 'applied' ? '✓' : a.kind === 'dismissed' ? '✕' : '+';
                                const canUndo = a.kind === 'applied' || a.kind === 'dismissed';
                                const fading = undoneIds.has(a.id);
                                return (
                                    <div key={a.id} style={{display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', fontSize: 12.5, borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: fading ? 0 : 1, transition: 'opacity 120ms ease'}}>
                                        <span style={{width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone, fontSize: 11, flexShrink: 0}}>{icon}</span>
                                        <div style={{flex: 1, minWidth: 0}}>
                                            <div style={{display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap'}}>
                                                <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)', fontWeight: 600}}>{a.action}</span>
                                                <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-00)', fontWeight: 600, letterSpacing: '0.04em'}}>{a.asset}</span>
                                                <span style={{fontSize: 11.5, color: 'var(--ink-20)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{a.detail}</span>
                                            </div>
                                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2}}>{tsTimePart(a.ts)}</div>
                                        </div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}}>
                                            {a.kind === 'applied' && !a.realized ? (
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--aurum-500)', fontStyle: 'italic'}}>Pending</span>
                                            ) : a.realized ? (
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right'}}>
                                                    <span style={{color: 'var(--sage-500)'}}>{a.realized}</span>
                                                    {a.predicted && <span style={{color: 'var(--ink-40)'}}> vs {a.predicted}</span>}
                                                </span>
                                            ) : null}
                                            {a.ext_id && (
                                                <button onClick={() => onViewLineage?.(a.ext_id)} style={{display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)'}}>
                                                    Lineage
                                                </button>
                                            )}
                                            {canUndo && !fading && (
                                                <button onClick={() => handleUndo(a)} style={{display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)'}}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>
                                                    Undo
                                                </button>
                                            )}
                                            {a.kind === 'trade' && (
                                                <>
                                                    <button onClick={() => setEditingTxn(a)} style={{display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12}}>Edit</button>
                                                    <button onClick={() => handleDelete(a)} style={{display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12}}>Delete</button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}
            <div style={{height: 32}}/>
        </>
    );
}

function BriefingsTab() {
    const [briefings, setBriefings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const {aiBriefing} = useAureonData();

    useEffect(() => {
        apiService.fetchBriefingHistory(30)
            .then(data => setBriefings(Array.isArray(data) ? data : []))
            .catch(() => setBriefings([]))
            .finally(() => setLoading(false));
    }, []);

    const handleRun = async () => {
        setRunning(true);
        try {
            await apiService.runGlobalAI();
            toast.success('AI briefing queued');
            const data = await apiService.fetchBriefingHistory(30);
            setBriefings(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error(e.message || 'Failed to run AI briefing');
        } finally {
            setRunning(false);
        }
    };

    return (
        <>
            <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 20}}>
                <button onClick={handleRun} disabled={running} className="du3-cta" style={{height: 34, padding: '0 16px'}}>
                    {running ? 'Running…' : 'Run now'}
                </button>
            </div>
            <AIBriefingSection briefing={aiBriefing ?? briefings[0] ?? null}/>
            <h3 style={{margin: '28px 0 12px', fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-20)', letterSpacing: '-0.01em'}}>History</h3>
            {loading ? (
                <div style={{padding: '64px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
            ) : briefings.length === 0 ? (
                <div style={{padding: '48px 20px', textAlign: 'center'}}>
                    <div style={{fontSize: 14, color: 'var(--ink-20)', fontWeight: 500, marginBottom: 6}}>No briefings yet</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)'}}>Run your first AI briefing using the button above.</div>
                </div>
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                    {briefings.map(b => {
                        const tone = TONE_MAP[b.short_term_trend] || TONE_MAP.Neutral;
                        const action = b.recommended_action?.toUpperCase();
                        const acColor = ACTION_COLOR[action] || 'var(--ink-20)';
                        return (
                            <div key={b.id} className="layer-1" style={{padding: '18px 20px'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap'}}>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>{fmtDateTime(b.created_at)}</span>
                                    {b.short_term_trend && <span style={{padding: '2px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`}}>{tone.label}</span>}
                                    {action && <span style={{padding: '2px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: acColor, background: `${acColor}18`, border: `1px solid ${acColor}40`}}>{action}</span>}
                                    {b.confidence != null && <span style={{fontSize: 11, color: 'var(--ink-40)', marginLeft: 'auto'}}>{Math.round(b.confidence * 100)}% confidence</span>}
                                </div>
                                {b.summary && <p style={{margin: 0, fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.6}}>{b.summary}</p>}
                                {b.key_catalyst && <div style={{marginTop: 10, fontSize: 11.5, color: 'var(--ink-30)'}}>Key catalyst: {b.key_catalyst}</div>}
                            </div>
                        );
                    })}
                </div>
            )}
            <div style={{height: 32}}/>
        </>
    );
}

/* ─── Page ─── */
const TAB_INIT_MAP = {recommendations: 'recommendations', signals: 'signals', briefings: 'briefings', activity: 'activity'};

export default function Decisions() {
    const {search: urlSearch} = useLocation();
    const {active, activity} = useApp();
    const {signals, loading, error} = useAureonData();
    const queryClient = useQueryClient();

    const initTab = useMemo(() => {
        const p = new URLSearchParams(urlSearch).get('tab');
        return TAB_INIT_MAP[p] || 'recommendations';
    }, [urlSearch]);

    const [tab, setTab] = useState(initTab);
    const [lineageExtId, setLineageExtId] = useState(null);
    const [lineageOpen, setLineageOpen] = useState(false);

    const handleViewLineage = (extId) => {
        setLineageExtId(extId);
        setLineageOpen(true);
    };

    // Calculate metrics for calibration
    const withRealized = useMemo(() => activity.filter(a => a.realized && a.predicted && a.kind === 'applied'), [activity]);
    const successfulCount = useMemo(() => {
        return withRealized.filter(a => {
            const r = parseFloat(a.realized), p = parseFloat(a.predicted);
            return !isNaN(r) && !isNaN(p) && Math.sign(r) === Math.sign(p);
        }).length;
    }, [withRealized]);
    const unsuccessfulCount = withRealized.length - successfulCount;
    const accuracy = withRealized.length === 0 ? null : Math.round((successfulCount / withRealized.length) * 100);

    return (
        <>
            {/* Calibration metrics dashboard cards */}
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24}}>
                <div className="layer-1" style={{padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6}}>
                    <div style={{fontSize: 10, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600}}>Applied Decisions</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color: 'var(--ink-00)'}}>{withRealized.length}</div>
                    <div style={{fontSize: 11, color: 'var(--ink-30)'}}>Decisions with realized outcomes recorded.</div>
                </div>
                <div className="layer-1" style={{padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6}}>
                    <div style={{fontSize: 10, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600}}>Successful Outcomes</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color: 'var(--sage-500)'}}>{successfulCount}</div>
                    <div style={{fontSize: 11, color: 'var(--ink-30)'}}>Outcome direction matched prediction.</div>
                </div>
                <div className="layer-1" style={{padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6}}>
                    <div style={{fontSize: 10, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600}}>Unsuccessful Outcomes</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color: 'var(--crimson-500)'}}>{unsuccessfulCount}</div>
                    <div style={{fontSize: 11, color: 'var(--ink-30)'}}>Outcome direction mismatched prediction.</div>
                </div>
                <div className="layer-1" style={{padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6}}>
                    <div style={{fontSize: 10, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600}}>Calibration Accuracy</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color: accuracy !== null ? 'var(--aurum-100)' : 'var(--ink-40)'}}>
                        {accuracy !== null ? `${accuracy}%` : '—'}
                    </div>
                    <div style={{fontSize: 11, color: 'var(--ink-30)'}}>Percentage of decisions matching expected returns.</div>
                </div>
            </div>

            {/* Tab bar */}
            <div style={{display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 24, flexWrap: 'wrap', rowGap: 0}}>
                <Tabs
                    tabs={[
                        { id: 'recommendations', label: 'Recommendations', badge: active.length },
                        { id: 'signals',         label: 'Signals',         badge: signals ? signals.length : 0 },
                        { id: 'activity',        label: 'Activity',        badge: activity.length },
                        { id: 'briefings',       label: 'Briefings' },
                    ]}
                    active={tab}
                    onChange={setTab}
                    standalone={false}
                />
            </div>

            {/* Tab content */}
            {tab === 'recommendations' && (
                error ? (
                    <div style={{padding: '24px 0'}}>
                        <ErrorState
                            title="Aureon is temporarily unavailable."
                            body="Recommendation analysis could not be completed."
                            actions={
                                <button onClick={() => queryClient.invalidateQueries({queryKey: AUREON_STATE_KEY})} style={{
                                    height: 36, padding: '0 20px', borderRadius: 8,
                                    background: 'var(--crimson-500)', border: 'none',
                                    color: 'var(--ink-00)', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                                    cursor: 'pointer'
                                }}>
                                    Retry
                                </button>
                            }
                        />
                    </div>
                ) : loading ? (
                    <div style={{display: 'grid', gap: 10}}>
                        <RecommendationSkeleton />
                        <RecommendationSkeleton />
                        <RecommendationSkeleton />
                    </div>
                ) : (
                    <RecommendationsTab onViewLineage={handleViewLineage}/>
                )
            )}
            {tab === 'signals'         && <SignalsTab/>}
            {tab === 'activity'        && <ActivityTab onViewLineage={handleViewLineage}/>}
            {tab === 'briefings'       && <BriefingsTab/>}

            <DecisionLineageDrawer
                extId={lineageExtId}
                open={lineageOpen}
                onClose={() => setLineageOpen(false)}
            />
        </>
    );
}


/* ─── DecisionLineageDrawer ─── */
function DecisionLineageDrawer({ extId, open, onClose }) {
    const [lineage, setLineage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const fmtCash = useFmtMoney();

    useEffect(() => {
        if (!open || !extId) return;
        setLoading(true);
        setError(null);
        apiService.getRecommendationLineage(extId)
            .then(data => {
                setLineage(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message || 'Failed to load decision lineage');
                setLoading(false);
            });
    }, [extId, open]);

    if (!open) return null;

    const renderSignalNode = (signals) => {
        if (!signals || signals.length === 0) {
            return (
                <div style={{fontSize: 12.5, color: 'var(--ink-40)', fontStyle: 'italic'}}>
                    No signal evidence linked.
                </div>
            );
        }
        return signals.map((sig, idx) => (
            <div key={sig.id || idx} style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 8,
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
                    <span style={{fontWeight: 600, color: 'var(--ink-10)', fontSize: 13}}>
                        {sig.symbol} · {sig.signal_type}
                    </span>
                    {sig.confidence != null && (
                        <span style={{color: 'var(--aurum-100)', fontFamily: 'var(--font-mono)', fontSize: 11}}>
                            {sig.confidence}% confidence
                        </span>
                    )}
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: 'var(--ink-30)', marginBottom: 8}}>
                    <div>Entry: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)'}}>{sig.entry_price != null ? fmtCash(sig.entry_price) : '—'}</span></div>
                    <div>Exit: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)'}}>{sig.exit_price != null ? fmtCash(sig.exit_price) : '—'}</span></div>
                </div>
                {sig.rationale && (
                    <div style={{fontSize: 12, color: 'var(--ink-40)', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: 6, marginTop: 6, lineHeight: 1.4}}>
                        {sig.rationale}
                    </div>
                )}
            </div>
        ));
    };

    const renderRecommendationNode = (rec) => {
        if (!rec) return null;
        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: '12px 14px',
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                    <span style={{fontWeight: 600, color: 'var(--ink-10)', fontSize: 13.5}}>{rec.title}</span>
                    <span style={{
                        fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                        color: rec.action === 'Reduce' ? 'var(--crimson-400)' : rec.action === 'Add' ? 'var(--sage-400)' : 'var(--aurum-500)',
                        background: rec.action === 'Reduce' ? 'rgba(235,94,85,0.1)' : rec.action === 'Add' ? 'rgba(107,191,126,0.1)' : 'rgba(201,168,106,0.1)',
                        padding: '2px 6px', borderRadius: 4, border: rec.action === 'Reduce' ? '1px solid rgba(235,94,85,0.2)' : rec.action === 'Add' ? '1px solid rgba(107,191,126,0.2)' : '1px solid rgba(201,168,106,0.2)'
                    }}>{rec.action}</span>
                </div>
                <div style={{fontSize: 12, color: 'var(--ink-30)', display: 'flex', gap: 16, marginTop: 8}}>
                    <div>Scope: <span style={{fontWeight: 500, color: 'var(--ink-10)'}}>{rec.scope_kind} ({rec.scope_ref})</span></div>
                    {rec.confidence != null && <div>Confidence: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--aurum-100)'}}>{rec.confidence}%</span></div>}
                </div>
                {rec.predicted_impact && (
                    <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 6}}>
                        Predicted Impact: <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--sage-400)'}}>{rec.predicted_impact}</span>
                    </div>
                )}
            </div>
        );
    };

    const renderDecisionNode = (rec, txn) => {
        if (rec.status === 'dismissed') {
            return (
                <div style={{
                    background: 'rgba(235, 94, 85, 0.03)',
                    border: '1px solid rgba(235, 94, 85, 0.15)',
                    borderRadius: 8,
                    padding: '12px 14px',
                }}>
                    <div style={{fontWeight: 600, color: 'var(--crimson-400)', fontSize: 13, marginBottom: 4}}>Dismissed</div>
                    <div style={{fontSize: 12, color: 'var(--ink-30)'}}>
                        Reason: <span style={{color: 'var(--ink-10)'}}>{rec.dismiss_reason || 'User dismissed'}</span>
                    </div>
                    {rec.dismissed_at && (
                        <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 6, fontFamily: 'var(--font-mono)'}}>
                            Date: {fmtDateTime(rec.dismissed_at)}
                        </div>
                    )}
                </div>
            );
        }

        if (rec.status === 'applied') {
            return (
                <div style={{
                    background: 'rgba(107, 191, 126, 0.03)',
                    border: '1px solid rgba(107, 191, 126, 0.15)',
                    borderRadius: 8,
                    padding: '12px 14px',
                }}>
                    <div style={{fontWeight: 600, color: 'var(--sage-400)', fontSize: 13, marginBottom: 4}}>Applied & Committed</div>
                    {txn ? (
                        <div style={{fontSize: 12, color: 'var(--ink-30)', display: 'flex', flexDirection: 'column', gap: 4}}>
                            <div>Txn ID: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)'}}>t-{txn.id}</span></div>
                            <div>Type: <span style={{color: 'var(--ink-10)'}}>{txn.transaction_type} ({txn.kind})</span></div>
                            {txn.transaction_date && (
                                <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2, fontFamily: 'var(--font-mono)'}}>
                                    Date: {fmtDateTime(txn.transaction_date)}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{fontSize: 12.5, color: 'var(--ink-30)'}}>Committed through trade execution.</div>
                    )}
                </div>
            );
        }

        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: 8,
                padding: '12px 14px',
            }}>
                <div style={{fontWeight: 600, color: 'var(--ink-30)', fontSize: 13}}>Pending Execution</div>
                <div style={{fontSize: 12, color: 'var(--ink-40)', marginTop: 4}}>
                    This decision has not been applied or dismissed yet.
                </div>
            </div>
        );
    };

    const renderOutcomeNode = (outcome) => {
        if (!outcome) return null;
        const statusColors = {
            pending_execution: 'var(--ink-30)',
            pending_settlement: 'var(--aurum-500)',
            settled: 'var(--sage-500)',
            dismissed: 'var(--ink-40)',
        };
        const statusLabels = {
            pending_execution: 'Awaiting Action',
            pending_settlement: 'Pending Settlement',
            settled: 'Settled',
            dismissed: 'Dismissed',
        };

        const isSuccess = outcome.is_success;
        const color = statusColors[outcome.settlement_status] || 'var(--ink-20)';

        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: '12px 14px',
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                    <span style={{fontSize: 12, color: 'var(--ink-30)'}}>
                        Status: <span style={{fontWeight: 600, color}}>{statusLabels[outcome.settlement_status] || outcome.settlement_status}</span>
                    </span>
                    {isSuccess !== null && (
                        <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            color: isSuccess ? 'var(--sage-400)' : 'var(--crimson-400)',
                            background: isSuccess ? 'rgba(107,191,126,0.1)' : 'rgba(235,94,85,0.1)',
                            border: isSuccess ? '1px solid rgba(107,191,126,0.25)' : '1px solid rgba(235,94,85,0.25)'
                        }}>
                            {isSuccess ? '✓ Success' : '✕ Failure'}
                        </span>
                    )}
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5, color: 'var(--ink-20)'}}>
                    <div>Predicted: <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--sage-400)'}}>{outcome.predicted_impact || '—'}</span></div>
                    <div>Realized: <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600, color: outcome.realized_impact ? 'var(--aurum-100)' : 'var(--ink-40)'}}>{outcome.realized_impact || 'Pending...'}</span></div>
                </div>
            </div>
        );
    };

    const renderCalibrationNode = (cal) => {
        if (!cal) return null;
        const hasCal = cal.accuracy != null;
        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: '12px 14px',
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{fontSize: 12, color: 'var(--ink-30)'}}>Asset Class / Sector Accuracy</span>
                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: hasCal ? 'var(--aurum-100)' : 'var(--ink-40)'}}>
                        {hasCal ? `${Math.round(cal.accuracy)}%` : '—'}
                    </span>
                </div>
                <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 4}}>
                    Based on <span style={{color: 'var(--ink-20)', fontFamily: 'var(--font-mono)'}}>{cal.examples}</span> calibration candidate{cal.examples === 1 ? '' : 's'}.
                </div>
            </div>
        );
    };

    return (
        <Drawer open={open} onClose={onClose} title={`Decision Lineage: ${extId}`} width="560px">
            <div style={{display: 'flex', flexDirection: 'column', gap: 24, position: 'relative', paddingLeft: 20}}>
                {loading ? (
                    <div style={{padding: '40px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
                        Loading recommendation lineage...
                    </div>
                ) : error ? (
                    <div style={{padding: '40px 0', textAlign: 'center', color: 'var(--crimson-400)', fontSize: 13}}>
                        {error}
                    </div>
                ) : lineage ? (
                    <>
                        {/* Vertical timeline track line */}
                        <div style={{
                            position: 'absolute', left: 4, top: 12, bottom: 12, width: 2,
                            background: 'linear-gradient(to bottom, rgba(122,168,212,0.5), rgba(201,168,106,0.5), rgba(107,191,126,0.5), rgba(255,255,255,0.08))',
                        }}/>

                        {/* Timeline Node 1: SIGNAL */}
                        <div style={{position: 'relative'}}>
                            {/* Dot */}
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: '#7AA8D4', boxShadow: '0 0 8px rgba(122,168,212,0.6)', border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7AA8D4', fontWeight: 600, marginBottom: 8}}>
                                Signal Evidence
                            </div>
                            {renderSignalNode(lineage.signals)}
                        </div>

                        {/* Timeline Node 2: RECOMMENDATION */}
                        <div style={{position: 'relative'}}>
                            {/* Dot */}
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: 'var(--aurum-500)', boxShadow: '0 0 8px rgba(201,168,106,0.6)', border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600, marginBottom: 8}}>
                                Recommendation
                            </div>
                            {renderRecommendationNode(lineage.recommendation)}
                        </div>

                        {/* Timeline Node 3: APPLIED DECISION */}
                        <div style={{position: 'relative'}}>
                            {/* Dot */}
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: lineage.recommendation?.status === 'applied' ? 'var(--sage-500)' : lineage.recommendation?.status === 'dismissed' ? 'var(--crimson-500)' : 'var(--ink-40)',
                                boxShadow: lineage.recommendation?.status === 'applied' ? '0 0 8px rgba(107,191,126,0.6)' : lineage.recommendation?.status === 'dismissed' ? '0 0 8px rgba(235,94,85,0.6)' : 'none',
                                border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-20)', fontWeight: 600, marginBottom: 8}}>
                                Applied Decision
                            </div>
                            {renderDecisionNode(lineage.recommendation, lineage.transaction)}
                        </div>

                        {/* Timeline Node 4: OUTCOME */}
                        <div style={{position: 'relative'}}>
                            {/* Dot */}
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: lineage.outcome?.settlement_status === 'settled' ? 'var(--sage-500)' : 'var(--ink-40)',
                                border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-20)', fontWeight: 600, marginBottom: 8}}>
                                Outcome
                            </div>
                            {renderOutcomeNode(lineage.outcome)}
                        </div>

                        {/* Timeline Node 5: CALIBRATION */}
                        <div style={{position: 'relative'}}>
                            {/* Dot */}
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: 'var(--aurum-500)', border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600, marginBottom: 8}}>
                                Calibration Memory
                            </div>
                            {renderCalibrationNode(lineage.calibration)}
                        </div>
                    </>
                ) : null}
            </div>
        </Drawer>
    );
}
