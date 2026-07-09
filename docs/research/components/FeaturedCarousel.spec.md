# FeaturedCarousel Specification

- **Target:** `src/components/FeaturedCarousel.tsx`
- **Interaction model:** horizontal scroll + right arrow advance

## Layout
- Black "FEATURED" bar full-width (~48px tall), white Oswald uppercase label centered, with a small downward-pointing black triangle centered below the bar.
- Horizontal-scroll row of 10 product cards. Card ~300px wide, white, 1px #ddd border.
  - Starburst black seal badge (NEW / SALE) top-left, overlapping card corner. White Oswald uppercase text.
  - Product image (square 600×600) centered on white, ~contain.
  - Title: Oswald uppercase ~20px, centered, black.
  - Description: Roboto ~14px, centered, gray (#5b5b5b).
  - Optional fineprint (© Disney etc.) tiny centered gray.
- Circular right arrow (›) floats over right edge, vertical center of card row.

## Behavior
- Arrow scrolls the row by ~one card width. Native horizontal scroll, scrollbar hidden.

## Responsive
- Cards keep fixed width and scroll horizontally at all breakpoints.
