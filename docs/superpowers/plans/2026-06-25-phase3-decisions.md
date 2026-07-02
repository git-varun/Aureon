# Phase 3 — Decisions Page — Implementation Plan

Spec: docs/superpowers/specs/2026-06-25-decisions-phase3-design.md
Branch: feature

## Global Constraints

- UI parity only — no backend changes, no API wiring changes, no business logic changes
- Do NOT modify: flow.jsx, primitives.jsx, store.jsx, ds.jsx, apiService.js, useAureonData.js
- Reuse existing: ConfidenceIndicator, ImpactPreviewPanel, ReasoningList, ActionConfirmationModal, Tabs, Drawer, ErrorState from existing files
- Presentation logic must NOT live in Decisions.jsx
- All new files go under: frontend/src/components/aureon/decisions/
- No stub replacement — AIBriefings retains real API calls
- RecCard primary actions: Apply, Dismiss, Explain. Secondary: Stage, Snooze
- CalibrationStrip uses activity array from useApp() for metrics calculation
- DecisionLineageInline uses signals from useAureonData() and activity from useApp()
- Memoize list-rendered components (RecCard, RecStatusBadge, CalibrationStrip, DecisionLineageInline)
- Each tab component accepts: tabState ('loading'|'error'|'ready'), onRetry callback
- Decisions.jsx: max ~200 lines, orchestration only

## Task 1: Foundation files

Create these three files:

### frontend/src/components/aureon/decisions/constants.js

```js
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
```

### frontend/src/components/aureon/decisions/utils/recommendation.js

Helper functions for recommendation data. No imports from store or hooks.

```js
import { REC_STATUS, CONFIDENCE_LEVEL } from '../constants';

/** Given active/applied/dismissed arrays, compute the status of a rec */
export function getRecStatus(rec, active, applied, dismissed) {
  if (active.includes(rec.id)) {
    const blocked = (rec.conflictsWith || []).filter(id => active.includes(id));
    return blocked.length ? REC_STATUS.CONFLICT : REC_STATUS.ACTIVE;
  }
  const app = applied.find(a => a.id === rec.id);
  if (app) return app.pending ? REC_STATUS.SETTLING : REC_STATUS.APPLIED;
  if (dismissed.find(d => d.id === rec.id)) return REC_STATUS.DISMISSED;
  return REC_STATUS.ACTIVE;
}

/** Band label for confidence score */
export function getConfidenceLevel(score) {
  if (score >= 80) return CONFIDENCE_LEVEL.HIGH;
  if (score >= 50) return CONFIDENCE_LEVEL.MED;
  return CONFIDENCE_LEVEL.LOW;
}

/** Format a recommendation's impact as a one-line string */
export function fmtImpactOneLine(rec) {
  return rec.impactOneLine || '';
}

/** Determine if a rec has high-impact that needs a modal (from utils.js) */
export { needsModal } from '../../utils';
```

### frontend/src/components/aureon/decisions/hooks/useRecommendationActions.js

```js
import { useCallback } from 'react';
import { useApp } from '@/components/aureon/store';
import { needsModal } from '@/components/aureon/utils';

/**
 * Returns action handlers for a recommendation card.
 * Keeps action logic out of presentational components.
 */
export function useRecommendationActions({ rec, onOpenModal, onUndo: externalUndo }) {
  const { apply, dismiss, undo } = useApp();

  const handleApply = useCallback(() => {
    if (needsModal(rec)) {
      onOpenModal?.(rec);
    } else {
      apply(rec.id);
    }
  }, [rec, apply, onOpenModal]);

  const handleDismiss = useCallback((reason = 'User dismissed') => {
    dismiss(rec.id, reason);
  }, [rec.id, dismiss]);

  const handleUndo = useCallback(() => {
    undo(rec.id);
    externalUndo?.();
  }, [rec.id, undo, externalUndo]);

  return { handleApply, handleDismiss, handleUndo };
}
```

Commit with message: "feat(decisions): add constants, recommendation utils, and action hook"

---

## Task 2: RecCard leaf sub-components

Create these files under `frontend/src/components/aureon/decisions/RecCard/`:

### RecStatusBadge.jsx

Pill badge. Props: `status` (string from REC_STATUS). Memoize with React.memo.

Status config (exact prototype colors):
- active: dot `var(--aurum-500)`, bg `rgba(201,168,106,0.10)`, border `rgba(201,168,106,0.22)`, color `var(--aurum-100)`, label "Active"
- conflict: dot `var(--dusk-500)`, bg `rgba(212,162,87,0.10)`, border `rgba(212,162,87,0.22)`, color `var(--dusk-500)`, label "Conflict"
- applied: dot `var(--sage-500)`, bg `rgba(111,174,136,0.10)`, border `rgba(111,174,136,0.22)`, color `var(--sage-500)`, label "Applied"
- settling: dot `#7AA8D4`, bg `rgba(122,168,212,0.10)`, border `rgba(122,168,212,0.22)`, color `#7AA8D4`, label "Settling"
- dismissed: dot `var(--ink-50)`, bg `rgba(255,255,255,0.03)`, border `rgba(255,255,255,0.07)`, color `var(--ink-40)`, label "Dismissed"

