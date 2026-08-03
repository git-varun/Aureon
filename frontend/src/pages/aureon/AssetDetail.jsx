/* Aureon — Asset Detail page.
   Sections: Overview · Quote · Fundamentals · Technical · AI Take · News · Related Themes
   Each section loads independently with loading / empty / error / retry states.
   Header actions: Generate Signal, Refresh Market Data, Trigger Historical Backfill.
   Backend rules: never fabricate data; all missing fields render as "—". */
import React, {useState, useEffect, useCallback} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useApp} from '@/components/aureon/store';
import {Eyebrow, TierChip, PriceChart, Empty, EpfEstimateBadge} from '@/components/aureon/ui';
import {DecisionUnit, ActionConfirmationModal} from '@/components/aureon/flow';
import {apiService} from '@/api/apiService';
import {valueOf, valueOfBase, plOf, plPctOf, isFutures} from '@/components/aureon/utils';
import {useAureonData} from '@/hooks/useAureonData';
import {useV4} from '@/contexts/V4Context';
import {useFmtMoney} from '@/hooks/useFmtMoney';

/* ── State helpers (Markets.jsx pattern — never sync setState in effect body) ── */
const mkL = () => ({loading: true, data: null, error: null});
const mkD = (data) => ({loading: false, data, error: null});
const mkE = (err) => ({loading: false, data: null, error: typeof err === 'string' ? err : (err?.message || 'Failed to load')});

/* ── Icon components ─────────────────────────────────────────── */
const IcoSpin = ({sz = 12}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" style={{animation: 'spin 1s linear infinite', flexShrink: 0, display: 'block'}}>
        <circle cx="12" cy="12" r="9" strokeDasharray="40 80"/>
    </svg>
);
const IcoAlert = ({sz = 13}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/>
    </svg>
);
const IcoRefresh = ({sz = 13}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
);
const IcoZap = ({sz = 13}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
);
const IcoHistory = ({sz = 13}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>
    </svg>
);
const IcoChevron = ({sz = 11, up = false}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round"
         style={{transform: up ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0}}>
        <polyline points="6 9 12 15 18 9"/>
    </svg>
);
const IcoExternal = ({sz = 10}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
);

/* ── SectionCard ─────────────────────────────────────────────── */
function SectionCard({id, eyebrow, title, status, retry, meta, action, children}) {
    const ready = status === 'ok';
    return (
        <section id={id} className="layer-1" style={{marginBottom: 14, overflow: 'hidden'}}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px',
                borderBottom: ready ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}>
                <div style={{flex: 1, minWidth: 0}}>
                    {eyebrow && (
                        <div style={{fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                            {eyebrow}
                        </div>
                    )}
                    {title && (
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 15.5, fontWeight: 600, color: 'var(--ink-00)', marginTop: eyebrow ? 3 : 0, letterSpacing: '-0.01em'}}>
                            {title}
                        </div>
                    )}
                </div>
                {meta && <div style={{flexShrink: 0}}>{meta}</div>}
                {action && <div style={{flexShrink: 0}}>{action}</div>}
            </div>

            {status === 'loading' && (
                <div style={{padding: '26px 18px', display: 'flex', alignItems: 'center', gap: 9, color: 'var(--ink-40)', fontSize: 12.5}}>
                    <IcoSpin sz={13}/> Loading…
                </div>
            )}
            {status === 'error' && (
                <div style={{padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(209,107,107,0.03)', borderTop: '1px solid rgba(209,107,107,0.10)'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, color: 'var(--crimson-500)', fontSize: 12.5}}>
                        <IcoAlert sz={13}/>
                        <span>Unable to load {(title || 'this section').toLowerCase()}</span>
                    </div>
                    {retry && (
                        <button onClick={retry} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                            height: 27, padding: '0 11px', borderRadius: 6, cursor: 'pointer',
                            background: 'transparent', border: '1px solid rgba(209,107,107,0.28)',
                            color: 'var(--crimson-500)', fontSize: 11.5, fontFamily: 'var(--font-ui)',
                        }}>
                            <IcoRefresh sz={11}/> Retry
                        </button>
                    )}
                </div>
            )}
            {status === 'empty' && (
                <div style={{padding: '22px 18px'}}>
                    <Empty>No data available for {(title || 'this section').toLowerCase()}.</Empty>
                </div>
            )}
            {status === 'ok' && (
                <div style={{padding: '14px 18px'}}>{children}</div>
            )}
        </section>
    );
}

