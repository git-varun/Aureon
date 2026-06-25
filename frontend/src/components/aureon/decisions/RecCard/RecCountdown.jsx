import React from 'react';

export default function RecCountdown({ undoLeft, onUndo }) {
  if (undoLeft > 0) {
    return (
      <>
        <span className="countdown">Undo in {undoLeft}s</span>
        <button className="undo" onClick={onUndo}>Undo</button>
      </>
    );
  }

  return (
    <span className="countdown" style={{ color: 'var(--ink-40)' }}>Logged</span>
  );
}
