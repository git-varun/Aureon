import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
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

    // GET /config/allocation_targets returns {} (a successful, empty response)
    // when the user hasn't saved any targets yet — a real state, distinct from
    // the query still being in flight or having failed. CLASS_TARGET (hardcoded
    // suggested weights) may only stand in for that genuine-empty case; while
    // loading or on error it must NOT silently substitute CLASS_TARGET, since
    // that would render as if it were the user's real saved targets with no
    // visual difference. See classTargetsLoading/classTargetsError/
    // classTargetsUsingDefaults below, which callers must use to distinguish
    // these states in the UI.
    const targetsLoaded = allocationTargetsQuery.isSuccess;
    const targetsUsingDefaults = targetsLoaded && Object.keys(allocationTargetsQuery.data || {}).length === 0;
    const classTarget = targetsLoaded
        ? (targetsUsingDefaults ? CLASS_TARGET : allocationTargetsQuery.data)
        : {};

    // Hydrate position details (name, class, sector, price) AND per-position
    // signals in one batched call instead of 2 requests per position (was
    // N+1: one /assets search + one /signals/{symbol} per holding).
    const batchSymbols = useMemo(
        () => [...new Set(positions.map(p => p.symbol).filter(Boolean))].sort(),
        [positions]
    );

    const assetsBatchQuery = useQuery({
        queryKey: ["assets-batch", batchSymbols.join(",")],
        queryFn: () => apiService.getAssetsBatch(batchSymbols),
        enabled: batchSymbols.length > 0,
        staleTime: 60000,
    });

    const assetsBatch = assetsBatchQuery.data?.data || {};

    const assetsMap = useMemo(() => {
        const map = {};
        positions.forEach(pos => {
            const entry = assetsBatch[pos.symbol.toUpperCase()];
            // No match means /assets/batch has no Asset row for this symbol (crypto,
            // EPF, oddly-formatted MF symbols are the common cases) — defaulting
            // to a real class like 'stocks' would silently misclassify it in
            // the allocation chart. Surface it as its own bucket instead.
            map[pos.symbol] = entry?.asset || {sym: pos.symbol, name: pos.symbol, price: pos.avg_buy_price, class: 'unclassified', sector: 'Unclassified'};
        });
        return map;
    }, [assetsBatch, positions]);

    // Construct the canonical holdings structure expected by components
    const holdings = useMemo(() => {
        return positions.map(pos => {
            const assetData = assetsMap[pos.symbol] || {};
            // pos.price is the same resolve_position_price() value the backend's
            // snapshot.market_value (netWorth) is built from — using it here keeps
            // allocByClass's numerator and netWorth's denominator on one price
            // source. assetData.price (from /assets search) disagrees per-asset.
            // price_source === 'unavailable' means the backend explicitly has no
            // usable value (e.g. an EPF estimate with no FY rate configured) —
            // falling through to avg_buy_price here would relabel that cost basis
            // as a live price and mask the "unavailable" state from the UI.
            const price = pos.price_source === 'unavailable' ? null : (pos.price ?? assetData.price ?? pos.avg_buy_price ?? null);
            return {
                id: pos.id,
                ticker: pos.symbol.toUpperCase().replace(/\.NS$/i, ''),
                name: assetData.name || pos.symbol,
                class: assetData.class || 'stocks',
                // price_source "manual"/"epf_estimated" means resolve_position_price()
                // found a user-entered valuation, not a market quote — the same
                // positions PfHoldingsTable/TierChip need flagged "passive" (manually
                // revalued, no live Trade action) get it from here.
                tier: (pos.price_source === 'manual' || pos.price_source === 'epf_estimated') ? 'passive' : 'active',
                qty: pos.quantity,
                cost: pos.avg_buy_price,
                price: price,
                dayPct: assetData.dayPct ?? null,
                sector: assetData.sector || 'General',
                spark: price != null ? [price] : [],
                wallet: pos.wallet,
                leverage: pos.leverage,
                liquidationPrice: pos.liquidation_price,
                unrealizedPnl: pos.unrealized_pnl,
                marginUsd: pos.margin_usd,
                side: pos.side,
                priceSource: pos.price_source,
                epfEstimateBasis: pos.epf_estimate_basis,
                unavailableReason: pos.unavailable_reason,
                currency: pos.currency || 'USD',
            };
        });
    }, [positions, assetsMap]);

    // netWorth must be built from the exact same holdings values allocByClass
    // sums over, or the two can disagree: holdings come from /positions (10s
    // stale-time, always live-priced), while snapshot.market_value is a Redis
    // snapshot cached up to 15 min (see cache_portfolio_snapshot). Deriving
    // netWorth from snapshot.market_value let the allocation numerator (live)
    // and denominator (up to 15min stale) drift apart after any price move,
    // so allocByClass wouldn't sum to 100%. Summing holdings directly keeps
    // numerator and denominator on one source by construction. cash_balance
    // still comes from the snapshot (holdings carry no cash) but is null
    // whenever it isn't tracked (no cash-tracking mechanism exists yet — see
    // generate_portfolio_snapshot), which `|| 0` correctly excludes from the
    // sum rather than folding an unknown into a fake zero.
    const netWorth = useMemo(() => {
        // Holdings mix native currencies (INR for NSE/EPF/NPS/mutual funds,
        // USD otherwise) — normalize each to INR before summing.
        const holdingsValue = holdings.reduce((s, h) => s + valueOfBase(h, fxRates), 0);
        return holdingsValue + (snapshot?.cash_balance || 0);
    }, [holdings, snapshot, fxRates]);

    // Only meaningful once the snapshot has actually loaded — while it's still
    // loading we don't yet know either way, so no "not tracked" claim is made.
    const cashNotTracked = snapshot != null && snapshot.cash_balance == null;

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

    // 8. Per-position signals — from the same batched /assets/batch response above.
    const signals = useMemo(() => {
        return positions
            .map((pos) => {
                const raw = assetsBatch[pos.symbol.toUpperCase()]?.signal;
                // signal_type is null for assets the pipeline structurally can't
                // cover (e.g. crypto futures) — backend returns 200 + nulls
                // instead of 404 for these, so filter them out here explicitly.
                if (!raw || raw.signal_type == null) return null;
                const rsi = raw.rsi_14 ?? 50;
                const severity = (rsi > 70 || rsi < 30) ? 'high' : (rsi > 60 || rsi < 40) ? 'med' : 'low';
                const kind = (rsi > 70 || rsi < 30) ? 'volatility' : 'momentum';
                // BUY/SELL/HOLD -> bull/bear/neutral: real backend field, not a guess.
                const direction = raw.signal_type === 'BUY' ? 'bull' : raw.signal_type === 'SELL' ? 'bear' : 'neutral';
                return {
                    id: `sig-${raw.symbol}`,
                    kind,
                    asset: raw.symbol,
                    severity,
                    direction,
                    confidence: raw.confidence ?? null,
                    ts: raw.created_at,
                    text: raw.rationale || `RSI ${rsi.toFixed(0)} — ${raw.signal_type}`,
                    linkedRec: null,
                };
            })
            .filter(Boolean);
    }, [positions, assetsBatch]);

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

    // isPending (not isLoading) — isLoading is isPending && isFetching, which stays
    // false the whole time these queries sit disabled waiting on activePortfolioId
    // (enabled: !!activePortfolioId), so it never trips the loading UI during that window.
    const loading = positionsQuery.isPending || snapshotQuery.isPending || recommendationsQuery.isPending || transactionsQuery.isPending;
    const error = positionsQuery.error || snapshotQuery.error || recommendationsQuery.error || transactionsQuery.error;

    return {
        loading,
        error,
        historySnapshots,
        historyLoading: historyQuery.isPending,
        historyError: historyQuery.error,
        holdings,
        classLabel: CLASS_LABEL,
        netWorth,
        cashNotTracked,
        investedValue: snapshot ? (snapshot.market_value || 0) - (snapshot.total_return || 0) : null,
        unrealizedPnl: snapshot ? (snapshot.total_return ?? 0) - (snapshot.realized_pnl ?? 0) : null,
        realizedPnl: snapshot ? (snapshot.realized_pnl ?? null) : null,
        dayDelta: {dollars: snapshot?.daily_return || 0, pct: (snapshot?.daily_return / (netWorth || 1)) || 0},
        signals,
        signalById,
        activity,
        portfolioRec: null,
        allocByClass,
        classTarget,
        classTargetsLoading: allocationTargetsQuery.isPending,
        classTargetsError: allocationTargetsQuery.error,
        classTargetsUsingDefaults: targetsUsingDefaults,
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
    };
}
