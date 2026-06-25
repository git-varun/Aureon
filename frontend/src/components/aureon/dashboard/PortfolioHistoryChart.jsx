// frontend/src/components/aureon/dashboard/PortfolioHistoryChart.jsx
import React from 'react';

const RANGE_DAYS = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'ALL': Infinity };

export function PortfolioHistoryChart({ snapshots, range, height = 170 }) {
  if (!snapshots?.length) return null;

  const days = RANGE_DAYS[range] || 90;
  const vis  = snapshots.slice(-Math.min(days, snapshots.length));
  const vals = vis.map(s => s.value);
  const mn   = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const up   = vals[vals.length - 1] >= vals[0];
  const hex  = up ? '#6FAE88' : '#D16B6B';
  const W = 800, H = height, pt = 6, pb = 22;
  const xi = i => (i / (vis.length - 1)) * W;
  const yv = v => pt + (1 - (v - mn) / r) * (H - pt - pb);
  const d  = vis.map((s, i) => (i ? 'L' : 'M') + xi(i).toFixed(1) + ' ' + yv(s.value).toFixed(1)).join(' ');
  const fd = dt => new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const lx = [0, Math.floor((vis.length - 1) / 2), vis.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      <defs>
        <linearGradient id="phcGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hex} stopOpacity="0.18" />
          <stop offset="1" stopColor={hex} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line key={i} x1={0} x2={W}
          y1={pt + t * (H - pt - pb)} y2={pt + t * (H - pt - pb)}
          stroke="rgba(255,255,255,0.04)" />
      ))}
      <path d={d + ` L${xi(vis.length - 1)} ${H - pb} L0 ${H - pb} Z`} fill="url(#phcGrad)" />
      <path d={d} fill="none" stroke={hex} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {lx.map((idx, i) => (
        <text key={i}
          x={i === 0 ? 2 : i === 2 ? W - 2 : xi(idx)} y={H - 5}
          textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
          fontSize="10" fontFamily="var(--font-mono)" fill="rgba(255,255,255,0.22)">
          {fd(vis[idx].ts)}
        </text>
      ))}
      <circle
        cx={xi(vis.length - 1)} cy={yv(vals[vals.length - 1])}
        r="3.5" fill={hex} stroke="var(--canvas)" strokeWidth="1.5"
      />
    </svg>
  );
}
