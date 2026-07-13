# MARQ Minisite — Component Specs (as built)

Route: `src/app/minisite/marq/page.tsx`. Order top→bottom. All components under `src/components/marq/`.
Shared: `useReveal` hook (IntersectionObserver fade-up), tokens in `globals.css` (`--marq-bg/nav/red/green/gold`), `.marq-reveal`, `.marq-display`, `@keyframes marq-progress-fill`.

| Component | File | Interaction | Key assets |
|-----------|------|-------------|-----------|
| MarqSubNav | MarqSubNav.tsx | sticky top-0, bg #141414 | — |
| MarqHero | MarqHero.tsx | static, layered | kv-bg, cloud, kv-mountain, product-name.png (title), marq-collection.png (3 watches) |
| MarqTextIntro | MarqTextIntro.tsx | reveal fade-up | stone-bg.jpg |
| MarqScrollVideo (fire) | MarqScrollVideo.tsx | IntersectionObserver → play video on enter | video/fire.mp4 |
| MarqDamascusHero | MarqDamascusHero.tsx | static, reveal | damascus-bg.jpg (watch baked in), damascus-bg-spark(-2).png overlays |
| MarqLifestyleCarousel | MarqLifestyleCarousel.tsx | **auto-advance 6s** + arrows + progress bar; video bg crossfade + transparent watch overlay | video/*.mp4, marq2-product-*.jpg (poster), marq-spec-*.png (watch) |
| MarqQuality | MarqQuality.tsx | static, reveal | overview-bg-01.jpg |
| MarqDesign | MarqDesign.tsx | static, reveal | material-bg-01/02/03 + stone-bg tiles, marq-spec-aviator.png (center) |
| MarqScrollVideo (craft) | MarqScrollVideo.tsx | play on enter + overlay text + Watch Now btn | video/damascus.mp4 |
| MarqMaterials | MarqMaterials.tsx | 3 stacked panels, reveal each | material-bg-0X.jpg + material-watch-0X.png |
| MarqFeatureCallouts | MarqFeatureCallouts.tsx | static | — (Sapphire / AMOLED) |
| MarqBands | MarqBands.tsx | static, reveal | marq-bands-bg.jpg (3 watches + straps) + overlaid labels |
| MarqLegacy | MarqLegacy.tsx | static, reveal, bordered box | legacy.jpg |
| MarqProductCarousel | MarqProductCarousel.tsx | horizontal scroll + arrows | marq-spec-bg.jpg + marq-spec-*.png cards; underline red/green/gold by edition |
| MarqSignup | MarqSignup.tsx | static, white section, form | — |

## Asset-role clarifications (learned during QA)
- `marq2-product-*.jpg` = **lifestyle scene stills** (person), NOT watches. Used as carousel video posters.
- `marq-spec-*.png` = **transparent front-facing watch renders**. Used in lifestyle carousel (left overlay) and product carousel cards.
- `material-watch-0X.png` = angled watch renders for the 3 material panels.
- `damascus-bg.jpg` = the Damascus watch on its glowing plinth (full composite) — section 4 needs no separate watch image.
- Edition accents: Damascus = red `--marq-red`, Carbon = green `--marq-green`, Titanium = gold `--marq-gold`.

## Data
`src/lib/marq.ts` — `lifestyleSlides`, `materialPanels`, `productCards`, `accentColor`. Types in `src/types/marq.ts`.

## Known minor deltas vs original
- Scroll-play videos play on viewport enter (IntersectionObserver) rather than being scroll-scrubbed via a fixed layer (clips are ~1.5–3s; visually equivalent).
- Mobile layout uses Tailwind `md:` breakpoints (stack → single column); desktop 1440 verified pixel-close, mobile not screenshot-verified due to tooling.
- `sapphire.jpg` / `overview-bg-02.jpg` downloaded but not required by the built layout.
