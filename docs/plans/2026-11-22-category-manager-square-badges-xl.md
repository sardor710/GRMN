# Category manager, live accessory types, square badges, no "demo" for customers — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Executing | 1 | 0/56 | 2026-11-22 | M1 Task 1.2 (customer wording) |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 0. What the code does today (findings, 2026-11-22)

- **Badges.** Status, stock and DEMO labels are pills. Most come from three places:
  - `src/components/admin/ui/StatusBadge.tsx` (`rounded-full`, garmin.com `.g__badge` palette)
  - `src/components/DemoBadge.tsx`, through `src/components/ui/badge.tsx` (tone `demo`)
  - `rounded-garmin-pill` spans in `OrdersScreen.tsx`, `FulfillmentScreen.tsx`, `StatusMenu.tsx`, `LocaleTabs.tsx`, `ProductPreviewModal.tsx` and `HomepageScreen.tsx`

  Small round dots appear in `StatusSelect.tsx`, `ProductEditor.tsx` ("Unsaved changes") and `VariantsTable.tsx`. Admin buttons, selects and inputs are already square (`src/components/admin/ui/shape.ts`, owner choice 2026-11-22). Badges were left as pills on purpose.
- **Customers see "demo" wording** in eight places:
  - `CheckoutPanel.tsx`: DemoBadge, "Pay (demo)", "Place demo order", sandbox notice
  - receipt: "Demo payment — no money was charged."
  - `AccountDashboard.tsx`: DEMO badge ×3, "Paid (Demo)", "Demo order — no money was charged."

  All of these are `messages/{en,ru,kk}.json` keys.
- **Storefront top menu is hardcoded.** `src/lib/homepage-nav.ts` (`megaNav`, 496 lines) holds the menu. Labels are message keys (`Header.*`) translated into en/ru/kk, and `src/components/home/HomeHeader.tsx` renders it. Each top item has up to 3 columns:
  - a **Products** group (category links)
  - non-category groups: Maps, Accessories & Plans, Discover, links to garmin.com tools, `/minisite/*` pages
  - promo images

  Some subcategories appear under several top items. For example, Running appears under both Smartwatches and Sports & Fitness.
- **Categories table exists and is empty on production.**
  - `categories` (parent tree, `kind` catalog|accessory|group, slug, preset_filters, nav_visible, position, archived) and `product_categories` (many-to-many, one primary).
  - Production has **0 categories and 0 product_categories** for 11 products. The `/c/` pages fall back to the legacy listing.
  - A seed of 112 nodes (`src/server/catalog/taxonomy-seed.ts`) mirrors the menu and includes:
    - catalog roots and subcategories
    - 9 accessory categories (Apps, Service Plans, Bands, Dive Bands, MARQ Straps & Bracelets, Cables & Chargers, Cycling Accessories, Heart Rate Monitors, Sensors)
    - band-size groups (QuickFit 20/22/26, Quick Release 18/20/22, Lily, MARQ straps/bracelets)
    - a hidden "Watch Series" group (fēnix, epix, Forerunner, Venu, vívoactive, Instinct, Enduro, MARQ, quatix, tactix, D2, Descent, Approach, Lily, vívomove, Bounce, Edge)

  It was only ever applied by `scripts/dev/seed.mjs`. Category names are single-language. `alsoListedUnder` lives only in the seed, not in the DB.
- **Series filter.** `src/server/catalog/category-page.ts` builds the Series facet from a product's categories under `watch-series`. It falls back to the free-text `products.family` (model names such as "fēnix 9" and "Forerunner 970"). `src/server/catalog/category-match.ts` already maps family → series (longest prefix).
- **Accessories / Compatible Devices tabs exist.**
  - `src/components/ProductTabs.tsx` uses garmin.com order: Overview, Specs, In the Box, Accessories, Maps, Compatible Devices.
  - `ProductAccessories.tsx` groups by top accessory category. `CompatibleDevices.tsx` uses the wording "fēnix 8 – 47 mm". Both read `product_compatibility` (`src/server/catalog/compatibility-public.ts`).
  - A tab with no rows is hidden. Production has **0 compatibility rows**, so neither tab ever shows there.
  - The editor's "add whole group" (`CompatibilityTab.tsx` `addGroup`) copies the group's current products into rows. It is a snapshot, not a live link.
- **Translations.** Products use `product_translations` (`src/server/db/schema/content.ts`) and an admin auto-translate API (`/api/admin/translate`). Russian and Kazakh menu labels exist in `messages/ru.json` / `messages/kk.json` (`Header` namespace).
- Latest migration is `drizzle/0027_catalog-stock-purge.sql`. Production runs `9da8fdf` on branch `beta5` (see memory `grmn-production`).

## 1. Requirement

- **Goal:** the owner manages, from the admin, everything that organises the catalog:
  - the categories and subcategories shown in the top menu
  - accessory categories and their types (band sizes, charger types)
  - the series used by the Series filter

  Shoppers see a watch's compatible accessories, and an accessory's compatible devices, as on garmin.com. The admin shows statuses as square garmin-style boxes. Customers never see the word "demo".

