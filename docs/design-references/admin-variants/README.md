# Admin: options, variants, accessories & compatibility — design contract (M6)

Extends the M3 contract in `../admin-products/README.md` (same sheet, tab rail, sticky save bar, Garmin control language, square controls from `src/components/admin/ui/shape.ts`, badge pills). Only the Variants tab and the Accessories & compatibility tab change.

## Who and what

- **User:** a content manager filling the Kazakhstan Garmin catalog, not a developer. Most products are imported from garmin.com (fēnix 9 Pro: Case size 43/47/51 mm × colour × edition → 10–40 SKUs); bands and sensors are often created by hand.
- **Primary tasks:** (1) say what a shopper chooses, (2) give every combination a SKU, price and stock and put it on sale, (3) fix many variants at once, (4) say which watches an accessory fits, from either product.
- **Owner's words:** "make it more easy to understand and easy to use, like positions of buttons, UI and design".

## References (evidence and limits)

- The UIZZE MCP (`find_ui_references`) is **not connected** in this session, so no screens were retrieved or inspected from it. The patterns below are the well-known structure of Shopify's product editor (Options card with value chips, variant list with group-by and "Edit" bulk sheet) and garmin.com's own "Compatible devices" tab (`docs/research/www.garmin.com/NAV_AND_FILTERS.md`: flat list of device names; watch Accessories tab grouped Apps … Sensors). They are described from knowledge, not freshly captured.
- Band widths per case size: `docs/research/www.garmin.com/ACCESSORY_TAXONOMY.md` (QuickFit 20 ≈ 40–43 mm, 22 ≈ 45–47 mm and every MARQ, 26 ≈ 50–51 mm and every Enduro).

## Variants tab — composition

One column, three numbered steps, read top to bottom. The step number is a black square with a white numeral (Knockout), the step title is an uppercase Knockout heading, the help line is Roboto 13 px #666.

1. **"What do customers choose?"** — one card per option.
   - Card header: option name input (left, grows), "Shown as" segmented control `Buttons | Swatches | Dropdown` (a radiogroup, arrow keys move), move up/down, remove.
   - Values are chips inside one bordered field that ends with a text input: type and press **Enter** or **comma** (pasting `43 mm, 47 mm, 51 mm` adds three). Chips drag to reorder; with the keyboard, focus a chip and press **Alt+←/→**. **Delete/Backspace** on a focused chip removes it. Clicking a chip opens a small editor (label, and for swatch options a colour and a product photo). Swatch chips show their colour/photo dot.
   - Empty state: "Sold as one item (one SKU)" plus presets `+ Case size`, `+ Color`, `+ Edition`, `+ Custom option`. Presets that are already used disappear.
2. **"Variants"** — the sync bar sits between the options and the list, and is the only place the generate action lives:
   - out of sync → yellow-edged bar: "Options changed. Applying will create 6 · keep 27 · remove 2." primary button **Apply to variants**. If anything would be removed the button turns into a second step: "Remove 2 variants and apply" (danger) + Cancel, inline, no browser dialog. Over 100 combinations shows a warning, over 500 disables the button with the reason.
   - in sync but combinations missing (imported partial matrix) → quiet line "4 combinations are not variants yet" + link "Add them as drafts".
   - in sync → nothing (no button to press).
   - Summary line under the step title: **"33 variants · 21 ready to sell · 12 out of stock"** (+ "· 3 drafts", "· 2 SKU problems" when present).
   - Toolbar: select-all checkbox, "Select…" menu (All, None, Not ready, Out of stock, then *All 51 mm*, *All Black* … per option value), a filter per option ("All Case size"), "Not ready only" toggle.
   - List, not a 860 px table: at ≥1024 px a CSS grid row `☐ | photo | variant (value chips + default star + ready state) | SKU | price | stock | status | more`; below 1024 px each row is a card (chips and state on top, SKU full width, price/stock/status in a 3-column row). No horizontal scroll at 390 or 1440.
   - **Ready to sell** per row = status Active + price > 0 + stock > 0 + SKU present. Shown as a lime dot "Ready to sell", otherwise a grey/red text naming the first blocker ("Out of stock", "Draft — hidden", "No price", "No SKU").
   - **Default variant**: a star in the variant cell, filled + "Default" for the one shoppers land on; others show an outline star ("Make default").
   - **More** (chevron, `aria-expanded`): compare-at price, Garmin source price (read-only), variant title, the per-variant photo picker (click to use, star = main photo).
   - Inline validation under the SKU field: "SKU is required", "Duplicate SKU in this product", "SKU already used by another product" (from the 409).
   - First 100 rows render; "Show all 240" below (500 is the hard limit).
