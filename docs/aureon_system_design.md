# Aureon Design System

**Aureon** is a desktop-first financial operating system — a "Financial Command Center" that unifies an individual's entire financial ecosystem (stocks, crypto, mutual funds, bonds, real estate, insurance, retirement) into a single AI-driven interface.

Aureon is **not a trading platform or broker.** It is a financial intelligence layer that answers one question on every screen: *"What should I do next with my capital?"*

## Sources

No codebase, Figma, or brand assets were provided. This system is synthesized from the product brief alone. Treat this as **v0** — every token is a candidate for refinement once real artifacts arrive.

## Product Context

| | |
|---|---|
| **Product** | Aureon |
| **Category** | Personal financial intelligence / wealth command center |
| **Platform** | Desktop-first, widescreen (1440–1920+ primary) |
| **Audience** | Intermediate investors with multi-asset portfolios. Comfortable with concepts; not professional traders. |
| **Core promise** | Replace the cognitive load of multi-portfolio management with a single AI-curated decision layer. |
| **Tone** | Calm, intelligent, precise. Trustworthy. Not flashy, not gamified. |

---

## 1. Asset Classification System

Not all assets behave the same. The system treats them in three tiers, and AI behavior follows suit.

| Tier | Assets | Tracked | AI recommends | Signals shown | Rebalance eligible |
|---|---|---|---|---|---|
| **Active** | Stocks, crypto, ETFs, derivatives | ✓ | ✓ | ✓ | ✓ |
| **Semi-active** | Mutual funds, bonds, bond ladders | ✓ | ✓ (low-frequency) | Summary only | ✓ |
| **Passive / static** | EPF, PPF, insurance, real estate, retirement vesting | ✓ | ✗ | ✗ | ✗ |

**UI implications**

- Active → full detail page with chart, signals, fundamentals, AI panel.
- Semi-active → detail page with fundamentals and AI panel, no real-time signals.
- Passive → read-only tracker card. Contributes to allocation math and net worth but never appears in the Recommendations feed. Flagged with the `illiq` chip in the sidebar and allocation panel.

**Allocation math**: all three tiers count toward net worth and target allocation. Drift bars for passive tiers are informational — the "Apply" action is disabled.

---

## 2. Navigation Architecture

Primary nav is a fixed left sidebar with six top-level destinations. Secondary nav appears in the workspace header of the active destination.

| # | Destination | Purpose | Default sub-view |
|---|---|---|---|
| 1 | **Dashboard** | Command center. Today's state + top 3 recommendations | — |
| 2 | **Portfolio** | All holdings, flattened. Filter, sort, search | By value, desc |
| 3 | **Assets** | Grouped by class (Stocks / Crypto / Funds / Bonds / Real estate / Retirement / Insurance) | Last-visited class |
| 4 | **Signals** | Raw detections (short-term, per-asset) | Today |
| 5 | **Recommendations** | AI decision feed, historical + active | Active |
| 6 | **Activity** | Ledger of applied decisions, rebalances, contributions | Last 30 days |

**Traversal rules**

- **Portfolio-level → Asset-level**: clicking any ticker row (Dashboard, Portfolio, Holdings table) deep-links to `Assets / {class} / {ticker}` — the asset detail page. Browser back returns to originating view with scroll restored.
- **Recommendation → Asset**: the "Review" button on a rec card opens the rec detail modal; "Open asset" jumps to the asset detail page with the rec pinned at the top.
- **Signal → Recommendation**: signals never link to themselves directly. They link to the rec that incorporates them, or (if no rec exists) to the asset detail page.
- **Sidebar "Assets" group** expands in place — clicking a class label is equivalent to `Assets / {class}`.

---

## 3. AI vs. Signals — Priority and Hierarchy

**Signals are inputs. Recommendations are outputs.** They are never peers.

```
  DATA LAYER              DECISION LAYER             UI LAYER
  ┌──────────┐            ┌──────────────┐           ┌────────────────┐
  │ Signals  │──┐         │              │           │ Recommendations│
  │ Fundament│──┼────────▶│ AI reasoning │──────────▶│ (dashboard,    │
  │ Sentiment│──┤         │  engine      │           │  feed, modal)  │
  │ Alloc.   │──┘         │              │           └────────────────┘
  └──────────┘            └──────────────┘
                                 │
                                 ▼
                         ┌──────────────┐
                         │ Signals view │  ← visible, but framed as
                         │ (raw)        │    "inputs to decisions"
                         └──────────────┘
```

