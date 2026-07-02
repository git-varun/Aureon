import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/api/apiService';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Sk, RBtn, Cerr, Cmt, CS, Eyebrow } from '../ui';

const toneCol = k =>
  k === 'pos' ? 'var(--sage-500)' : k === 'warn' ? 'var(--dusk-500)' : 'var(--crimson-500)';

const transform = (raw) => {
  if (!raw || (raw.position_count != null ? raw.position_count === 0 : raw.diversification_score === 0)) return null;
  const score = Math.round(raw.investor_health_score);
  const toneKey = score >= 75 ? 'pos' : score >= 50 ? 'warn' : 'neg';
  const label = score >= 75 ? 'Healthy' : score >= 50 ? 'Moderate' : 'Needs attention';
  return {
    score,
    toneKey,
    label,
    checks: [
      { ok: raw.diversification_score >= 60, text: 'Diversification', detail: `${Math.round(raw.diversification_score)}/100` },
      { ok: raw.allocation_discipline_score >= 60, text: 'Allocation discipline', detail: `${Math.round(raw.allocation_discipline_score)}/100` },
      { ok: raw.recommendation_outcomes_score >= 60, text: 'Decision outcomes', detail: `${Math.round(raw.recommendation_outcomes_score)}/100` },
      { ok: raw.activity_consistency_score >= 60, text: 'Activity consistency', detail: `${Math.round(raw.activity_consistency_score)}/100` },
    ],
  };
};

export function PortfolioHealthCard() {
  const { activePortfolioId } = usePortfolio();
  const { data: raw, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['intelligence', 'portfolio-health', activePortfolioId],
    queryFn: () => apiService.getPortfolioHealth(activePortfolioId),
    enabled: !!activePortfolioId,
    staleTime: 60000,
  });

  const data = React.useMemo(() => transform(raw ?? null), [raw]);
  const status = isLoading ? 'loading' : isError ? 'error' : !data ? 'empty' : 'ready';

  return (
    <div style={{ ...CS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Eyebrow>Portfolio health</Eyebrow><RBtn onRefresh={refetch} />
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Sk h={48} w={48} r={999} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Sk h={18} w={80} /><Sk h={11} w={55} />
            </div>
          </div>
          {[0, 1, 2, 3].map(i => <Sk key={i} h={11} />)}
        </div>
      )}

      {status === 'error' && <Cerr msg={error?.message} retry={refetch} />}
      {status === 'empty' && <Cmt msg="Health data unavailable" />}

      {status === 'ready' && data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <svg width="50" height="50" viewBox="0 0 50 50" style={{ flexShrink: 0 }}>
              <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
              <circle cx="25" cy="25" r="20" fill="none"
                stroke={toneCol(data.toneKey)} strokeWidth="3.5"
                strokeDasharray={`${(data.score / 100) * 125.7} 125.7`}
                strokeLinecap="round" transform="rotate(-90 25 25)"
                style={{ transition: 'stroke-dasharray 650ms var(--ease-decel)' }} />
              <text x="25" y="29.5" textAnchor="middle" fontSize="12"
                fontFamily="var(--font-mono)" fontWeight="500" fill="var(--ink-00)">{data.score}</text>
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: toneCol(data.toneKey) }}>{data.label}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-50)', marginTop: 2 }}>out of 100</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.checks.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                <span style={{ width: 15, height: 15, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c.ok ? 'rgba(111,174,136,0.12)' : 'rgba(209,107,107,0.10)', color: c.ok ? 'var(--sage-500)' : 'var(--crimson-500)' }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {c.ok ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
                  </svg>
                </span>
                <span style={{ flex: 1, color: 'var(--ink-20)' }}>{c.text}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)' }}>{c.detail}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
