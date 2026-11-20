# Compare spec (garmin.com `/compare/`)

Source: `https://www.garmin.com/en-US/compare/?compareProduct=1953453&compareProduct=1989182&compareProduct=730831`
(fēnix 9 Pro inReach 51 mm, CIRQA Smart Band, TopoActive Maps), measured 2026-11-21 with `scripts/clone/inspect.mjs`:
`recon`, `section` (`.app-header`, `#sticky-menu`, `#app-body g-collapsible-region`) at 1440 and 390, `states`
(`.product-compare-card`, `#app-body .g__collapsible-region`). Raw JSON: `docs/research/www.garmin.com/compare/`.
Screenshots: `docs/design-references/garmin.com/compare-*.png`. Empty page: `/en-US/compare/` with no products.

Vue app. Breakpoints used: min 768, min 1024 (main switch), min 1200, min 1440.

## Page header (`.app-header > .container`)
- Container: flex column, centred, padding 24px (390: 16px). Total 135px tall (390: 125px).
- "Return to shopping" link: 14px / 21px Roboto 400, black, underline, flex + `align-items:center`; links to the
  store home. Icon: Garmin chevron (`viewBox 0 0 11.2 18.1`, 9 × 15px) rotated 180° (points left), `margin-right:9.6px`.
  Colour transition 0.2s.
- h1 "Product Comparison": Oswald 400, uppercase, tracking 0.8px, centred. 1440: 40px / 50px, `margin-top:16px`.
  390: 32px / 40px, `margin-top:32px`. (= our `.g-heading.g-h1` + `uppercase`.)

## Column bar (`#sticky-menu`)
- Section: white, padding 16px 0, `z-index:1000`. Inner `.container-inner`: `max-width:1024px`, padding 0 16px,
  centred (1440: x 208…1232, content 992px wide).
- Cards row: flex, `gap:16px`. Slot width `calc(20% - 12.8px)` = 185.6px at 1440 (five slots always: products, then the
  + tile, then grey skeleton slots). 390: `columns-2`, `calc(50% - 8px)` = 171px, only two slots shown.
- Product card:
  - Header (image link) 186 × 186 (390: 171 × 161): flex centre, padding 18px 12px, white, shadow
    `0 1px 1px rgba(77,77,77,.08), 0 1px 3px 1px rgba(77,77,77,.16)` (= `shadow-garmin-raised`).
    Hover shadow `0 1px 3px 1px rgba(77,77,77,.2), 0 2px 8px 4px rgba(77,77,77,.1)`, transition box-shadow 0.135s
    `cubic-bezier(.4,0,.2,1)`. Image 150 × 150 (390: 125 × 125), `object-fit:contain`. The link's accessible name is the
    product name.
  - Remove ×: `<button aria-label="Remove product" title="Remove product">×</button>`, absolute top-right of the image
    tile, 31 × 32, 28px / 32.2px, padding 0 8px, transparent. Hover: no change. Focus-visible: UA ring 1px #101010.
  - Body: padding-top 16px, flex column.
    - Name: Roboto 16px / 24px 400 black, left, `margin-bottom:16px` (not a link on Garmin; the image is the link).
    - Price (`g-price`): 16px / 24px **700**, stacked column: `$1,299.99 USD` then `and up` on its own line (same
      16/24 700). "and up" only on products with several prices (fēnix 9 Pro sizes, TopoActive regions); a
      single-price product (CIRQA) has none. `margin-bottom:32px`.
    - Shop: `g-button` contained medium: candy blue #6DCFF6 bg + 1px border, black 14px / 16.1px 500 uppercase,
      padding 8px 24px, 87 × 34, radius 0. Hover #0FB0F0 (bg + border), transitions 0.2s. Focus-visible UA ring 1px
      #101010, offset 1px. Container `margin-bottom:16px`. (= our `.g-btn.g-btn--primary`.)
  - Card total 186 × 396 at 1440.
- + tile (`.add-product-to-compare-card`): same 186 × 186 header with the raised shadow, `cursor:pointer`,
  `tabindex=0`; centred "add" icon 63 × 64 (`viewBox 0 0 64 65`, square-capped cross, stroke 4, currentColor black).
  Clicking it reveals, in the body under the tile, a text input "Search for Products" (combobox with a listbox of
  results, label visually hidden, search icon prepended).