**Rules**

1. The Dashboard never shows a raw signal at the same hierarchy as a recommendation. If a signal hasn't yet been incorporated into a rec, it lives only in the Signals destination.
2. When a signal *conflicts* with the AI's conclusion (e.g. momentum says buy, but fundamentals + allocation say trim), the rec card is marked `Conflict` (dusk amber) and the conflicting signal is explicitly cited in reasoning.
3. The Signals destination carries a persistent header note: *"Signals are inputs. See Recommendations for decisions."*
4. No screen may display a buy/sell signal without either (a) its linked recommendation or (b) an explicit "no action" rec with reasoning.

---

## 4. AI Recommendation Schema

Every AI output — on any surface — conforms to this schema. No free-form recs.

```jsonc
{
  "id": "rec_2024_04_22_nvda_trim",
  "createdAt": "2024-04-22T14:22:00Z",
  "strength": "recommended" | "consider" | "conflict" | "hold",
  "action":   "Reduce" | "Add" | "Hold" | "Rebalance" | "Harvest" | "Ladder",
  "scope": {
    "kind":   "asset" | "class" | "portfolio",
    "ref":    "NVDA" | "stocks" | "portfolio"
  },
  "change": {
    "amount":  3200,
    "percent": -0.075,
    "target":  { "weight": 0.28 }
  },
  "reasoning": {
    "allocation":  "Tech 34% vs. target 28%",
    "momentum":    "60-day momentum turning negative",
    "sentiment":   "Diverging from fundamentals",
    "fundamentals":"PEG 0.9, within range"
  },
  "confidence": 82,
  "impact": {
    "risk":       { "delta": -0.08, "unit": "beta" },
    "return":     { "delta": "+0.3pp", "horizon": "12m" },
    "allocation": { "before": 0.34, "after": 0.285 }
  },
  "tags": ["Rebalance","Long-term"],
  "supersedes": ["rec_2024_04_15_nvda_trim"]
}
```

**Strength ↔ visual language**

| Strength | Color | Use |
|---|---|---|
| `recommended` | Aurum gold | AI has high confidence; action advised |
| `consider` | Neutral | Lower confidence or optional refinement |
| `conflict` | Dusk amber | Signals contradict; action deferred, reasoning mandatory |
| `hold` | Neutral | Explicit "no action", often paired with a noisy signal |

**Confidence bands**

- 0–49: not shown on Dashboard. Lives in Recommendations feed under "Low confidence".
- 50–69: Dashboard eligible, rendered as `consider`.
- 70–100: Dashboard eligible, rendered as `recommended` (or `conflict` if flagged).

**Action vocabulary is closed.** Any copy outside `{Reduce, Add, Hold, Rebalance, Harvest, Ladder}` is a bug.

---

## 5. AI Output Density Rules

Curated, not exhaustive.

| Surface | Max items | Selection |
|---|---|---|
| Dashboard — Recommendations | **3** | Highest confidence `recommended` + any `conflict` |
| Dashboard — Signals block | **3**, summarized | Filtered; raw list lives in Signals destination |
| Dashboard — Market pulse | **3**, summarized | News never shown as raw feed |
| Asset detail — AI panel | **1** active rec + history | One decision per asset at a time |
| Recommendations feed | Unbounded, paginated | Full history, filterable by strength/action/date |

**Rules**

- If >3 recs qualify for the Dashboard, the overflow is accessible via "Review all" → Recommendations feed. Never stack more than 3 on the Dashboard.
- News is always AI-summarized into a one-line headline with a sentiment delta (`sent +0.4`). No publisher lede, no article body in-product.
- Signals on the Dashboard are already deduplicated against active recs. If a signal is already represented in a rec, it is not shown as a standalone signal.

---

## 6. Screen Specifications

### 6.1 Dashboard · 6.2 Asset detail · 6.3 Recommendations feed

See §12 for the v3 canonical structure. The v2.1 diagrams in §11 are preserved for historical reference.

---

## 7. Information Hierarchy (universal)

1. **AI Recommendations** — highest priority. What should you do?
2. **Portfolio health** — allocation, risk, drift
3. **Signals** — inputs; filtered summaries only outside the Signals destination
4. **News & sentiment** — context only, never the lead

