# Argus — Design

This document is the source of truth for visual decisions. It is structured
by skill phase per plan §6: Foundation (Tag 2) → Aesthetic Commitment
(Tag 2) → Execution (Tag 12) → Polish (Tag 14). Each phase appends to its
section as it lands.

---

## §1 Manifesto (Phase 1 — `design-taste-frontend`)

Argus has two faces: a calm, paper-substrate landing that explains what an
OSINT fusion engine does, and a charcoal operator dashboard that hides
nothing — every score, every latency, every quota visible at the surface.
We treat truthfulness as a design constraint: progress is shown in
milliseconds, not spinners; failures are named in red, not swallowed by
retry loops; data is monospace, never decoratively softened. We refuse the
SaaS-aesthetic shorthand — no glassmorphism, no purple gradients, no
card-shadow noise, no AI sparkle — because the engineering deserves to be
read, not photographed.

**Defence thesis:** _Form follows the trust relationship. Minimalism for
the public examiner, brutalism for the trusted operator. The seam between
them is `/login` — a custom form against `supabase.auth`, not the Supabase
Auth UI._

### Skill influences

- **`design-taste-frontend`** sets the anti-slop fences (no Inter, no
  pure-black, no purple/blue AI gradients, no oversaturated accents, no
  3-equal-card layouts, no generic AI copy) and the interaction
  expectations (skeleton loaders, beautiful empty states, tactile press
  feedback, hardware-accelerated transforms only). We deviate from its
  Tailwind/Framer-Motion default — see ADR-8 for why.
- **`emil-design-eng`** sets the animation philosophy: keyboard-initiated
  actions never animate, exits are faster than enters, custom easings
  (`cubic-bezier(0.23, 1, 0.32, 1)`) replace built-in CSS ease-out, popovers
  scale from their trigger, transitions over keyframes for interruptible UI.
- **`industrial-brutalist-ui`** owns the operator surface: tactical
  telemetry archetype (dark substrate, monospace data, zero border-radius,
  visible 1px compartmentalisation, hazard-red as the only chromatic
  accent, ASCII syntax decoration around data clusters).
- **`minimalist-ui`** owns the public surface: warm monochrome on a
  paper-like off-white, editorial serif (Newsreader) for the hero, generous
  vertical whitespace, content constrained to `--layout-max-public`.

---

## §2 Tokens (Phase 1 — `emil-design-eng`)

All design tokens live in [`client/src/styles/tokens.css`](../client/src/styles/tokens.css).
Every component CSS module references tokens via `var(--token-name)` —
**raw hex codes and pixel values are blocked by Stylelint** (see
`.stylelintrc.json`). The three exceptions (`tokens.css`, `reset.css`,
`app.css`) are explicit overrides.

### Surface scales

| Scale                    | Range                      | Usage                         |
| ------------------------ | -------------------------- | ----------------------------- |
| `--surface-{0,100..900}` | 10 steps, charcoal/asphalt | Operator dark substrate       |
| `--paper-{0,50..500}`    | 7 steps, warm off-white    | Public light substrate        |
| `--mono-{50..900}`       | 10 steps, neutral grays    | Text foreground in both modes |

### Signal scales

| Token                | Canonical                       | Semantic                                           |
| -------------------- | ------------------------------- | -------------------------------------------------- |
| `--signal-red-500`   | `#E61919` (aviation/hazard red) | Alerts · destructive · banned · layer-failure      |
| `--signal-amber-500` | `#D99C0A`                       | Warnings · quota-near · in-progress                |
| `--signal-cyan-500`  | `#06B6C8`                       | Status OK · latency tickers · telemetry info       |
| `--signal-green`     | `#4AF626` (phosphor)            | **Single use per page only** — live-tail indicator |

### Spacing — 8pt grid in rem

| Token            | Value           | Use                                |
| ---------------- | --------------- | ---------------------------------- |
| `--space-1`      | `0.25rem` (4px) | Hairline gaps                      |
| `--space-2`      | `0.5rem` (8px)  | Inline gaps                        |
| `--space-3..4`   | `0.75-1rem`     | Component-internal padding         |
| `--space-5..6`   | `1.5-2rem`      | Section padding (operator)         |
| `--space-7..9`   | `3-6rem`        | Section gaps (operator)            |
| `--space-10..12` | `8-16rem`       | Macro padding (minimalist landing) |

### Type — 1.20 minor-third scale

