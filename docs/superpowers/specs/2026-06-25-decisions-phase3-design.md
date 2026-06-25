# Decisions Page — Phase 3 Design Spec
**Date:** 2026-06-25  
**Status:** Approved  
**Scope:** UI parity with frozen Claude Design prototype — no backend changes, no API wiring changes, no business logic changes

---

## Objective

Bring the Decisions page to 100% visual and interaction parity with the frozen prototype. Preserve all existing backend-supported capabilities (Stage, Snooze, Basket). No stub replacement, no business logic changes.

---

## Constraints

- No backend work
- No React Query changes
- No API wiring changes
- No endpoint changes
- No state-management changes
- No business logic changes
- No stub replacement
- Reuse existing shared primitives (`ConfidenceIndicator`, `ImpactPreviewPanel`, `EvaluatePanel` where applicable)
- Presentation logic must not live in `Decisions.jsx`

---

## Component Architecture

### New folder
```
frontend/src/components/aureon/decisions/
├── RecCard/
│   ├── index.jsx               # Assembles sub-components, manages local countdown timer
│   ├── RecCard.jsx             # Article wrapper, delegates to sub-components
│   ├── RecHeader.jsx           # Action badge + title + RecStatusBadge + confidence + age
│   ├── RecBody.jsx             # Reasoning preview (2 entries) + conflict strip
│   ├── RecActions.jsx          # Primary: Apply/Dismiss/Explain · Secondary: Stage/Snooze
│   ├── RecStatusBadge.jsx      # Pill badge: Active/Conflict/Applied/Settling/Dismissed
│   ├── RecPrediction.jsx       # Predicted impact (used inside ExplainPanel)
│   ├── RecOutcomeFeedback.jsx  # Applied outcome card (check + realized/predicted)
│   ├── RecSupportingSignals.jsx# Signals linked to rec (used inside ExplainPanel)
│   ├── RecCountdown.jsx        # Countdown timer + Undo button
│   └── RecMetadata.jsx         # Horizon badge (Short/Long)
├── ExplainPanel.jsx            # Right-side explanation drawer
├── CalibrationStrip.jsx        # Compact horizontal calibration bar
├── DecisionLineageInline.jsx   # Horizontal 3-node inline lineage (Signal → Rec → Outcome)
├── RecommendationsFeed.jsx     # Stats bar + filters + active/applied/dismissed feed
├── AIBriefings.jsx             # Expandable briefings list
├── ActivityTab.jsx             # Moved from Decisions.jsx — user action ledger (unchanged design)
├── DecisionHistoryTab.jsx      # NEW — prototype RecHistory design (rec lifecycle timeline)
├── RecOutcomesTab.jsx          # Stub empty state
├── AIPerformanceTab.jsx        # Stub empty state
├── HistoricalAccuracyTab.jsx   # Stub empty state
├── constants.js                # Enums: RecommendationStatus, ConfidenceLevel, BriefingTrend
└── index.js                    # Barrel exports
```

### Decisions.jsx (thin orchestrator, ~150–200 lines)
Responsibilities:
- 7-tab configuration and tab state
- Data: `useApp()` hooks, `useAureonData()` hooks
- Selected rec state for ExplainPanel
- DecisionLineageDrawer open/close (existing, unchanged)
- Props passed down to child components
- No presentation logic

---

## Tab Structure

| # | ID | Label | Component | Badge |
|---|-----|-------|-----------|-------|
| 1 | `recommendations` | Recommendations | RecommendationsFeed | active.length |
| 2 | `signals` | Signals | SignalsTab (existing, unchanged) | signals.length |
| 3 | `briefings` | Briefings | AIBriefings | — |
| 4 | `outcomes` | Outcomes | RecOutcomesTab | — |
| 5 | `ai-performance` | AI Performance | AIPerformanceTab | — |
| 6 | `accuracy` | Historical Accuracy | HistoricalAccuracyTab | — |
| 7 | `history` | History | DecisionHistoryTab | — |

Tab bar styling: prototype pattern — underline indicator (`var(--aurum-100)`), font-size 13.5, active weight 600, badges in mono pill.

**Note:** The existing `ActivityTab` is preserved as-is (moved to `ActivityTab.jsx`) but is no longer shown in the 7-tab bar. `DecisionHistoryTab` is a new tab in that slot with the prototype's timeline design. Both exist in the codebase for future use.

---

## RecCard Architecture

### RecHeader
```
[ACTION badge] [Title] [RecStatusBadge]        [ConfidenceIndicator compact] [age]
```
- Action badge: `rgba(255,255,255,0.05)` bg, mono font, 10.5px, 700 weight, uppercase
- Title: heading font, 14.5px, weight 600
- RecStatusBadge: see below
- ConfidenceIndicator: reuse from `primitives.jsx` (compact variant)
- Age: `rec.createdAt`, mono 10px, `var(--ink-50)`

