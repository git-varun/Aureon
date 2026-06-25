# Decisions Page — Phase 3 Context

**Branch:** `feature`  
**Completed:** 2026-06-26  
**Spec:** `docs/superpowers/specs/2026-06-25-decisions-phase3-design.md`

---

## What Phase 3 Did

Rebuilt the Decisions page from a monolithic 1152-line `Decisions.jsx` into a modular component system matching the frozen Claude Design prototype. **No backend changes. No API wiring changes. No business logic changes.**

---

## File Map

```
frontend/src/components/aureon/decisions/
├── constants.js                        REC_STATUS, CONFIDENCE_LEVEL, BRIEFING_TREND, ACTION_COLOR, UNDO_WINDOW_SEC
├── utils/
│   └── recommendation.js              getRecStatus, getConfidenceLevel, fmtImpactOneLine, needsModal re-export
├── hooks/
│   └── useRecommendationActions.js    handleApply/Dismiss/Undo — built but not yet wired into RecCard
├── RecCard/
│   ├── index.jsx                      re-exports RecCard (default) + RecStatusBadge (named)
│   ├── RecCard.jsx                    article.du3, 20s countdown timer, React.memo
│   ├── RecHeader.jsx                  action badge + title + RecStatusBadge + impact + confidence + age
│   ├── RecBody.jsx                    reasoning entries (up to 2) + conflict strip
│   ├── RecActions.jsx                 Apply/Dismiss/Explain primary; Stage/Snooze secondary
│   ├── RecStatusBadge.jsx             React.memo, STATUS_CONFIG with exact prototype colors
│   ├── RecMetadata.jsx                horizon badge
│   ├── RecCountdown.jsx               "Undo in Xs" / "Logged" with countdown/undo CSS classes
│   ├── RecPrediction.jsx              aurum tint banner with action + impactOneLine
│   ├── RecOutcomeFeedback.jsx         ofc CSS class, outcome after apply/dismiss
│   └── RecSupportingSignals.jsx       React.memo, severity badges
├── DecisionLineageInline.jsx          React.memo, horizontal 3-node Signal→Rec→Outcome
├── CalibrationStrip.jsx               React.memo, outcome accuracy stats, 340ms shimmer
├── ExplainPanel.jsx                   Fixed right drawer (min 440px), 6 sections, Escape key
├── AIBriefings.jsx                    Real API (fetchBriefingHistory/runGlobalAI), expand/collapse per card
├── RecommendationsFeed.jsx            Full feed: CalibrationStrip + stats bar + filters + active recs +
│                                        snoozed + DecisionBasket + collapsible applied/dismissed
├── DecisionLineageDrawer.jsx          Verbatim extract from old Decisions.jsx
├── index.js                           Barrel: all components + tabs + constants + utils
└── tabs/
    ├── ActivityTab.jsx                Verbatim extract (full undo/delete/LogTradeModal logic)
    ├── DecisionHistoryTab.jsx         New: timeline with HistoryKindDot, day-grouped, OutcomeCell
    ├── OutcomesTab.jsx                Stub empty state
    ├── PerformanceTab.jsx             Stub empty state
    └── AccuracyTab.jsx                Stub empty state

frontend/src/pages/aureon/
└── Decisions.jsx                      175-line thin orchestrator (was 1152 lines)
```

---

## Decisions.jsx Orchestrator

7 tabs: `recommendations | signals | briefings | outcomes | ai-performance | accuracy | history`

Legacy alias: `activity` → `history` (in TAB_INIT_MAP)

State: `tab`, `explainRec`, `explainOpen`, `lineageExtId`, `lineageOpen`, `modalRec`, `tabStates`

Key wiring:
- `RecommendationsFeed`: gets `onExplain`, `onViewLineage`, `onOpenModal`, `onGoToBriefings`, `onGoToSignals`
- `ExplainPanel`: opens on `explainRec`, closes after apply
- `ActionConfirmationModal`: triggered via `onOpenModal` → `modalRec` → `apply(modalRec.id)` on confirm
- `DecisionLineageDrawer`: wired to `lineageExtId` / `lineageOpen`
- `SignalsTab`: inline (no design changes)

---

## Data Sources

| Hook | Used for |
|---|---|
| `useApp()` | `allRecs`, `active`, `applied`, `dismissed`, `apply`, `dismiss`, `undo`, `applyBatch`, `activity` |
| `useAureonData()` | `signals`, `loading`, `error`, `aiBriefing` |
| `apiService.fetchBriefingHistory(30)` | AIBriefings tab (real API call on mount) |
| `apiService.runGlobalAI()` | "Run briefing now" button in AIBriefings |

---

## Design Tokens Used

`--aurum-100`, `--sage-500`, `--crimson-500`, `--ink-00`…`--ink-60`, `--font-mono`, `--font-heading`, `--font-ui`, `--ease-std`, `--ease-decel`, `--canvas`

CSS classes: `du3`, `ofc`, `du3-cta`, `du3-cta primary`, `du3-cta ghost`, `du3-title`, `du3-impact`, `countdown`, `undo`, `layer-1`, `cm-scrim`, `cm-panel`, `cm-head`, `cm-body`, `cm-foot`

All new keyframe animations namespaced `aureon-*` and injected via `<style>` tags.

---

## Known Deferred Issues

| Issue | File | Severity | Notes |
|---|---|---|---|
| ActivityTab `kind === 'trade'` branch | `tabs/ActivityTab.jsx` | Minor | Dead code — store never emits `kind: 'trade'`. Verbatim extract from old file. |
| Duplicate `RecsSkeleton` | `RecommendationsFeed.jsx` + `Decisions.jsx` | Minor | RecommendationsFeed's skeleton is unreachable via `tabState='loading'` path |
| CalibrationStrip shimmer | `CalibrationStrip.jsx` | Minor | `setTimeout(340 + random*180)` is intentional UX shimmer, not a real fetch guard |
| `useRecommendationActions` unused | `hooks/useRecommendationActions.js` | Minor | Hook built but RecCard wires callbacks directly; available for future refactor |
| AIBriefings `<style>` injected per branch | `AIBriefings.jsx` | Minor | Loading/error/ready each inject keyframes; harmless but slightly wasteful |

---

## Prototype Reference

`Aureon_Prototype/app/page-decisions.jsx` — 7-tab structure  
`Aureon_Prototype/app/page-decisions-recs.jsx` — RecCard with ExplainPanel  
`Aureon_Prototype/app/page-decisions-history.jsx` — RecHistory / DecisionHistoryTab  
`Aureon_Prototype/app/decision-lineage.jsx` — DecisionLineageInline  
`Aureon_Prototype/lib/decisions.jsx` — CalibrationPanel, AIBriefings  