| Token         | rem   | Use                               |
| ------------- | ----- | --------------------------------- |
| `--text-xs`   | 0.694 | Captions, footnote-style metadata |
| `--text-sm`   | 0.833 | Secondary text, labels            |
| `--text-base` | 1     | Body                              |
| `--text-lg`   | 1.2   | Emphasised body                   |
| `--text-xl`   | 1.44  | Section headers                   |
| `--text-2xl`  | 1.728 | Page titles                       |
| `--text-3xl`  | 2.074 | Landing hero base (clamp upward)  |

Macro brutalist headers use `clamp(4rem, 10vw, 15rem)` at the usage site —
no token, since the function-of-viewport behaviour is the point.

### Motion — fast / normal / slow / deliberate

| Token                 | Duration | Use                         |
| --------------------- | -------- | --------------------------- |
| `--motion-fast`       | 50ms     | Press feedback, focus state |
| `--motion-normal`     | 100ms    | Hover, color shift          |
| `--motion-slow`       | 150ms    | Dropdown, tooltip, popover  |
| `--motion-deliberate` | 300ms    | Modal, drawer (rare)        |

Easings:

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` — UI default (enter, scale, fade)
- `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` — on-screen movement
- `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` — iOS-like drawer
- `--ease-soft: cubic-bezier(0.16, 1, 0.3, 1)` — minimalist scroll-entry

`ease-in` is **never** used: it delays the moment the user is watching most
closely (per `emil-design-eng`).

### Radius — three steps, 0/2/4px

| Token        | Value | Where                                   |
| ------------ | ----- | --------------------------------------- |
| `--radius-0` | 0     | All operator surfaces (brutalist)       |
| `--radius-1` | 2px   | Code blocks, kbd, small chips           |
| `--radius-2` | 4px   | Public surface buttons (minimalist max) |

No `border-radius: 9999px` (pill shapes) anywhere. No `rounded-full`.

### Themes

`tokens.css` re-binds the semantic `--color-*` variables on
`[data-theme="dark"]` and `[data-theme="light"]`. Components only ever
reference semantic tokens (`--color-bg`, `--color-fg`, `--color-accent`,
`--color-border`, `--color-status-{ok,warn,fail,pending,running,done}`,
`--color-bbox`, `--color-bbox-confirmed`). Switching theme replaces the
runtime values — **no component CSS changes** when the surface flips from
brutalist (operator) to minimalist (public).

---

## §3 Operator surface specs (Phase 2 — `industrial-brutalist-ui`)

Five pages live behind `/login`, all in the **Tactical Telemetry** archetype
(dark substrate, monospace data dominance, hazard-red accent, zero
border-radius). They share a left rail (`--layout-rail = 14rem`) carrying
nav + operator identity + cost-guard status.

### `/poi` — POI registry (list)

```
┌─[ ARGUS ]──────────────────────────────────────────────────────────┐
│ POI / REGISTRY              REV 0.1 · OPERATOR mr@argus · €1.40/€2 │
├─────┬──────────────────────────────────────────────────────────────┤
│ NAV │  POI / REGISTRY ®           [ + NEW POI ]    [ EXPORT CSV ]  │
│  ▸  │ ──────────────────────────────────────────────────────────── │
│ POI │  ID         FULL NAME           CAT      EMB  THR    LAST    │
│ PAT │  ─────────  ────────────────    ───      ───  ───    ────    │
│ EVT │  POI-0001   Aribella Vance      VIP      5    0.55   42m     │
│ SNI │  POI-0002   Joaquín Reséndiz    STAFF    4    0.55   2h      │
│     │  POI-0003   M. Tahir Aydın      BANNED   5    0.62   —       │
│     │  POI-0004   Lior Ben-David      GUEST    3    0.55   1d      │
│     │  ─────────  ────────────────    ───      ───  ───    ────    │
│     │                                                              │
│     │  [ ▌▌▌ 24 POIS · 117 EMBEDDINGS · INDEX HEALTH OK ]           │
└─────┴──────────────────────────────────────────────────────────────┘
```

**Anchor rules:**

- Heading `POI / REGISTRY` at `clamp(2.5rem, 4.5vw, 4rem)`, Archivo Black, uppercase, `letter-spacing: -0.03em`, `line-height: 0.9`.
- Table is `display: grid; grid-template-columns: 96px 1fr 80px 56px 56px 96px; gap: 1px;` against `background: var(--color-border)` — produces hairline dividers without `border` declarations.
- Row hover tint: `--surface-300`. Row click → navigate to `/poi/:id`.
- Category badges: monospace uppercase, no fill — only `border: 1px solid var(--color-fg-subtle)` with category-specific colored fg (banned=red500, vip=mono-50, staff=mono-300, guest=mono-400, missing=amber-400).
- Cost-guard meter in topbar: monospace `€1.40 / €2.00` plus a 1-character textual bar `▌▌▌▌▌▌▌──`.
- Latency badge `42m` reuses the `LatencyBadge` component (Tag 12).

**Empty state:** ASCII-bracketed instruction `[ ENROLL FIRST POI: + NEW POI ]` centred, mono uppercase. No illustration.

### `/poi/:id` — POI detail (enrol + edit)

Two-column grid: 1fr × 1fr.

- **Left:** Embedding gallery — five 240×240 mono frames of enrolled photos with quality+authenticity scores written underneath in mono. Hover surfaces a `[ DELETE EMBEDDING ]` strike-through-styled trash button. New-photo dropzone is the sixth tile, ASCII-bracketed.
- **Right:** Form (label-above-input, mono uppercase labels, 1px solid border on inputs, no border-radius). Threshold slider with mono numerical readout. "Save" is a hazard-red full-width button at the bottom; "Delete POI" is a smaller mono-red ghost button below it, requiring a Radix `<AlertDialog>` confirmation.

### `/patrol` — Live recognition

```
┌─[ ARGUS ]──────────────────────────────────────────────────────────┐
│ PATROL / LIVE                                                      │
├─────┬──────────────────────────────────────────────────────────────┤
│ NAV │   ╔═══════════════════════════════════════════════════╗      │
│     │   ║                                                   ║      │
│     │   ║      [WEBCAM 0]   8.4 fps · 2 tracks              ║      │
│     │   ║                                                   ║      │
│     │   ║      ┌─────────┐                                  ║      │
│     │   ║      │ POI-0001│ 0.87                             ║      │
│     │   ║      │  vance  │                                  ║      │
│     │   ║      └─────────┘                                  ║      │
│     │   ║                                                   ║      │
│     │   ╚═══════════════════════════════════════════════════╝      │
│     │   [ ◉ LIVE ]   tracker:bytetrack   ml:p50=42ms p99=120ms     │
│     │ ──────────────────────────────────────────────────────────── │
│     │   RECENT EVENTS                                              │
│     │   t-12s   POI-0001  vance       0.87   [ confirmed ]         │
│     │   t-1m    POI-0003  aydın       0.61   [ pending  ]          │
│     │   t-3m    UNKNOWN              —      [ dismissed ]          │
│     │                                                              │
└─────┴──────────────────────────────────────────────────────────────┘
```

**Anchor rules:**

- Webcam viewport `aspect-ratio: 16/9; max-width: 90vw; max-height: 70vh`. Border `2px solid var(--surface-700)`.
- Bbox overlays: `position: absolute` rectangles with `border: 2px solid var(--color-bbox)` (red500 for matched POI), `--color-bbox-confirmed` (cyan400) once an operator confirms. Bbox label sits flush on the bottom-left edge of the box, mono caps, `padding: 2px 4px`, hazard-red background, white fg. Score in `tabular-nums`.
- Live tail dot `[ ◉ LIVE ]` uses `--signal-green` — **the single phosphor-green element on the page**, per the brutalist constraint.
- Latency readout `ml:p50=42ms p99=120ms` updates every 1s, shows percentiles from the last 50 frames.
- Recent-events strip below the viewport is a mono table identical in style to the `/events` page; clicking a row jumps to `/events?event=…`.

**Empty state (no camera permission):** large mono headline `[ NO CAMERA ]` plus instruction. **Empty state (camera but no faces):** subtle scanline animation across the viewport plus mono `[ scanning… 0 tracks ]`.

### `/events` — Audit trail

Full-width mono table, identical row construction to `/poi` but more columns: `TS · OP · CAM · POI · SCORE · STATUS · LATENCY · ACTIONS`. Filter rail at the top: operator (dropdown), status (chip group: pending/confirmed/dismissed), date range, POI ID. Filter chips use `border: 1px solid var(--color-border-strong); background: transparent` — when active, fg flips to `--color-accent` and `border-color: var(--color-accent)`.

Bottom of the page: CSV-export button (hazard-red ghost). Per-row `[ confirm | dismiss ]` actions visible only for `pending` rows and only if the row's operator is the current user (RLS-mirrored).

### `/sniper` — Fusion dashboard (defence hero shot)

```
┌─[ ARGUS ]──────────────────────────────────────────────────────────────────┐
│ SNIPER / FUSION                                                            │
├─────┬──────────────────────────────────────────────────────────────────────┤
│ NAV │  ┌──────────┐                                                        │
│     │  │ DROP IMG │   ARGUS / FUSION REPORT                                │
│     │  │  HERE    │   query: poi-photo.jpg · 1024x1024 · 312KB             │
│     │  │  ▔▔▔▔▔   │   started t+0     report id: 4f1a-…                    │
│     │  └──────────┘                                                        │
│     │ ──────────────────────────────────────────────────────────────────── │
│     │  ╔══════════╗  ╔══════════╗  ╔══════════╗  ╔══════════╗              │
│     │  ║ IDENTITY ║  ║ WEB PRES ║  ║   GEO    ║  ║   AUTH   ║              │
│     │  ║          ║  ║          ║  ║          ║  ║          ║              │
│     │  ║ ◼ done   ║  ║ ◧ running║  ║ ◻ pending║  ║ ◻ pending║              │
│     │  ║ t+184ms  ║  ║ t+1820ms ║  ║          ║  ║          ║              │
│     │  ║          ║  ║          ║  ║          ║  ║          ║              │
│     │  ║ TOP 3    ║  ║ urls 47  ║  ║ ……scan…… ║  ║ —        ║              │
│     │  ║ • 0.91   ║  ║ • 0.84   ║  ║          ║  ║          ║              │
│     │  ║   poi-1  ║  ║   FB     ║  ║          ║  ║          ║              │
│     │  ║ • 0.62   ║  ║ • 0.71   ║  ║          ║  ║          ║              │
│     │  ║   poi-3  ║  ║   IG     ║  ║          ║  ║          ║              │
│     │  ║          ║  ║ • 0.53   ║  ║          ║  ║          ║              │
│     │  ╚══════════╝  ║   wiki   ║  ╚══════════╝  ╚══════════╝              │
│     │                ╚══════════╝                                          │
│     │ ──────────────────────────────────────────────────────────────────── │
│     │  CONSOLIDATED MATCHES                                                │
│     │  POI-0001 vance   ID 0.91 · WEB 0.84(FB) · GEO ✓ paris · AUTH PASS  │
│     │  ─                                                  [ verify | x ]   │
│     │  POI-0003 aydın   ID 0.62 · WEB 0.71(IG) · GEO ?    · AUTH ?         │
│     │  ─                                                  [ verify | x ]   │
└─────┴──────────────────────────────────────────────────────────────────────┘
```

**Anchor rules — this is the page Tag 14's defence demo lingers on:**

- 4-column grid (`grid-template-columns: repeat(4, 1fr); gap: 1px;` against `--color-border`). Each column is a layer, ordered identity → web → geo → auth.
- Column header: monospace uppercase layer name, then a 16×16 status square `■` (`--color-status-{pending,running,done,fail}`), then `t+Xms` ticker in `tabular-nums` updating every 100ms while running.
- During `running` state, a 1-pixel **scan line** sweeps top→bottom over the column (CSS `@keyframes` on a pseudo-element with `clip-path: inset(var(--scan-y) 0 calc(100% - var(--scan-y) - 1px) 0)` — animated only via transform/opacity, never layout properties). Freezes when `done`.
- **No spinners anywhere on the page.** Latency tickers are the only progress indicator. This is non-negotiable per the manifesto.
- Layer-result body: per-layer-specific render (Identity = top-3 list with score+poi-id; Web Presence = url thumbs grid with score+source-name; Geographic = mini map placeholder + coords; Authenticity = pass/fail per match).
- Failure: column body shows `[ failed ]` plus error name in mono, hazard-red. Other columns continue.
- Below the 4-column grid: **Consolidated Matches** table — one row per match (POI-0001 in this example), each cell shows the per-layer signal contribution. Hover surfaces a Radix `<HoverCard>` with raw layer payloads.

**Empty state (no upload yet):** dropzone is the entire content area, ASCII-bracketed `[ DROP FACE PHOTO HERE — JPG/PNG, ≤10MB ]`. No example, no illustration.

---

## §4 Public surface specs (Phase 2 — `minimalist-ui`)

Two pages live before `/login`, both in the **Premium Utilitarian
Minimalism** archetype (paper substrate, generous vertical whitespace,
editorial serif hero, monospace meta).

### `/` — Landing (case-study posture)

Single-column scroll, content constrained to `--layout-max-public`
(`72rem`). Section padding `--space-10` to `--space-12` between blocks.
Background is `--paper-100`; cards (where they exist) are `--paper-0` with
`1px solid --paper-300` (no shadow).

**Sections, top to bottom:**

1. **Hero (full viewport).** Newsreader serif headline at `--text-3xl`
   scaled via `clamp(2.074rem, 4.5vw, 4rem)`, tracking `-0.03em`,
   line-height `1.1`. Subhead in `--font-sans`, body weight, `--text-lg`,
   muted `--mono-700`, max width `52ch`. CTA button `[ Sign in ]` sized
   `--text-base`, `--space-3` × `--space-5` padding, `--radius-2`,
   `--mono-900` bg, `--paper-0` fg, `:active scale(0.97)`.
2. **What it does (3-col-of-equal-cards is BANNED — use 2-col zig-zag).**
   Two paired sections: Sniper Mode visual on left, prose on right; then
   reversed for Patrol Mode.
3. **Architecture** — single full-width Newsreader caption above an SVG
   diagram of the four-layer fusion topology (taken from `ARCHITECTURE.md`).
4. **Defence thesis** — pulled-quote rendering of the manifesto's bold line
   in Newsreader italic, `--text-2xl`, max width `45ch`, hairline
   `border-left: 2px solid var(--mono-900)` on the left edge.
5. **Footer** — single mono row: `ARGUS / 0.1.0 · UNI PROJECT · 2026 ·
github`. No newsletter, no social grid.

### `/login` — Custom Supabase auth form

- Centred at `min-height: 100dvh; display: grid; place-items: center`.
- Card: `--paper-0` background, `1px solid --paper-300`, `--radius-2`,
  `--space-7` internal padding, max-width `24rem`.
- Form: label-above-input, `--space-2` between label-input pairs,
  `--space-5` between fields, `--space-6` before submit button.
- Input: `1px solid --paper-300`, `--radius-1`, `--space-3` padding,
  `:focus-visible` switches border to `--mono-900` (no glow).
- Submit: identical button as landing CTA, full-width.
- Error state: hairline-thin `--signal-red-700` text below the affected
  field (`--text-sm`). No banner, no toast.
- Below the card: mono `← argus / 0.1.0` link back to `/`.
- **No Supabase Auth UI component.** Direct `supabase.auth.signInWithPassword({...})` call, error mapped to user-facing message.

---

## §5 Component patterns (Phase 3 — Tag 12, `frontend-design` + `ui-ux-pro-max`)

To be filled in Tag 12 with the per-component pairs (`Button.tsx` +
`Button.module.css`). For now this section reserves space and lists the
intended component inventory:

- `Button` — variants: primary, secondary, ghost, destructive (cva)
- `Card` — variants: brutalist (square, hairline border), minimalist (radius-2, soft border)
- `Dialog` — Radix-headless, content slot is brutalist on operator pages, minimalist on public
- `DropdownMenu` — Radix-headless
- `Tabs` — Radix-headless
- `LatencyBadge` — feature component, mono `tabular-nums`, color reflects p50 vs SLO
- `StatusSquare` — 16×16 `■` glyph, color from `--color-status-*`
- `BboxOverlay` — feature component, layered absolute positions, animated only via `transform`
- `KbdChip` — `<kbd>` styled per minimalist-ui §5

---

## §6 Polish (Phase 4 — Tag 14, `impeccable`)

To be filled Tag 14: WCAG AA/AAA verification, tab-order audit, focus-style
audit, `prefers-reduced-motion` regression test, font self-hosting via
`@font-face` on bundled woff2 files, Bunny Fonts CDN dependency removed.

---

## Skill log (per plan §6 commit-message requirement)

| Phase | Date       | Skill applied           | Output landing                                  |
| ----- | ---------- | ----------------------- | ----------------------------------------------- |
| 1     | 2026-04-25 | design-taste-frontend   | DESIGN.md §1 manifesto                          |
| 1     | 2026-04-25 | emil-design-eng         | tokens.css + reset.css + app.css + DESIGN.md §2 |
| 2     | 2026-04-25 | industrial-brutalist-ui | DESIGN.md §3 (5 operator pages)                 |
| 2     | 2026-04-25 | minimalist-ui           | DESIGN.md §4 (2 public pages)                   |
| 3     | Tag 12     | frontend-design         | client/src/components/ui/\*                     |
| 3     | Tag 12     | ui-ux-pro-max           | micro-interactions across all pages             |
| 4     | Tag 14     | impeccable              | a11y + font self-hosting                        |
