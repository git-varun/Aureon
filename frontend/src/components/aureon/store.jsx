/* eslint-disable react-refresh/only-export-components */
/* Aureon — global app state (recs, activity, search, drawer, toast). */
import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {apiService} from '../../api/apiService';
import {AUREON_STATE_KEY} from '../../hooks/useAureonData';
import {useOrganization} from '../../contexts/OrganizationContext';
import {usePortfolio} from '../../contexts/PortfolioContext';

const AppContext = createContext(null);

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        return {
            allRecs: [],
            active: [],
            applied: [],
            dismissed: [],
            apply: async () => {},
            applyBatch: async () => {},
            dismiss: async () => {},
            undo: async () => {},
            activity: [],
            drawer: null,
            setDrawer: () => {},
            search: '',
            setSearch: () => {},
            toast: null,
            setToast: () => {},
            hydrated: false,
            profile: {
                email: '',
                first: '',
                last: '',
                phone: '',
                bio: '',
                riskProfile: 'Balanced',
                annualTarget: '',
                monthlySavings: '',
                swingTrading: false,
                workingArea: ''
            },
            saveProfile: () => {}
        };
    }
    return context;
};

// Map an API rec (snake_case) → FE shape used by Aureon UI primitives.
const apiRecToFE = (r) => ({
    id: r.ext_id,
    status: r.status,
    strength: r.strength,
    action: r.action,
    scope: r.scope,
    title: r.title,
    impactOneLine: r.impactOneLine || r.impact_one_line,
    confidence: r.confidence,
    horizon: r.horizon,
    change: r.change,
    impact: r.impact,
    reasoning: r.reasoning,
    conflictsWith: r.conflictsWith || r.conflicts_with || [],
    signalIds: r.signalIds || r.signal_ids || [],
});