3. **Bulk bar** — appears only while rows are selected, sticky to the bottom of the scroll area right above the save bar: "12 selected" · Price · Compare-at (0 clears) · Stock · Status · **Apply** · Clear. Black bar, white text, so it reads as a mode.

## Accessories & compatibility tab — composition

The tab decides its first section from the product's categories: a product in an **accessory** category (Bands, Sensors … or a group under them) is an accessory, everything else is a device. A product that already has links on the other side shows both sections.

- **Compatible devices** (accessory): each link reads back as garmin.com does — a sentence per row: "fēnix 9 Pro – 51 mm (all 14 variants)", "Forerunner 970 (all variants)", "fēnix 9 Pro – SKU 010-03204-00 (1 variant)", with the device thumbnail, its primary category and a remove button. Actions: primary **Add devices**, secondary **Copy from another accessory**.
  - Add devices dialog, step 1: search, or browse *Watch series → fēnix → products* / catalog categories → products. Step 2: the chosen device's option values as toggle chips with variant counts ("51 mm · 14"); none chosen = all variants; one link per chosen value; "Exceptions: specific variants" expander with SKU checkboxes; optional "Only this accessory SKU" when the accessory has variants. A live preview sentence and **Add link**; the dialog returns to step 1 so several devices can be added in a row.
  - Smart hint: an accessory in QuickFit 20/22/26 shows "QuickFit 26 mm usually fits the 51 mm case" and preselect button **Use 51 mm** when the device has a matching value (MARQ → 22, Enduro → 26 whole device).
- **Accessories** (device): every accessory that fits, grouped by accessory category in garmin.com's order (Apps, Service Plans, Bands, Dive Bands, MARQ Straps & Bracelets, Cables & Chargers, Cycling Accessories, Heart Rate Monitors, Sensors, Other). Whole-device links have a remove button. Finer links made on the accessory ("51 mm only") are read-only here with a lock and an **Edit on accessory** link (ownership rule D-C1).
  - Add accessories dialog: accessory category list → its groups (QuickFit 22 mm …) → products with checkboxes, **Add whole group (N)**; or search first. Products already linked show checked; finer links show "51 mm only (set on the accessory) — ticking adds all variants".
- **Related products / You may also like** — unchanged picker, moved below.
- Writes go only through `compatibility.devices` / `compatibility.accessories` / `relations`. A side the user did not touch is sent back exactly as GET returned it.

## States

Variants: no options (simple product), options without values, out of sync, partial matrix, >100 warning, >500 blocked, removal confirm, empty filter result, SKU errors, 409 SKU conflict, selection/bulk, focus from the SKU drawer. Compatibility: loading taxonomy/picker/device (skeletons), load error with retry, empty links, device without options (only "all variants"), duplicate add (merged; "already fits all variants"), copy source without links, unsaved, 409 after the other editor saved (reload message from the save bar).

## Finish gate

- No horizontal page scroll at 390 and 1440; every control keyboard-reachable with the 2 px black focus outline; segmented control and chips operable by keyboard.
- Browser: link a QuickFit 26 band to fēnix 9 Pro "51 mm" from the band, add the QuickFit 22 group from the watch, reopen both and see matching readbacks; bulk-edit variants. Screenshots `before-*` / `after-*` at 1440 and 390 in this folder.

## Finish-gate result

(filled in after verification)
