import axios from 'axios';

/* SECURITY NOTE: tokens are stored in localStorage, making them readable by any
   JS running on this origin (XSS risk). For a production financial app migrate to
   httpOnly session cookies + CSRF tokens so tokens are never JS-accessible. */
const API = axios.create({baseURL: '/api', timeout: 60000});

// Add Authorization header if token exists
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

// Auto-refresh token on 401, retry once
let _refreshing = false;
let _refreshQueue = [];

API.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;
        if (error.response?.status !== 401 || original._retry) {
            return Promise.reject(error);
        }
        original._retry = true;

        const refresh_token = localStorage.getItem('refresh_token');
        if (!refresh_token) {
            localStorage.removeItem('access_token');
            window.dispatchEvent(new Event('auth:logout'));
            return Promise.reject(error);
        }

        if (_refreshing) {
            return new Promise((resolve, reject) => {
                _refreshQueue.push({resolve, reject});
            }).then(token => {
                original.headers.Authorization = `Bearer ${token}`;
                return API(original);
            });
        }

        _refreshing = true;
        try {
            const res = await API.post('/auth/refresh', {refresh_token});
            const newToken = res.data.access_token;
            localStorage.setItem('access_token', newToken);
            if (res.data.refresh_token) localStorage.setItem('refresh_token', res.data.refresh_token);
            _refreshQueue.forEach(({resolve}) => resolve(newToken));
            _refreshQueue = [];
            original.headers.Authorization = `Bearer ${newToken}`;
            return API(original);
        } catch {
            _refreshQueue.forEach(({reject}) => reject(error));
            _refreshQueue = [];
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.dispatchEvent(new Event('auth:logout'));
            return Promise.reject(error);
        } finally {
            _refreshing = false;
        }
    }
);

