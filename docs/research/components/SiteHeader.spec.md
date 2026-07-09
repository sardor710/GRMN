# SiteHeader Specification

- **Target:** `src/components/SiteHeader.tsx`
- **Interaction model:** static bar (NOT sticky, scrolls away) + hover mega-menu dropdowns

## Layout
- Height 64px, bg white, z-index high. Full width. Side padding ~20px (logo) / ~24px (icons).
- Left: GARMIN wordmark (black), height ~18-20px, width auto (~130px).
- Center: nav links — SMARTWATCHES · SPORTS & FITNESS · OUTDOOR RECREATION · AUTO & HOME · MARINE · AVIATION · SALE
  - Roboto, 13px, weight 400, uppercase, letter-spacing 0.64px, color #000, gap ~ 22px.
- Right cluster: "Support" (with ? circle icon) · search icon · account icon · cart icon w/ badge "0".
  - Support label 13px. Icons ~20px, black stroke.

## Behavior
- Hover a nav item → white dropdown panel drops below header (full-content-width, border-top hairline, subtle shadow), listing sub-links in columns. Panel hides on mouse leave.
- Nav link hover: subtle color/underline change.
- SALE has no dropdown.

## Responsive
- Desktop ≥1024: full nav visible.
- <1024: nav collapses to hamburger (mobile menu). Logo left, hamburger + icons right.