**Progressive disclosure is mandatory.** Show essential → reveal advanced on demand. On Dashboard, replace tables with cards and visual summaries. Deep views (Portfolio, Activity) may retain tables for power-user scanning; explicit carve-out from the no-tables rule, scoped to destinations accessed intentionally from a card drill-down. Every screen must map to a **single user intent**.

---

## 8. Content & Voice

Aureon speaks like a calm senior analyst briefing a principal — terse, specific, never performative.

- **Address user as "you"**, never "we" or "I". AI refers to itself obliquely: *"Recommended"*, *"Flagged"*.
- **Sentence case everywhere** — titles, buttons, section headers. Only the wordmark and tickers are uppercase.
- **No emoji.** Unicode only for finance-native glyphs: `$`, `%`, `▲` `▼`, `·`.
- **Numbers lead.** *"$12,480 overweight in tech."*
- **Confidence language is calibrated**: "likely / consider / recommended / strongly recommended".
- **No exclamation marks.** No marketing superlatives.
- **Closed action vocabulary**: *Rebalance, Trim, Add, Hold, Review, Dismiss*.
- **AI artifact terms**: *Signal* (detected), *Recommendation* (prescriptive), *Insight* (interpretive), *Alert* (time-sensitive).

**Voice**

> ✓ *"Reduce tech exposure by $3,200. Allocation 34% vs. target 28%; 60-day momentum turning."*
> ✗ *"Whoa — your tech is way overweight! Time to trim some winners."*

---

## 9. Visual Foundations

### Palette

Aureon's world is **graphite and glass, lit by gold**.

- **Canvas**: `#0B0D10` obsidian (never pure black)
- **Surfaces**: translucent white-ink layered on canvas
- **Aurum gold**: `#C9A86A` — sole accent. Reserved for primary AI recommendations, confirmed actions, and the wordmark. Never decorative.
- **Semantic**: sage `#6FAE88` (positive), crimson `#D16B6B` (negative), dusk amber `#D4A257` (warning/conflict). Dialed back intentionally.
- **Data grays**: 9-step neutral ramp with slight cool bias.

### Typography — strict usage

Three families.

| Face | Role |
|---|---|
| **Satoshi** (sans, 400–700) | Headings & section titles |
| **Inter** (sans, 400–700) | Primary UI — body, nav, labels, buttons, table non-numeric cells |
| **JetBrains Mono** (400–600) | All numeric data — prices, %, tickers, timestamps, confidence scores |

**Sizes** · Hero 72 · Figure 48 · Metric 32 · H1 28 · H2 20 · H3 16 · Body 13–14 · Eyebrow 11 · Micro 11 min.

### Spacing · Radii · Glass · Motion

4px base (2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96). Radii 2/6/12/20/999.

Glass tiers: workspace (0.03 + 0.06 ring, 24 blur) · panel (0.045 + 0.08 ring, 32 blur) · floating (dark 72% + 0.10 ring, 40 blur + 0 24 64 shadow).

Motion: entry `cubic-bezier(0.22,0.61,0.36,1)`; state `cubic-bezier(0.4,0,0.2,1)`. 120/200/320 durations, never >400. Numbers tween 200ms linear.

---

## 10. Data-to-Decision Pipeline

```
INPUTS                    REASONING                OUTPUT
Signals       ┐
Fundamentals  │
Sentiment     │─────▶  AI reasoning engine  ─────▶  Recommendation
Allocation    │        (multi-factor weigh)         (schema §4)
User targets  ┘                                           │
                                                          ▼
                                                    UI surfaces
```

---

## Iconography

**System: Lucide** — thin 1.5px stroke, round caps, geometric. 16 / 20 / 24px only.

---

## Index

| File | Contents |
|---|---|
| `README.md` | Build-ready system spec |
| `SKILL.md` | Agent skill manifest |
| `colors_and_type.css` | Design tokens + semantic type classes |
| `assets/` | Logo, wordmark, atmospheric imagery |
| `preview/` | Design System preview cards |
| `ui_kits/aureon_app/` | Desktop UI kit |

---

## 12. Design Principles v3 — Decision Engine (accepted spec)

v3 is the authoritative spec for all Dashboard work going forward. v2.1 (§11) is historical record; where v3 conflicts with v2.1, **v3 wins**. Deep views (Portfolio, Activity, Assets destination) are exempt from v3's no-tables rule — they are accessed intentionally from a Dashboard card drill-down and may retain tabular layouts for power-user scanning.

### 12.1 Core philosophy

