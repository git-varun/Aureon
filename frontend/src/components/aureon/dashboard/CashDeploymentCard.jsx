import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/api/apiService';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Sk, Cerr, CS, Eyebrow } from '../ui';
import { useFmtMoney } from '@/hooks/useFmtMoney';

const transform = (raw) => {
  if (!raw) return null;
  return {
    uninvestedCash: raw.cash_balance,
    pct: raw.cash_ratio,
    target: 0.05,
    recommendation: raw.suggestions?.[0] ?? 'Cash is within normal range.',
  };
};

const RefreshIcon = ({ onClick }) => (
  <button onClick={onClick} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)', padding: 2, display: 'inline-flex', lineHeight: 1 }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>
    </svg>
  </button>
);

export function CashDeploymentCard() {
  const { activePortfolioId } = usePortfolio();
  const { data: raw, isPending, isError, error, refetch } = useQuery({
    queryKey: ['intelligence', 'cash-opportunities', activePortfolioId],
    queryFn: () => apiService.getCashOpportunities(activePortfolioId),
    enabled: !!activePortfolioId,
    staleTime: 60000,
  });

  const data = React.useMemo(() => transform(raw ?? null), [raw]);
  const status = isPending ? 'loading' : isError ? 'error' : !data ? 'empty' : 'ready';
  const fmt = useFmtMoney();

  return (
    <div style={{ ...CS, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Eyebrow>Cash deployment</Eyebrow>
        <RefreshIcon onClick={refetch} />
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Sk h={28} w={180} /><Sk h={6} /><Sk h={40} r={8} />
        </div>
      )}

      {status === 'error' && <Cerr msg={error?.message} retry={refetch} />}

      {status === 'empty' && (
        <div style={{ fontSize: 12, color: 'var(--ink-40)', lineHeight: 1.55 }}>
          Cash deployment data not available — connect a provider to see uninvested cash position.
        </div>
      )}

      {status === 'ready' && data && (() => {
        const col = data.pct < data.target * 0.5 ? 'var(--crimson-500)'
                  : data.pct > data.target * 1.5 ? 'var(--dusk-500)' : 'var(--sage-500)';
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, color: 'var(--ink-00)', letterSpacing: '-0.015em' }}>
                {fmt(data.uninvestedCash, 'INR', { dp: 0 })}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: col }}>{(data.pct * 100).toFixed(1)}% of portfolio</span>
              <span style={{ fontSize: 11, color: 'var(--ink-50)' }}>target {(data.target * 100).toFixed(0)}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginBottom: 12 }}>
              <div style={{ width: `${Math.min(100, (data.pct / data.target) * 100)}%`, height: '100%', borderRadius: 'inherit', background: col, opacity: 0.75 }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-30)', lineHeight: 1.6 }}>{data.recommendation}</div>
          </>
        );
      })()}
    </div>
  );
}
