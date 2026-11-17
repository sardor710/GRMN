# HomeFooter spec (live: `body > footer.gf__footer`)

Source: section-footer-{1440,768,390}.json. Heights: 501 / 558 / 593. bg #000, color #fff, Roboto 16/24.

## >= 1024 (1440 measured)
- nav: ul margin 16px 0, padding 24px, flex; Oswald, letter-spacing 0.8px (inherited by links).
  - 4 columns: flex 1 1 0, margin-right 48px (last 16px) -> width 308, x = 24/380/736/1092.
  - Heading: 20px/32px Oswald 400 uppercase, white (button, not interactive on desktop; chevron hidden).
  - Links: Roboto 400 (computed on <a>; parent ul is 500), 12.8px/24px, ls 0.8px, white, block rows 24px.
  - nav height 376 (16 + 24 + 296 + 24 + 16).
- Spacer (gf__image) 0 height, margin-bottom 16px.
- Company row: margin 0 24px, padding-bottom 16px, border-bottom 4px solid #fff, flex space-between center, h 58.
  - Locale: margin-top 16px; link "United States" 14.4px/21.6px weight 500, no icon.
  - Social: ul flex end, each li margin 0 16px; icons 20x20 (YouTube 29x20), fill #fff. Rect width 269 ending at x=1416.
- Legal: padding 0 24px, flex space-between, h 51.
  - Copyright p: margin 12.8px 0 6.4px, 12.8px/19.2px weight 500.
  - Links ul: margin 16px 0, 12.8px/19.2px 500; li margin 0 16px (last: left 16 only). ends x=1416.

## < 1024 (768 + 390 measured, identical structure)
- nav ul: margin 16px 0, padding 0; 4 accordion rows, each button 64px: padding 16px, 20px/32px Oswald,
  ls 0.8px, chevron svg 16x12.75 right aligned (x = vw-32). Collapsed by default (panel height 0). nav height 288.
- Company: margin 16px 0, padding-bottom 16, border-bottom 4px solid #fff, column, center, h 117.
  - locale margin 16px auto; then 16px gap; social row (justify center).
- Legal: column-reverse, padding 0 16px 16px; links ul first (margin-top 16, li margin 0 16px 16px, wraps),
  copyright centered after. 768 h 122 (links 1 row), 390 h 157 (links 2 rows: 4 + "Digital Accessibility").
- Open accordion (probed live at 390): li bg #fff + padding-bottom 4px; button text + chevron #000, chevron rotate(180deg);
  panel ul margin 0 16px, padding 0 16px 16px; links #000, padding 8px 0 (40px rows), full width.
- "SeaStar®": live font Superscripts-Roboto draws ® small/raised; clone wraps ® in a 70%/700 span raised 0.5em.