- **Deliverables:**
  1. **Square badges in the admin (owner picked option A).**
     - Every status / stock / DEMO / payment / fulfillment label in `/admin` becomes a rectangle with radius 0, keeping today's garmin.com colours.
     - Small round status dots in the admin become small squares.
     - Merchandising badges (New/Sale) and storefront pills are unchanged.
  2. **No "demo" wording for customers.**
     - On every customer-facing screen (checkout, receipt, account orders, order detail), in en/ru/kk:
       - the DEMO badge becomes a **light-blue dot** in garmin.com candy-blue `#6DCFF6`, with an accessible label
       - "Place demo order" becomes "Place order", "Pay (demo)" becomes "Pay", "Paid (Demo)" becomes "Paid"
       - demo notices are replaced by **one neutral line at checkout and on the receipt: "No payment is taken for this order."** (translated)
     - The admin keeps its DEMO labels (as square boxes, deliverable 1).
  3. **Admin ▸ Categories**: a new sidebar item directly under Products, with three sections:
     - **Menu categories.** A tree of top menu items (Smartwatches, Sports & Fitness, Aviation…) and their subcategories.
       - Create, rename, reorder, hide from menu, and delete.
       - A subcategory can be placed under several top menu items, each with its own order, so Running can sit under both Smartwatches and Sports & Fitness (see C1).
       - Each row shows its product count.
     - **Accessories.** Accessory categories (Bands, Cables & Chargers, Sensors…) and the types inside them (QuickFit 22 mm, charger types). Create, rename, reorder, delete at both levels.
       - Charger types start empty; the owner adds them.
       - Accessory categories already linked from the menu (Apps, Service Plans, Cycling Accessories) stay linked, and renaming them renames the menu link.
     - **Series (filters).** A flat list (fēnix, Forerunner, MARQ, Venu…). Create, rename, reorder, delete. Used only by the Series filter, never shown in the menu. A series with no products does not appear in the filter.
     - **Names in three languages.** Every name has EN / RU / KK fields. The existing auto-translate can fill RU/KK.
     - **Delete is blocked** when products, child categories or compatibility links are still attached. The block shows the counts, so the owner moves them first.
  4. **The storefront top menu is built from Menu categories.**
     - Top items and each item's **Products** group come from the DB, in admin order, in the visitor's language.
     - Non-category columns (Maps, Accessories & Plans, Discover, garmin.com tool links, `/minisite/*` links) and promo images stay as they are in code.
     - Adding, renaming, hiding or deleting a category changes the menu.
  5. **Initial load on production.**
     - The 112-node tree is loaded with RU/KK names taken from the existing `Header` messages, so the menu looks the same on the day it goes live.
     - Each of the 11 existing products gets its menu categories and its series, using the existing `category-match.ts` logic.
  6. **Product editor: series picker.** "Family / series" becomes:
     - a **Series** dropdown fed by the Series list (saved as the product's series category)
     - a **Model name** text field (today's `family` value, still shown on the product page)
  7. **Live type links (accessory compatibility).**
     - In "Accessories & compatibility" a device can be linked to an accessory **type** (e.g. a charger type or QuickFit 22 mm), not only to individual accessories.
     - An accessory filed under that type later appears automatically on the device's Accessories tab, and the device on that accessory's Compatible Devices tab.
     - Type links can be narrowed to an option value (e.g. fēnix 8 47 mm → QuickFit 22 mm), as row links can today.
  8. **Accessories and Compatible Devices tabs, checked against garmin.com.**
     - Compare ours with garmin.com's QuickFit 22 page (/p/553030/) and its charging/data cable page, and fix layout differences.
     - Each tab shows on every product with at least one link (individual or type). Empty tabs stay hidden.

- **Constraints:**
  - Production is live, with customers and a Telegram group that receives order notifications. Test checkouts belong on staging.
  - Deploy follows memory `grmn-production`: pre-deploy dump, images `grmn:<commit>`, migrations with the ops image, `up -d app worker proxy`, `restart proxy`.
  - Migrations must be additive, so the previous image `9da8fdf` can still run after a rollback.
  - New admin HTTP handlers build URLs with `requestURL()` (`src/server/auth/request-url.ts`).
  - Next.js 16. Read `node_modules/next/dist/docs/` before using a Next API. TypeScript strict, no `any`.
  - The admin control shape stays square (`ADMIN_CONTROL_SHAPE`).
  - Work happens on branch `beta5`. No commits without the owner asking.
- **Non-goals:**
  - Changing storefront merchandising badges (New/Sale).
  - Making non-category menu columns or promo images editable.
  - A Series filter on accessory pages. Charger types are compatibility only, not a filter.
  - Pre-filling charger types (owner adds them).
  - Filling in actual compatibility data for the 11 products (the owner does that in the editor). Bulk import of compatibility from garmin.com is out of scope.
  - Changing checkout behaviour or the demo purchase rules. Only the wording changes.
  - Switching garmin.kz.
- **Assumptions:**
  - Nested depth: menu = 2 levels (top item → subcategory), accessories = 2 levels (category → type), series = 1 level. The DB allows more, but the UI offers these.
  - Hiding a category removes it from the menu but keeps its `/c/` page reachable. Delete removes both, and is only allowed when nothing is attached.
  - The legacy `products.family` column stays (model name), so the old image keeps working.
- **Open questions:** none from the owner.

### Builder's calls (from the design review, 2026-11-22; owner can override)
- **C1 Menu placements are their own rows.**
  - A top item's **Products** group is an ordered list of placements: (top item, category, position, optional link target). It is not "the top item's children".
  - The same category can be placed under several top items, each with its own position. This replaces "Also show under".
  - The admin tree shows each top item's placements and reorders them per top item.
  - The seed loader creates placements in today's `megaNav` order, so A6 holds for labels, hrefs and order.
- **C2 Category links in code-owned columns follow the DB.**
  - Links in the code columns (Accessories & Plans, Maps…) that point at a category (Apps, Service Plans, Outdoor Maps, Smartwatch Accessories, Marine Apps…) reference it by `key`.
  - Their label comes from the DB in the visitor's language. Hiding or deleting the category removes the link.
  - The column layout itself stays in code.
- **C3 Special link targets are kept, not editable in this round.**
  - A placement or top item may carry a fixed link target, seeded from today's menu:
    - Sports & Fitness opens Running
    - MARQ → `/minisite/marq`
    - "All Smartwatches" = the Smartwatches root
  - The admin shows the target read-only. New categories link to their own `/c/<slug>`.
- **C4 The Series filter drops the `family` fallback.**
  - A product without a series is simply not in the Series filter, so model names never return.
  - Presets that name a series (MARQ collection) reference the series by its stable `key`, so a rename does not break them.
- **C5 Translated names apply wherever shoppers see a category:** menu, `/c/` page title, breadcrumbs, Series filter labels, and Accessories tab group headings.
- **C6 Other details.**
  - Delete is also blocked by promotion and price-rule links (both shown in the counts).
  - While the DB has no categories, the menu falls back to today's code menu, so a failed load never empties the header.

### Approaches considered
| Topic | Options | Picked |
|---|---|---|
| Menu vs categories | (a) admin categories drive the top menu; (b) admin manages categories for products only, menu stays in code | **(a)**, owner: "categories already written in top menu… same with sub categories" |
| Admin badge look | (A) square boxes, same colours; (B) coloured text, no box (pale lime/yellow unreadable on white, colour coding weaker) | **A**, owner |
| Customer demo label | keep DEMO text; light-blue dot only; dot + one neutral "No payment is taken" line | **dot + one line**, owner (protects against customers thinking they paid) |
| Accessory "whole group" | snapshot copy (today); live link to the type | **live link**, owner approved "those 3 steps" |
| Series | free-text family; series list in taxonomy + dropdown | **series list + dropdown**, owner: "just for filters… fenix, forerunner, marq, venu" |

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | No admin status/stock/DEMO/payment/fulfillment badge has a border radius (computed `border-radius: 0px`) | auto | browser check over `/admin`, `/admin/products`, `/admin/orders`, reports, product editor |
| A2 | No customer-facing page or message contains "demo" (case-insensitive) in en/ru/kk; a demo order shows a `#6DCFF6` dot with an accessible label; checkout and receipt show "No payment is taken for this order." | auto | unit scan of `messages/*.json` customer namespaces + browser smoke on staging demo order |
| A3 | Admin ▸ Categories: create, rename (EN/RU/KK), reorder, hide and delete a menu subcategory; the storefront menu reflects each change after reload | auto | integration test of the category API + browser smoke |
| A4 | Deleting a category with products, children or compatibility links is refused with counts; with nothing attached it succeeds | auto | integration test |
| A5 | One subcategory placed under two top items appears in both, each at its own position; renaming it renames both and any code-column link to it | auto | integration/unit test of menu builder |
| A6 | After the production load, the storefront menu has the same top items and Products links (labels and hrefs, per locale) as before | auto | snapshot comparison of old `megaNav` vs DB-built menu for en/ru/kk |
| A7 | All 11 products have a primary category and a series; the Series filter lists series names, not model names | auto | SQL count on staging after load + category page check |
| A8 | Series and accessory types: create, rename, delete; a series with no products is not in the filter | auto | integration test |
| A9 | Product editor saves Series (dropdown) and Model name separately; product page still shows the model name | auto | integration + CMS UI smoke |
| A10 | Linking a device to an accessory type, then filing a new accessory under that type, shows it on the device's Accessories tab and the device on its Compatible Devices tab without another edit; narrowing to an option value limits it to that size | auto | integration test |
| A11 | Accessories and Compatible Devices tabs match garmin.com's QuickFit 22 and charging cable pages in structure (groups, wording, order) | manual + screenshots | side-by-side screenshots at 1440 and 390 |
| A12 | Previous image 9da8fdf still runs against the migrated DB | auto | staging: migrate, then run old image, load `/`, `/c/…`, `/admin/products` |
| A13 | `npm run check`, unit, integration and `npm run test:cms-ui` pass | auto | commands in section 6 |

Manual spot checks: owner opens Admin ▸ Categories on production, renames one subcategory, and sees it in the menu. Owner places a demo order on staging and sees the blue dot and the neutral line, with no "demo" text.

## 3. Anti-drift
- **Primary objective:** the owner can organise menu categories, accessory types and series from the admin, and what they set is what shoppers see (menu, filters, Accessories / Compatible Devices tabs). Statuses look like garmin.com rectangles. Customers never read "demo".
- **Proxy signals (not success by themselves):**
  - tests and build green
  - the Categories page renders
  - the seed loaded

  None of these counts if the menu on production changed unexpectedly, the Series filter still shows model names, or a tab stays hidden after a link is made.
- **Intended scope:** the 8 deliverables above. Nothing in the non-goals.
- **Completion target:** full delivery, deployed to production after a staging rehearsal (deploy only when the owner says so). If time runs out, the minimum usable cut is deliverables 1, 2, 3 and 5, reported as `Done – partial`.

---

# Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans (or superpowers:subagent-driven-development for parallel units, each in its own worktree). Steps use checkbox syntax; update markers + Progress on every change.

**Goal:** the admin manages menu categories, accessory types and series. The storefront menu, filters and compatibility tabs follow them. Admin badges are square. Customers never read "demo".

**Architecture:**
- Additive migration `0028`: category translations, menu placements, top-item link override, compatibility type links.
- A shared taxonomy loader (dev seed + ops script) loads the seed tree, RU/KK names from `messages`, menu placements in today's `megaNav` order, and product assignments.
- The storefront header gets its menu from a server-built `MegaNavItem[]` passed through a client context, falling back to the static `megaNav`.
- The admin gets new `/api/admin/catalog/categories*` routes and an `/admin/categories` screen.
- Compatibility gains device → category "type links" that are resolved live in the public reads.

**Tech stack:** Next.js 16 (read `node_modules/next/dist/docs/` before using caching/revalidation APIs), React 19, TypeScript strict, PostgreSQL 18 + Drizzle (SQL migrations in `drizzle/`), zod, node:test, Playwright (`/home/nick/tools/browser`).

**Spec:** sections 0–3 above.

## Global Constraints
- Migrations additive only. Image `9da8fdf` must keep working on the migrated DB (A12).
- Admin handlers build URLs with `requestURL()`. Category writes need `catalog:write`; reads need `catalog:read`.
- Locales: `en` (base, `categories.name`), `ru`, `kk`.
- Candy-blue dot: `#6DCFF6`. Neutral line copy (en): `No payment is taken for this order.`
- Admin badges: `rounded-none`, colours unchanged from `StatusBadge` `tones`.
- Category slug regex (existing check): `^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$`. Key and slug are fixed at creation; rename never changes URLs.
- Kinds: menu categories = `catalog`; accessory categories = `accessory`; accessory types = `group` under an `accessory` parent; series = `group` under key `watch-series`.
- No commits unless the owner asks (steps say "stage", not commit). Production deploy only on the owner's explicit go.

## Review Focus
1. **Renaming a category that is also a code-column link** (Apps, Outdoor Maps): every menu that shows it updates, in every locale. Pinned in Task 3.2 test `code-column links follow rename and hide`.
2. **Deleting a series used by the MARQ collection preset:** delete is blocked while the preset references its key. If nothing references it, the preset page shows the empty state, not an error. Pinned in Task 4.1 test `delete blocked by preset reference`.
3. **Two admins editing the tree at once:** the second save gets 409 (taxonomy epoch). Pinned in Task 4.1 test `stale epoch is refused`.
4. **A category hidden from the menu still has products:** its `/c/` page stays reachable, and it disappears only from the header. Pinned in Task 6.1 test `hidden category keeps its page`.
5. **Type link plus an individual link for the same accessory/device pair:** the accessory is listed once on both tabs. Pinned in Task 7.1 test `type and row link do not duplicate`.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Badges + customer wording | Square admin badges/dots; storefront demo dot + neutral line, no "demo" in customer messages | `frontend-developer` (owner), `evidence-collector` (verifier) | `src/components/admin/ui/**`, `src/components/DemoBadge.tsx`, new `src/components/DemoDot.tsx`, `src/components/ui/badge.tsx` (demo tone only), `src/app/admin/**` badge spans, `src/components/admin/{LocaleTabs,products/StatusMenu}.tsx`, `src/components/{CheckoutPanel,AccountDashboard}.tsx`, cart notice, `messages/{en,ru,kk}.json` (Checkout/AccountPortal/Cart keys), `tests/unit/customer-demo-wording.test.mjs` | – |
| M2 Schema 0028 | Tables/columns for translations, placements, top-item href, type links; drizzle schema | `database-optimizer` (owner), `superpowers:test-driven-development` (support) | `drizzle/0028_*.sql`, `drizzle/meta/**`, `src/server/db/schema/catalog.ts`, `tests/integration/schema-0028.test.mjs` | – |
| M3 Taxonomy loader + menu builder | Idempotent loader (tree, RU/KK, placements, product assignment); `buildMegaNav(locale)` with code columns resolved by key; parity with today's menu | `backend-architect` (owner), TDD (support) | new `src/server/catalog/{taxonomy-load,mega-nav}.ts`, `src/lib/homepage-nav.ts` (categoryKey refs only), `scripts/dev/seed.mjs` (call loader), new `scripts/ops/load-taxonomy.mjs`, `tests/{unit,integration}/mega-nav*.test.mjs`, `tests/integration/taxonomy-load.test.mjs` | M2 |
| M4 Admin categories API | CRUD, reorder, placements, translations, delete guards, epoch concurrency, cache revalidation | `backend-architect` (owner), TDD (support) | new `src/server/cms/category-admin.ts`, `src/server/cms/catalog-http.ts`, `src/server/cms/catalog-service.ts`, `tests/integration/category-admin.test.mjs` | M2, M3 |
| M5 Admin Categories UI + editor series | `/admin/categories` (3 sections), sidebar item, editor Series dropdown + Model name | `frontend-developer` (owner), `ui-finish-gate-reviewer` (verifier) | new `src/app/admin/categories/**`, new `src/components/admin/categories/**`, `src/components/admin/AdminSidebar.tsx`, `src/components/admin/product-editor/tabs/GeneralTab.tsx`, `src/components/admin/catalog/useTaxonomy.ts`, `tests/ui/cms-smoke.mjs` (new block) | M4 |
| M6 Storefront follows DB | Header from DB (context + fallback); translated names on /c titles, breadcrumbs, Series facet, accessory headings; Series facet without family fallback; presets by series key | `frontend-developer` (owner), TDD (support) | `src/app/[lang]/layout.tsx`, new `src/components/home/MegaNavProvider.tsx`, `src/components/home/HomeHeader.tsx`, `src/server/catalog/{category-page,local-links,service}.ts`, `tests/integration/catalog-categories.test.mjs` (extend) | M3 |
| M7 Live type links | Device → type links: write (device command), public reads union, editor "Link a type" | `backend-architect` (owner, 7.1–7.2), `frontend-developer` (owner, 7.3) | `src/server/cms/compatibility.ts`, `src/server/cms/product-command.ts` (compat schema), `src/server/cms/catalog-read.ts` (editor payload), `src/server/catalog/compatibility-public.ts`, `src/components/admin/product-editor/{compatibility-state.ts,tabs/CompatibilityTab*.tsx}`, `tests/integration/compatibility-types.test.mjs` | M2 |
| M8 Tabs vs garmin.com | Accessories / Compatible Devices tabs match the QuickFit 22 and charging cable pages in structure and wording | `frontend-developer` (owner), `evidence-collector` (verifier) | `src/components/product/{ProductAccessories,CompatibleDevices}.tsx`, `src/components/ProductTabs.tsx`, `docs/research/www.garmin.com/pdp/compat-*.md` + screenshots | M7 |
| M9 Staging rehearsal + deploy | Prod dump → staging, migrate, load taxonomy, rollback test, smoke; prod only on owner go | `devops-automator` (owner), `reality-checker` (verifier) | `/home/nick/grmn-staging`, `/home/nick/grmn-production` (backups, env), memory `grmn-production` | M1–M8 |

Gaps: none. (No `clone-website` skill is installed in this session. M8 uses Playwright from `/home/nick/tools/browser` for garmin.com recon.)

Waves (at most 2 parallel units, disjoint write scopes; parallel agents use their own worktrees):
- Wave 1: M1 ‖ M2
- Wave 2: M3 ‖ M7 (7.1–7.2 backend)
- Wave 3: M4 ‖ M6
- Wave 4: M5 ‖ M7 (7.3 editor UI)
- Wave 5: M8
- Wave 6: M9 (staging rehearsal; production deploy waits for the owner)

## 5. Tasks

### M1 — Badges and customer wording (wave 1, owner: `frontend-developer`)
**Task 1.1: Square admin badges and dots**
- [ ] `StatusBadge`: `rounded-full` → `rounded-none`. Update the header comment: badges now follow the square admin shape, by owner choice A on 2026-11-22.
- [ ] `DemoBadge` gets a prop `shape: "square" | "pill"` (default `"pill"` so other callers are unaffected). The admin callers `ReportsScreen.tsx` ×5 and `FulfillmentScreen.tsx` pass `"square"`.
- [ ] Square every status span: `FulfillmentScreen.tsx:239-241`, `ProductsScreen.tsx:837`, `StatusMenu.tsx:85`. Square every status dot: `OrdersScreen.tsx:463`, `LocaleTabs.tsx:62`, `StatusSelect.tsx:29`, `ProductEditor.tsx:134,234`, `VariantsTable.tsx:259`. Leave the spinner (`HomepageScreen.tsx:336`), the order avatar (`OrdersScreen.tsx:864`) and colour swatches (`ProductPreviewModal`, `OptionsEditor`) untouched.
- [ ] Verify A1: run a Playwright check against local dev with a fixture DB, or against staging. It visits `/admin`, `/admin/products`, `/admin/orders` and the product editor, and asserts `getComputedStyle(el).borderRadius === "0px"` for every `[data-status-badge]`, `[data-demo-badge]` and `[data-status-dot]`. Add those data attributes in the same edits. Expected: 0 non-zero radii.

**Task 1.2: Customer demo dot and wording**
- [ ] Write the failing test `tests/unit/customer-demo-wording.test.mjs` with two cases:
  - For each of `en`, `ru`, `kk`, no string under `Cart`, `Checkout` or `AccountPortal` matches `/demo|демо/i`. In `kk`, also check the Kazakh spelling of "demo" that the file uses.
  - `Checkout.noPaymentLine` exists and in `en` equals `No payment is taken for this order.`
- [ ] Run `npm run test:unit -- --test-name-pattern=demo`. Expected: FAIL.
- [ ] Create `src/components/DemoDot.tsx`: `export function DemoDot({ label, className }: { label: string; className?: string })`. It renders a 8×8 `#6DCFF6` span with `role="img"`, `aria-label={label}`, `title={label}` and `data-demo-dot`.
- [ ] Use `DemoDot` in place of `DemoBadge` in `CheckoutPanel.tsx:294` and `AccountDashboard.tsx:733,760,866`.
- [ ] Rewrite the messages in all 3 locales:
  - `placeDemo` → "Place order"; `payDemo` → "Pay"; `paidDemo` → "Paid"; `awaitingDemoPayment` → "Awaiting payment".
  - `demoBadge` becomes the dot's accessible label: en "Test order", with RU/KK equivalents.
  - `demoReceipt`, `sandboxReceipt`, `demoNote`, `sandboxNoticeTitle` and `AccountPortal.demoNote` all become the neutral line. `sandboxNoticeBody` keeps only the hold sentence: "This total is held until {time}."
  - `Cart.demoNotice` → "No payment is taken for this order. Your cart has been cleared."
  - `paymentNotCompletedBody` → drop "demo". `methodChanged` → "Checkout options changed. Review your order and try again."
  - Add `Checkout.noPaymentLine`.
- [ ] Run `npm run test:unit` and `node --test tests/i18n-messages.test.mjs`. Expected: PASS. If an existing test asserts the old wording, update it to the new copy.

### M2 — Schema 0028 (wave 1, owner: `database-optimizer`)
**Task 2.1: Migration + schema**
- [ ] Write the failing test `tests/integration/schema-0028.test.mjs`, which migrates a temporary DB to head and asserts:
  - `category_translations(category_id uuid FK categories ON DELETE CASCADE, locale text CHECK IN ('ru','kk'), name text NOT NULL CHECK length(btrim)>0, PK(category_id, locale))`
  - `category_menu_placements(id uuid PK, menu_category_id uuid FK categories ON DELETE CASCADE, category_id uuid FK categories ON DELETE CASCADE, position int ≥0, href text NULL, label jsonb NULL CHECK object with only keys en/ru/kk, UNIQUE(menu_category_id, category_id))`
  - `categories.menu_href text NULL`
  - `product_compatibility_types(id uuid PK, device_product_id uuid FK products RESTRICT, device_option_value_id uuid NULL (composite FK with device_product_id → option_values like product_compatibility), category_id uuid FK categories RESTRICT, position int, created_at, UNIQUE(device_product_id, coalesce(device_option_value_id, nil), category_id))`
  - A trigger refuses a type link whose category is not kind `accessory`, or `group` under an accessory ancestor.
  - Placements and translations bump `catalog_taxonomy_guard.epoch` (statement trigger, like `catalog_taxonomy_lock`).
- [ ] Run `npm run test:integration -- --test-name-pattern=0028`. Expected: FAIL.
- [ ] Write `drizzle/0028_category-manager.sql` and the matching Drizzle tables in `src/server/db/schema/catalog.ts`. Grant the app roles the same privileges `categories` has (copy the grant pattern from 0013). Update `drizzle/meta` through `npm run db:generate`, then compare the result against the hand SQL.
- [ ] Rerun the test. Expected: PASS. Also run `npm run test:integration -- --test-name-pattern="schema-0013|database"`. Expected: PASS.

### M3 — Taxonomy loader and menu builder (wave 2, owner: `backend-architect`)
**Interfaces produced:**
- `loadTaxonomy(client: PoolClient, opts: { assignProducts: boolean }): Promise<{ inserted: number; translations: number; placements: number; assigned: number }>` in `src/server/catalog/taxonomy-load.ts`. It is idempotent: inserts missing nodes by key and never overwrites renamed ones; it adds missing translations and placements; it assigns categories and series only to products that have none.
- `buildMegaNav(client: Query, locale: "en"|"ru"|"kk"): Promise<MegaNavItem[] | null>` in `src/server/catalog/mega-nav.ts`. It returns `null` when the DB has no catalog roots, so callers fall back.
- `MegaLink` in `homepage-nav.ts` gains an optional `categoryKey?: string` for code-column links. A resolved item carries `label: string` (already translated) as an alternative to `labelKey`.

**Task 3.1: Loader**
- [ ] Write the failing test `tests/integration/taxonomy-load.test.mjs`:
  - On an empty DB with 3 fixture products whose families are `fēnix 9`, `Forerunner 970` and `QuickFit 22 Watch Bands`, `loadTaxonomy` inserts 112 nodes, and every catalog node has `ru` and `kk` names equal to `messages/{ru,kk}.json` `Header.*` labels.
  - Placements follow `megaNav` order.
  - Each product gets one primary category, and the two watches get series `fenix` and `forerunner`.
  - A second run inserts 0 and changes nothing. A renamed node keeps its new name.
- [ ] Implement `taxonomy-load.ts`. Move `seedTaxonomy` from `scripts/dev/seed.mjs` into it and make the dev seed call it. Derive node ↔ menu link matching from the existing `src/server/catalog/local-links.ts` and seed `sourceHref`. When the en label differs from the node name, the placement stores `label` (e.g. "All Smartwatches"). When the target differs from `/c/<slug>`, the top item stores `menu_href` and the placement stores `href`. Product assignment reuses `category-match.ts`.
- [ ] Create `scripts/ops/load-taxonomy.mjs`. It runs in one transaction, supports `--dry-run` to print counts and roll back, and is run with the ops image like migrate.
- [ ] Run the test. Expected: PASS.

**Task 3.2: Menu builder + parity**
- [ ] Write the failing tests `tests/integration/mega-nav.test.mjs`:
  - `parity with static megaNav`: after `loadTaxonomy`, for each locale, the resolved `buildMegaNav` labels, hrefs and order equal the static `megaNav` resolved through that locale's messages, item by item, including code columns and promos.
  - `code-column links follow rename and hide`: rename `apps` (en and ru), and every menu listing it shows the new label. Set `nav_visible=false` on `apps`, and the link disappears.
  - `shared placement`: Running appears under Smartwatches and Sports & Fitness, each at its own position.
  - `empty DB → null`.
- [ ] Implement `mega-nav.ts`. Top items are nav-visible `catalog` roots ordered by position. Columns, groups and promos come from the static `megaNav` entry whose `href` resolves to that root's key. A top item with no static entry gets one Products column. The Products group comes from placements; other groups come from static links (a `categoryKey` link resolves label and href from the DB and is dropped if the category is missing or hidden).
- [ ] Add `categoryKey` to the static code-column links that point at categories. The unit test `tests/unit/nav-links.test.mjs` must still pass.
- [ ] Run both tests and `npm run test:unit`. Expected: PASS.

### M4 — Admin categories API (wave 3, owner: `backend-architect`)
**Interfaces produced** (all under `/api/admin/catalog/`, JSON, `If-Match: W/"taxonomy-<epoch>"` required on writes; a stale epoch gets 409 `VERSION_CONFLICT`):
- `GET categories` returns `{ epoch, menu: AdminMenuItem[], accessories: AdminNode[], series: AdminNode[] }`, where `AdminNode = { key, slug, kind, name: {en,ru,kk}, parentKey, position, navVisible, productCount, childCount, linkCount }` and `AdminMenuItem = AdminNode & { menuHref: string|null, placements: { key, name, position, href: string|null, label: {en?,ru?,kk?}|null }[] }`.
- `POST categories` with body `{ section: "menu"|"menu-child"|"accessory"|"accessory-type"|"series", parentKey?, name: {en, ru?, kk?}, navVisible? }` returns the created `AdminNode`. Key and slug are derived from the en name under the parent's slug, with `-2`, `-3` appended on a clash. A `menu-child` also gets a placement under its parent at the end.
- `PATCH categories/:key` with body `{ name?: {en?,ru?,kk?}, navVisible? }`.
- `PUT categories/:key/order` with body `{ keys: string[] }` reorders the children of `:key` (use `:key` = `_roots` for the top items, accessory categories, or series parent `watch-series`).
- `PUT categories/:key/placements` with body `{ placements: { key: string }[] }` sets the full ordered placement list of a top item. This is where adding or removing an existing subcategory to another top item happens.
- `DELETE categories/:key` returns 409 `IN_USE` with `{ counts: { products, children, compatibility, typeLinks, promotions, priceRules, presets } }` when any count > 0; otherwise it deletes the category, its translations and its placements.
- Every write calls the cache revalidation chosen in Task 6.1 (export `revalidateMenu()` from `src/server/catalog/mega-nav.ts`).

**Task 4.1**
- [ ] Write the failing tests `tests/integration/category-admin.test.mjs`. Use the `startCatalogFixture` admin principal; a viewer principal is refused with 403. Cases:
  - `create rename hide reorder`
  - `create series and accessory type`
  - `delete blocked with counts` (product attached, child, type link, promotion)
  - `delete blocked by preset reference`: the MARQ preset references series `marq`
  - `delete succeeds when empty`
  - `stale epoch is refused`
  - `placements set and shared`
  - `ru/kk names round-trip`
  - `key and slug unchanged on rename`
- [ ] Implement `src/server/cms/category-admin.ts`: pure SQL functions taking a `PoolClient`, each write in `tx` with `SELECT … FOR UPDATE` on `catalog_taxonomy_guard`. Wire the routes in `catalog-http.ts` (extend the doc comment route list) and the methods in `catalog-service.ts` (`catalog:write` for writes).
- [ ] Run the test, then `npm run test:integration -- --test-name-pattern="catalog|cms"`. Expected: PASS.

### M5 — Admin Categories UI and editor series (wave 4, owner: `frontend-developer`)
**Task 5.1: `/admin/categories`**
- [ ] Add a sidebar item `{ label: "Categories", href: "/admin/categories" }` directly after Products, with the same nav permission as Products.
- [ ] Create `src/app/admin/categories/page.tsx` and `src/components/admin/categories/{CategoriesScreen,MenuSection,AccessoriesSection,SeriesSection,CategoryNameDialog,DeleteBlockedDialog}.tsx`. Use the admin `Button`, `Select` and square shape throughout. The screen has three tabs, "Menu categories", "Accessories" and "Series (filters)", matching the sketches in the conversation.
  - Rows show name, product count, a hidden marker, up/down reorder buttons, edit, and the bin.
  - The name dialog has EN/RU/KK fields plus an "Auto-translate" button that uses `/api/admin/translate`.
  - Menu items show read-only fixed link targets (C3).
  - "Also show under…" on a subcategory edits the placements of other top items.
  - The delete-blocked dialog lists the counts.
- [ ] Data comes from `GET categories`. Writes send `If-Match`. On 409 `VERSION_CONFLICT`, show "Someone else changed categories — reloaded" and refetch.
- [ ] Add a CMS smoke block, `CMS_SMOKE_ONLY=categories`, in `tests/ui/cms-smoke.mjs`. It creates a subcategory under Smartwatches, renames it in RU, checks the storefront menu shows it at `/ru`, hides it, and deletes it. Run it with the env from memory `grmn-production`. Expected: PASS.

**Task 5.2: Series dropdown + Model name**
- [ ] `GeneralTab.tsx`: replace "Family / series" with:
  - a `Select` "Series", whose options are the `watch-series` children from `useTaxonomy` plus "None"
  - a text field "Model name" bound to `form.family`, with the hint "Shown under the product title"

  The series choice is stored as a non-primary entry in `form.categories`. Changing it replaces the previous series entry.
- [ ] Add a case to `tests/integration/cms-product-write.test.mjs`: `series saved as category, family kept`. Run it. Expected: PASS.

### M6 — Storefront follows the DB (wave 3, owner: `frontend-developer`)
**Task 6.1: Header from DB**
- [ ] Read the Next 16 docs on caching and revalidation (`node_modules/next/dist/docs/`). Pick the mechanism (tagged cache invalidated by `revalidateMenu()`) and note the choice in the Revisions log.
- [ ] `src/app/[lang]/layout.tsx` loads `buildMegaNav(pool, locale)` (cached) and wraps children in `<MegaNavProvider items={…}>`. `HomeHeader` reads `useMegaNav()` and falls back to the static `megaNav` when it is null. Resolved links render `label` directly; static ones keep using `t(labelKey)`.
- [ ] Integration case in `catalog-categories.test.mjs`: `hidden category keeps its page`. Hiding removes the category from `buildMegaNav` while `/c/<slug>` still resolves via `category-page.ts`. Run it. Expected: PASS.

**Task 6.2: Translated names + series facet**
- [ ] `category-page.ts`, breadcrumbs (`primaryCategoryPath`), Series facet labels and `compatibility-public.ts` group headings all read `coalesce(category_translations.name for the locale, categories.name)`. Thread `locale` through `service.ts` callers.
- [ ] Remove the `family` fallback (`category-page.ts:105`). Presets with `families` resolve by series key: change the MARQ preset in `taxonomy-seed.ts` to a new `seriesKeys: ["marq"]` field, and keep reading `families` for old rows.
- [ ] Tests (extend `catalog-categories.test.mjs`):
  - `ru breadcrumb and title`
  - `series facet lists series names only`: a product with family `fēnix 9` and no series is not in the facet
  - `MARQ preset survives series rename`
- [ ] Run the tests. Expected: PASS.

### M7 — Live type links (waves 2 and 4)
**Interfaces produced:**
- The device command gains `compatibility.types?: { categoryKey: string; optionValueKeys: string[] }[]` (max 200), owned by the device side. Saving replaces the device's type links.
- The editor payload returns `compatibility.types` the same way.
- The public `compatibleAccessories(pool, deviceId, cards, locale)` returns the union of row links and published products assigned to the linked category or its descendants. `compatibleDevices(pool, accessoryId, cards, locale)` adds devices with a type link to any of the accessory's categories or their ancestors, worded like row links ("fēnix 8 – 47 mm" for an option-value link).

**Task 7.1: Write path + public reads (wave 2, `backend-architect`)**
- [ ] Write the failing tests `tests/integration/compatibility-types.test.mjs`:
  - `type link shows future accessories`: link a device to `cables-chargers/<type>`, then create a charger in that type with no other edit. The charger appears in the device's accessories, and the device appears in the charger's compatible devices.
  - `option value narrows`: only the 47 mm variants list it.
  - `type and row link do not duplicate`
  - `unpublished accessory hidden`
  - `type link to a catalog category refused`
- [ ] Implement in `compatibility.ts` (new `writeTypeLinks`), `product-command.ts` (zod), `catalog-read.ts` (payload) and `compatibility-public.ts` (union SQL, dedup by accessory product).
- [ ] Run the tests plus `--test-name-pattern="compatib"`. Expected: PASS.

**Task 7.2: Delete guard hook**
- [ ] `category-admin.ts` counts `product_compatibility_types` in `typeLinks`. M4 already has the test case; make sure it covers type links.

**Task 7.3: Editor UI (wave 4, `frontend-developer`)**
- [ ] In `CompatibilityTab.tsx`, next to "Add accessories", add "Link a type": a category → type picker from `useTaxonomy` (accessory nodes only) plus an optional option-value picker reusing the existing one. Linked types show as rows such as "All QuickFit 22 mm (live, 6 products today)", with a remove button. State lives in `compatibility-state.ts` (`types` array). Saving sends `compatibility.types`.
- [ ] Extend the CMS smoke block `compare` (or add `CMS_SMOKE_ONLY=type-links`): link a type, save, reload, and the row is still there. Run it. Expected: PASS.

### M8 — Tabs vs garmin.com (wave 5, owner: `frontend-developer`)
- [ ] Recon: open garmin.com `/en-US/p/553030/` (QuickFit 22) and the charging/data cable page (find its `/p/` id on garmin.com search) at 1440 and 390. Record tab structure, grouping, sort, wording, card layout and "View all" behaviour in `docs/research/www.garmin.com/pdp/compat-tabs.md`, with screenshots alongside.
- [ ] Screenshot ours on staging with seeded links: a fēnix device and a QuickFit 22 band. List the differences in the same file, fix them in `ProductAccessories.tsx`, `CompatibleDevices.tsx` and `ProductTabs.tsx`, then re-screenshot (A11).
- [ ] Evidence: before/after screenshots linked in the Result section.

### M9 — Staging rehearsal and deploy (wave 6, owner: `devops-automator`)
- [ ] Take a pre-deploy prod dump to `/home/nick/grmn-production/predeploy-categories-9da8fdf.dump` (`pg_dump -Fc`).
- [ ] Start staging and restore the dump. Follow memory `grmn-production`: `--no-owner --role=grmn_migrate`, re-apply grants, copy the `grmn_media` volume.
- [ ] Build `grmn:<commit>` and `grmn-ops:<commit>` (app with `--build-arg NEXT_PUBLIC_SITE_URL=https://garmin.tigr.uz`), then migrate staging.
- [ ] Run `load-taxonomy.mjs --dry-run` and then for real on staging. Record the counts. Expected: 112 inserted, 11 products assigned.
- [ ] A6/A7 on staging: save the menu HTML before and after (`/`, `/ru`, `/kk`), compare the link lists, and run the SQL counts.
- [ ] A12: run the old image `grmn:9da8fdf` against the migrated staging DB, load `/`, `/c/wearables-smartwatches` and `/admin/products`, then switch back.
- [ ] A2: place a demo order on staging (no Telegram there) and screenshot the checkout, receipt and account.
- [ ] Do the owner spot checks on staging, then **stop and ask the owner** before production.
- [ ] Production (on go): dump, update `APP_IMAGE`/`OPS_IMAGE`, migrate, `load-taxonomy.mjs`, `up -d app worker proxy`, `restart proxy`, smoke test. Then update memory `grmn-production`.

## 6. Verification
- `npm run lint && npm run typecheck` (then `npm run build` inside `npm run check`; move `.next` aside first if the dev cache is stale, per memory)
- `npm run test:legacy && npm run test:unit && npm run test:integration && npm run check:boundaries`
- `CMS_TEST_CHROME=/home/nick/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome CMS_TEST_CHROME_NO_SANDBOX=1 npm run test:cms-ui`
- The A1 Playwright radius check and the A2 staging demo order screenshots
- The M9 staging checks (A6, A7, A12)

## 7. Rollback
- Code: everything is on `beta5`, uncommitted until the owner asks. `git stash` / `git checkout -- <paths>` per module scope (section 4). There were no pre-existing dirty files at start (`git status` clean, 2026-11-22).
- DB: 0028 is additive. The old image ignores the new tables. To undo the taxonomy load, restore `predeploy-categories-9da8fdf.dump`, or switch back to `9da8fdf` with `/home/nick/grmn-production/switch-version.sh 9da8fdf`. The header falls back to the static menu if the categories are emptied.
- Production rollback = switch the images back to `9da8fdf` and `restart proxy`.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-22: requirement approved by owner ("Go ahead").

## Result
Delivered: · Checks run: · Gaps: · Follow-ups:

## Handoff
The plan is written; it waits for owner approval (Draft – plan). On approval, start wave 1 (M1 ‖ M2). The repo is `/home/nick/GRMN`, branch `beta5`, clean at start. Production stays on `9da8fdf` until M9 and the owner's go.
