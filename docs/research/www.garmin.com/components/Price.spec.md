# Price spec (garmin.com `g-price`)

Sources: `plp/css-rules-components.txt` (`.g__price*`, `.pricing-wrapper`), `pdp/computed-pdp-1440.json`,
`plp/section-plp-grid-{1440,390}.json`, locale check of p/1462801 in en-US, en-GB, de-DE (2026-11-20).

## Number and currency format
- Garmin always prints the locale's native currency format with 2 decimals:
  en-US `$649.99 USD` (symbol + amount + space + ISO code), en-GB `£559.99` (no code), de-DE `599,99 €`.
- No tabular numerals: `font-feature-settings: normal`, `font-variant-numeric: normal` on every price node.
  Digits are Roboto proportional figures.
- Our store sells in KZT. The equivalent of Garmin's rule is `Intl.NumberFormat(locale, {style:"currency",
  currency:"KZT"})`: ru-KZ / kk-KZ give `1 350 000,00 ₸` (narrow no-break space thousands, comma decimals, ₸ after).
  Decimals: Garmin never drops `.00`; dropping them for KZT is an owner decision, but it must be the same everywhere
  (card, PDP, cart, admin).
- Ours now: PDP `1,350,000.00 KZT` (en grouping + ISO code) and, on /en catalogue cards, `$224,995.00 USD` for a KZT
  amount (wrong currency label). Both differ from Garmin's rule.

## Card price (`.pricing-wrapper .g__price`)
- Wrapper: flex, `justify-content:flex-start; align-items:flex-end`; sits at the card bottom.
- Regular: Roboto 16px / 24px, weight 700, colour inherits card #1A1A1A, `white-space:pre-wrap`.
- "and up" / "from": `<span class="and-up-text">` 12px / 24px weight 400, `margin-left:4px` (`from-text` precedes,
  `margin-inline-end:4px`). Rendered: `$999.99 USD and up`.
- Sale: strike first, then sale price on the same line.
  - Original: `.g__price--strike` 16px weight 400, `text-decoration: line-through`, `margin-right:3px`, inline-block.
  - Sale: `.g__price__discounted-price` 16px weight 700, inline-block, same colour (no red).
  - Rendered: `~~$749.99 USD~~ $649.99 USD` (92px + 3px + 94px at 1440).
- Same values at 390.

## PDP price (`g-price.product__info__price.g__price--stacked`)
- Container: flex column, `margin:16px 0 4px`, 20px / 24px weight 700, colour #000.
- Regular price only: one line, 20px/24px 700, e.g. `$999.99 USD` (fēnix 9).
- Sale (Forerunner 970, measured):
  - line 1 `.g__price__original-price.g__price--strike`: 14px, weight 400, `line-height:24px`, line-through,
    `margin-right:11px`, then `.savings-text` (inline-flex, 14px/21px, weight 400, `margin-left:8px`,
    NOT struck through visually because it is inline-flex) = `Save` (`margin-right:4px`) + `$100.00 USD`.
  - line 2 `.g__price__discounted-price`: 20px / 24px weight 700, flex, `align-items:baseline`.
  - Rendered: `~~$749.99 USD~~  Save $100.00 USD` / `$649.99 USD`. Total block 48px tall.
- Financing line under price (US only, Affirm): 14px/21px, `Starting at $59/mo or 0% APR with Affirm.
  See if you qualify` (link 11px underline). Not applicable to KZ; omit, do not invent a replacement.
- 390: identical sizes (block 358 wide, 48 tall).

## Other price uses
- `.g__price--blue`: colour #106FAD (not used on PDP/cards measured).
- `.details-text`: 16px weight 400, `margin-inline-start:8px`.
- Cart (from cart CSS): order summary rows th left / td right, each `width:49%`, `padding:0 0 16px`, th weight 500,
  Roboto. Cart "was" price uses strike the same way.

## Do not
No red sale price, no percentage-off chip next to the price, no "Only", no "!" and no tabular-nums on storefront
prices. Admin tables may use `tabular-nums` for column alignment (Garmin has no admin; this is our choice).
