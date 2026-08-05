// frontend/src/pages/aureon/Portfolio.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAureonData } from '@/hooks/useAureonData';
import { useFmtMoney } from '@/hooks/useFmtMoney';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { apiService } from '@/api/apiService';
import { LogTradeModal } from '@/components/aureon/portfolio';
import { PortfolioHealthCard } from '@/components/aureon/dashboard/PortfolioHealthCard';
import { DiversificationCard } from '@/components/aureon/dashboard/DiversificationCard';
import { PfFreshnessBar }      from '@/components/aureon/portfolio/PfFreshnessBar';
import { PfSummaryHero }       from '@/components/aureon/portfolio/PfSummaryHero';
import { PfPerformanceChart }  from '@/components/aureon/portfolio/PfPerformanceChart';
import { PfAllocationSection } from '@/components/aureon/portfolio/PfAllocationSection';
import { PfHoldingsTable }     from '@/components/aureon/portfolio/PfHoldingsTable';
import { PfActivityFeed }      from '@/components/aureon/portfolio/PfActivityFeed';
import { ManualAssetModal }        from '@/components/aureon/portfolio/ManualAssetModal';
import { PfConcentrationSection }  from '@/components/aureon/portfolio/PfConcentrationSection';
import { PfTrendChart }        from '@/components/aureon/portfolio/PfTrendChart';
import OutcomesTab from '@/components/aureon/decisions/tabs/OutcomesTab';

const PfSection = ({ eyebrow, title, action, children }) => (
  <section style={{ marginBottom: 32 }}>
    {(eyebrow || title || action) && (
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:12, marginBottom:16 }}>
        <div>
          {eyebrow && <div style={{ fontSize:10.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:600 }}>{eyebrow}</div>}
          {title && <h2 style={{ margin:'4px 0 0', fontFamily:'var(--font-heading)', fontSize:18, fontWeight:600, color:'var(--ink-00)', letterSpacing:'-0.01em' }}>{title}</h2>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

export default function Portfolio() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const fmt      = useFmtMoney();
  const { activePortfolioId } = usePortfolio();
  const { holdings, netWorth, investedValue, unrealizedPnl, dayDelta, loading, allocByClass, classTarget, classTargetsLoading, classTargetsError, classTargetsUsingDefaults, cashNotTracked, activity, freshness } = useAureonData();
  const [showTrade,  setShowTrade]  = useState(false);
  const [showManual, setShowManual] = useState(false);

  const handleRefresh = () => qc.invalidateQueries();

  const handleSnapshot = async () => {
    await apiService.generatePortfolioSnapshot(activePortfolioId);
    qc.invalidateQueries();
  };

  return (
    <>
      {/* 1 · Freshness bar */}
      <PfFreshnessBar freshness={freshness} onRefresh={handleRefresh} />

      {/* 2 · Summary hero */}
      <PfSummaryHero
        netWorth={netWorth}
        investedValue={investedValue}
        unrealizedPnl={unrealizedPnl}
        dayDelta={dayDelta}
        loading={loading}
        fmt={fmt}
        onSnapshot={handleSnapshot}
        onLogTrade={() => setShowTrade(true)}
      />

      {/* 3 · Performance chart */}
      <PfSection eyebrow="History" title="Performance">
        <PfPerformanceChart />
      </PfSection>

      {/* 4 · Allocation */}
      <PfSection eyebrow="Breakdown" title="Allocation">
        <PfAllocationSection
          holdings={holdings}
          allocByClass={allocByClass}
          classTarget={classTarget}
          classTargetsLoading={classTargetsLoading}
          classTargetsError={classTargetsError}
          classTargetsUsingDefaults={classTargetsUsingDefaults}
          cashNotTracked={cashNotTracked}
        />
      </PfSection>

      {/* 5 · Holdings */}
      <PfSection
        eyebrow="Positions"
        title="Holdings"
        action={<button onClick={() => setShowTrade(true)} className="du3-cta ghost" style={{ fontSize:12, padding:'0 12px', height:28 }}>+ Log transaction</button>}
      >
        <PfHoldingsTable
          holdings={holdings}
          loading={loading}
          fmt={fmt}
          onLogTrade={() => setShowTrade(true)}
          onAddManual={() => setShowManual(true)}
        />
      </PfSection>

      {/* 6 · Activity feed */}
      <PfSection eyebrow="Ledger" title="Portfolio Activity">
        <PfActivityFeed txns={activity} onViewAll={() => navigate('/transactions')} />
      </PfSection>

      {/* 7 · Health section — Allocation Drift dropped here: it's the same
          per-class drift already shown above in Breakdown > Allocation, and
          its "Rebalance →" link would just navigate to this same page. Still
          used standalone on Dashboard, where both are real value-adds. */}
      <PfSection eyebrow="Intelligence" title="Portfolio Health">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <PortfolioHealthCard />
          <DiversificationCard />
        </div>
      </PfSection>

      {/* 8 · Concentration (separate section) */}
      <PfSection eyebrow="Risk" title="Concentration">
        <PfConcentrationSection />
      </PfSection>

      {/* 9 · Trend Analysis */}
      <PfSection eyebrow="Intelligence" title="Portfolio Trend Analysis">
        <PfTrendChart />
      </PfSection>

      {/* 10 · Recommendation Outcomes */}
      <PfSection eyebrow="Decisions" title="Recommendation Outcomes">
        <OutcomesTab />
      </PfSection>

      {/* 11 · Import shortcut */}
      <PfSection eyebrow="Import" title="Import Data">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'16px 20px', borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize:13, color:'var(--ink-30)', lineHeight:1.5 }}>
            Import transactions and holdings via CSV, CAS, NPS, EPF, or add a manual asset from Settings.
          </div>
          <button onClick={() => navigate('/settings#import-data')} className="du3-cta" style={{ fontSize:12.5, padding:'0 14px', height:32, whiteSpace:'nowrap' }}>Go to Import Center →</button>
        </div>
      </PfSection>

      <div style={{ height: 24 }} />

      {showTrade  && <LogTradeModal onClose={refresh => { setShowTrade(false); if (refresh) qc.invalidateQueries(); }} />}
      {showManual && <ManualAssetModal onClose={refresh => { setShowManual(false); if (refresh) qc.invalidateQueries(); }} />}
    </>
  );
}
