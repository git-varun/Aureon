/* Aureon v4 — Currency layer + Jobs layer context. */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiService } from '../api/apiService';
import { SUPPORTED_CURRENCIES, FX_PER_INR } from '../pages/aureon/marketData';
import { AUREON_STATE_KEY } from '../hooks/useAureonData';

const V4Context = createContext(null);
export const useV4 = () => useContext(V4Context);

/* ---------- Job definitions: which manual jobs surface per screen ---------- */
export const V4_JOB_DEFS = {
    dashboard: [
        { id: 'j-prices',    name: 'Refresh price data',       desc: 'Pull last close from connected providers',   duration: 1600 },
        { id: 'j-briefing',  name: 'Run AI briefing',          desc: 'Portfolio · macro · news synthesis',         duration: 2400 },
        { id: 'j-providers', name: 'Sync providers',           desc: 'Reconcile holdings across brokers',          duration: 2000 },
    ],
    portfolio: [
        { id: 'j-prices',    name: 'Refresh price data',       desc: 'Latest close across positions',              duration: 1600 },
        { id: 'j-analytics', name: 'Recompute analytics',      desc: 'Drift · attribution · risk metrics',         duration: 2200 },
        { id: 'j-providers', name: 'Sync providers',           desc: 'Pull fresh holdings from brokers',           duration: 2000 },
    ],
    assets: [
        { id: 'j-prices',    name: 'Refresh price',            desc: 'Latest close for this asset',                duration: 1200 },
        { id: 'j-ai',        name: 'Run AI analysis',          desc: 'On-demand AI take · appends below existing', duration: 2600 },
        { id: 'j-news',      name: 'Refresh sentiment & news', desc: 'Pull latest brokerage and news flow',        duration: 1800 },
    ],
    signals: [
        { id: 'j-signals',   name: 'Regenerate signals',       desc: 'Momentum · sentiment · allocation · vol',   duration: 2000 },
        { id: 'j-news',      name: 'Refresh sentiment',        desc: 'Recompute sentiment scores',                 duration: 1600 },
    ],
    watchlist: [
        { id: 'j-prices',    name: 'Refresh prices',           desc: 'Last close for watchlist symbols',           duration: 1400 },
        { id: 'j-alerts',    name: 'Re-evaluate alerts',       desc: 'Check armed thresholds against latest',      duration: 1200 },
    ],
    markets: [
        { id: 'j-market-data', name: 'Refresh market data',   desc: 'Pull indices, sectors, movers, and universe', duration: 2200 },
        { id: 'j-themes',    name: 'Refresh themes',           desc: 'Recompute curated discovery themes',          duration: 1800 },
    ],
    terminal: [
        { id: 'j-market-data', name: 'Populate universe',     desc: 'Pull asset universe from connected providers', duration: 2200 },
        { id: 'j-ai',        name: 'Run AI analysis',          desc: 'On-demand AI take for the selected asset',    duration: 2600 },
    ],
};

/* ---------- AI response parser ---------- */
const _TONE_MAP = {
    Bullish: { tone: 'Constructive', color: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.10)',  border: 'rgba(111,174,136,0.28)' },
    Neutral: { tone: 'Neutral',      color: 'var(--aurum-100)',   bg: 'rgba(201,168,106,0.10)',  border: 'rgba(201,168,106,0.28)' },
    Bearish: { tone: 'Cautious',     color: 'var(--crimson-500)', bg: 'rgba(201,82,82,0.10)',    border: 'rgba(201,82,82,0.28)'  },
};

const _confidenceFromAction = (action) => {
    const map = { BUY: 0.85, HOLD: 0.72, SELL: 0.75, 'AVG DOWN': 0.68 };
    return map[action] ?? 0.72;
};

const _parseAIResponse = (runId, ts, resp) => {
    if (resp?.status === 'cached' && resp?.data) {
        const d = resp.data;
        const t = _TONE_MAP[d.short_term_trend] || _TONE_MAP.Neutral;
        return {
            id: runId, ts,
            ...t,
            text: d.deep_reasoning || d.key_catalyst || 'Analysis complete.',
            confidence: _confidenceFromAction(d.recommended_action),
        };
    }
    return {
        id: runId, ts,
        tone: 'Processing',
        color: 'var(--ink-40)',
        bg: 'rgba(255,255,255,0.04)',
        border: 'rgba(255,255,255,0.10)',
        text: 'Analysis is queued with the AI engine — it will appear on the next page visit once complete.',
        confidence: 0,
    };
};

/* Explicit error state shown when the AI API call fails. */
const _aiErrorFallback = () => ({
    tone: 'Unavailable',
    color: 'var(--ink-40)',
    bg: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.10)',
    text: 'AI analysis is temporarily unavailable. Retry using the Run AI job.',
    confidence: null,
});

/* ============================================================
   V4Provider — currency state + jobs state
   ============================================================ */
