import {useMemo} from 'react';
import {useQuery, useQueries} from '@tanstack/react-query';
import {apiService} from '@/api/apiService';
import {useOrganization} from '@/contexts/OrganizationContext';
import {usePortfolio} from '@/contexts/PortfolioContext';
import {CLASS_LABEL, CLASS_TARGET, valueOf} from '@/components/aureon/utils';

export const AUREON_STATE_KEY = ['aureon-state']; // Kept for backward compatibility references

export function useAureonData() {
    const {activeOrgId} = useOrganization();
    const {activePortfolioId} = usePortfolio();

    // 1. Positions Query (Tenant-Aware)
    const positionsQuery = useQuery({
        queryKey: ["org", activeOrgId, "portfolio", activePortfolioId, "positions"],
        queryFn: () => apiService.listPositions(activeOrgId, activePortfolioId),
        enabled: !!activeOrgId && !!activePortfolioId,
        staleTime: 10000,
    });

    const positions = positionsQuery.data || [];

    // 2. Snapshot Query (Tenant-Aware)
    const snapshotQuery = useQuery({
        queryKey: ["org", activeOrgId, "portfolio", activePortfolioId, "snapshot"],
        queryFn: () => apiService.getPortfolioSnapshot(activeOrgId, activePortfolioId),
        enabled: !!activeOrgId && !!activePortfolioId,
        staleTime: 10000,
    });

    const snapshot = snapshotQuery.data || null;

    // 3. Recommendations Query (Tenant-Aware)
    const recommendationsQuery = useQuery({
        queryKey: ["org", activeOrgId, "recommendations"],
        queryFn: () => apiService.listRecommendations(activeOrgId),
        enabled: !!activeOrgId,
        staleTime: 15000,
    });

    const recommendations = recommendationsQuery.data || [];

    // 4. Activity/Transactions Query (Tenant-Aware)
    const transactionsQuery = useQuery({
        queryKey: ["org", activeOrgId, "portfolio", activePortfolioId, "transactions"],
        queryFn: () => apiService.listTransactions(activeOrgId, activePortfolioId),
        enabled: !!activeOrgId && !!activePortfolioId,
        staleTime: 10000,
    });

    const activity = transactionsQuery.data || [];

    // 5. Notifications Query
    const notificationsQuery = useQuery({
        queryKey: ["org", activeOrgId, "notifications"],
        queryFn: () => apiService.getNotifications(),
        enabled: !!activeOrgId,
        staleTime: 15000,
    });

    const notifications = notificationsQuery.data || [];

    // 6. AI Briefings Query (Tenant-Aware)
    const aiBriefingsQuery = useQuery({
        queryKey: ["org", activeOrgId, "ai-briefings"],
        queryFn: () => apiService.fetchBriefingHistory(30),
        enabled: !!activeOrgId,
        staleTime: 30000,
    });

    const briefings = aiBriefingsQuery.data || [];
    const aiBriefing = briefings.length > 0 ? briefings[0] : null;

    // 7. Allocation Targets Config
    const allocationTargetsQuery = useQuery({
        queryKey: ["org", activeOrgId, "config", "allocation-targets"],
        queryFn: () => apiService.getAllocationTargets(),
        enabled: !!activeOrgId,
        staleTime: 60000,
    });

    const allocationTargets = allocationTargetsQuery.data || CLASS_TARGET;

    // Hydrate position details (name, class, sector, price) by searching assets in parallel
    const assetQueries = useQueries({
        queries: positions.map(pos => ({
            queryKey: ["asset-detail", pos.symbol],
            queryFn: async () => {
                const results = await apiService.searchAssets(pos.symbol);
                const match = results?.data?.find(a => a.sym.toUpperCase() === pos.symbol.toUpperCase());
                return match || {sym: pos.symbol, name: pos.symbol, price: pos.avg_buy_price, class: 'stocks', sector: 'General'};
            },
            staleTime: 60000,
            enabled: !!pos.symbol,
        }))
    });

    const assetsMap = useMemo(() => {
        const map = {};
        assetQueries.forEach((q, idx) => {
            if (q.data && positions[idx]) {
                map[positions[idx].symbol] = q.data;
            }
        });
        return map;
    }, [assetQueries, positions]);

    // Construct the canonical holdings structure expected by components
    const holdings = useMemo(() => {
        return positions.map(pos => {
            const assetData = assetsMap[pos.symbol] || {};
            const price = assetData.price || pos.avg_buy_price || 100.0;
            return {
                id: pos.symbol,
                ticker: pos.symbol.toUpperCase().replace(/\.NS$/i, ''),
                name: assetData.name || pos.symbol,
                class: assetData.class || 'stocks',
                tier: 'active',
                qty: pos.quantity,
                cost: pos.avg_buy_price,
                price: price,
                dayPct: assetData.dayPct || 0.0,
                sector: assetData.sector || 'General',
                beta: 1.0,
                spark: [price],
            };
        });
    }, [positions, assetsMap]);

    const netWorth = useMemo(() => {
        if (snapshot) {
            return (snapshot.market_value || 0) + (snapshot.cash_balance || 0);
        }
        return holdings.reduce((s, h) => s + valueOf(h), 0);
    }, [snapshot, holdings]);

    const allocByClass = useMemo(() => {
        const map = {};
        holdings.forEach(h => {
            map[h.class] = (map[h.class] || 0) + valueOf(h);
        });
        if (netWorth > 0) {
            Object.keys(map).forEach(k => {
                map[k] /= netWorth;
            });
        }
        return map;
    }, [holdings, netWorth]);

    const techTarget = 0.28;
    const { techWt, techDriftPp, techDriftLabel, techDriftProse } = useMemo(() => {
        const investable = holdings.filter(h => h.tier !== 'passive');
        const base = investable.reduce((s, h) => s + valueOf(h), 0) || 1;
        const tech = investable.filter(h => h.sector === 'Tech').reduce((s, h) => s + valueOf(h), 0);
        const wt = tech / base;
        const driftPp = (wt - techTarget) * 100;
        const driftLabel = (driftPp >= 0 ? '+' : '−') + Math.abs(driftPp).toFixed(1) + 'pp';
        const driftProse = `${Math.abs(driftPp).toFixed(1)}pp ${driftPp >= 0 ? 'above' : 'below'} target`;
        return { techWt: wt, techDriftPp: driftPp, techDriftLabel: driftLabel, techDriftProse: driftProse };
    }, [holdings]);

    const signals = [];
    const signalById = {};

    const loading = positionsQuery.isLoading || snapshotQuery.isLoading || recommendationsQuery.isLoading || transactionsQuery.isLoading;
    const error = positionsQuery.error || snapshotQuery.error || recommendationsQuery.error || transactionsQuery.error;

    return {
        loading,
        error,
        holdings,
        classLabel: CLASS_LABEL,
        classTarget: allocationTargets,
        netWorth,
        dayDelta: {dollars: snapshot?.daily_return || 0, pct: (snapshot?.daily_return / (netWorth || 1)) || 0},
        signals,
        signalById,
        activity,
        recsActive: recommendations.filter(r => r.status === 'active'),
        recsApplied: recommendations.filter(r => r.status === 'applied'),
        portfolioRec: null,
        allocByClass,
        unreadCount: notifications.filter(n => !n.read).length,
        marketPulse: null,
        aiBriefing,
        freshness: {},
        goalProgress: null,
        apiState: {holdings, netWorth, activity},
        techTarget,
        techWt,
        techDriftPp,
        techDriftLabel,
        techDriftProse,
    };
}