/* ── QuoteSection ─────────────────────────────────────────────── */
function QuoteSection({ticker, price}) {
    const [state, setState] = useState(mkL());
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        apiService.getAssetQuote(ticker)
            .then(d => setState(mkD(d || {})))
            .catch(e => setState(mkE(e)));
    }, [ticker, attempt]);

    const retry = useCallback(() => setAttempt(a => a + 1), []);
    const status = state.loading ? 'loading' : state.error ? 'error' : 'ok';

    const q = state.data;
    const fp = (n) => n != null ? n.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
    const fv = (n) => n == null ? '—' : n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : (n / 1000).toFixed(0) + 'K';

    const cells = [
        ['Bid', fp(q?.bid)], ['Ask', fp(q?.ask)],
        ['Open', fp(q?.open)], ['Prev close', fp(q?.prevClose)],
        ['Day low', fp(q?.dayLow)], ['Day high', fp(q?.dayHigh)],
        ['52w low', fp(q?.wk52Low)], ['52w high', fp(q?.wk52High)],
        ['Volume', fv(q?.volume)], ['Avg vol', fv(q?.avgVol)],
    ];

    const livePrice = q?.price ?? price;
    const rangePct = (q?.wk52Low != null && q?.wk52High != null && q.wk52High !== q.wk52Low && livePrice != null)
        ? Math.min(100, Math.max(0, (livePrice - q.wk52Low) / (q.wk52High - q.wk52Low) * 100))
        : 50;

    const freshChip = (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>
            <span style={{width: 5, height: 5, borderRadius: 999, background: 'var(--ink-40)', flexShrink: 0}}/>
            {q?.price != null ? 'Live' : 'Not yet available'}
        </span>
    );

    return (
        <SectionCard id="section-quote" eyebrow="Market" title="Quote" status={status} retry={retry} meta={freshChip}>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '14px 20px'}}>
                {cells.map(([k, v]) => (
                    <div key={k}>
                        <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{k}</div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500, color: v === '—' ? 'var(--ink-40)' : 'var(--ink-00)', marginTop: 4}}>{v}</div>
                    </div>
                ))}
            </div>
            <div style={{marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-40)', marginBottom: 7}}>
                    <span>52-week range</span>
                    <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)'}}>{fp(q?.wk52Low)} — {fp(q?.wk52High)}</span>
                </div>
                <div style={{position: 'relative', height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)'}}>
                    <div style={{position: 'absolute', left: 0, width: `${rangePct}%`, height: '100%', borderRadius: 'inherit', background: 'var(--aurum-500)', opacity: 0.65}}/>
                    <div style={{position: 'absolute', left: `${rangePct}%`, top: -4, bottom: -4, width: 2, background: 'var(--aurum-100)', borderRadius: 1, transform: 'translateX(-1px)'}}/>
                </div>
            </div>
        </SectionCard>
    );
}

// Fields with no backing source anywhere in Aureon today — see the BACKLOG
// comment on get_fundamentals (backend/app/modules/market/services/assets.py)
// for what each would need. Always rendered as "Unavailable", never a value,
// regardless of what the API response contains for them.
const FUNDAMENTALS_UNSUPPORTED = new Set(['eps', 'beta', 'vol_30d', 'high_52w', 'low_52w', 'graham_number']);

