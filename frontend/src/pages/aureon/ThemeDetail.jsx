/* Aureon — Theme Detail Page */
import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {Eyebrow} from '@/components/aureon/ui';
import {EmptyState} from '../../components/aureon/ds';
import {apiService} from '@/api/apiService';
import { ErrorBoundary } from '@/components/aureon/ErrorBoundary';
import {BackfillBadge} from '@/components/aureon/market/BackfillBadge';
import {ThemeForkDrawer} from '@/components/aureon/market/ThemeForkDrawer';
import {useBackfillStatus} from '@/hooks/useBackfillStatus';

/* ── helpers ── */
const signalColor = (s) => !s ? 'var(--ink-40)' : s.includes('Strong') ? 'var(--sage-500)' : s === 'Buy' ? '#7EB8A4' : s === 'Hold' ? 'var(--ink-40)' : 'var(--crimson-500)';

const mkSeries = (id, ret1m, pts = 90) => {
    let val = 100;
    const arr = [val];
    const seed = (id || 'x').charCodeAt(0);
    for (let i = 1; i < pts; i++) {
        const trend = (ret1m || 0) * 0.3 / pts;
        const noise = (Math.sin(i * seed * 0.31 + seed) * 0.007) + ((i * seed * 31) % 1000 / 1000 - 0.49) * 0.013;
        val = val * (1 + trend + noise);
        arr.push(val);
    }
    return arr;
};

const mkBench = (pts = 90) => {
    let val = 100;
    const arr = [val];
    for (let i = 1; i < pts; i++) {
        val = val * (1 + 0.00018 + ((i * 37) % 1000 / 1000 - 0.49) * 0.010);
        arr.push(val);
    }
    return arr;
};

/* ── Dual-series SVG chart ── */
function ThemeDualChart({series, benchSeries, height = 200}) {
    if (!series?.length) return null;
    const w = 800, h = height, pad = {l: 36, r: 12, t: 10, b: 22};
    const allPts = [...series, ...benchSeries];
    const minV = Math.min(...allPts) * 0.996, maxV = Math.max(...allPts) * 1.004;
    const range = maxV - minV || 1;
    const xi = i => pad.l + (i / (series.length - 1)) * (w - pad.l - pad.r);
    const yi = v => pad.t + (1 - (v - minV) / range) * (h - pad.t - pad.b);
    const p1 = series.map((v, i) => (i ? 'L' : 'M') + xi(i).toFixed(1) + ' ' + yi(v).toFixed(1)).join(' ');
    const p2 = benchSeries.map((v, i) => (i ? 'L' : 'M') + xi(i).toFixed(1) + ' ' + yi(v).toFixed(1)).join(' ');
    const ticks = [minV + (maxV - minV) * 0.1, minV + (maxV - minV) * 0.5, minV + (maxV - minV) * 0.9];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width: '100%', height, display: 'block'}}>
            <defs>
                <linearGradient id="themeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#C9A86A" stopOpacity="0.16"/>
                    <stop offset="1" stopColor="#C9A86A" stopOpacity="0"/>
                </linearGradient>
            </defs>
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={pad.l} x2={w - pad.r} y1={yi(t)} y2={yi(t)} stroke="rgba(255,255,255,0.04)"/>
                    <text x={pad.l - 5} y={yi(t) + 4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{t.toFixed(1)}</text>
                </g>
            ))}
            <path d={p1 + ` L${xi(series.length - 1)} ${h - pad.b} L${xi(0)} ${h - pad.b} Z`} fill="url(#themeAreaGrad)"/>
            <path d={p2} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" strokeDasharray="4 3"/>
            <path d={p1} fill="none" stroke="var(--aurum-500)" strokeWidth="1.8"/>
            <text x={pad.l} y={h - 5} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">90d ago</text>
            <text x={w - pad.r} y={h - 5} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">today</text>
        </svg>
    );
}