- The system is **decision-first, not data-first**.
- Every screen must answer three questions in order: **What changed? · Why it matters? · What should the user do next?**
- Prioritize **clarity, trust, and control** over visual complexity.
- Enforce the **3-second comprehension rule**: the user understands state instantly.
- Design must reduce cognitive load by exposing **one primary decision at a time**, not multiple competing actions.
- Interfaces must convert complex financial states into **clear, actionable steps**, not raw data visualizations.
- Every decision surface must prioritize **user confidence and control**, as trust is the primary UX outcome in financial systems.

### 12.2 Decision Lifecycle — user-facing model

The user-facing lifecycle is a 5-stage state machine. Every decision flow must pass through all five in order:

1. **Input** — Raw financial data / signals
2. **Interpretation** — System-generated insight
3. **Decision** — User action required
4. **Confirmation** — User validates action
5. **Outcome** — Result + feedback loop

**Rules**

- No UI component may exist outside this lifecycle.
- Each state must be visually distinct.
- Transitions must be explicit — no hidden logic.

**Enforcement constraint**

- Each lifecycle stage must map to a **dedicated UI state or component**.
- Skipping a stage (e.g., direct action without interpretation or preview) is invalid.
- Lifecycle visibility must be persistent at the system level (not hidden inside flows).

**Mapping to the canonical 7-step engineering lifecycle** (from §11):

| v3 user stage | v2.1 engineering steps | Primary component |
|---|---|---|
| Input | Detect | `SignalsSummary` |
| Interpretation | Recommend | AI engine (backend) |
| Decision | Evaluate | `DecisionUnit` |
| Confirmation | Apply · Confirm | `ActionConfirmationModal` · `OutcomeFeedbackCard` |
| Outcome | Track · Log | Activity ledger · `AssetDrawer` history |

The 7-step engineering lifecycle is preserved as the internal pipeline; the 5-stage model is what surfaces in the UI.

### 12.3 Decision Unit (core component)

The atomic UI block. All decisions render as a Decision Unit.

**Structure**

- **Title** — what happened
- **Impact** — why it matters
- **Action** — what to do next
- **Confidence** — system certainty indicator

**Constraints**

- Maximum **1 primary action** per unit.
- No raw data without interpretation.
- Must reduce cognitive load — no clutter.
- Default state is **collapsed**: Title + Impact + Action + Confidence only. Reasoning, allocation shift, and impact preview are revealed on hover/focus/expand.

**Behavioral rules**

- A Decision Unit must always resolve to a **single clear outcome path**.
- If multiple actions exist, they must be split into separate Decision Units.
- The unit must answer within 3 seconds: What changed · Why it matters · What to do next.

### 12.4 Impact Preview system

Every action must show a **before/after simulation** before it can be confirmed.

**Includes**

- Financial delta (gain / loss)
- Time-horizon impact
- Risk indicator

**Rule**

- No action can be executed or confirmed without an Impact Preview.
- The preview must be visible **before user commitment**, not after.
- Absence of preview = invalid decision flow.

### 12.5 Confidence system

All recommendations must carry a confidence score.

| Band | Range | Visual |
|---|---|---|
| High | 80–100% | Aurum fill, full segment bar |
| Medium | 50–79% | Ink-20 fill, partial segment bar |
| Low | <50% | Ink-40 fill, sparse segment bar — Dashboard-ineligible |

**Rules**

- Every confidence score must be accompanied by a **"why" explanation** (factor attribution).
- No blind recommendations. A rec without a confidence score is a bug.
- Confidence must directly map to visible reasoning inputs (allocation, momentum, sentiment, fundamentals). Black-box confidence is not allowed.

Supersedes the v1 three-band split in §4 for display purposes; the schema's integer score remains unchanged.

### 12.6 Recommendation constraints

- Maximum **3 recommendations per Dashboard** (the Recs destination remains unbounded + paginated).
- Each recommendation must:
    - Be **mutually exclusive** (no overlapping capital allocation or conflicting actions on the same asset or class)
    - Include **impact preview + confidence score**
- **No rec is pre-selected or auto-emphasized.** All three Dashboard Decision Units render at equal visual weight; gold accent fires only on the `recommended` strength dot and confidence bar, never on card background or Apply button treatment. The user chooses which to act on.

### 12.7 Visual system constraints

