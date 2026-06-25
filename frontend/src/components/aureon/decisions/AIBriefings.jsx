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

function BriefingCard({ b, expanded, onToggle }) {
    const trend = b.short_term_trend;
    const toneMap = BRIEFING_TREND[trend] || BRIEFING_TREND.Neutral;
    const actionKey = b.recommended_action?.toUpperCase();
    const actionColor = ACTION_COLOR[actionKey] || 'var(--ink-30)';
    const confPct = b.confidence != null ? Math.round(b.confidence * 100) : null;
    const isExpanded = expanded === b.id;

    const sections = [];
    if (b.summary) sections.push({ label: 'Summary', value: b.summary });
    if (b.key_catalyst) sections.push({ label: 'Key catalyst', value: b.key_catalyst });

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
                    {confPct != null && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)' }}>
                            Conf {confPct}%
                        </span>
                    )}
                </div>

                {/* Summary paragraph */}
                {b.summary && (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.65 }}>
                        {b.summary}
                    </p>
                )}

                {/* Expand toggle */}
                {sections.length > 0 && (
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
            {isExpanded && sections.length > 0 && (
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
                </div>
            )}
        </div>
    );
}

export default function AIBriefings({ tabState, onRetry }) {
    const { aiBriefing } = useAureonData();
    const [briefings, setBriefings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [expanded, setExpanded] = useState(null);

    useEffect(() => {
        let cancelled = false;
        apiService.fetchBriefingHistory(30)
            .then((data) => { if (!cancelled) setBriefings(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setBriefings([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
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
                        />
                    ))}
                </div>
            )}
        </>
    );
}
