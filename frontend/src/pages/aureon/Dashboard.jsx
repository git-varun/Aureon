// frontend/src/pages/aureon/Dashboard.jsx
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/components/aureon/store';
import { SectionHead } from '@/components/aureon/ui';
import { PortfolioDecisionUnit, ActionConfirmationModal, EmptyDecisions } from '@/components/aureon/flow';
import { useAureonData } from '@/hooks/useAureonData';

import { PortfolioSummaryHero }     from '@/components/aureon/dashboard/PortfolioSummaryHero';
import { PortfolioHealthCard }      from '@/components/aureon/dashboard/PortfolioHealthCard';
import { DiversificationCard }      from '@/components/aureon/dashboard/DiversificationCard';
import { ConcentrationCard }         from '@/components/aureon/dashboard/ConcentrationCard';
import { AllocationDriftCard }       from '@/components/aureon/dashboard/AllocationDriftCard';
import { PortfolioProgress }         from '@/components/aureon/dashboard/PortfolioProgress';
import { MarketFreshnessSection }    from '@/components/aureon/dashboard/MarketFreshnessSection';
import { LifecycleStrip }           from '@/components/aureon/dashboard/LifecycleStrip';
import { CashDeploymentCard }        from '@/components/aureon/dashboard/CashDeploymentCard';
import { GoalProgress }             from '@/components/aureon/dashboard/GoalProgress';
import { TopHoldingsRow }           from '@/components/aureon/dashboard/TopHoldingsRow';
import { SupportingStrip }          from '@/components/aureon/dashboard/SupportingStrip';
import { WiredDecisionUnit }        from '@/components/aureon/dashboard/WiredDecisionUnit';

/** Generate deterministic mock snapshots from a base net worth value. */
function genSnapshots(baseValue, days = 90) {
  if (!baseValue) return [];
  const t0 = Date.now() - (days - 1) * 86400000;
  const seed = baseValue * 0.86;
  let v = seed;
  return Array.from({ length: days }, (_, i) => {
    // pseudo-random walk using index as seed
    const drift = Math.sin(i * 0.37) * 0.008 + Math.cos(i * 0.23) * 0.006;
    v = v * (1 + drift);
    return { ts: new Date(t0 + i * 86400000), value: v };
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { allRecs, active, apply, undo } = useApp();
  const {
    holdings, signals, netWorth, dayDelta,
    portfolioRec, activity, freshness, loading,
  } = useAureonData();
  const [modal, setModal] = useState(null);

  // Derive portfolio summary state from existing useAureonData (no new API call)
  const portfolioSummaryState = useMemo(() => {
    if (loading) return { status: 'loading', data: null, error: null, refetch: () => {} };
    if (!netWorth && netWorth !== 0) return { status: 'empty', data: null, error: null, refetch: () => {} };
    const snapshots = genSnapshots(netWorth, 90);
    return {
      status: 'ready',
      error: null,
      refetch: () => {},
      data: {
        value:       netWorth,
        dayDelta:    dayDelta?.dollars ?? 0,
        dayDeltaPct: dayDelta?.pct ?? 0,
        lastUpdated: new Date(),
        snapshots,
      },
    };
  }, [netWorth, dayDelta, loading]);

  const recs     = useMemo(() => allRecs.filter(r => active.includes(r.id)), [allRecs, active]);
  const dashRecs = recs.filter(r => r.confidence >= 50).slice(0, 3);

  const openModal   = (rec, onConfirm) => setModal({ rec, onConfirm });
  const closeModal  = () => setModal(null);
  const confirmModal = () => { modal?.onConfirm?.(); setModal(null); };

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const appliedToday = useMemo(() =>
    activity.filter(a => a.kind !== 'dismissed' && a.ts >= todayISO).length,
  [activity, todayISO]);

  return (
    <>
      {/* 1 · Portfolio summary hero */}
      <PortfolioSummaryHero
        data={portfolioSummaryState.data}
        status={portfolioSummaryState.status}
        error={portfolioSummaryState.error}
        refetch={portfolioSummaryState.refetch}
      />

      {/* 2 · Health · Diversification · Concentration · Allocation Drift */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <PortfolioHealthCard />
        <DiversificationCard />
        <ConcentrationCard />
        <AllocationDriftCard onNavigatePortfolio={() => navigate('/portfolio')} />
      </div>

      {/* 3 · Portfolio progress chart */}
      <PortfolioProgress
        summData={portfolioSummaryState.data}
        summStatus={portfolioSummaryState.status}
      />

      {/* 4 · Market freshness */}
      <MarketFreshnessSection freshness={freshness} />

      {/* 5 · Lifecycle strip */}
      <LifecycleStrip />

      {/* 6 · Cash deployment */}
      <CashDeploymentCard />

      {/* 7 · Goal progress */}
      <GoalProgress onNavigateSettings={() => navigate('/settings')} />

      {/* 8 · Active recommendations */}
      <SectionHead
        eyebrow="Decisions · what should you do next"
        title="Active recommendations"
        meta={`${active.length} active`}
        action={
          <button className="du3-cta ghost" onClick={() => navigate('/decisions?tab=recommendations')}>
            Review all →
          </button>
        }
      />
      {(() => {
        const showPortRec = portfolioRec && active.includes(portfolioRec.id);
        const hasAnything = showPortRec || dashRecs.length > 0;
        if (!hasAnything) return <EmptyDecisions />;
        return (
          <>
            {showPortRec && (
              <div style={{ marginBottom: 14 }}>
                <PortfolioDecisionUnit
                  rec={portfolioRec}
                  onCommit={() => apply(portfolioRec.id)}
                  onUndo={() => undo(portfolioRec.id)}
                  openModal={openModal}
                />
              </div>
            )}
            {dashRecs.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                {dashRecs.map(rec => (
                  <WiredDecisionUnit key={rec.id} rec={rec} openModal={openModal} />
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* 9 · Top positions */}
      <SectionHead
        eyebrow="Portfolio · holdings at a glance"
        title="Top positions"
        meta={`${holdings.filter(h => h.tier !== 'passive').length} active · ${holdings.filter(h => h.tier === 'passive').length} passive`}
        action={
          <button className="du3-cta ghost" onClick={() => navigate('/portfolio')}>
            Open portfolio →
          </button>
        }
      />
      <TopHoldingsRow holdings={holdings} />

      {/* 10 · Supporting strip */}
      <SupportingStrip onNavigate={route => navigate('/' + route)} />

      <div style={{ height: 32 }} />
      {modal && <ActionConfirmationModal rec={modal.rec} onCancel={closeModal} onConfirm={confirmModal} />}
    </>
  );
}
