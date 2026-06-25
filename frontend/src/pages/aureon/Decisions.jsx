/* Aureon — Decisions hub (thin orchestrator). */
import React, {useMemo, useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {useApp} from '@/components/aureon/store';
import {useAureonData, AUREON_STATE_KEY} from '@/hooks/useAureonData';
import {ActionConfirmationModal} from '@/components/aureon/flow';
import {ErrorState} from '@/components/aureon/ds';
import {
    RecommendationsFeed,
    ExplainPanel,
    AIBriefings,
    DecisionHistoryTab,
    OutcomesTab,
    PerformanceTab,
    AccuracyTab,
} from '@/components/aureon/decisions';
import SignalsTab from '@/components/aureon/decisions/tabs/SignalsTab';
import DecisionLineageDrawer from '@/components/aureon/decisions/DecisionLineageDrawer';
import {getRecStatus} from '@/components/aureon/decisions/utils/recommendation';

/* ─── Tab definitions ─── */
const DECISION_TABS = [
    { id: 'recommendations', label: 'Recommendations', getBadge: (s) => s.active.length },
    { id: 'signals',         label: 'Signals',          getBadge: (s) => s.signals?.length ?? 0 },
    { id: 'briefings',       label: 'Briefings',        getBadge: null },
    { id: 'outcomes',        label: 'Outcomes',         getBadge: null },
    { id: 'ai-performance',  label: 'AI Performance',   getBadge: null },
    { id: 'accuracy',        label: 'Historical Accuracy', getBadge: null },
    { id: 'history',         label: 'History',          getBadge: null },
];

const TAB_INIT_MAP = {
    recommendations: 'recommendations',
    signals: 'signals',
    briefings: 'briefings',
    outcomes: 'outcomes',
    'ai-performance': 'ai-performance',
    accuracy: 'accuracy',
    history: 'history',
    activity: 'history', // legacy alias
};

/* ─── Skeleton for recommendations loading state ─── */
const RecsSkeleton = () => (
    <div style={{display: 'grid', gap: 10}}>
        {[0, 1, 2].map(i => (
            <div key={i} className="layer-1" style={{
                height: 120, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
                animation: 'pulse-shimmer 1.8s ease-in-out infinite', opacity: 0.5,
            }}/>
        ))}
    </div>
);

export default function Decisions() {
    const {search: urlSearch} = useLocation();
    const queryClient = useQueryClient();
    const {active, applied, dismissed, apply, dismiss} = useApp();
    const {signals, loading, error} = useAureonData();

    const initTab = useMemo(() => {
        const p = new URLSearchParams(urlSearch).get('tab');
        return TAB_INIT_MAP[p] || 'recommendations';
    }, [urlSearch]);

    const [tab, setTab] = useState(initTab);
    const [explainRec, setExplainRec] = useState(null);
    const [explainOpen, setExplainOpen] = useState(false);
    const [lineageExtId, setLineageExtId] = useState(null);
    const [lineageOpen, setLineageOpen] = useState(false);
    const [modalRec, setModalRec] = useState(null);
    const [tabStates] = useState({
        recommendations: 'ready',
        signals: 'ready',
        briefings: 'ready',
        outcomes: 'ready',
        'ai-performance': 'ready',
        accuracy: 'ready',
        history: 'ready',
    });

    const handleViewLineage = (extId) => {
        setLineageExtId(extId);
        setLineageOpen(true);
    };

    const handleRetry = () => queryClient.invalidateQueries({queryKey: AUREON_STATE_KEY});

    return (
        <>
            {/* Tab bar */}
            <div role="tablist" style={{display: 'flex', alignItems: 'flex-end', gap: 22, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 22, flexWrap: 'wrap'}}>
                {DECISION_TABS.map(t => {
                    const on = tab === t.id;
                    const badge = t.getBadge?.({ active, signals });
                    return (
                        <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)}
                            style={{display: 'flex', alignItems: 'center', gap: 7, padding: '0 2px 13px',
                                background: 'transparent', border: 'none', borderBottom: '2px solid ' + (on ? 'var(--aurum-100)' : 'transparent'),
                                color: on ? 'var(--ink-00)' : 'var(--ink-40)', fontFamily: 'var(--font-ui)', fontSize: 13.5,
                                fontWeight: on ? 600 : 500, cursor: 'pointer', marginBottom: -1}}>
                            <span>{t.label}</span>
                            {badge != null && (
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 6px', borderRadius: 999,
                                    background: on ? 'rgba(201,168,106,0.18)' : 'rgba(255,255,255,0.05)',
                                    color: on ? 'var(--aurum-100)' : 'var(--ink-40)'}}>{badge}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            {tab === 'recommendations' && (
                error ? (
                    <div style={{padding: '24px 0'}}>
                        <ErrorState
                            title="Aureon is temporarily unavailable."
                            body="Recommendation analysis could not be completed."
                            actions={
                                <button onClick={handleRetry} style={{
                                    height: 36, padding: '0 20px', borderRadius: 8,
                                    background: 'var(--crimson-500)', border: 'none',
                                    color: 'var(--ink-00)', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                                    cursor: 'pointer'
                                }}>Retry</button>
                            }
                        />
                    </div>
                ) : loading ? (
                    <RecsSkeleton />
                ) : (
                    <RecommendationsFeed
                        tabState={tabStates.recommendations}
                        onRetry={handleRetry}
                        onExplain={(rec) => { setExplainRec(rec); setExplainOpen(true); }}
                        onViewLineage={handleViewLineage}
                        onOpenModal={(rec) => setModalRec(rec)}
                        onGoToBriefings={() => setTab('briefings')}
                        onGoToSignals={() => setTab('signals')}
                    />
                )
            )}
            {tab === 'signals'        && <SignalsTab />}
            {tab === 'briefings'      && <AIBriefings tabState={tabStates.briefings} onRetry={handleRetry} />}
            {tab === 'outcomes'       && <OutcomesTab tabState={tabStates.outcomes} onRetry={handleRetry} />}
            {tab === 'ai-performance' && <PerformanceTab tabState={tabStates['ai-performance']} onRetry={handleRetry} />}
            {tab === 'accuracy'       && <AccuracyTab tabState={tabStates.accuracy} onRetry={handleRetry} />}
            {tab === 'history'        && <DecisionHistoryTab tabState={tabStates.history} onRetry={handleRetry} />}

            {explainOpen && explainRec && (
                <ExplainPanel
                    rec={explainRec}
                    status={getRecStatus(explainRec, active, applied, dismissed)}
                    signals={signals.filter(s => s.linkedRec === explainRec.id)}
                    onClose={() => { setExplainOpen(false); setExplainRec(null); }}
                    onApply={() => { apply(explainRec.id); setExplainOpen(false); setExplainRec(null); }}
                    onDismiss={() => dismiss(explainRec.id)}
                />
            )}

            {modalRec && (
                <ActionConfirmationModal
                    rec={modalRec}
                    onCancel={() => setModalRec(null)}
                    onConfirm={() => { apply(modalRec.id); setModalRec(null); }}
                />
            )}

            <DecisionLineageDrawer extId={lineageExtId} open={lineageOpen} onClose={() => setLineageOpen(false)} />
        </>
    );
}
