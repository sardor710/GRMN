# HeroRotator Specification

- **Target:** `src/components/HeroRotator.tsx`
- **Interaction model:** TIME-DRIVEN carousel (auto-advance ~5s) + prev/next arrows + pause toggle
- **Screenshot:** design-references hero

## Layout
- Full-bleed. Desktop height ~540px (measured 542 @1440). Background image object-cover.
- Text overlay: left-aligned, vertically centered, ~72px left padding. White text.
  - Title: `.g-heading` Oswald 40px, weight 400, uppercase, letter-spacing 0.8px, white.
  - Subtitle: Roboto ~18px, white, max-width ~420px, margin-top ~8px.
  - CTA: `.g-btn .g-btn--outline-light` (transparent, 1px white border, white text, uppercase), margin-top ~20px.
- Arrows: white chevrons (‹ ›) ~40px, left/right edges, vertical center.
- Pause button: top-right (~top 20px, right 24px), white pause glyph inside a circular progress ring that animates over the slide duration.

## Slides
6 slides (see content.ts heroSlides). Background images are pre-composited (product on right side of image).

## Behavior
- Auto-advance every 5000ms. Pause halts. Prev/next arrows jump ±1 (wrap).
- Slide transition: crossfade (opacity 0.6s).

## Responsive
- Desktop ≥1024: height 540, text left.
- Tablet 768: height ~440.
- Mobile <640: height ~460, text may shift; keep left-aligned, smaller title (~30px).
