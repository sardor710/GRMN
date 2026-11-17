# HomeFeatured (FEATURED product slider) — spec

Source: `section-featured-{1440,768,390}.json`, `states-main-div-nth-child-2.json`. Live selector `main > div:nth-child(2)`.

## Structure
```
div (Roboto 16/24, #000)
  h2.header  "Featured"            black bar + ::after notch
  section.slider (bg #fff, overflow-x hidden ≥641 / scroll ≤640, scroll-behavior smooth, position relative)
    div.slides (flex, min-width 100%, text-align center, white-space nowrap)
      g-container  promo tile (Holiday Sale)  — 1st slide
      a × 13       product cards
    button.arrow--left (hidden at start) / button.arrow--right "Next"
```

## Header `h2`
- 50px tall: padding 16px 64px; Oswald 14.4px / 18px; ls .8px; uppercase; center; #fff on #000; margin 0; position relative.
- `::after` notch: absolute, top 50px, left 50%, margin-left -30px, z 1; borders: top 20px solid #000, left/right 30px transparent (60×20 triangle). Same at all widths.

## Slide (shared)
- margin 43px 12px 32px; box-shadow `0 2px 3px 1px rgb(217,217,217)`; cursor pointer; display flex column.
- min-width: ≥990 `calc(22.2222% - 24px)` (296px @1440, 4.5 visible); 641–989 `calc(40% - 24px)` (283px @768); ≤640 `292.5px` (=75vw @390).
- Card heights (row-stretched): 470 @1440, 447 @768, 464 @390. Slider height = 43 + card + 32 (545 / 522 / 539).
- hover: box-shadow `rgba(77,77,77,.2) 0 1px 3px 1px, rgba(77,77,77,.1) 0 2px 8px 4px` (no transition).
- focus-visible: outline 1px auto rgb(16,16,16), offset 1px.

## Promo tile
- justify-content end; bg image absolute inset 0, object-fit cover (`Phase-2-EDGE-TO-EDGE-FT.jpg`, 2000²).
- text box padding 0 16px; heading margin-top 16, uppercase white, Oswald 32/40 ls .8 (≤640: 24/30), margin-bottom 24.
- SHOP button: 87×34, inline-block, centered, padding 8px 24px, border 1px solid #000, bg #fff, #000, Roboto 14px/16.1px 500 uppercase, margin-bottom 32. Transition background/border/color .2s. Hover: bg #000, color #fff.

## Product card (`a`)
- padding-bottom 16; color rgb(26,26,26); transition color .2s.
- Badges: absolute top/left/right 16px. Badge pill: Roboto 14/21, padding 7px 14px, radius 22.75px, bg rgb(194,15,47), #fff, text-align left, margin-bottom 16, width fit-content (93×35 for "Save $100").
- Image container margin-top 16; height 230 @≥990, 207 @641–989, auto @≤640 (img inline → img+7px = 241). Image centered: 240² (max 240) @≥990, 208² @641–989, width 80% / max 80% @≤640 (234²).
- Text container: flex column, padding 0 16px.
  - Name: margin-top 16; Oswald 32/40 ls .8 (≤640 24/30); margin-bottom 16. ® / ™ rendered as superscript (Superscripts-Oswald).
  - Copy: margin 8px 0; 14.4px/20px Roboto; white-space normal.
  - Footnote (empty): margin-top 40px (≤640 32.5px), 11px/16.5px.

## Arrows
- `button` 68×68 transparent, absolute top 50% (272.69 @1440 of 545), right 0 / left 0, transform translateY(-34px); transition left/right .3s ease-in.
- SVG 68×68: white circle r28 at (34,28) with drop-shadow (dy 6, blur 3, 25% black) + black chevron path. Prev = mirrored.
- Visible only ≥990; prev hidden until scrolled; next hidden at end. Hidden at 768 and 390 (touch scrolling).

## Content (live 2026-11-17)
Holiday Sale (SHOP → /c/promotions/holiday-sale-guide-americas/), then: Venu 4 ($100), vívoactive 6 ($50), fēnix 8 ($250), Bounce 2 ($50), Forerunner 970 ($100), Lily 2 Active ($50), Instinct 3 ($100), Venu X1 ($200), Edge 1050 ($100), inReach Mini 3 Plus ($100), Approach S70 ($100), Approach J1 ($100), GPSMAP H1 | H1i Plus ($100).
