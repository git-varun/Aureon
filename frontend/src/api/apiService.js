import axios from 'axios';

// Base URL points directly to the canonical v1 API namespace
const API = axios.create({baseURL: '/api/v1', timeout: 60000});

// Helper functions to retrieve active tenant and portfolio context synchronously
const getOrgId = () => localStorage.getItem('active_org_id');
const getPortfolioId = (orgId) => localStorage.getItem(`active_portfolio_id_${orgId || getOrgId()}`);

// Add Authorization header if session token exists
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

// Public auth paths that should never trigger global logout on 401
const AUTH_PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/google', '/auth/forgot'];

// Centralized session expiration handling: auto-logout on 401 (no JWT refresh logic remains)
API.interceptors.response.use(
    (res) => res,
    (error) => {
        if (error.response?.status === 401) {
            const url = error.config?.url || '';
            const isPublicAuth = AUTH_PUBLIC_PATHS.some(p => url.includes(p));
            if (!isPublicAuth) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('user_first_name');
                window.dispatchEvent(new Event('auth:logout'));
            }
        }
        return Promise.reject(error);
    }
);

// Centralized error extractor
const handleRequest = async (promise) => {
    try {
        const res = await promise;
        return res.data;
    } catch (err) {
        const detail = err.response?.data?.detail || err.response?.data?.message || err.message || 'Request failed';
        throw new Error(detail);
    }
};

