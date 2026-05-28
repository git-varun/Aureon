/* eslint-disable react-refresh/only-export-components */
/* Aureon — global app state (recs, activity, search, drawer, toast). */
import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiService} from '../../api/apiService';
import {AUREON_STATE_KEY} from '../../hooks/useAureonData';

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
    const {data: s, isSuccess} = useQuery({
        queryKey: AUREON_STATE_KEY,
        queryFn: () => apiService.fetchAureonState(),
    });

    const [allRecs, setAllRecs] = useState([]);
    const [active, setActive] = useState([]);
    const [applied, setApplied] = useState([]);
    const [dismissed, setDismissed] = useState([]);
    const [activity, setActivity] = useState([]);
    const [drawer, setDrawer] = useState(null);
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);
    const hydrated = isSuccess;

    useEffect(() => {
        if (!s) return;
        const recs = s?.recommendations;
        if (!recs) return;
        const all = [
            ...(recs.active || []),
            ...(recs.applied || []),
            ...(recs.dismissed || []),
        ].map(apiRecToFE);
        if (all.length === 0) return;
        setAllRecs(all);
        setActive((recs.active || []).map(r => r.ext_id));
        setApplied((recs.applied || []).map(r => ({
            id: r.ext_id,
            ts: r.applied_at ? new Date(r.applied_at).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}) : '',
            predicted: r.predicted_impact,
            realized: r.realized_impact ?? null,
        })));
        setDismissed((recs.dismissed || []).map(r => ({
            id: r.ext_id,
            ts: r.dismissed_at ? new Date(r.dismissed_at).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}) : '',
            reason: r.dismiss_reason || 'User dismissed',
        })));
        if (Array.isArray(s.activity) && s.activity.length) setActivity(s.activity);
    }, [s]);

    const recById = useCallback((id) => allRecs.find(r => r.id === id), [allRecs]);

    const _showToast = useCallback((t) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast(t);
        if (t) toastTimerRef.current = setTimeout(() => setToast(null), 5500);
    }, []);

    const undo = useCallback((id) => {
        const prevActive = active;
        const prevApplied = applied;
        const prevDismissed = dismissed;
        setActive(a => a.includes(id) ? a : [...a, id]);
        setApplied(a => a.filter(x => x.id !== id));
        setDismissed(d => d.filter(x => x.id !== id));
        _showToast(null);
        if (!hydrated) return;
        apiService.undoRecommendation(id).catch(err => {
            setActive(prevActive);
            setApplied(prevApplied);
            setDismissed(prevDismissed);
            _showToast({text: `Undo failed: ${err?.message || 'network error'}`});
        });
    }, [active, applied, dismissed, hydrated, _showToast]);

    const apply = useCallback((id) => {
        const r = recById(id);
        if (!r) return;
        const ts = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        const prevActive = active;
        const prevApplied = applied;
        const prevActivity = activity;
        setActive(a => a.filter(x => x !== id));
        // realized is null on apply — it's unknowable until the trade settles
        setApplied(a => [...a, {id, ts, predicted: r.impact?.ret?.delta, realized: null}]);
        setActivity(act => [{
            id: 'a-' + Date.now(), extId: id, ts: `today · ${ts}`, kind: 'applied',
            action: r.action, asset: r.scope?.ref || 'PORT',
            detail: r.impactOneLine,
            predicted: r.impact?.ret?.delta, realized: null,
        }, ...act]);
        _showToast({text: `${r.action} ${r.scope?.ref || ''} applied`, undoId: id});
        if (!hydrated) return;
        apiService.applyRecommendation(id).catch(err => {
            setActive(prevActive);
            setApplied(prevApplied);
            setActivity(prevActivity);
            _showToast({text: `Apply failed: ${err?.response?.data?.message || err?.message || 'network error'}`});
        });
    }, [active, applied, activity, hydrated, recById, _showToast]);

    const dismiss = useCallback((id, reason = 'User dismissed') => {
        const r = recById(id);
        if (!r) return;
        const ts = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        const prevActive = active;
        const prevDismissed = dismissed;
        const prevActivity = activity;
        setActive(a => a.filter(x => x !== id));
        setDismissed(d => [...d, {id, ts, reason}]);
        setActivity(act => [{
            id: 'a-' + Date.now(), extId: id, ts: `today · ${ts}`, kind: 'dismissed',
            action: r.action, asset: r.scope?.ref || 'PORT',
            detail: `declined — ${reason.toLowerCase()}`,
        }, ...act]);
        if (!hydrated) return;
        apiService.dismissRecommendation(id, reason).catch(err => {
            setActive(prevActive);
            setDismissed(prevDismissed);
            setActivity(prevActivity);
            _showToast({text: `Dismiss failed: ${err?.message || 'network error'}`});
        });
    }, [active, dismissed, activity, hydrated, recById, _showToast]);

    const value = useMemo(() => ({
        allRecs, active, applied, dismissed,
        apply, dismiss, undo,
        activity,
        drawer, setDrawer,
        search, setSearch,
        toast, setToast: _showToast,
        hydrated,
    }), [allRecs, active, applied, dismissed, activity, drawer, search, toast, hydrated, apply, dismiss, undo, _showToast]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
