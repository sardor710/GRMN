# HomeHeader specification

## Overview
- Target: `src/components/home/HomeHeader.tsx` plus its CSS module.
- Screenshot: `docs/design-references/garmin-home-desktop.png`.
- Interaction model: hover/click navigation, click search and mobile drawer.

## DOM structure
White full-width 65px header. Garmin wordmark at left. Center navigation: Smartwatches, Sports & Fitness, Outdoor Recreation, Auto & Home, Marine, Aviation, Sale. Right: Help, search icon, account icon, cart icon. Build homepage-only; use existing icon components and local account/cart links. Existing `topNav` contains menu column data.

## Computed styles
- Header background white, height 64.8px, position static at page top. Font body Superscripts-Roboto/Roboto, dark text. Desktop nav about 14px; logo about 112px wide. Horizontal gap roughly 20px. No visible border or shadow in default state.
- Category menus open below 65px header and use white panels with linked product categories. Links change color with 0.2s transition.

## States and behavior
- Hover nav category opens its menu; leave closes it. Click on nav primary link navigates. Search button opens usable search input; Escape closes. Mobile menu button opens/closes vertical menu, links close it. Account and cart navigate locally.
- Desktop at 1215px content width shows all nav labels in title case. Mobile hides desktop nav and shows menu button.

## Assets
- Use existing `GarminLogo`, `SearchIcon`, `AccountIcon`, `CartIcon`, and related icons from `src/components/icons.tsx`.
