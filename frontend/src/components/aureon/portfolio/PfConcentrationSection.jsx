import React from 'react';
import { useCardData } from '@/hooks/useCardData';
import { apiService } from '@/api/apiService';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { concentrationFromRaw } from '@/components/aureon/utils';
import { Sk, Cerr } from '@/components/aureon/ui';

export function PfConcentrationSection() {
  const { activePortfolioId } = usePortfolio();
  const { status, data: raw, error, refetch } = useCardData(
    React.useCallback(() => apiService.getPortfolioConcentration(activePortfolioId), [activePortfolioId])
  );
  const data = React.useMemo(() => concentrationFromRaw(raw ?? null), [raw]);

  if (status === 'loading') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Sk h={10} w={70} style={{ marginBottom: 8 }} />
          <Sk h={24} w={100} />
        </div>
      ))}
    </div>
  );

  if (status === 'error') return <Cerr msg={error} retry={refetch} />;

  if (!data) return (
    <div style={{ padding: '40px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 12, background: 'rgba(255,255,255,0.012)' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-20)', marginBottom: 6 }}>No concentration data</div>
      <div style={{ fontSize: 13, color: 'var(--ink-40)', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>Connect a provider to calculate concentration metrics.</div>
    </div>
  );

  const stats = [
    { l: 'HHI',         v: data.hhi         != null ? data.hhi.toFixed(3)                   : '—' },
    { l: 'Score',       v: data.score        != null ? data.score + '/100'                   : '—' },
    { l: 'Label',       v: data.label        ?? '—' },
    { l: 'Top holding', v: data.topHolding   ?? '—' },
    { l: 'Top weight',  v: data.topPct       != null ? (data.topPct * 100).toFixed(1) + '%'  : '—' },
    { l: 'Holdings',    v: data.holdingCount ?? '—' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
      {stats.map(({ l, v }) => (
        <div key={l} style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6 }}>{l}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--ink-00)' }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
