# Admin products: design contract (M3)

- **Purpose:** operate. Content managers find a product or SKU fast, fix price/stock in seconds, and fill a full product without a cramped modal.
- **Composition:** list page = title + count, view toggle (Grouped / All SKUs) and primary "Add product" on one line; one filter row; one dense table. Editor = full-viewport sheet: sticky header (close, name, status pill, unsaved dot, Import, Preview), left tab rail (scroll strip below `lg`), content max 1120 px, sticky save bar with the save state on the left.
- **Type / colour / material:** garmin.com language from `docs/research/www.garmin.com/CONTROLS.md`. Headings Knockout/Oswald uppercase, body Roboto 13–14 px, tabular numbers for prices and stock. Black primary, white secondary, 1 px #D9D9D9 lines, square controls (shape token in `src/components/admin/ui/shape.ts`), status as Garmin badge pills (lime published/active, gray draft, outline archived, gold low, red out of stock).
- **Responsive:** below `lg` the admin sidebar becomes an off-canvas drawer; tables drop secondary columns (category, variants, price, updated) and keep name + stock; editor tabs become a horizontal strip; the SKU drawer is full width.
- **Required states:** list loading (skeleton rows), empty (no products / nothing matches + clear filters), error (retry), expanded variants loading/error/empty; editor loading, load error, unsaved, saving, saved, validation error (jumps to the tab), 409 version/stock conflict (reload), SKU conflict (field error + tab); drawer loading photos, conflict, network error.
- **Finish condition:** no horizontal page scroll at 390 and 1440, every control keyboard reachable with a visible focus ring, list → drawer → save and editor create → save → reopen verified in the browser.

Screenshots: `before-*` (legacy screens at 3c3dc3e) and `after-*` (this work), each at 1440 and 390.
