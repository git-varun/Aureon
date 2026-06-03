# Dashboard — Portfolio Progress: Full Port Design

**Date:** 2026-06-04
**Scope:** `PortfolioProgress.jsx` + `PortfolioProgress.module.css`
**Status:** Approved — ready for implementation

---

## Overview

Replace the simplified Portfolio Progress implementation with a full port of the Aureon reference design (`Aureon/app/page-dashboard.jsx`). The section remains a collapsible accordion on the Dashboard. No backend changes. No new endpoints. No component extraction.

---

## Architecture

### Files Modified
- `frontend/src/components/aureon/dashboard/PortfolioProgress.jsx`
- `frontend/src/components/aureon/dashboard/PortfolioProgress.module.css`

### APIs Reused (no changes)
- `GET /aureon/portfolio/history?days={n}` via `apiService.fetchPortfolioHistory(days)`
- `useAureonData()` → `allocByClass`, `classTarget`

### State
| Variable | Type | Default | Purpose |
|---|---|---|---|
| `open` | `boolean` | `false` | Collapsed/expanded |
| `tab` | `'net' \| 'alloc' \| 'bench'` | `'net'` | Active tab |
| `range` | `'1M' \| '3M' \| '6M' \| '1Y' \| 'ALL'` | `'3M'` | Time window |
| `dims` | `{w, h}` | `{600, 160}` | Chart container dimensions (ResizeObserver) |

### Range → Days Mapping
```js
const RANGE_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 1825 };
```
`ALL` sends 1825 days (5 years) to the existing endpoint. The backend returns as much history as it has — no error if the portfolio is younger than 5 years.

### Partial History Handling
When the selected range exceeds available history, use what exists:
```
requestedDays = RANGE_DAYS[range]
// Backend returns fewer rows — render those, no empty state
```
Never show an empty state purely because the selected range is larger than stored history.

---

## Section 1 — Header (always visible, collapsed and expanded)

```
[▲ icon]  Portfolio progress           [range Δ]  [Drift]  [Sparkline]  [▼]
          Trend · allocation · benchmark
```

- **`range Δ`**: portfolio return for the current range (e.g. `+11.4%`). Shown when data exists.
- **`vs Bench`**: hidden — benchmark data not available; removing to avoid misleading `—` in the persistent header. Only the Drift and return stats are surfaced.
- **`Drift`**: max class deviation from target allocation. Color-coded: `> 5pp → warn`, else `pos`.
- **Sparkline**: rendered only when `history.length >= 2`.

> The collapsed header must communicate value before the user expands. It always shows current range return and drift when data is available.

---

## Section 2 — Expand/Collapse Animation

CSS accordion using `grid-template-rows`:

```css
.bodyWrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 240ms var(--ease-decel);
}
.bodyWrap.open {
  grid-template-rows: 1fr;
}
.bodyInner {
  overflow: hidden;
}
```

No JS height calculations. No ResizeObserver on the body wrapper. GPU-composited. Avoids `height: auto` transition problems.

---

## Section 3 — Loading State

While `isLoading`, render CSS-animated skeleton pulse rectangles — not a text label. Skeleton layout mirrors the active tab:

- **Net tab**: wide rectangle (chart) + 3 narrow rectangles (stats)
- **Alloc tab**: 4 bar-shaped rectangles
- **Bench tab**: wide rectangle (chart) + 4 narrow rectangles (stats)

```css
@keyframes skeletonPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
.skeleton {
  background: rgba(255,255,255,0.06);
  border-radius: 6px;
  animation: skeletonPulse 1.4s ease-in-out infinite;
}
```

---

## Section 4 — Tab Bar + Range Selectors

```
[Net worth trend] [Allocation evolution] [vs Benchmark]          [1M] [3M] [6M] [1Y] [ALL]
```

- Range selectors shown for `net` and `bench` tabs.
- Range selectors **hidden** for `alloc` tab (allocation data is always current snapshot).

---

## Section 5 — Net Worth Tab

**Layout:** 2-column grid (`2.2fr 1fr`), collapses to single column on mobile.

**Left column:**
- `SparkLine` chart (ResizeObserver-tracked width, 160px height)
- Date axis labels below (first date / last date)
- Footnote: "Net worth tracked over {range}. Reflects mark-to-market across active and semi-active holdings."

**Right column — 4 `ProgressStat` cards:**
| Label | Value | Note |
|---|---|---|
| Start | `fmt(first, 'USD')` | first date in data |
| Current | `fmt(last, 'USD')` | "today", highlighted |
| Δ | `±fmt(delta)` with sub `±pct%` | color-coded |
| Avg/mo | `fmt(delta / months)` | `"—"` if history < 30 days |

`months = daysInData / 30` where `daysInData = history.length` (actual days returned, not requested).

**Empty state:** "No price history yet — run the daily pipeline to populate trend data."

---

## Section 6 — Allocation Evolution Tab

**Option B behavior (approved).**

**When `allocHistory` (per-class historical snapshots) exists in API response:**
- Render stacked horizontal bars per month (reference design layout).
- Each bar: proportional width per class, color-coded, month label left.
- Legend below.

**When not available (current state — always):**
- Render current allocation snapshot: per-class horizontal bars with percentage labels.
- Explanatory message below:
  > "Historical allocation evolution will appear as Aureon accumulates portfolio snapshots."

**No fabrication.** No synthetic monthly data. No new endpoints.

---

## Section 7 — Benchmark Tab

**Chart:** Dual-line SVG (portfolio aurum + benchmark dashed blue).
- Portfolio line always drawn when data exists.
- Benchmark line drawn only when benchmark data is present in API response (currently never).

**Stats row (4 cards, 2-col on mobile):**
| Label | Value |
|---|---|
| Portfolio | real period return from data |
| Benchmark | **N/A** |
| Alpha | **N/A** |
| Tracking Error | **N/A** |

> Use **N/A** (not `—`) for unavailable stats. `—` implies missing render; `N/A` clearly communicates unavailable functionality.

**Note below:** "Benchmark comparison (NIFTY 50 / S&P 500) will be available when market data integration is enabled."

---

## Section 8 — Responsive Behavior

| Breakpoint | Change |
|---|---|
| `< 768px` (mobile) | Net tab: single column (chart stacks above stats). Benchmark stats: 2-col. Header: sparkline hidden. |
| `768–1024px` (tablet) | Net tab: `1.6fr 1fr` grid. Header stats condensed. |
| `>= 1024px` (desktop) | Full `2.2fr 1fr` layout as reference. |

---

## Verification Checklist

After implementation, verify:

1. Collapsed state — header shows return + drift
2. Expanded Net Worth — chart + 4 stats including Avg/mo
3. Expanded Allocation fallback — current snapshot bars + evolution message
4. Expanded Benchmark empty state — portfolio line + N/A stats + note
5. Loading skeleton — animated, matches tab layout
6. Mobile 768px — single column, sparkline hidden
7. Desktop 1440px — full grid layout
8. No console errors

---

## Out of Scope

- Component extraction into separate files
- New backend endpoints or API contracts
- Dashboard redesign outside Portfolio Progress
- GoalProgress, Hero, LifecycleStrip, or any other dashboard section