### RecStatusBadge
Pill (height 18, padding 0 7px, border-radius 999):

| Status | Dot color | Background | Border | Text color | Label |
|--------|-----------|-----------|--------|------------|-------|
| active | `var(--aurum-500)` | `rgba(201,168,106,0.10)` | `rgba(201,168,106,0.22)` | `var(--aurum-100)` | Active |
| conflict | `var(--dusk-500)` | `rgba(212,162,87,0.10)` | `rgba(212,162,87,0.22)` | `var(--dusk-500)` | Conflict |
| applied | `var(--sage-500)` | `rgba(111,174,136,0.10)` | `rgba(111,174,136,0.22)` | `var(--sage-500)` | Applied |
| settling | `#7AA8D4` | `rgba(122,168,212,0.10)` | `rgba(122,168,212,0.22)` | `#7AA8D4` | Settling |
| dismissed | `var(--ink-50)` | `rgba(255,255,255,0.03)` | `rgba(255,255,255,0.07)` | `var(--ink-40)` | Dismissed |

### RecBody (active/conflict only)
- Reasoning preview: 2-col grid, first 2 entries. Label: `var(--ink-50)`, 11px, capitalize. Value: `var(--ink-20)`, 11.5px.
- Container: `rgba(255,255,255,0.02)` bg, `rgba(255,255,255,0.05)` border, radius 7, padding 8 10
- Conflict strip: amber tint bg (`rgba(212,162,87,0.08)`), border `rgba(212,162,87,0.22)`, warning icon, "Conflicts with [title] — resolve before applying."

### RecActions
**Primary actions (left):**
- Apply button (`du3-cta primary`, height 28, font 12) — visible when status=active
- Dismiss button (`du3-cta ghost`) — visible when status=active or conflict
- Restore button (`du3-cta ghost`, "↩ Restore") — visible when status=dismissed
- Explain button (`du3-cta ghost`, inline-flex, gap 5, `var(--aurum-100)` color, ✦ icon) — always visible for active/conflict/applied

**Secondary actions (right of primary, subtle):**
- Stage button (ghost, height 28, highlighted when staged with aurum color)
- Snooze button (ghost, height 28)

**Far right:**
- RecMetadata: horizon tag — mono, 10px, `var(--ink-50)`, uppercase, letter-spacing

### RecOutcomeFeedback (applied state, replaces body)
```
[✓ check circle]  Applied · predicted [X]  [CountdownOrLogged]  [Undo button]
```
- Class: `ofc` (reuse existing CSS class)
- Check: `var(--sage-500)` circle
- Realized (if available): `var(--sage-500)`
- Settling days: if applicable
- CountdownOrLogged: "Undo in Xs" → "Logged" after window closes

### Inline Lineage Toggle
- "Lineage" button in action strip → toggles `DecisionLineageInline` below the card
- Aurum color when open

### RecCard states
- `idle` (active/conflict): header + body + actions
- `applied`/`settling`: header + RecOutcomeFeedback + actions (Apply hidden)
- `dismissed`: header at 0.5 opacity + restore action

---

## DecisionLineageInline

Horizontal 3-node layout from prototype's `decision-lineage.jsx`:

```
[Signal(s) node]  →→  [Recommendation node]  →→  [Outcome node]
```

- Container: `rgba(255,255,255,0.015)` bg, `rgba(255,255,255,0.06)` border, radius 12, padding 12 14
- Nodes: flex, `flex: 1 1 160px`, radius 9, `rgba(255,255,255,0.025)` bg
- Arrows: SVG `→` 22×12
- Signal node: lists linked signals (by `linkedRec === rec.id`), or "Model-initiated" if none
- Recommendation node: accent `rgba(201,168,106,0.30)`, action + ref title, impact one-liner, confidence
- Outcome node: if activity match found → applied (sage) or dismissed (gray); else "Awaiting your decision"
- Data: signals from `useAureonData()`, activity from `useApp()` — no new API calls

---

## ExplainPanel

Right-side drawer (fixed, top/right/bottom 0, width min(440px,96vw)):

**Head (sticky):**
- `✦` icon + "AI Explanation" eyebrow (aurum)
- Rec title (heading font, 17px)
- RecStatusBadge + confidence + age
- Close button (X, 30×30, radius 8)

**Body (scrollable, gap 22px sections):**
1. Impact one-liner banner: aurum tint bg, action badge + impact text
2. "Why Aureon recommends this": reasoning grid (88px label + value)
3. "Confidence breakdown": `ConfidenceIndicator` full variant with factors
4. "Supporting signals": `RecSupportingSignals` (signals by linkedRec, or "Model-initiated")
5. "Impact preview": `ImpactPreviewPanel` from `primitives.jsx`
6. "Decision lineage": `DecisionLineageInline`