Style: display inline-flex, alignItems center, gap 5, height 18, padding 0 7px, borderRadius 999, fontSize 9, fontWeight 700, letterSpacing 0.12em, textTransform uppercase.
Dot: width 5, height 5, borderRadius 999, flexShrink 0.

### RecMetadata.jsx

Horizon badge. Props: `horizon` (string, e.g. "Short"/"Long"). Returns null if no horizon.
Style: fontSize 10, color `var(--ink-50)`, letterSpacing 0.06em, textTransform uppercase, fontFamily `var(--font-mono)`.

### RecCountdown.jsx

Props: `undoLeft` (number, seconds remaining), `onUndo` (function).
- If undoLeft > 0: show "Undo in {undoLeft}s" span + "Undo" button
- If undoLeft === 0: show "Logged" span (color `var(--ink-40)`)
Span class: "countdown". Button class: "undo".

### RecPrediction.jsx

Props: `impact` (rec.impact object). Shows predicted impact one-liner.
Used inside ExplainPanel. Returns null if no impact.
Style: padding 11 14, borderRadius 9, background `rgba(201,168,106,0.07)`, border `1px solid rgba(201,168,106,0.18)`, display flex, alignItems center, gap 10.
Action text: fontFamily mono, fontSize 12, fontWeight 700, color `var(--ink-00)`.
Impact text: fontFamily mono, fontSize 12.5, color `var(--aurum-100)`.
Props: `action` (string), `impactOneLine` (string).

### RecOutcomeFeedback.jsx

Props: `outcome` (object: {appliedAt, realized, predicted, settleDays}), `status` (REC_STATUS.APPLIED|SETTLING), `undoLeft` (number), `onUndo` (function).
Class: "ofc". Renders the outcome feedback card matching prototype's `.ofc` class.

Content:
- Check span: class "check", SVG checkmark (white, width 11)
- Text span: "Applied · predicted [predicted]" + if settling + settleDays: " · settling ~Nd" + if realized: " · realized [realized]" (sage color for realized value)
- RecCountdown inline

### RecSupportingSignals.jsx

Props: `signals` (array of signal objects linked to this rec).
If no signals: italic "Model-initiated — no directly linked signals." (color `var(--ink-40)`).
If signals: list of signal items:
- Severity badge: padding 1 6, borderRadius 3, flexShrink 0, marginTop 1, fontSize 9, fontWeight 600, letterSpacing 0.09em, uppercase. Colors: high=crimson-tinted, med=aurum-tinted, low=gray-tinted.
- Signal text (fontSize 12.5, ink-10, lineHeight 1.5)
- Signal kind + ts (mono, 10.5, ink-40, marginTop 2)

Memoize with React.memo.

Commit: "feat(decisions/RecCard): add leaf sub-components (badge, metadata, countdown, prediction, outcome, signals)"

---

## Task 3: RecCard layout components

Continue in `frontend/src/components/aureon/decisions/RecCard/`.

Depends on Task 1 (constants, utils) and Task 2 (leaf components).

### RecHeader.jsx

Props: `rec` (rec object), `status` (string), `age` (string).
Layout: `display flex, alignItems flex-start, gap 10, marginBottom 10`

Left (flex 1, minWidth 0):
- Row 1: action badge + title + RecStatusBadge
  - Action badge: display inline-flex, alignItems center, height 22, padding 0 8px, borderRadius 5, flexShrink 0, marginTop 2, bg `rgba(255,255,255,0.05)`, border `1px solid rgba(255,255,255,0.08)`, fontFamily mono, fontSize 10.5, fontWeight 700, color `var(--ink-00)`, letterSpacing 0.06em. Shows `rec.action`.
  - Title (class `du3-title`): fontSize 14.5
  - RecStatusBadge
- Row 2: impact one-liner (class `du3-impact`): `fmtImpactOneLine(rec)`

Right (display flex, flexDirection column, alignItems flex-end, gap 4, flexShrink 0):
- ConfidenceIndicator compact (import from `@/components/aureon/primitives`)
- Age: fontFamily mono, fontSize 10, color `var(--ink-50)`. Shows `rec.createdAt`.

### RecBody.jsx

Props: `rec` (rec object), `status` (string).
Visible only when status is 'active' or 'conflict'.

Reasoning preview:
- Container: display grid, gap 3, marginBottom 10, padding 8 10, borderRadius 7, bg `rgba(255,255,255,0.02)`, border `1px solid rgba(255,255,255,0.05)`
- Show first 2 entries of `rec.reasoning`
- Each row: display flex, gap 10, fontSize 11.5, lineHeight 1.4
- Label: textTransform capitalize, color `var(--ink-50)`, flexShrink 0, width 78, fontSize 11
- Value: color `var(--ink-20)`

Conflict strip (only when status==='conflict'):
- Below reasoning
- Container: display flex, alignItems center, gap 8, padding 8 11, borderRadius 7, marginBottom 10, bg `rgba(212,162,87,0.08)`, border `1px solid rgba(212,162,87,0.22)`, fontSize 12, color `var(--dusk-500)`
- Warning triangle SVG icon (flexShrink 0)
- Text: "Conflicts with [conflictsWith titles] — resolve before applying."
- Note: conflictsWith is array of rec IDs; just show them as-is (title lookup happens in parent)

### RecActions.jsx

