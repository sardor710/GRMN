---
name: clone-website
description: "Reverse-engineer and clone any website as a pixel-perfect replica"
invokable: true
---
<!-- AUTO-GENERATED from .claude/skills/clone-website/SKILL.md — do not edit directly.
     Run `node scripts/sync-skills.mjs` to regenerate. -->


# Clone Website

Rebuild **$ARGUMENTS** as pixel-perfect Next.js 16 clones (App Router, React 19, Tailwind v4, shadcn/ui; follow `AGENTS.md`). Several URLs: process each independently, artifacts isolated per host (`docs/research/<host>/`, `docs/design-references/<host>/`).

You are the foreman: measure a section, write its spec, hand it to a builder in a worktree, move on to the next section while it builds. Extraction is done by scripts that return compact JSON, never by eyeballing screenshots or dumping DOM/HTML into context.

**Defaults** (user instructions override): pixel-perfect, pure emulation, real content and assets, responsive, mock data for dynamic parts. Out of scope: backend, auth, real-time, SEO, a11y audit.

## Toolkit (`scripts/clone/`)

All commands run headless Chrome over CDP, write full JSON to `docs/research/<host>/`, screenshots to `docs/design-references/<host>/`, and print only a short summary. Read the JSON file only for the keys you need.

| Command | Gives you |
|---|---|
| `node scripts/clone/inspect.mjs recon <url> --w=1440,390` | topology (sections in order, sticky/fixed), layers (z-index), tokens (colors, type scale incl. font-feature-settings, radii, shadows, spacing, `:root` vars), fonts + `@font-face` files/weights/unicode-range, CSS breakpoints, `@keyframes`, libs (Lenis, GSAP, Swiper…), IntersectionObserver/scroll-listener hooks, assets (img currentSrc/srcset/sizes/`<picture>`, backgrounds incl. pseudo-elements, videos, icons, meta), one screenshot per section |
| `inspect.mjs section <url> <sel> [name] --w=1440,768,390` | style tree: only non-default computed values (inherited values omitted when equal to parent), box rect `r:[x,y,w,h]`, own text, key attrs, `::before/::after`, identical siblings collapsed into `rep`, deduped SVGs, running animations; clipped screenshot per width |
| `inspect.mjs states <url> <sel>` | for every control in `<sel>`: diffs under forced `:hover`, `:focus-visible`, `:active`, plus real-pointer hover diffs (JS menus/tooltips), and its `transition` |
| `inspect.mjs scroll <url> <sel> [0,120,600]` | style diff of `<sel>` subtree at each scroll y (sticky headers, scroll-triggered classes) |
| `inspect.mjs responsive <url> <sel>` | layout-only diffs at 1440/1024/768/390 + CSS breakpoints → exact switch points |
| `inspect.mjs shot <url> <sel\|page> [name]` | clipped screenshot only |
| `node scripts/clone/download.mjs docs/research/<host>/recon.json` | downloads images (largest srcset candidate; `--all-srcset` for all), backgrounds, videos/posters, woff2 fonts, icons/OG → `public/`; writes `assets-map.json` (remote → local path) |
| `node scripts/clone/diff.mjs <targetUrl> <cloneUrl> [sel] [--clone-sel=..] --w=1440,390` | pixel mismatch %, height delta, hot y-bands, diff PNG, and a text-anchored style diff (font family/size/weight/line-height/letter-spacing/color/position per text string). Exit 2 if mismatch > `--max` (3%) |

Flags: `--w=` widths, `--settle=ms` wait after load, `--headed` if a bot wall blocks headless, `--depth=` tree depth, `--out=` dir.
Fallback when Chrome automation is impossible: paste `scripts/clone/extract.js` into the browser-MCP JS tool once per page load, then call `JSON.stringify(__cx.section('<sel>'))`, `__cx.tokens()`, `__cx.cssRules()` (same-origin sheets only), etc.
Use the browser MCP only for what scripts can't judge: watching time-driven motion, carousels, video, and confirming feel.

