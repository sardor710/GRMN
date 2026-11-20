# SideFilterMenu spec (garmin.com PLP `div.product-filter` + sort)

Live: https://www.garmin.com/en-US/c/wearables-smartwatches/. Sources: `plp/section-plp-filter-{1440,390}.json`,
`plp/section-plp-sort-1440.json`, `plp/states-plp-filter.json`, `plp/states-plp-sort.json`,
`plp/css-rules-components.txt` (`.product-filter*`, `.g__checkbox*`, `.sort-dropdown`).
Shots: `garmin-compare/plp-filter-*.png`, `plp-sort-1440.png`. Model: click (groups expand/collapse).

## Desktop (≥1024)
- Panel: `width:315px; flex-shrink:0; position:sticky; top:0; height:100vh`, flex column,
  `border-right:1px solid #D9D9D9`, Roboto 14px / 21px #000. Starts flush left (x 0) right under the page title band.
- Compare toggle: black large button `Compare` 140x52 (Buttons.spec.md) in a host with `margin:16px 0 0;
  padding:0 0 16px 16px`, then a full-width `border-bottom:1px solid #D9D9D9`.
- Scroll area: `flex:1 1 auto; overflow-y:auto; overscroll-behavior:contain`; content `padding:0 16px` (282px wide).
- Group header (`.product-filter__filters__dropdown`): flex space-between centre, `padding:16px 0` (53px row),
  `cursor:pointer`. Title 14px/21px weight 700 (`Activity`). Caret icon 12x8 black; expanded = rotated 180deg
  (points up), collapsed = points down.
- Group separator: `div.border` `border-bottom:1px solid #D9D9D9` after each group.
- Option row (`.product-filter__filters__container`): flex space-between centre, `margin-bottom:16px` (22px row,
  38px pitch).
  - Checkbox label: 14px/21px weight 400, `padding:0 8px 0 21px`, full width, pointer. Selected row label weight 700.
  - Box (`::before`): 16.1px (1.15em) square, `border:2px solid #737373`, bg #FFF, radius 0, `top:.15em`.
    Checked: `border-color:#000` + black check SVG (75% size). Indeterminate: black bar. Focus: border stays #737373
    in the filter (global checkbox focus adds `box-shadow:0 0 .5em rgba(0,0,0,.4)`). Native input is the full row,
    transparent.
- Default state: first group (`Activity`) expanded, others collapsed. Group names (US smartwatches):
  `Activity`, `Level`, `Case Size`, `Battery Life in Smartwatch Mode`, `Hardware`, `Connectivity`, `Series`,
  `Other Devices`. Link-style rows (e.g. `Previous Models`) are plain #000 text links, `padding:0 8px`.
- No result count is shown anywhere on the Garmin PLP (checked 2026-11-20: no "N results" text). Do not add one
  for parity; if the owner wants it, use plain `24 products` in 14px/21px #000 left of Sort By.

## Sort (desktop, top-right of grid)
- Bar `#product-grid.product-grid__options`: flex, `justify-content:end`, `padding:0 16px`, 58px tall.
- `g-drop-down.sort-dropdown`: `width:400px`, row. Label `Sort By` 14.4px / 21.6px weight 700, `margin-right:14.4px`.
- Select wrapper `max-width:270px`; select 270x48, Roboto 16px / 18.4px, `padding:14px 48px 14px 14px`,
  `border:1px solid #D9D9D9`, radius 0, bg #FFF, `appearance:none`, `margin:4.8px 0`. Arrow svg 12x12 at `right:16px`.
- Focus/active: border #000, no outline.
- Options: `Featured Products`, `A to Z`, `Z to A`, `Price: Low to High`, `Price: High to Low`.

## Mobile (<1024, measured 390)
- Filter collapses to one bar `div.product-filter.closed.is_mobile`: `border-bottom:1px solid #D9D9D9`, inner
  `padding:14px 0` (52px), text `FILTER AND SORT` (DOM "Filter and Sort", uppercase) 16px/24px weight 700, caret 12x8
  right (`margin-right:3.5px`). Tap opens groups (all collapsed) plus the sort select inside the panel
  (`.product-filter__sort` label 14px, `padding:.25em`). Desktop sort bar is hidden (`display:none`).
- Compare toggle mobile: `margin:16px 16px 0`.

## Ours now (localhost, 1440)
Aside 240px with no right border, starts x 36 (Garmin 315px, x 0, border-right #D9D9D9, sticky full height);
`Compare` 240x35 14px with .84px tracking (Garmin 140x52 16px); group title 15px weight 500 (Garmin 14px 700);
native checkbox `accent-black` 16px (Garmin 2px #737373 square); option text colour neutral-700 (Garmin #000),
pitch 31px (Garmin 38px); sort label 14px 400 neutral-700 (Garmin 14.4px 700 #000); select 159x40 padding 0 12 14px
(Garmin 270x48, 16px, padding 14 48 14 14); sort options `Newest Products / Price: Low to High / Price: High to Low /
Name: A to Z` (Garmin list above).