Props: `rec`, `status`, `isStaged`, `onApply`, `onDismiss`, `onUndo`, `onExplain`, `onStage`, `onSnooze`, `onViewLineage`, `showLineage`, `onToggleLineage`.

Layout: display flex, alignItems center, gap 6, flexWrap wrap.

Left group (display flex, gap 6):
- Apply button (class `du3-cta primary`, height 28, fontSize 12): visible when status==='active'
- Dismiss button (class `du3-cta ghost`, height 28, fontSize 12): visible when active or conflict
- Restore button (class `du3-cta ghost`, "↩ Restore", height 28, fontSize 12): visible when dismissed

- Explain button (class `du3-cta ghost`, height 28, fontSize 12, display inline-flex, gap 5, color `var(--aurum-100)`, borderColor `rgba(201,168,106,0.18)`):
  - ✦ icon span (color `var(--aurum-500)`, fontSize 10)
  - "Explain" text
  - Always visible for active/conflict/applied

- Lineage button (class `du3-cta ghost`, height 28, fontSize 12, display inline-flex, gap 5):
  - Lineage chart SVG icon (12x12, path "M3 3v18h18M7 12l4-4 4 4 5-5")
  - "Lineage" text
  - Color/borderColor: aurum when showLineage is true
  - onClick: onToggleLineage

Secondary group (style slightly dimmer, gap 6):
- Stage button: height 28, fontSize 12, same style as DecisionUnit's stage button (aurum when staged, gray otherwise)
- Snooze button: height 28, fontSize 12, ghost style

Spacer: flex 1

Right: RecMetadata (horizon)

### RecCard.jsx

Props: `rec`, `status`, `appliedInfo`, `isStaged`, `onApply`, `onDismiss`, `onUndo`, `onExplain`, `onStage`, `onSnooze`, `onViewLineage`.

Assembles RecHeader + RecBody + RecOutcomeFeedback (when applied) + RecActions + DecisionLineageInline (toggle).

State: `showLineage` (boolean, default false), `undoLeft` (number), timerRef.

Apply flow: when onApply called, start countdown timer (20s), call onApply callback.
When countdown reaches 0: stop timer.
On unmount: clear timer.

Article element: class `du3`, data-state={duState}, style opacity 0.5 if dismissed.
duState: `applied` if applied/settling, `conflict-blocked` if conflict, `idle` otherwise.

Layout (inside article):
1. RecHeader (always)
2. RecBody (if active or conflict)
3. RecOutcomeFeedback (if applied/settling, with appliedInfo)
4. RecActions
5. If showLineage: DecisionLineageInline (marginTop 12, animation cardEnter 200ms)

### RecCard/index.jsx

Re-exports RecCard as default:
```jsx
export { default } from './RecCard';
export { RecStatusBadge } from './RecStatusBadge';
```

Commit: "feat(decisions/RecCard): add layout components (header, body, actions, RecCard)"

---

## Task 4: DecisionLineageInline + CalibrationStrip

### DecisionLineageInline.jsx

Location: `frontend/src/components/aureon/decisions/DecisionLineageInline.jsx`

Props: `rec` (rec object).
Data: signals from useAureonData(), activity from useApp(). Memoize with React.memo.

Horizontal 3-node layout matching prototype's decision-lineage.jsx:

Container: margin 2 2 0, padding 12 14, borderRadius 12, bg `rgba(255,255,255,0.015)`, border `1px solid rgba(255,255,255,0.06)`

Kicker: fontSize 9.5, letterSpacing 0.14em, textTransform uppercase, color `var(--ink-40)`, fontWeight 600, marginBottom 10. Text: "Decision lineage"

Nodes row: display flex, alignItems stretch, gap 6, flexWrap wrap.

**Node component (inline):** flex `1 1 160px`, minWidth 150, borderRadius 9, padding 10 12, bg `rgba(255,255,255,0.025)`, border `1px solid [accent || rgba(255,255,255,0.07)]`
- Kicker div: fontSize 9, letterSpacing 0.14em, uppercase, color `var(--ink-40)`, fontWeight 600, marginBottom 6

**Arrow component (inline):** SVG 22x12, `M1 6h18M14 1l5 5-5 5`, stroke `var(--ink-50)`, strokeWidth 1.4

**Signal node:**
- Filter: `signals.filter(s => s.linkedRec === rec.id)`
- If empty: "Model-initiated" (fontSize 12, color `var(--ink-30)`) + "no single triggering signal" (10.5, ink-40)
- If signals: grid gap 5. Each: flex, alignItems baseline, gap 7. Severity dot (6x6 circle, color from SEV_TONE), kind (capitalize, fontWeight 500, 12px, ink-10), ts (mono, 10.5, ink-40, marginLeft 6), text (10.5, ink-30, marginTop 1)
- SEV_TONE: `{ high: 'var(--crimson-500)', med: 'var(--aurum-100)', low: 'var(--ink-30)' }`

**Recommendation node:** accent `rgba(201,168,106,0.30)`
- Action + ref: fontSize 12.5, ink-00, fontWeight 600 → `${rec.action} ${rec.scope?.ref}`
- Impact: aurum-100, mono, fontSize 11, marginTop 3 → `rec.impactOneLine`
- Confidence: fontSize 10.5, ink-40, marginTop 4 → `confidence ${rec.confidence}% · ${bandLabel}`
- Use `band()` and `bandLabel()` from `@/components/aureon/utils`

