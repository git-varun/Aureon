import axios from 'axios';

// Base URL points directly to the canonical v1 API namespace
const API = axios.create({baseURL: '/api/v1', timeout: 60000});

// Helper to retrieve the active portfolio context synchronously
const getPortfolioId = () => localStorage.getItem('active_portfolio_id');

// Centralized error extractor
const handleRequest = async (promise) => {
    try {
        const res = await promise;
        return res.data;
    } catch (err) {
        const detail = err.response?.data?.detail || err.response?.data?.message || err.message || 'Request failed';
        const wrapped = new Error(detail);
        wrapped.response = err.response;
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
        handleRequest(API.get('/portfolio/portfolios', {params: includeArchived ? {include_archived: true} : {}})),

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
    getAssetQuote: (symbol) => handleRequest(API.get(`/assets/${symbol}/quote`)),
    getAssetFundamentals: (symbol, refresh = false) => handleRequest(API.get(`/assets/${symbol}/fundamentals`, {params: {refresh}})),
    getAssetSignal: (symbol) => handleRequest(API.get(`/signals/${symbol}`)),
    fetchChartData: (symbol, days = 365) => handleRequest(API.get(`/assets/${symbol}/chart`, {params: {days}})),
    fetchAureonAsset: (ticker) => handleRequest(API.get(`/aureon/assets/${ticker}`)),
    triggerBackfill: (symbol) => handleRequest(API.post(`/market/symbols/${encodeURIComponent(symbol)}/backfill`)),
    refreshMarket: () => handleRequest(API.post('/market/refresh')),
    refreshPrices: () => handleRequest(API.post('/market/refresh')),
    syncBrokers: (broker = 'zerodha') => handleRequest(API.post('/portfolio/sync', {broker})),
    getSyncStatus: () => handleRequest(API.get('/portfolio/sync/status')),
    hardRefresh: () => handleRequest(API.post('/market/refresh')),
    seedRecommendations: () => handleRequest(API.post('/aureon/recommendations/seed')),
    analyzeNewsBatch: () => handleRequest(API.post('/analytics/ai/news/batch')),
    exportBackupJSON: () => handleRequest(API.get('/portfolio/backup')),
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
    getZerodhaLoginUrl: () => handleRequest(API.get('/config/providers/zerodha/oauth/login-url')),

    // Jobs configuration
    getJobs: () => handleRequest(API.get('/config/jobs')),
    updateJob: (jobName, payload) => handleRequest(API.put(`/config/jobs/${jobName}`, payload)),
    runJob: (jobName) => handleRequest(API.post(`/config/jobs/${jobName}/run`)),
    getJobLogs: (jobName, limit = 20) => handleRequest(API.get(`/config/jobs/${jobName}/logs?limit=${limit}`)),
    getAllocationTargets: () => handleRequest(API.get('/config/allocation_targets')),
    // UI pending — portfolio administration
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
