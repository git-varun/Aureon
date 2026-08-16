// Port of Python's built-in round() semantics (round-half-to-even /
// "banker's rounding"), used everywhere this domain's Python services call
// round(x, n) — e.g. _signal_confidence, _compute_day_pct, get_theme_nav's
// composite. JS's Math.round is round-half-up, which disagrees with Python
// exactly at .5 boundaries (e.g. rsi=15.00 -> confidence 62.5 -> Python
// rounds to 62 (even), Math.round would give 63). Reachable in this domain
// because several formulas here (RSI-based percentages/40, /30, /15) land
// exactly on .5 for round-number RSI inputs, not just as a theoretical edge
// case.
export function pyRound(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  // Correct for the multiplication's floating-point representation error
  // before deciding the half-to-even tie-break — without this, e.g.
  // 0.625 * 100 can land at 62.49999999999999 instead of 62.5 and silently
  // skip the tie-break branch.
  const scaled = Number((value * factor).toPrecision(15));
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const EPS = 1e-9;
  let result: number;
  if (Math.abs(diff - 0.5) < EPS) {
    result = floor % 2 === 0 ? floor : floor + 1;
  } else {
    result = Math.round(scaled);
  }
  return result / factor;
}
