/* Aureon — SignalsTab: extracted verbatim from Decisions.jsx. Do NOT modify design. */
import React, {useMemo, useState} from 'react';
import {useApp} from '@/components/aureon/store';
import {useAureonData} from '@/hooks/useAureonData';
import {Eyebrow} from '@/components/aureon/ui';

/* ─── Signals helpers ───
 * direction and confidence are real fields from useAureonData().signals,
 * sourced from GET /signals/{symbol} (signal_type + a backend-computed
 * RSI-distance confidence — see AssetsService._signal_confidence). Neither
 * is inferred/guessed client-side. */

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
    const dir = s.direction ?? 'neutral';
    const conf = s.confidence ?? 0;
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

export default function SignalsTab() {
    const {search} = useApp();
    const {signals: SIGNALS} = useAureonData();
    const [kind, setKind] = useState('all');
    const [sev, setSev] = useState('all');
    const [dir, setDir] = useState('all');

    const filtered = useMemo(() => {
        let s = SIGNALS.slice();
        if (kind !== 'all') s = s.filter(x => x.kind === kind);
        if (sev  !== 'all') s = s.filter(x => x.severity === sev);
        if (dir  !== 'all') s = s.filter(x => (x.direction ?? 'neutral') === dir);
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
                        <span style={{color: 'var(--sage-500)'}}>{SIGNALS.filter(s => s.direction === 'bull').length}</span>
                        <span style={{color: 'var(--ink-40)', margin: '0 6px'}}>·</span>
                        <span style={{color: 'var(--crimson-500)'}}>{SIGNALS.filter(s => s.direction === 'bear').length}</span>
                    </div>
                </div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                    {/* TODO: 'sentiment'/'allocation'/'fundamentals'/'macro'/'news' have no
                        backing data source yet — useAureonData().signals only ever produces
                        'momentum'/'volatility' (from GET /signals/{symbol}, RSI-based). These
                        filter options are permanently empty until those kinds are implemented. */}
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