**Outcome node:**
- Find in activity: `activity.find(a => a.asset === rec.scope?.ref && a.action === rec.action && (a.kind === 'applied' || a.kind === 'dismissed'))`
- accent: if applied → `rgba(111,174,136,0.28)`, else → `rgba(255,255,255,0.07)`
- If applied outcome: "Applied" (sage, 12.5, fontWeight 600) + if realized: "realized X" (ink-10, mono, 11, marginTop 3) + if predicted: "vs predicted X" (ink-40, 10.5, marginTop 2)
- If dismissed: "Dismissed" (ink-20, 12.5, fontWeight 600) + detail text (ink-40, 10.5, marginTop 3)
- If no outcome: "Awaiting your decision" (ink-10, 12.5, fontWeight 600) + "expected [ret delta]" (ink-30, mono, 11, marginTop 3) + horizon (ink-40, 10.5, marginTop 2)

### CalibrationStrip.jsx

Location: `frontend/src/components/aureon/decisions/CalibrationStrip.jsx`

Props: none (reads from useApp()).
Memoize with React.memo.

State: calStatus (`'loading'` | `'ready'`). On mount, simulate 340ms–520ms async fetch (setTimeout). In production this would be an API call.

If calStatus === 'loading': horizontal bar, spinner SVG (13x13, spin animation), "Calibration" label (9.5, uppercase, aurum-100, 700), "Fetching from backend…" (11, ink-40). Same container style as ready state.

Container (both states): padding 13 18, borderRadius 12, marginBottom 22, bg `rgba(201,168,106,0.05)`, border `1px solid rgba(201,168,106,0.13)`, display flex, alignItems center, gap 24, flexWrap wrap.

Compute from `activity` (useApp):
- withRealized: activity that have both realized and predicted and kind==='applied'
- successfulCount: withRealized where sign(realized)===sign(predicted)
- n: withRealized.length
- accPct: n===0 ? null : Math.round(successfulCount/n*100)
- avgPp: null (backend owns this; display '—')
- settling: activity.filter(a => a.kind==='applied' && a.pending).length

accColor: accPct===null → `var(--ink-40)`, accPct>=70 → `var(--sage-500)`, accPct>=50 → `var(--aurum-100)`, else → `var(--crimson-500)`

