/* Aureon — Dashboard page (composition layer). */
import React, {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../../components/aureon/store';
import {SectionHead} from '../../components/aureon/ui';
import {PortfolioDecisionUnit, ActionConfirmationModal, EmptyDecisions} from '../../components/aureon/flow';
import {useAureonData} from '../../hooks/useAureonData';
import {Hero}               from '../../components/aureon/dashboard/Hero';
import {PortfolioProgress}  from '../../components/aureon/dashboard/PortfolioProgress';
import {LifecycleStrip}     from '../../components/aureon/dashboard/LifecycleStrip';
import {TopHoldingsRow}     from '../../components/aureon/dashboard/TopHoldingsRow';
import {SupportingStrip}    from '../../components/aureon/dashboard/SupportingStrip';
import {WiredDecisionUnit}  from '../../components/aureon/dashboard/WiredDecisionUnit';

export default function Dashboard() {
    const navigate = useNavigate();
    const {allRecs, active, apply} = useApp();
    const {holdings, signals, netWorth, dayDelta, classLabel, classTarget, allocByClass, portfolioRec, recsActive, activity, marketPulse} = useAureonData();
    const [modal, setModal] = useState(null);

    const recs = useMemo(() => allRecs.filter(r => active.includes(r.id)), [allRecs, active]);
    const dashRecs = recs.filter(r => r.confidence >= 50).slice(0, 3);

    const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const drift = useMemo(() => {
        const entries = Object.entries(allocByClass)
            .map(([k, v]) => [k, (v - (classTarget[k] ?? 0)) * 100])
            .filter(([, v]) => Math.abs(v) > 0.01);
        if (!entries.length) return null;
        return entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    }, [allocByClass, classTarget]);

    const signalsToday = useMemo(() => signals.filter(s => s.ts >= todayISO).length, [signals, todayISO]);

    const appliedToday = useMemo(() =>
        activity.filter(a => a.kind !== 'dismissed' && a.ts >= todayISO).length,
    [activity, todayISO]);

    const activityThisWeek = useMemo(() => {
        const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
        return activity.filter(a => a.ts >= weekAgo).length;
    }, [activity]);

    const openModal = (rec, onConfirm) => setModal({rec, onConfirm});
    const closeModal = () => setModal(null);
    const confirmModal = () => { modal?.onConfirm?.(); setModal(null); };

    return (
        <>
            <Hero
                netWorth={netWorth}
                dayDelta={dayDelta}
                classLabel={classLabel}
                allocByClass={allocByClass}
                drift={drift}
                recsActiveCount={recsActive.length}
                activityThisWeek={activityThisWeek}
            />
            <PortfolioProgress/>
            <LifecycleStrip signalCount={signals.length} appliedToday={appliedToday}/>

            <SectionHead
                eyebrow="Decisions · what should you do next"
                title="Active recommendations"
                meta={`${active.length} active · updated 3 min ago`}
                action={
                    <button className="du3-cta ghost" onClick={() => navigate('/recommendations')}>
                        Review all <span style={{marginLeft: 4}}>→</span>
                    </button>
                }
            />

            {dashRecs.length === 0 ? (
                <EmptyDecisions/>
            ) : (
                <>
                    {portfolioRec && (
                        <div style={{marginBottom: 14}}>
                            <PortfolioDecisionUnit rec={portfolioRec} onCommit={() => apply(portfolioRec.id)} openModal={openModal}/>
                        </div>
                    )}
                    <div style={{display: 'grid', gap: 10}}>
                        {dashRecs.map(rec => (
                            <WiredDecisionUnit key={rec.id} rec={rec} openModal={openModal}/>
                        ))}
                    </div>
                </>
            )}

            <SectionHead
                eyebrow="Portfolio · holdings at a glance"
                title="Top positions"
                meta={`${holdings.filter(h => h.tier !== 'passive').length} active · ${holdings.filter(h => h.tier === 'passive').length} passive`}
                action={
                    <button className="du3-cta ghost" onClick={() => navigate('/portfolio')}>
                        Open portfolio <span style={{marginLeft: 4}}>→</span>
                    </button>
                }
            />
            <TopHoldingsRow holdings={holdings}/>

            <SupportingStrip
                signalCount={signals.length}
                signalsToday={signalsToday}
                drift={drift}
                classLabel={classLabel}
                marketPulse={marketPulse}
            />
            <div style={{height: 32}}/>

            {modal && <ActionConfirmationModal rec={modal.rec} onCancel={closeModal} onConfirm={confirmModal}/>}
        </>
    );
}
