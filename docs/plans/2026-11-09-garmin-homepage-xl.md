# XL plan: Garmin homepage refresh

## Goal and scope
Rebuild only `/` to match the live `https://www.garmin.com/en-US/` homepage observed on 2026-11-09: typography, campaign artwork, hero carousel, featured carousel, promotional tiles, category tiles, responsive layout, and interactions. Preserve other routes and existing in-progress admin/account edits. Keep navigation useful for the local store where matching routes exist.

## Outputs and dependency order
1. **Reference and foundation (owner: root, clone-website):** inspect live page, record section specs and behaviors, download its homepage media and fonts to `public/homepage/`, add homepage-scoped font/style foundations. Acceptance: assets present and baseline build identified.
2. **Hero and header (builder agent, own worktree):** implement homepage-specific header and rotating hero against specs. Write scope: `src/components/home/HomeHeader.tsx`, `HomeHero.tsx`, related scoped CSS. Acceptance: desktop/mobile layout, pause/next/previous, menu/search, TypeScript passes.
3. **Featured carousel (builder agent, own worktree):** implement both edge-to-edge and white product card variants. Write scope: `src/components/home/HomeFeatured.tsx`, related scoped CSS. Acceptance: ten real cards, keyboard/touch scrolling, TypeScript passes.
4. **Promos, categories, signup (root or builder agent with independent scope):** implement remaining homepage sections and responsive styling from specs. Write scope: homepage-only components and styles. Acceptance: section order and dimensions match reference.
5. **Assembly and QA (root):** wire `/`, merge isolated work, compare live and local at desktop width, fix discrepancies, run lint/typecheck/build. Acceptance: only homepage behavior changes, production build passes. Mobile visual inspection is currently blocked by the browser control environment; use the exact source aspect ratios and CSS breakpoints in the meantime.

## Constraints and unknowns
- The in-app browser supports DOM inspection and screenshots but did not offer a viewport override; use a local responsive browser test if available, and record any remaining viewport verification gap.
- Current live campaign content may rotate over time. Capture observed assets and text rather than inventing content.
- Shared global components and styles serve other pages, so homepage-specific overrides/components are preferred.

## Recovery
If an asset fails to download, keep the existing local asset only where it matches visually and record the gap. If a merge breaks the build, repair the affected component before proceeding. Keep all unrelated dirty files untouched.

## Result (2026-11-09)
- Six homepage components built and integrated; 41 assets downloaded; six component specs and a desktop reference screenshot saved.
- Desktop local section heights match the live reference. At 1280px browser width, final page height is 3753px; live page at 1230px browser width was 3739px, with the 14px difference explained by the image-ratio hero width.
- Hero next/pause, featured advance, and header search were exercised in the local browser. All main images reported loaded.
- `npm run check` passed (0 lint errors; 27 warnings in existing unrelated files), including production build.
- Mobile CSS is implemented for the live 990px and 640px image breakpoints and single-column tiles, but a 390px visual screenshot was unavailable because Windows browser control could not verify the browser URL and stopped the mobile inspection.
