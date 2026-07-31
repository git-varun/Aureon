// frontend/src/components/aureon/dashboard/AllocationDriftCard.jsx
import React, { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAureonData } from '@/hooks/useAureonData';
import { Sk, RBtn, Cerr, Cmt, CS, Eyebrow } from '../ui';

const dc = pp => Math.abs(pp) < 1 ? 'var(--ink-30)' : Math.abs(pp) < 3 ? 'var(--dusk-500)' : 'var(--crimson-500)';

// targetsOverride: optional {asset_class: fraction} used in place of the saved
// allocation-targets query — lets a caller (e.g. the Settings editor) preview
// drift against in-progress, unsaved edits instead of only the persisted value.
export function AllocationDriftCard({ onNavigatePortfolio, targetsOverride }) {
  const queryClient = useQueryClient();
  const { loading, error, allocByClass, classTarget: savedClassTarget, classLabel, classTargetsLoading, classTargetsError, classTargetsUsingDefaults } = useAureonData();
  const classTarget = targetsOverride || savedClassTarget;
  // Only relevant when using the saved query (not a Settings-editor preview
  // override) — see useAureonData.js for why an empty object during loading
  // must not be treated the same as "targets loaded, drift is 0".
  const targetsLoading = !targetsOverride && classTargetsLoading;
  const targetsError = !targetsOverride && classTargetsError;
  const usingDefaultTargets = !targetsOverride && classTargetsUsingDefaults;

  const driftRows = useMemo(() => {
    const keys = [...new Set([...Object.keys(allocByClass), ...Object.keys(classTarget)])];
    return keys
      .map(key => ({
        key,
        label: classLabel[key] || key,
        actual: allocByClass[key] || 0,
        target: classTarget[key] || 0,
        drift: ((allocByClass[key] || 0) - (classTarget[key] || 0)) * 100,
      }))
      .filter(r => r.actual > 0 || (targetsOverride && r.target > 0))
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  }, [allocByClass, classTarget, classLabel, targetsOverride]);

  const data = driftRows.length > 0 ? driftRows : null;
  const status = (loading || targetsLoading) ? 'loading' : (error || targetsError) ? 'error' : !data ? 'empty' : 'ready';
  const refetch = () => queryClient.invalidateQueries();

  return (
    <div style={{ ...CS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Eyebrow>Allocation drift</Eyebrow>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status === 'ready' && data && onNavigatePortfolio && (
            <button onClick={onNavigatePortfolio} className="du3-cta ghost" style={{ height: 22, fontSize: 11, padding: '0 8px' }}>
              Rebalance →
            </button>
          )}
          <RBtn onRefresh={refetch} />
        </div>
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Sk h={11} w={62} /><div style={{ flex: 1 }}><Sk h={6} /></div><Sk h={10} w={36} /><Sk h={10} w={28} />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && <Cerr msg={(error || targetsError)?.message} retry={refetch} />}
      {status === 'empty' && <Cmt msg="No allocation data" />}

      {status === 'ready' && data && (() => {
        const maxW = Math.max(...data.map(r => Math.max(r.actual, r.target)), 0.01);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {data.map(row => (
              <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 42px 32px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-20)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.label}</span>
                <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'visible' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${(row.actual / maxW) * 100}%`, background: dc(row.drift), borderRadius: 'inherit', opacity: 0.75 }} />
                  <div style={{ position: 'absolute', top: -3, bottom: -3, width: 1, left: `${(row.target / maxW) * 100}%`, background: 'rgba(255,255,255,0.40)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)', textAlign: 'right' }}>{(row.actual * 100).toFixed(1)}%</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: dc(row.drift), textAlign: 'right' }}>{row.drift >= 0 ? '+' : ''}{row.drift.toFixed(1)}</span>
              </div>
            ))}
            <div style={{ marginTop: 2, fontSize: 10, color: 'var(--ink-60)' }}>
              {usingDefaultTargets ? 'pp vs suggested starter weight (no saved targets yet) · white marker = target weight' : 'pp vs target · white marker = target weight'}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
