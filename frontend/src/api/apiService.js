import axios from 'axios';

// Base URL points directly to the canonical v1 API namespace
const API = axios.create({baseURL: '/api/v1', timeout: 60000});

// Helper to retrieve the active portfolio context synchronously
const getPortfolioId = () => localStorage.getItem('active_portfolio_id');

// FastAPI 422s send `detail` as an array of {msg, loc, type} objects, not a
// string — flatten it so callers (and anything that renders it directly,
// e.g. a toast) always get a plain string instead of crashing on raw objects.
const flattenErrorDetail = (detail) => {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        return detail.map(d => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d))).join('; ') || null;
    }
    if (detail && typeof detail === 'object') return detail.msg || JSON.stringify(detail);
    return null;
};

// Collapses concurrent identical GETs (e.g. React StrictMode's dev-only
// double effect invocation firing the same load() twice back to back) into
// a single network request — not a cache: the map entry is cleared as soon
// as the request settles, so the next call always fires fresh.
const inFlightGET = new Map();
const dedupedGet = (url) => {
    if (!inFlightGET.has(url)) {
        inFlightGET.set(url, API.get(url).finally(() => inFlightGET.delete(url)));
    }
    return inFlightGET.get(url);
};

// Centralized error extractor
const handleRequest = async (promise) => {
    try {
        const res = await promise;
        return res.data;
    } catch (err) {
        const detail = flattenErrorDetail(err.response?.data?.detail) || err.response?.data?.message || err.message || 'Request failed';
        const wrapped = new Error(detail);
        wrapped.response = err.response;
        if (wrapped.response?.data) wrapped.response.data.detail = detail;
        throw wrapped;
    }
};

