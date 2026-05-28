/* Aureon data hook — hydrates from /api/aureon/state via TanStack Query. */
import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiService} from '@/api/apiService';
import {CLASS_LABEL, CLASS_TARGET, valueOf} from '@/components/aureon/utils';

export const AUREON_STATE_KEY = ['aureon-state'];

const isNonEmpty = (x) => Array.isArray(x) ? x.length > 0 : !!x;

export function useAureonData() {
    const {data: api, isLoading: loading, error, dataUpdatedAt} = useQuery({
        queryKey: AUREON_STATE_KEY,
        queryFn: () => apiService.fetchAureonState(),
    });

    const hasApiHoldings = isNonEmpty(api?.holdings);
    const recsActiveApi = api?.recommendations?.active || [];
    const recsAppliedApi = api?.recommendations?.applied || [];

    const holdings = useMemo(() => {
        if (!hasApiHoldings) return [];
        // Normalize ticker shape at the ingestion boundary so downstream pages
        // can use one canonical key format for lookups/routing.
        return api.holdings.map(h => ({
            ...h,
            ticker: h.ticker?.toUpperCase().replace(/\.NS$/i, '') ?? h.ticker,
        }));
    }, [hasApiHoldings, api?.holdings]);
    const signals = useMemo(() => isNonEmpty(api?.signals) ? api.signals : [], [api?.signals]);
    const netWorth = api?.netWorth ?? 0;

    const signalById = useMemo(() => Object.fromEntries(signals.map(s => [s.id, s])), [signals]);

    const allocByClass = useMemo(() => {
        const map = {};
        holdings.forEach(h => {
            map[h.class] = (map[h.class] || 0) + valueOf(h);
        });
        // Convert absolute class totals into allocation ratios for progress bars.
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
        allocByClass,
        unreadCount: api?.unreadCount ?? 0,
        marketPulse: api?.marketPulse ?? null,
        aiBriefing: api?.aiBriefing ?? null,
        apiState: api,
        dataUpdatedAt,
    };
}
