# HomeFeatured specification

## Overview
- Target: `src/components/home/HomeFeatured.tsx` plus its CSS module.
- Screenshot: `docs/design-references/garmin-home-desktop.png`.
- Interaction model: horizontal scroll carousel with next/previous controls, touch swipe, linked cards.

## DOM structure
Black 50px FEATURED bar with centered white Oswald text and downward black triangle. Scrollable single row of ten cards from `src/lib/homepage-content.ts`. First two edge-to-edge image cards with overlaid white heading, copy, SHOP button. Eight product cards have a white background, product image, centered black heading/copy, and optional red NEW/SALE starburst.

## Computed styles
- Featured total: 593.9px at 1215px width. Header: black, padding 16px 64px, 14.4px Oswald/18px, height 50px.
- Carousel body: white, height 544px. Cards: 323px wide × 469px tall, margin 43px 12px 32px, gray shadow `rgb(217,217,217) 0px 2px 3px 1px`.
- Edge card image covers entire card; overlay text centered near bottom. Heading: 32px Oswald, 40px line height, white, margin-bottom 16px. Copy: 16px Roboto, 24px line height, white. White SHOP button.
- Product cards: 32px top padding, 16px bottom padding. Product image roughly 280px square in upper region; heading 32px Oswald/40px line; description 16px Roboto/24px, centered. Badge red starburst at top left where specified.
- Next button: round white overlay near the right edge of the viewport and vertically centered in carousel.

## States and behavior
- Initially show first three cards plus part of fourth at 1215px. Arrow scrolls about one card width. Touch and trackpad horizontal scroll work. Cards link to destinations from content file; hover may lift shadow subtly.
- All ten cards and exact text/image paths are in `src/lib/homepage-content.ts`.

## Responsive
- Desktop uses cards at 323px; mobile keeps horizontal scroll and exposes roughly one card at a time. Keep same card variants and shadow.