export const apiService = {
    // ── Authentication (V1 Canonical) ─────────────────────────────────────────
    register: (email, password, first_name = '', last_name = '', token = '') => 
        handleRequest(API.post('/auth/register', {email, password, first_name, last_name, token})),

    loginPassword: (email, password) => 
        handleRequest(API.post('/auth/login', {email, password})),

    googleAuth: (id_token) => 
        handleRequest(API.post('/auth/google', {id_token})),

    logout: () => 
        handleRequest(API.post('/auth/logout')),

    getCurrentUser: () => 
        handleRequest(API.get('/auth/me')),

    getCurrentUserProfile: () => 
        handleRequest(API.get('/auth/me')),

    updateCurrentUserProfile: (payload) => 
        handleRequest(API.put('/auth/me', payload)),

    changeUserPassword: (currentPassword, newPassword) =>
        handleRequest(API.post('/auth/me/password', {current_password: currentPassword, new_password: newPassword})),

    deleteAccount: () => handleRequest(API.delete('/users/me')),

    // ── Organizations & Memberships (V1) ──────────────────────────────────────
    listOrganizations: () => 
        handleRequest(API.get('/organizations')),

    createOrganization: (name, slug) => 
        handleRequest(API.post('/organizations', {name, slug})),

    listMembers: (orgId) => 
        handleRequest(API.get(`/memberships/${orgId || getOrgId()}`)),

    // UI pending — member management
    updateMemberRole: (orgId, userId, role) =>
        handleRequest(API.put(`/memberships/${orgId || getOrgId()}/users/${userId}`, {role})),

    // UI pending — member management
    removeMember: (orgId, userId) =>
        handleRequest(API.delete(`/memberships/${orgId || getOrgId()}/users/${userId}`)),

    // ── Invitations (V1) ──────────────────────────────────────────────────────
    listInvitations: (orgId) =>
        handleRequest(API.get(`/invitations?org_id=${orgId || getOrgId()}`)),

    inviteMember: (orgId, email, role = 'MEMBER') =>
        handleRequest(API.post(`/invitations?org_id=${orgId || getOrgId()}`, {email, role})),

    // UI pending — invitation acceptance by token
    getInvitationByToken: (token) =>
        handleRequest(API.get(`/invitations/${token}`)),

    revokeInvitation: (invId) =>
        handleRequest(API.delete(`/invitations/${invId}`)),

    // ── Portfolios & Transactions (V1 Multi-Tenant) ───────────────────────────
    listPortfolios: (orgId) => 
        handleRequest(API.get(`/portfolio/organizations/${orgId || getOrgId()}/portfolios`)),

    createPortfolio: (orgId, name) => 
        handleRequest(API.post(`/portfolio/organizations/${orgId || getOrgId()}/portfolios`, {name})),

    getPortfolioSnapshot: (orgId, portfolioId) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        return handleRequest(API.get(`/portfolio/organizations/${oid}/portfolios/${pid}/snapshot`));
    },

    // UI pending — portfolio administration
    generatePortfolioSnapshot: (orgId, portfolioId) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        return handleRequest(API.post(`/portfolio/organizations/${oid}/portfolios/${pid}/snapshot`));
    },

    listPositions: (orgId, portfolioId) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        return handleRequest(API.get(`/portfolio/organizations/${oid}/portfolios/${pid}/positions`));
    },

    listTransactions: (orgId, portfolioId) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        return handleRequest(API.get(`/portfolio/organizations/${oid}/portfolios/${pid}/transactions`));
    },

    createTransaction: (orgId, portfolioId, payload) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        return handleRequest(API.post(`/portfolio/organizations/${oid}/portfolios/${pid}/transactions`, payload));
    },

    updateTransaction: (orgId, portfolioId, txnId, payload) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        return handleRequest(API.put(`/portfolio/organizations/${oid}/portfolios/${pid}/transactions/${txnId}`, payload));
    },

    deleteTransaction: (orgId, portfolioId, txnId) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        return handleRequest(API.delete(`/portfolio/organizations/${oid}/portfolios/${pid}/transactions/${txnId}`));
    },

    importTransactions: (orgId, portfolioId, file, broker = null) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        const form = new FormData();
        form.append('file', file);
        if (broker) form.append('broker', broker);
        return handleRequest(API.post(`/portfolio/organizations/${oid}/portfolios/${pid}/import`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        }));
    },

    importCAS: (orgId, portfolioId, file, password = null) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        const form = new FormData();
        form.append('file', file);
        if (password) form.append('password', password);
        return handleRequest(API.post(`/portfolio/organizations/${oid}/portfolios/${pid}/import/cdsl`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        }));
    },

    // ── Recommendations (V1 Multi-Tenant) ────────────────────────────────────
    listRecommendations: (orgId, status = null) => {
        const oid = orgId || getOrgId();
        const q = status ? `?status=${encodeURIComponent(status)}` : '';
        return handleRequest(API.get(`/recommendation/organizations/${oid}/recommendations${q}`));
    },

    applyRecommendation: (orgId, recId, portfolioId = null) => {
        const oid = orgId || getOrgId();
        const pid = portfolioId || getPortfolioId(oid);
        return handleRequest(API.post(`/recommendation/organizations/${oid}/recommendations/${recId}/apply?portfolio_id=${pid}`));
    },

    dismissRecommendation: (orgId, recId, reason = '') => {
        const oid = orgId || getOrgId();
        const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
        return handleRequest(API.post(`/recommendation/organizations/${oid}/recommendations/${recId}/dismiss${q}`));
    },

    undoRecommendation: (orgId, recId) => {
        const oid = orgId || getOrgId();
        return handleRequest(API.post(`/recommendation/organizations/${oid}/recommendations/${recId}/undo`));
    },

    generateRecommendations: (orgId) => {
        const oid = orgId || getOrgId();
        return handleRequest(API.post(`/recommendation/organizations/${oid}/recommendations/generate`));
    },

    // ── Watchlists (V1) ───────────────────────────────────────────────────────
    getWatchlists: () => 
        handleRequest(API.get('/watchlist/')),

    createWatchlist: (name) => 
        handleRequest(API.post('/watchlist/', {name, organization_id: getOrgId()})),

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

    // ── AI Capabilities (V1 Multi-Tenant) ─────────────────────────────────────
    runGlobalAI: (orgId) => 
        handleRequest(API.post(`/organizations/${orgId || getOrgId()}/ai/global`)),

    // UI pending — AI briefing scheduling
    runWeeklyAI: (orgId) =>
        handleRequest(API.post(`/organizations/${orgId || getOrgId()}/ai/weekly`)),

    // UI pending — AI briefing scheduling
    runMonthlyAI: (orgId) =>
        handleRequest(API.post(`/organizations/${orgId || getOrgId()}/ai/monthly`)),

    askAboutContext: (orgId, contextType, contextId, question) => {
        const oid = orgId || getOrgId();
        return handleRequest(API.post(`/organizations/${oid}/ai/qa`, {
            context_type: contextType,
            context_id: contextId,
            question
        }));
    },

    // UI pending — recommendation analysis
    explainRecommendation: (orgId, recId) => {
        const oid = orgId || getOrgId();
        return handleRequest(API.post(`/organizations/${oid}/ai/recommendations/${recId}/explain`));
    },

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
    
    // Manual assets
    createManualAsset: (payload) => handleRequest(API.post('/portfolio/manual-assets', payload)),
    updateManualValuation: (symbol, newValue, notes) => 
        handleRequest(API.put(`/portfolio/manual-assets/${encodeURIComponent(symbol)}/valuation`, {new_value: newValue, notes})),

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

    fetchPortfolioHistory: async () => {
        // No backend history endpoint — return null so callers show their empty state
        return null;
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
    getIntelligenceCalibration: (orgId) =>
        handleRequest(API.get('/intelligence/calibration', {params: {org_id: orgId}})),

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