## Non-negotiables

1. **Measured, never guessed.** Every value in a spec comes from the JSON. `text-lg` is wrong if the site's line-height is 24px.
2. **Interaction model first.** For each interactive section decide: static, click, hover, scroll, or time driven. Run `scroll` before clicking anything; IO hooks in recon plus a scroll diff mean scroll-driven. Building click tabs for a scroll-driven section is a rewrite.
3. **Every state.** Hover/focus/active (`states`), scrolled (`scroll`), each tab/slide (click via MCP, then `section` again or `__cx.section`), each breakpoint (`responsive`).
4. **Spec before dispatch.** One spec file per builder in `docs/research/<host>/components/<Name>.spec.md`.
5. **Small tasks.** A spec over ~120 lines, or a section with 3+ distinct sub-components → split it (one builder per sub-component, then a wrapper builder).
6. **Real assets, all layers.** Enumerate every `<img>`, background (including `::before/::after`), and video in the section's tree. Check for video, canvas, or Lottie before building a mockup of something animated.
7. **Always compiles.** Builders pass `npx tsc --noEmit`; you pass `npm run build` after every merge.

## Phase 0: Pre-flight

1. Validate each URL; `npm run build` must pass on the scaffold.
2. Run `recon` (1440, 390). If it is blocked or returns an empty topology, retry with `--headed`, then fall back to browser MCP + `extract.js`.

## Phase 1: Recon → two short docs

From the recon summary and JSON write:
- `PAGE_TOPOLOGY.md`: sections in order as `s0 <sel> | name | static/click/scroll/time | sticky? z | height`, plus page-level layout (scroll container, overlays, z-index order from `layers`).
- `BEHAVIORS.md`: one line per behavior: trigger → change → timing. Sources: `scroll` on the header and any sticky/fixed layer, `hooks.io` (rootMargin/threshold → reveal animations), `animations` and `keyframes`, `libs` (Lenis: replicate smooth scroll), auto-advancing content (watch 10s in MCP).

## Phase 2: Foundation (you, sequential)

Read `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` first.
1. `download.mjs` → assets and fonts in `public/`.
2. **Fonts:** `next/font/local` with each downloaded face's exact `weight`/`style` (variable range as `"400 700"`), `display` from `@font-face`, and a CSS variable. Keep subsetting: one face per `unicode-range` file actually used. Apply recorded `font-feature-settings`/`font-variation-settings`, `-webkit-font-smoothing`, and `text-rendering` globally or per element as measured. Google-hosted → `next/font/google` with exact weights.
3. **Tokens** in `src/app/globals.css`: map measured colors to shadcn variables in `:root` (and `.dark` if themed), add the type scale, radii, shadows and the site's `:root` vars, and expose them via `@theme inline`. Copy the `@keyframes` verbatim. Add global scroll behavior (Lenis, `scroll-behavior`, snap).
4. **Icons:** convert the deduped `svgs` from section JSONs into named components in `src/components/icons.tsx` (name by function; `currentColor` where the source uses it; keep `viewBox`).
5. Content types in `src/types/`. `npm run build`.

## Phase 3: Per section — extract → spec → dispatch (top to bottom, don't wait)

**Extract** (only what the section needs):
```
inspect.mjs section <url> "<sel>" <name> --w=1440,768,390
inspect.mjs states <url> "<sel>"           # if it has controls
inspect.mjs scroll <url> "<sel>"           # if sticky/fixed or BEHAVIORS lists a scroll trigger
inspect.mjs responsive <url> "<sel>"       # if the 768/390 trees differ structurally
```
For click/time states: trigger each via MCP, re-run `__cx.section` and record per-state content.