**Footer (sticky, visible only when status=active/conflict):**
- Apply button (primary, flex 1, height 38) — disabled when conflict
- Dismiss button (ghost, height 38)

**Interaction:**
- Escape key closes
- Backdrop click closes
- Uses `apply`/`dismiss` from `useApp()` — no new hooks

---

## CalibrationStrip

Replaces the existing 4-card grid above the recommendations tab.

**Layout:** Horizontal bar (padding 13 18, radius 12, `rgba(201,168,106,0.05)` bg, `rgba(201,168,106,0.13)` border)

**Left:** Aureon logo SVG (gradient A) + "Calibration" label (9px, aurum, uppercase) + "N measured outcomes" subtitle

**Middle (flex, gap 22):**
- Outcome accuracy: label (9px, `var(--ink-50)`) + value (22px mono, color by threshold: sage ≥70%, aurum ≥50%, crimson <50%)
- Avg vs predicted: label + value (17px mono, sage/crimson by sign)
- Settling: label + value (#7AA8D4) — only shown if settling > 0

**Right (pills):**
- `N active` (aurum)
- `N applied` (sage)
- `N dismissed` (gray)

**Loading state:** Spinner + "Fetching from backend…" (shown during initial mount per prototype's 340ms setTimeout mock)

**Data:** Calculated from `activity` array in `useApp()` — same math as existing CalibrationAccuracy card, no new API

---

## RecommendationsFeed

Wraps the recommendations content for the Recommendations tab.

**Stats + filters bar:**
- Left: Active (28px mono), Applied (22px mono, sage), Dismissed (22px mono, gray)
- Right: Strength filter (select), Action filter (select)
- No "Stage all ≥ 70%" button — moved to secondary actions on individual cards

**Active recs section:**
- Eyebrow: "Awaiting decision" + count
- Empty state: heading + body + "Run AI briefing" (aurum) + "Review signals →" (ghost) buttons
- Cards: `RecCard` list (gap 10)

**Applied section (CollapsibleSection):**
- Title: "Applied this session", count
- Toggle open/close with chevron
- Shows applied `RecCard` instances

**Dismissed section (CollapsibleSection):**
- Title: "Dismissed", count
- Toggle open/close with chevron
- Shows dismissed `RecCard` instances

**DecisionBasket:** retained below feed (existing component, unchanged)

**Note:** Snoozed recs section is retained between active and basket (existing behavior, unchanged)

---

## AIBriefings

Upgrades existing Briefings tab. Retains real API calls.

**Header:** Briefings count + last-run date + "Run briefing now" button (aurum, ✦ icon, loading spinner)

**Card list (expandable):**
Each card (`layer-1`, radius 12, border `rgba(255,255,255,0.06)`):
- Header row: date (mono 11, `var(--ink-40)`) + trend badge + action badge + "Conf N%" (right)
- Summary paragraph (13px, `var(--ink-10)`, line-height 1.65)
- "Show detail" toggle (chevron, rotates)
- Expanded sections: Macro context / Portfolio / Recommendations — 2-col grid (108px label + value)

**Loading state:** 3 skeleton cards (pulse animation)
**Error state:** crimson tint, retry button
**Empty state:** dashed border, "Run now" CTA

**Data:** Existing `apiService.fetchBriefingHistory()` + `apiService.runGlobalAI()` — no changes

---

## DecisionHistoryTab

New tab matching prototype's `RecHistory` design.

**Stats bar:** Total (28px), Applied (22px, sage), Dismissed (22px, gray), Contributions (22px, #7AA8D4), Corrections (22px, dusk, only if >0)

**Filter pills:** All / Applied / Dismissed / Contributions

**Timeline (grouped by day):**
- Day label: 10px, uppercase, `var(--ink-40)`, letter-spacing
- Group card: `rgba(255,255,255,0.018)` bg, `rgba(255,255,255,0.06)` border, radius 11
- Row: HistoryKindDot (26px circle) + action/asset/detail + time + OutcomeCell (realized vs predicted)
- Reversed rows: 0.48 opacity, strikethrough text
- Mistake rows: amber left-border, dusk tint bg

**States:**
- Loading: HistorySkeleton (6 rows)
- Error: HistoryError + retry
- Empty (filtered): empty state + "Switch the filter" message
- Empty (no history): empty state

**Data:** `activity` from `useApp()` — same source as existing ActivityTab, no new hooks

---

## Stub Tabs

Three tabs with identical structure (prototype's `_DTabEmpty`):

```jsx
// RecOutcomesTab
title="Recommendation Outcomes"
body="Outcome data will appear here once applied recommendations have had time to settle."

// AIPerformanceTab  
title="AI Performance"
body="AI performance metrics will appear here after enough recommendations have been evaluated."

// HistoricalAccuracyTab
title="Historical Accuracy"
body="Historical accuracy tracking will appear here once sufficient outcome data has accumulated."
```

Container: `padding: 36px 24px`, `text-align: center`, `border: 1px dashed rgba(255,255,255,0.08)`, `border-radius: 12`, `background: rgba(255,255,255,0.01)`

---

## Decisions.jsx (final shape)

```jsx
// ~150-200 lines
// Imports: 7 tab components, DecisionLineageDrawer (unchanged)
// State: tab, explainRec, lineageOpen, lineageExtId
// Data: useApp(), useAureonData()
// Render:
//   <CalibrationStrip/> (above tab bar, shown only on recommendations tab)
//   <TabBar/> (7 tabs)
//   {tab === 'recommendations' && <RecommendationsFeed/>}
//   {tab === 'signals' && <SignalsTab/>}       // unchanged
//   {tab === 'briefings' && <AIBriefings/>}
//   {tab === 'outcomes' && <RecOutcomesTab/>}
//   {tab === 'ai-performance' && <AIPerformanceTab/>}
//   {tab === 'accuracy' && <HistoricalAccuracyTab/>}
//   {tab === 'history' && <DecisionHistoryTab/>}
//   <DecisionLineageDrawer/>                   // unchanged
//   <ExplainPanel/>                            // conditional on explainRec
```

---

## Lifecycle States

Every backend-driven panel supports:

| Panel | Loading | Empty | Error | Retry |
|-------|---------|-------|-------|-------|
| RecommendationsFeed | Skeleton (3 cards) | Empty state + CTAs | RecsError block | Retry button |
| AIBriefings | 3 skeleton cards | Empty state + run CTA | Error block | Retry button |
| DecisionHistoryTab | HistorySkeleton | Empty state | HistoryError block | Retry button |
| CalibrationStrip | Spinner strip | — (n=0 shown) | — | — |

---

## Shared Primitives Reused

| Primitive | Source | Used in |
|-----------|--------|---------|
| `ConfidenceIndicator` | `primitives.jsx` | RecHeader (compact), ExplainPanel (full) |
| `ImpactPreviewPanel` | `primitives.jsx` | ExplainPanel |
| `ReasoningList` | `primitives.jsx` | ExplainPanel (reasoning section) |
| `ActionConfirmationModal` | `flow.jsx` | RecCard Apply (high-impact recs via `needsModal`) |
| `Tabs` | `ds.jsx` | Decisions.jsx tab bar |
| `Drawer` | `ds.jsx` | DecisionLineageDrawer (unchanged) |
| `ErrorState` | `ds.jsx` | RecsError, AIBriefings error |
| `useApp` | `store.jsx` | RecCard, CalibrationStrip, RecommendationsFeed, DecisionHistoryTab |
| `useAureonData` | `hooks/useAureonData` | Decisions.jsx, SignalsTab, DecisionLineageInline |

---

## constants.js

```js
export const REC_STATUS = {
  ACTIVE: 'active',
  CONFLICT: 'conflict',
  APPLIED: 'applied',
  SETTLING: 'settling',
  DISMISSED: 'dismissed',
};

export const CONFIDENCE_LEVEL = {
  HIGH: 'high',    // >= 80
  MED:  'med',     // >= 50
  LOW:  'low',     // < 50
};

export const BRIEFING_TREND = {
  Bullish:  { label: 'Constructive', color: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.10)', border: 'rgba(111,174,136,0.28)' },
  Neutral:  { label: 'Neutral',      color: 'var(--aurum-100)',   bg: 'rgba(201,168,106,0.10)', border: 'rgba(201,168,106,0.28)' },
  Bearish:  { label: 'Cautious',     color: 'var(--crimson-500)', bg: 'rgba(201,82,82,0.10)',   border: 'rgba(201,82,82,0.28)' },
  Sideways: { label: 'Sideways',     color: 'var(--ink-30)',      bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)' },
  Volatile: { label: 'Volatile',     color: 'var(--crimson-400)', bg: 'rgba(201,82,82,0.06)',   border: 'rgba(201,82,82,0.20)' },
};

export const ACTION_COLOR = {
  BUY:  'var(--sage-500)',
  SELL: 'var(--crimson-500)',
  HOLD: 'var(--aurum-100)',
};
```

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/pages/aureon/Decisions.jsx` | Slim to ~150-200 lines, import new components |
| (all new) | `frontend/src/components/aureon/decisions/**` |

## Files NOT Modified
- `frontend/src/components/aureon/flow.jsx` (DecisionUnit, EvaluatePanel retained)
- `frontend/src/components/aureon/primitives.jsx`
- `frontend/src/components/aureon/store.jsx`
- `frontend/src/components/aureon/ds.jsx`
- `frontend/src/api/apiService.js`
- `frontend/src/hooks/useAureonData.js`
- All backend files
