# ProductBuyBox spec (garmin.com PDP `#js__product__info`)

Live: https://www.garmin.com/en-US/p/1462801/ (Forerunner 970, sale, image swatches) and /p/2021177/ (fēnix 9, text
variants). No fēnix 8 page is listed in the US catalogue any more (fēnix 9 replaced it), so these two were measured.
Sources: `pdp/section-pdp-info-{1440,390}.json`, `pdp/computed-pdp-{1440,390}.json`, `pdp/states-pdp-info.json`,
`pdp/variant-selector-fenix9-1440.txt`, `pdp/recon.json`. Shots: `docs/design-references/garmin-compare/pdp-info-*.png`.
Model: static + click (variant links reload the variant). Hover/focus CSS only.

## Layout
- `section.app__product` (1440): gallery column 711px (`.app__product__images`, inner 600px at x 81) + info column.
- Info `div.app__product__info`: `max-width:720px; margin:0 16px 16px; padding-right:115.2px; flex-grow:1`,
  Roboto 18px/27px #000. Content width 566px at x 743. Top of info = 18px below header (y 118).
- 390: single column, gallery first; info x 16, width 358, starts y 508 (h1).

## Structure and exact styles (1440; 390 differences in brackets)
1. Breadcrumbs `g-breadcrumbs` `margin-bottom:16px`; nav flex. Each item 14px / 14px, colour #666666, link underlined,
   ellipsis; separator `::after` content "/" with `margin:0 8px`; last item has no separator. Text e.g.
   `Sports & Fitness / Running`.
2. h1 product name: Oswald (Superscripts-Oswald) 400, 40px / 50px [390: 32px / 40px], `letter-spacing:.8px`, #000,
   `margin:0 0 4px`, NOT uppercase: `Forerunner® 970`, `fēnix® 9`.
3. Part number: p 14px/21px. Label `Part Number:` (DOM "part number:" + `text-transform:capitalize`), value
   `010-02969-01` with `padding-left:4px`, both weight 400.
4. Badge row `div.badge__container`: flex, `margin:8px 0 16px`; badge spec in Badges.spec.md (`Sale`, `New`),
   badge `margin-right:12.8px`.
5. Price block: see Price.spec.md (stacked, margin 16px 0 4px, 48px tall when on sale).
6. Financing + HSA lines (US only): 14px/21px, each `margin-bottom:2px`. Skip for KZ.
7. Variant groups `div.app__product__filters__group`: `margin:16px 0`.
   - Label: 14px/21px; name weight 700 (`Case Size`), value weight 400 prefixed by "- " (`- 43 mm`), optional info
     icon 18x12 `margin:-1px 0 0 4px`; label `margin-bottom:8px`.
   - Text options (`a.app__product__filters__buttons`): flex wrap, `gap:12px`; each 14px/21px weight 400,
     `padding:7px 17.5px`, `border:2px solid #CCCCCC`, bg #FFF, text #000, height 39px, radius 0, no min-width
     (43 mm = 83px wide). Selected: bg #000, text #FFF, border 2px #000. Hover on unselected: border #000.
   - Image swatches (Model/Color, `ul.app__color__picker__list`): flex wrap, `gap:10.8px`, `max-width:570px`;
     each link 84x84 [390: 64x64], `border:2px solid #CCCCCC`, img 80x80 [60x60]; selected border 2px #000;
     hover border #000 (transition .5s). Title: `Model/Color` 700 + `- <variant name>` 400, 14px/21px,
     `margin-bottom:8px`.
8. CTA row `div.app__product__cta`: `max-width:570px; margin:16px 0 8px`.
   - `Add To Cart` = candy-blue large button 166x52 (Buttons.spec.md), host `margin-right:8px`.
   - `Customize` = light large button 154x52 (only on customizable products).
   - [390: both 358x52 full width, stacked, 8px gap.]
9. Shipping note `g-copy.app__product__processing`: 14px/21px #000, `margin-bottom:16px`:
   `Available to ship in 1–3 business days.` (en dash, period).

## States
- Add To Cart hover: bg/border #6DCFF6 → #0FB0F0 (.2s). Customize hover: bg #FFF → #000, text #000 → #FFF.
- Swatch hover: border #CCCCCC → #000 (.5s). Breadcrumb hover: colour unchanged, focus ring only.
- All focus-visible: `outline:auto 1px #101010; outline-offset:1px`.

## Responsive
- ≥1024: two columns as above. <1024: stacked; values in brackets measured at 390.

## Assets
Gallery = Cloudinary viewer (thumbnail rail 80px wide left, main 483x483); not part of the buy box.

## Ours now (localhost /en/p/prod-1794926441776, 1440)
h1 Knockout→Oswald stack 40/50 .8px (matches if Knockout absent); price 20/24 700 OK; badge is a black
"LIMITED EDITION" rectangle 11px uppercase (Garmin: candy-blue pill 14px sentence case); variant buttons 1px border
min-width 82px h38 (Garmin 2px #CCC, h39, no min-width); breadcrumb 13px/19.5 #000 (Garmin 14/14 #666);
CTA sizes match (166x52, 154x52).
