import axios from 'axios';

const API = axios.create({baseURL: 'http://localhost:8001/api', timeout: 60000});

export const apiService = {
    // ── Portfolio ──────────────────────────────────────────────────────────
    fetchState: async () => (await API.get(`/state?t=${new Date().getTime()}`)).data,
    fetchChartData: async (symbol) => (await API.get(`/chart/${symbol}?t=${new Date().getTime()}`)).data,
    fetchNews: async () => (await API.get('/news')).data,
    refreshPrices: async () => (await API.post('/price')).data,
    runGlobalAI: async () => (await API.post('/ai/global')).data,
    runSingleAI: async (symbol) => (await API.post(`/ai/single/${symbol}`)).data,
    analyzeNewsBatch: async () => (await API.post('/ai/news/batch')).data,
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

    // ── Profile ────────────────────────────────────────────────────────────
    getProfile: async () => (await API.get('/profile')).data,
    updateProfile: async (payload) => (await API.put('/profile', payload)).data,

    // ── Providers ──────────────────────────────────────────────────────────
    getProviders: async () => (await API.get('/providers')).data,
    updateProvider: async (providerName, payload) =>
        (await API.put(`/providers/${encodeURIComponent(providerName)}`, payload)).data,
    setProviderKey: async (providerName, keyName, value) =>
        (await API.put(`/providers/${encodeURIComponent(providerName)}/keys`, { key_name: keyName, value })).data,

    // ── Jobs ───────────────────────────────────────────────────────────────
    getJobs: async () => (await API.get('/jobs')).data,
    updateJob: async (jobName, payload) => (await API.put(`/jobs/${jobName}`, payload)).data,
    runJob: async (jobName) => (await API.post(`/jobs/${jobName}/run`)).data,
    getJobLogs: async (jobName, limit = 20) =>
        (await API.get(`/jobs/${jobName}/logs?limit=${limit}`)).data,

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