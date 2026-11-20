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

## Other pages (measured 2026-11-20, task 5a.1)
PLP /en-US/c/wearables-smartwatches/ (plp/): header 100 | card-rail title band 451 (h1 left 390px + slider) |
filter rail 315 sticky 100vh + grid 1125 (sort bar 58, 3-col cards, pagination) | email signup 245 | footer 501.
PDP /en-US/p/1462801/ (pdp/): header | breadcrumb 18px below header | gallery 711 + info 681 (539 tall) |
tab bar 81 (#E5E5E5) | tab content (overview 14.7k) | quick links + compatible cards | footer 505.
Cart buy.garmin.com/en-US/US/view-cart.ep (cart/): header | empty state 180 | footer 501.
Mega menu: computed-megamenu-1440.json. Specs: components/{ProductBuyBox,ProductTabs,ProductCard,SideFilterMenu,
Price,Buttons,Badges,Forms,MegaMenu,CartEmpty,Footer}.spec.md; tokens TOKENS.md; wording COPY_GUIDE.md.
