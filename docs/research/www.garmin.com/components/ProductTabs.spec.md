# ProductTabs + Specs table spec (garmin.com PDP)

Live: https://www.garmin.com/en-US/p/1462801/. Sources: `pdp/section-pdp-tabs-1440.json`, `pdp/states-pdp-tabs.json`,
`pdp/computed-pdp-1440.json`, `pdp/computed-specs-1440.json` (after clicking Specs). Shot: `garmin-compare/pdp-tabs-1440.png`.
Model: click (tabs swap sections; ≥1024). <1024: every section is an accordion row.

## Tab bar (≥1024)
- `nav#js__app__tabs__nav`: full width, bg #E5E5E5, height 81px, Roboto 14px/21px. `ul` `padding:0 56px`,
  `text-align:center` (items centred as a group).
- Tab link: 14px / 21px, weight 600, uppercase, `letter-spacing:.28px`, #000, `padding:28px 14px`, li adds 16px each side.
- Active: `border-bottom:4px solid #000` (height 81 vs 77 inactive). Hover on inactive: same 4px #000 bottom border.
  Active `:active` colour #333333. Transition `color .2s`.
- Tab names and order (Garmin): `Overview`, `Specs`, `In the Box`, `Video Gallery`, `Maps`, `Accessories`,
  `Compatible Devices` (only tabs with content are shown; en-GB omits Video Gallery).

## Accordion (<1024, measured 390)
- Each section header `div.app__tabs__content__link`: 50px tall, `padding:14px 28px`, 14px/21px weight 600 uppercase
  `letter-spacing:.28px`, `border-top:1px solid #DCDCDC`, chevron svg 14x20 on the right. Sections stacked
  (Overview, Specs, In the Box, ...).

## Specs table (Specs tab)
- Content column 711px wide at x 207 (1440). One `<table>` per group, `margin-bottom:16px`.
- Group title row `tr.title td`: bg #FFF, `border-bottom:1px solid #DDDDDD`; h3 Oswald 20px / 25px, `.8px`,
  `margin:0 0 16px`, left aligned, not uppercase: `What You'll Love`, `General`, `Sensors`, ...
- Body rows (50/50 columns, 355px each):
  - th: Roboto 12px / 18px, weight 700, uppercase, `letter-spacing:-.2px`, bg #F2F2F2, `padding:8px 16px`,
    `border-top/bottom:1px solid #D9D9D9`, left aligned. Some th contain a glossary link: colour #106FAD, underline.
  - td: Roboto 12px / 18px, weight 200 (renders as the lightest loaded Roboto), `padding:16px`, centred,
    same borders, bg #FFF.
  - Boolean yes: `td.yes` empty, `::before` 11px tall checkmark (black polygon SVG, viewBox 0 0 60 48.75) centred.
  - Row height 51px (text) / 54px (check).
- Values copy style: lower case unless a proper noun, units spaced: `Up to 15 days`, `5 ATM`, `yes (22 mm)`,
  `47 x 47 x 12.9 (mm)`.

## Ours now
Tab bar matches (bg #E5E5E5, 14/21 600 .28px, 4px border); bar is 77px with sticky top-0 (Garmin 81 active, not
sticky); our order puts Accessories before Maps. Specs table not re-measured on ours (PDP data varies).
