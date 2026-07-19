/* Aureon — dismiss-reason capture: dropdown of common reasons + free text,
   wired through to dismiss_recommendation(reason=...) instead of the old
   hardcoded 'User dismissed' default. */
import React, { useEffect, useState } from 'react';

const COMMON_REASONS = [
  'Not aligned with my strategy',
  'Too risky',
  'Already have exposure',
  'Timing not right',
  'Disagree with the analysis',
];

export default function DismissReasonModal({ rec, onCancel, onConfirm }) {
  const [selected, setSelected] = useState(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const isOther = selected === 'Other';
  const reason = (isOther ? customReason : selected).trim();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="cm-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="cm-panel layer-3" style={{ width: 'min(440px,94vw)' }}>
        <div className="cm-head">
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600 }}>Dismiss</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em', marginTop: 6 }}>
              {rec?.action} {rec?.scope?.ref || ''}
            </h2>
          </div>
          <button className="du3-cta ghost" onClick={onCancel} style={{ flexShrink: 0 }}>✕</button>
        </div>
        <div className="cm-body">
          <label style={{ fontSize: 11.5, color: 'var(--ink-40)', display: 'block', marginBottom: 6 }}>Reason</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{
              width: '100%', height: 34, borderRadius: 7, border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.03)', color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)',
              padding: '0 10px',
            }}
          >
            {COMMON_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="Other">Other…</option>
          </select>
          {isOther && (
            <textarea
              autoFocus
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Type your reason…"
              rows={3}
              style={{
                width: '100%', marginTop: 10, borderRadius: 7, border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.03)', color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)',
                padding: 10, resize: 'vertical',
              }}
            />
          )}
        </div>
        <div className="cm-foot" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="du3-cta ghost" onClick={onCancel}>Cancel</button>
          <button
            className="du3-cta primary"
            disabled={isOther && !reason}
            onClick={() => onConfirm(reason)}
          >
            Confirm dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
