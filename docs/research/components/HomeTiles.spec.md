# HomeTiles specification

## Overview
- Target: `src/components/home/HomeTiles.tsx` plus CSS module.
- Interaction model: linked promo, story, and category tiles.
- Reference: `docs/design-references/garmin-home-desktop.png`.

## DOM and styles
- Three promo tiles: white 3-column row at 1215px; overall section from 1004px to 1625px, cards each about 378px wide. 1600×1600 imagery appears above white caption area. Headings 32px Oswald/40px, black, uppercase; square white/black SHOP button aligned right. Container 16px side padding; 16px gaps.
- Two story tiles: row from 1625px to 2041px, each about 584px wide and 400px tall including 8px margins. Full-bleed imagery with dark bottom overlay; 32px white Oswald heading and white rectangular LEARN MORE button over bottom.
- After stories: 64px white spacer; centered SHOP BY CATEGORY heading, 32px/40px Oswald; 16px gap before cards.
- Six category tiles: two rows of three at 1215px, from 2161px to 2993px. Each tile 378×400px with 8px margin, image cover, dark bottom overlay, 32px white Oswald heading, square white SHOP button.

## Data and assets
All exact titles, local asset paths and destinations are in `src/lib/homepage-content.ts`. All images downloaded under `public/homepage/pods/` and `public/homepage/categories/`.

## Responsive and behavior
- Collapse three-column grids to two then one below tablet/mobile breakpoints. Tiles remain linked as whole cards. Hover uses slight image scale or opacity transition; CTAs invert on hover.
