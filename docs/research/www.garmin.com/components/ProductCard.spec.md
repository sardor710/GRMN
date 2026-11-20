# ProductCard spec (garmin.com PLP `a.product-card`)

Live: https://www.garmin.com/en-US/c/wearables-smartwatches/. Sources: `plp/section-plp-grid-{1440,390}.json`,
`plp/css-rules-components.txt` (`.product-card*`, `.pricing-wrapper`), `plp/states-plp-grid.json`.
Shots: `garmin-compare/plp-grid-{1440,390}.png`. Model: static link; hover only changes colour (no lift, no shadow change).

## Grid
- `div.product-grid__products`: flex wrap, inside the 1125px area right of the 315px filter (1440).
- Card container widths: <480 `100%`; ≥480 and ≥768 `calc(50% - .5rem)` (`justify-content:space-between`);
  ≥1200 `calc(33.3333% - 1.35em)` with `margin:16px 0 0 16px`. Measured 1440: 353.4px wide, x 331 / 700 / 1070,
  16px gutters, rows 16px apart. 390: 358px wide, single column, 16px apart.
- Promo tiles (`.sticky-custom-card-container`) occupy the first cell of rows 1-3 (image tile, Oswald 24/30 white
  heading, medium tile CTA "Shop"). Not a product card.
- Pagination below grid: `margin-top:32px`, centred, small buttons (Buttons.spec.md).

## Card
- `a.product-card`: block, `color:#1A1A1A`, `text-align:left`, no border, `box-shadow: #E5E5E5 0 2px 3px 1px`,
  radius 0, bg transparent (page white). Height follows content (530-555px at 1440).
- `figure.product-card__wrapper`: flex column, `align-items:center`, margin 0, height 100%.
- Image container: ≥768 `width:100%; height:300px`; <768 `width:200px` (390: 200x207). img `object-fit:contain;
  mix-blend-mode:multiply`, no padding.
- Badge: absolute `top:16px; left:16px` (Badges.spec.md, candy-blue pill `New` / `Sale`).
- `figcaption.product-card__description`: flex column, width 100%, `padding:0 16px 24px`.
  1. Colour swatches (`g-color-swatches`): `margin-top:16px`, row of 16x16 circles (image, radius 50%), 8px apart,
     inner shadow `inset 0 3.37px 3.37px rgba(0,0,0,.25)` via `::after`. Real variant colours, not decorative.
  2. Name h3: Oswald 400, 24px / 30px [<768: 20px / 25px], `letter-spacing:.8px`, `margin:16px 0`, NOT uppercase:
     `fēnix® 9`, `Forerunner® 970`. If no swatches, `margin-top:16px`.
  3. Description `g-copy`: Roboto 16px / 24px [<768: 14px / 21px], colour #1A1A1A, p `margin:0 0 16px`.
     One sentence, e.g. `Premium GPS running and triathlon smartwatch with an AMOLED display...`.
  4. Price: Price.spec.md card rules (16px/24px 700; strike 400; "and up" 12px).
- Typical vertical rhythm (1440): image 300 → 16 → swatches 16 → 16 → name 30 → 16 → copy 72 → 16 → price 24 → 24.

## States
- Hover: text colour #000 → #333333 (`transition: color .2s`). No transform, no added shadow, image unchanged.
- Focus-visible: `outline:auto 1px #101010`.

## Compare mode (after "Compare" toggle)
`.product-card__compare-card` bg #F2F2F2; selected: transparent + `outline:2px solid #000`; add button black 56px
square `+` 40px text, remove `-` black text.

## Ours now (localhost /en/c/wearables-smartwatches, 1440)
Card 349x495 with `border:1px solid oklch(.922 0 0)` + `padding:24px`, hover `shadow-lg` (Garmin: no border, shadow
#E5E5E5 0 2px 3px 1px, no hover shadow); image max 260 square inside padding (Garmin full-width 300 tall); name
22px uppercase `.g-heading` (Garmin 24/30 mixed case); description 14px #5B5B5B (Garmin 16/24 #1A1A1A); price 15px 500
(Garmin 16px 700); swatches 14px decorative fake colours with 1px border (Garmin 16px real swatches); grid gap 24px
(Garmin 16px); badge black/blue ribbon 11px uppercase (Garmin pill).
