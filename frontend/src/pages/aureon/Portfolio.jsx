// frontend/src/pages/aureon/Portfolio.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAureonData } from '@/hooks/useAureonData';
import { useFmtMoney } from '@/hooks/useFmtMoney';
import { LogTradeModal } from '@/components/aureon/portfolio';
import { PortfolioHealthCard } from '@/components/aureon/dashboard/PortfolioHealthCard';
import { DiversificationCard } from '@/components/aureon/dashboard/DiversificationCard';
import { AllocationDriftCard } from '@/components/aureon/dashboard/AllocationDriftCard';
import { PfFreshnessBar }      from '@/components/aureon/portfolio/PfFreshnessBar';
import { PfSummaryHero }       from '@/components/aureon/portfolio/PfSummaryHero';
import { PfPerformanceChart }  from '@/components/aureon/portfolio/PfPerformanceChart';
import { PfAllocationSection } from '@/components/aureon/portfolio/PfAllocationSection';
import { PfHoldingsTable }     from '@/components/aureon/portfolio/PfHoldingsTable';
import { PfActivityFeed }      from '@/components/aureon/portfolio/PfActivityFeed';
import { PfImportCenter }          from '@/components/aureon/portfolio/PfImportCenter';
import { ManualAssetModal }        from '@/components/aureon/portfolio/ManualAssetModal';
import { PfConcentrationSection }  from '@/components/aureon/portfolio/PfConcentrationSection';

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

const PfEmptyBox = ({ title, body }) => (
  <div style={{ padding:'40px 24px', textAlign:'center', border:'1px dashed rgba(255,255,255,0.10)', borderRadius:12, background:'rgba(255,255,255,0.012)' }}>
    <div style={{ fontFamily:'var(--font-heading)', fontSize:15, fontWeight:600, color:'var(--ink-20)', marginBottom:6 }}>{title}</div>
    {body && <div style={{ fontSize:13, color:'var(--ink-40)', maxWidth:400, margin:'0 auto', lineHeight:1.6 }}>{body}</div>}
  </div>
);

export default function Portfolio() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const fmt      = useFmtMoney();
  const { holdings, netWorth, dayDelta, loading, allocByClass, activity } = useAureonData();
  const [showTrade,  setShowTrade]  = useState(false);
  const [showManual, setShowManual] = useState(false);

  const handleRefresh = () => qc.invalidateQueries();

  return (
    <>
      {/* 1 · Freshness bar */}
      <PfFreshnessBar onRefresh={handleRefresh} />

      {/* 2 · Summary hero */}
      <PfSummaryHero
        netWorth={netWorth}
        dayDelta={dayDelta}
        loading={loading}
        fmt={fmt}
        onSnapshot={handleRefresh}
        onLogTrade={() => setShowTrade(true)}
      />

      {/* 3 · Performance chart */}
      <PfSection eyebrow="History" title="Performance">
        <PfPerformanceChart />
      </PfSection>

      {/* 4 · Allocation */}
      <PfSection eyebrow="Breakdown" title="Allocation">
        <PfAllocationSection holdings={holdings} allocByClass={allocByClass} />
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
      <PfSection
        eyebrow="Ledger"
        title="Portfolio Activity"
        action={<button onClick={() => navigate('/transactions')} className="du3-cta ghost" style={{ fontSize:12, padding:'0 12px', height:28 }}>Full ledger →</button>}
      >
        <PfActivityFeed txns={activity} onViewAll={() => navigate('/transactions')} />
      </PfSection>

      {/* 7 · Health section — 3-card grid matching prototype */}
      <PfSection eyebrow="Intelligence" title="Portfolio Health">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
          <PortfolioHealthCard />
          <DiversificationCard />
          <AllocationDriftCard onNavigatePortfolio={() => navigate('/portfolio')} />
        </div>
      </PfSection>

      {/* 8 · Concentration (separate section) */}
      <PfSection eyebrow="Risk" title="Concentration">
        <PfConcentrationSection />
      </PfSection>

      {/* 9 · Trend Analysis */}
      <PfSection eyebrow="Intelligence" title="Portfolio Trend Analysis">
        <PfEmptyBox
          title="No trend data yet"
          body="Trend analysis will appear here once a provider is connected and portfolio snapshots have accumulated."
        />
      </PfSection>

      {/* 10 · Recommendation Outcomes */}
      <PfSection eyebrow="Decisions" title="Recommendation Outcomes">
        <PfEmptyBox
          title="No outcomes yet"
          body="Recommendation outcomes will appear here once applied decisions have had time to settle."
        />
      </PfSection>

      {/* 11 · Import Center */}
      <PfSection eyebrow="Import" title="Import Center">
        <PfImportCenter />
      </PfSection>

      <div style={{ height: 24 }} />

      {showTrade  && <LogTradeModal onClose={refresh => { setShowTrade(false); if (refresh) qc.invalidateQueries(); }} />}
      {showManual && <ManualAssetModal onClose={() => setShowManual(false)} />}
    </>
  );
}
