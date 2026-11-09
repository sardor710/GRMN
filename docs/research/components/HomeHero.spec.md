# HomeHero specification

## Overview
- Target: `src/components/home/HomeHero.tsx` plus its CSS module.
- Screenshot: `docs/design-references/garmin-home-desktop.png`.
- Interaction model: time-driven horizontal carousel with click controls.

## DOM structure
Six slides, each with responsive full-width image, left caption (heading, subtitle, SHOP link). Overlaid pause/progress at top right and previous/next arrows at sides. Use `src/lib/homepage-content.ts` for all verbatim text and destinations.

## Computed styles
- Desktop observed at content width 1215px: hero starts below 64.8px header; hero width 1215px and height 345.7px (image 3200×910 ratio 3.516).
- Heading: Superscripts-Oswald/Oswald, 40px, weight 400, 50px line height, white, uppercase. Caption top varies to vertically center whole block, left 80px.
- Subtitle: Superscripts-Roboto/Roboto, 18px, 27px line height, white; 16px gap after heading.
- SHOP: transparent with 1px white border, 14px/16.1px, weight 500, padding 8px 24px, width 90px, height 34px; transition background/border/color 0.2s.
- Image: fills 100% of slide. Desktop source `-1-D.jpg`; tablet `-2-T.jpg`; mobile `-3-M.jpg` under `/homepage/hero/`.

## States and behavior
- Auto advance through six slides, wrapping to first. Previous/Next buttons switch immediately with horizontal sliding animation. Pause freezes autoplay and progress; Play resumes.
- CTA hover inverts to white background and dark text. Controls remain visible above image.
- Slide contents, sequence, and hrefs are in `src/lib/homepage-content.ts`.

## Responsive
- Live picture source breakpoints: 990px and 640px. Use `<picture>` or responsive CSS/markup so correct source loads. At mobile, heading/caption remain over image with smaller type and inset; controls stay accessible.
