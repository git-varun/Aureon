import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { apiService } from '@/api/apiService';
import { ErrorState } from '@/components/aureon/ds.jsx';

const pct = (v) => v == null ? '—' : `${(v * 100).toFixed(1)}%`;
const returnColor = (v) => v == null ? 'var(--ink-40)' : v > 0 ? 'var(--sage-500)' : v < 0 ? 'var(--crimson-500)' : 'var(--ink-30)';

const StatCol = ({ label, value, color }) => (
    <div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: color || 'var(--ink-00)' }}>{value}</div>
    </div>
);

function QualityMetricsBar({ metrics }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
                <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, marginBottom: 4 }}>Total</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, color: 'var(--ink-00)', lineHeight: 1 }}>{metrics.total_recommendations}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4 }}>recommendations</div>
            </div>
            <StatCol label="Accepted" value={metrics.accepted_count} color="var(--sage-500)" />
            <StatCol label="Dismissed" value={metrics.dismissed_count} color="var(--ink-30)" />
            <StatCol label="Expired" value={metrics.expired_count} color="var(--dusk-500)" />
            <StatCol label="Acceptance rate" value={pct(metrics.acceptance_rate)} />
            <StatCol label="Execution rate" value={pct(metrics.execution_rate)} />
        </div>
    );
}

const IntervalCell = ({ realized, excess }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, minWidth: 78 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: returnColor(realized) }}>{pct(realized)}</span>
        {excess != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: returnColor(excess) }}>
                {excess >= 0 ? '+' : ''}{pct(excess)} vs mkt
            </span>
        )}
    </div>
);

const STATE_COLOR = { BUY: 'var(--sage-500)', HOLD: 'var(--ink-30)', REDUCE: 'var(--dusk-500)', AVOID: 'var(--crimson-500)' };

function PerformanceRow({ p, isLast }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-00)' }}>{p.symbol || '—'}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', color: STATE_COLOR[p.state] || 'var(--ink-30)' }}>{p.state}</span>
            </div>
            {!p.performance_available ? (
                <div style={{ fontSize: 11.5, color: 'var(--ink-40)', fontStyle: 'italic' }}>{p.unavailable_reason || 'unavailable'}</div>
            ) : (
                <div style={{ display: 'flex', gap: 22 }}>
                    <IntervalCell realized={p.realized_return_30d} excess={p.excess_return_30d} />
                    <IntervalCell realized={p.realized_return_90d} excess={p.excess_return_90d} />
                    <IntervalCell realized={p.realized_return_180d} excess={p.excess_return_180d} />
                </div>
            )}
        </div>
    );
}

function PerformanceTable({ performance }) {
    if (performance.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: '20vh', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--ink-20)', fontWeight: 500 }}>No recommendations yet</div>
                <div style={{ fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6 }}>Outcomes appear here once recommendations have been generated.</div>
            </div>
        );
    }
    return (
        <div style={{ borderRadius: 11, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.018)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ flex: 1, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Asset</div>
                <div style={{ display: 'flex', gap: 22 }}>
                    {['30d', '90d', '180d'].map(l => (
                        <div key={l} style={{ minWidth: 78, textAlign: 'right', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>{l}</div>
                    ))}
                </div>
            </div>
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {performance.map((p, idx) => (
                    <PerformanceRow key={p.recommendation_id} p={p} isLast={idx === performance.length - 1} />
                ))}
            </div>
        </div>
    );
}

export default function OutcomesTab() {
    const { activePortfolioId } = usePortfolio();

    const query = useQuery({
        queryKey: ['recommendation-outcomes', activePortfolioId],
        queryFn: () => apiService.getRecommendationOutcomes(activePortfolioId),
        enabled: !!activePortfolioId,
        staleTime: 60000,
    });

    if (!activePortfolioId || query.isLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh', color: 'var(--ink-40)', fontSize: 13 }}>
                Loading…
            </div>
        );
    }
    if (query.isError) {
        return (
            <ErrorState
                title="Could not load outcomes"
                body={query.error?.message || 'Something went wrong fetching recommendation outcomes.'}
                actions={
                    <button onClick={() => query.refetch()} style={{
                        height: 34, padding: '0 16px', borderRadius: 7,
                        background: 'rgba(201,168,106,0.14)', border: '1px solid rgba(201,168,106,0.35)',
                        color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: 'pointer',
                    }}>Retry</button>
                }
            />
        );
    }

    const { quality_metrics: metrics, performance } = query.data;

    return (
        <>
            <QualityMetricsBar metrics={metrics} />
            <PerformanceTable performance={performance} />
            <div style={{ height: 32 }} />
        </>
    );
}
