import { useCallback } from 'react';
import { useApp } from '@/components/aureon/store';
import { needsModal } from '@/components/aureon/utils';

/**
 * Returns action handlers for a recommendation card.
 * Keeps action logic out of presentational components.
 *
 * TODO: unused — not imported anywhere. RecommendationsFeed.jsx and
 * RecCard.jsx currently inline this same apply/dismiss/undo logic directly,
 * so this hook is a duplicate that can silently drift out of sync with them.
 * Either replace those inline call sites with this hook, or delete this file.
 */
export function useRecommendationActions({ rec, onOpenModal, onUndo: externalUndo }) {
  const { apply, dismiss, undo } = useApp();

  const handleApply = useCallback(() => {
    if (needsModal(rec)) {
      onOpenModal?.(rec);
    } else {
      apply(rec.id);
    }
  }, [rec, apply, onOpenModal]);

  const handleDismiss = useCallback((reason = 'User dismissed') => {
    dismiss(rec.id, reason);
  }, [rec.id, dismiss]);

  const handleUndo = useCallback(() => {
    undo(rec.id);
    externalUndo?.();
  }, [rec.id, undo, externalUndo]);

  return { handleApply, handleDismiss, handleUndo };
}
