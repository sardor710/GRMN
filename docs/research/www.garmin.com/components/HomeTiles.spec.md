# HomeTiles spec (promo cards, story tiles, SHOP BY CATEGORY)

Source: section-{promo,stories,categories}-{1440,768,390}.json, live probe at 1440/1200/1100/1024/900/800/768/700/600/480/400, states probe.
Fonts: headings var(--home-display) (Oswald) 400, 32/40 ls .8px uppercase (>=768) | 24/30 (<768). Body/buttons var(--home-body) (Roboto).

## Promo cards — live `main > div.container.white`, clone `[data-section="home-promo"]`
- Section bg #fff, padding-block 8. Row: flex-wrap, max-width 1200, centered, padding-inline 8 (0 below 480).
- Card: margin 8 (8px 16px below 480), bg #fff, radius 2, shadow `rgba(0,0,0,.24) 0 2px 4px 1px`,
  transition box-shadow .135s cubic-bezier(.4,0,.2,1); hover shadow `rgba(60,64,67,.2) 0 1px 3px 1px, rgba(60,64,67,.1) 0 2px 8px 4px`.
- Width: >=1200 calc(33.333% - 16px) (379 @1440, row x=120..1320, cards x=136/531/925);
  480–1199 calc(50% - 16px) (360 @768, 3rd card wraps left); <480 calc(100% - 32px) (358 @390).
- Rows stretch to equal height. Card = column: square image (1:1, 379x379 @1440) + content (flex 1).
- Content: h2 margin 16 16 24 16 (black). Button row justify-end, pushed to bottom; button margin 0 16 16 0.
- Heights: 1440 589 (3-line title) → section 621. 768 rows 570/530 → 1148. 390 508/508/478 → 1558.
- SHOP button: Roboto 14/16.1 500 uppercase, padding 8 24, 1px solid #000, bg #fff, 87x34.
  transition background/border/color .2s; :hover bg #000 color #fff.
- ® / ™ raised by the Superscripts-Oswald font itself (GarminHomeOswald in clone) — no <sup> markup.

## Story tiles — live `main > div:nth-child(4)`, clone `[data-section="home-stories"]`
- Container flex-wrap, padding-inline 16 (8 below 768), bg #fff. Tile margin 8, height 400.
- Width: >=768 calc(50% - 16px) (688 @1440, 352 @768); <768 full (358 @390). Section 416 / 832 (@390).
- Image object-fit cover, no zoom on hover. Gradient `linear-gradient(0deg, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 60%)`.
- Content: absolute bottom, padding-bottom 50, max-width 600; h2 margin 16, white. h2 bottom = tile bottom - 66.
- Button absolute left 16, bottom 16 (top 349.91). LEARN MORE 136x34: Roboto 14/16.1 500, padding 8 24,
  1px solid #fff, transparent, white text; :hover bg #fff, color #000, border #000. transition .2s.

## Categories — heading `main > g-heading`, grid live `main > div:nth-child(7)`, clone `[data-section="home-categories"]`
- Spacer 64 above heading. Heading h2 centered, 32/40 (24/30 <768), margin-bottom 16 → grid starts 56 (46 @390) below spacer.
- Grid = story tile rules, width >=768 calc(33.333% - 16px) (453 @1440, 229 @768), <768 full. 400 tall. 832 / 2496 (@390).
- Title not uppercased by CSS (text already uppercase). SHOP button 87x34 same overlay style.