- Skeleton slot (`.add-product-card-skeleton`): 186 × 186, background #F2F2F2, no border, nothing inside. Hidden at
  390.
- "Show only differences" (`.sticky-menu__checkbox`): padding-top 16px; `g-checkbox` label: box + text 16px / 16px,
  text starts 24px from the box (padding 8px 0 8px 24px). Unchecked by default.
- Empty page: header, then the + tile and four skeleton slots only; no checkbox, no table, no message.

## Sticky behaviour
- After scrolling past the bar, `#sticky-menu` gets `.active`, becomes `position:fixed; top:0` (full width, white,
  184px tall at 1440): each card collapses to a 60 × 60 image with the name (14px, 2 lines) beside it and the ×; the
  price and Shop are hidden; the + tile shrinks to a 60px icon; the checkbox stays.

## Spec groups (`#app-body`)
- Same 1024 / 16px container. One `g-collapsible-region` per group, `margin-bottom:16px`.
- Heading row: `div role=button aria-label="Collapse <title>"`, flex, `align-items:center`, pointer. h2 Oswald 400
  uppercase 32px / 40px, tracking 0.8px, margin 24px 0, padding 8px (390: 24px / 30px). Chevron
  (`viewBox 0 0 18.2 11.2`, 14 × 10) right after the title (`margin-left:4.8px`), rotated 180° when open; at 390 it sits
  at the far right (title `flex-grow:1`). Focus-visible UA ring. All groups open by default.
- Group order and names are Garmin's own (e.g. "What You'll Love", "General", "Sensors", …).

## Spec row
- Each spec is its own `<table>`: `thead > tr > th[colspan=5]` = the label band, `tbody > tr` = one `td` per slot.
- Label band: full container width (992 at 1440, 358 at 390), 30px tall, background #F2F2F2, `border-top:1px solid
  #D9D9D9`, padding 5.6px 16px, Roboto **12px / 18px 700 uppercase**, left. Some labels are links (underline,
  hover/active #333).
- Value cell: 198px (= 992 / 5) at 1440, 179px (= 358 / 2) at 390; padding 16px; 14px / 21px 400; left/top aligned;
  `border-right:1px solid #D9D9D9` on every cell but the last. A product without the spec gets an empty cell; empty
  slots (+ tile / skeleton columns) also get empty cells.
- Row height 83px for a one-line value (30 band + 53 cell).

## Colours
- Text #000, band #F2F2F2, rules #D9D9D9, Shop #6DCFF6 / #0FB0F0, link active #333, focus ring #101010.

## Our implementation (src/components/CompareTool.tsx)
- Same container (max-w 1024, px 16), five slots at ≥1024px, header, chevron link, h1, card metrics, + tile and
  skeletons, checkbox, group headings, label band and cells as above.
- Additions the owner asked for: a size `<select>` per column (only with 2+ variants), the product name links to the
  product page, and the + tile opens a server-side catalogue search (GET `q`, max 8 results).
- Under 1024px the columns scroll horizontally (each column half the viewport minus gutters, so two are visible) and
  the label text stays pinned to the left edge of the scroller (`sticky left-0`) while the band spans every column.
- Semantics: one ARIA table per group (columnheader per product, rowheader per spec, cell per value).
- Compact bar: when the cards leave the viewport (IntersectionObserver) a fixed, aria-hidden bar repeats each
  column (60px image, name, size label) on the same grid, and mirrors the table scroller's scrollLeft under 1024px.
