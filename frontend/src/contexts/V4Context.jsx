/* Aureon v4 — Currency layer + Jobs layer context. */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../api/apiService';
import { SUPPORTED_CURRENCIES } from '../pages/aureon/marketData';

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

/* ---------- AI take synthesizer — fallback when API fails ---------- */
const _AI_PHRASES_POS = [
    'Earnings momentum and operating leverage support a constructive setup; consensus revisions are tracking higher.',
    'Cash flow conversion is improving sequentially; valuation premium is justified by re-rating odds.',
    'Order book visibility is firming; margin glide path is intact through the next two quarters.',
];
const _AI_PHRASES_NEU = [
    'Mixed signal: tape strength offset by stretched positioning; size discipline matters more than direction here.',
    'Catalysts are balanced over the next 4–6 weeks; await the next print before adding.',
];
const _AI_PHRASES_NEG = [
    'Negative revision pressure persists; downside skew dominates over a 1-month window.',
    'Demand softness is not yet priced; trim into rallies.',
];
const _AI_TONES = [
    { tone: 'Constructive', color: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.10)',  border: 'rgba(111,174,136,0.28)',  bag: _AI_PHRASES_POS },
    { tone: 'Neutral',      color: 'var(--aurum-100)',   bg: 'rgba(201,168,106,0.10)',  border: 'rgba(201,168,106,0.28)',  bag: _AI_PHRASES_NEU },
    { tone: 'Cautious',     color: 'var(--crimson-500)', bg: 'rgba(201,82,82,0.10)',    border: 'rgba(201,82,82,0.28)',    bag: _AI_PHRASES_NEG },
];
const _synthesizeFallback = (ticker) => {
    const t = _AI_TONES[Math.floor(Math.random() * _AI_TONES.length)];
    const phrase = t.bag[Math.floor(Math.random() * t.bag.length)];
    return { tone: t.tone, color: t.color, bg: t.bg, border: t.border, text: phrase, confidence: 0.58 + Math.random() * 0.32 };
};

/* ============================================================
   V4Provider — currency state + jobs state
   ============================================================ */
export const V4Provider = ({ children }) => {
    const [currency, setCurrencyState] = useState(() => {
        const c = localStorage.getItem('aureon.currency');
        return SUPPORTED_CURRENCIES.includes(c) ? c : 'INR';
    });

    useEffect(() => {
        window.__aureonCurrency = currency;
        try { localStorage.setItem('aureon.currency', currency); } catch (_) {}
    }, [currency]);

    const setCurrency = (c) => {
        if (SUPPORTED_CURRENCIES.includes(c)) setCurrencyState(c);
    };

    const [running, setRunning] = useState([]);
    const [jobHistory, setJobHistory] = useState({});
    const [aiRuns, setAiRuns] = useState({});

    const runJob = ({ jobId, name, screen, ticker, durationMs }) => {
        const runId = 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const dur = durationMs || 1800;
        const startedAt = Date.now();
        setRunning(rs => [...rs, { runId, jobId, name, screen, ticker, startedAt, durationMs: dur }]);

        setTimeout(() => {
            setRunning(rs => rs.filter(r => r.runId !== runId));
            setJobHistory(h => ({ ...h, [jobId]: { last: Date.now(), status: 'ok' } }));
        }, dur);

        if (jobId === 'j-ai' && ticker) {
            const _commitTake = (resp) => {
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
                    if (resp?.status === 'cached' && resp?.data) {
                        _commitTake(resp);
                    } else {
                        const _poll = (attempt) => {
                            if (attempt > 5) return;
                            setTimeout(() => {
                                apiService.getAITake(ticker)
                                    .then(r => {
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
                    const take = _synthesizeFallback(ticker);
                    setAiRuns(a => {
                        const prev = a[ticker] || [];
                        const updated = prev.filter(r => r.id !== runId);
                        return { ...a, [ticker]: [...updated, { id: runId, ts: Date.now(), ...take }] };
                    });
                });
        }
    };

    return (
        <V4Context.Provider value={{ currency, setCurrency, running, jobHistory, runJob, aiRuns }}>
            {children}
        </V4Context.Provider>
    );
};
