/* Aureon data hook — hydrates from /api/aureon/state with mock fallback.
 *
 * If the backend has positions seeded, real data fills `holdings`, `signals`,
 * `recommendations`, `activity`, `classTarget`, `netWorth`, `dayDelta`.
 * Otherwise the mocks from `components/aureon/data.js` are returned so the UI
 * still renders during early development.
 */
import {useEffect, useState} from 'react';
import {
    HOLDINGS, SIGNALS, ACTIVITY, V3_RECS_ACTIVE, EXTRA_RECS, V3_PORTFOLIO_REC,
    CLASS_LABEL, CLASS_TARGET, NET_WORTH, DAY_DELTA_DOLLARS, DAY_DELTA_PCT,
    PRICE_SERIES, ASSET_EXTRAS, SIGNAL_BY_ID,
} from '../components/aureon/data';
import {apiService} from '../api/apiService';

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
    const hasApiRecs = recsActiveApi.length > 0 || recsAppliedApi.length > 0;

    return {
        loading,
        error,
        source: {mocked: !hasApiHoldings, partial: !api},
        holdings: hasApiHoldings ? api.holdings : HOLDINGS,
        classLabel: CLASS_LABEL,
        classTarget: (api?.classTarget && Object.keys(api.classTarget).length) ? api.classTarget : CLASS_TARGET,
        netWorth: api?.netWorth ?? NET_WORTH,
        dayDelta: api?.dayDelta ?? {dollars: DAY_DELTA_DOLLARS, pct: DAY_DELTA_PCT},
        signals: isNonEmpty(api?.signals) ? api.signals : SIGNALS,
        signalById: SIGNAL_BY_ID,
        activity: isNonEmpty(api?.activity) ? api.activity : ACTIVITY,
        recsActive: hasApiRecs ? recsActiveApi : V3_RECS_ACTIVE,
        recsExtra: hasApiRecs ? [] : EXTRA_RECS,
        recsApplied: recsAppliedApi,
        portfolioRec: V3_PORTFOLIO_REC,
        priceSeries: PRICE_SERIES,
        assetExtras: ASSET_EXTRAS,
        apiState: api,
    };
}
