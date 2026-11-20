# Garmin-style compare + follow-ups — Plan

## Progress
| Status | Done | Last updated | Next action |
|---|---|---|---|
| Executing | 0/10 | 2026-11-21 | Tracks F and C running |

Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked · `[-]` dropped

## 1. Why
The owner wants product comparison to work like garmin.com's, but on the store's real specs, and — because each size now has its own specs — comparing a 47 mm against a 51 mm must work. The follow-ups left after beta4 are fixed in the same round. Everything is pushed to `beta4`.

## 2. Reference: garmin.com compare (observed 2026-11-21, /en-US)
- Catalogue: **Compare** button toggles compare mode (`?compare=1`). Every product card gets **"Add to comparison"**. A **sticky compare bar** appears: 5 slots with product thumbnails (× to remove), a "Search for Products" box to add more, and a **COMPARE** button → `/compare/?compareProduct=<id>&compareProduct=<id>…`.
- Comparison page: "‹ Return to shopping", h1 **Product Comparison**, up to 5 product columns (image, name, price "and up", **Shop**, ×), a **+** tile while slots are free, **"Show only differences"** checkbox, then the full spec sheet: **collapsible groups** (h2, Garmin's own group names in source order, e.g. "What You'll Love", General, Sensors, …); each spec is a full-width label band (12px bold uppercase on grey) with one value cell per column underneath; a product without that spec shows an empty cell.

## 3. Design (owner chose A: size picker per column)
**Data**
- One server read `getCompareItems(items, locale)` reusing the product-detail read (both PostgreSQL and legacy), returning per item: product id, name, image of the chosen variant, price of the chosen variant (shared `Price`/`formatKzt`), the variant list (sku, label from option values) and the **effective, localized** content of the chosen variant (`specGroups`, falling back to flat `specs` as one group).
- URL is the source of truth: `/[lang]/compare?item=<productId>~<variantSku>` repeated, max 5. `~<sku>` optional (default variant). Old `?selected=<id>` links keep working. Unknown products/SKUs are dropped/fallback, never 500.

**Spec table**
- Rows = union of groups in first-seen order across columns; inside a group, union of spec labels in first-seen order. Labels match case-/whitespace-/trademark-insensitively (e.g. "Battery life (smartwatch mode)" = "BATTERY LIFE (SMARTWATCH MODE)").
- "Show only differences" hides a row when every non-empty value is the same and no column is blank (Garmin behaviour); hides a group if all its rows are hidden. State in the URL (`diff=1`).
- Groups are collapsible (all open by default), keyboard accessible (`aria-expanded`).
- Mobile (<1024px): columns scroll horizontally with the label band kept full width; at least 2 columns visible.

**Size picker per column**
- Each column shows a select of that product's variants (labels like "47 mm · Slate Gray"); changing it rewrites that column's `item` in the URL; price, image and specs update. The same product may appear twice with different sizes.

**Catalogue entry (like Garmin)**
- The catalogue **Compare** button toggles compare mode; cards show **Add to comparison** (✓ Added when chosen); a sticky bar with 5 slots, × per slot, a product search to add, and **Compare** (disabled under 2). Selection persists across catalogue pages in `localStorage` (per-viewer convenience, try/catch), and the bar links to the compare URL. The PDP gets an **Add to comparison** link that adds the currently selected variant.

**Copy & style**: Garmin wording ("Product Comparison", "Add to comparison", "Show only differences", "Return to shopping", "Shop"), existing Garmin tokens, EN/RU/KZ messages.

## 4. Follow-ups in the same round
1. Mobile product tabs render the open tab's body twice (hidden copy) → render one panel.
2. A product can be saved/published with price 0 → require price > 0 to publish (client + server).
3. Demo order limit (5/24 h, shared per address, no reset) → configurable limit (`DEMO_ORDER_LIMIT`, default 5) and **staff sessions exempt**; documented.
4. Legacy JSON default original price = price × 1.1 (fake sale) → no default.
5. Chained SKU rename in one save (A→C, B→A) could map two variants to one row → match by stable editor id first, then SKU.
6. Catalogue **Z→A** sort (Garmin has it) → add `name_desc`.
7. Card colour dots (Garmin cards show swatches) → show from variant colour options when the data has them; otherwise no dots (no invented data).
8. Duplicated demo-refund settle code (payments vs aftersales) → one shared helper.

## 5. Non-goals
Sharing/printing compare, comparing accessories against watches by category rules, new spec data, legacy-mode visual polish.

## 6. Acceptance (each verifiable)
- C1 integration: compare read returns effective per-variant specGroups for `item=id~sku`, localized RU, unknown sku → default, unknown id dropped, >5 items capped.
- C2 unit: row union + label matching + "only differences" rules.
- C3 browser smoke: catalogue compare mode → add 2 products → bar → Compare → table shows grouped specs; switch column 2 from 47 to 51 mm → its specs change, URL updated; "Show only differences" hides equal rows; remove a column.
- C4 visual: side-by-side with garmin.com compare at 1440/390 (`scripts/clone/diff.mjs`), remaining differences content only.
- F1–F8 each with a test.
- Full gate: typecheck, lint, unit, legacy, boundaries, integration, build, full `test:cms-ui` (webpack) green; then push `beta4`.

## 7. Tasks
Branch `feat/compare-followups` from `beta4` (90024bd). Two parallel tracks in their own worktrees (disjoint files), merged at the end. Each task: implementer → task review → fix loop. Global constraints as in the 2026-11-19 plan (TypeScript strict, no `any`, Tailwind only, PostgreSQL first and legacy kept working, authorize + version checks, EN/RU/KZ keys in sync, money only through `formatKzt`/`Price`, Garmin tokens, no slop).

### Track F — follow-ups (worktree GRMN-wt-f)
- [ ] **F-a (items 2, 4):** publish requires price > 0 (server `cms.save`/status/bulk publish → 409/400 with readable message; admin form validation); legacy JSON save sets no default compare-at. Tests: integration (publish 0 refused, draft 0 allowed), legacy unit.
- [ ] **F-b (items 3, 8):** `DEMO_ORDER_LIMIT` env (default 5, 0 = unlimited) in env config + .env.example + deploy/env.example; staff sessions exempt from the demo cap; one shared demo-refund settle helper used by payments and aftersales. Tests: integration (env limit, staff exempt), existing refund tests green.
- [ ] **F-c (item 5):** product projection matches variants by stable editor id first, then SKU; chained rename (A→C, B→A) in one save keeps both variants, their stock and overrides. Test: integration.
- [ ] **F-d (item 1):** ProductTabs renders one panel (mobile accordion vs desktop tabs) with no hidden duplicate; keeps ownsOverview/variant swap and aria. Test: unit render.

### Track C — compare (worktree GRMN-wt-c)
- [ ] **C-a:** `src/lib/compare/` pure helpers — parse/serialize `item=<id>~<sku>` (max 5, legacy `selected`), label normalisation, row union, "only differences" rule; server read `getCompareItems(items, locale)` reusing the product-detail read. Tests: unit (C2), integration (C1).
- [ ] **C-b:** compare page + `CompareTool` rewrite: header, columns (image, name, price, Shop, ×, size picker), + tile, "Show only differences" (`diff=1`), collapsible spec groups, mobile scroll, messages EN/RU/KZ, Garmin styling per measured tokens. Test: unit render.
- [ ] **C-c:** catalogue compare mode: Compare toggle, "Add to comparison" on cards, sticky 5-slot bar with search + Compare, localStorage persistence; PDP "Add to comparison" (selected variant). Test: unit for the store helper.
- [ ] **C-d (items 6, 7):** `name_desc` (Z→A) sort end to end; card colour dots from variant colour options when present. Tests: integration (sort), unit (dots only when data exists).
- [ ] **C-e:** browser smoke block `compare` (C3) + garmin.com side-by-side diff at 1440/390 (C4); screenshots to receipt, docs copy only with CMS_SMOKE_SAVE_SHOTS=1.

### Final
- [ ] Merge both tracks; full gate (typecheck, lint, unit, legacy, boundaries, integration, build, full cms-ui); whole-branch review; fix wave; push `beta4`.

## Revisions
- 2026-11-21: owner chose A (size picker per column).

## Result
_(at the end)_
- 2026-11-21: design approved by owner.