Ready layout:
- Left: Aureon calibration SVG logo (13x13 gradient A) + "Calibration" div (9px uppercase aurum-100 700, marginBottom 1) + "N measured outcomes" (10.5, ink-40)
- Middle: gap 22, flex:
  - "Outcome accuracy": label (9, ink-50, uppercase, fontWeight 600, marginBottom 2) + value span (mono, 22px, fontWeight 500, accColor)
  - "Avg vs predicted": label + "—" span (17px, ink-40)
  - Settling (only if settling>0): label + value (17px, #7AA8D4)
- Spacer: flex 1
- Pills: `active.length active` (aurum), `applied.length applied` (sage), `dismissed.length dismissed` (gray)
  Each pill: display inline-flex, alignItems center, height 20, padding 0 8px, borderRadius 999, bg/border/color per color. fontSize 9.5, fontWeight 600, letterSpacing 0.08em, uppercase.

Calibration SVG logo (inline, from prototype):
```jsx
<svg width="13" height="13" viewBox="0 0 48 48" style={{flexShrink:0}}>
  <defs>
    <linearGradient id="calg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#E7D3A1"/>
      <stop offset="1" stopColor="#B4924F"/>
    </linearGradient>
  </defs>
  <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#calg)"/>
  <circle cx="24" cy="30" r="2.2" fill="var(--canvas)"/>
</svg>
```

Commit: "feat(decisions): add DecisionLineageInline and CalibrationStrip"

---

## Task 5: ExplainPanel.jsx

Location: `frontend/src/components/aureon/decisions/ExplainPanel.jsx`

Props: `rec`, `status`, `signals` (filtered to this rec already), `onClose`, `onApply`, `onDismiss`.

Fixed right-side drawer. Width: `min(440px, 96vw)`. Position: fixed, top 0, right 0, bottom 0, zIndex 201.
Background: `rgba(13,15,19,0.99)`, borderLeft `1px solid rgba(255,255,255,0.08)`, boxShadow `-28px 0 80px rgba(0,0,0,0.55)`, backdropFilter `blur(40px)`.
Backdrop: fixed, inset 0, zIndex 200, bg `rgba(0,0,0,0.42)`, backdropFilter `blur(3px)`. onClick: onClose.
Animation: `drawerIn 260ms var(--ease-decel)`. Display flex, flexDirection column.

Escape key: useEffect → window.addEventListener('keydown', fn where fn calls onClose if e.key==='Escape').

**Head (sticky):** padding 20 22 16, borderBottom `1px solid rgba(255,255,255,0.07)`, position sticky, top 0, bg `rgba(13,15,19,0.99)`, zIndex 1, flexShrink 0.
- Left div:
  - Row: `✦` (aurum-500, fontSize 14, lineHeight 1) + "AI Explanation" (9.5, uppercase, letterSpacing 0.16em, aurum-100, fontWeight 700)
  - h2: fontFamily heading, fontSize 17, fontWeight 600, ink-00, letterSpacing -0.01em, margin 0, lineHeight 1.25. Shows `rec.title`.
  - Row: RecStatusBadge + "Conf {rec.confidence}%" (mono, 11, ink-40) + "·" (ink-60) + age (11, ink-50)
- Close button: 30x30, borderRadius 8, bg `rgba(255,255,255,0.05)`, border `1px solid rgba(255,255,255,0.08)`, X SVG icon (14x14, path "M18 6L6 18M6 6l12 12")

**Body (scrollable):** flex 1, overflowY auto, padding 20 22, display flex, flexDirection column, gap 22.

Section component (inline): `{ label, children }` → `<section>` with label div (9, uppercase, letterSpacing 0.15em, ink-50, fontWeight 700, marginBottom 10) + children.

Sections:
1. Impact one-liner banner: RecPrediction (action + impactOneLine)
2. "Why Aureon recommends this": reasoning grid using ReasoningList from `@/components/aureon/primitives` OR manual grid matching prototype (88px label + 1fr value, each row: display grid, gridTemplateColumns 88px 1fr, gap 12, alignItems start, padding 9 12, borderRadius 8, bg `rgba(255,255,255,0.025)`, border `1px solid rgba(255,255,255,0.05)`. Label: 11px, ink-40, capitalize. Value: 12.5, ink-10, lineHeight 1.55)
3. "Confidence breakdown": ConfidenceIndicator full variant with `rec.confidence` and `rec.factors` (import from `@/components/aureon/primitives`)
4. "Supporting signals": RecSupportingSignals (import from `./RecCard/RecSupportingSignals`)
5. "Impact preview": ImpactPreviewPanel from `@/components/aureon/primitives`
6. "Decision lineage": DecisionLineageInline (import from `./DecisionLineageInline`)

**Footer (sticky):** visible only when status==='active' or status==='conflict'. padding 14 22 20, borderTop `1px solid rgba(255,255,255,0.07)`, display flex, gap 8, flexShrink 0, bg `rgba(13,15,19,0.99)`.
- Apply button: class `du3-cta primary`, flex 1, height 38, justifyContent center, disabled when conflict, opacity 0.4 when disabled. Text: "Apply {rec.action} →"
- Dismiss button: class `du3-cta ghost`, height 38, padding 0 14px. Text: "Dismiss"

Commit: "feat(decisions): add ExplainPanel right-side drawer"

---

## Task 6: Tab components

Create these files under `frontend/src/components/aureon/decisions/tabs/`:

### OutcomesTab.jsx, PerformanceTab.jsx, AccuracyTab.jsx (stubs)

Each exports a default component with props: `{ tabState = 'ready', onRetry }`.

The _DTabEmpty inner component (reuse in all three):
```jsx
const _DTabEmpty = ({ title, body }) => (
  <div style={{padding:'36px 24px',textAlign:'center',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:12,background:'rgba(255,255,255,0.01)'}}>
    <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-10)',marginBottom:6}}>{title}</div>
    <div style={{fontSize:12.5,color:'var(--ink-40)',maxWidth:400,margin:'0 auto',lineHeight:1.6}}>{body}</div>
  </div>
);
```

OutcomesTab: title="Recommendation Outcomes", body="Outcome data will appear here once applied recommendations have had time to settle."

PerformanceTab: title="AI Performance", body="AI performance metrics will appear here after enough recommendations have been evaluated."

AccuracyTab: title="Historical Accuracy", body="Historical accuracy tracking will appear here once sufficient outcome data has accumulated."

All three: if tabState==='loading', show a simple spinner placeholder. If tabState==='error', show ErrorState from ds.jsx with onRetry. If tabState==='ready', show _DTabEmpty.

### ActivityTab.jsx

Extract the existing ActivityTab function from Decisions.jsx verbatim. It already has the correct design. Only change imports so they work from the new location:
- Replace local imports with absolute `@/` paths
- Keep all business logic intact (apiService calls, queryClient, toast, etc.)

Props match the current ActivityTab: `{ onViewLineage }`.

### DecisionHistoryTab.jsx

New component implementing the prototype's RecHistory design.

Props: `{ tabState = 'ready', onRetry }`.
Data: `activity` from `useApp()`. Import: `import { useApp } from '@/components/aureon/store'`.

**HistoryKindDot component:**
Props: `{ kind, reversed }`. 
MAP: `{ applied: {col:'var(--sage-500)', bg:'rgba(111,174,136,0.15)', icon:'✓'}, dismissed: {col:'var(--ink-40)', bg:'rgba(255,255,255,0.06)', icon:'✕'}, contribution: {col:'#7AA8D4', bg:'rgba(122,168,212,0.15)', icon:'+'}, reversal: {col:'var(--dusk-500)', bg:'rgba(212,162,87,0.15)', icon:'↺'} }`
Style: width 26, height 26, borderRadius 999, flexShrink 0, display inline-flex, alignItems center, justifyContent center.
If reversed: use gray color/bg instead.

**OutcomeCell component:**
Props: `{ a }`. Returns null if a.kind !== 'applied'.
- If reversed: "—" in mono 10.5 ink-50
- If pending: "settling" (#7AA8D4, mono 11) + if settleDays: "~Nd" (mono 10, ink-50)
- If realized: realized (mono 12, sage-500, fontWeight 500) + if predicted: "vs [predicted]" (mono 10, ink-50)

**HistorySkeleton:** 6 placeholder rows, pulse animation `hpulse`.

**HistoryError:** crimson tint, retry button. Import ErrorState from ds.jsx.

**HistoryStatsBar:** same design as in prototype (stats row + filter pills).

**RecHistory/DecisionHistoryTab main:**
- Stats: Total, Applied, Dismissed, Contributions, Corrections (only if >0)
- Filters: All, Applied, Dismissed, Contributions
- Timeline grouped by day: `a.ts.split('·')[0].trim()` as day key
- Group card: borderRadius 11, overflow hidden, border `rgba(255,255,255,0.06)`, bg `rgba(255,255,255,0.018)`
- Row: display flex, alignItems center, gap 14, padding 12 16, borderBottom (not on last row)
  - mistake rows: amber left-border 2px `rgba(212,162,87,0.45)`, amber tint bg
  - reversal rows: amber left-border 2px `rgba(212,162,87,0.22)`
  - reversed rows: opacity 0.48
  - HistoryKindDot + info div (flex 1) + right column (outcome + time)
  - Info: action (mono 12, fontWeight 600, ink-10 or ink-40 if reversed, line-through if reversed) + asset (mono 12.5, fontWeight 700, ink-00) + Reversed badge + Mistake badge + detail (11.5, ink-40, ellipsis)
  - Right: OutcomeCell + time (mono 10, ink-60)

Empty state when activity.length===0. Empty state when filtered.length===0 and kind!=='all'.

Commit: "feat(decisions/tabs): add stub tabs, extract ActivityTab, add DecisionHistoryTab"

---

## Task 7: AIBriefings.jsx

Location: `frontend/src/components/aureon/decisions/AIBriefings.jsx`

Props: `{ tabState, onRetry }`.

**IMPORTANT:** Retain real API calls — import `apiService` from `@/api/apiService`, `aiBriefing` from `useAureonData()`, and `toast` from `react-hot-toast`. Do NOT replace with stubs.

State: `briefings` (array), `loading` (boolean, init true), `running` (boolean), `expanded` (null | briefing id).

On mount: `apiService.fetchBriefingHistory(30)` → setBriefings(Array.isArray(data) ? data : []) → setLoading(false) on catch setBriefings([]).

If `tabState === 'loading'`: render 3 skeleton cards (pulse animation `bfpulse`). Each skeleton: 2-row header placeholders + body placeholder.

If `tabState === 'error'`: error block matching prototype style (crimson tint, retry button calling onRetry).

Ready state:

**Header:** display flex, alignItems flex-end, justifyContent space-between, paddingBottom 16, marginBottom 16, borderBottom `1px solid rgba(255,255,255,0.05)`.
- Left: "Briefings" stat (mono 28px, ink-00) + "Last run" with last briefing date (12.5, ink-30)
- Right: "Run briefing now" button: class `du3-cta`, bg `rgba(201,168,106,0.13)`, border `rgba(201,168,106,0.32)`, color `var(--aurum-100)`. Shows ✦ icon + "Run briefing now" when not running, spinner + "Running…" when running. Calls `handleRun`.

handleRun: setRunning(true), call `apiService.runGlobalAI()`, on success `toast.success('AI briefing queued')`, refresh briefings, catch: `toast.error(e.message || 'Failed to run AI briefing')`, finally: setRunning(false).

**Empty state:** dashed border, "No briefings yet" + "Run your first AI briefing..." + run CTA.

**Briefings list:** display flex, flexDirection column, gap 10.

Each briefing card (`layer-1`, borderRadius 12, overflow hidden, border `rgba(255,255,255,0.06)`):
- Determine TONE_MAP from `b.short_term_trend` (use BRIEFING_TREND from constants.js)
- ACTION_COLOR from constants.js: `b.recommended_action?.toUpperCase()`

Card header (padding 15 20):
- Row 1: date (mono 11, ink-40) + trend badge (bg/border/color from TONE_MAP) + action badge (bg/border/color from ACTION_COLOR) + flex spacer + "Conf N%" (mono 11, ink-40)
- Summary paragraph (fontSize 13, ink-10, lineHeight 1.65)
- Expand toggle button (chevron SVG, rotates 180° when expanded, transitions): "Show detail" / "Collapse". No border/bg, cursor pointer, color ink-40, fontSize 11.5. marginTop 10.

Expanded sections (borderTop `1px solid rgba(255,255,255,0.06)`, padding 14 20, display grid, gap 6, animation cardEnter 200ms):
Show if `b.sections` (stub data) OR build from `b.summary` / `b.key_catalyst`. Each section row: display grid, gridTemplateColumns `108px 1fr`, gap 12, padding 9 12, borderRadius 7, bg `rgba(255,255,255,0.02)`, border `1px solid rgba(255,255,255,0.05)`. Label: fontSize 11, ink-40. Value: fontSize 12.5, ink-20, lineHeight 1.55.

For real API data (no `.sections`), show: "Summary" → b.summary, "Key catalyst" → b.key_catalyst (if present).
Note: expanded section only shows fields that have content.

TONE_MAP lookup: map `b.short_term_trend` to BRIEFING_TREND. If not found, use Neutral.
fmtDateTime helper: `new Date(iso).toLocaleString('en-IN', {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata'}) + ' IST'`

Also show `aiBriefing` (from useAureonData) if available: prepend it to the briefings list display as the "current" briefing. The existing `AIBriefingSection` can still be shown if imported, but for Phase 3 we're replacing the BriefingsTab with this new AIBriefings component.

Commit: "feat(decisions): add improved AIBriefings tab with real API calls"

---

## Task 8: RecommendationsFeed.jsx

Location: `frontend/src/components/aureon/decisions/RecommendationsFeed.jsx`

Props: `{ tabState, onRetry, onExplain, onViewLineage, onOpenModal }`.
Data: from `useApp()` — `{ allRecs, active, applied, dismissed, apply, dismiss, undo, applyBatch }`.
Import: DecisionBasket from `@/components/aureon/DecisionBasket`.

**Skeleton (tabState==='loading'):** RecsSkeleton — 3 skeleton cards matching prototype (pulse animation `recPulse`). Each: action badge placeholder + title placeholder + meta placeholder + reasoning placeholder + actions row placeholder.

**Error (tabState==='error'):** RecsError block — crimson tint, 32px error circle SVG, heading, body text, Retry button.

**getStatus helper** (using getRecStatus from utils/recommendation.js).

**Stats + filters bar:**
Display flex, alignItems center, gap 20, paddingBottom 16, marginBottom 16, borderBottom `1px solid rgba(255,255,255,0.05)`.
- Left: Active (28px mono, ink-00), Applied (22px mono, sage-500), Dismissed (22px mono, ink-40). Each with 9.5px uppercase label.
- Right: filterStrength select + filterAction select. Same selStyle as prototype.

**Snoozed section** (retained from existing code, between active and basket):
- State: `snoozed` (array of IDs), `staged` (array of IDs)
- snooze(id): add to snoozed, remove from staged
- resume(id): remove from snoozed

**Active recs section:**
Label: "Awaiting decision" + count. fontSize 10, uppercase, ink-30, fontWeight 700. Gap 8 marginBottom 12.

activeRecs = allRecs.filter by status=active/conflict, not snoozed, passing filters.

Empty state when activeRecs.length===0: dashed border card, heading "No active recommendations", body text, 2 CTAs ("Run AI briefing" + "Review signals →"). The "Run AI briefing" navigates to briefings tab via callback prop `onGoToBriefings` (add this prop).

Active recs list: display grid, gap 10. Each: `<RecCard>` with all action props wired.

**Snoozed section** (if snoozedRecs.length > 0): compact list rows showing snoozed recs with Resume button.

**DecisionBasket:** retain exactly as before. Props: stagedRecs, onCommit, onClear, onUnstage.

**CollapsibleSection component:**
```jsx
const CollapsibleSection = ({ title, count, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{marginTop:20}}>
      <button onClick={() => setOpen(o => !o)} style={{display:'flex',alignItems:'center',gap:8,background:'none',border:'none',cursor:'pointer',padding:'4px 0',marginBottom: open ? 12 : 0,width:'100%'}}>
        <span style={{fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:700}}>{title}</span>
        <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-60)'}}>{count}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-50)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{transform: open ? 'rotate(180deg)' : 'none', transition:'transform 160ms var(--ease-std)'}}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div style={{display:'grid',gap:8}}>{children}</div>}
    </div>
  );
};
```

**Applied section (CollapsibleSection):** "Applied this session", count=appliedRecs.length. RecCard for each with status applied.

**Dismissed section (CollapsibleSection):** "Dismissed", count=dismissedRecs.length. RecCard for each with status dismissed.

**Basket confirm modal:** BasketConfirmModal (port from existing Decisions.jsx). Retain stagingmodal state and commitBasket logic.

Add prop `onGoToBriefings` for the empty state CTA.

Commit: "feat(decisions): add RecommendationsFeed with CollapsibleSection and RecCard integration"

---

## Task 9: decisions/index.js + Decisions.jsx refactor

### decisions/index.js

Barrel exports for all new components:

```js
export { default as RecCard } from './RecCard';
export { RecStatusBadge } from './RecCard';
export { default as ExplainPanel } from './ExplainPanel';
export { default as CalibrationStrip } from './CalibrationStrip';
export { default as DecisionLineageInline } from './DecisionLineageInline';
export { default as RecommendationsFeed } from './RecommendationsFeed';
export { default as AIBriefings } from './AIBriefings';

// Tabs
export { default as ActivityTab } from './tabs/ActivityTab';
export { default as DecisionHistoryTab } from './tabs/DecisionHistoryTab';
export { default as OutcomesTab } from './tabs/OutcomesTab';
export { default as PerformanceTab } from './tabs/PerformanceTab';
export { default as AccuracyTab } from './tabs/AccuracyTab';

// Constants and utils
export * from './constants';
export * from './utils/recommendation';
```

### Decisions.jsx refactor

Replace existing Decisions.jsx (~1152 lines) with a thin orchestration layer (~150-200 lines).

Keep from existing:
- SignalsTab (do NOT extract it — leave inline or extract to tabs/SignalsTab.jsx without changing it)
- DecisionLineageDrawer (keep as-is, at bottom of file or extracted)
- URL tab init logic
- useLocation, useQueryClient imports
- `TAB_INIT_MAP` updated to include new tabs

New tab list (7 tabs):
```js
const DECISION_TABS = [
  { id: 'recommendations', label: 'Recommendations', getBadge: (s) => s.active.length },
  { id: 'signals',         label: 'Signals',          getBadge: (s) => s.signals?.length ?? 0 },
  { id: 'briefings',       label: 'Briefings',        getBadge: null },
  { id: 'outcomes',        label: 'Outcomes',          getBadge: null },
  { id: 'ai-performance',  label: 'AI Performance',   getBadge: null },
  { id: 'accuracy',        label: 'Historical Accuracy', getBadge: null },
  { id: 'history',         label: 'History',           getBadge: null },
];
```

TAB_INIT_MAP:
```js
const TAB_INIT_MAP = {
  recommendations: 'recommendations',
  signals: 'signals',
  briefings: 'briefings',
  outcomes: 'outcomes',
  'ai-performance': 'ai-performance',
  accuracy: 'accuracy',
  history: 'history',
  activity: 'history', // legacy alias
};
```

State: tab, explainRec, explainOpen, lineageExtId, lineageOpen, tabStates (object, all 'ready' initially).

explainRec: the recommendation object to explain. explainOpen: boolean.

Render structure:
```jsx
return (
  <>
    {tab === 'recommendations' && <CalibrationStrip />}

    {/* Tab bar */}
    <div role="tablist" style={{ display:'flex', alignItems:'flex-end', gap:22, borderBottom:'1px solid rgba(255,255,255,0.07)', marginBottom:22, flexWrap:'wrap' }}>
      {DECISION_TABS.map(t => {
        const on = tab === t.id;
        const badge = t.getBadge?.({ active, signals });
        return (
          <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'0 2px 13px',
              background:'transparent', border:'none', borderBottom:'2px solid '+(on?'var(--aurum-100)':'transparent'),
              color: on?'var(--ink-00)':'var(--ink-40)', fontFamily:'var(--font-ui)', fontSize:13.5,
              fontWeight: on?600:500, cursor:'pointer', marginBottom:-1 }}>
            <span>{t.label}</span>
            {badge != null && (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'2px 6px', borderRadius:999,
                background: on?'rgba(201,168,106,0.18)':'rgba(255,255,255,0.05)',
                color: on?'var(--aurum-100)':'var(--ink-40)' }}>{badge}</span>
            )}
          </button>
        );
      })}
    </div>

    {/* Tab content */}
    {tab === 'recommendations' && (
      error ? <RecsError onRetry={...} /> :
      loading ? <RecsSkeleton /> :
      <RecommendationsFeed
        tabState={tabStates.recommendations}
        onRetry={...}
        onExplain={(rec) => { setExplainRec(rec); setExplainOpen(true); }}
        onViewLineage={handleViewLineage}
        onOpenModal={(rec, cb) => { /* existing modal logic */ }}
        onGoToBriefings={() => setTab('briefings')}
      />
    )}
    {tab === 'signals' && <SignalsTab />}
    {tab === 'briefings' && <AIBriefings tabState={tabStates.briefings} onRetry={...} />}
    {tab === 'outcomes' && <OutcomesTab tabState={tabStates.outcomes} onRetry={...} />}
    {tab === 'ai-performance' && <PerformanceTab tabState={tabStates['ai-performance']} onRetry={...} />}
    {tab === 'accuracy' && <AccuracyTab tabState={tabStates.accuracy} onRetry={...} />}
    {tab === 'history' && <DecisionHistoryTab tabState={tabStates.history} onRetry={...} />}

    {explainOpen && explainRec && (
      <ExplainPanel
        rec={explainRec}
        status={getRecStatus(explainRec, active, applied, dismissed)}
        signals={signals.filter(s => s.linkedRec === explainRec.id)}
        onClose={() => { setExplainOpen(false); setExplainRec(null); }}
        onApply={apply}
        onDismiss={dismiss}
      />
    )}

    <DecisionLineageDrawer extId={lineageExtId} open={lineageOpen} onClose={() => setLineageOpen(false)} />
  </>
);
```

Note: Keep existing `DecisionLineageDrawer` and `BasketConfirmModal` in this file or extract to decisions/. Keep SignalsTab inline or extracted (no design change). The `ActionConfirmationModal` is triggered from RecommendationsFeed when needsModal returns true.

Commit: "feat(decisions): add barrel exports and refactor Decisions.jsx to thin orchestrator"

---

## Task 10: Final visual parity check + lint

1. Run `cd /home/dev-var/Personal/Projects/aureon/frontend && npm run lint` — fix any ESLint errors (warnings are acceptable if pre-existing).
2. Verify the following in the Decisions page source:
   - 7 tabs render in correct order
   - CalibrationStrip appears above recommendations tab content
   - RecCard has RecStatusBadge, action badge, confidence, age
   - ExplainPanel opens as right drawer
   - DecisionLineageInline uses horizontal 3-node layout
   - AIBriefings has expand/collapse per card
   - DecisionHistoryTab has timeline grouped by day with dots
   - Stub tabs render empty-state layout
   - ActivityTab still exists in tabs/ folder
3. Verify no import errors in console (check for missing exports).
4. Commit any lint fixes: "chore(decisions): fix lint errors post-Phase3 implementation"

