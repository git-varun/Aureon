/* eslint-disable react-refresh/only-export-components */
/* Aureon — global app state (recs, activity, search, drawer, toast).
 *
 * Phase 3: hydrates from /api/aureon/state and round-trips
 * apply/dismiss/undo to the backend optimistically. Reverts local state
 * and surfaces a toast on API failure.
 */
import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {apiService} from '../../api/apiService';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// Map an API rec (snake_case) → FE shape used by Aureon UI primitives.
const apiRecToFE = (r) => ({
    id: r.ext_id,
    status: r.status,
    strength: r.strength,
    action: r.action,
    scope: r.scope,
    title: r.title,
    impactOneLine: r.impact_one_line,
    confidence: r.confidence,
    horizon: r.horizon,
    change: r.change,
    impact: r.impact,
    reasoning: r.reasoning,
    conflictsWith: r.conflicts_with || [],
    signalIds: r.signal_ids || [],
});

export const AppProvider = ({children}) => {
    const [allRecs, setAllRecs] = useState([]);
    const [active, setActive] = useState([]);
    const [applied, setApplied] = useState([]);
    const [dismissed, setDismissed] = useState([]);
    const [activity, setActivity] = useState([]);
    const [drawer, setDrawer] = useState(null);
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const s = await apiService.fetchAureonState();
                if (cancelled) return;
                const recs = s?.recommendations;
                if (!recs) return;
                const all = [
                    ...(recs.active || []),
                    ...(recs.applied || []),
                    ...(recs.dismissed || []),
                ].map(apiRecToFE);
                if (all.length === 0) return;          // keep mocks
                setAllRecs(all);
                setActive((recs.active || []).map(r => r.ext_id));
                setApplied((recs.applied || []).map(r => ({
                    id: r.ext_id,
                    ts: r.applied_at ? new Date(r.applied_at).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : '',
                    predicted: r.predicted_impact,
                    realized: r.realized_impact,
                })));
                setDismissed((recs.dismissed || []).map(r => ({
                    id: r.ext_id,
                    ts: r.dismissed_at ? new Date(r.dismissed_at).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : '',
                    reason: r.dismiss_reason || 'User dismissed',
                })));
                if (Array.isArray(s.activity) && s.activity.length) setActivity(s.activity);
                setHydrated(true);
            } catch {
                /* keep mock state */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const recById = (id) => allRecs.find(r => r.id === id);

    const undo = (id) => {
        const prevActive = active;
        const prevApplied = applied;
        const prevDismissed = dismissed;
        setActive(a => a.includes(id) ? a : [...a, id]);
        setApplied(a => a.filter(x => x.id !== id));
        setDismissed(d => d.filter(x => x.id !== id));
        setToast(null);
        if (!hydrated) return;
        apiService.undoRecommendation(id).catch(err => {
            setActive(prevActive);
            setApplied(prevApplied);
            setDismissed(prevDismissed);
            setToast({text: `Undo failed: ${err?.message || 'network error'}`});
        });
    };

    const apply = (id) => {
        const r = recById(id);
        if (!r) return;
        const ts = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        const prevActive = active;
        const prevApplied = applied;
        const prevActivity = activity;
        setActive(a => a.filter(x => x !== id));
        setApplied(a => [...a, {id, ts, predicted: r.impact?.ret?.delta, realized: r.impact?.ret?.delta}]);
        setActivity(act => [{
            id: 'a-' + Date.now(), ts: `today · ${ts}`, kind: 'applied',
            action: r.action, asset: r.scope?.ref || 'PORT',
            detail: r.impactOneLine,
            predicted: r.impact?.ret?.delta, realized: r.impact?.ret?.delta,
        }, ...act]);
        setToast({text: `${r.action} ${r.scope?.ref || ''} applied`, undo: () => undo(id)});
        setTimeout(() => setToast(t => (t && t.text && t.text.includes(r.action)) ? null : t), 5500);
        if (!hydrated) return;
        apiService.applyRecommendation(id).catch(err => {
            setActive(prevActive);
            setApplied(prevApplied);
            setActivity(prevActivity);
            setToast({text: `Apply failed: ${err?.response?.data?.message || err?.message || 'network error'}`});
        });
    };

    const dismiss = (id, reason = 'User dismissed') => {
        const r = recById(id);
        if (!r) return;
        const ts = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        const prevActive = active;
        const prevDismissed = dismissed;
        const prevActivity = activity;
        setActive(a => a.filter(x => x !== id));
        setDismissed(d => [...d, {id, ts, reason}]);
        setActivity(act => [{
            id: 'a-' + Date.now(), ts: `today · ${ts}`, kind: 'dismissed',
            action: r.action, asset: r.scope?.ref || 'PORT',
            detail: `declined — ${reason.toLowerCase()}`,
        }, ...act]);
        if (!hydrated) return;
        apiService.dismissRecommendation(id, reason).catch(err => {
            setActive(prevActive);
            setDismissed(prevDismissed);
            setActivity(prevActivity);
            setToast({text: `Dismiss failed: ${err?.message || 'network error'}`});
        });
    };

    const value = useMemo(() => ({
        allRecs, active, applied, dismissed,
        apply, dismiss, undo,
        activity,
        drawer, setDrawer,
        search, setSearch,
        toast, setToast,
        hydrated,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [allRecs, active, applied, dismissed, activity, drawer, search, toast, hydrated]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
