/* Aureon data hook — hydrates from /api/aureon/state. */
import {useEffect, useMemo, useState} from 'react';
import {apiService} from '../api/apiService';
import {CLASS_LABEL, CLASS_TARGET, valueOf} from '../components/aureon/utils';

const isNonEmpty = (x) => Array.isArray(x) ? x.length > 0 : !!x;

export function useAureonData() {
    const [api, setApi] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await apiService.fetchAureonState();
                if (!cancelled) setApi(res);
            } catch (e) {
                if (!cancelled) setError(e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const hasApiHoldings = isNonEmpty(api?.holdings);
    const recsActiveApi = api?.recommendations?.active || [];
    const recsAppliedApi = api?.recommendations?.applied || [];

    const holdings = useMemo(() => hasApiHoldings ? api.holdings : [], [hasApiHoldings, api?.holdings]);
    const signals = useMemo(() => isNonEmpty(api?.signals) ? api.signals : [], [api?.signals]);
    const netWorth = api?.netWorth ?? 0;

    const signalById = useMemo(() => Object.fromEntries(signals.map(s => [s.id, s])), [signals]);

    const allocByClass = useMemo(() => {
        const map = {};
        holdings.forEach(h => {
            map[h.class] = (map[h.class] || 0) + valueOf(h);
        });
        if (netWorth > 0) Object.keys(map).forEach(k => map[k] /= netWorth);
        return map;
    }, [holdings, netWorth]);

    return {
        loading,
        error,
        holdings,
        classLabel: CLASS_LABEL,
        classTarget: (api?.classTarget && Object.keys(api.classTarget).length) ? api.classTarget : CLASS_TARGET,
        netWorth,
        dayDelta: api?.dayDelta ?? {dollars: 0, pct: 0},
        signals,
        signalById,
        activity: isNonEmpty(api?.activity) ? api.activity : [],
        recsActive: recsActiveApi,
        recsApplied: recsAppliedApi,
        portfolioRec: api?.portfolioRec ?? null,
        priceSeries: api?.priceSeries ?? {},
        assetExtras: api?.assetExtras ?? {},
        allocByClass,
        unreadCount: api?.unreadCount ?? 0,
        apiState: api,
    };
}
