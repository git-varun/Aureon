import React, {useState} from 'react';
import {apiService} from '../../api/apiService';

const ACTIONS = [
    {
        key: 'seed',
        label: 'Seed Recommendations',
        desc: 'Insert DEFAULT_FIXTURES if the recommendations table is empty.',
        fn: () => apiService.seedRecommendations(),
    },
    {
        key: 'ai',
        label: 'Run Global AI Briefing',
        desc: 'Queue the AI.global briefing task for all held assets.',
        fn: () => apiService.runGlobalAI(),
    },
    {
        key: 'news',
        label: 'Analyze News Batch',
        desc: 'Queue AI.news sentiment to score recent headlines.',
        fn: () => apiService.analyzeNewsBatch(),
    },
    {
        key: 'market',
        label: 'Refresh Market Data',
        desc: 'Queue market.refresh cache to update universe, movers, sectors, and indices.',
        fn: () => apiService.refreshMarket(),
    },
];

export default function AdminPanel() {
    const [states, setStates] = useState({});

    const run = async (action) => {
        setStates(s => ({...s, [action.key]: {loading: true, result: null, error: null}}));
        try {
            const result = await action.fn();
            setStates(s => ({...s, [action.key]: {loading: false, result, error: null}}));
        } catch (e) {
            const msg = e?.response?.data?.detail || e?.message || 'Error';
            setStates(s => ({...s, [action.key]: {loading: false, result: null, error: msg}}));
        }
    };

    return (
        <div style={{maxWidth: 600}}>
            <div style={{marginBottom: 22}}>
                <div style={{
                    fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6
                }}>Admin actions
                </div>
                <div style={{fontSize: 12.5, color: 'var(--ink-30)'}}>
                    Manually trigger pipeline tasks. Use these to bootstrap data or force a refresh.
                </div>
            </div>

            <div style={{display: 'grid', gap: 12}}>
                {ACTIONS.map(action => {
                    const st = states[action.key] || {};
                    return (
                        <div key={action.key} style={{
                            padding: '14px 18px',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)',
                            display: 'flex', alignItems: 'flex-start', gap: 18,
                        }}>
                            <div style={{flex: 1}}>
                                <div style={{
                                    fontSize: 14, fontWeight: 600, color: 'var(--ink-00)',
                                    fontFamily: 'var(--font-heading)', marginBottom: 4
                                }}>{action.label}</div>
                                <div style={{fontSize: 12, color: 'var(--ink-40)'}}>{action.desc}</div>
                                {st.result && (
                                    <div style={{
                                        marginTop: 8, fontSize: 11.5, color: 'var(--sage-500)',
                                        fontFamily: 'var(--font-mono)'
                                    }}>
                                        {st.result.status || st.result.task_id
                                            ? `queued · ${st.result.task_id || 'ok'}`
                                            : JSON.stringify(st.result).slice(0, 80)}
                                    </div>
                                )}
                                {st.error && (
                                    <div style={{
                                        marginTop: 8, fontSize: 11.5, color: 'var(--crimson-500)',
                                        fontFamily: 'var(--font-mono)'
                                    }}>{st.error}</div>
                                )}
                            </div>
                            <button
                                className="du3-cta"
                                onClick={() => run(action)}
                                disabled={st.loading}
                                style={{flexShrink: 0, minWidth: 80}}
                            >
                                {st.loading ? '…' : 'Run'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
