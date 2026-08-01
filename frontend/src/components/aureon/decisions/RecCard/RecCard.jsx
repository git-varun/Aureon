import React, { useState, useRef, useEffect, useCallback } from 'react';
import { REC_STATUS, UNDO_WINDOW_SEC } from '../constants';
import { needsModal } from '@/components/aureon/utils';
import RecHeader from './RecHeader';
import RecBody from './RecBody';
import RecOutcomeFeedback from './RecOutcomeFeedback';
import RecActions from './RecActions';
import DecisionLineageInline from '../DecisionLineageInline';

const RecCard = React.memo(function RecCard({
  rec,
  status,
  appliedInfo,
  isStaged,
  onApply,
  onDismiss,
  onUndo,
  onExplain,
  onOpenModal,
  onStage,
  onSnooze,
  onViewLineage,
}) {
  const [showLineage, setShowLineage] = useState(false);
  const [undoLeft, setUndoLeft]       = useState(0);
  const timerRef                      = useRef(null);

  // Clear timer on unmount
  useEffect(() => () => clearInterval(timerRef.current), []);

  const handleApply = useCallback(() => {
    if (needsModal(rec)) { onOpenModal?.(); return; }
    if (timerRef.current) clearInterval(timerRef.current);
    onApply();
    setUndoLeft(UNDO_WINDOW_SEC);
    timerRef.current = setInterval(() => {
      setUndoLeft(s => {
        if (s <= 1) { clearInterval(timerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }, [rec, onApply, onOpenModal]);

  const handleToggleLineage = useCallback(() => setShowLineage(v => !v), []);

  // Derived state for article data-state
  const isAppliedOrSettling = status === REC_STATUS.APPLIED || status === REC_STATUS.SETTLING;
  const duState =
    isAppliedOrSettling        ? 'applied'          :
    status === REC_STATUS.CONFLICT ? 'conflict-blocked' :
    'idle';

  const isDismissed = status === REC_STATUS.DISMISSED;
  const showBody    = status === REC_STATUS.ACTIVE || status === REC_STATUS.CONFLICT;

  return (
    <article
      className="du3"
      data-state={duState}
      style={{ opacity: isDismissed ? 0.5 : undefined }}
    >
      <RecHeader rec={rec} status={status} age={rec.createdAt} />

      {showBody && (
        <RecBody rec={rec} status={status} />
      )}

      {isAppliedOrSettling && (
        <RecOutcomeFeedback
          outcome={appliedInfo}
          status={status}
          undoLeft={undoLeft}
          onUndo={onUndo}
        />
      )}

      <RecActions
        rec={rec}
        status={status}
        isStaged={isStaged}
        onApply={handleApply}
        onDismiss={onDismiss}
        onUndo={onUndo}
        onExplain={onExplain}
        onStage={onStage}
        onSnooze={onSnooze}
        onViewLineage={onViewLineage}
        showLineage={showLineage}
        onToggleLineage={handleToggleLineage}
      />

      {showLineage && (
        <div style={{ marginTop: 12, animation: 'cardEnter 200ms var(--ease-decel)' }}>
          <DecisionLineageInline rec={rec} />
        </div>
      )}
    </article>
  );
});

export default RecCard;
