import React from 'react';
import { REC_STATUS } from '../constants';

export default function RecBody({ rec, status }) {
  if (status !== REC_STATUS.ACTIVE && status !== REC_STATUS.CONFLICT) return null;

  const reasoningEntries = rec.reasoning ? Object.entries(rec.reasoning).slice(0, 2) : [];
  const conflictIds = rec.conflictsWith || [];

  return (
    <>
      {/* Reasoning preview */}
      {reasoningEntries.length > 0 && (
        <div style={{
          display:      'grid',
          gap:          3,
          marginBottom: 10,
          padding:      '8px 10px',
          borderRadius: 7,
          background:   'rgba(255,255,255,0.02)',
          border:       '1px solid rgba(255,255,255,0.05)',
        }}>
          {reasoningEntries.map(([label, value]) => (
            <div key={label} style={{
              display:    'flex',
              gap:        10,
              fontSize:   11.5,
              lineHeight: 1.4,
            }}>
              <span style={{
                textTransform: 'capitalize',
                color:         'var(--ink-50)',
                flexShrink:    0,
                width:         78,
                fontSize:      11,
              }}>
                {label}
              </span>
              <span style={{ color: 'var(--ink-20)' }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Conflict strip */}
      {status === REC_STATUS.CONFLICT && conflictIds.length > 0 && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          8,
          padding:      '8px 11px',
          borderRadius: 7,
          marginBottom: 10,
          background:   'rgba(212,162,87,0.08)',
          border:       '1px solid rgba(212,162,87,0.22)',
          fontSize:     12,
          color:        'var(--dusk-500)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>Conflicts with {conflictIds.join(', ')} — resolve before applying.</span>
        </div>
      )}
    </>
  );
}
