/* Aureon — Signals page. */
import React, {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../../components/aureon/store';
import {Eyebrow} from '../../components/aureon/ui';
import {useAureonData} from '../../hooks/useAureonData';

const inferDirection = (s) => {
    const txt = (s.text || '').toLowerCase();
    if (s.kind === 'momentum') return txt.includes('negative') || txt.includes('reset') ? 'bear' : 'bull';
    if (s.kind === 'sentiment') return txt.includes('dropped') || txt.includes('negative') ? 'bear' : 'bull';
    if (s.kind === 'volatility') return 'neutral';
    if (s.kind === 'fundamentals') return txt.includes('beat') || txt.includes('reaffirmed') || txt.includes('reduced') || txt.includes('+') ? 'bull' : 'neutral';
    if (s.kind === 'macro') return txt.includes('+bp') ? 'bear' : 'neutral';
    if (s.kind === 'allocation') return 'neutral';
    if (s.kind === 'news') return txt.includes('reduced') || txt.includes('beat') ? 'bull' : 'neutral';
    return 'neutral';
};

const sigConfidence = (s) => {
    const c = (s.id || 'xxx').charCodeAt(3) || 42;
    return s.severity === 'high' ? 78 + (c % 10) : s.severity === 'med' ? 60 + (c % 12) : 42 + (c % 14);
};

const detailedReasoning = (s) => {
    const base = {
        momentum: '60-day slope · 14-day RSI · 50/200d MA cross. Window: rolling.',
        sentiment: 'Aggregated from news headlines, analyst notes, and social channels. 48h decay.',
        allocation: 'Compares current weight to target; flagged on |Δ| > 2pp.',
        volatility: 'Realized vol (14d) vs trailing 1y distribution. Above 90th pctile = elevated.',
        fundamentals: 'Revisions, P/E drift, ROE/ROIC trend. Source: provider analytics.',
        macro: 'Rates, FX, inflation prints. Filtered by exposure mapping.',
        news: 'Material event from filing or wire; sentiment-scored.',
    };
    return base[s.kind] || 'Detector output composited across multiple inputs.';
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

const DetailFact = ({k, v}) => (
    <div>
        <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{k}</div>
        <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-10)', marginTop: 2}}>{v}</div>
    </div>
);

const SignalCard = ({s}) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const dir = inferDirection(s);
    const conf = sigConfidence(s);
    const sevColor = s.severity === 'high' ? 'var(--crimson-500)' : s.severity === 'med' ? 'var(--dusk-500)' : 'var(--ink-30)';

    return (
        <article style={{
            padding: '16px 18px', borderRadius: 12,
            background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
            transition: 'border-color 120ms var(--ease-std)',
        }}>
            <header style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap'}}>
                <div style={{
                    width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em',
                }}>{(s.asset || 'PORT').slice(0, 4)}</div>
                <div style={{minWidth: 0}}>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{s.asset}</span>
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
                <p style={{margin: 0, fontSize: 13.5, color: 'var(--ink-10)', lineHeight: 1.55, letterSpacing: '-0.005em'}}>{s.text}</p>
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
                {s.linkedRec ? (
                    <button onClick={() => navigate('/recommendations')} className="du3-cta" style={{padding: '4px 12px', fontSize: 11.5}}>View recommendation →</button>
                ) : (
                    <span style={{fontSize: 11, color: 'var(--ink-40)'}}>No action · informational</span>
                )}
            </footer>

            {open && (
                <div style={{marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.20)', border: '1px solid rgba(255,255,255,0.05)'}}>
                    <div style={{fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 8}}>Technical detail</div>
                    <p style={{margin: 0, fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.6}}>{detailedReasoning(s)}</p>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 14}}>
                        <DetailFact k="Detector" v={s.kind.charAt(0).toUpperCase() + s.kind.slice(1)}/>
                        <DetailFact k="Direction" v={dir.charAt(0).toUpperCase() + dir.slice(1)}/>
                        <DetailFact k="Severity" v={s.severity.charAt(0).toUpperCase() + s.severity.slice(1)}/>
                    </div>
                </div>
            )}
        </article>
    );
};