- Neutral base + high-contrast data.
- Color carries **meaning only** — gain / loss / risk / confidence. No decorative color.
- No aesthetic-first decisions.
- Strict hierarchy: **Decision > Insight > Data**.
- Decision components must visually dominate all other elements. Supporting data must never compete with decision elements in size, color, or placement.

### 12.8 Core components (reusable primitives)

1. **Decision Unit** — Title / Impact / Action / Confidence; collapsed by default
2. **Impact Preview Panel** — before/after simulation with financial delta, horizon, risk
3. **Confidence Indicator** — score + band + why-explanation
4. **Action Confirmation Modal** — enforces Impact Preview before commit
5. **Outcome Feedback Card** — post-action result + link to Activity

**Rule**: reuse > create new. No new visual patterns without explicit justification. All components must be token-driven, modular, state-aware.

### 12.9 Wireframe rules

Each Dashboard screen must include:

- **1 primary Decision Unit** (featured slot)
- **≤ 3 supporting units** (secondary Decision Units or context panels)
- **Clear next-action CTA** on every unit
- **Visible system state** — loading / success / error must all have explicit treatments
- Primary Decision Unit must be positioned **above the fold and center-aligned in hierarchy**. Supporting units must not visually overpower the primary decision.

**Disallowed**: multi-focus layouts · hidden actions · ambiguous states.

### 12.10 Design system integration

- Must reuse the existing HTML/CSS design system (`colors_and_type.css`, `ui_kits/aureon_app/v2/shell.css`).
- No new visual patterns without justification.
- All components must be **token-driven, modular, state-aware**.
- Any deviation must be justified at the decision-model level, not visual preference.

### 12.11 Output requirements (Claude-facing)

1. **Hi-fi UI kit** (authoritative for this release)
2. *(deferred)* Low-fi wireframes
3. *(deferred)* Component breakdown as JSON schema
4. *(deferred)* Interaction-state matrices

### 12.12 Execution rules

Staged delivery with explicit approval gates:

1. **Stage 1** — Define decision model *(README; approved)*
2. **Stage 2** — Define components (JSX primitives; awaiting approval)
3. **Stage 3** — Generate Dashboard wireframe in code
4. **Stage 4** — Validate against the 5-stage lifecycle + 12.9 wireframe rules

Each stage requires explicit approval before proceeding. No implicit progression.

---

## 11. v2 Refactor — Decision-first (historical)

v1 shipped a three-column dashboard with AI recs in a rail. v2 promoted recs to a full-width dominant layer. v2.1 added a 7-step LifecycleStrip, HoldingsStream (sparklines), MarketPulseBar, progressive disclosure on non-featured cards, Current-vs-Target panel in AssetDrawer, and a contrast pass.

**v2.1 → v3 delta**: v3 drops the featured/emphasized card in favor of three equal-weight Decision Units all collapsed by default; consolidates the 7-step engineering lifecycle behind a 5-stage user-facing model; introduces `ActionConfirmationModal` (enforces Impact Preview before commit) and `OutcomeFeedbackCard` as named primitives.

### File map (v2 / v2.1)

```
ui_kits/aureon_app/
├── index.html            entry
├── index_v1.html         preserved v1
└── v2/
    ├── shell.css         tokens + glass + tints + motion
    ├── data.jsx          icons, brand, formatters, seed data
    ├── decision.jsx      DecisionCard + ConfidenceBar + AllocationShift + ReasoningList + ImpactPreview
    ├── lifecycle.jsx     LifecycleStrip + Sparkline + HoldingsStream
    ├── shell.jsx         Sidebar + TopBar + Hero + ConfirmModal + AppliedToast + AssetDrawer
    └── app.jsx           Dashboard + RecsPage + MarketPulseBar
```

### Semantic glass tints

- `.tint-action` (aurum) · `.tint-conflict` (dusk) · `.tint-positive` (sage) · `.tint-risk` (crimson). Gradient overlays ≤8% + matching border. Only on decision-state surfaces.

### Motion tokens

`cardEnter` 320ms staggered · `numTick` 200ms linear · `drawerIn` 320ms · `barFill` 600ms (after-bar delayed 200ms) · `stepPulse` 2.4s infinite · `disclose` 260ms · `strokeDraw` 900ms.

---

## Caveats

- No source material provided. Numbers are educated first drafts.
- Fonts are Google Fonts / Fontshare substitutions.
- Icons are Lucide (CDN).
- Logo is a synthesized wordmark.
- v1 preserved at `ui_kits/aureon_app/index_v1.html`.
