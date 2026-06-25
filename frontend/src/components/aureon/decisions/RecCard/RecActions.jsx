import React from 'react';
import { REC_STATUS } from '../constants';
import RecMetadata from './RecMetadata';

export default function RecActions({
  rec,
  status,
  isStaged,
  onApply,
  onDismiss,
  onUndo,
  onExplain,
  onStage,
  onSnooze,
  onViewLineage,   // eslint-disable-line no-unused-vars -- reserved for external lineage navigation (Task 4)
  showLineage,
  onToggleLineage,
}) {
  const isActive    = status === REC_STATUS.ACTIVE;
  const isConflict  = status === REC_STATUS.CONFLICT;
  const isApplied   = status === REC_STATUS.APPLIED || status === REC_STATUS.SETTLING;
  const isDismissed = status === REC_STATUS.DISMISSED;

  const showExplain  = isActive || isConflict || isApplied;
  const showLineageBtn = isActive || isConflict || isApplied;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {/* Left group — primary actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        {isActive && (
          <button
            className="du3-cta primary"
            style={{ height: 28, fontSize: 12 }}
            onClick={onApply}
          >
            Apply
          </button>
        )}

        {(isActive || isConflict) && (
          <button
            className="du3-cta ghost"
            style={{ height: 28, fontSize: 12 }}
            onClick={onDismiss}
          >
            Dismiss
          </button>
        )}

        {isDismissed && (
          <button
            className="du3-cta ghost"
            style={{ height: 28, fontSize: 12 }}
            onClick={onUndo}
          >
            ↩ Restore
          </button>
        )}

        {showExplain && (
          <button
            className="du3-cta ghost"
            style={{
              height:      28,
              fontSize:    12,
              display:     'inline-flex',
              gap:         5,
              color:       'var(--aurum-100)',
              borderColor: 'rgba(201,168,106,0.18)',
            }}
            onClick={() => onExplain(rec)}
          >
            <span style={{ color: 'var(--aurum-500)', fontSize: 10 }}>✦</span>
            Explain
          </button>
        )}

        {showLineageBtn && (
          <button
            className="du3-cta ghost"
            style={{
              height:      28,
              fontSize:    12,
              display:     'inline-flex',
              gap:         5,
              color:       showLineage ? 'var(--aurum-100)' : undefined,
              borderColor: showLineage ? 'rgba(201,168,106,0.18)' : undefined,
            }}
            onClick={onToggleLineage}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18M7 12l4-4 4 4 5-5"/>
            </svg>
            Lineage
          </button>
        )}
      </div>

      {/* Secondary group */}
      <div style={{ display: 'flex', gap: 6, opacity: 0.75 }}>
        <button
          className="du3-cta ghost"
          style={{
            height:      28,
            fontSize:    12,
            color:       isStaged ? 'var(--aurum-100)' : undefined,
            borderColor: isStaged ? 'rgba(201,168,106,0.28)' : undefined,
            background:  isStaged ? 'rgba(201,168,106,0.08)' : undefined,
          }}
          onClick={onStage}
        >
          Stage
        </button>

        <button
          className="du3-cta ghost"
          style={{ height: 28, fontSize: 12 }}
          onClick={onSnooze}
        >
          Snooze
        </button>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right: metadata */}
      <RecMetadata horizon={rec.horizon} />
    </div>
  );
}