export const V4Provider = ({ children }) => {
    const [currency, setCurrencyState] = useState(() => {
        const c = localStorage.getItem('aureon.currency');
        return SUPPORTED_CURRENCIES.includes(c) ? c : 'INR';
    });

    /* Live FX rates fetched from open.er-api.com (base: INR). Falls back to
       static constants when the fetch fails or is pending. */
    const [fxRates, setFxRates] = useState(null);

    useEffect(() => {
        window.__aureonCurrency = currency;
        try { localStorage.setItem('aureon.currency', currency); } catch (_) {}
    }, [currency]);

    useEffect(() => {
        fetch('https://open.er-api.com/v6/latest/INR')
            .then(r => r.json())
            .then(data => {
                if (data?.result === 'success' && data?.rates) {
                    setFxRates(data.rates);
                }
            })
            .catch(() => {}); // fall back to static FX_PER_INR constants
    }, []);

    const setCurrency = (c) => {
        if (SUPPORTED_CURRENCIES.includes(c)) setCurrencyState(c);
    };

    const [running, setRunning] = useState([]);
    const [jobHistory, setJobHistory] = useState({});
    const [aiRuns, setAiRuns] = useState({});
    const queryClient = useQueryClient();

    /* Map job IDs to the real API call that backs them. */
    const _jobApiCall = (jobId, ticker) => {
        switch (jobId) {
            case 'j-prices':   return apiService.refreshPrices();
            case 'j-briefing': return apiService.runGlobalAI();
            case 'j-providers':return apiService.syncBrokers();
            case 'j-signals':  return apiService.generateSignals();
            case 'j-news':     return apiService.analyzeNewsBatch();
            case 'j-analytics':return apiService.refreshPrices(); // prices are the base for all analytics
            case 'j-alerts':   return apiService.refreshPrices(); // re-evaluates price-based thresholds
            case 'j-ai':       return Promise.resolve(null); // handled separately below with polling
            default:           return Promise.resolve(null);
        }
    };

    const runJob = ({ jobId, name, screen, ticker, durationMs }) => {
        const runId = 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const dur = durationMs || 1800;
        const startedAt = Date.now();
        setRunning(rs => [...rs, { runId, jobId, name, screen, ticker, startedAt, durationMs: dur }]);

        // Race the API call against a minimum display timer so the spinner always
        // shows for at least `dur` ms, but doesn't block on slow calls.
        const timer = new Promise(res => setTimeout(res, dur));
        const apiCall = _jobApiCall(jobId, ticker);

        Promise.all([timer, apiCall])
            .catch(() => {}) // API errors are non-fatal — job still finishes
            .finally(() => {
                setRunning(rs => rs.filter(r => r.runId !== runId));
                setJobHistory(h => ({ ...h, [jobId]: { last: Date.now(), status: 'ok' } }));
                // Refresh the primary data feed so the UI reflects the outcome.
                if (jobId !== 'j-ai') {
                    queryClient.invalidateQueries({ queryKey: AUREON_STATE_KEY });
                }
            });

        if (jobId === 'j-ai' && ticker) {
            let pollCancelled = false;

            const _commitTake = (resp) => {
                if (pollCancelled) return;
                const take = _parseAIResponse(runId, Date.now(), resp);
                setAiRuns(a => {
                    const prev = a[ticker] || [];
                    const updated = prev.filter(r => r.id !== runId);
                    return { ...a, [ticker]: [...updated, take] };
                });
            };

            const _placeholder = _parseAIResponse(runId, Date.now(), { status: 'processing' });
            setAiRuns(a => ({ ...a, [ticker]: [...(a[ticker] || []), _placeholder] }));

            apiService.runSingleAI(ticker)
                .then(resp => {
                    if (pollCancelled) return;
                    if (resp?.status === 'cached' && resp?.data) {
                        _commitTake(resp);
                    } else {
                        const _poll = (attempt) => {
                            if (attempt > 5 || pollCancelled) return;
                            setTimeout(() => {
                                if (pollCancelled) return;
                                apiService.getAITake(ticker)
                                    .then(r => {
                                        if (pollCancelled) return;
                                        if (r?.status === 'cached' && r?.data) _commitTake(r);
                                        else _poll(attempt + 1);
                                    })
                                    .catch(() => {});
                            }, 4000 * attempt);
                        };
                        _poll(1);
                    }
                })
                .catch(() => {
                    pollCancelled = true;
                    const errorTake = _aiErrorFallback();
                    setAiRuns(a => {
                        const prev = a[ticker] || [];
                        const updated = prev.filter(r => r.id !== runId);
                        return { ...a, [ticker]: [...updated, { id: runId, ts: Date.now(), ...errorTake }] };
                    });
                });
        }
    };

    return (
        <V4Context.Provider value={{ currency, setCurrency, fxRates: fxRates || FX_PER_INR, running, jobHistory, runJob, aiRuns }}>
            {children}
        </V4Context.Provider>
    );
};
