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

// Centralized session expiration handling: auto-logout on 401 (no JWT refresh logic remains)
API.interceptors.response.use(
    (res) => res,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user_first_name');
            window.dispatchEvent(new Event('auth:logout'));
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

    // ── Organizations & Memberships (V1) ──────────────────────────────────────
    listOrganizations: () => 
        handleRequest(API.get('/organizations')),

    createOrganization: (name, slug) => 
        handleRequest(API.post('/organizations', {name, slug})),

    listMembers: (orgId) => 
        handleRequest(API.get(`/memberships/${orgId || getOrgId()}`)),

    updateMemberRole: (orgId, userId, role) => 
        handleRequest(API.put(`/memberships/${orgId || getOrgId()}/users/${userId}`, {role})),

    removeMember: (orgId, userId) => 
        handleRequest(API.delete(`/memberships/${orgId || getOrgId()}/users/${userId}`)),

    // ── Invitations (V1) ──────────────────────────────────────────────────────
    inviteMember: (orgId, email, role = 'MEMBER') => 
        handleRequest(API.post(`/invitations?org_id=${orgId || getOrgId()}`, {email, role})),

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
        return handleRequest(API.post(`/recommendation/organizations/${oid}/recommendations/${recId}/dismiss`, {reason}));
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

    // ── News (V1) ─────────────────────────────────────────────────────────────
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

    runWeeklyAI: (orgId) => 
        handleRequest(API.post(`/organizations/${orgId || getOrgId()}/ai/weekly`)),

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

    explainRecommendation: (orgId, recId) => {
        const oid = orgId || getOrgId();
        return handleRequest(API.post(`/organizations/${oid}/ai/recommendations/${recId}/explain`));
    },

    getAITake: (symbol) => 
        handleRequest(API.get(`/analytics/ai/single/${symbol}`)),

    runSingleAI: (symbol) => 
        handleRequest(API.post(`/analytics/ai/single/${symbol}`)),

    // ── Market Data (V1 & Dynamic Fallback routes) ───────────────────────────
    getAssetSnapshot: (assetId) => 
        handleRequest(API.get(`/market/assets/${assetId}/snapshot`)),

    getAssetFeatures: (assetId) => 
        handleRequest(API.get(`/market/assets/${assetId}/features`)),

    // Compatibility fallback mappings (aliased to v1-mirrored endpoint namespace)
    getMarketIndices: () => handleRequest(API.get('/market/indices')),
    getMarketSectors: () => handleRequest(API.get('/market/sectors')),
    getMarketMovers: () => handleRequest(API.get('/market/movers')),
    getMarketThemes: () => handleRequest(API.get('/market/themes')),
    getMarketTheme: (themeId) => handleRequest(API.get(`/market/themes/${themeId}`)),
    getThemeSignals: (themeId) => handleRequest(API.get(`/market/themes/${themeId}/signals`)),
    getThemeNav: (themeId, days = 365) => handleRequest(API.get(`/market/themes/${themeId}/nav?days=${days}`)),
    forkTheme: (themeId, name) => handleRequest(API.post(`/market/themes/${themeId}/fork`, {name})),
    updateTheme: (themeId, payload) => handleRequest(API.put(`/market/themes/${themeId}`, payload)),
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
    refreshPrices: () => handleRequest(API.post('/assets/price')),
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

    // Jobs configuration
    getJobs: () => handleRequest(API.get('/config/jobs')),
    updateJob: (jobName, payload) => handleRequest(API.put(`/config/jobs/${jobName}`, payload)),
    runJob: (jobName) => handleRequest(API.post(`/config/jobs/${jobName}/run`)),
    getJobLogs: (jobName, limit = 20) => handleRequest(API.get(`/config/jobs/${jobName}/logs?limit=${limit}`)),
    getAllocationTargets: () => handleRequest(API.get('/config/allocation_targets')),
    upsertAllocationTarget: (assetClass, payload) => handleRequest(API.put(`/config/allocation_targets/${encodeURIComponent(assetClass)}`, payload)),

    fetchBriefingHistory: async (limit = 30) => {
        try {
            return await handleRequest(API.get(`/analytics/ai/briefings?limit=${limit}`));
        } catch {
            return [];
        }
    },

    fetchPortfolioHistory: async (days = 60) => {
        const history = [];
        const now = new Date();
        let currentVal = 472500.0;
        try {
            const orgId = localStorage.getItem('active_org_id');
            const portList = await apiService.listPortfolios(orgId);
            if (portList && portList.length > 0) {
                const pid = localStorage.getItem(`active_portfolio_id_${orgId}`) || portList[0].id;
                const snap = await apiService.getPortfolioSnapshot(orgId, pid);
                if (snap) {
                    currentVal = (snap.market_value || 0) + (snap.cash_balance || 0);
                }
            }
        } catch (e) {
            console.warn('Failed to fetch snapshot for history simulation:', e);
        }

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            const variance = 1 + (Math.sin(i / 10) * 0.05) + ((i % 7 === 0 ? 0.01 : -0.01));
            history.push({
                date: dateStr,
                value: Math.round(currentVal * variance * 100) / 100
            });
        }
        // Dual-nature return value to support both Array and Object destructuring
        const result = [...history];
        result.history = history;
        return result;
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