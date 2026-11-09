# HomeFooter specification

## Overview
- Target: `src/components/home/HomeFooter.tsx` and its CSS module.
- Reference: `docs/design-references/garmin-home-desktop.png`.
- Interaction model: links and icon hover.

## DOM and computed styles
- Full-width black footer, observed 501px high at 1215px content width.
- Four link columns: CUSTOMER SERVICE, COMPANY, PLATFORMS, FOR BUSINESS. Headings use Oswald at about 16px/20px. Links use Roboto at 13px/24px in muted white. Site content starts around 24px from top.
- Location/social row sits near bottom of main footer, then a 54px legal bar with 1px gray top rule, copyright left and five legal links right.
- White icon links for Facebook, X, YouTube, Pinterest, Instagram; roughly 20px icons.

## Content and behavior
- Exact column labels already exist in `src/lib/content.ts`. Homepage-only component maps inactive `#` destinations to the live reference URLs. Hover links underline or brighten with 0.2s transition.
- At mobile width, columns stack and links use two columns where space permits; legal row wraps.
