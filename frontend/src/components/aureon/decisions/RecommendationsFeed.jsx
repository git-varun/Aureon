/* Aureon — RecommendationsFeed: active, snoozed, basket, applied, dismissed sections. */
import React, { useState, useEffect } from 'react';
import { useApp } from '@/components/aureon/store';
import { band, needsModal } from '@/components/aureon/utils';
import { useFmtMoney } from '@/hooks/useFmtMoney';
import RecCard from './RecCard';
import CalibrationStrip from './CalibrationStrip';
import DismissReasonModal from './DismissReasonModal';
import { DecisionBasket } from '@/components/aureon/DecisionBasket';
import { getRecStatus } from './utils/recommendation';
import { REC_STATUS } from './constants';

/* ─── Skeleton ─── */
const RecsSkeleton = () => (
  <>
    <style>{`@keyframes aureon-recPulse { 0%,100%{opacity:0.55} 50%{opacity:0.9} }`}</style>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px',
        borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.015)', overflow: 'hidden',
        animation: 'aureon-recPulse 1.8s ease-in-out infinite',
        animationDelay: `${i * 0.2}s`,
      }}>
        {/* Action badge + title placeholder */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 52, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ width: '45%', height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: 60, height: 12, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }} />
        </div>
        {/* Meta placeholder */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 70, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ width: 50, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.04)' }} />
        </div>
        {/* Reasoning placeholder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ width: '85%', height: 11, borderRadius: 3, background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ width: '70%', height: 11, borderRadius: 3, background: 'rgba(255,255,255,0.05)' }} />
        </div>
        {/* Actions row placeholder */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 65, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ width: 65, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ width: 65, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
          </div>
          <div style={{ width: 80, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }} />
        </div>
      </div>
    ))}
  </>
);

/* ─── Error ─── */
const RecsError = ({ onRetry }) => (
  <div style={{
    padding: '32px 24px', borderRadius: 12, textAlign: 'center',
    background: 'rgba(209,107,107,0.06)', border: '1px solid rgba(209,107,107,0.20)',
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: 'rgba(209,107,107,0.12)', border: '1px solid rgba(209,107,107,0.30)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crimson-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <div style={{ fontSize: 14, color: 'var(--ink-10)', fontWeight: 600, marginBottom: 6 }}>Unable to load recommendations</div>
    <div style={{ fontSize: 12.5, color: 'var(--ink-40)', marginBottom: 16, maxWidth: 340, margin: '0 auto 16px' }}>
      Recommendation analysis could not be completed. Check your connection and try again.
    </div>
    {onRetry && (
      <button onClick={onRetry} style={{
        height: 34, padding: '0 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: 'var(--crimson-500)', color: 'var(--ink-00)', fontSize: 13,
        fontFamily: 'var(--font-ui)', fontWeight: 500,
      }}>Retry</button>
    )}
  </div>
);

/* ─── BasketConfirmModal (ported from Decisions.jsx) ─── */
const BasketConfirmModal = ({ recs, onCancel, onConfirm }) => {
  const fmtCash = useFmtMoney();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const cash = recs.reduce((s, r) => s + (r.impact?.cash || 0), 0);
  const modalCount = recs.filter(r => needsModal(r)).length;
  return (
    <div className="cm-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="cm-panel layer-3" style={{ width: 'min(560px,94vw)' }}>
        <div className="cm-head">
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600 }}>Confirm basket</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em', marginTop: 6 }}>
              Commit {recs.length} {recs.length === 1 ? 'decision' : 'decisions'}
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-30)', maxWidth: 460 }}>
              {modalCount > 0
                ? `${modalCount} of these ${modalCount === 1 ? 'is a portfolio- or class-level action that' : 'are portfolio- or class-level actions that'} normally need individual confirmation. Review the set before committing.`
                : 'Review the set before committing.'}
            </p>
          </div>
          <button className="du3-cta ghost" onClick={onCancel} style={{ flexShrink: 0 }}>✕</button>
        </div>
        <div className="cm-body">
          <div style={{ display: 'grid', gap: 8 }}>
            {recs.map(r => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '11px 13px', borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--ink-00)' }}>{r.action}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-20)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title} · <span style={{ color: 'var(--ink-40)' }}>{r.impactOneLine}</span>
                </span>
                {needsModal(r) && <span style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--dusk-500)', whiteSpace: 'nowrap' }}>needs review</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, padding: '11px 14px', borderRadius: 9, background: 'rgba(201,168,106,0.06)', border: '1px solid rgba(201,168,106,0.16)' }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-30)', letterSpacing: '0.04em' }}>Combined cash freed</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500, color: cash >= 0 ? 'var(--sage-500)' : 'var(--ink-00)' }}>
              {cash ? fmtCash(cash, 'USD', { dp: 0 }) : '—'}
            </span>
          </div>
        </div>
        <div className="cm-foot" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="du3-cta ghost" onClick={onCancel}>Cancel</button>
          <button className="du3-cta primary" onClick={onConfirm}>Commit {recs.length} {recs.length === 1 ? 'decision' : 'decisions'} →</button>
        </div>
      </div>
    </div>
  );
};

