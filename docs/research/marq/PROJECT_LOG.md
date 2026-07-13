# MARQ (Gen 2) Minisite Clone — Project Log

**Target:** https://www.garmin.com.sg/minisite/marq/
**Route built:** `/minisite/marq` → `src/app/minisite/marq/page.tsx`
**Branch:** `clone/marq-minisite`
**Commit:** `15d3e0e` — "Add MARQ (Gen 2) Collection minisite clone" (68 files, 1,168 insertions)
**Status:** ✅ Complete & committed. Build passes. Not pushed.

---

## 1. Process Overview (how it was done)

Followed the `/clone-website` foreman pipeline: reconnaissance → foundation → per-section extract/spec/build → assembly → visual QA.

### Phase 1 — Reconnaissance
- Loaded Chrome MCP browser tools; navigated the live site at 1440px.
- Mapped page topology: **14 sections**, full page height ~14,711px, dark/luxury theme, Oswald + Roboto fonts (already in project).
- Ran interaction sweep: identified sticky sub-nav, `scroll-play` fixed-video sections, an auto-advancing lifestyle carousel, and an arrow-driven product carousel.
- Captured section screenshots top-to-bottom as visual references.
- Enumerated all assets (images + `<video>` + CSS backgrounds), including lazy-loaded ones found only after scrolling.
- Wrote `docs/research/marq/PAGE_TOPOLOGY.md` and `BEHAVIORS.md`.

### Phase 2 — Foundation
- Wrote `scripts/download-marq-assets.mjs`; downloaded **45 assets** (9 videos, 36 images) to `public/marq/`.
- Added MARQ tokens + utilities to `src/app/globals.css` (edition accent colors, `.marq-reveal`, `.marq-display`, `marq-progress-fill` keyframes).
- Created `src/types/marq.ts` and `src/lib/marq.ts` (content data).
- Created `src/hooks/useReveal.ts` (IntersectionObserver fade-up).

### Phase 3 — Build (14 components in `src/components/marq/`)
Built directly (single builder with full browser-verified context) rather than parallel worktree agents, to avoid merge risk and keep the shared dark design language coherent. Spec artifact: `docs/research/marq/components/MARQ-COMPONENTS.spec.md`.

### Phase 4 — Assembly
- Wired all sections in `src/app/minisite/marq/page.tsx` (SiteHeader → sticky sub-nav → 14 sections → SiteFooter).

### Phase 5 — Visual QA
- Ran dev server; compared section-by-section against the live site at 1440px.
- **Caught & fixed a key asset-mapping bug** (see §4).
- Fixed Design-section stray-watch tile; nudged lifestyle edition label below nav.
- Confirmed `npm run build` passes; `/minisite/marq` prerenders as static.

---

## 2. Completed Tasks ✅

- [x] **Phase 1** — Reconnaissance & behavior sweep (topology + behaviors docs)
- [x] **Phase 2** — Foundation (download 45 assets, tokens, types, reveal hook)
- [x] **Phase 3** — Build all 14 section components + spec doc
- [x] **Phase 4** — Assemble page route
- [x] **Phase 5** — Visual QA at desktop 1440 + fixes
- [x] Production build passes clean
- [x] Committed to branch `clone/marq-minisite` (excluded pre-existing unrelated `.txt` note)

### Components built (14)
| Component | File | Interaction |
|-----------|------|-------------|
| Sub-nav | `MarqSubNav.tsx` | sticky top-0, `#141414` |
| Hero KV | `MarqHero.tsx` | static, 4 layers (clouds/mountains/title/3 watches) |
| Quest intro | `MarqTextIntro.tsx` | reveal fade-up |
| Scroll-play (fire) | `MarqScrollVideo.tsx` | video plays on viewport enter |
| Damascus hero | `MarqDamascusHero.tsx` | watch-in-bg + spark overlays |
| Lifestyle carousel | `MarqLifestyleCarousel.tsx` | **auto-advance 6s + arrows + progress bar** |
| Quality | `MarqQuality.tsx` | static, reveal |
| Design | `MarqDesign.tsx` | 2×2 material tiles + center watch |
| Scroll-play (craft) | `MarqScrollVideo.tsx` | video + overlay + Watch Now |
| Materials | `MarqMaterials.tsx` | 3 stacked panels |
| Feature callouts | `MarqFeatureCallouts.tsx` | Sapphire / AMOLED |
| Bands | `MarqBands.tsx` | strap showcase + labels |
| Legacy | `MarqLegacy.tsx` | bordered box + photo |
| Product carousel | `MarqProductCarousel.tsx` | horizontal scroll + arrows, edition underlines |
| Signup | `MarqSignup.tsx` | white section, form |