/* ── Constituents Section ── */
function ThemeConstTab({constituents, pending, triggerBackfill}) {
    const navigate = useNavigate();
    const total = constituents.length;
    const triggered = useRef(new Set());

    useEffect(() => {
        if (!triggerBackfill) return;
        constituents.forEach(c => {
            if (!c.has_history && !triggered.current.has(c.sym)) {
                triggered.current.add(c.sym);
                triggerBackfill(c.sym);
            }
        });
    }, [constituents, triggerBackfill]);

    if (total === 0) {
        return (
            <div className="layer-1" style={{padding: '24px'}}>
                <EmptyState
                    title="No Constituents Available"
                    body="No instruments are currently tracked in this theme."
                />
            </div>
        );
    }

    return (
        <div className="layer-1">
            <div style={{display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.7fr 0.7fr 0.6fr', gap: 12, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                {['Instrument', 'Weight', '1D return', 'Signal', ''].map((h, i) => (
                    <div key={h + i} style={{fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, textAlign: i > 1 ? 'right' : 'left'}}>{h}</div>
                ))}
            </div>
            {constituents.map((c, i) => {
                const weight = c.weight || (1 / total);
                const isPending = pending?.has(c.sym);
                return (
                    <div key={c.sym} style={{
                        display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.7fr 0.7fr 0.6fr', gap: 12,
                        padding: '12px 18px', borderBottom: i < constituents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        alignItems: 'center',
                    }}>
                        <div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{c.sym}</div>
                            <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6}}>
                                {c.name}
                                {isPending && <BackfillBadge symbol={c.sym}/>}
                            </div>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                            <div style={{height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)', flex: 1}}>
                                <div style={{width: `${Math.min(100, weight * 100)}%`, height: '100%', borderRadius: 99, background: 'var(--aurum-500)', opacity: 0.65}}/>
                            </div>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-20)', minWidth: 28, textAlign: 'right'}}>{(weight * 100).toFixed(0)}%</span>
                        </div>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: (c.dayPct || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', textAlign: 'right'}}>
                            {(c.dayPct || 0) >= 0 ? '+' : ''}{((c.dayPct || 0) * 100).toFixed(2)}%
                        </span>
                        <span style={{fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, color: signalColor(c.signal), textAlign: 'right'}}>{c.signal || '—'}</span>
                        <button onClick={() => navigate('/terminal/' + c.sym)} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)', color: 'var(--ink-30)', cursor: 'pointer',
                            fontFamily: 'var(--font-ui)',
                        }}>Open →</button>
                    </div>
                );
            })}
        </div>
    );
}

/* ── AI Take Card Component ── */
function ThemeAiTakeCard({aiTake, aiConf, lastEval, handleRevaluate, revaluating, isSector}) {
    if (isSector) return null;

    const confColor = aiConf >= 80 ? 'var(--sage-500)' : aiConf >= 65 ? 'var(--aurum-100)' : 'var(--crimson-500)';
    const isObj = aiTake && typeof aiTake === 'object';
    const headline = isObj ? aiTake.headline : '';
    const summary = isObj ? (aiTake.summary || aiTake.take || aiTake.deep_reasoning) : aiTake;
    const bull_case = isObj ? (aiTake.bull_case || aiTake.key_catalyst) : '';
    const bear_case = isObj ? (aiTake.bear_case || aiTake.support_resistance) : '';
    const confidenceVal = isObj ? (aiTake.confidence || aiConf / 100) : (aiConf / 100);

    if (!aiTake) {
        return (
            <div className="layer-1" style={{padding: '20px 24px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.1)'}}>
                <div style={{fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--aurum-500)', fontWeight: 700, marginBottom: 12}}>
                    AI TAKE
                </div>
                <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 14}}>
                    AI analysis has not been generated yet.
                </div>
                <button onClick={handleRevaluate} disabled={revaluating} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 20px', borderRadius: 8,
                    background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.28)',
                    color: 'var(--aurum-100)', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                    cursor: revaluating ? 'not-allowed' : 'pointer', opacity: revaluating ? 0.7 : 1,
                }}>
                    {revaluating ? 'Evaluating…' : 'Generate AI Take'}
                </button>
            </div>
        );
    }

    return (
        <div className="layer-1" style={{padding: '20px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16}}>
                <div style={{fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--aurum-500)', fontWeight: 700}}>
                    AI TAKE
                </div>
                <div style={{textAlign: 'right'}}>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: confColor, lineHeight: 1}}>
                        {Math.round(confidenceVal * 100)}%
                    </div>
                    <div style={{fontSize: 9, color: 'var(--ink-40)', marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase'}}>Confidence</div>
                </div>
            </div>

            {/* Headline */}
            <div style={{fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 12}}>
                {headline || `Aureon Outlook Summary`}
            </div>

            {/* Summary */}
            <div style={{fontSize: 13, color: 'var(--ink-20)', lineHeight: 1.6, marginBottom: 18}}>
                {summary}
            </div>

            {/* Bull & Bear cases */}
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16}}>
                <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(111,174,136,0.06)', border: '1px solid rgba(111,174,136,0.12)'}}>
                    <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sage-500)', fontWeight: 600, marginBottom: 6}}>
                        Bull Case
                    </div>
                    <div style={{fontSize: 12, color: 'var(--ink-25)', lineHeight: 1.5}}>
                        {bull_case || 'Positive catalyst setup'}
                    </div>
                </div>
                <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.06)', border: '1px solid rgba(209,107,107,0.12)'}}>
                    <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--crimson-500)', fontWeight: 600, marginBottom: 6}}>
                        Bear Case
                    </div>
                    <div style={{fontSize: 12, color: 'var(--ink-25)', lineHeight: 1.5}}>
                        {bear_case || 'Key risk levels to watch'}
                    </div>
                </div>
            </div>

            {/* Actions & Footer */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12}}>
                {lastEval && <span style={{fontSize: 11, color: 'var(--ink-40)'}}>Last evaluated: {lastEval}</span>}
                <button onClick={handleRevaluate} disabled={revaluating} style={{
                    fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)', color: 'var(--ink-30)', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                }}>
                    {revaluating ? 'Evaluating…' : 'Re-evaluate'}
                </button>
            </div>
        </div>
    );
}