export const AppProvider = ({children}) => {
    const queryClient = useQueryClient();
    const {activeOrgId} = useOrganization();
    const {activePortfolioId} = usePortfolio();

    const {data: recsData, isSuccess: recsSuccess} = useQuery({
        queryKey: ["org", activeOrgId, "recommendations"],
        queryFn: () => apiService.listRecommendations(activeOrgId),
        enabled: !!activeOrgId,
        staleTime: 15000,
    });

    const {data: activityData, isSuccess: activitySuccess} = useQuery({
        queryKey: ["org", activeOrgId, "portfolio", activePortfolioId, "transactions"],
        queryFn: () => apiService.listTransactions(activeOrgId, activePortfolioId),
        enabled: !!activeOrgId && !!activePortfolioId,
        staleTime: 10000,
    });

    const isSuccess = recsSuccess && (!activePortfolioId || activitySuccess);
    const hydrated = isSuccess;

    const s = useMemo(() => {
        if (!recsData) return null;
        
        const mappedRecs = recsData.map(r => ({
            ...r,
            ext_id: r.ext_id || r.id,
            impact: r.impact || {
                ret: {
                    delta: r.predicted_impact,
                    horizon: r.horizon
                }
            }
        }));

        const activeRecs = mappedRecs.filter(r => r.status === 'active');
        const appliedRecs = mappedRecs.filter(r => r.status === 'applied');
        const dismissedRecs = mappedRecs.filter(r => r.status === 'dismissed');

        const mappedActivity = (activityData || []).map(t => ({
            id: t.id,
            extId: t.recommendation_id,
            ts: new Date(t.transaction_date).toLocaleDateString() + ' · ' + new Date(t.transaction_date).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}),
            kind: t.transaction_type === 'BUY' ? 'applied' : 'dismissed',
            refId: t.recommendation_id,
            action: t.transaction_type,
            asset: t.symbol,
            detail: `${t.transaction_type} ${t.quantity} ${t.symbol} @ $${t.price}`,
            predicted: null,
            realized: null,
            pending: false,
            settleDays: 0
        }));

        return {
            recommendations: {
                active: activeRecs,
                applied: appliedRecs,
                dismissed: dismissedRecs
            },
            activity: mappedActivity
        };
    }, [recsData, activityData]);

    const [allRecs, setAllRecs] = useState([]);
    const [active, setActive] = useState([]);
    const [applied, setApplied] = useState([]);
    const [dismissed, setDismissed] = useState([]);
    const [activity, setActivity] = useState([]);
    const [drawer, setDrawer] = useState(null);
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);

    // H8: profile + goal live in shared, persisted state so edits survive tab switches
    // and the dashboard GoalProgress reads the same source the Settings form writes.
    const PROFILE_DEFAULT = {
        email: 'vihaan.acharya@aureon.co', first: 'Vihaan', last: 'Acharya', phone: '+91 98201 47221',
        bio: 'Long-term holder. Active in Indian equities and global crypto. Rebalances quarterly.',
        riskProfile: 'Balanced', annualTarget: '20', monthlySavings: '25000', swingTrading: false,
        workingArea: 'Software Engineering, Bangalore',
    };
    const [profile, setProfile] = useState(() => {
        try {
            const raw = localStorage.getItem('aureon.profile');
            if (raw) return { ...PROFILE_DEFAULT, ...JSON.parse(raw) };
        } catch { /* ignore */ }
        return PROFILE_DEFAULT;
    });
    const saveProfile = useCallback((next) => {
        setProfile(next);
        try {
            localStorage.setItem('aureon.profile', JSON.stringify(next));
        } catch { /* ignore */ }
        const payload = {
            first_name: next.first,
            last_name: next.last,
            phone: next.phone,
            bio: next.bio,
            risk_profile: next.riskProfile?.toLowerCase(),
            working_area: next.workingArea,
            target_profit_pct: next.annualTarget !== '' ? parseFloat(next.annualTarget) : null,
            monthly_saving: next.monthlySavings !== '' ? parseFloat(next.monthlySavings) : null,
            swing_trading_enabled: next.swingTrading,
        };
        apiService.updateCurrentUserProfile(payload).catch(() => {});
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        apiService.getCurrentUserProfile()
            .then(data => {
                if (data) {
                    setProfile(curr => ({
                        email: data.email || curr.email,
                        first: data.first_name || curr.first,
                        last: data.last_name || curr.last,
                        phone: data.phone || curr.phone,
                        bio: data.bio || curr.bio,
                        riskProfile: data.risk_profile ? (data.risk_profile.charAt(0).toUpperCase() + data.risk_profile.slice(1)) : curr.riskProfile,
                        annualTarget: data.target_profit_pct != null ? String(data.target_profit_pct) : curr.annualTarget,
                        monthlySavings: data.monthly_saving != null ? String(data.monthly_saving) : curr.monthlySavings,
                        swingTrading: data.swing_trading_enabled ?? curr.swingTrading,
                        workingArea: data.working_area || curr.workingArea,
                    }));
                }
            })
            .catch(() => {});
    }, [hydrated]);

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
            pending: r.realized_impact == null,
            settleDays: (r.impact_one_line || '').includes('realized') ? 2 : 5,
        })));
        setDismissed((recs.dismissed || []).map(r => ({
            id: r.ext_id,
            ts: r.dismissed_at ? new Date(r.dismissed_at).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}) : '',
            reason: r.dismiss_reason || 'User dismissed',
        })));
        if (Array.isArray(s.activity) && s.activity.length) setActivity(s.activity);
    }, [s]);

    const recById = useCallback((id) => allRecs.find(r => r.id === id), [allRecs]);

    // C3: clear toast only if it matches the scheduled key to avoid overlapping overlap bugs
    const _showToast = useCallback((t) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast(t);
        if (t) {
            const toastKey = t.key || 'toast-' + Date.now();
            toastTimerRef.current = setTimeout(() => {
                setToast(curr => (curr && (curr.key === toastKey || curr.text === t.text)) ? null : curr);
            }, 5500);
        }
    }, []);

    const undo = useCallback((id) => {
        const prevActive = active;
        const prevApplied = applied;
        const prevDismissed = dismissed;
        const prevActivity = activity;
        setActive(a => a.includes(id) ? a : [...a, id]);
        setApplied(a => a.filter(x => x.id !== id));
        setDismissed(d => d.filter(x => x.id !== id));
        // C4: remove the exact ledger row this apply/dismiss created (extId or refId is id)
        setActivity(act => act.filter(a => a.extId !== id && a.refId !== id));
        _showToast(null);
        if (!hydrated) return;
        apiService.undoRecommendation(id)
            .then(() => {
                queryClient.invalidateQueries({ queryKey: AUREON_STATE_KEY });
            })
            .catch(err => {
                setActive(prevActive);
                setApplied(prevApplied);
                setDismissed(prevDismissed);
                setActivity(prevActivity);
                _showToast({text: `Undo failed: ${err?.message || 'network error'}`});
            });
    }, [active, applied, dismissed, activity, hydrated, queryClient, _showToast]);

    const apply = useCallback((id, opts = {}) => {
        const r = recById(id);
        if (!r) return;
        const ts = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        const prevActive = active;
        const prevApplied = applied;
        const prevActivity = activity;
        
        // H3 & L1: freshly-applied outcome starts as pending so calibration stays honest
        const settleDays = (r.impact?.ret?.horizon || '').includes('realized') ? 2 : 5;
        
        setActive(a => a.filter(x => x !== id));
        setApplied(a => [...a, {id, ts, predicted: r.impact?.ret?.delta, realized: null, pending: true, settleDays}]);
        setActivity(act => [{
            id: 'a-' + Date.now(), extId: id, ts: `today · ${ts}`, kind: 'applied', refId: id,
            action: r.action, asset: r.scope?.ref || 'PORT',
            detail: r.impactOneLine,
            predicted: r.impact?.ret?.delta, realized: null, pending: true, settleDays
        }, ...act]);
        
        if (!opts.silent) {
            const toastKey = 'ap-' + Date.now();
            _showToast({key: toastKey, text: `${r.action} ${r.scope?.ref || ''} applied`, undoId: id});
        }
        
        if (!hydrated) return;
        apiService.applyRecommendation(id)
            .then(() => {
                queryClient.invalidateQueries({ queryKey: AUREON_STATE_KEY });
            })
            .catch(err => {
                setActive(prevActive);
                setApplied(prevApplied);
                setActivity(prevActivity);
                _showToast({text: `Apply failed: ${err?.response?.data?.message || err?.message || 'network error'}`});
            });
    }, [active, applied, activity, hydrated, recById, queryClient, _showToast]);

    // C6: applyBatch commits staged basket and fires a single toast
    const applyBatch = useCallback((ids) => {
        const valid = (ids || []).filter(id => recById(id));
        if (!valid.length) return;
        
        const prevActive = active;
        const prevApplied = applied;
        const prevActivity = activity;
        const ts = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        
        setActive(a => a.filter(x => !valid.includes(x)));
        
        const newApplied = valid.map(id => {
            const r = recById(id);
            const settleDays = (r.impact?.ret?.horizon || '').includes('realized') ? 2 : 5;
            return { id, ts, predicted: r.impact?.ret?.delta, realized: null, pending: true, settleDays };
        });
        setApplied(a => [...a, ...newApplied]);
        
        const newActivity = valid.map(id => {
            const r = recById(id);
            const settleDays = (r.impact?.ret?.horizon || '').includes('realized') ? 2 : 5;
            return {
                id: 'a-' + Date.now() + '-' + id, extId: id, ts: `today · ${ts}`, kind: 'applied', refId: id,
                action: r.action, asset: r.scope?.ref || 'PORT',
                detail: r.impactOneLine,
                predicted: r.impact?.ret?.delta, realized: null, pending: true, settleDays
            };
        });
        setActivity(act => [...newActivity, ...act]);
        
        const toastKey = 'batch-' + Date.now();
        _showToast({ key: toastKey, text: `${valid.length} ${valid.length === 1 ? 'decision' : 'decisions'} applied`, undoId: null });
        
        if (!hydrated) return;
        Promise.all(valid.map(id => apiService.applyRecommendation(id)))
            .then(() => {
                queryClient.invalidateQueries({ queryKey: AUREON_STATE_KEY });
            })
            .catch(err => {
                setActive(prevActive);
                setApplied(prevApplied);
                setActivity(prevActivity);
                _showToast({ text: `Batch apply failed: ${err?.message || 'network error'}` });
            });
    }, [active, applied, activity, hydrated, recById, queryClient, _showToast]);

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
            id: 'a-' + Date.now(), extId: id, ts: `today · ${ts}`, kind: 'dismissed', refId: id,
            action: r.action, asset: r.scope?.ref || 'PORT',
            detail: `declined — ${reason.toLowerCase()}`,
        }, ...act]);
        if (!hydrated) return;
        apiService.dismissRecommendation(id, reason)
            .then(() => {
                queryClient.invalidateQueries({ queryKey: AUREON_STATE_KEY });
            })
            .catch(err => {
                setActive(prevActive);
                setDismissed(prevDismissed);
                setActivity(prevActivity);
                _showToast({text: `Dismiss failed: ${err?.message || 'network error'}`});
            });
    }, [active, dismissed, activity, hydrated, recById, queryClient, _showToast]);

    const value = useMemo(() => ({
        allRecs, active, applied, dismissed,
        apply, applyBatch, dismiss, undo,
        activity,
        drawer, setDrawer,
        search, setSearch,
        toast, setToast: _showToast,
        hydrated,
        profile, saveProfile,
    }), [allRecs, active, applied, dismissed, activity, drawer, search, toast, hydrated, apply, applyBatch, dismiss, undo, _showToast, profile, saveProfile]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