export const apiService = {
    // ── Authentication ─────────────────────────────────────────────────────────
    register: async (email, password, first_name = '', last_name = '') => {
        try {
            const res = await API.post('/auth/register', {email, password, first_name, last_name});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Registration failed');
        }
    },

    // Step 1: validate password, triggers email OTP
    loginPassword: async (email, password) => {
        try {
            const res = await API.post('/auth/login', {email, password});
            return res.data; // { status: "otp_required" }
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Login failed');
        }
    },

    // Step 2: verify OTP sent after password validation
    loginVerifyOtp: async (email, code) => {
        try {
            const res = await API.post('/auth/login/verify', {email, code});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Verification failed');
        }
    },

    // Magic link
    magicSend: async (email) => {
        try {
            const res = await API.post('/auth/magic/send', {email});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Failed to send magic link');
        }
    },

    magicVerify: async (token) => {
        try {
            const res = await API.post('/auth/magic/verify', {token});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Invalid or expired link');
        }
    },

    // Email OTP (standalone)
    emailOtpSend: async (email) => {
        try {
            const res = await API.post('/auth/otp/email/send', {email});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Failed to send code');
        }
    },

    emailOtpVerify: async (email, code) => {
        try {
            const res = await API.post('/auth/otp/email/verify', {email, code});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Verification failed');
        }
    },

    // Phone OTP
    phoneOtpSend: async (phone) => {
        try {
            const res = await API.post('/auth/otp/phone/send', {phone});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Failed to send SMS');
        }
    },

    phoneOtpVerify: async (phone, code) => {
        try {
            const res = await API.post('/auth/otp/phone/verify', {phone, code});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Verification failed');
        }
    },

    // Google OAuth
    googleAuth: async (id_token) => {
        try {
            const res = await API.post('/auth/google', {id_token});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Google sign-in failed');
        }
    },

    logout: async (refresh_token) => {
        try {
            const res = await API.post('/auth/logout', {refresh_token});
            return res.data;
        } catch (err) {
            console.warn('Logout error (non-fatal):', err);
            return {status: 'logged_out'};
        }
    },

    refreshToken: async (refresh_token) => {
        try {
            const res = await API.post('/auth/refresh', {refresh_token});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || 'Token refresh failed');
        }
    },

    // ── Aureon ─────────────────────────────────────────────────────────────
    fetchAureonState: async () => (await API.get(`/aureon/state?t=${Date.now()}`)).data,
    fetchAureonAsset: async (ticker) => (await API.get(`/aureon/assets/${encodeURIComponent(ticker)}`)).data,
    fetchAureonActivity: async () => (await API.get('/aureon/activity')).data,
    fetchPortfolioHistory: async (days = 60) => (await API.get(`/aureon/portfolio/history?days=${days}`)).data,
    generateSignals: async () => (await API.post('/aureon/signals/generate')).data,
    listRecommendations: async (status) => {
        const q = status ? `?status=${encodeURIComponent(status)}` : '';
        return (await API.get(`/aureon/recommendations${q}`)).data;
    },
    applyRecommendation: async (extId) => (await API.post(`/aureon/recommendations/${encodeURIComponent(extId)}/apply`)).data,
    dismissRecommendation: async (extId, reason) =>
        (await API.post(`/aureon/recommendations/${encodeURIComponent(extId)}/dismiss`, {reason})).data,
    undoRecommendation: async (extId) => (await API.post(`/aureon/recommendations/${encodeURIComponent(extId)}/undo`)).data,
    seedRecommendations: async () => (await API.post('/aureon/recommendations/seed')).data,
    getAllocationTargets: async () => (await API.get('/config/allocation_targets')).data,
    upsertAllocationTarget: async (assetClass, payload) =>
        (await API.put(`/config/allocation_targets/${encodeURIComponent(assetClass)}`, payload)).data,
    fetchChartData: async (symbol, days = 365) => (await API.get(`/assets/${symbol}/chart`, {params: {days}})).data,
    getAssetQuote: async (symbol) => (await API.get(`/assets/${symbol}/quote`)).data,
    getAssetFundamentals: async (symbol, refresh = false) =>
        (await API.get(`/assets/${symbol}/fundamentals`, {params: refresh ? {refresh: true} : {}})).data,
    getAssetSignal: async (symbol) => (await API.get(`/signals/${symbol}`)).data,
    fetchNews: async () => (await API.get('/news')).data,
    refreshPrices: async () => (await API.post('/assets/price')).data,
    runGlobalAI: async () => (await API.post('/analytics/ai/global')).data,
    fetchBriefingHistory: async (limit = 30) => (await API.get(`/analytics/ai/briefings?limit=${limit}`)).data,
    getAITake: async (symbol) => (await API.get(`/analytics/ai/single/${symbol}`)).data,
    runSingleAI: async (symbol) => (await API.post(`/analytics/ai/single/${symbol}`)).data,
    analyzeNewsBatch: async () => (await API.post('/analytics/ai/news/batch')).data,
    syncBrokers: async (broker = 'zerodha') => (await API.post('/portfolio/sync', { broker })).data,
    getSyncStatus: async () => (await API.get('/portfolio/sync/status')).data,
    exportPortfolioCSV: async () => {
        const res = await API.get('/portfolio/export/csv', {responseType: 'blob'});
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aureon_portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },
    hardRefresh: async () => {
        try {
            return (await API.post('/pipeline/run')).data;
        } catch (err) {
            if (err.response && err.response.status === 429) {
                throw new Error(err.response.data.detail);
            }
            throw err;
        }
    },

    // ── User Profile (refactored to /api/users/me) ─────────────────────────
    getCurrentUserProfile: async () => (await API.get('/users/me')).data,
    updateCurrentUserProfile: async (payload) => (await API.put('/users/me', payload)).data,
    changeUserPassword: async (currentPassword, newPassword) =>
        (await API.post('/users/me/password', {current_password: currentPassword, new_password: newPassword})).data,
    deleteAccount: async () => (await API.delete('/users/me')).data,

    // ── Providers (refactored to /api/config/providers) ──────────────────────
    getProviders: async () => (await API.get('/config/providers')).data,
    updateProvider: async (providerName, payload) =>
        (await API.put(`/config/providers/${encodeURIComponent(providerName)}`, payload)).data,
    setProviderKey: async (providerName, keyName, value) =>
        (await API.put(`/config/providers/${encodeURIComponent(providerName)}/keys`, {key_name: keyName, value})).data,

    // ── Jobs (refactored to /api/config/jobs) ──────────────────────────────
    getJobs: async () => (await API.get(`/config/jobs?t=${Date.now()}`)).data,
    updateJob: async (jobName, payload) => (await API.put(`/config/jobs/${jobName}`, payload)).data,
    runJob: async (jobName) => (await API.post(`/config/jobs/${jobName}/run`)).data,
    getJobLogs: async (jobName, limit = 20) =>
        (await API.get(`/config/jobs/${jobName}/logs?limit=${limit}`)).data,

    // ── Transactions ────────────────────────────────────────────────────────
    createTransaction: async (payload) => {
        return (await API.post('/portfolio/transactions', payload)).data;
    },
    getTransactions: async ({ provider, asset, limit = 200 } = {}) => {
        const params = new URLSearchParams();
        if (provider) params.append('provider', provider);
        if (asset)    params.append('asset', asset);
        params.append('limit', limit);
        return (await API.get(`/portfolio/transactions?${params}`)).data;
    },
    importTransactions: async (file, dryRun = true, broker = null) => {
        const form = new FormData();
        form.append('file', file);
        const params = new URLSearchParams({dry_run: dryRun});
        if (broker) params.append('broker', broker);
        return (await API.post(`/portfolio/transactions/import?${params}`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        })).data;
    },
    importCAS: async (file, dryRun = true, password = null) => {
        const form = new FormData();
        form.append('file', file);
        const params = new URLSearchParams({dry_run: dryRun});
        if (password) params.append('password', password);
        return (await API.post(`/portfolio/cas/upload?${params}`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        })).data;
    },
    importNPS: async (file, dryRun = true) => {
        const form = new FormData();
        form.append('file', file);
        const params = new URLSearchParams({dry_run: dryRun});
        return (await API.post(`/portfolio/nps/upload?${params}`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        })).data;
    },
    importEPF: async (file, dryRun = true) => {
        const form = new FormData();
        form.append('file', file);
        const params = new URLSearchParams({dry_run: dryRun});
        return (await API.post(`/portfolio/epf/upload?${params}`, form, {
            headers: {'Content-Type': 'multipart/form-data'},
        })).data;
    },

    // ── Notifications ───────────────────────────────────────────────────────
    getNotifications: async () => (await API.get('/notifications/')).data,
    markNotificationRead: async (id) => (await API.put(`/notifications/${id}/read`)).data,
    markAllNotificationsRead: async (ids) =>
        Promise.all(ids.map(id => API.put(`/notifications/${id}/read`))),

    // ── Market Data ─────────────────────────────────────────────────────────
    getMarketIndices: async () => (await API.get('/market/indices')).data,
    getMarketSectors: async () => (await API.get('/market/sectors')).data,
    getMarketMovers: async () => (await API.get('/market/movers')).data,
    getMarketThemes: async () => (await API.get('/market/themes')).data,
    getMarketTheme: async (themeId) => (await API.get(`/market/themes/${themeId}`)).data,
    getThemeSignals: async (themeId) => (await API.get(`/market/themes/${themeId}/signals`)).data,
    getThemeNav: async (themeId, days = 365) => (await API.get(`/market/themes/${themeId}/nav?days=${days}`)).data,
    forkTheme: async (themeId, name) => (await API.post(`/market/themes/${themeId}/fork`, {name})).data,
    updateTheme: async (themeId, payload) => (await API.put(`/market/themes/${themeId}`, payload)).data,
    deleteTheme: async (themeId) => (await API.delete(`/market/themes/${themeId}`)).data,
    triggerBackfill: async (symbol) => (await API.post(`/market/symbols/${encodeURIComponent(symbol)}/backfill`)).data,
    getThemesForSymbol: async (symbol) => (await API.get(`/market/themes-for/${encodeURIComponent(symbol)}`)).data,
    getThemeAITake: async (themeId) => (await API.get(`/analytics/ai/theme/${themeId}`)).data,
    runThemeAI: async (themeId) => (await API.post(`/analytics/ai/theme/${themeId}`)).data,
    chatThemeAI: async (themeId, message) => (await API.post(`/analytics/ai/theme/${themeId}/chat`, {message})).data,
    getMarketSectorDetail: async (name) => (await API.get(`/market/sectors/${encodeURIComponent(name)}`)).data,
    searchGlobalSymbol: async (q) => (await API.get('/market/search', {params: {q}})).data,

    getMarketUniverse: async ({region, search, live = false} = {}) => {
        const params = new URLSearchParams();
        if (region) params.append('region', region);
        if (search) params.append('search', search);
        if (live) params.append('live', 'true');
        const q = params.toString();
        return (await API.get(`/market/universe${q ? '?' + q : ''}`)).data;
    },
    searchAssets: async (query) => {
        if (!query || !query.trim()) return {data: [], total: 0};
        return (await API.get('/assets', {params: {search: query.trim()}})).data;
    },
    refreshMarket: async () => (await API.post('/market/refresh')).data,

    // ── Watchlist ────────────────────────────────────────────────────────────
    getWatchlists: async () => (await API.get('/watchlist/')).data,
    createWatchlist: async (name) => (await API.post('/watchlist/', {name})).data,
    renameWatchlist: async (id, name) => (await API.put(`/watchlist/${id}`, {name})).data,
    deleteWatchlist: async (id) => (await API.delete(`/watchlist/${id}`)).data,
    addWatchlistSymbol: async (id, symbol) => (await API.post(`/watchlist/${id}/symbols`, {symbol})).data,
    removeWatchlistSymbol: async (id, symbol) => (await API.delete(`/watchlist/${id}/symbols/${encodeURIComponent(symbol)}`)).data,
    setWatchlistAlert: async (id, symbol, price) => (await API.put(`/watchlist/${id}/symbols/${encodeURIComponent(symbol)}/alert`, {price})).data,
    clearWatchlistAlert: async (id, symbol) => (await API.delete(`/watchlist/${id}/symbols/${encodeURIComponent(symbol)}/alert`)).data,

    generateSignalForSymbol: async (symbol, assetClass = 'equity') => {
        const assetType = assetClass === 'crypto' ? 'crypto' : 'equity';
        return (await API.post(`/signals/generate/${symbol}?asset_type=${assetType}`)).data;
    },

    askAboutContext: async (contextType, contextId, question) =>
        (await API.post('/aureon/ask', {context_type: contextType, context_id: contextId, question})).data,

    // ── Manual (illiquid) assets ─────────────────────────────────────────────
    createManualAsset: async (payload) => (await API.post('/portfolio/manual-assets', payload)).data,
    updateManualValuation: async (symbol, newValue, notes) =>
        (await API.put(`/portfolio/manual-assets/${encodeURIComponent(symbol)}/valuation`, {new_value: newValue, notes})).data,
};