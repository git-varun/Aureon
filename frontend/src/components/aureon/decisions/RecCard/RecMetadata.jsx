import React from 'react';

export default function RecMetadata({ horizon }) {
  if (!horizon) return null;

  return (
    <span style={{
      fontSize:      10,
      color:         'var(--ink-50)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      fontFamily:    'var(--font-mono)',
    }}>
      {horizon}
    </span>
  );
}
