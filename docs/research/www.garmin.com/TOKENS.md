# Garmin design tokens → project variables

Measured 2026-11-20 on www.garmin.com/en-US (home, PLP smartwatches, PDP Forerunner 970 / fēnix 9, empty cart).
Sources: recon.json, plp/recon.json, pdp/recon.json (`tokens`), plp/css-rules-components.txt, computed-*.json,
components/*.spec.md. "Ours" values: src/app/globals.css (`:root`, `@theme inline`, `.g-heading`, `.g-btn`),
src/app/garmin-fonts.css (`--garmin-body`, `--garmin-display`), and computed values on our dev server
(docs/research/www.garmin.com/ours-localhost/*.json, localhost /en, 1440).
Flag column: OK = same, DIFF = change in 5a.2/5b, NEW = no project token yet (propose the name shown).

## 1. Colour
| role | Garmin value | project token | ours now | flag |
|---|---|---|---|---|
| page bg | #FFFFFF | `--background` | oklch(1 0 0) = #FFFFFF | OK |
| body text | #000000 | `--foreground` | oklch(.145 0 0) ≈ #0A0A0A (body uses `text-black`) | DIFF (use #000) |
| card text | #1A1A1A | NEW `--garmin-card-text` | #000 | NEW |
| secondary text (breadcrumb) | #666666 | `--muted-foreground` / `--garmin-text-muted` | oklch(.45 0 0) ≈ #555 / #5B5B5B | DIFF |
| primary (buttons, active) | #000000 | `--primary` | oklch(0 0 0) | OK |
| primary hover (black btn) | #333333 | NEW `--garmin-black-hover` | - | NEW |
| buy CTA | #6DCFF6 | NEW `--garmin-candy-blue` | hard-coded #6dcff6 in ProductTop | NEW |
| buy CTA hover | #0FB0F0 | NEW `--garmin-candy-blue-hover` | - | NEW |
| link blue | #106FAD (hover #0D5A8C) | `--garmin-blue` | #007CC3 | DIFF |
| control border (inputs, selects, filter, specs) | #D9D9D9 | `--border`, `--input` | oklch(.922 0 0) ≈ #E5E5E5 | DIFF |
| header / mega border | #D8D8D8 | NEW `--garmin-rule` | #D8D8D8 (HomeHeader module) | OK (module) |
| option border (variants, swatches) | #CCCCCC | NEW `--garmin-option-border` | 1px #000/#ccc mix | NEW |
| checkbox border | #737373 | NEW | native accent-black | NEW |
| tab bar bg | #E5E5E5 | `--secondary` (repurpose) or NEW | #E5E5E5 hard-coded | OK (value) |
| spec th bg | #F2F2F2 | `--muted` | oklch(.97 0 0) ≈ #F5F5F5 | DIFF |
| skeleton bg | #EEEEEE | `--accent` | oklch(.97 0 0) | DIFF |
| error text/border | #920000 | `--destructive` | oklch(.577 .245 27.3) ≈ #E7000B | DIFF |
| badge red | #C20F2F | NEW `--garmin-badge-red` | #DC2626 (SALE) | DIFF |
| badge pink / lime / gold / gray | #F7607B / #CAD54F / #F0B800 / #D9D9D9 | NEW | - | NEW |
| focus ring | UA `auto 1px #101010`, offset 1px (inputs: border → #000) | `--ring` | oklch(.708 0 0) at 50% | DIFF |
| footer bg / text | #000 / #FFF | (SiteFooter) | #000 / #FFF | OK |

## 2. Type
Families: body `Superscripts-Roboto, Roboto, "Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", Prompt,
sans-serif`; display `Superscripts-Oswald, Oswald, "Roboto Condensed", Roboto, ...`. Weights loaded: Roboto 400/500/700,
Oswald 400/500/700. No `font-feature-settings` anywhere (proportional figures, no tnum). Display headings never bold.

| token | Garmin | project token | ours now | flag |
|---|---|---|---|---|
| body family | Roboto (+superscript face) | `--font-sans`, `--garmin-body` | Roboto / GarminSuperscriptRoboto stack | OK |
| display family | Oswald (+superscript face) | `--font-heading`, `--garmin-display` | `--font-heading` starts with local "Knockout" | DIFF (drop Knockout; Garmin web never uses it) |
| heading transform | none (authored caps only on promo/section titles) | `.g-heading` | `text-transform: uppercase` | DIFF |
| heading tracking | .8px fixed | `.g-heading` | .02em (0.44px at 22, 0.72px at 36) | DIFF |
| heading line-height | 1.25 (40/50, 32/40, 24/30, 20/25) | `.g-heading` | 1.1 | DIFF |
| h1 page/product | Oswald 40/50 (390: 32/40) | - | PDP 40/50 OK; PLP h1 36/39.6; cart 28/30.8 | DIFF |
| h2 section | Oswald 32/40 .8px (uppercase when authored) | - | 26/28.6 1.04px | DIFF |
| h3 card | Oswald 24/30 .8px (390: 20/25) | - | 22/27.5 uppercase | DIFF |
| h3 small (promo, spec group) | Oswald 20/25 .8px | - | - | - |
| footer heading | Oswald 20/32 .8px uppercase | - | same | OK |
| body | Roboto 16/24 400 | - | 16/24 | OK |
| body large (PDP info) | Roboto 18/27 | - | - | - |
| small | Roboto 14/21 400 | - | 14/21 | OK |
| nav / mega link | Roboto 14/17.5 400 .64px | - | same | OK |
| nav top item | Roboto 14 500 .64px | - | same | OK |
| tab | Roboto 14/21 600 uppercase .28px | - | same | OK |
| x-small | Roboto 12.8/19.2 (500 legal, 400 takeover .32px) | - | same in footer | OK |
| spec cell | Roboto 12/18 (th 700 uppercase -.2px, td 200) | - | not compared | - |
| micro | Roboto 11/16.5 | - | - | - |
| price card | Roboto 16/24 700 | - | 15/22.5 500 | DIFF |
| price PDP | Roboto 20/24 700 | - | 20/24 700 | OK |
| strike / save | Roboto 14/24 400 (PDP), 16 400 (card) | - | 12px neutral-500 (cart) | DIFF |
| badge | Roboto 14/21 400 | - | Knockout 11/16.5 700 uppercase .55px | DIFF |
| button | Roboto 500 uppercase, ls normal; L 16/18.4, M 14/16.1, S 12/13.8 | `.g-btn` | 14/16.8 500 ls .06em (.84px), one size | DIFF |
| currency format | locale-native, 2 decimals (`$649.99 USD`, `599,99 €`) | `formatMoney` | `1,350,000.00 KZT`; /en cards `$224,995.00 USD` for KZT | DIFF |

## 3. Spacing, layout, breakpoints
- Base unit 8px; frequency: 8 (186×) > 16 (76-1026×) > 32 > 24. Component paddings: 16px card text, 24px header
  gutters, 16px mobile gutters, 32px mega bottom.
- Containers: header full width with 24px gutters; mega columns centred; PDP info max 720 (+115.2 right padding);
  cart max 1200; PLP filter 315 + grid (cards calc(33.333% - 1.35em), 16px gutters).
- Breakpoints (Garmin CSS): 480, 768, 1024 (main switch: header, filter, PDP), 1200 (3-col cards), 1440.
  Tailwind defaults in ours: 640/768/1024/1280/1536 → use arbitrary `min-[480px]`, `min-[1200px]` where Garmin switches.

| token | Garmin | project token | ours now | flag |
|---|---|---|---|---|
| card gutter | 16px | - | 24px (`gap-6`) | DIFF |
| filter width | 315px, border-right 1px #D9D9D9, sticky 100vh | - | 240px, no border | DIFF |
| card inner padding | image 0; text 0 16px 24px | - | 24px all round | DIFF |
| PDP CTA gap | 8px | - | 8px | OK |

## 4. Radii and shadows
| token | Garmin | project token | ours now | flag |
|---|---|---|---|---|
| controls (buttons, inputs, selects, cards, badges-rect) | 0 | `--radius` (drives shadcn `rounded-*`) | 0.625rem (10px) | DIFF (set 0 for storefront; admin shadcn too) |
| promo card | 3px | NEW | - | NEW |
| pill badge | 1.625em (22.75px at 14px) | NEW | square ribbon | DIFF |
| swatch | 50% | - | full | OK |
| product card shadow | `0 2px 3px 1px #E5E5E5` | NEW `--garmin-card-shadow` | border 1px + hover `shadow-lg` | DIFF |
| promo/mega card shadow | `0 0 6px 0 #D8D8D8` | NEW | - | NEW |
| PDP gallery/cards (secondary) | `0 1px 1px rgba(77,77,77,.08), 0 1px 3px 1px rgba(77,77,77,.16)` | NEW | - | NEW |
| hover lift | none anywhere | - | `hover:shadow-lg` on cards | DIFF |

## 5. Button specs (copy into `.g-btn` variants)
| variant | size | font | padding | height | bg / text / border | hover |
|---|---|---|---|---|---|---|
| buy (candy-blue) | L | 16/18.4 500 upper | 16px 32px | 52 | #6DCFF6 / #000 / 1px #6DCFF6 | bg+border #0FB0F0 |
| black | L | 16/18.4 | 16px 32px | 52 | #000 / #FFF / 1px #000 | #333 bg+border |
| light (secondary) | L or M | 16 or 14 | 16 32 / 8 24 | 52 / 34 | #FFF / #000 / 1px #000 | #000 / #FFF |
| dark | L or M | | | | #000 / #FFF / 1px #FFF | #FFF / #000 / 1px #000 |
| outline on image | M | 14/16.1 | 8px 24px | 34 | transparent / #FFF / 1px #FFF | #FFF / #000 |
| disabled | any | | | | #D9D9D9 / #000 / #D9D9D9 | none |
| text (flat) | - | inherit 14/12 | 10px 0 | - | none / #000 | underline |
| text secondary | - | | 10px 0 | - | none / #106FAD | #0D5A8C |
Transition `background .2s, border .2s, color .2s`; radius 0; letter-spacing normal; transform none.

## 6. Diff summary (token | Garmin | ours now)
| token | Garmin | ours now |
|---|---|---|
| `--font-heading` first family | Oswald | Knockout (local), then Oswald |
| `.g-heading` text-transform | none | uppercase |
| `.g-heading` letter-spacing | 0.8px | 0.02em |
| `.g-heading` line-height | 1.25 | 1.1 |
| `.g-btn` letter-spacing | normal | 0.06em |
| `.g-btn` sizes | L 16px/52, M 14px/34, S 12px/26 | 14px/35 only |
| `--radius` | 0 | 0.625rem |
| `--border` / `--input` | #D9D9D9 | ≈#E5E5E5 |
| `--garmin-blue` (links) | #106FAD | #007CC3 |
| `--destructive` | #920000 | ≈#E7000B |
| `--ring` | #101010 auto 1px | ≈#A1A1A1 50% |
| `--muted` | #F2F2F2 | ≈#F5F5F5 |
| `--muted-foreground` | #666666 | ≈#555555 |
| badge | 14px pill #6DCFF6/#000 | 11px uppercase ribbon #00A0DF/#FFF, #DC2626 |
| card | no border, shadow 0 2px 3px 1px #E5E5E5 | 1px border, 24px padding, hover shadow-lg |
| card title | Oswald 24/30 mixed case | 22px uppercase |
| card copy | 16/24 #1A1A1A | 14px #5B5B5B |
| card price | 16/24 700 | 15px 500 |
| money format | locale currency, 2 decimals | `1,350,000.00 KZT`, `$… USD` on /en cards |
| filter rail | 315px + 1px border, 14px 700 group titles | 240px, 15px 500 |
| sort select | 270x48, 16px | 159x40, 14px |
