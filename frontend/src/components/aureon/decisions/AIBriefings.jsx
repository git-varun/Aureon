import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '@/api/apiService';
import { useAureonData } from '@/hooks/useAureonData';
import { BRIEFING_TREND, ACTION_COLOR } from './constants';

const fmtDateTime = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
        }) + ' IST';
    } catch {
        return iso;
    }
};

const KEYFRAMES = `
@keyframes aureon-bf-spin { to { transform: rotate(360deg); } }
@keyframes aureon-bfpulse { 0%,100%{opacity:0.55} 50%{opacity:0.9} }
@keyframes aureon-cardEnter { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
`;

const PENDING_KEY = 'aureon.briefing.pendingSince';
const PENDING_STALE_MS = 90_000;

function getPendingSince() {
    try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        const startedAt = Number(raw);
        return Number.isFinite(startedAt) ? startedAt : null;
    } catch {
        return null;
    }
}

function isPendingFresh() {
    const startedAt = getPendingSince();
    return startedAt !== null && (Date.now() - startedAt) < PENDING_STALE_MS;
}

function setPendingMarker() {
    try { sessionStorage.setItem(PENDING_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}

function clearPendingMarker() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
}

function Spinner() {
    return (
        <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            style={{ animation: 'aureon-bf-spin 0.9s linear infinite', display: 'block' }}
        >
            <circle cx="12" cy="12" r="9" strokeDasharray="40 80" />
        </svg>
    );
}

function SkeletonCard() {
    const pulse = { animation: 'aureon-bfpulse 1.4s ease-in-out infinite', background: 'rgba(255,255,255,0.06)', borderRadius: 5 };
    return (
        <div className="layer-1" style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', padding: '15px 20px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ ...pulse, width: 80, height: 14 }} />
                <div style={{ ...pulse, width: 64, height: 14 }} />
                <div style={{ ...pulse, width: 48, height: 14 }} />
            </div>
            <div style={{ ...pulse, width: '100%', height: 13, marginBottom: 6 }} />
            <div style={{ ...pulse, width: '75%', height: 13 }} />
        </div>
    );
}

function BriefingFeedback({ generationId }) {
    const [rating, setRating] = useState(null);

    if (!generationId) return null;

    const rate = async (value) => {
        if (rating) return;
        setRating(value);
        try {
            await apiService.submitAiFeedback(generationId, value);
        } catch {
            setRating(null);
        }
    };

    return (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
            <button
                onClick={() => rate(1)}
                disabled={!!rating}
                title="Helpful"
                style={{
                    width: 22, height: 22, borderRadius: 5, border: '1px solid rgba(255,255,255,0.08)',
                    background: rating === 1 ? 'rgba(122,168,116,0.18)' : 'rgba(255,255,255,0.02)',
                    color: rating === 1 ? 'var(--sage-500)' : 'var(--ink-40)',
                    cursor: rating ? 'default' : 'pointer', fontSize: 11, lineHeight: 1,
                }}
            >👍</button>
            <button
                onClick={() => rate(-1)}
                disabled={!!rating}
                title="Not helpful"
                style={{
                    width: 22, height: 22, borderRadius: 5, border: '1px solid rgba(255,255,255,0.08)',
                    background: rating === -1 ? 'rgba(201,82,82,0.18)' : 'rgba(255,255,255,0.02)',
                    color: rating === -1 ? 'var(--crimson-500)' : 'var(--ink-40)',
                    cursor: rating ? 'default' : 'pointer', fontSize: 11, lineHeight: 1,
                }}
            >👎</button>
        </div>
    );
}

