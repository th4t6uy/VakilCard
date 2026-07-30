# Handoff: VakilCard component

## Overview
The **VakilCard** — Vakilpedia's premium digital visiting card. A floating Liquid-Glass
pearl card fixed above a scrolling glass "chamber" (quick-action tiles, payment/UPI, about,
practice areas, office/map, social handles). Mobile-first, 412px wide, dark-first with a
light theme. This is the **one component** that should replace the legacy card renderer in
all seven locations across the app.

## About the design files
The files in this bundle are the **actual VakilCard implementation** as built in the
Vakilpedia design system — not throwaway mockups. `VakilCardApp.jsx` is a working React
component (UMD React + Babel-standalone, no build step) that composes the design-system
primitives. Your task: **port this verbatim** into `vakilpedia-code` (the Next.js app),
adapt the loose UMD/global-scope wiring to the codebase's module/import conventions, wire
it to real profile data, replace the legacy card renderer in all seven call sites with this
single component, and delete the legacy renderer.

This bundle is laid out to mirror the design-system repo so every relative path resolves —
open `ui_kits/vakilcard/index.html` or `demo.html` directly in a browser and it runs.

## Fidelity
**High-fidelity (production).** Final colors, typography, spacing, motion, and interactions.
Recreate pixel-perfectly; the only adaptation is framework wiring (globals → imports, real
data → props).

## Files in this bundle
```
ui_kits/vakilcard/
  index.html          Entry — renders <VakilCardApp/> with the default (real) profile
  demo.html           Marketing showcase — renders VakilCardApp with the demo profile
  VakilCardApp.jsx    THE component. Card + chamber + all sections + icon set + profiles
  tweaks-panel.jsx    Tweak/props panel wiring (optional in production)
styles.css            The one stylesheet to link (imports the tokens/ below)
_ds_bundle.js         Design-system primitives → window.VakilpediaDesignSystem_d7e77c
tokens/               colors · themes · typography · spacing · effects · fonts (CSS vars)
assets/logos/
  vakilpedia.png      Master mark used in nav, card footer, page footer
```

## The component (`VakilCardApp.jsx`)
- **Export:** attaches `window.VakilCardApp` (a `function VakilCardApp({ profile })`).
  In the target app, convert to a normal `export default` / named export.
- **Props:** `profile` (object, defaults to `defaultProfile`). Shape:
  ```
  { firmShort, firmSub, tagline, title, name,
    contacts: [ [iconKey, text], ... ],   // iconKey ∈ phone|mail|pin|scale
    about, practice: [string], upi, firm, address: [line1, line2] }
  ```
  `defaultProfile` (real card) and `demoProfile` (marketing) are defined at the top of the
  file and also exposed as `window.vakilDefaultProfile` / `window.vakilDemoProfile`.
- **Depends on** these design-system primitives from `window.VakilpediaDesignSystem_d7e77c`:
  `Button, Chip, ActionTile, VerifiedShield, GlassCard, Badge`. In the real app these come
  from the design-system package — import them, don't re-read the UMD global.
- **Self-contained icon set:** inline outline SVGs (1.8px stroke, lucide-style) in the
  `Icons` map — keep as-is or swap for `lucide-react` equivalents.

## Structure / sections (top → bottom)
1. **Top nav** — floating glass pill: Vakilpedia mark + wordmark, Share button, theme toggle.
2. **Floating visiting card** (`VisitingCard`) — the hero, sticky above the chamber.
   Credit-card proportions, pointer-parallax tilt (±4/5°), double-tap "save to device"
   flash, pearl/iridescent glass fill. Shrinks (`compact`) when the chamber scrolls > 40px.
3. **Scrolling chamber** (`.vp-scroll`):
   - Premium upsell strip (free tier → branded card)
   - **Payment** section — UPI id + copy, Pay Now, QR block, "No payment goes through Vakilpedia."
   - **Connect** — 4×2 grid of `ActionTile`s (Call, WhatsApp, Book, Pay, Directions, Email,
     Website, Save Contact) + toggleable social handles.
   - **About**, **Practice Areas** (serif italic chips), **Office** (address + map tile).
   - Footer — powered-by Vakilpedia + social icons.

## Interactions & behavior
- **Card tilt:** `onMouseMove` maps pointer offset → `rotateX/Y`; resets on leave.
  Transition `var(--dur-slow) var(--ease-glass)`.
- **Save flash:** double-tap card → 550ms white flash + "Saved to your device" caption.
- **Compact card:** chamber `scrollTop > 40` sets `compact` → card scales to 0.965 and the
  hint caption fades out; spacer height animates 318→272px.
- **Auto-hiding scrollbar:** `.is-scrolling` class added on scroll, removed 800ms after.
- **UPI copy:** click → 1.2s "copied" state (icon turns `--success`).
- **Social handles:** tap toggles on/off (opacity + accent color).
- **Theme toggle:** flips `document.documentElement.dataset.theme` dark↔light. The pearl
  card stays constant across themes by design; the OS beneath flips.
- Honor `prefers-reduced-motion` — the ambient glows freeze (already handled in the page CSS).

## Design tokens
All values are CSS custom properties in `tokens/` (linked via `styles.css`) — read them,
don't hardcode. Key ones the component uses:
- **Accents:** violet `#635BFF` (`--violet-400`), gold (`--gold-300/500`), plus semantic
  `--success`, `--info`.
- **Surfaces/glass:** `--bg-void`, `--glass-frost`, `--glass-thick`, `--glass-tint-violet/gold`,
  `--hairline`, `--hairline-strong`, `--inset-edge`, `--surface-3`, `--navy-700`.
- **Text:** `--text-hi`, `--text-mid`, `--text-low`, `--text-dim`.
- **Type:** `--font-sans` (Inter Tight), `--font-accent` (Instrument Serif italic),
  `--font-mono` (JetBrains Mono).
- **Radii:** `--r-xl`, `--r-pill`. **Motion:** `--dur-base/slow`, `--ease-out`, `--ease-glass`.
- The card's pearl fill and shadows are set inline in `VisitingCard` (intentionally fixed,
  not theme-driven) — copy those literal values verbatim.

## Ambient environment (page CSS, not the component)
The drifting `.vp-glow` color blobs and `.vp-scroll` scrollbar styles live in the page
`<style>` (see `index.html`). Move them into the host page/layout, not the component.

## Assets
- `assets/logos/vakilpedia.png` — the only image the component loads (nav, card footer,
  footer). Referenced as `../../assets/logos/vakilpedia.png` from the jsx.
- The lawyer photo (DP), QR, and map are placeholders drawn in SVG/CSS — wire to real
  data/services in production.

## Notes for the developer
- No build step is required to *view* this bundle — it uses UMD React + Babel-standalone.
  In `vakilpedia-code` (Next.js) drop that and use normal imports + JSX compilation.
- Fonts load from Google Fonts CDN via `tokens/fonts.css`; swap for self-hosted `.woff2`
  if you need offline/air-gapped rendering.
- Use the design-system package's `Button/GlassCard/ActionTile/VerifiedShield/Badge` rather
  than re-reading the UMD `window` global.
