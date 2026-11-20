# MegaMenu + header spec (garmin.com `body > header.gh__header`)

Live: https://www.garmin.com/en-US/ (menu opened by clicking "Smartwatches", navigation suppressed). Sources:
`computed-megamenu-1440.json`, `section-header-{1440,1024,390}.json`, `states-body-header.json`, BEHAVIORS.md.
Model: hover/click (desktop ≥1024), accordion overlay (<1024).

## Header row
- `header`: flex, bg #FFF, `border-bottom:1px solid #D8D8D8`, total 100px = 64 nav row + 35 takeover bar + 1 border.
  Static (not sticky), z 99999.
- Nav row `.gh__header__nav__content`: 64px, `padding:0 24px`, `gap:32px`.
- Logo link 111x48 at x 24 (`padding:16px 0`), container 324px wide.
- Top items (`li.gh__nav__categories__items`): flex, 64px tall, 16px gap between items; link text Roboto 14px weight 500,
  `letter-spacing:.64px`, line-height normal (17px box), #000, centred vertically (y 24). Items: `Smartwatches`,
  `Sports & Fitness`, `Outdoor Recreation`, `Auto & Home`, `Marine`, `Aviation`, `Sale`. Starts x 380.
- Open/hover item: `box-shadow: inset 0 -3.2px 0 #000` (3.2px black underline at row bottom). No animation.
- Utility bar (324px, right 24px): `Help` link 14px/21px 500 with icon; search, account, cart icons 24x64 hit areas,
  icons 16px. Hover → same inset 3.2px bar.
- Takeover bar: bg #000, `padding:8px 32px`, `box-shadow:0 1px 0 #000`, link 12.8px / 19.2px, `letter-spacing:.32px`,
  #FFF, centred (`HOLIDAY SALE`).

## Mega panel (desktop)
- `div.gh__nav__categories__items__menu`: absolute under the row (y 64), full width 1440, height 722 (content-driven),
  bg #FFF, `border-top` and `border-bottom` 1px #D8D8D8, flex, `gap:16px`, `padding:0 16px 32px`, columns centred
  (first column x 222). `letter-spacing:.64px` inherited by everything inside. No shadow, no radius.
- Column: flex column, `padding:0 8px`; widths 234 / 224 / 224 / 266 (promo).
- Column heading (`.menu__heading`): Roboto 14px weight 500, line-height normal, `.64px`, #000, NOT uppercase,
  `padding:32px 0 14px`, `border-bottom:1px solid #D8D8D8`, `margin-bottom:16px` (64px tall incl. padding).
  Headings: `Products`, `Maps`, `Accessories & Plans`, `Discover` (+ `Communities`, `OEM Solutions`, `Markets`,
  `Apps & Services`, `Charts & Maps`, `Aviation Databases` on other menus).
- Link (`.menu__link`): block, Roboto 14px / 17.5px weight 400, `.64px`, #000, `padding:8px 0` (34px pitch).
  Hover: `text-decoration: underline` (transition colour .2s). Sentence/Title case as authored:
  `All Smartwatches`, `Health & Fitness Tracking`, `Design Your Own Watch`, `Kids Smartwatches`.
- Promo card (right column, 1-2 cards): 250x328, `border:1px solid #D8D8D8`, `border-radius:3px`,
  `box-shadow:0 0 6px #D8D8D8`, `margin-top:16px`. Image 248x217 on top; text block `padding:0 16px`:
  heading Oswald 20px / 25px `.8px` `padding:16px 0 14px` (authored uppercase, e.g. `HOLIDAY SALE`, `FĒNIX® 9`);
  copy 14.4px normal (`Save big on great holiday gifts`, `The ultimate smartwatch`); CTA span 14.4px 500
  `padding:16px 0`, right aligned (empty in markup today; arrow-less).
- Close: pointer leaves the nav, or the item is clicked again.

## Mobile (<1024, measured 390, from BEHAVIORS.md + section-header-390.json)
- Row 64px; hamburger 20x11 two-line icon; takeover bar hidden while menu open.
- Overlay full height from top 64. Category row 18px / 32px weight 500 with +/− 16px icon; group 18px, 16px indent;
  link 14px / 17.5px, `padding:14px 32px`.

## Ours now (localhost /en, 1440)
Header row, panel, columns, heading and links match Garmin to the pixel (panel 1440x722, heading 218x64 32/14
padding, link 34px pitch, inset 3.2px bar). Differences: language switcher `KZ RU EN` inserted in the utility bar
(Garmin has none there; locale lives in the footer). The promo card box (1px #D8D8D8, 3px radius, 0 0 6px shadow)
was not isolated by the probe on ours; check it in the 5a.2 diff.
