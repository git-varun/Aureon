import React from 'react';
import { REC_STATUS } from '../constants.js';

const STATUS_CONFIG = {
  [REC_STATUS.ACTIVE]: {
    dot:    'var(--aurum-500)',
    bg:     'rgba(201,168,106,0.10)',
    border: 'rgba(201,168,106,0.22)',
    color:  'var(--aurum-100)',
    label:  'Active',
  },
  [REC_STATUS.CONFLICT]: {
    dot:    'var(--dusk-500)',
    bg:     'rgba(212,162,87,0.10)',
    border: 'rgba(212,162,87,0.22)',
    color:  'var(--dusk-500)',
    label:  'Conflict',
  },
  [REC_STATUS.APPLIED]: {
    dot:    'var(--sage-500)',
    bg:     'rgba(111,174,136,0.10)',
    border: 'rgba(111,174,136,0.22)',
    color:  'var(--sage-500)',
    label:  'Applied',
  },
  [REC_STATUS.SETTLING]: {
    dot:    '#7AA8D4',
    bg:     'rgba(122,168,212,0.10)',
    border: 'rgba(122,168,212,0.22)',
    color:  '#7AA8D4',
    label:  'Settling',
  },
  [REC_STATUS.DISMISSED]: {
    dot:    'var(--ink-50)',
    bg:     'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.07)',
    color:  'var(--ink-40)',
    label:  'Dismissed',
  },
};

const RecStatusBadge = React.memo(function RecStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;

  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      gap:            5,
      height:         18,
      padding:        '0 7px',
      borderRadius:   999,
      fontSize:       9,
      fontWeight:     700,
      letterSpacing:  '0.12em',
      textTransform:  'uppercase',
      background:     cfg.bg,
      border:         `1px solid ${cfg.border}`,
      color:          cfg.color,
    }}>
      <span style={{
        width:        5,
        height:       5,
        borderRadius: 999,
        flexShrink:   0,
        background:   cfg.dot,
      }} />
      {cfg.label}
    </span>
  );
});

export default RecStatusBadge;
