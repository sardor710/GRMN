# garmin.com/en-US — page topology (recon 2026-11-17, 1440 / 390)

Document scroll, no smooth-scroll lib (Vue + web components). Header is static (not sticky), z 99999.

s0 body>header                     | header + takeover bar   | click/hover mega menu | static z99999 | 100px (64 row + 35 bar + 1 border)
s1 main>g-hero-rotator             | hero rotator            | time (6000ms) + click | -             | 410 @1440 · 1068 @768 · 706 @390
s2 main>div:nth-child(2)           | "FEATURED" slider       | click (arrows/scroll) | -             | 559 @1024
s3 main>div.container.white        | 3 promo cards           | static                | -             |
s4 main>div:nth-child(4)           | 2 story tiles           | static                | -             | 416 @1024
s5 main>g-spacer + g-heading       | "SHOP BY CATEGORY"      | static                | -             | 64 + 40
s6 main>div:nth-child(7)           | 6 category tiles        | static                | -             | 832 @1024
s7 main>authorable-email-signup    | Sign up for news        | form                  | -             | 245
s8 body>footer                     | black footer            | static (accordion <768?) | -          | 501 @1440

Overlays: mega menu (abs top 64, z 999, inside header), search panel, account dropdown (abs top 64, right 24).