export const apiService = {
    getCurrentUserProfile: () =>
        handleRequest(API.get('/users/me')),

    updateCurrentUserProfile: (payload) =>
        handleRequest(API.put('/users/me', payload)),

    deleteAccount: () => handleRequest(API.delete('/users/me')),

    // ── Portfolios & Transactions (V1) ────────────────────────────────────────
    listPortfolios: (includeArchived = false) =>
        handleRequest(dedupedGet(`/portfolio/portfolios${includeArchived ? '?include_archived=true' : ''}`)),

    createPortfolio: (name) =>
        handleRequest(API.post('/portfolio/portfolios', {name})),

    updatePortfolio: (portfolioId, name) =>
        handleRequest(API.put(`/portfolio/portfolios/${portfolioId}`, {name})),

    archivePortfolio: (portfolioId) =>
        handleRequest(API.post(`/portfolio/portfolios/${portfolioId}/archive`)),

    unarchivePortfolio: (portfolioId) =>
        handleRequest(API.post(`/portfolio/portfolios/${portfolioId}/unarchive`)),

    // Hard, cascade delete — backend requires the portfolio to already be
    // archived (409 otherwise); not reachable from the primary delete action.
    deletePortfolioPermanently: (portfolioId) =>
        handleRequest(API.delete(`/portfolio/portfolios/${portfolioId}`)),

    getPortfolioSnapshot: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/portfolio/portfolios/${pid}/snapshot`));
    },

    // UI pending — portfolio administration
    generatePortfolioSnapshot: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.post(`/portfolio/portfolios/${pid}/snapshot`));
    },

    listPositions: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/portfolio/portfolios/${pid}/positions`));
    },

    listTransactions: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/portfolio/portfolios/${pid}/transactions`));
    },

    createTransaction: (portfolioId, payload) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.post(`/portfolio/portfolios/${pid}/transactions`, payload));
    },

    updateTransaction: (portfolioId, txnId, payload) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.put(`/portfolio/portfolios/${pid}/transactions/${txnId}`, payload));
    },

    deleteTransaction: (portfolioId, txnId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.delete(`/portfolio/portfolios/${pid}/transactions/${txnId}`));
    },

    importTransactions: (portfolioId, file, broker = null) => {
        const pid = portfolioId || getPortfolioId();
        const form = new FormData();
        form.append('file', file);
        if (broker) form.append('broker', broker);
        return handleRequest(API.post(`/portfolio/portfolios/${pid}/import`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        }));
    },

    importCAS: (portfolioId, file, password = null) => {
        const pid = portfolioId || getPortfolioId();
        const form = new FormData();
        form.append('file', file);
        if (password) form.append('password', password);
        return handleRequest(API.post(`/portfolio/portfolios/${pid}/import/cdsl`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        }));
    },

    importNPS: (portfolioId, file) => {
        const pid = portfolioId || getPortfolioId();
        const form = new FormData();
        form.append('file', file);
        return handleRequest(API.post(`/portfolio/portfolios/${pid}/import/nps`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        }));
    },

    importEPF: (portfolioId, file, password = null) => {
        const pid = portfolioId || getPortfolioId();
        const form = new FormData();
        form.append('file', file);
        if (password) form.append('password', password);
        return handleRequest(API.post(`/portfolio/portfolios/${pid}/import/epf`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        }));
    },

    getImportHistory: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/portfolio/portfolios/${pid}/import/history`));
    },

    getImportRunTransactions: (portfolioId, runId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/portfolio/portfolios/${pid}/import/history/${runId}/transactions`));
    },

    getBrokerTransactionCoverage: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/portfolio/portfolios/${pid}/transactions/broker-coverage`));
    },

    // ── Recommendations (V1) ──────────────────────────────────────────────────
    listRecommendations: (status = null) => {
        const q = status ? `?status=${encodeURIComponent(status)}` : '';
        return handleRequest(API.get(`/recommendation/recommendations${q}`));
    },

    applyRecommendation: (recId, portfolioId = null) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.post(`/recommendation/recommendations/${recId}/apply?portfolio_id=${pid}`));
    },

    dismissRecommendation: (recId, reason = '') => {
        const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
        return handleRequest(API.post(`/recommendation/recommendations/${recId}/dismiss${q}`));
    },

    undoRecommendation: (recId) =>
        handleRequest(API.post(`/recommendation/recommendations/${recId}/undo`)),

    generateRecommendations: () =>
        handleRequest(API.post('/recommendation/recommendations/generate')),

    // ── Watchlists (V1) ───────────────────────────────────────────────────────
    getWatchlists: () =>
        handleRequest(API.get('/watchlist/')),

    createWatchlist: (name) =>
        handleRequest(API.post('/watchlist/', {name})),

    renameWatchlist: (id, name) =>
        handleRequest(API.put(`/watchlist/${id}`, {name})),

    deleteWatchlist: (id) =>
        handleRequest(API.delete(`/watchlist/${id}`)),

    addWatchlistSymbol: (id, symbol) =>
        handleRequest(API.post(`/watchlist/${id}/symbols`, {symbol})),

    removeWatchlistSymbol: (id, symbol) =>
        handleRequest(API.delete(`/watchlist/${id}/symbols/${encodeURIComponent(symbol)}`)),

    setWatchlistAlert: (id, symbol, price) =>
        handleRequest(API.put(`/watchlist/${id}/symbols/${encodeURIComponent(symbol)}/alert`, {price})),

    clearWatchlistAlert: (id, symbol) =>
        handleRequest(API.delete(`/watchlist/${id}/symbols/${encodeURIComponent(symbol)}/alert`)),

    // ── News (V1) ─────────────────────────────────────────────────────────────
    // UI pending — news feed
    fetchNews: () =>
        handleRequest(API.get('/news')),

    fetchNewsForSymbol: (symbol) =>
        handleRequest(API.get(`/news/${symbol}`)),

    // ── Notifications (V1) ────────────────────────────────────────────────────
    getNotifications: () =>
        handleRequest(API.get('/notifications/')),

    markNotificationRead: (id) =>
        handleRequest(API.put(`/notifications/${id}/read`)),

    markAllNotificationsRead: (ids) =>
        handleRequest(API.put('/notifications/mark-all-read', ids)),

    // ── AI Capabilities (V1) ──────────────────────────────────────────────────
    runGlobalAI: () =>
        handleRequest(API.post('/ai/global')),

    // UI pending — AI briefing scheduling
    runWeeklyAI: () =>
        handleRequest(API.post('/ai/weekly')),

    // UI pending — AI briefing scheduling
    runMonthlyAI: () =>
        handleRequest(API.post('/ai/monthly')),

    askAboutContext: (contextType, contextId, question) =>
        handleRequest(API.post('/ai/qa', {
            context_type: contextType,
            context_id: contextId,
            question
        })),

    submitAiFeedback: (generationId, rating, comment) =>
        handleRequest(API.post('/ai/feedback', {
            generation_id: generationId,
            rating,
            comment
        })),

    // UI pending — recommendation analysis
    explainRecommendation: (recId) =>
        handleRequest(API.post(`/ai/recommendations/${recId}/explain`)),

    getAITake: (symbol) =>
        handleRequest(API.get(`/analytics/ai/single/${symbol}`)),

    runSingleAI: (symbol) =>
        handleRequest(API.post(`/analytics/ai/single/${symbol}`)),

    // ── Market Data (V1 & Dynamic Fallback routes) ───────────────────────────
    // UI pending — asset intelligence
    getAssetSnapshot: (assetId) =>
        handleRequest(API.get(`/market/assets/${assetId}/snapshot`)),

    // UI pending — asset intelligence
    getAssetFeatures: (assetId) =>
        handleRequest(API.get(`/market/assets/${assetId}/features`)),

    getMarketIndices: () => handleRequest(API.get('/market/indices')),
    getMarketSectors: () => handleRequest(API.get('/market/sectors')),
    getMarketMovers: () => handleRequest(API.get('/market/movers')),
    getMarketThemes: () => handleRequest(API.get('/market/themes')),
    getCryptoContext: () => handleRequest(API.get('/market/crypto-context')),
    getMarketTheme: (themeId) => handleRequest(API.get(`/market/themes/${themeId}`)),
    getThemeSignals: (themeId) => handleRequest(API.get(`/market/themes/${themeId}/signals`)),
    getThemeNav: (themeId, days = 365) => handleRequest(API.get(`/market/themes/${themeId}/nav?days=${days}`)),
    forkTheme: (themeId, name) => handleRequest(API.post(`/market/themes/${themeId}/fork`, {name})),
    updateTheme: (themeId, payload) => handleRequest(API.put(`/market/themes/${themeId}`, payload)),
    // UI pending — theme management
    deleteTheme: (themeId) => handleRequest(API.delete(`/market/themes/${themeId}`)),
    getThemesForSymbol: (symbol) => handleRequest(API.get(`/market/themes-for/${encodeURIComponent(symbol)}`)),
    getMarketSectorDetail: (name) => handleRequest(API.get(`/market/sectors/${encodeURIComponent(name)}`)),
    searchGlobalSymbol: (q) => handleRequest(API.get('/market/search', {params: {q}})),
    getMarketUniverse: (params = {}) => handleRequest(API.get('/market/universe', {params})),
    searchAssets: (query) => handleRequest(API.get('/assets', {params: {search: query}})),
    getAssetsBatch: (symbols) => handleRequest(API.get('/assets/batch', {params: {symbols: symbols.join(',')}})),
    getAssetQuote: (symbol) => handleRequest(API.get(`/assets/${symbol}/quote`)),
    getAssetFundamentals: (symbol, refresh = false) => handleRequest(API.get(`/assets/${symbol}/fundamentals`, {params: {refresh}})),
    getAssetStatement: (symbol, type) => handleRequest(API.get(`/assets/${symbol}/statements/${type}`)),
    getAssetSignal: (symbol) => handleRequest(API.get(`/signals/${symbol}`)),
    getAssetTechnicals: (symbol) => handleRequest(API.get(`/assets/${symbol}/technicals`)),
    getAssetAnalystSignals: (symbol) => handleRequest(API.get(`/assets/${symbol}/analyst-signals`)),
    fetchChartData: (symbol, days = 365) => handleRequest(API.get(`/assets/${symbol}/chart`, {params: {days}})),
    fetchAureonAsset: (ticker, portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/aureon/assets/${ticker}`, {params: pid ? {portfolio_id: pid} : {}}));
    },
    triggerBackfill: (symbol) => handleRequest(API.post(`/market/symbols/${encodeURIComponent(symbol)}/backfill`)),
    refreshMarket: () => handleRequest(API.post('/market/refresh')),
    refreshPrices: () => handleRequest(API.post('/market/refresh')),
    syncBrokers: (broker = 'zerodha') => handleRequest(API.post('/portfolio/sync', {broker})),
    getSyncStatus: () => handleRequest(API.get('/portfolio/sync/status')),

    // One-time, resumable full-history Binance Spot trade backfill — separate
    // from the regular sync cadence (see POST /portfolios/{id}/sync/binance/backfill).
    triggerBinanceBackfill: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.post(`/portfolio/portfolios/${pid}/sync/binance/backfill`));
    },
    getBinanceBackfillStatus: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/portfolio/portfolios/${pid}/sync/binance/backfill/status`));
    },
    hardRefresh: () => handleRequest(API.post('/market/refresh')),
    seedRecommendations: () => handleRequest(API.post('/aureon/recommendations/seed')),
    analyzeNewsBatch: () => handleRequest(API.post('/analytics/ai/news/batch')),
    exportBackupJSON: () => handleRequest(API.get('/portfolio/backup')),

    // ── Data reset (Danger Zone) ──────────────────────────────────────────────
    previewReset: (scopes) =>
        handleRequest(API.get('/reset/preview', {params: {scopes: scopes.join(',')}})),

    // Downloads the backup file to disk and captures the single-use
    // X-Backup-Receipt header the reset endpoint requires — the receipt is
    // never surfaced to the caller of this function's caller beyond this
    // return value, so callers must not display the raw token.
    exportBackupForReset: async () => {
        let res;
        try {
            res = await API.get('/portfolio/backup', {responseType: 'blob'});
        } catch (err) {
            if (err.response?.data instanceof Blob) {
                const text = await err.response.data.text();
                let detail = err.message;
                try { detail = JSON.parse(text).detail || detail; } catch { /* not JSON */ }
                const wrapped = new Error(detail);
                wrapped.response = err.response;
                throw wrapped;
            }
            throw err;
        }
        const receipt = res.headers['x-backup-receipt'];
        if (!receipt) {
            throw new Error('Backup was exported but no receipt was returned — reset cannot proceed.');
        }
        const disposition = res.headers['content-disposition'] || '';
        const match = disposition.match(/filename="?([^";]+)"?/);
        const filename = match ? match[1] : `aureon_backup_${new Date().toISOString().slice(0, 10)}.json`;

        const url = window.URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);

        return {receipt, filename, issuedAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000};
    },

    executeReset: (scopes, backupReceipt) =>
        handleRequest(API.post('/reset', {scopes, backup_receipt: backupReceipt})),

    restoreBackupJSON: (file, confirm = false) => {
        const form = new FormData();
        form.append('file', file);
        return handleRequest(API.post(`/portfolio/restore?confirm=${confirm}`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        }));
    },

    // Manual assets — portfolio-scoped; portfolioId falls back to the active
    // portfolio (see getPortfolioId above), same convention as every other
    // portfolio-scoped call in this file.
    createManualAsset: (payload, portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.post(`/portfolio/portfolios/${pid}/manual-assets`, payload));
    },
    updateManualValuation: (symbol, newValue, notes, portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.put(`/portfolio/portfolios/${pid}/manual-assets/${encodeURIComponent(symbol)}/valuation`, {new_value: newValue, notes}));
    },

    // Monitoring (ops-facing health checks)
    getMonitoringDependencies: () => handleRequest(API.get('/monitoring/dependencies')),
    getMonitoringProviders: () => handleRequest(API.get('/monitoring/providers')),
    getFailedIngestions: (limit = 20) => handleRequest(API.get('/monitoring/failed-ingestions', {params: {limit}})),
    getTransactionIntegrity: () => handleRequest(API.get('/monitoring/transactions/integrity')),
    getPositionQuoteIntegrity: () => handleRequest(API.get('/monitoring/positions/quote-integrity')),

    // Providers configuration
    getProviders: () => handleRequest(API.get('/config/providers')),
    updateProvider: (providerName, payload) => handleRequest(API.put(`/config/providers/${encodeURIComponent(providerName)}`, payload)),
    setProviderKey: (providerName, keyName, value) => handleRequest(API.put(`/config/providers/${encodeURIComponent(providerName)}/keys`, {key_name: keyName, value})),
    removeProviderKey: (providerName, keyName) => handleRequest(API.delete(`/config/providers/${encodeURIComponent(providerName)}/keys/${encodeURIComponent(keyName)}`)),
    checkProviderHealth: (providerName) => handleRequest(API.post(`/config/providers/${encodeURIComponent(providerName)}/health-check`)),
    getZerodhaLoginUrl: () => handleRequest(API.get('/config/providers/zerodha/oauth/login-url')),

    // Jobs configuration
    getJobs: () => handleRequest(dedupedGet('/config/jobs')),
    updateJob: (jobName, payload) => handleRequest(API.put(`/config/jobs/${jobName}`, payload)),
    runJob: (jobName) => handleRequest(API.post(`/config/jobs/${jobName}/run`)),
    getJobLogs: (jobName, limit = 20) => handleRequest(API.get(`/config/jobs/${jobName}/logs?limit=${limit}`)),
    getAllJobLogs: (limit = 50, offset = 0) => handleRequest(API.get(`/config/jobs/logs?limit=${limit}&offset=${offset}`)),
    getAllocationTargets: () => handleRequest(API.get('/config/allocation_targets')),
    getAllocationTargetsDetail: () => handleRequest(dedupedGet('/config/allocation_targets?detail=true')),
    upsertAllocationTarget: (assetClass, payload) => handleRequest(API.put(`/config/allocation_targets/${encodeURIComponent(assetClass)}`, payload)),

    fetchBriefingHistory: (limit = 30) =>
        handleRequest(API.get(`/analytics/ai/briefings?limit=${limit}`)),

    fetchPortfolioHistory: (portfolioId, days = 90) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get(`/portfolio/portfolios/${pid}/history`, {params: {days}}));
    },

    // ── Intelligence (per-portfolio AI analysis) ──────────────────────────────
    getPortfolioHealth: (portfolioId) =>
        handleRequest(API.get('/intelligence/portfolio-health', {params: {portfolio_id: portfolioId}})),
    getPortfolioDiversification: (portfolioId) =>
        handleRequest(API.get('/intelligence/diversification', {params: {portfolio_id: portfolioId}})),
    getPortfolioConcentration: (portfolioId) =>
        handleRequest(API.get('/intelligence/concentration', {params: {portfolio_id: portfolioId}})),
    getCashOpportunities: (portfolioId) =>
        handleRequest(API.get('/intelligence/cash-opportunities', {params: {portfolio_id: portfolioId}})),
    getIntelligenceCalibration: () =>
        handleRequest(API.get('/intelligence/calibration')),
    getPortfolioHealthTrend: (portfolioId, days = 90) =>
        handleRequest(API.get('/intelligence/portfolio-health/trend', {params: {portfolio_id: portfolioId, days}})),
    getDiversificationTrend: (portfolioId, days = 90) =>
        handleRequest(API.get('/intelligence/diversification/trend', {params: {portfolio_id: portfolioId, days}})),
    getRecommendationOutcomes: (portfolioId) => {
        const pid = portfolioId || getPortfolioId();
        return handleRequest(API.get('/intelligence/outcomes', {params: {portfolio_id: pid}}));
    },

    cleanError: (err) => {
        let msg = err.message || 'An error occurred';
        if (typeof msg === 'string') {
            if (msg.includes('Traceback (most recent call last)')) {
                const lines = msg.split('\n');
                const lastLine = lines[lines.length - 1] || '';
                const colonIdx = lastLine.indexOf(':');
                if (colonIdx !== -1) {
                    msg = lastLine.substring(colonIdx + 1).trim();
                } else {
                    msg = lastLine.trim();
                }
            }
        }
        return msg;
    }
};
