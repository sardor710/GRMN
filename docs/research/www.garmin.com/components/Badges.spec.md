# Badges spec (garmin.com `.g__badge`)

Sources: `plp/css-rules-components.txt` (`.g__badge*`), `plp/section-plp-grid-1440.json`, `pdp/computed-pdp-1440.json`.
Model: static.

## Base
`.g__badge`: block, `width:fit-content`, Roboto 14px / 21px weight 400 (no uppercase, no letter-spacing),
`padding:.5em 1em` (7px 14px), `border-radius:1.625em` (22.75px, full pill), `margin-bottom:16px`,
`word-break:break-word`. Default colours: bg #000, text #FFF. Rendered `New` 56x35, `Sale` 55x35.

## Variants (exact)
| class | bg | text |
|---|---|---|
| default | #000000 | #FFFFFF |
| `--candy-blue` | #6DCFF6 | #000000 |
| `--red` | #C20F2F | #FFFFFF |
| `--pink` | #F7607B | #000000 |
| `--lime` | #CAD54F | #000000 |
| `--gold` | #F0B800 | #000000 |
| `--gray` | #D9D9D9 | #000000 |

## Placement
- Product card: absolute `top:16px; left:16px` over the image (`.badge-wrapper`).
- PDP: own row under the part number, `margin:8px 0 16px`; badges side by side `margin-right:12.8px`.

## Wording seen (2026-11-20, US smartwatches)
`New`, `Sale` (both candy-blue). Sentence case, one or two words, no punctuation. Garmin uses no "Best Seller",
"Limited Edition", "Hot", "-20%" chips on cards or PDP. Edition names (e.g. Carbon Edition) live in the product name
or variant label, not in a badge.

## Ours now
`GarminBadge` ribbon variant: 11px Knockout 700 uppercase `.55px` tracking, `padding:4px 12px`, square, shadow; colours
`NEW` #00A0DF/white, `SALE` #DC2626/white, `LIMITED EDITION` #090A0F + slate border, `BEST SELLER` navy + amber,
plus a starburst variant. All differ from Garmin's single pill style. Map: NEW → `New` candy-blue, SALE → `Sale`
candy-blue (Garmin uses candy-blue for sale too; `--red` exists for urgent promos), others → drop or `--gray`.