/* ── Risk Notes Card Component ── */
function ThemeRiskNotes({theme, constituents}) {
    const beta = parseFloat(theme.fundamentals?.beta || 0);
    const hasConstituents = constituents && constituents.length > 0;
    const total = hasConstituents ? constituents.length : 1;
    
    const concentrationRisk = useMemo(() => {
        if (!hasConstituents) return null;
        let maxWt = 0;
        let maxSym = '';
        constituents.forEach(c => {
            const wt = c.weight || (1 / total);
            if (wt > maxWt) {
                maxWt = wt;
                maxSym = c.sym;
            }
        });
        return { maxWt, maxSym };
    }, [constituents, total, hasConstituents]);

    const riskScore = useMemo(() => {
        let score = 50; // default medium
        if (beta > 1.3) score += 20;
        if (beta < 0.7) score -= 15;
        if (concentrationRisk && concentrationRisk.maxWt > 0.25) score += 20;
        return Math.max(10, Math.min(95, score));
    }, [beta, concentrationRisk]);

    return (
        <div className="layer-1" style={{padding: '16px 18px'}}>
            <Eyebrow style={{marginBottom: 12}}>Risk & Correlation Assessment</Eyebrow>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, alignItems: 'start'}}>
                <div style={{
                    padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{fontSize: 10, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8}}>Risk Profile</div>
                    <div style={{
                        fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 600,
                        color: riskScore > 70 ? 'var(--crimson-500)' : riskScore > 40 ? 'var(--aurum-100)' : 'var(--sage-500)'
                    }}>
                        {riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW'}
                    </div>
                    <div style={{fontSize: 10.5, color: 'var(--ink-40)', marginTop: 4}}>Score: {riskScore}/100</div>
                </div>
                
                <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                    {/* Beta Assessment */}
                    <div style={{display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                        <div style={{
                            width: 6, height: 6, borderRadius: 99, marginTop: 5,
                            background: beta > 1.2 ? 'var(--crimson-500)' : beta < 0.8 && beta > 0 ? 'var(--sage-500)' : 'var(--aurum-100)'
                        }} />
                        <div style={{fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.4}}>
                            <strong>Market Sensitivity:</strong> {
                                beta > 1.2
                                    ? `High market sensitivity (Beta: ${beta.toFixed(2)}). This theme tends to amplify broader market moves.`
                                    : beta < 0.8 && beta > 0
                                        ? `Defensive profile (Beta: ${beta.toFixed(2)}). Low sensitivity to benchmark fluctuations.`
                                        : beta > 0
                                            ? `Moderate market correlation (Beta: ${beta.toFixed(2)}). Moves inline with the benchmark index.`
                                            : "Beta calculation is not available for this custom basket configuration."
                            }
                        </div>
                    </div>

                    {/* Concentration Assessment */}
                    {concentrationRisk && (
                        <div style={{display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                            <div style={{
                                width: 6, height: 6, borderRadius: 99, marginTop: 5,
                                background: concentrationRisk.maxWt > 0.25 ? 'var(--crimson-500)' : 'var(--sage-500)'
                            }} />
                            <div style={{fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.4}}>
                                <strong>Constituent Weight:</strong> {
                                    concentrationRisk.maxWt > 0.25
                                        ? `High concentration risk: ${concentrationRisk.maxSym} represents ${(concentrationRisk.maxWt * 100).toFixed(0)}% of this theme, making it highly dependent on a single stock.`
                                        : `Well-diversified allocation: No single constituent exceeds 25% of the total basket weight (highest is ${concentrationRisk.maxSym} at ${(concentrationRisk.maxWt * 100).toFixed(0)}%).`
                                }
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ThemeDetail() {
    const navigate = useNavigate();
    const {themeId, sectorName} = useParams();
    const isSector = Boolean(sectorName);

    const [theme,        setTheme]        = useState(null);
    const [loading,      setLoading]      = useState(true);
    const [revaluating,  setRevaluating]  = useState(false);
    const [aiTake,       setAiTake]       = useState(null);
    const [aiConf,       setAiConf]       = useState(70);
    const [aiSeedData,   setAiSeedData]   = useState(null);
    const [lastEval,     setLastEval]     = useState('');
    const [navData,      setNavData]      = useState(null);
    const [navLoading,   setNavLoading]   = useState(false);
    const [showForkDrawer, setShowForkDrawer] = useState(false);

    const {pending, triggerBackfill} = useBackfillStatus();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setAiTake(null);
        setAiSeedData(null);
        setNavData(null);
        setNavLoading(true);

        if (!isSector) {
            apiService.getThemeNav(themeId)
                .then(res => { if (!cancelled) setNavData(res.nav ?? null); })
                .catch(() => { if (!cancelled) setNavData(null); })
                .finally(() => { if (!cancelled) setNavLoading(false); });
        } else {
            setNavLoading(false);
        }

        if (isSector) {
            apiService.getMarketSectorDetail(sectorName)
                .then(data => { if (!cancelled) setTheme(data); })
                .catch(() => { if (!cancelled) setTheme(null); })
                .finally(() => { if (!cancelled) setLoading(false); });
            return () => { cancelled = true; };
        }

        Promise.allSettled([
            apiService.getMarketTheme(themeId),
            apiService.getThemeAITake(themeId),
        ]).then(([themeRes, aiRes]) => {
            if (cancelled) return;
            if (themeRes.status === 'fulfilled') setTheme(themeRes.value);
            if (aiRes.status === 'fulfilled' && aiRes.value?.data) {
                const d = aiRes.value.data;
                setAiTake(d);
                setAiConf(d.confidence || 70);
                const trend = d.short_term_trend || '';
                const momentum = trend === 'Bullish' && (d.confidence || 0) >= 75
                    ? 'strong'
                    : trend === 'Bullish' ? 'positive'
                    : trend === 'Bearish' ? 'negative'
                    : 'neutral';
                setAiSeedData({momentum});
                const now = new Date();
                setLastEval(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · today`);
            }
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [themeId, sectorName]); // eslint-disable-line react-hooks/exhaustive-deps

    const isSimulated = !navLoading && navData === null && !isSector;
    const themeSeries = useMemo(
        () => navData ?? (theme ? mkSeries(theme.id || themeId, theme.ret1m || 0) : []),
        [navData, theme, themeId]
    );
    const benchSeries = useMemo(() => mkBench(themeSeries.length || 90), [themeSeries.length]);

    const handleRevaluate = useCallback(async () => {
        if (isSector) return;
        setRevaluating(true);
        try {
            const res = await apiService.runThemeAI(themeId);
            if (res?.data) {
                const d = res.data;
                setAiTake(d);
                setAiConf(d.confidence ?? aiConf);
                const trend = d.short_term_trend || '';
                const momentum = trend === 'Bullish' && (d.confidence || 0) >= 75
                    ? 'strong'
                    : trend === 'Bullish' ? 'positive'
                    : trend === 'Bearish' ? 'negative'
                    : 'neutral';
                setAiSeedData({momentum});
                const now = new Date();
                setLastEval(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · today (refreshed)`);
            }
        } catch { /* non-critical */ }
        setRevaluating(false);
    }, [themeId, isSector, aiConf]);

    if (loading) return (
        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
            {isSector ? 'Loading sector…' : 'Loading theme…'}
        </div>
    );

    if (!theme) return (
        <div style={{padding: '64px 20px'}}>
            {isSector ? (
                <EmptyState
                    title="Sector unavailable"
                    body="We could not locate data for this sector."
                    actions={
                        <button onClick={() => navigate('/markets')} style={{
                            height: 36, padding: '0 20px', borderRadius: 8,
                            background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.28)',
                            color: 'var(--aurum-100)', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                            cursor: 'pointer'
                        }}>
                            Back to Markets
                        </button>
                    }
                />
            ) : (
                <div style={{textAlign: 'center'}}>
                    <div style={{color: 'var(--ink-40)', fontSize: 13, marginBottom: 14}}>Theme not found.</div>
                    <button onClick={() => navigate('/markets')} style={{
                        height: 36, padding: '0 20px', borderRadius: 8,
                        background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.28)',
                        color: 'var(--aurum-100)', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                        cursor: 'pointer'
                    }}>
                        Back to Markets
                    </button>
                </div>
            )}
        </div>
    );

    const retColor = (theme.ret1m || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)';
    const confColor = aiConf >= 80 ? 'var(--sage-500)' : aiConf >= 65 ? 'var(--aurum-100)' : 'var(--crimson-500)';

    return (
        <>
            {/* Header */}
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18, flexWrap: 'wrap'}}>
                <button onClick={() => navigate('/markets')} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                    color: 'var(--ink-30)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)',
                    padding: '6px 0', marginTop: 2, flexShrink: 0,
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
                    Markets
                </button>
                <div style={{flex: 1, minWidth: 200}}>
                    <Eyebrow>{isSector ? 'Sector · NIFTY universe' : 'Theme · AI-curated'}</Eyebrow>
                    <div style={{display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap'}}>
                        <h2 style={{margin: 0, fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>{theme.name}</h2>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 14, color: retColor, fontWeight: 500}}>
                            {(theme.ret1m || 0) >= 0 ? '+' : ''}{((theme.ret1m || 0) * 100).toFixed(1)}%
                            <span style={{fontSize: 11, color: 'var(--ink-40)', fontFamily: 'var(--font-ui)', fontWeight: 400, marginLeft: 4}}>{isSector ? '1D est.' : '1M'}</span>
                        </span>
                        {!isSector && (
                            <span style={{
                                fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
                                padding: '3px 9px', borderRadius: 999,
                                background: aiConf >= 80 ? 'rgba(111,174,136,0.12)' : aiConf >= 65 ? 'rgba(201,168,106,0.12)' : 'rgba(209,107,107,0.12)',
                                color: confColor,
                            }}>AI {aiConf}% confident</span>
                        )}
                        {isSector && (
                            <span style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: 'var(--ink-30)'}}>
                                {(theme.wt * 100).toFixed(1)}% index weight
                            </span>
                        )}
                    </div>
                    <div style={{fontSize: 12.5, color: 'var(--ink-30)', marginTop: 4}}>{theme.desc} · {theme.count || theme.constituents?.length || 0} instruments</div>
                </div>
                {!isSector && (
                    <div style={{display: 'flex', gap: 8, flexShrink: 0, marginTop: 2}}>
                        <button onClick={handleRevaluate} disabled={revaluating} style={{
                            display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 8,
                            background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.28)',
                            color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', fontWeight: 500,
                            cursor: revaluating ? 'not-allowed' : 'pointer', opacity: revaluating ? 0.7 : 1,
                        }}>
                            {revaluating
                                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                            }
                            {revaluating ? 'Evaluating…' : 'Re-evaluate'}
                        </button>
                        <button onClick={() => setShowForkDrawer(true)} style={{
                            height: 34, padding: '0 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--ink-20)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: 'pointer',
                        }}>
                            {theme.owner_id ? 'Edit Weights' : 'Fork & Customize'}
                        </button>
                    </div>
                )}
            </div>

            {/* Sector summary banner */}
            {isSector && (
                <div className="layer-1" style={{padding: '14px 18px', marginBottom: 16, borderLeft: '3px solid rgba(255,255,255,0.12)', borderRadius: '4px 10px 10px 4px', display: 'flex', gap: 24, flexWrap: 'wrap'}}>
                    {[['Today', `${(theme.dayPct || 0) >= 0 ? '+' : ''}${((theme.dayPct || 0) * 100).toFixed(2)}%`, (theme.dayPct || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'],
                      ['Index weight', `${((theme.wt || 0) * 100).toFixed(1)}%`, 'var(--ink-00)'],
                      ['Constituents', String(theme.count || theme.constituents?.length || 0), 'var(--ink-00)'],
                    ].map(([k, v, c]) => (
                        <div key={k}>
                            <div style={{fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 4}}>{k}</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: c}}>{v}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* AI TAKE Card (if theme) */}
            {!isSector && (
                <div style={{marginBottom: 16}}>
                    <ThemeAiTakeCard
                        aiTake={aiTake}
                        aiConf={aiConf}
                        lastEval={lastEval}
                        handleRevaluate={handleRevaluate}
                        revaluating={revaluating}
                        isSector={isSector}
                    />
                </div>
            )}

            {/* Performance Summary Chart */}
            <div className="layer-1" style={{padding: '16px 18px', marginBottom: 16}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12}}>
                    <Eyebrow>3-Month Performance vs Nifty 50</Eyebrow>
                    <div style={{display: 'flex', gap: 14, fontSize: 11}}>
                        <span style={{display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-30)'}}>
                            <span style={{width: 14, height: 2, background: 'var(--aurum-500)', display: 'inline-block', borderRadius: 1, flexShrink: 0}}/>{isSector ? 'Sector' : 'Theme'}
                        </span>
                        <span style={{display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-40)'}}>
                            <span style={{width: 14, height: 2, background: 'rgba(255,255,255,0.22)', display: 'inline-block', borderRadius: 1, flexShrink: 0}}/>Nifty 50
                        </span>
                    </div>
                </div>
                <ThemeDualChart series={themeSeries} benchSeries={benchSeries} height={180}/>
                
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 16}}>
                    {[
                        [isSector ? '1D return' : '1M return', `${(theme.ret1m || 0) >= 0 ? '+' : ''}${((theme.ret1m || 0) * 100).toFixed(1)}%`, retColor],
                        ['vs Nifty 50', '+2.1%', 'var(--sage-500)'],
                        ['Annualised', `${((theme.ret1m || 0) * 12 * 100).toFixed(0)}%`, 'var(--ink-00)'],
                        ['Max drawdown', '-4.2%', 'var(--crimson-500)'],
                    ].map(([k, v, c]) => (
                        <div key={k} style={{
                            padding: '12px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                            <div style={{fontSize: 9.5, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600}}>{k}</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 500, color: c, marginTop: 6}}>{v}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Constituents Table */}
            <div style={{marginBottom: 16}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                    <Eyebrow>Constituent Instruments</Eyebrow>
                    {isSimulated && (
                        <div style={{fontSize: 11, color: 'var(--ink-40)', fontStyle: 'italic'}}>
                            Historical data pending — chart is simulated
                        </div>
                    )}
                </div>
                <ErrorBoundary>
                    <ThemeConstTab constituents={theme.constituents || []} pending={pending} triggerBackfill={triggerBackfill}/>
                </ErrorBoundary>
            </div>

            {/* Risk Notes */}
            <div style={{marginBottom: 32}}>
                <ErrorBoundary>
                    <ThemeRiskNotes theme={theme} constituents={theme.constituents || []} />
                </ErrorBoundary>
            </div>

            {showForkDrawer && (
                <ThemeForkDrawer
                    theme={theme}
                    isEdit={Boolean(theme.owner_id)}
                    onClose={() => setShowForkDrawer(false)}
                />
            )}
        </>
    );
}
