export const REC_STATUS = {
  ACTIVE: 'active',
  CONFLICT: 'conflict',
  APPLIED: 'applied',
  SETTLING: 'settling',
  DISMISSED: 'dismissed',
};

export const CONFIDENCE_LEVEL = {
  HIGH: 'high',
  MED: 'med',
  LOW: 'low',
};

export const BRIEFING_TREND = {
  Bullish:  { label: 'Constructive', color: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.10)',  border: 'rgba(111,174,136,0.28)' },
  Neutral:  { label: 'Neutral',      color: 'var(--aurum-100)',   bg: 'rgba(201,168,106,0.10)',  border: 'rgba(201,168,106,0.28)' },
  Bearish:  { label: 'Cautious',     color: 'var(--crimson-500)', bg: 'rgba(201,82,82,0.10)',    border: 'rgba(201,82,82,0.28)'  },
  Sideways: { label: 'Sideways',     color: 'var(--ink-30)',      bg: 'rgba(255,255,255,0.05)',  border: 'rgba(255,255,255,0.12)' },
  Volatile: { label: 'Volatile',     color: 'var(--crimson-400)', bg: 'rgba(201,82,82,0.06)',    border: 'rgba(201,82,82,0.20)'  },
};

export const ACTION_COLOR = {
  BUY:    'var(--sage-500)',
  SELL:   'var(--crimson-500)',
  HOLD:   'var(--aurum-100)',
  REDUCE: 'var(--crimson-500)',
  ADD:    'var(--sage-500)',
};

export const UNDO_WINDOW_SEC = 20;
