# Garmin.com/en-US — Page Topology

Target: https://www.garmin.com/en-US/ — Garmin homepage. Doc height ~4004px @ 1440.
Framework: Garmin custom web components (`g-hero-rotator`, `g-heading`, `g-spacer`, `authorable-email-signup`). Single `<main>` with 8 children + `<header>` + `<footer>`.

## Section order (top → bottom)

| # | Name | Component | Top(px) | H(px) | Interaction |
|---|------|-----------|---------|-------|-------------|
| 0 | **Header / Nav** | `SiteHeader` | 0 | 64 | Static bar (NOT sticky — scrolls away). Hover mega-menu dropdowns. |
| 1 | **Hero Rotator** | `HeroRotator` | 64 | 542 | **Time-driven carousel**, 6 slides, auto-advance + prev/next arrows + pause btn |
| 2 | **Featured carousel** | `FeaturedCarousel` | 606 | 664 | Sticky "FEATURED" label + horizontal-scroll product cards w/ NEW/SALE starburst badges + right arrow |
| 3 | **Promo Pods grid** | `PromoPods` | 1270 | 621 | Static: 3 equal cards (image+title+SHOP) then 2 half-width overlay pods |
| 4 | **Garmin Health pods** | (part of #3 area) | 1891 | 416 | Static (2 half pods: Health, Stories) — see note |
| 5 | Spacer | — | 2307 | 64 | white spacer |
| 6 | **Shop By Category heading** | `SectionHeading` | 2371 | 40 | Static centered h2 |
| 7 | **Category grid** | `CategoryGrid` | 2427 | 832 | Static: 6 image tiles (2×3), title + SHOP overlaid bottom-left |
| 8 | **Email signup** | `EmailSignup` | 3259 | 245 | Static form: heading + input + arrow btn + subtext |
| 9 | **Footer** | `SiteFooter` | 3504 | 501 | Static: 4 link columns + social + legal bar |

Note: The "Promo Pods grid" (#3) visually is: row of 3 equal cards (Forerunner / Fēnix 8 / Smartwatches for Kids, each image on top + title + SHOP button below) followed by a row of 2 half-width image-overlay pods (Garmin Health, Stories). Build as one `PromoPods` section.

## Page layout
- Full-width sections, white background. Content max-width container ~1440 with side padding.
- z-index: header 99999. Hero arrows/pause overlay hero.
- No smooth-scroll library detected (no `.lenis`). Native scroll.
- Header scrolls away (position: relative).