---

## 3. To-Do / Open Items ⬜

- [ ] **Push branch & open PR** (not yet pushed to remote).
- [ ] **Mobile visual QA (390px / 768px).** Layouts use Tailwind `md:` breakpoints and should stack, but the browser tool couldn't capture a true narrow-viewport screenshot, so mobile is unverified. Verify manually and adjust:
  - fixed `h-[893px]` sections may need `min-h` / reduced height on small screens
  - lifestyle carousel (absolute watch + label) may crowd at <480px
  - Damascus hero uses `justify-between` at all widths — check text/watch overlap
- [ ] **Scroll-play fidelity (optional).** Currently plays on viewport-enter via IntersectionObserver; original scrubs a `position:fixed` full-viewport video by scroll. Clips are short (~1.5–3s) so it's visually close; upgrade to scroll-scrub if exact parity needed.
- [ ] **"Watch Now" modal (section 8).** Button is present but doesn't open the fancybox-style video lightbox the original has — wire a simple modal if desired.
- [ ] **Bands label positions** — approximated over `marq-bands-bg.jpg`; fine-tune to match original exactly.
- [ ] **Real links.** All `Learn More` / `Buy Now` hrefs are placeholders (`#`); point to real product/collection pages if integrating.
- [ ] **Unused downloaded assets** — `sapphire.jpg`, `overview-bg-02.jpg` fetched but not used by the built layout; remove or incorporate.
- [ ] **Entrance-animation polish** — reveal timing/threshold is uniform; could stagger per element to match the original's cadence.

---

## 4. Key Learnings / Gotchas

- **Asset-role mapping (caught in QA):** `marq2-product-*.jpg` are **lifestyle scene stills** (person), NOT watches. The real watch renders are transparent `marq-spec-*.png`. `damascus-bg.jpg` already contains the watch on its plinth. Initially mapped backwards; corrected in Damascus hero, lifestyle carousel, and Design center watch.
- **Edition accent colors:** Damascus = red `--marq-red`, Carbon = green `--marq-green`, Titanium = gold `--marq-gold`.
- **Lazy-loaded assets:** several images (`material-watch-0X.png`, `marq-spec-damascus.png`, `legacy.jpg`, `sapphire.jpg`, `overview-bg-02.jpg`) only appear in the DOM after scrolling — required a second asset scan.
- **Windows build gotcha:** `next build` fails with `EPERM` on `next-env.d.ts` / `.tsbuildinfo` / `.git/COMMIT_EDITMSG` when those files carry the **Hidden** attribute. Fix: `attrib -h <file>` or delete `.next`. Not a code error — saved to persistent memory.

---

## 5. Files Changed / Added

```
M  src/app/globals.css                          (MARQ tokens + utilities)
A  src/app/minisite/marq/page.tsx               (page assembly)
A  src/components/marq/*.tsx                     (14 components)
A  src/hooks/useReveal.ts
A  src/lib/marq.ts                               (content data)
A  src/types/marq.ts                             (types)
A  scripts/download-marq-assets.mjs             (asset downloader)
A  public/marq/images/* (36) , public/marq/video/* (9)
A  docs/research/marq/PAGE_TOPOLOGY.md
A  docs/research/marq/BEHAVIORS.md
A  docs/research/marq/components/MARQ-COMPONENTS.spec.md
A  docs/research/marq/PROJECT_LOG.md             (this file)
```

**Verify locally:** `npm run dev` → http://localhost:3000/minisite/marq · `npm run build` to confirm.