/* ── FundamentalsSection ─────────────────────────────────────── */
function FundamentalsSection({ticker}) {
    const [state, setState] = useState(mkL());
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        apiService.getAssetFundamentals(ticker)
            .then(d => setState(d ? mkD(d) : mkD({})))
            .catch(e => setState(mkE(e)));
    }, [ticker, attempt]);

    const retry = useCallback(() => setAttempt(a => a + 1), []);
    const d = state.data;
    const hasData = d && [d.pe_ratio, d.market_cap, d.rsi, d.momentum_score, d.pb_ratio, d.roe, d.de_ratio, d.dividend_yield].some(v => v != null);
    const status = state.loading ? 'loading' : state.error ? 'error' : !hasData ? 'empty' : 'ok';

    const fmcap = (n) => {
        if (n == null) return '—';
        if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
        if (n >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
        if (n >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
        return n.toLocaleString();
    };
    const fpct = (n) => n != null ? (n * 100).toFixed(1) + '%' : '—';
    const fn2  = (n) => n != null ? n.toFixed(2) : '—';
    const val  = (key, formatted) => FUNDAMENTALS_UNSUPPORTED.has(key) ? 'Unavailable' : formatted;

    const cells = [
        ['P/E ratio',    d?.pe_ratio != null ? d.pe_ratio.toFixed(1) : '—'],
        ['P/B ratio',    fn2(d?.pb_ratio)],
        ['ROE',          fpct(d?.roe)],
        ['D/E ratio',    fn2(d?.de_ratio)],
        ['EPS',          val('eps', fn2(d?.eps))],
        ['Div yield',    fpct(d?.dividend_yield)],
        ['Beta',         val('beta', fn2(d?.beta))],
        ['Vol 30d (ann.)', val('vol_30d', d?.vol_30d != null ? `${d.vol_30d}%` : '—')],
        ['52W high',     val('high_52w', fn2(d?.high_52w))],
        ['52W low',      val('low_52w', fn2(d?.low_52w))],
        ['Graham #',     val('graham_number', fn2(d?.graham_number))],
        ['Market cap',   fmcap(d?.market_cap)],
        ['RSI · 14d',    d?.rsi != null ? d.rsi.toFixed(1) : '—'],
        ['Momentum',     fpct(d?.momentum_score)],
        ['Volatility',   fpct(d?.volatility_score)],
        ['Sentiment',    fn2(d?.sentiment_score)],
        ['Quality',      fpct(d?.quality_score)],
        ['Valuation',    fpct(d?.valuation_score)],
    ];

    return (
        <SectionCard id="section-fundamentals" eyebrow="Financials" title="Fundamentals" status={status} retry={retry}>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '18px 28px'}}>
                {cells.map(([k, v]) => (
                    <div key={k}>
                        <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{k}</div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 500, color: v === '—' ? 'var(--ink-40)' : 'var(--ink-00)', marginTop: 5, letterSpacing: '-0.015em'}}>{v}</div>
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}

/* ── TechnicalSection ─────────────────────────────────────────── */
function TechnicalSection({ticker, allRecs, onNavigateRecs}) {
    const [state, setState] = useState(mkL());
    const [attempt, setAttempt] = useState(0);
    const [generating, setGenerating] = useState(false);
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        apiService.getAssetSignal(ticker)
            .then(d => setState(d ? mkD(d) : mkD(null)))
            .catch(e => setState(mkE(e)));
    }, [ticker, attempt]);

    const retry = useCallback(() => setAttempt(a => a + 1), []);

    const handleGenerate = useCallback(() => {
        if (generating) return;
        setGenerating(true);
        apiService.runSingleAI(ticker)
            .then(() => setAttempt(a => a + 1))
            .catch(() => setAttempt(a => a + 1))
            .finally(() => setGenerating(false));
    }, [ticker, generating]);

    const sig = state.data;
    const isEmpty = !sig || !sig.signal_type;
    const status = state.loading ? 'loading' : state.error ? 'error' : isEmpty ? 'empty' : 'ok';

    const act = sig?.signal_type || 'HOLD';
    const bs = {
        BUY:  {bg: 'rgba(111,174,136,0.10)', border: 'rgba(111,174,136,0.25)', col: 'var(--sage-500)'},
        SELL: {bg: 'rgba(209,107,107,0.10)', border: 'rgba(209,107,107,0.25)', col: 'var(--crimson-500)'},
        HOLD: {bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', col: 'var(--ink-40)'},
    }[act] || {bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', col: 'var(--ink-40)'};

    const rsi  = sig?.rsi_14 ?? null;
    const conf = rsi != null ? Math.round(Math.min(100, Math.max(0, rsi))) : 50;
    const filled = Math.round(conf / 10);

    const genBtn = (
        <button disabled={generating} onClick={handleGenerate} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 6,
            background: generating ? 'transparent' : 'rgba(201,168,106,0.08)',
            border: '1px solid rgba(201,168,106,0.22)',
            color: generating ? 'var(--ink-40)' : 'var(--aurum-100)',
            fontSize: 11.5, fontFamily: 'var(--font-ui)', cursor: generating ? 'default' : 'pointer',
        }}>
            {generating ? <IcoSpin sz={11}/> : <IcoZap sz={12}/>}
            {generating ? 'Generating…' : 'Generate Signal'}
        </button>
    );

    const linked = sig?.linkedRec ? allRecs.find(r => r.id === sig.linkedRec) : null;
    const isOpen = expandedId === 'main';

    const fmtTs = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) + ' · ' + d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
    };

    return (
        <SectionCard
            id="section-technical" eyebrow="Analysis" title="Technical Analysis"
            status={status} retry={retry}
            meta={!isEmpty && status === 'ok' ? <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>1 signal</span> : null}
            action={genBtn}
        >
            <div style={{display: 'flex', flexDirection: 'column'}}>
                <div style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                    <div style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, padding: '11px 0', alignItems: 'start'}}>
                        <span style={{
                            padding: '2px 7px', borderRadius: 4, marginTop: 2,
                            background: bs.bg, border: `1px solid ${bs.border}`,
                            color: bs.col, fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', flexShrink: 0,
                        }}>{act}</span>
                        <div>
                            <div style={{fontSize: 12.5, color: 'var(--ink-10)', lineHeight: 1.5}}>{sig?.rationale || `RSI ${rsi != null ? rsi.toFixed(1) : '—'} — ${act} signal`}</div>
                            <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 5}}>
                                <div style={{display: 'flex', gap: 2}}>
                                    {Array.from({length: 10}, (_, i) => (
                                        <span key={i} style={{width: 8, height: 3, borderRadius: 1, background: i < filled ? 'var(--aurum-500)' : 'rgba(255,255,255,0.08)'}}/>
                                    ))}
                                </div>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>{conf}%</span>
                                <span style={{fontSize: 10, color: 'var(--ink-40)', padding: '1px 5px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase'}}>RSI</span>
                            </div>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0}}>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)'}}>{fmtTs(sig?.created_at)}</span>
                            {linked && (
                                <button onClick={() => setExpandedId(isOpen ? null : 'main')}
                                    style={{background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--ink-40)'}}>
                                    <IcoChevron sz={11} up={isOpen}/>
                                </button>
                            )}
                        </div>
                    </div>
                    {isOpen && linked && (
                        <div style={{marginLeft: 38, marginBottom: 9, padding: '9px 12px', background: 'rgba(201,168,106,0.06)', borderLeft: '2px solid rgba(201,168,106,0.22)', borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', gap: 10}}>
                            <div style={{flex: 1, minWidth: 0}}>
                                <div style={{fontSize: 12, color: 'var(--ink-10)', fontWeight: 500}}>{linked.title}</div>
                                <div style={{fontSize: 11, color: 'var(--aurum-100)', marginTop: 2, fontFamily: 'var(--font-mono)'}}>{linked.action} · {linked.impactOneLine}</div>
                            </div>
                            <button onClick={onNavigateRecs} className="du3-cta ghost" style={{padding: '0 10px', height: 26, fontSize: 11, flexShrink: 0}}>Apply →</button>
                        </div>
                    )}
                </div>
            </div>
            <div style={{paddingTop: 10, marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: 'var(--ink-40)'}}>
                Signals are inputs only — decisions surface in{' '}
                <button onClick={onNavigateRecs} className="du3-cta ghost" style={{padding: '0 4px', height: 'auto', fontSize: 11}}>Recommendations →</button>
            </div>
        </SectionCard>
    );
}

/* ── AITakeSection ────────────────────────────────────────────── */
function AITakeSection({ticker, rec, active, apply, openModal, aiRuns}) {
    const [state, setState] = useState(mkL());
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        apiService.getAITake(ticker)
            .then(d => setState(mkD(d)))
            .catch(e => setState(mkE(e)));
    }, [ticker, attempt]);

    const retry = useCallback(() => setAttempt(a => a + 1), []);
    const isEmpty = !state.data?.take;
    const status = state.loading ? 'loading' : state.error ? 'error' : isEmpty ? 'empty' : 'ok';

    const fmtT = (d) => new Date(d).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});

    return (
        <SectionCard id="section-ai" eyebrow="Aureon AI" title="AI Analysis" status={status} retry={retry}>
            {/* AI take text */}
            <div style={{marginBottom: rec ? 16 : 0}}>
                <div style={{fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 10}}>Analysis</div>
                <p style={{fontSize: 13.5, color: 'var(--ink-10)', lineHeight: 1.65, letterSpacing: '-0.005em', margin: 0}}>
                    {state.data?.take}
                </p>
            </div>

            {/* Active recommendation */}
            {rec && (
                <div style={{marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 10}}>Active recommendation</div>
                    <DecisionUnit
                        rec={rec} activeIds={active}
                        onCommit={apply} onUndo={() => {}} onResolveConflict={() => {}}
                        openModal={openModal}
                    />
                </div>
            )}

            {/* Session AI runs */}
            {aiRuns && aiRuns.length > 0 && (
                <div style={{marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                    <div style={{fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 9}}>
                        Session runs · {aiRuns.length}
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 7}}>
                        {aiRuns.slice().reverse().map((r) => (
                            <div key={r.id} style={{padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', gap: 10}}>
                                <span style={{padding: '2px 8px', borderRadius: 4, fontSize: 9.5, fontFamily: 'var(--font-mono)', color: r.color, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600, background: r.bg || 'rgba(255,255,255,0.04)', border: '1px solid ' + (r.border || 'rgba(255,255,255,0.10)'), flexShrink: 0}}>{r.tone}</span>
                                <div style={{flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--ink-10)', lineHeight: 1.5}}>{r.text}</div>
                                {r.confidence != null && <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', flexShrink: 0, whiteSpace: 'nowrap'}}>{Math.round(r.confidence * 100)}%</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Generated at */}
            {state.data?.generated_at && (
                <div style={{marginTop: 10, fontSize: 10.5, color: 'var(--ink-40)', fontFamily: 'var(--font-mono)'}}>
                    Generated {fmtT(state.data.generated_at)}
                </div>
            )}
        </SectionCard>
    );
}

/* ── NewsSection ──────────────────────────────────────────────── */
function NewsSection({ticker}) {
    const [state, setState] = useState(mkL());
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        apiService.fetchNewsForSymbol(ticker)
            .then(d => setState(mkD(Array.isArray(d) ? d : [])))
            .catch(e => setState(mkE(e)));
    }, [ticker, attempt]);

    const retry = useCallback(() => setAttempt(a => a + 1), []);
    const items = state.data || [];
    const isEmpty = !state.loading && !state.error && items.length === 0;
    const status = state.loading ? 'loading' : state.error ? 'error' : isEmpty ? 'empty' : 'ok';

    const sentCol = {
        positive: 'var(--sage-500)',
        negative: 'var(--crimson-500)',
        neutral: 'var(--ink-40)',
    };

    const getSentiment = (score) => {
        if (score == null) return 'unassessed';
        if (score > 0.1)  return 'positive';
        if (score < -0.1) return 'negative';
        return 'neutral';
    };

    const fmtAgo = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
    };

    return (
        <SectionCard
            id="section-news" eyebrow="Market" title="News" status={status} retry={retry}
            meta={status === 'ok' ? <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>{items.length} article{items.length !== 1 ? 's' : ''}</span> : null}
        >
            <div style={{display: 'flex', flexDirection: 'column'}}>
                {items.map((item, i) => {
                    const sent = getSentiment(item.sentiment_score);
                    return (
                        <div key={item.id || i} style={{padding: '12px 0', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', alignItems: 'flex-start', gap: 12}}>
                            <div style={{flex: 1, minWidth: 0}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap'}}>
                                    {item.source && <span style={{fontSize: 11, color: 'var(--ink-40)'}}>{item.source} · {fmtAgo(item.published_at)}</span>}
                                </div>
                                <div style={{fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.5, letterSpacing: '-0.005em'}}>{item.title}</div>
                                {item.summary && (
                                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4, lineHeight: 1.5}}>{item.summary}</div>
                                )}
                            </div>
                            <span
                                title={sent === 'unassessed' ? 'Sentiment not assessed' : undefined}
                                style={sent === 'unassessed'
                                    ? {width: 6, height: 6, borderRadius: 999, flexShrink: 0, marginTop: 6, background: 'transparent', border: '1px solid var(--ink-40)', boxSizing: 'border-box'}
                                    : {width: 6, height: 6, borderRadius: 999, flexShrink: 0, marginTop: 6, background: sentCol[sent]}}
                            />
                        </div>
                    );
                })}
            </div>
        </SectionCard>
    );
}

/* ── ThemesSection ────────────────────────────────────────────── */
function ThemesSection({ticker, navigate}) {
    const [state, setState] = useState(mkL());
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        apiService.getThemesForSymbol(ticker)
            .then(d => setState(mkD(Array.isArray(d) ? d : [])))
            .catch(e => setState(mkE(e)));
    }, [ticker, attempt]);

    const retry = useCallback(() => setAttempt(a => a + 1), []);
    const themes = state.data || [];
    const isEmpty = !state.loading && !state.error && themes.length === 0;
    const status = state.loading ? 'loading' : state.error ? 'error' : isEmpty ? 'empty' : 'ok';

    return (
        <SectionCard
            id="section-themes" eyebrow="Context" title="Related Themes" status={status} retry={retry}
            meta={<span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>{themes.length} related</span>}
        >
            <div style={{display: 'flex', flexDirection: 'column'}}>
                {themes.map((t, i) => {
                    const ret = t.ret1m ?? 0;
                    const trendCol = ret > 0 ? 'var(--sage-500)' : ret < 0 ? 'var(--crimson-500)' : 'var(--ink-40)';
                    const trendGlyph = ret > 0 ? '↑' : ret < 0 ? '↓' : '→';
                    return (
                        <button key={t.id} onClick={() => navigate('/markets/themes/' + t.id)}
                            style={{display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: i < themes.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', width: '100%', transition: 'opacity 120ms'}}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.70'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                            <div style={{flex: 1, minWidth: 0}}>
                                <div style={{fontSize: 13.5, color: 'var(--ink-00)', fontWeight: 500}}>{t.name}</div>
                                {t.desc && <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>{t.desc}</div>}
                            </div>
                            <span style={{fontSize: 11, color: trendCol, fontFamily: 'var(--font-mono)', width: 60, textAlign: 'right', flexShrink: 0}}>
                                {trendGlyph} {(Math.abs(ret) * 100).toFixed(1)}%
                            </span>
                            <IcoExternal sz={10}/>
                        </button>
                    );
                })}
            </div>
        </SectionCard>
    );
}

/* ── Period map ───────────────────────────────────────────────── */
const PERIOD_DAYS = {'1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'ALL': 1825};

/* ── AssetDetail (main) ───────────────────────────────────────── */
export default function AssetDetail() {
    const fmt = useFmtMoney();
    const {ticker} = useParams();
    const navigate = useNavigate();
    const {allRecs, active, apply} = useApp();
    const {holdings, classLabel, netWorth, loading: holdingsLoading} = useAureonData();
    const v4 = useV4();
    const aiRuns = (v4?.aiRuns && v4.aiRuns[ticker]) || [];
    const [modal, setModal] = useState(null);
    const [period, setPeriod] = useState('1M');
    const [chartSeries, setChartSeries] = useState(null);
    const [assetState, setAssetState] = useState(mkL());
    const [refreshing, setRefreshing] = useState(false);
    const [backfilling, setBackfilling] = useState(false);
    const [generating, setGenerating] = useState(false);

    const h = holdings.find(x => x.ticker === ticker);

    /* Load main asset data */
    useEffect(() => {
        apiService.fetchAureonAsset(ticker)
            .then(d => setAssetState(d ? mkD(d) : mkE('Asset not found')))
            .catch(e => setAssetState(mkE(e)));
    }, [ticker]);

    const currency = h?.currency || assetState.data?.currency || 'USD';

    /* Load chart data */
    useEffect(() => {
        apiService.fetchChartData(ticker, PERIOD_DAYS[period] ?? 30)
            .then(d => setChartSeries(d?.length ? d.map(c => c.close) : null))
            .catch(() => {});
    }, [ticker, period]);

    /* Derive display asset: prefer portfolio holding, then API data */
    const raw = assetState.data;
    const displayAsset = h
        ? h
        : raw
        ? {
            ticker: raw.ticker || ticker,
            name:   raw.name   || ticker,
            class:  raw.class  || 'stocks',
            tier:   null,
            price:  raw.currentPrice ?? raw.price ?? 0,
            dayPct: raw.dayPct ?? null,
            sector: raw.sector || null,
            cost: 0, qty: 0, beta: null, spark: raw.spark || [],
          }
        : null;

    /* Page-level loading / not-found states */
    if (assetState.loading && !h && (holdingsLoading || !displayAsset)) {
        return (
            <>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 14, opacity: 0.4}}>
                    <span>Assets</span><span>/</span><span>···</span>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 22}}>
                    <div style={{width: 48, height: 48, borderRadius: 10, background: 'rgba(255,255,255,0.06)'}}/>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                        <div style={{width: 180, height: 18, borderRadius: 4, background: 'rgba(255,255,255,0.07)', animation: 'pulse 1.2s ease-in-out infinite'}}/>
                        <div style={{width: 280, height: 13, borderRadius: 4, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.2s ease-in-out infinite 0.15s'}}/>
                    </div>
                </div>
                <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
            </>
        );
    }

    if (!displayAsset) {
        return (
            <div style={{padding: 40, color: 'var(--ink-30)'}}>
                Asset not found.{' '}
                <button className="du3-cta ghost" onClick={() => navigate('/assets')}>Back to assets</button>
            </div>
        );
    }

    const series = chartSeries ?? (displayAsset.spark?.length ? displayAsset.spark : null);
    const v      = h ? valueOf(h) : 0;
    const pl     = h ? plOf(h) : 0;
    const plPct  = h ? plPctOf(h) : 0;
    // netWorth is INR-normalized (useAureonData); v is in h's native currency,
    // so the weight ratio needs v converted to the same base before dividing.
    const wt     = h && netWorth > 0 ? valueOfBase(h, v4?.fxRates) / netWorth : 0;
    const rec    = allRecs.find(r => r.scope?.kind === 'asset' && r.scope.ref === ticker && active.includes(r.id));
    const openModal = (r, onConfirm) => setModal({rec: r, onConfirm});

    const handleGenerateSignal = () => {
        if (generating) return;
        setGenerating(true);
        apiService.runSingleAI(ticker)
            .catch(() => {})
            .finally(() => setGenerating(false));
    };

    const handleRefresh = () => {
        if (refreshing) return;
        setRefreshing(true);
        apiService.refreshMarket()
            .catch(() => {})
            .finally(() => setRefreshing(false));
    };

    const handleBackfill = () => {
        if (backfilling) return;
        setBackfilling(true);
        apiService.triggerBackfill(ticker)
            .catch(() => {})
            .finally(() => setBackfilling(false));
    };

    /* ── Header action buttons ─────────────────────────────────── */
    const headerActions = (
        <div style={{display: 'flex', flexDirection: 'column', gap: 6, minWidth: 208}}>
            <button disabled={generating} onClick={handleGenerateSignal}
                style={{display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 14px', borderRadius: 7, width: '100%', justifyContent: 'flex-start', background: generating ? 'transparent' : 'rgba(201,168,106,0.08)', border: '1px solid rgba(201,168,106,0.22)', color: generating ? 'var(--ink-40)' : 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: generating ? 'default' : 'pointer', fontWeight: 500}}>
                {generating ? <IcoSpin sz={12}/> : <IcoZap sz={13}/>}
                {generating ? 'Generating…' : 'Generate Signal'}
            </button>
            <button disabled={refreshing} onClick={handleRefresh}
                style={{display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 14px', borderRadius: 7, width: '100%', justifyContent: 'flex-start', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: refreshing ? 'var(--ink-40)' : 'var(--ink-20)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: refreshing ? 'default' : 'pointer', fontWeight: 500}}>
                {refreshing ? <IcoSpin sz={12}/> : <IcoRefresh sz={13}/>}
                {refreshing ? 'Refreshing…' : 'Refresh Market Data'}
            </button>
            <button disabled={backfilling} onClick={handleBackfill}
                style={{display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 14px', borderRadius: 7, width: '100%', justifyContent: 'flex-start', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: backfilling ? 'var(--ink-40)' : 'var(--ink-20)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: backfilling ? 'default' : 'pointer', fontWeight: 500}}>
                {backfilling ? <IcoSpin sz={12}/> : <IcoHistory sz={13}/>}
                {backfilling ? 'Queuing…' : 'Trigger Historical Backfill'}
            </button>
        </div>
    );

    return (
        <>
            {/* ── Breadcrumb ─────────────────────────────────────── */}
            <div style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 14}}>
                <button onClick={() => navigate('/assets')} className="du3-cta ghost" style={{padding: '2px 6px', height: 'auto', fontSize: 11.5}}>Assets</button>
                <span>/</span>
                <button onClick={() => navigate('/assets')} className="du3-cta ghost" style={{padding: '2px 6px', height: 'auto', fontSize: 11.5}}>{classLabel[displayAsset.class] || displayAsset.class}</button>
                <span>/</span>
                <span style={{color: 'var(--ink-10)', fontFamily: 'var(--font-mono)'}}>{displayAsset.ticker}</span>
            </div>

            {/* ── Asset header ───────────────────────────────────── */}
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 22, flexWrap: 'wrap'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 14, minWidth: 0}}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em',
                    }}>{displayAsset.ticker.slice(0, 4)}</div>
                    <div style={{minWidth: 0}}>
                        <div style={{display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap'}}>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{displayAsset.ticker}</span>
                            <TierChip tier={displayAsset.tier}/>
                            {!h && (
                                <span style={{display: 'inline-block', background: 'rgba(122,168,212,0.10)', border: '1px solid rgba(122,168,212,0.25)', borderRadius: 999, padding: '3px 10px', color: 'var(--azure-500,#7AA8D4)', fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase'}}>Not in portfolio</span>
                            )}
                        </div>
                        {displayAsset.name !== displayAsset.ticker && (
                            <div style={{fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600, color: 'var(--ink-10)', letterSpacing: '-0.01em', marginTop: 2}}>{displayAsset.name}</div>
                        )}
                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 4}}>
                            {classLabel[displayAsset.class] || displayAsset.class}{displayAsset.sector ? ` · ${displayAsset.sector}` : ''}
                        </div>
                    </div>
                </div>
                <div style={{flex: 1, minWidth: 80}}/>
                <div style={{textAlign: 'left'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                        <Eyebrow>Last price</Eyebrow>
                        {displayAsset.priceSource === 'epf_estimated' && <EpfEstimateBadge basis={displayAsset.epfEstimateBasis}/>}
                    </div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, lineHeight: 1, letterSpacing: '-0.015em'}}>
                        {fmt(displayAsset.price, currency, {dp: 2})}
                    </div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: (isFutures(displayAsset) || displayAsset.dayPct == null) ? 'var(--ink-50)' : displayAsset.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', marginTop: 6}}>
                        {(isFutures(displayAsset) || displayAsset.dayPct == null) ? '—' : `${displayAsset.dayPct >= 0 ? '▲' : '▼'} ${(Math.abs(displayAsset.dayPct) * 100).toFixed(2)}% today`}
                    </div>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start', minWidth: 150}}>
                    {headerActions}
                </div>
            </div>

            {/* ── Overview ─────────────────────────────────────────── */}
            <div style={{marginBottom: 20}}>
                <Eyebrow>Overview</Eyebrow>

                {displayAsset.tier !== 'passive' && series && (
                    <section className="layer-1" style={{padding: '14px 18px 4px', marginTop: 10}}>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
                            <div>
                                <div style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)'}}>Price · {period}</div>
                                {h && <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 3}}>Markers show prior decisions applied to this position</div>}
                            </div>
                            <div style={{display: 'flex', gap: 0}}>
                                {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map(p => (
                                    <button key={p} onClick={() => setPeriod(p)} style={{padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', background: p === period ? 'rgba(201,168,106,0.12)' : 'transparent', color: p === period ? 'var(--aurum-100)' : 'var(--ink-30)', border: 'none', cursor: 'pointer', borderRadius: 4}}>{p}</button>
                                ))}
                            </div>
                        </div>
                        <PriceChart series={series} height={200}/>
                    </section>
                )}

                {h ? (
                    <section className="layer-1" style={{padding: '14px 18px', marginTop: 12}}>
                        <Eyebrow>Position</Eyebrow>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 24, marginTop: 12}}>
                            {[
                                ['Quantity',   h.qty.toLocaleString(undefined, {maximumFractionDigits: 4})],
                                ['Avg cost',   fmt(h.cost, currency, {dp: 2})],
                                ['Value',      fmt(v, currency, {dp: 0})],
                                ['Unreal P/L', h.cost > 0 ? (pl >= 0 ? '+' : '−') + fmt(Math.abs(pl), currency, {dp: 0}) + ' · ' + (plPct >= 0 ? '+' : '−') + (Math.abs(plPct) * 100).toFixed(1) + '%' : '—'],
                                ['Weight',     netWorth > 0 ? (wt * 100).toFixed(2) + '%' : '—'],
                            ].map(([k, val], i) => (
                                <div key={k}>
                                    <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{k}</div>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 500, color: i === 3 && pl < 0 ? 'var(--crimson-500)' : i === 3 && pl >= 0 && h.cost > 0 ? 'var(--sage-500)' : 'var(--ink-00)', marginTop: 5, letterSpacing: '-0.01em'}}>{val}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : (
                    <section className="layer-1" style={{padding: '13px 18px', marginTop: 12, display: 'flex', alignItems: 'center', gap: 10}}>
                        <div style={{flex: 1, fontSize: 13, color: 'var(--ink-30)'}}>This asset is not in your portfolio.</div>
                        <button className="du3-cta ghost">Add to Watchlist</button>
                        <button onClick={() => navigate('/transactions')} style={{height: 32, padding: '0 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500, background: 'rgba(201,168,106,0.14)', border: '1px solid rgba(201,168,106,0.35)', color: 'var(--aurum-100)'}}>Buy / Record</button>
                    </section>
                )}
            </div>

            <div style={{height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 20}}/>

            {/* ── Independent section cards (key=ticker forces remount on navigation) ── */}
            <QuoteSection key={'q-' + ticker} ticker={ticker} price={displayAsset.price}/>
            <FundamentalsSection key={'f-' + ticker} ticker={ticker}/>
            <TechnicalSection
                key={'t-' + ticker}
                ticker={ticker}
                allRecs={allRecs}
                onNavigateRecs={() => navigate('/recommendations')}
            />
            <AITakeSection
                key={'ai-' + ticker}
                ticker={ticker}
                rec={rec}
                active={active}
                apply={apply}
                openModal={openModal}
                aiRuns={aiRuns}
            />
            <NewsSection key={'n-' + ticker} ticker={ticker}/>
            <ThemesSection key={'th-' + ticker} ticker={ticker} navigate={navigate}/>

            <div style={{height: 40}}/>

            {modal && (
                <ActionConfirmationModal
                    rec={modal.rec}
                    onCancel={() => setModal(null)}
                    onConfirm={() => { modal.onConfirm?.(); setModal(null); }}
                />
            )}
        </>
    );
}