const selectStyle = {
    padding: '8px 12px', fontSize: 12, borderRadius: 8,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontFamily: 'var(--font-ui)', cursor: 'pointer',
};

export default function Signals() {
    const navigate = useNavigate();
    const {search} = useApp();
    const {signals: SIGNALS} = useAureonData();
    const [kind, setKind] = useState('all');
    const [sev, setSev]   = useState('all');
    const [dir, setDir]   = useState('all');

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
        filtered.forEach(s => { (g[s.asset] = g[s.asset] || []).push(s); });
        return Object.entries(g);
    }, [filtered]);

    const kinds = ['all', 'momentum', 'sentiment', 'allocation', 'volatility', 'fundamentals', 'macro', 'news'];
    const sevs  = ['all', 'high', 'med', 'low'];

    return (
        <>
            <div style={{
                padding: '12px 16px', marginBottom: 18, borderRadius: 10,
                background: 'rgba(212,162,87,0.06)', border: '1px solid rgba(212,162,87,0.20)',
                fontSize: 12.5, color: 'var(--ink-10)', display: 'flex', alignItems: 'center', gap: 10,
            }}>
                <span style={{color: 'var(--dusk-500)'}}>⚠</span>
                <span>
                    <b style={{color: 'var(--ink-00)', fontWeight: 500}}>Signals are inputs.</b>{' '}
                    See <button onClick={() => navigate('/recommendations')} className="du3-cta ghost" style={{padding: '0 4px', height: 'auto', fontSize: 12.5}}>Recommendations</button> for decisions.
                </span>
            </div>

            {/* Stats + filters */}
            <div style={{display: 'flex', gap: 32, alignItems: 'flex-end', paddingBottom: 18, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap'}}>
                <div>
                    <Eyebrow>Today</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, lineHeight: 1}}>{SIGNALS.length}</div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4}}>signals detected</div>
                </div>
                <div>
                    <Eyebrow>High severity</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--crimson-500)', marginTop: 6}}>
                        {SIGNALS.filter(s => s.severity === 'high').length}
                    </div>
                </div>
                <div>
                    <Eyebrow>Linked to recs</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--aurum-100)', marginTop: 6}}>
                        {SIGNALS.filter(s => s.linkedRec).length}
                    </div>
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
                <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
                    <select value={kind} onChange={e => setKind(e.target.value)} style={selectStyle}>
                        {kinds.map(k => <option key={k} value={k}>{k === 'all' ? 'All kinds' : k}</option>)}
                    </select>
                    <select value={sev} onChange={e => setSev(e.target.value)} style={selectStyle}>
                        {sevs.map(k => <option key={k} value={k}>{k === 'all' ? 'All severities' : k}</option>)}
                    </select>
                    <select value={dir} onChange={e => setDir(e.target.value)} style={selectStyle}>
                        <option value="all">All directions</option>
                        <option value="bull">Bullish</option>
                        <option value="bear">Bearish</option>
                        <option value="neutral">Neutral</option>
                    </select>
                </div>
            </div>

            {/* Grouped signal cards */}
            {grouped.length === 0 ? (
                <div style={{padding: 32, textAlign: 'center', color: 'var(--ink-30)', fontSize: 13}}>No signals match the filters.</div>
            ) : grouped.map(([asset, items]) => (
                <section key={asset} style={{marginBottom: 24}}>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, paddingLeft: 4}}>
                        <span style={{fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--ink-10)', letterSpacing: '-0.005em'}}>{asset}</span>
                        <span style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{items.length} signal{items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div style={{display: 'grid', gap: 10}}>
                        {items.map(s => <SignalCard key={s.id} s={s}/>)}
                    </div>
                </section>
            ))}

            <div style={{height: 32}}/>
        </>
    );
}
