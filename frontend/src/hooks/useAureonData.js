import {useMemo} from 'react';
import {useQuery, useQueries} from '@tanstack/react-query';
import {apiService} from '@/api/apiService';
import {usePortfolio} from '@/contexts/PortfolioContext';
import {useV4} from '@/contexts/V4Context';
import {CLASS_LABEL, CLASS_TARGET, valueOfBase} from '@/components/aureon/utils';

export const AUREON_STATE_KEY = ['aureon-state']; // Kept for backward compatibility references

export function useAureonData() {
    const {activePortfolioId} = usePortfolio();
    const {fxRates} = useV4();

    // 1. Positions Query
    const positionsQuery = useQuery({
        queryKey: ["portfolio", activePortfolioId, "positions"],
        queryFn: () => apiService.listPositions(activePortfolioId),
        enabled: !!activePortfolioId,
        staleTime: 10000,
    });

    const positions = positionsQuery.data || [];

    // 2. Snapshot Query
    const snapshotQuery = useQuery({
        queryKey: ["portfolio", activePortfolioId, "snapshot"],
        queryFn: () => apiService.getPortfolioSnapshot(activePortfolioId),
        enabled: !!activePortfolioId,
        staleTime: 10000,
    });

    const snapshot = snapshotQuery.data || null;

    // 2b. History Query (90-day net-worth reconstruction, see PortfolioService.get_history)
    const historyQuery = useQuery({
        queryKey: ["portfolio", activePortfolioId, "history", 90],
        queryFn: () => apiService.fetchPortfolioHistory(activePortfolioId, 90),
        enabled: !!activePortfolioId,
        staleTime: 60000,
    });

    const historySnapshots = historyQuery.data?.snapshots || [];

    // 3. Recommendations Query
    const recommendationsQuery = useQuery({
        queryKey: ["recommendations"],
        queryFn: () => apiService.listRecommendations(),
        staleTime: 15000,
    });

    // 4. Activity/Transactions Query
    const transactionsQuery = useQuery({
        queryKey: ["portfolio", activePortfolioId, "transactions"],
        queryFn: () => apiService.listTransactions(activePortfolioId),
        enabled: !!activePortfolioId,
        staleTime: 10000,
    });

    const activity = transactionsQuery.data || [];

    // 5. Notifications Query
    const notificationsQuery = useQuery({
        queryKey: ["notifications"],
        queryFn: () => apiService.getNotifications(),
        staleTime: 15000,
    });

    const notifications = notificationsQuery.data || [];

    // 6. AI Briefings Query
    const aiBriefingsQuery = useQuery({
        queryKey: ["ai-briefings"],
        queryFn: () => apiService.fetchBriefingHistory(30),
        staleTime: 30000,
    });

    const briefings = aiBriefingsQuery.data || [];
    const aiBriefing = briefings.length > 0 ? briefings[0] : null;

    // 7. Allocation Targets Config
    const allocationTargetsQuery = useQuery({
        queryKey: ["config", "allocation-targets"],
        queryFn: () => apiService.getAllocationTargets(),
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
            // pos.price is the same resolve_position_price() value the backend's
            // snapshot.market_value (netWorth) is built from — using it here keeps
            // allocByClass's numerator and netWorth's denominator on one price
            // source. assetData.price (from /assets search) disagrees per-asset.
            const price = pos.price ?? assetData.price ?? pos.avg_buy_price ?? null;
            return {
                id: pos.symbol,
                ticker: pos.symbol.toUpperCase().replace(/\.NS$/i, ''),
                name: assetData.name || pos.symbol,
                class: assetData.class || 'stocks',
                tier: 'active',
                qty: pos.quantity,
                cost: pos.avg_buy_price,
                price: price,
                dayPct: assetData.dayPct ?? null,
                sector: assetData.sector || 'General',
                beta: 1.0,
                spark: price != null ? [price] : [],
                wallet: pos.wallet,
                leverage: pos.leverage,
                liquidationPrice: pos.liquidation_price,
                unrealizedPnl: pos.unrealized_pnl,
                marginUsd: pos.margin_usd,
                side: pos.side,
                priceSource: pos.price_source,
                epfEstimateBasis: pos.epf_estimate_basis,
                currency: pos.currency || 'USD',
            };
        });
    }, [positions, assetsMap]);

    const netWorth = useMemo(() => {
        if (snapshot) {
            return (snapshot.market_value || 0) + (snapshot.cash_balance || 0);
        }
        // Holdings mix native currencies (INR for NSE/EPF/NPS/mutual funds,
        // USD otherwise) — normalize each to INR before summing.
        return holdings.reduce((s, h) => s + valueOfBase(h, fxRates), 0);
    }, [snapshot, holdings, fxRates]);

    const allocByClass = useMemo(() => {
        const map = {};
        holdings.forEach(h => {
            map[h.class] = (map[h.class] || 0) + valueOfBase(h, fxRates);
        });
        if (netWorth > 0) {
            Object.keys(map).forEach(k => {
                map[k] /= netWorth;
            });
        }
        return map;
    }, [holdings, netWorth, fxRates]);

    const techTarget = 0.28;
    const { techWt, techDriftPp, techDriftLabel, techDriftProse } = useMemo(() => {
        const investable = holdings.filter(h => h.tier !== 'passive');
        const base = investable.reduce((s, h) => s + valueOfBase(h, fxRates), 0) || 1;
        const tech = investable.filter(h => h.sector === 'Tech').reduce((s, h) => s + valueOfBase(h, fxRates), 0);
        const wt = tech / base;
        const driftPp = (wt - techTarget) * 100;
        const driftLabel = (driftPp >= 0 ? '+' : '−') + Math.abs(driftPp).toFixed(1) + 'pp';
        const driftProse = `${Math.abs(driftPp).toFixed(1)}pp ${driftPp >= 0 ? 'above' : 'below'} target`;
        return { techWt: wt, techDriftPp: driftPp, techDriftLabel: driftLabel, techDriftProse: driftProse };
    }, [holdings, fxRates]);

    // 8. Per-position signals from RSI/signal endpoint
    const signalQueries = useQueries({
        queries: positions.map(pos => ({
            queryKey: ['signal', pos.symbol],
            queryFn: async () => {
                try {
                    return await apiService.getAssetSignal(pos.symbol);
                } catch (e) {
                    if (e?.response?.status === 404) return null;
                    throw e;
                }
            },
            enabled: positions.length > 0 && !!pos.symbol,
            staleTime: 120000,
        }))
    });

    const signals = useMemo(() => {
        return signalQueries
            .map((q) => {
                const raw = q.data;
                // signal_type is null for assets the pipeline structurally can't
                // cover (e.g. crypto futures) — backend returns 200 + nulls
                // instead of 404 for these, so filter them out here explicitly.
                if (!raw || raw.signal_type == null) return null;
                const rsi = raw.rsi_14 ?? 50;
                const severity = (rsi > 70 || rsi < 30) ? 'high' : (rsi > 60 || rsi < 40) ? 'med' : 'low';
                const kind = (rsi > 70 || rsi < 30) ? 'volatility' : 'momentum';
                return {
                    id: `sig-${raw.symbol}`,
                    kind,
                    asset: raw.symbol,
                    severity,
                    ts: raw.created_at,
                    text: raw.rationale || `RSI ${rsi.toFixed(0)} — ${raw.signal_type}`,
                    linkedRec: null,
                };
            })
            .filter(Boolean);
    }, [signalQueries]);

    const signalById = useMemo(() => Object.fromEntries(signals.map(s => [s.id, s])), [signals]);

    // 9. fetch_news job logs for the News freshness tile.
    // JobConfig.last_run_at (GET /config/jobs) is only set by the manual job-run
    // trigger, never by scheduled Celery-beat runs — so it stays null for a job
    // that only ever runs on schedule. Read the job's own run log instead, same
    // pattern GET /portfolio/sync/status already uses for broker syncs.
    const fetchNewsLogQuery = useQuery({
        queryKey: ['config', 'jobs', 'fetch_news', 'logs'],
        queryFn: () => apiService.getJobLogs('fetch_news', 1),
        staleTime: 60000,
    });

    const fetchNewsLastRunAt = useMemo(() => {
        const last = fetchNewsLogQuery.data?.logs?.[0];
        return last?.status === 'SUCCESS' ? last.ended_at : null;
    }, [fetchNewsLogQuery.data]);

    // AI-eval freshness tile must reflect the real outcome of the last
    // daily_briefing run, not just AIBriefing.created_at — a failed run
    // leaves that timestamp stale/unchanged, which looks identical to
    // "just hasn't run in a while" unless the run's own status is surfaced.
    const dailyBriefingLogQuery = useQuery({
        queryKey: ['config', 'jobs', 'daily_briefing', 'logs'],
        queryFn: () => apiService.getJobLogs('daily_briefing', 1),
        staleTime: 60000,
    });

    const dailyBriefingLastRun = dailyBriefingLogQuery.data?.logs?.[0] || null;

    // Prices freshness tile must reflect actual market-quote staleness, not
    // portfolio-snapshot regeneration recency — a manual valuation edit or an
    // unrelated transaction/import both invalidate the snapshot cache and
    // bump its updated_at without a single real quote having been fetched.
    // Use the oldest LatestQuote.updated_at among market-sourced positions
    // instead (price_source === 'market' only — manual/cost_basis positions
    // don't carry a quote_updated_at). No market-sourced positions at all
    // means genuinely "unknown", not "live".
    const marketQuotedPositions = useMemo(() => (
        positions.filter(p => p.price_source === 'market' && p.quote_updated_at)
    ), [positions]);

    const oldestMarketQuoteAt = useMemo(() => {
        const marketQuoteTimes = marketQuotedPositions
            .map(p => new Date(p.quote_updated_at).getTime())
            .filter(t => !isNaN(t));
        return marketQuoteTimes.length ? new Date(Math.min(...marketQuoteTimes)).toISOString() : null;
    }, [marketQuotedPositions]);

    const loading = positionsQuery.isLoading || snapshotQuery.isLoading || recommendationsQuery.isLoading || transactionsQuery.isLoading;
    const error = positionsQuery.error || snapshotQuery.error || recommendationsQuery.error || transactionsQuery.error;

    return {
        loading,
        error,
        historySnapshots,
        historyLoading: historyQuery.isLoading,
        historyError: historyQuery.error,
        holdings,
        classLabel: CLASS_LABEL,
        classTarget: allocationTargets,
        netWorth,
        investedValue: snapshot ? (snapshot.market_value || 0) - (snapshot.total_return || 0) : null,
        unrealizedPnl: snapshot ? (snapshot.total_return ?? null) : null,
        dayDelta: {dollars: snapshot?.daily_return || 0, pct: (snapshot?.daily_return / (netWorth || 1)) || 0},
        signals,
        signalById,
        activity,
        portfolioRec: null,
        allocByClass,
        unreadCount: notifications.filter(n => !n.read).length,
        marketPulse: null,
        aiBriefing,
        freshness: {
            refresh_prices: oldestMarketQuoteAt,
            refresh_prices_count: marketQuotedPositions.length,
            fetch_news: fetchNewsLastRunAt,
            daily_briefing: aiBriefing?.created_at ?? null,
            daily_briefing_status: dailyBriefingLastRun?.status ?? null,
            daily_briefing_error: dailyBriefingLastRun?.error_message ?? null,
            portfolio_snapshot: snapshot?.updated_at ?? null,
        },
        goalProgress: null,
        apiState: {holdings, netWorth, activity},
        techTarget,
        techWt,
        techDriftPp,
        techDriftLabel,
        techDriftProse,
    };
}