**Spec** (`components/<Name>.spec.md`). Keep it terse and fill every heading, `N/A` only when truly none:
```markdown
# <Name>  → src/components/<Name>.tsx
Shot: docs/design-references/<host>/<name>-{1440,768,390}.png
Model: static | click | hover | scroll | time — <mechanism, e.g. IO rootMargin "-30% 0px">
## Structure
<indented tree: tag.role — child …, naming sub-components>
## Styles (exact; px→Tailwind only when identical, else arbitrary values)
<element>: <prop: value; …>   ← copy from section JSON `css`; r gives box size
## States
<element> hover: bg #0a7cff→#005bd1 · transition background-color 200ms cubic-bezier(.4,0,.2,1)
<element> focus-visible: outline 2px solid #000, offset 2px
scrolled (y>50): box-shadow none→0 2px 8px rgba(0,0,0,.2) · 300ms ease
## Responsive
≤768 (max-width:768px): grid 3→1 cols; h2 40/60→28/42
## Assets
img: /images/<host>/hero.jpg (srcset 1x/2x → next/image sizes="100vw"), icons: CartIcon
## Content (verbatim, per state)
```

**Dispatch** a builder agent (`frontend-developer` if installed, else general-purpose) in its own worktree. Brief = target file + spec path + screenshot paths + this contract:
> Read only the spec and screenshots listed. Build `<file>` as a named export, TypeScript strict, Tailwind classes only (arbitrary values like `text-[17px] leading-[24px] tracking-[-0.2px]` when no exact token exists; never round), `cn()` from `@/lib/utils`, icons from `@/components/icons`, assets from the listed `/public` paths. Reproduce every listed state with the exact transition property, duration, easing and delay; `motion-safe:` only if the source respects reduced motion. Use mobile-first breakpoints at the spec's exact px (`max-[768px]:`/`min-[1024px]:` arbitrary variants when they aren't Tailwind defaults). Keep z-index and sticky offsets as specified. `<img>` with `srcset/sizes` or `next/image` with matching `sizes`; preserve `object-fit/position`. Finish with `npx tsc --noEmit` passing, commit, and report deviations.

Then extract the next section immediately.

**Merge** finished worktrees as they land, resolve conflicts with your full context, `npm run build` after each.

## Phase 4: Assembly

Wire sections into `src/app/page.tsx` per `PAGE_TOPOLOGY.md`: page-level layout, overlay/sticky z-order, page behaviors (smooth scroll, scroll-driven reveals, theme switches). `npm run build`.

## Phase 5: Verify by diff, not by eye

Run `npm run dev`, then per section (and `body`):
```
node scripts/clone/diff.mjs <targetUrl> http://localhost:3000 "<sel>" --clone-sel="<cloneSel>" --w=1440,768,390
```
Fix in this order: height delta and missing text (structure) → text style issues (font, size, line-height, tracking, color) → hot bands (open that crop of the diff PNG only). If a spec value was wrong, re-extract and update the spec. Loop until each section is ≤3% mismatch (live/rotating content excepted, noted) and text issues are 0. Then check behaviors from `BEHAVIORS.md` in the browser (hover, scroll triggers, tabs, carousels, smooth scroll). Optionally hand the diff reports to an `evidence-collector` agent for an independent pass.

## Gotchas

- Lazy/animated content: scripts set `loading=eager` and diff freezes motion. Raise `--settle` for slow hero media.
- Sticky/fixed elements show in many section shots. Diff them separately and clip around them.
- Pseudo-element backgrounds and overlay `<img>` layers are the most-missed assets.
- Equal grid tracks print as `repeat(n, 1fr)`. Confirm fixed vs fluid in the 1024 vs 1440 `responsive` diff.
- `rep` entries share the first sibling's styles. Only their text/href/src differ.
- Bot walls (Akamai etc.): `--headed`, or the MCP fallback. Never solve CAPTCHAs.

## Completion report

Sections built, components and specs (counts should match), assets downloaded (images/videos/fonts/SVGs), `npm run build` result, the per-section diff table (mismatch % at each width and text issues), and known gaps.
