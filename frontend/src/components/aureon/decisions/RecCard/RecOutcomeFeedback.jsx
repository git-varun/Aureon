import React from 'react';
import { REC_STATUS } from '../constants.js';
import RecCountdown from './RecCountdown.jsx';

export default function RecOutcomeFeedback({ outcome, status, undoLeft, onUndo }) {
  if (!outcome) return null;

  const { predicted, realized, settleDays } = outcome;
  const isSettling = status === REC_STATUS.SETTLING;

  return (
    <div className="ofc">
      <span className="check">
        <svg width="11" viewBox="0 0 11 9" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>

      <span>
        Applied{predicted ? ` · predicted ${predicted}` : ''}
        {isSettling && settleDays ? ` · settling ~${settleDays}d` : ''}
        {realized ? (
          <>
            {' · realized '}
            <span style={{ color: 'var(--sage-500)' }}>{realized}</span>
          </>
        ) : null}
      </span>

      <RecCountdown undoLeft={undoLeft} onUndo={onUndo} />
    </div>
  );
}