function DirectiveItem({ d, conflict }) {
    const [detailOpen, setDetailOpen] = useState(false);
    const actionColor = ACTION_COLOR[(d.action || '').toUpperCase()] || 'var(--ink-30)';
    const ns = d.news_sentiment || {};

    return (
        <div style={{
            borderRadius: 9, border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)', padding: '11px 13px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-00)' }}>
                    {d.symbol}
                </span>
                {d.action && (
                    <span style={{
                        fontSize: 10.5, padding: '2px 7px', borderRadius: 5, fontWeight: 600,
                        color: actionColor,
                        background: `color-mix(in oklab, ${actionColor} 12%, transparent)`,
                        border: `1px solid color-mix(in oklab, ${actionColor} 30%, transparent)`,
                    }}>
                        {d.action}
                    </span>
                )}
                {d.conviction_level != null && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)' }}>
                        Conviction {d.conviction_level}/5
                    </span>
                )}
                <div style={{ flex: 1 }} />
                {conflict && (
                    <span style={{
                        fontSize: 10.5, padding: '2px 7px', borderRadius: 5, fontWeight: 600,
                        color: 'var(--crimson-500)', background: 'rgba(201,82,82,0.10)',
                        border: '1px solid rgba(201,82,82,0.28)',
                    }} title={`Rule engine recommends ${conflict.recommendation_state}, AI directive says ${d.action}`}>
                        ⚠ Rule engine: {conflict.recommendation_state}
                    </span>
                )}
            </div>

            {d.the_why && (
                <p style={{ margin: '0 0 6px', fontSize: 12.5, color: 'var(--ink-10)', lineHeight: 1.55 }}>
                    {d.the_why}
                </p>
            )}

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--ink-30)' }}>
                {d.position_sizing && <span>{d.position_sizing}</span>}
                {d.financial_impact && <span>{d.financial_impact}</span>}
            </div>

            {(d.time_horizon || d.risk_reward_ratio || d.technical_analysis || d.fundamental_analysis || ns.impact_summary) && (
                <>
                    <button
                        onClick={() => setDetailOpen(v => !v)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            marginTop: 8, padding: 0, border: 'none', background: 'none',
                            cursor: 'pointer', color: 'var(--ink-40)', fontSize: 11,
                        }}
                    >
                        <svg
                            width="10" height="10" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                        {detailOpen ? 'Less detail' : 'More detail'}
                    </button>
                    {detailOpen && (
                        <div style={{ marginTop: 8, display: 'grid', gap: 5, fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.5 }}>
                            {d.time_horizon && <div><span style={{ color: 'var(--ink-40)' }}>Horizon:</span> {d.time_horizon}{d.risk_reward_ratio ? ` · R:R ${d.risk_reward_ratio}` : ''}</div>}
                            {d.technical_analysis && <div><span style={{ color: 'var(--ink-40)' }}>Technical:</span> {d.technical_analysis}</div>}
                            {d.fundamental_analysis && <div><span style={{ color: 'var(--ink-40)' }}>Fundamental:</span> {d.fundamental_analysis}</div>}
                            {ns.impact_summary && (
                                <div><span style={{ color: 'var(--ink-40)' }}>News ({ns.bias}{ns.confidence != null ? `, ${ns.confidence}%` : ''}):</span> {ns.impact_summary}</div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

const RISK_TONE = {
    LOW: { color: 'var(--ink-30)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)' },
    MEDIUM: { color: 'var(--aurum-100)', bg: 'rgba(201,168,106,0.10)', border: 'rgba(201,168,106,0.28)' },
    HIGH: { color: 'var(--crimson-500)', bg: 'rgba(201,82,82,0.10)', border: 'rgba(201,82,82,0.28)' },
    EXTREME: { color: 'var(--crimson-500)', bg: 'rgba(201,82,82,0.16)', border: 'rgba(201,82,82,0.40)' },
};

function BriefingCard({ b, expanded, onToggle, recBySymbol }) {
    // The AI prompt schema returns the trend/risk read here under
    // future_projections, not top-level short_term_trend/recommended_action
    // (those fields don't exist in the response) — reading the wrong fields
    // meant this badge silently fell back to "Neutral" no matter what the
    // briefing actually assessed, masking real high-risk calls.
    const trend = b.future_projections?.estimated_30d_trend;
    const toneMap = BRIEFING_TREND[trend] || BRIEFING_TREND.Neutral;
    const riskLevel = b.future_projections?.portfolio_risk_level?.toUpperCase();
    const riskTone = RISK_TONE[riskLevel];
    // No single recommended_action exists on the global-briefing schema —
    // actions are per-symbol, inside directives[] — so this badge never
    // renders for this briefing type; kept for schemas/callers that do set it.
    const actionKey = b.recommended_action?.toUpperCase();
    const actionColor = ACTION_COLOR[actionKey] || 'var(--ink-30)';
    // b.summary/b.key_catalyst/b.confidence don't exist on this schema either
    // — the real fields are market_vibe, future_projections.catalyst_watch,
    // and confidence_score, which is why every card rendered with just the
    // trend tag and feedback buttons and nothing else.
    const summary = b.market_vibe ?? b.summary;
    const keyCatalyst = b.future_projections?.catalyst_watch ?? b.key_catalyst;
    const confidence = b.confidence_score ?? b.confidence;
    const confPct = confidence != null ? Math.round(confidence * 100) : null;
    const isExpanded = expanded === b.id;

    const directives = Array.isArray(b.directives) ? b.directives : [];

    const sections = [];
    if (summary) sections.push({ label: 'Summary', value: summary });
    if (keyCatalyst) sections.push({ label: 'Key catalyst', value: keyCatalyst });

    const hasExpandableContent = sections.length > 0 || directives.length > 0;

    return (
        <div className="layer-1" style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Card header */}
            <div style={{ padding: '15px 20px' }}>
                {/* Row 1: meta badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)' }}>
                        {fmtDateTime(b.created_at || b.timestamp)}
                    </span>
                    <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 500,
                        color: toneMap.color, background: toneMap.bg, border: `1px solid ${toneMap.border}`,
                    }}>
                        {toneMap.label}
                    </span>
                    {riskLevel && riskTone && (riskLevel === 'HIGH' || riskLevel === 'EXTREME') && (
                        <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 500,
                            color: riskTone.color, background: riskTone.bg, border: `1px solid ${riskTone.border}`,
                        }}>
                            {riskLevel} RISK
                        </span>
                    )}
                    {actionKey && (
                        <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 500,
                            color: actionColor,
                            background: `color-mix(in oklab, ${actionColor} 12%, transparent)`,
                            border: `1px solid color-mix(in oklab, ${actionColor} 30%, transparent)`,
                        }}>
                            {actionKey}
                        </span>
                    )}
                    <div style={{ flex: 1 }} />
                    {b.model_used && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)' }}>
                            {b.model_used}
                        </span>
                    )}
                    {confPct != null && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)' }}>
                            Conf {confPct}%
                        </span>
                    )}
                </div>

                {/* Summary paragraph */}
                {summary && (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.65 }}>
                        {summary}
                    </p>
                )}

                {/* Expand toggle */}
                {hasExpandableContent && (
                    <button
                        onClick={() => onToggle(b.id)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            marginTop: 10, padding: 0, border: 'none', background: 'none',
                            cursor: 'pointer', color: 'var(--ink-40)', fontSize: 11.5,
                        }}
                    >
                        <svg
                            width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{
                                transform: isExpanded ? 'rotate(180deg)' : 'none',
                                transition: 'transform 200ms',
                            }}
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                        {isExpanded ? 'Collapse' : 'Show detail'}
                    </button>
                )}
            </div>

            {/* Expanded sections */}
            {isExpanded && hasExpandableContent && (
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    padding: '14px 20px',
                    display: 'grid',
                    gap: 6,
                    animation: 'aureon-cardEnter 200ms ease',
                }}>
                    {sections.map(({ label, value }) => (
                        <div key={label} style={{
                            display: 'grid', gridTemplateColumns: '108px 1fr', gap: 12,
                            padding: '9px 12px', borderRadius: 7,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                        }}>
                            <span style={{ fontSize: 11, color: 'var(--ink-40)' }}>{label}</span>
                            <span style={{ fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.55 }}>{value}</span>
                        </div>
                    ))}

                    {directives.length > 0 && (
                        <div style={{ display: 'grid', gap: 8, marginTop: sections.length > 0 ? 4 : 0 }}>
                            <span style={{ fontSize: 11, color: 'var(--ink-40)' }}>
                                Per-symbol directives ({directives.length})
                            </span>
                            {directives.map((d, i) => (
                                <DirectiveItem
                                    key={`${d.symbol}-${i}`}
                                    d={d}
                                    conflict={
                                        recBySymbol?.[d.symbol] &&
                                        recBySymbol[d.symbol].recommendation_state?.toUpperCase() !== (d.action || '').toUpperCase()
                                            ? recBySymbol[d.symbol]
                                            : null
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
            <div style={{ padding: '0 20px 15px' }}>
                <BriefingFeedback generationId={b.generation_id} />
            </div>
        </div>
    );
}

export default function AIBriefings({ tabState, onRetry }) {
    const { aiBriefing } = useAureonData();
    const [briefings, setBriefings] = useState([]);
    const [loading, setLoading] = useState(true);
    // The in-flight `running` guard alone doesn't survive this component
    // unmounting (tab switch, or a page reload) while a run is still
    // pending server-side — a naive user who thinks nothing happened can
    // navigate away and back and fire a second POST /ai/global while the
    // first is still in flight. Persist the pending marker in
    // sessionStorage so a remount can see it too; a staleness timeout
    // (PENDING_STALE_MS) keeps a request that never resolves (e.g. tab
    // closed mid-flight) from disabling the button forever.
    const [running, setRunning] = useState(() => isPendingFresh());
    const [expanded, setExpanded] = useState(null);
    const [activeRecs, setActiveRecs] = useState([]);

    useEffect(() => {
        let cancelled = false;
        apiService.fetchBriefingHistory(30)
            .then((data) => { if (!cancelled) setBriefings(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setBriefings([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Cross-reference directives[] against active recommendations from the
    // rule engine (by symbol) — fetched separately since useAureonData()
    // fetches recommendations only to gate its own loading/error state and
    // doesn't expose the list.
    useEffect(() => {
        let cancelled = false;
        apiService.listRecommendations('active')
            .then((data) => { if (!cancelled) setActiveRecs(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setActiveRecs([]); });
        return () => { cancelled = true; };
    }, []);

    const recBySymbol = (() => {
        const map = {};
        activeRecs.forEach((r) => { if (r.symbol) map[r.symbol] = r; });
        return map;
    })();

    // Polls for a pending run inherited from sessionStorage (i.e. started by
    // a since-unmounted instance of this component) so this instance
    // re-enables the button once that run actually finishes, instead of
    // showing "Running…" forever.
    useEffect(() => {
        if (!running) return undefined;
        const interval = setInterval(() => {
            const startedAt = getPendingSince();
            if (startedAt === null) {
                // Cleared by the original (now-unmounted) instance's run completing.
                setRunning(false);
                apiService.fetchBriefingHistory(30)
                    .then((data) => setBriefings(Array.isArray(data) ? data : []))
                    .catch(() => {});
            } else if (Date.now() - startedAt >= PENDING_STALE_MS) {
                // Marker never got cleared (e.g. tab closed mid-request) — don't
                // disable the button forever.
                clearPendingMarker();
                setRunning(false);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [running]);

    const handleRun = async () => {
        setPendingMarker();
        setRunning(true);
        try {
            await apiService.runGlobalAI();
            toast.success('AI briefing generated');
            const data = await apiService.fetchBriefingHistory(30);
            setBriefings(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error(e.message || 'Failed to run AI briefing');
        } finally {
            clearPendingMarker();
            setRunning(false);
        }
    };

    const handleToggle = (id) => setExpanded(prev => prev === id ? null : id);

    // Merge aiBriefing from hook if it's not in the fetched list
    const displayList = (() => {
        if (!aiBriefing) return briefings;
        const inList = briefings.some(b => b.id === aiBriefing.id);
        return inList ? briefings : [aiBriefing, ...briefings];
    })();

    const lastRunDate = displayList[0]?.created_at || displayList[0]?.timestamp;

    // ── Skeleton (tab-level loading) ─────────────────────────────────────────
    if (tabState === 'loading') {
        return (
            <>
                <style>{KEYFRAMES}</style>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            </>
        );
    }

    // ── Error state ──────────────────────────────────────────────────────────
    if (tabState === 'error') {
        return (
            <>
                <style>{KEYFRAMES}</style>
                <div style={{
                    padding: '24px 20px', borderRadius: 12, textAlign: 'center',
                    background: 'rgba(201,82,82,0.07)', border: '1px solid rgba(201,82,82,0.22)',
                }}>
                    <div style={{ fontSize: 14, color: 'var(--crimson-500)', fontWeight: 500, marginBottom: 6 }}>
                        Failed to load briefings
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-30)', marginBottom: 16, lineHeight: 1.55 }}>
                        There was a problem fetching AI briefing data.
                    </div>
                    <button
                        onClick={onRetry}
                        className="du3-cta"
                        style={{
                            background: 'rgba(201,82,82,0.12)', border: '1px solid rgba(201,82,82,0.30)',
                            color: 'var(--crimson-500)', cursor: 'pointer',
                        }}
                    >
                        Retry
                    </button>
                </div>
            </>
        );
    }

    // ── Ready state ──────────────────────────────────────────────────────────
    return (
        <>
            <style>{KEYFRAMES}</style>

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)',
                flexWrap: 'wrap', gap: 12,
            }}>
                <div>
                    <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--ink-00)',
                        lineHeight: 1, marginBottom: 4,
                    }}>
                        {loading ? '…' : displayList.length}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-40)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                        Briefings
                    </div>
                    {lastRunDate && (
                        <div style={{ fontSize: 12.5, color: 'var(--ink-30)', marginTop: 4 }}>
                            Last run · {fmtDateTime(lastRunDate)}
                        </div>
                    )}
                </div>

                <button
                    onClick={handleRun}
                    disabled={running}
                    className="du3-cta"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        background: 'rgba(201,168,106,0.13)', border: '1px solid rgba(201,168,106,0.32)',
                        color: 'var(--aurum-100)', cursor: running ? 'default' : 'pointer',
                        opacity: running ? 0.8 : 1,
                    }}
                >
                    {running ? (
                        <>
                            <Spinner />
                            Running…
                        </>
                    ) : (
                        <>
                            <span style={{ fontSize: 13 }}>✦</span>
                            Run briefing now
                        </>
                    )}
                </button>
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            ) : displayList.length === 0 ? (
                /* Empty state */
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 10, minHeight: '28vh', textAlign: 'center',
                    border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 12, padding: '40px 24px',
                }}>
                    <div style={{ fontSize: 14, color: 'var(--ink-20)', fontWeight: 500 }}>No briefings yet</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6 }}>
                        Run your first AI briefing to get a market outlook and recommendations.
                    </div>
                    <button
                        onClick={handleRun}
                        disabled={running}
                        className="du3-cta"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8,
                            background: 'rgba(201,168,106,0.13)', border: '1px solid rgba(201,168,106,0.32)',
                            color: 'var(--aurum-100)', cursor: running ? 'default' : 'pointer',
                        }}
                    >
                        {running ? <><Spinner />Running…</> : <><span>✦</span>Run briefing now</>}
                    </button>
                </div>
            ) : (
                /* Briefings list */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {displayList.map((b) => (
                        <BriefingCard
                            key={b.id}
                            b={b}
                            expanded={expanded}
                            onToggle={handleToggle}
                            recBySymbol={recBySymbol}
                        />
                    ))}
                </div>
            )}
        </>
    );
}
