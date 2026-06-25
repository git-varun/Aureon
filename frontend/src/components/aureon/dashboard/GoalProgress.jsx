// frontend/src/components/aureon/dashboard/GoalProgress.jsx
import React from 'react';
import { useApp } from '../store';
import { useCardData } from '@/hooks/useCardData';
import { Sk } from '../ui';
import { useFmtMoney } from '@/hooks/useFmtMoney';

const stub = async () => {
  await new Promise(r => setTimeout(r, 460 + Math.random() * 200));
  return null; // backend provides ytdReturn + monthlySavingActual
};

export function GoalProgress({ onNavigateSettings }) {
  const fmt = useFmtMoney();
  const { profile } = useApp();
  const annualTarget  = Number(profile?.annualTarget || profile?.target_profit_pct)   || 0;
  const monthlySaving = Number(profile?.monthlySavings || profile?.monthly_saving) || 0;

  const elapsedMonths = new Date().getMonth() + 1;
  const { status: gpStatus, data: goalData } = useCardData(stub);

  if (!annualTarget && !monthlySaving) return null;

  const ytdReturn           = goalData?.ytdReturn           ?? null;
  const monthlySavingActual = goalData?.monthlySavingActual ?? null;
  const pace        = annualTarget ? (annualTarget * elapsedMonths) / 12 : null;
  const statusColor = ytdReturn == null || pace == null ? 'var(--ink-40)' : ytdReturn >= pace ? 'var(--sage-500)' : ytdReturn >= pace * 0.8 ? 'var(--dusk-500)' : 'var(--crimson-500)';
  const statusLabel = ytdReturn == null || pace == null ? '…'             : ytdReturn >= pace ? 'on track'        : ytdReturn >= pace * 0.8 ? 'behind'          : 'off track';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
      {/* Target return card */}
      {annualTarget > 0 && (
        <div className="layer-1" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Target return</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4 }}>{annualTarget}%</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2 }}>annual target</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {gpStatus === 'loading'
              ? <Sk h={20} w={52} r={3} />
              : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: statusColor }}>{ytdReturn != null ? ytdReturn + '%' : '—'}</div>
            }
            <div style={{ fontSize: 11, color: statusColor, marginTop: 2 }}>YTD · {statusLabel}</div>
            {onNavigateSettings && (
              <button onClick={onNavigateSettings} style={{ fontSize: 10.5, color: 'var(--ink-40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
                edit goal →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Monthly saving card */}
      {monthlySaving > 0 && (
        <div className="layer-1" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Monthly saving</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4 }}>{fmt(monthlySaving, 'INR', { compact: true })}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2 }}>target</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {gpStatus === 'loading'
              ? <Sk h={20} w={60} r={3} />
              : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--ink-00)' }}>
                  {monthlySavingActual != null ? fmt(monthlySavingActual, 'INR', { compact: true }) : '—'}
                </div>
            }
            <div style={{ fontSize: 11, color: 'var(--ink-30)', marginTop: 2 }}>this month</div>
            {onNavigateSettings && (
              <button onClick={onNavigateSettings} style={{ fontSize: 10.5, color: 'var(--ink-40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
                edit goal →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
