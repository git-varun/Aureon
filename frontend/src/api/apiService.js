import axios from 'axios';

const API = axios.create({baseURL: 'http://localhost:8001/api', timeout: 60000});

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
            const res = await API.post('/auth/register', {
                email,
                password,
                first_name,
                last_name,
            });
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Registration failed');
        }
    },

    login: async (email, password) => {
        try {
            const res = await API.post('/auth/login', {email, password});
            return res.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.response?.data?.detail || 'Login failed');
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

    // ── Portfolio ──────────────────────────────────────────────────────────
    fetchState: async () => (await API.get(`/state?t=${new Date().getTime()}`)).data,
    fetchChartData: async (symbol) => (await API.get(`/assets/${symbol}/chart`)).data,
    fetchNews: async () => (await API.get('/news')).data,
    refreshPrices: async () => (await API.post('/price')).data,
    runGlobalAI: async () => (await API.post('/analytics/ai/global')).data,
    runSingleAI: async (symbol) => (await API.post(`/analytics/ai/single/${symbol}`)).data,
    analyzeNewsBatch: async () => (await API.post('/analytics/ai/news/batch')).data,
    syncBrokers: async () => (await API.post('/sync')).data,
    hardRefresh: async () => {
        try {
            return (await API.post('/sync/hard-refresh')).data;
        } catch (err) {
            if (err.response && err.response.status === 429) {
                throw new Error(err.response.data.detail);
            }
            throw err;
        }
    },
    fetchTaxSummary: async () => (await API.get('/tax/summary')).data,
    importTaxLots: async (file, broker = 'Groww', replace = false) => {
        const form = new FormData();
        form.append('file', file);
        return (await API.post(`/tax/import?broker=${broker}&replace=${replace}`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        })).data;
    },

    // ── User Profile (refactored to /api/users/me) ─────────────────────────
    getCurrentUserProfile: async () => (await API.get('/users/me')).data,
    updateCurrentUserProfile: async (payload) => (await API.put('/users/me', payload)).data,
    changeUserPassword: async (currentPassword, newPassword) =>
        (await API.post('/users/me/password', {current_password: currentPassword, new_password: newPassword})).data,

    // Legacy profile endpoints (kept for backward compatibility)
    getProfile: async () => (await API.get('/profile')).data,
    updateProfile: async (payload) => (await API.put('/profile', payload)).data,

    // ── Providers (refactored to /api/config/providers) ──────────────────────
    getProviders: async () => (await API.get('/config/providers')).data,
    updateProvider: async (providerName, payload) =>
        (await API.put(`/config/providers/${encodeURIComponent(providerName)}`, payload)).data,
    setProviderKey: async (providerName, keyName, value) =>
        (await API.put(`/config/providers/${encodeURIComponent(providerName)}/keys`, {key_name: keyName, value})).data,

    // ── Jobs (refactored to /api/config/jobs) ──────────────────────────────
    getJobs: async () => (await API.get('/config/jobs')).data,
    updateJob: async (jobName, payload) => (await API.put(`/config/jobs/${jobName}`, payload)).data,
    runJob: async (jobName) => (await API.post(`/config/jobs/${jobName}/run`)).data,
    getJobLogs: async (jobName, limit = 20) =>
        (await API.get(`/config/jobs/${jobName}/logs?limit=${limit}`)).data,

    // ── Ledger — Transactions ───────────────────────────────────────────────
    uploadTransactions: async (file, provider = 'Binance') => {
        const form = new FormData();
        form.append('file', file);
        return (await API.post(`/ledger/upload?provider=${encodeURIComponent(provider)}`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        })).data;
    },
    getTransactions: async ({ provider, asset, limit = 200 } = {}) => {
        const params = new URLSearchParams();
        if (provider) params.append('provider', provider);
        if (asset)    params.append('asset', asset);
        params.append('limit', limit);
        return (await API.get(`/ledger/transactions?${params}`)).data;
    },
};