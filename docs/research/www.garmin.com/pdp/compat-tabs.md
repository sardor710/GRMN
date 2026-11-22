# garmin.com Accessories / Compatible Devices tabs (re-checked 2026-11-22)

Measured with Playwright (computed styles), en-US, 1440 and 390 px. Screenshots are in `compat/`.

## Tab bar
The order is Overview · Specs · In the Box · Maps · Accessories · Compatible Devices. Only tabs that have content are shown. Ours already used this order (`src/components/ProductTabs.tsx` `TABS`).

## Compatible Devices (QuickFit® 22 Watch Bands, /p/553030/)
- **Layout:** a flat alphabetical grid of device cards, with no grouping and no filters. 4 columns at 1440 (cards 241 px wide, about 20 px gap), 1 column at 390 (card 334 px wide).
- **Card:**
  - two-layer raised shadow `rgba(77,77,77,.08) 0 1px 1px, rgba(77,77,77,.16) 0 1px 3px 1px`
  - radius 0, padding `16px 28px 18.2px`
  - image 130×130, centred
- **Name:** H4, Oswald 20/25 with 0.8 px tracking, 400 weight, black, centred (16 px at 390). The wording is garmin's "<device> – <size/edition>", e.g. "fēnix® 8 – 47 mm, AMOLED".
- **Before → now (ours):**
  - image 110 → 130
  - name Roboto 16/24 → Oswald 20/25 (16 on phones)
  - padding 16 → 16/28/18
  - phones 2 → 1 column
  - shadow card → raised

## Accessories (fēnix® 9 – 47 mm, /p/2021193/)
- **Side list (286 px):** Apps, Service Plans, Bands, Dive Bands, Marq Straps & Bracelets, Cables & Chargers, Cycling Accessories, Heart Rate Monitors, Replacement Parts, Sensors, View All.
  - links are Roboto 15/22.5, 500 weight, normal case
  - padding `9.75px 0 9.75px 37.5px`
  - the chosen group is a full-width black row with white text
- **Default view (no group chosen):** a 3-column grid of group cards. Each card has an image and the group name in Oswald 20/25, with a raised shadow, 14 px padding and a 130 px image.
- **Group view:** a 3-column grid of accessory cards (223 px wide). Each card has a 130 px image, the name in Oswald 20/25 (up to 3 lines) and the price in Roboto 14/21 400 ("$49.99 USD").
- **Before → now (ours):**
  - the tab opened on the first group, now it opens on group cards
  - the side list was 14 px semibold uppercase with 16 px padding, now 15/22.5 500 normal case with 37.5 px left padding
  - the price was the bold card price, now inline 14 px
  - the shadow was card, now raised

## Data
Both tabs read `product_compatibility` plus the live type links in `product_compatibility_types` (migration 0028). A watch linked to "QuickFit 22 mm" lists every published band filed under that type, and each band lists the watch.
