import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/api/apiService';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Sk, RBtn, Cerr, Cmt, CS, Eyebrow } from '../ui';

const transform = (raw) => {
  if (!raw || (raw.position_count != null ? raw.position_count === 0 : raw.diversification_score === 0)) return null;
  const score = Math.round(raw.diversification_score);
  const label = score >= 75 ? 'Well diversified' : score >= 55 ? 'Moderate' : 'Concentrated';
  return {
    score,
    label,
    classCount: raw.asset_class_count ?? '—',
    sectors: raw.sector_count ?? '—',
    topClass: raw.top_asset_class ?? '—',
    topPct: raw.top_asset_class_weight ?? null,
  };
};

export function DiversificationCard() {
  const { activePortfolioId } = usePortfolio();
  const { data: raw, isPending, isError, error, refetch } = useQuery({
    queryKey: ['intelligence', 'diversification', activePortfolioId],
    queryFn: () => apiService.getPortfolioDiversification(activePortfolioId),
    enabled: !!activePortfolioId,
    staleTime: 60000,
  });

  const data = React.useMemo(() => transform(raw ?? null), [raw]);
  const status = isPending ? 'loading' : isError ? 'error' : !data ? 'empty' : 'ready';

  return (
    <div style={{ ...CS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Eyebrow>Diversification</Eyebrow><RBtn onRefresh={refetch} />
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Sk h={34} w={110} /><Sk h={8} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {[0, 1, 2, 3].map(i => <Sk key={i} h={46} />)}
          </div>
        </div>
      )}

      {status === 'error' && <Cerr msg={error?.message} retry={refetch} />}
      {status === 'empty' && <Cmt msg="Diversification data unavailable" />}

      {status === 'ready' && data && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 500, color: 'var(--ink-00)' }}>{data.score}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-50)' }}>/100</span>
            <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 500, color: data.score >= 75 ? 'var(--sage-500)' : data.score >= 55 ? 'var(--dusk-500)' : 'var(--crimson-500)' }}>{data.label}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 'inherit', width: `${data.score}%`, background: data.score >= 75 ? 'var(--sage-500)' : data.score >= 55 ? 'var(--dusk-500)' : 'var(--crimson-500)', transition: 'width 600ms var(--ease-decel)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Asset classes', v: data.classCount },
              { l: 'Sectors',       v: data.sectors },
              { l: 'Top class',     v: data.topClass },
              { l: 'Max weight',    v: data.topPct != null ? (data.topPct * 100).toFixed(1) + '%' : '—' },
            ].map(({ l, v }) => (
              <div key={l} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 3 }}>{l}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: 'var(--ink-00)' }}>{v}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
