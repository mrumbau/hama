# Tag 12 Polish Audit — Stage 1 (Konsistenz-Audit)

**Date:** 2026-04-26
**Scope:** All operator pages (`AppShell`, `Patrol`, `Events`, `PoiList`,
`PoiDetail`, `PoiNew`, `Sniper`, `SniperDetail`) and public pages
(`Landing`, `Login`) cross-referenced against:

- `industrial-brutalist-ui` (Tactical Telemetry mode → operator surface)
- `minimalist-ui` (Premium Utilitarian Minimalism → public surface)
- `design-taste-frontend` (overarching senior-UI/UX directives)
- `client/src/styles/tokens.css` (the project's design-token contract)

**Headline finding:** the design system is overall **disciplined**. The
token surface is comprehensive (paper/surface/mono/signal scales,
12-step spacing, 7-step type, motion + ease tokens) and the vast
majority of CSS values are token-bound. The drift that exists is
mostly **shape-level inconsistency between similar components built at
different Tags**, not raw-value sloppiness — which is the easier kind
to fix.

Findings are grouped by category and sorted by severity within each
group: **CRITICAL** (manifesto contract violation), **HIGH**
(visible inconsistency, demo-affecting), **MEDIUM** (observable on
inspection, quick wins), **LOW** (cleanup, no rendered impact).

The "Recommended slot" column says where each finding belongs:
**§2** = fix in Stage 2 (frontend-design backlog), **§3** = fix in
Stage 3 (ui-ux-pro-max UX layer), **T14** = defer to Tag 14
"impeccable" pass, **NO** = leave as-is, justified.

---

## 1. Manifesto Contract Violations

### 1.1 [CRITICAL] `border-radius: 50%` on brutalist status dots

**File:** `client/src/pages/SniperDetail.module.css:220`
**Manifesto:** industrial-brutalist-ui §5 *"Geometry: Absolute rejection
of `border-radius`. All corners must be exactly 90 degrees to enforce
mechanical rigidity."*
**Evidence:**

```css
.statusDot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;        /* ← VIOLATES manifesto */
}
```

The `--radius-1` (2px) and `--radius-2` (4px) tokens explicitly are NOT
referenced — this is a raw `50%` for a perfect circle. Every other
status-dot in the project (Patrol's `.liveDotIndicator`, PoiDetail's
four `.statusDot*` variants) is square per spec. The Sniper detail
page is the only operator page that uses round dots.

**Fix:** Drop `border-radius: 50%`, set the dot square.
**Recommended slot:** §2.

---

### 1.2 [HIGH] `signal-green` (phosphor tail) used twice on Patrol

**File:** `client/src/pages/Patrol.module.css:155, 296`
**Manifesto:** industrial-brutalist-ui §4.2 *"Terminal Green
(`#4AF626`): Optional. Use ONLY for a single specific UI element …
never as a general text color. If it doesn't serve a clear purpose,
omit it entirely."*
**Evidence:**

- `.liveDotIndicator { background: var(--color-status-tail); }` (= signal-green in dark theme) — pulses next to "LIVE" badge. Justified.
- `.scanLine { background: var(--color-status-tail); ... }` — animated horizontal sweep over the webcam viewport. Same color.

Two uses on the same page. The manifesto reads as "exactly one
element" — a strict interpretation flags this as a violation.

**Fix options:**
- **(a)** Keep both, document in DECISIONS.md as a deliberate
  manifesto deviation: "live-tail indicator + viewport scan-line are
  the same conceptual signal — 'system is actively listening'".
- **(b)** Move `.scanLine` to `--color-status-running` (cyan-300) so
  green stays single-purpose on the live-dot.

Option (b) is more defensible for the oral defence.
**Recommended slot:** §2.

---

### 1.3 [MEDIUM] Macro typography is "headline-sized", not "viewport-bleeding"

**Files:** every brutalist `.title`
**Manifesto:** industrial-brutalist-ui §3.1 *"Scale: Deployed at
massive scales using fluid typography (e.g., `clamp(4rem, 10vw,
15rem)`)."*
**Evidence:** every operator-page `.title` uses
`clamp(2rem, 4vw, 3rem)` — substantially smaller than the manifesto's
recommended monolithic block scale. The PoiDetail and SniperDetail
titles drop further to `clamp(1.5rem, 3vw, 2.25rem)`.

The constraint is real — the operator surface has a 14rem side-rail
plus 3rem of main padding, leaving 60-70% of the viewport for
content. A 15rem `clamp` would not fit. But the current numbers feel
"editorial-blog header"-sized rather than "industrial-blueprint"-sized.

**Fix options:**
- **(a)** Bump the page-title cap to `clamp(2.5rem, 5vw, 4rem)`
  on the registry-style pages (PoiList, Sniper, Events) — leave the
  detail-style pages (PoiDetail, SniperDetail) where they are because
  they need to share row with metadata + actions.
- **(b)** Tighten letter-spacing further: `--tracking-tight` is
  -0.03em today, but the manifesto allows -0.06em. A `-0.05em` token
  for "macro headers only" would force more glyph-block density.
- **(c)** Treat as deliberate constraint and document.

**Recommended slot:** §2.

---

### 1.4 [MEDIUM] No global texture / grain layer

**File:** none
**Manifesto:** industrial-brutalist-ui §7 *"Mechanical Noise: A global,
low-opacity SVG static/noise filter applied to the DOM root to
introduce a unified physical grain across both dark and light modes."*

Operator pages are clean digital surfaces with no grain. Adds to
the "bare CSS" feel; the manifesto wants the surface to look like
declassified blueprints with paper grain.

**Fix:** A single `.shell::after { background: url('data:image/svg+xml…'); }` overlay with a noise SVG, opacity ~0.02-0.04, `pointer-events: none`. Apply at AppShell level (operator) and at Landing/Login (public — minimalist actually shares the recommendation per §6).
**Recommended slot:** T14 (impeccable pass — visual flourish, no functional impact).

---

### 1.5 [LOW] Industrial markers (®, ©, ™) absent

**File:** none
**Manifesto:** industrial-brutalist-ui §6 *"Industrial Markers:
Prominent integration of registration (®), copyright (©), and trademark
(™) symbols functioning as structural geometric elements rather than
legal text."*

The brand block in AppShell shows `ARGUS` / `REV 0.1.0 · DAY 3`. A
`ARGUS®` or `REV 0.1.0™` would lean into the manifesto's typographic
identity. Absent today.

**Recommended slot:** T14.

---

### 1.6 [LOW] ASCII syntax decoration is sparse

**File:** various
**Manifesto:** industrial-brutalist-ui §6 *"Syntax Decoration:
Utilization of ASCII characters to frame data points. Framing:
`[ DELIVERY SYSTEMS ]`, `< RE-IND >`. Directional: `>>>`, `///`,
`\\\\`."*

Currently used:
- `[ no poi enrolled · click + new poi to start ]` (PoiList empty)
- `[ drop face photo here or click ]` (Sniper dropzone)
- `[ no events yet … ]` (Patrol feed empty)
- `[ {N} POIS · ENROL ≥ 3 EMBEDDINGS … ]` (PoiList footer)

Solid — but the directional / barcode treatments (`>>>`, `///`) aren't
used. Could add:
- `>>>` arrow-prefix for primary CTA buttons (`>>> NEW POI`).
- `///` separator strips between major page sections.
- `+` crosshair markers at table-grid intersections.

**Recommended slot:** T14 (texture-only, no semantics).

---

### 1.7 [LOW] Minimalist `border-radius` slightly tighter than manifesto

**File:** `client/src/pages/Landing.module.css`, `Login.module.css`
**Manifesto:** minimalist-ui §5 *"Border-radius must be crisp: 8px or
12px maximum."*
**Evidence:**

- Login `.card`: `border-radius: var(--radius-2)` = 4px
- Login `.input`: `border-radius: var(--radius-1)` = 2px
- Login `.submit`: `border-radius: var(--radius-2)` = 4px
- Landing `.heroPrimary`: `border-radius: var(--radius-2)` = 4px
- Landing `.layerCell`: `border-radius: var(--radius-1)` = 2px
- Landing `.signInLink`: `border-radius: var(--radius-2)` = 4px

Manifesto recommends **8-12px** (crisp but rounded), our scale tops out
at **4px** (effectively flat). The result is the public surface looks
"tighter" than the editorial-style premium minimalism the manifesto
calls for.

**Fix options:**
- **(a)** Add `--radius-3: 0.5rem` (8px) and re-bind the Login card +
  layerCell to use it. Keeps inputs/buttons at 4px (the input radius
  pairs with form-density, kept).
- **(b)** Treat as deliberate aesthetic — Argus reads as "more
  technical than editorial" even on the public surface. Documented.

**Recommended slot:** §2 (aesthetic tilt, low risk).

---

## 2. Component Inconsistency

### 2.1 [HIGH] Status dots have three different sizes across pages

**Files:**

- `Patrol.module.css:153` — `.liveDotIndicator { width: 0.625rem; height: 0.625rem; }` (10px)
- `PoiDetail.module.css:202,209,216,223` — four `.statusDot*` variants, all `0.625rem` square
- `SniperDetail.module.css:218` — `.statusDot { width: 0.75rem; height: 0.75rem; border-radius: 50%; }` (12px circle)
- `Events.module.css` — uses `.status` border-only chips, no dot at all

**Impact:** the same conceptual element ("system status indicator")
renders at 10px square in Patrol/POI and 12px circle in Sniper. A
defence reviewer comparing the Patrol page next to the Sniper detail
page sees two different design vocabularies for the same idea.

**Fix:** Add a `--dot-size: 0.625rem` (or token `--space-2-5: 0.625rem`)
and a shared `.statusDot` pattern in a small global CSS or a CSS-modules
re-export. Standardise to **square 10px** across all operator pages
(per §1.1, no border-radius).

**Recommended slot:** §2.

---

### 2.2 [HIGH] Drop zones use inconsistent border weight + sizing strategy

**Files:**

- `PoiDetail.module.css:132-160` — `.dropzone { border: var(--border-strong) dashed var(--color-border-strong); padding: var(--space-5); min-height: 18rem; }`
- `Sniper.module.css:57-75` — `.dropzone { border: var(--border-hairline) dashed var(--color-border-strong); min-height: 14rem; ... } /* no padding, content centred via flex */`

**Impact:** the operator's two upload affordances look visibly different
— PoiDetail has a thicker (2px) dashed border and feels more
"industrial", Sniper has a lighter (1px) one. A user toggling between
the two pages registers them as separate UI primitives.

**Fix:** Standardise on the brutalist heavier weight:
`border: var(--border-strong) dashed var(--color-border-strong)`,
`min-height: 14rem`, and remove the redundant `padding`-based variant.
The content-centring approach (flex column, gap) is the cleaner one
to keep — port to PoiDetail.

**Recommended slot:** §2.

---

### 2.3 [HIGH] `feed-flash` keyframe duplicated across Patrol + Events with different terminal background

**Files:**

- `Patrol.module.css:222-230` — `feed-flash { from: var(--signal-cyan-900); to: var(--color-bg-raised); }`
- `Events.module.css:158-166` — `feed-flash { from: var(--signal-cyan-900); to: transparent; }`

**Impact:** name collision (CSS Modules scopes class names but **not**
keyframes — both definitions are global). One overrides the other
depending on import order. Whichever Patrol/Events page mounted first
defines the active animation; switching pages may flicker because the
"to" colour shifts.

**Fix:** Move `feed-flash` to a global stylesheet (or rename the
Events-side variant `events-flash` for explicit divergence). Pick one
target — `var(--color-bg-raised)` is the safer default since
`transparent` causes a brief visual gap when over a non-bg-raised
parent.

**Recommended slot:** §2 (concrete bug — keyframe collision in
production).

---

### 2.4 [HIGH] Five differently-named pulse animations across pages

**Files:**

- `Patrol.module.css` — `tail-pulse` (1.5s) on liveDotIndicator
- `Patrol.module.css` — `scan` (2s) on scanLine
- `PoiDetail.module.css` — `pulse` (1s) on statusDotRunning
- `Sniper.module.css` — `snip-pulse` (1s) on spinnerDot
- `SniperDetail.module.css` — `dot-pulse` (0.9s) on dot_running

All five animate `opacity` from ~1 → ~0.4 → 1 with similar timings.
Five identical mechanisms with five names that all live in the global
keyframe namespace.

**Fix:** Consolidate into one `argus-pulse` keyframe in a global
stylesheet, with two timings exposed:
`--motion-pulse-fast: 0.9s` and `--motion-pulse-slow: 1.5s`. Drop the
four duplicate definitions.

**Recommended slot:** §2.

---

### 2.5 [HIGH] Empty-state padding differs across registries

**Files:**

- `PoiList.module.css:185` — `.empty { padding: var(--space-9) var(--space-6); }` (96px / 32px) — generous
- `Events.module.css:171` — `.empty { padding: var(--space-9); }` (96px) — generous
- `Patrol.module.css:271` — `.empty { padding: var(--space-7); }` (48px) — medium
- `Sniper.module.css:206` — `.empty { padding: var(--space-4); }` (16px) — tight

Sniper's empty state is **6× tighter** than PoiList's. Visually, when
the Sniper landing page first mounts (no reports yet), the empty
state feels cramped relative to the "+ register" CTA above it.

**Fix:** Standardise on the PoiList pattern: `padding: var(--space-9) var(--space-6)`. Make the empty state a shared visual primitive across pages.

**Recommended slot:** §2 (also touches §3 because empty-state copy is
UX).

---

### 2.6 [MEDIUM] Primary-CTA hover uses raw `signal-red-600` instead of a token

**Files:**

- `PoiList.module.css:54` — `.primaryButton:hover { background: var(--signal-red-600); }`
- `PoiNew.module.css:111` — `.submit:hover:not(:disabled) { background: var(--signal-red-600); }`
- `Login.module.css:100` — `.submit:hover:not(:disabled) { background: var(--mono-700); }` (light theme variant of the same idea)
- `Landing.module.css:107` — `.heroPrimary:hover { background: var(--mono-700); }`

The hover-darken pattern reaches into the **raw scale** instead of a
semantic token. There's no `--color-accent-hover` defined in
tokens.css. The semantic layer should own this.

**Fix:** Add to tokens.css per theme:
- dark: `--color-accent-hover: var(--signal-red-600);`
- light: `--color-accent-hover: var(--mono-700);`

Update all four sites.

**Recommended slot:** §2.

---

### 2.7 [MEDIUM] Error block backgrounds inconsistent

**Files:** every `.error` class

- PoiList, PoiDetail, PoiNew, Patrol, Events: `border` only, transparent background
- Sniper, SniperDetail: `background: var(--color-bg-sunken)` + border
- Login: no background, but `border-left: var(--border-strong)` (no full border) — minimalist mode

Three different patterns for the same primitive.

**Fix:** Choose one:
- **operator pages**: full border, no background (matches the existing
  4-page majority);
- **public pages**: keep the border-left minimalist variant.

Apply consistently. Sniper's `bg-sunken` adds visual weight that
competes with the layer-card grid below it — drop.

**Recommended slot:** §2.

---

### 2.8 [MEDIUM] Snake_case class names in SniperDetail

**File:** `SniperDetail.module.css:147,150,153,225,228,231,234`
**Evidence:** `.column_running`, `.column_done`, `.column_failed`,
`.dot_pending`, `.dot_running`, `.dot_done`, `.dot_failed`

Every other module uses **camelCase** (`.statusDotRunning`,
`.statusDotDone`, etc.). Stylelint's `selector-class-pattern`
explicitly enforces `^[a-z][a-zA-Z0-9_-]*$` which **does** allow
underscores — but the project convention is camelCase.

**Fix:** Rename to `columnRunning`, `dotPending`, etc. in both the
CSS and the consuming TSX (`styles[\`column_${status}\`]` →
`styles[\`column${capitalize(status)}\`]`).

**Recommended slot:** §2.

---

### 2.9 [MEDIUM] PoiNew textarea typography drops to mono — inconsistent with .input/.select

**File:** `PoiNew.module.css:67-71`
**Evidence:**

```css
.input, .select, .textarea {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  ...
}

.textarea {
  /* overrides parent: */
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
```

The textarea is the "notes" field — operator-written prose. Switching
the font to mono + smaller size feels arbitrary; either keep notes
in sans like the rest of the form (operator-friendly), or make the
*entire form* feel terminal (mono everywhere).

**Fix:** drop the override — use `var(--font-sans) var(--text-base)`
matching the other inputs.

**Recommended slot:** §2.

---

### 2.10 [LOW] Magic-number ratios (`scale(0.97)`) repeated across files

**Files:** PoiList, PoiNew, Patrol, Login, Landing
All use `transform: scale(0.97)` on `:active`. The exact value
could be tokenised (`--scale-press: 0.97`) — minor.

**Recommended slot:** T14.

---

### 2.11 [LOW] `min-height: 18rem` repeated three times in PoiDetail

**File:** `PoiDetail.module.css:82, 148, 179`
- `.tile { min-height: 18rem; }`
- `.dropzone { min-height: 18rem; }`
- `.uploadingTile { min-height: 18rem; }`

Three sibling components share the row height. A `--gallery-tile-height: 18rem` token would document the relationship — minor.
**Recommended slot:** T14.

---

### 2.12 [LOW] `--space-2-5` (0.625rem) and `--space-3-5` (0.875rem) are missing from the spacing scale

**Files:** Patrol, PoiDetail, SniperDetail use `0.625rem` directly for status dots
**Evidence:** the spacing scale jumps from `--space-2: 0.5rem` to `--space-3: 0.75rem`. Anything in between has to use raw rem.

**Fix:** Add a half-step token `--space-2-5: 0.625rem` for the canonical 10px-square dot.

**Recommended slot:** §2 (small surface, clear win).

---

## 3. Token / Color / Spacing Drift

### 3.1 [MEDIUM] Hard-coded `letter-spacing: 0` instead of `var(--tracking-normal)`

**File:** `Sniper.module.css:107`
**Evidence:** `.dropzoneSub { letter-spacing: 0; }` — bypasses the
token. Identical effect to `var(--tracking-normal)` (= 0), but the
project commits to the token convention.

**Recommended slot:** §2 (one-line fix).

---

### 3.2 [LOW] Hard-coded `0.5rem`, `0.75rem`, `0.125rem` for visual primitives

**Files:**

- `SniperDetail.module.css:342` — `.simBar { height: 0.5rem; }`
- `SniperDetail.module.css:359-363` — `.simBarThreshold { top: -0.125rem; bottom: -0.125rem; width: 0.125rem; }`
- `Sniper.module.css:111` — `.spinnerDot { width: 0.75rem; height: 0.75rem; }`
- `Sniper.module.css:257` — `.budgetBar { height: 0.5rem; }`

These are at half-token sizes (10px / 12px / 2px). The
`--space-2: 0.5rem` token would cover the 0.5rem case, but the smaller
sizes (`0.125rem`, `0.625rem`, `0.75rem`) are below the spacing scale.

**Fix:** Define `--space-half: 0.125rem` (2px), `--space-2-5: 0.625rem`
(10px), `--space-3: 0.75rem` (already exists).

**Recommended slot:** T14.

---

### 3.3 [LOW] Border in light theme is `#e6e5e1` (paper-300) vs manifesto's `#EAEAEA`

**File:** `tokens.css:226`
**Evidence:**

```css
[data-theme="light"] {
  --color-border: var(--paper-300);  /* #e6e5e1 */
}
```

Minimalist-ui §4 says structural borders/dividers should be
`#EAEAEA` or `rgba(0,0,0,0.06)`. Our `paper-300` is `#e6e5e1` —
a hair warmer (warm-white substrate). Visually indistinguishable
in isolation; if a defence reviewer pulls a colour-picker, they
catch the drift.

**Recommended slot:** NO. Document as deliberate (warm-monochrome
is the chosen substrate; #EAEAEA is cool-grey). Minimalist-ui §4
allows either; ours is consistent with the warm-bone canvas
(`#fbfbfa`).

---

## 4. UX Layer (preview — surfaces in Stage 3)

These are noted here so the audit is complete but should be planned
under the ui-ux-pro-max pass per the project request.

### 4.1 [HIGH] Loading states are pulse-dots, not skeleton loaders

**Files:** PoiDetail upload tiles, Sniper dropzone busy state, Sniper
detail column running state, all of them animate a small status dot.
design-taste-frontend §3 Rule 5: *"Loading: Skeletal loaders matching
layout sizes (avoid generic circular spinners)."*

The pulse-dot pattern is cheap but conveys "something is happening,
unspecified". A skeleton block in the shape of the eventual content
would tell the operator *what* is loading — Layer 1 column would
show a skeleton for the matches list, Layer 2 a skeleton for the hits
grid.

**Recommended slot:** §3.

---

### 4.2 [HIGH] First-time-operator experience has no orientation hints

**Files:** AppShell + initial /poi load
After login the operator lands on `/poi`. If empty, the page shows
`[ no poi enrolled · click + new poi to start ]`. No tour, no
"here's what Argus does", no callout to the Sniper / Patrol modes.

design-taste-frontend §3 Rule 5: empty states *should indicate how to
populate data*. The current copy points to the next click but doesn't
explain the broader workflow. A first-time defence reviewer or a fresh
operator clicks around to figure out what each tab does.

**Recommended slot:** §3 (light orientation, no full onboarding flow).

---

### 4.3 [MEDIUM] Error states don't surface recovery hints

**Files:** every `.error` block
All errors render the raw `${status} ${message}` from `ApiError`.
Examples:

- PoiList: `"401 invalid_token"` if session expired — no "sign in
  again" link.
- Sniper: `"413 image_too_large"` — no "max 10MB" hint visible to
  the operator (it's in the dropzone subtext but not in the error).
- PoiDetail: `"network failed"` — no retry button.

design-taste-frontend §3 Rule 5: *"Error States: Clear, inline error
reporting (e.g., forms)"* — we have inline reporting; we lack
*recovery hints*.

**Recommended slot:** §3.

---

### 4.4 [MEDIUM] Empty state copy is functional but not warm

**Files:** PoiList, Events, Patrol-feed, Sniper

The brutalist `[ ... ]` framing reads as utilitarian — fits the
manifesto. But:
- `[ no events yet — start patrol or wait ]` (Patrol feed) — fine
- `[ no reports yet — drop a photo above to start ]` (Sniper) — fine
- `[ no poi enrolled · click + new poi to start ]` (PoiList) — fine
- `[ no events yet · pending status events will appear here ]` (Events) — slightly cryptic ("pending status events" is internal jargon)

**Recommended slot:** §3 (copy pass).

---

### 4.5 [LOW] Sniper landing page lacks a "what is this?" introduction for first-time operators

The page header has the subtitle:
> "One face photo in — four independent OSINT layers out, in
> parallel: identity, web presence, geographic, authenticity. ADR-1."

This is reference-style — assumes the operator knows what ADR-1 means.
First-time copy could describe the layers + their cost up front.

**Recommended slot:** §3.

---

## 5. Summary tally

| Severity | Count | Of which contract violations |
| -------- | ----- | ---------------------------- |
| CRITICAL | 1     | 1                            |
| HIGH     | 7     | 1                            |
| MEDIUM   | 8     | 2                            |
| LOW      | 6     | 3                            |

**Backlog suggestions for Stage 2 (frontend-design):**
§1.1, §1.2, §1.3, §1.7, §2.1, §2.2, §2.3, §2.4, §2.5, §2.6, §2.7, §2.8, §2.9, §2.12, §3.1

**Backlog suggestions for Stage 3 (ui-ux-pro-max):**
§4.1, §4.2, §4.3, §4.4, §4.5

**Defer to Tag 14 (impeccable):**
§1.4, §1.5, §1.6, §2.10, §2.11, §3.2

**No-fix (justified):**
§3.3

---

## 6. Strengths worth noting

The audit is mostly compliance-focused so the positive reads bear
calling out — these are the parts that should NOT change in Stage
2/3:

- **Token discipline is high.** Stylelint enforces token-only colors
  and a `unit-allowed-list`; raw hex codes are confined to
  `tokens.css` + `reset.css` per the override config.
- **Theme-switching is structural, not patched.** `data-theme="dark"`
  vs `data-theme="light"` re-binds the semantic `--color-*` tokens;
  no component CSS knows which theme it's in.
- **Status semantics are consistent.** `--color-status-{ok, warn,
  fail, running, pending, done, tail}` cover every state; every page
  reaches for the same names.
- **Mono-data tokens read correctly.** `--color-mono-data` for
  numerical values + `font-variant-numeric: tabular-nums` is applied
  consistently — the latency tickers, similarity scores, and event
  scores all align column-wise.
- **No emojis. No AI clichés.** Greppable proof: zero hits for
  `Elevate|Seamless|Unleash|delve|next-gen` etc. across the TSX
  surface.
- **Motion respects manifesto.** All transitions use the four
  documented timings (`--motion-fast/normal/slow/deliberate`) and
  one of three eases. No raw cubic-beziers in module CSS.
- **`#000000` is never used.** `--surface-0: #050505` is the
  blackest the operator surface gets — design-taste-frontend
  "NO Pure Black" rule satisfied.
- **Brutalist 90°-corner rule held everywhere except §1.1.** The
  exception is one circle; everything else is rectilinear.

---

**Status:** Stage 1 complete. Awaiting decision on which backlog
items move into Stage 2 (frontend-design) and Stage 3
(ui-ux-pro-max) vs deferred to Tag 14.
