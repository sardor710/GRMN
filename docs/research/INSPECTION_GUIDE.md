# Website Inspection Guide

Measure with scripts, not screenshots. `scripts/clone/inspect.mjs` (see `/clone-website`) returns compact JSON for each item below. Use screenshots per section, only to confirm.

| Capture | Source |
|---|---|
| Colors, type scale (family/size/weight/line-height/tracking/features), radii, shadows, spacing, `:root` vars | `recon` → `tokens` |
| Font files, weights, styles, unicode-range subsets, font-display | `recon` → `css.fontFaces`, `fonts` |
| Breakpoints, `@keyframes` | `recon` → `css` |
| Section order, sticky/fixed layers, z-index | `recon` → `topology`, `layers` |
| Images (srcset, sizes, `<picture>`), backgrounds incl. pseudo-elements, video, icons, meta | `recon` → `assets`; `download.mjs` |
| Scroll mechanics (IntersectionObserver, scroll listeners, smooth-scroll libs, snap) | `recon` → `hooks`, `libs`; `scroll` |
| Per-element computed styles, `::before/::after`, SVGs | `section` |
| Hover, focus-visible, active, JS hover | `states` |
| Layout changes per width | `responsive` |
| Fidelity vs. the target | `diff.mjs` (pixel % + text-style diff) |

Still check by hand in a browser: time-driven motion (carousels, auto-advance), video/Lottie/canvas content, modals and menus opened by click, and loading/empty/error states.

Write the output to `docs/research/<host>/`: `PAGE_TOPOLOGY.md`, `BEHAVIORS.md`, and `components/*.spec.md`.