- Not copied: USD formatting (tenge via `Price`), "and up" (each
  column shows the chosen size's exact price, so there is no price range to qualify).

## Catalogue compare mode (`/c/wearables-smartwatches/?compare=1`, task C-c)
Measured 2026-11-21: `inspect.mjs section … '.compare-banner'` and `'.product-card__compare-card'` at 1440 and 390
(`docs/research/www.garmin.com/compare/section-compare-banner-*.json`, `section-compare-product-card-*.json`, shots
`docs/design-references/garmin.com/compare-banner-*.png`, `compare-product-card-*.png`). `states` on
`.product-card__compare-button` returned no controls (Vue renders them after the probe), so the states below come from
a CDP probe that clicked three "+" buttons and read computed styles.

- **State**: Garmin keeps the selection in the URL: `?compare=1&compareProduct=<id>&compareProduct=<id>…` (no storage).
  The Compare link is `/compare/?compareProduct=…`. Cards with several versions need "Select a Version" first.
- **Toggle** (rail, `.compare-toggle-button`): large light button 176 × 54, white, 1px black, 16px 500 uppercase,
  padding 16 32. When active, a 20 × 20 close icon follows the label (`margin-left:16px`).
- **Banner 1440** (`.compare-banner--active-and-sticky`): full width, between the hero and the rail/grid row,
  `position:sticky; top:0` (it stays at the top while the grid scrolls), `z-index:2`. Background #F2F2F2, 1px #D9D9D9
  top and bottom rules, padding 16, `justify-content:flex-end`, 87px tall. Contents, right-aligned:
  - search input 238 × 53, white, 1px #D9D9D9, padding 14 14 14 40 (icon at left), 16px / 23.2px, placeholder
    "Search for Products" (label visually hidden; awesomplete combobox, listbox white with the raised shadow, 3.2px
    below the input).
  - five slots 52.8 × 52.8, 8px apart, 8px after the input. Empty: transparent, 1px #D9D9D9. Filled: white, 1px black
    frame, image contained, × (16px, black, top-right, hit area ~47 × 46).
  - COMPARE 140 × 52, 8px after the slots, `g-button` large: candy blue #6DCFF6 with products; with none, #D9D9D9 and
    `cursor:not-allowed`.
  - The rail sticks under the banner (`top:96px`).
- **Banner 390**: `position:fixed` to the bottom of the viewport, full width, 247px tall, raised shadow, column: slots
  75 × 75 (8px apart, `padding-top:5.6px`), the search full width 12px below, COMPARE full width 52px tall 16px below.
  Garmin caps mobile at two products (the third "+" does nothing).
- **Card in compare mode** (`.product-card__compare-card`): background #F2F2F2, same shadow, a top action row
  (`padding:16px`, flex end, 88px tall): "Select a Version" dropdown 265 × 56 (only multi-version products) and the
  56 × 56 button: black, white "+" 40px / 56px, `aria-label="Add to comparison"`. Selected card: transparent (white)
  background, `outline:2px solid #000`; the button turns transparent with a black "×" 40px,
  `aria-label="Remove from comparison"`. The button sits inside the card link on Garmin.

### Our implementation (CompareBar.tsx, ProductCard.tsx, CatalogueGrid.tsx)
- Selection in localStorage (`garmin-compare-v1`, in-memory fallback), max 5 at every width; `compare=1` in the URL.
  A catalogue link may carry `item=<id>~<sku>`: it is added to the selection and removed from the address.
- 1440: same banner box, position and metrics (measured: input 733/238×53, slots 979…1276 at 53px, Compare 1284/140×52,
  87px tall). Garmin's empty left side holds our status line ("Select at least 2 products" / "3 of 5 products
  selected" / the limit note) and "Clear all". The banner sticks inside the catalogue block, so it never reaches the
  footer; the rail sticks at `top:87px`.
- 390: `position:sticky; bottom:0` inside the catalogue block instead of fixed (it cannot cover the footer or the
  "Next Products" link; it appears once the catalogue scrolls into view). Five slots of (100% − 32px) / 5 = 65px
  (Garmin: two of 75px). Order as Garmin (slots, search, Compare), then status and "Clear all".
- Card: same grey card, 16px action row and 56px black "+"; selected = white + 2px black outline, ✓ instead of ×. The
  control is a real button with `aria-pressed`, visible text "Add to comparison" / "Added" plus the product name for
  screen readers, `aria-disabled` + `aria-describedby` (the bar's limit note) at five. It is a sibling of the product
  link, never inside it. No version dropdown: a card adds the product's default variant; sizes are chosen on the
  compare page or the product page.
- Compare is a link to `/[lang]/compare?item=…` (compareHref) from two products; below that a disabled button.