/* ─── CollapsibleSection ─── */
const CollapsibleSection = ({ title, count, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 20 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: open ? 12 : 0, width: '100%' }}>
        <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 700 }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-60)' }}>{count}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-50)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms var(--ease-std)' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div style={{ display: 'grid', gap: 8 }}>{children}</div>}
    </div>
  );
};

/* ─── RecommendationsFeed ─── */
export default function RecommendationsFeed({ tabState, onRetry, onExplain, onViewLineage, onOpenModal, onGoToBriefings, onGoToSignals }) {
  const { allRecs, active, applied, dismissed, apply, dismiss, undo, applyBatch } = useApp();

  const [filterStrength, setFilterStrength] = useState('all');
  const [filterAction, setFilterAction]     = useState('all');
  const [staged, setStaged]                 = useState([]);
  const [snoozed, setSnoozed]               = useState([]);
  const [basketModal, setBasketModal]       = useState(null);
  const [dismissTarget, setDismissTarget]   = useState(null);

  /* ─── Helpers ─── */
  const getStatus = (rec) => getRecStatus(rec, active, applied, dismissed);

  const snooze = (id) => {
    setSnoozed(s => s.includes(id) ? s : [...s, id]);
    setStaged(s => s.filter(x => x !== id));
  };
  const resume = (id) => setSnoozed(s => s.filter(x => x !== id));

  const stageRec   = (id) => setStaged(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const unstageRec = (id) => setStaged(s => s.filter(x => x !== id));
  const clearStaged = () => setStaged([]);

  /* ─── Filtered rec sets ─── */
  const activeRecs = allRecs.filter(rec => {
    const status = getStatus(rec);
    if (status !== REC_STATUS.ACTIVE && status !== REC_STATUS.CONFLICT) return false;
    if (snoozed.includes(rec.id)) return false;
    if (filterStrength !== 'all') {
      const b = band(rec.confidence ?? 0);
      const labelMap = { high: 'High', med: 'Medium', low: 'Low' };
      if (labelMap[b] !== filterStrength) return false;
    }
    if (filterAction !== 'all' && (rec.action || '').toUpperCase() !== filterAction) return false;
    return true;
  });

  const snoozedRecs  = allRecs.filter(rec => snoozed.includes(rec.id));
  const appliedRecs  = allRecs.filter(rec => getStatus(rec) === REC_STATUS.APPLIED || getStatus(rec) === REC_STATUS.SETTLING);
  const dismissedRecs = allRecs.filter(rec => getStatus(rec) === REC_STATUS.DISMISSED);

  const stagedRecs = allRecs.filter(r => staged.includes(r.id) && !snoozed.includes(r.id));

  /* ─── Basket commit ─── */
  const commitBasket = () => {
    const ids = stagedRecs.map(r => r.id);
    if (!ids.length) return;
    setBasketModal(ids);
  };
  const confirmBasket = () => {
    if (basketModal) { applyBatch(basketModal); setStaged([]); setBasketModal(null); }
  };

  /* ─── Keyboard shortcuts ─── */
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (!staged.length) return;
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); commitBasket(); }
      else if (e.key === 'Escape') clearStaged();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [staged, snoozed, basketModal]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Render states ─── */
  if (tabState === 'loading') return <RecsSkeleton />;
  if (tabState === 'error')   return <RecsError onRetry={onRetry} />;

  const selStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--ink-20)',
    borderRadius: 6,
    fontSize: 11.5,
    padding: '5px 10px',
    cursor: 'pointer',
  };

  return (
    <>
      {/* CalibrationStrip */}
      <CalibrationStrip />

      {/* Stats + filters bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Left: stat counters */}
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Active</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500, color: 'var(--ink-00)', lineHeight: 1 }}>{active.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Applied</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--sage-500)' }}>{applied.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Dismissed</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-40)' }}>{dismissed.length}</div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Right: filters */}
        <select value={filterStrength} onChange={e => setFilterStrength(e.target.value)} style={selStyle}>
          <option value="all">All confidence</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selStyle}>
          <option value="all">All actions</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="HOLD">HOLD</option>
          <option value="ADD">ADD</option>
          <option value="REDUCE">REDUCE</option>
        </select>
      </div>

      {/* Active recs section */}
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 700, marginBottom: 12 }}>
        Awaiting decision · {activeRecs.length}
      </div>

      {activeRecs.length === 0 ? (
        <div style={{
          padding: '32px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.10)',
          borderRadius: 12, background: 'rgba(255,255,255,0.015)',
        }}>
          <div style={{ fontSize: 14, color: 'var(--ink-20)', fontFamily: 'var(--font-heading)', fontWeight: 600, marginBottom: 6 }}>
            No active recommendations
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-40)', marginBottom: 16 }}>
            Aureon generates recommendations when signals warrant action.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={onGoToBriefings}
              style={{
                height: 32, padding: '0 14px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(201,168,106,0.14)', border: '1px solid rgba(201,168,106,0.35)',
                color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)',
              }}
            >
              Run AI briefing
            </button>
            <button
              onClick={onGoToSignals}
              style={{
                height: 32, padding: '0 14px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--ink-20)', fontSize: 12.5, fontFamily: 'var(--font-ui)',
              }}
            >
              Review signals →
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {activeRecs.map(rec => (
            <RecCard
              key={rec.id}
              rec={rec}
              status={getStatus(rec)}
              isStaged={staged.includes(rec.id)}
              onApply={() => apply(rec.id)}
              onDismiss={() => setDismissTarget(rec)}
              onUndo={() => undo(rec.id)}
              onExplain={() => onExplain?.(rec)}
              onOpenModal={() => onOpenModal?.(rec)}
              onStage={() => stageRec(rec.id)}
              onSnooze={() => snooze(rec.id)}
              onViewLineage={onViewLineage}
            />
          ))}
        </div>
      )}

      {/* Snoozed section */}
      {snoozedRecs.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 700, marginBottom: 8 }}>
            Snoozed · {snoozedRecs.length}
          </div>
          <div className="layer-1" style={{ padding: 0, overflow: 'hidden' }}>
            {snoozedRecs.map(r => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 12, padding: '12px 18px', fontSize: 12.5, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-10)', fontWeight: 600 }}>{r.action}</span>
                <span style={{ color: 'var(--ink-20)' }}>{r.title} · <span style={{ color: 'var(--ink-40)' }}>{r.impactOneLine}</span></span>
                <button onClick={() => resume(r.id)} className="du3-cta ghost" style={{ padding: '0 12px', height: 28, fontSize: 11.5 }}>Resume</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Basket */}
      <DecisionBasket stagedRecs={stagedRecs} onCommit={commitBasket} onClear={clearStaged} onUnstage={unstageRec} />

      {/* Applied section (collapsible) */}
      {appliedRecs.length > 0 && (
        <CollapsibleSection title="Applied this session" count={appliedRecs.length}>
          {appliedRecs.map(rec => (
            <RecCard
              key={rec.id}
              rec={rec}
              status={getStatus(rec)}
              isStaged={false}
              onApply={() => apply(rec.id)}
              onDismiss={() => setDismissTarget(rec)}
              onUndo={() => undo(rec.id)}
              onExplain={() => onExplain?.(rec)}
              onOpenModal={() => onOpenModal?.(rec)}
              onStage={() => stageRec(rec.id)}
              onSnooze={() => snooze(rec.id)}
              onViewLineage={onViewLineage}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Dismissed section (collapsible) */}
      {dismissedRecs.length > 0 && (
        <CollapsibleSection title="Dismissed" count={dismissedRecs.length}>
          {dismissedRecs.map(rec => (
            <RecCard
              key={rec.id}
              rec={rec}
              status={getStatus(rec)}
              isStaged={false}
              onApply={() => apply(rec.id)}
              onDismiss={() => setDismissTarget(rec)}
              onUndo={() => undo(rec.id)}
              onExplain={() => onExplain?.(rec)}
              onOpenModal={() => onOpenModal?.(rec)}
              onStage={() => stageRec(rec.id)}
              onSnooze={() => snooze(rec.id)}
              onViewLineage={onViewLineage}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Basket confirm modal */}
      {basketModal && (
        <BasketConfirmModal
          recs={allRecs.filter(r => basketModal.includes(r.id))}
          onCancel={() => setBasketModal(null)}
          onConfirm={confirmBasket}
        />
      )}

      {/* Dismiss-reason modal */}
      {dismissTarget && (
        <DismissReasonModal
          rec={dismissTarget}
          onCancel={() => setDismissTarget(null)}
          onConfirm={(reason) => { dismiss(dismissTarget.id, reason); setDismissTarget(null); }}
        />
      )}

      <div style={{ height: 32 }} />
    </>
  );
}
