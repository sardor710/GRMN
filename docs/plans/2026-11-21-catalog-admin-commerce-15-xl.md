# Catalog, admin editor and demo commerce (15 owner changes) — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans` (serial) or `superpowers:subagent-driven-development` (parallel units, each in its own worktree). Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done | 5 | 57/57 | 2026-11-21 | Owner review; optional follow-ups below |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

Process note: the owner asked for brainstorming "with yourself or other agents and skills", so the interview round was replaced by three read-only code-mapping agents and a three-agent council (Architect / Advocate / Skeptic). The requirement freeze and plan approval are combined into **one** approval stop. Before each wave starts, its tasks are expanded into bite-sized steps with `superpowers:writing-plans` inside this file.

## 0. What the code does today (findings, 2026-11-21)

- **The codebase is split in two.**
  - The rich product editor writes only to `src/lib/cms/data.json` (`ProductsScreen.tsx`, 1480 lines). It covers options, variants, per-variant stock and garmin.com import.
  - The Postgres backend has checkout, accounts, the inventory ledger, reports, `categories`/`product_categories`, `product_relations`, and full variant tables. The storefront catalog query (`src/server/catalog/service.ts`) already reads them.
  - The Postgres admin save (`src/server/cms/service.ts:142-161`) writes only one default variant plus price and rejects stock. `PostgresProductsScreen.tsx` has no variants and no import.
- **Admin login needs Postgres in every mode** (`AUTH_ENABLED=1`, `src/server/auth/runtime.ts`). `.env.local` only sets `ADMIN_SESSION_SECRET`, so admin is unreachable in the current local setup. Docker is not installed. `embedded-postgres` exists, but only for tests (`scripts/db/temporary-postgres.mjs`).
- **#1 Category/subcategory.**
  - The values save fine. Storefront `/c/` pages never filter by them. Only two catalog routes exist, both hardcoded (`src/lib/products.ts:22-42`), and `CatalogueDef.filter` is dead code.
  - The category tree is a hardcoded constant, duplicated in both product screens.
  - `subCategory` is a single string.
  - Imports are forced to draft. A blank form defaults activities to Running and Hiking.
- **#2/#14 Product list.**
  - Every request parses and clones the whole data.json and returns full records (overview up to 200 KB, every image, every variant). A second full request loads cross-sell data.
  - A page of 20 imported products is about 2–3 MB, sent twice. There is no per-product GET. The family filter only knows hardcoded families.
  - The status control is a native `<select>`. There is no shared admin Button or Select.
- **#3 Options & variants.** It is tab 3 of 7 inside a `max-w-4xl` modal. The variants table is 860 px minimum, wider than the modal. The bulk toolbar sits above the table.
- **#4 Specs.** The specs editor is a flat label/value list. Imported `specGroups` cannot be edited, and the flat list is overwritten from the groups on save. New products get fake default specs.
- **#5/#6/#8 Overview.**
  - Overview is a raw HTML `<textarea>`, and the Preview modal does not show it. No rich-text library is installed.
  - The sanitizer strips iframes.
  - Imported YouTube becomes a poster image that opens `youtube-nocookie.com/embed/<id>` in a new tab. The hand-built fēnix 8 page shows that an inline iframe works.
- **#7 In the box.** There are five separate default lists:
  - blank form
  - product opened with an empty list
  - import with no items
  - server create
  - storefront fallback

  An empty list can never be saved. The importer reads text only, no images.
- **#9/#10 Relations.**
  - `compatibleAccessories` is a product-level ID list that the storefront never reads.
  - The Accessories tab is hardcoded fēnix 8 data. "Compatible Devices" is placeholder text.
  - There is no per-variant compatibility and no reverse link.
  - Seed references point at product IDs that don't exist.
- **#11 Payments.**
  - Legacy mode cannot buy at all: the cart APIs return 503 and the Checkout button is disabled.
  - In Postgres mode, checkout uses the `demo` provider. DB triggers forbid a demo attempt from reaching "captured", by decision D03. Reports count only `payment_transactions` captures, split by environment (sandbox or live).
  - No seed creates tax, shipping or store settings, so a fresh database cannot quote.
- **#12 Addresses.**
  - These exist in Postgres only. The country is a select with 10 countries, and region and city are free text. There are no lat/lng columns.
  - The `customer_profiles.birth_date` column exists but is not wired. Email is editable.
  - There is no map, and no global CSP that would block Yandex.
  - Customer login is phone OTP with no sender configured.
- **#13 Navigation.** About 150 mega-menu links go to garmin.com. Six homepage tiles 404. The catalog filters are static lists, and Battery, Series and the other filters are empty.
- **#15 Stock.**
  - Legacy simple products ignore `product.stock`. Variant products only use active variants with stock.
  - Dashboard quick-restock is silently undone on save.
  - In Postgres, new products get no inventory row, so they show as "unavailable". Catalog cards never show availability.
- **Dirty files that aren't ours:**
  - `src/server/checkout/service.ts` and `src/server/payments/service.ts` (WhatsApp alerts)
  - `src/server/operations/registry.ts`, `.env.example` and `.claude/launch.json`
  - `src/server/notifications/`, `tests/unit/whatsapp-alerts.test.mjs` and `docs/backend/whatsapp-order-alerts.md`

## 1. Requirement

**Why (owner's words, condensed):** content managers must be able to fill and organize the catalog quickly and correctly. That means categories, variants, specs, overview, in the box, accessories and compatibility. Shoppers must find products through real category pages, see real stock, and complete demo purchases, so that sales and admin dashboards can be checked with realistic data. Shipping is Kazakhstan-only.

- **Goal:** one working system in which the admin editor's data appears correctly on the storefront and every available product can be bought in demo mode. The 15 changes below are the deliverables.
- **Key decisions (my calls; the owner approves or corrects at this stop):**
  - **D-R1 — Postgres becomes the single runtime.**
    - The variant-aware editor is ported onto the Postgres CMS service, and one shared editor replaces the two near-copies.
    - `data.json` becomes a one-way import source and a read-only fallback. No new features are added to the JSON path.
    - A one-command local stack `npm run dev:stack` starts a **persistent** embedded PostgreSQL under `storage/devdb/` (gitignored). It applies migrations, seeds KZ tax, shipping, store settings and a stock location, imports the current `data.json` catalog with variants and opening stock (idempotent, with a diff report), and starts Next with `CMS_BACKEND=postgres AUTH_ENABLED=1`.
    - Reason: checkout, accounts, inventory, reports and admin login exist only there, and stock (#15) cannot be "synced" with two writers. Council: unanimous.
  - **D-D1 — Demo purchases.**
    - An env-gated **sandbox auto-capture** provider (`DEMO_PURCHASES=1`) runs through the real capture path with `environment='sandbox'`, so orders become paid, stock is consumed, and reports and dashboards count them.
    - They are labelled **Demo/Sandbox** everywhere, shown as a separate series from live, and excludable from exports.
    - It is refused when a live provider is configured or when `NODE_ENV=production` without an explicit `DEMO_PURCHASES_ALLOW_PRODUCTION=1`.
    - The DB triggers protecting `demo`/`live` stay intact.
    - This is recorded as a new decision **D03a** (owner request 2026-11-21) next to D03 in `docs/backend/decisions.md`.
  - **D-C1 — Compatibility is one stored link, editable from both sides.**
    - New table `product_compatibility`: accessory product, optional accessory variant, device product, optional device **option value** (e.g. fēnix 8 → "51 mm", which covers all current and future 51 mm variants), optional device variant (rare exceptions).
    - "Compatible accessories" on the watch and "Supported models" on the band are two reads of the same rows, so there is no double entry and no drift.
    - Adding a band from the watch editor writes the same row.
    - "Related / You may also like" stays in `product_relations`.
  - **D-T1 — One taxonomy.**
    - The `categories` table (with parent) holds:
      - **catalog categories:** the garmin.com nav tree, e.g. Wearables › Running
      - **accessory categories:** Apps, Service Plans, Bands, Dive Bands, MARQ Straps & Bracelets, Cables & Chargers, Cycling Accessories, Heart Rate Monitors, Sensors
      - **groups:** QuickFit 20 / 22 / 26 mm, Lily bands, MARQ straps, and watch series such as fēnix 8 and Forerunner
    - A `kind` column distinguishes them.
    - Products link through `product_categories` (many-to-many, one primary).
    - Categories carry `slug`, `preset_filters` (garmin.com-style) and nav visibility.
- **Deliverables:**
  1. **Categories that work (#1).**
     - Multi-select of category and subcategories (a tree with checkboxes, one marked primary), saved to `product_categories`.
     - The product appears on every selected category page and on its parents.
     - Imports map garmin.com breadcrumbs to the tree and flag unmatched ones.
     - The default "Running / Hiking" activities are removed.
  2. **Two list views (#2).**
     - **Grouped:** products with nested, expandable variants.
     - **All SKUs:** a flat list with SKU, variant, price, stock and status. Clicking a SKU opens a quick-edit drawer (price, compare-at, stock, status, photos) or the full editor focused on that variant.
     - Both are server-paginated with search and filters (status, category, family, stock state).
  3. **Options & variants redesign (#3)**, using `design-taste-frontend`, `anti-ui-slop` and `ui-radar` for references.
     - The editor becomes a full-viewport sheet with a sticky save bar.
     - Step 1, "What do customers choose?": options as chips.
     - Step 2: a responsive variants grid with only key columns visible (price, stock, status, photo; more on expand).
     - Step 3: a bulk-action bar that appears when rows are selected.
     - Clear Generate/Apply placement, unsaved-change and "ready to sell" indicators.
  4. **Spec paste (#4).**
     - A "Paste specs" dialog accepts Excel/Sheets TSV, `Label: Value` lines, and HTML tables from websites, including group header rows.
     - It shows a parsed preview, then Replace or Append.
     - `specGroups` become editable in the UI (groups with rows, add/rename/reorder). The fake default specs are removed.
  5. **CKEditor 5 for Overview (#5).**
     - Open-source `ckeditor5` + `@ckeditor/ckeditor5-react`, `licenseKey: 'GPL'`, self-hosted from npm, client-only (`next/dynamic`, `ssr:false`), loaded only in admin.
     - General HTML Support is limited to the overview allowlist (the `ov-*` classes).
     - One allowlist is shared by the editor config and the server sanitizer, covered by a round-trip test.
  6. **Edit-in-preview for imported overview (#6).** The CKEditor surface is styled with the storefront overview CSS, so imported garmin.com overview is edited in its preview look. Any word in any language can be changed, and blocks can be moved (drag-and-drop or cut and paste). "Preview" shows the full product page, overview included, from unsaved state.
  7. **In the box (#7).** All presets are removed (form, open, import, server create, storefront fallback), and an empty list is allowed. Items become `{label, image?}` (old strings still accepted). The importer downloads in-the-box images from garmin.com when present. The storefront shows them as image tiles when images exist.
  8. **YouTube in overview (#8).** Videos are a structured media block (CKEditor Media Embed, YouTube only, stored as the video ID).
     - Editor: select the video, paste any YouTube link, and it is replaced.
     - Storefront: a click-to-play poster that swaps in an inline `youtube-nocookie.com/embed/<id>` player in place.
     - Imported `ov-video` blocks are converted.
  9. **Accessories by category (#9).**
     - The editor's "Accessories & compatibility" tab browses category, then group, then product (or group, then products), and can add a whole group at once.
     - The watch page's Accessories tab is grouped into tabs: Apps, Service Plans, Bands, Dive Bands, MARQ Straps & Bracelets, Cables & Chargers, Cycling Accessories, Heart Rate Monitors, Sensors, View All.
     - The accessory page lists "Supported models" derived from the same links.
  10. **Variant-level compatibility (#10).**
      - On an accessory or sensor, "Compatible devices" means picking a device family or product, then ticking option values (e.g. 51 mm). It reads back as a sentence, e.g. "Fits: fēnix 8 51 mm (all 14 variants)", with a "copy from another accessory" shortcut.
      - The storefront resolves the shopper's selected variant. QuickFit 26 mm bands linked to fēnix 8 "51 mm" show on 51 mm variants only, not on 43 or 47 mm.
  11. **Demo purchases (#11).**
      - With `DEMO_PURCHASES=1` (on in `dev:stack`), every published product with an active priced variant and free stock can be added to the cart and bought without merchant checks.
      - The order is paid (sandbox) at once, stock is consumed, and it appears in admin orders, the dashboard and reports with a Demo label.
  12. **Kazakhstan addresses + Yandex map (#12).**
      - Country is fixed to Kazakhstan, and the server rejects anything else.
      - Region is a select: 17 oblasts plus Astana, Almaty and Shymkent. City is filtered by region (free entry allowed).
      - An embedded Yandex map (JS API 2.1, `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`) works both ways:
        - choosing a region or city pans the map to it;
        - clicking or dragging the pin reverse-geocodes and fills region, city and address line;
        - a typed address is geocoded (debounced, through a server proxy route with rate limit using `NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY`) and the map points to it;
        - if the address is not found, the shopper is told and asked to place the pin, and the typed address line is **not** overwritten by the pin.
      - lat/lng are stored. Birthday is optional (`birth_date`) and email is editable in profile settings.
      - The checkout address form reuses the same component.
  13. **Working navigation (#13).**
      - Every mega-menu category and subcategory points to a local `/c/<slug>` page backed by the taxonomy, with garmin.com-style preset filters (for example the Running page pre-filters activity=running). Facets are computed from data, with counts: Series, Case size, Activity, Price, and Availability.
      - Breadcrumbs follow the product's primary category.
      - Homepage tiles and carousels link to local pages and products where they exist. Empty categories show an empty state, not a 404.
      - The garmin.com nav/filter structure is captured with `scripts/clone/inspect.mjs` into `docs/research/www.garmin.com/`.
  14. **Fast list and Garmin-style controls (#14).**
      - The list uses SQL keyset pagination, a slim list DTO (no overview, specs or galleries; one thumbnail; variant count; stock sum), a per-product GET for the editor, cross-sell data loaded lazily when the tab opens, the indexes it needs, and a total count.
      - Target: list API p95 under 300 ms with 1,000 products / 5,000 SKUs in a seeded perf DB, and first render under 1 s.
      - A shared admin `Button`/`Select`/`StatusSelect` primitive takes the measured garmin.com control shape, applied to every rectangular admin button and dropdown.
  15. **Stock synced (#15).**
      - Stock entered in the editor (simple product or per variant) is written through the inventory ledger as a stock movement and shown everywhere: admin list, editor, catalog cards ("Out of stock" badge), product page (disabled option values, auto-select an in-stock variant), and cart/checkout.
      - Products with free stock can be purchased. Dashboard restock uses the same ledger.
- **Constraints:**
  - Next.js 16: read `node_modules/next/dist/docs/` before route, API or dynamic-import work. TypeScript strict, no `any`, 2-space indentation, Tailwind, mobile-first.
  - Additive migrations only (`0013_…` onward). Never edit completed migrations. Preserve the custom triggers and constraints.
  - Never touch other people's dirty files (list in §0). Any change in `src/server/checkout/service.ts` or `src/server/payments/service.ts` waits for the owner's answer (see Open questions).
  - API keys go in `.env.local` only (gitignored). `.env.example` gets the names with empty values. Keys are never committed.
  - Real content: categories and filters come from garmin.com structure, not invented names.
  - Back up `data.json` (copy dated `2026-11-21`) before any import. The import is idempotent and dry-run first.
  - Parallel units each work in their own git worktree and are merged by the lead at the end of the wave.
- **Non-goals:** real payment providers (Kaspi/Freedom); SMS delivery (dev OTP prints to the server console only); production deployment or cutover (Tasks 23/24); new garmin.com scraping beyond in-the-box images and existing import; multi-country shipping; localization changes; restyling the storefront beyond the listed controls; removing the legacy JSON code (frozen, removal later).
- **Assumptions (my calls, correct if wrong):**
  - A watch family such as fēnix 8 is one product whose case sizes are option values, like imported fēnix 9. Compatibility targets option values on it.
  - "Garmin design" for buttons and dropdowns means garmin.com's current control shape (measured, not guessed). It applies to admin controls. Storefront buttons already follow garmin.com.
  - Dev stack: staff login keeps MFA. The owner enrolls TOTP once with an authenticator app. A dev-only console OTP sender is enabled for customer phone login and refused in production.
  - CKEditor 5 GPL licensing is acceptable for this self-hosted site (the owner asked for the open-source version). This is noted in decisions.
  - The quick-edit drawer covers price, compare-at, stock, status and photos. Everything else opens the full editor on that variant.
- **Open questions (only the owner can answer):**
  1. Approve **D-R1** (Postgres single runtime + `dev:stack`)? It changes how you run the project locally: one command instead of `npm run dev`.
  2. Approve **D-D1 / D03a** (sandbox demo purchases counted in dashboards, labelled Demo)?
  3. The uncommitted WhatsApp-alert edits in `src/server/checkout/service.ts` and `src/server/payments/service.ts` are not mine. Are they yours, and may I commit them first as their own commit, or should #11 avoid those files (capture would then wait up to 60 s for the worker)?
  4. The Yandex keys were pasted in chat. I'll put them in `.env.local` only. Restricting them by HTTP referrer in the Yandex developer console (localhost plus your domain), and rotating them later, is up to you.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A0 | `npm run dev:stack` on a clean checkout starts persistent PG, migrates, seeds, imports data.json (diff report 0 errors), serves admin and storefront; data survives a restart | auto+manual | `node scripts/dev/stack.mjs --check` + restart smoke |
| A1 | Product saved with categories {Wearables›Running, Sports›Triathlon} appears on both `/c/` pages and the parents; not on others | auto | integration `catalog-categories.test.mjs` + browser smoke |
| A2 | Admin list Grouped and All-SKUs views; SKU quick-edit changes price/stock and the storefront reflects it | auto+manual | unit + browser smoke |
| A3 | Options & variants step layout passes `anti-ui-slop` finish gate; no horizontal overflow at 1280 px; screenshots before/after | manual | screenshots in `docs/design-references/admin-variants/` |
| A4 | Paste parser: TSV, `Label: Value`, HTML table, group headers → correct groups (≥8 fixture cases) | auto | `tests/unit/spec-paste.test.mjs` |
| A5 | CKEditor loads only on admin, SSR-safe; editor→sanitizer→storefront round trip keeps allowed markup and strips scripts/handlers/foreign iframes | auto | `tests/unit/overview-roundtrip.test.mjs`, `npm run build` |
| A6 | Imported fēnix 9 overview edits (text change in RU/KK/EN, block move) persist and render identically on `/p/[id]` | manual | browser smoke screenshots |
| A7 | No in-the-box preset anywhere; empty list saves; garmin.com fixture with box images imports images | auto | `tests/garmin-import.test.mjs` additions + grep for presets |
| A8 | YouTube block: URL swap in editor; storefront plays inline in place (iframe appears in same container after click) | auto+manual | unit for ID extraction + browser smoke |
| A9 | Watch page Accessories tabs grouped by the 9 categories + View All; band page "Supported models" lists the watches linked from either side | auto | integration `compatibility.test.mjs` |
| A10 | Band linked to fēnix 8 "51 mm" shows on 51 mm variants only, not 43/47 mm; new 51 mm color variant included automatically | auto | integration `compatibility.test.mjs` |
| A11 | Guest and signed-in demo purchase → order paid (sandbox), stock decremented, visible in admin orders, dashboard and reports with Demo label; refused when `NODE_ENV=production` without override | auto+manual | integration `demo-purchases.test.mjs` + browser smoke |
| A12 | Address: non-KZ rejected by API; region→map pans; pin→fields filled; unknown typed address → message, line unchanged; birthday optional saved; email saved | auto+manual | unit/integration + browser smoke with real Yandex keys |
| A13 | Every mega-menu link is local and returns 200 (no garmin.com hrefs left except intentional external ones listed); preset filters applied | auto | `tests/unit/nav-links.test.mjs` + crawl script |
| A14 | List API p95 < 300 ms at 1,000 products / 5,000 SKUs; payload per page < 100 KB; shared Button/Select used by all admin screens | auto | `scripts/perf/admin-list-bench.mjs`, grep audit |
| A15 | Stock set in editor → ledger movement → visible on cards/product page; zero-stock variant disabled; purchasable when >0; dashboard restock persists | auto | integration `stock-sync.test.mjs` |
| A-G | Full gates green | auto | `npm test`, `npm run check` |

Manual spot checks (owner): create a band, link it to fēnix 8 51 mm from the band side and to Forerunner from the watch side, view both product pages; paste specs from an Excel sheet; edit an imported overview in Russian; swap a video; buy as a guest and see it in the dashboard; add an Almaty address via the map.

## 3. Anti-drift
- **Primary objective:** what the content manager enters is what the shopper sees and can buy. This covers categories, variants, stock, accessories and compatibility. A demo sale shows up in the dashboards.
- **Proxy signals (not success by themselves):** green `npm run check`; tests passing on fixtures only; a pretty editor that still saves to the JSON file; the CKEditor toolbar rendering without a storefront round trip; nav links that resolve but show unfiltered products; a "paid" badge with no capture row or stock movement.
- **Intended scope:** the 15 items plus their direct prerequisites: the dev stack, migration 0013 and the import.
- **Completion target:** full delivery of all 15. If time runs out, Waves 0–2 (data foundation, categories, stock, list, storefront) are the minimum usable cut and are reported as `Done – partial`.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M0 Dev stack | One command: persistent embedded PG, migrate, seed (store settings, KZ tax/shipping, stock location), data.json import with variants and opening stock, dev OTP sender, admin bootstrap guide | `devops-automator` (owner), `superpowers:test-driven-development` (support) | `scripts/dev/**`, `scripts/migration/**` (import mapping), `src/server/auth/dev-phone-sender.ts`, `package.json` scripts, `.gitignore`, `docs/backend/local-development.md` | – |
| M1 Schema 0013 | `categories` kind/slug/preset_filters/nav fields + seed tree; `product_compatibility`; address lat/lng; in-the-box items | `database-optimizer` (owner), `backend-architect` (support) | `drizzle/0013_*.sql`, `drizzle/meta/**`, `src/server/db/schema/**` | – |
| M2 Catalog write + admin read API | Postgres CMS service saves options/variants/prices/media/stock-via-ledger/categories/compatibility/relations/specGroups/inTheBox/overview; slim paginated list (grouped + SKU), per-product GET, quick-edit endpoint, indexes, perf bench | `backend-architect` (owner), `superpowers:test-driven-development` (support), `performance-benchmarker` (verifier) | `src/server/cms/**`, `src/server/inventory/service.ts` (adjust API only), `src/app/api/admin/**`, `src/contracts/**`, `scripts/perf/admin-list-bench.mjs`, `tests/integration/**` new files | M0, M1 |
| M3 Admin shell, list, editor base | One shared editor replaces both screens, split into per-tab components; full-viewport sheet + sticky save; category tree multi-select; in-the-box (no presets, images); spec groups + paste; Grouped/All-SKUs list + quick-edit drawer; shared Garmin-style Button/Select | `frontend-developer` (owner), `design-taste-frontend` + `ui-radar` (support), `clone-website` inspect for garmin.com control shape (support) | `src/app/admin/products/**`, `src/components/admin/**` (except files M5/M6 own later), `src/lib/admin/spec-paste.ts`, `src/hooks/useAdminCollection.ts`, admin screens' button/select usages | M2 |
| M4 Storefront catalog, stock, accessories | Taxonomy-driven `/c/[...slug]`, local nav links, preset filters + computed facets, breadcrumbs, availability on cards/page, grouped Accessories tabs, Supported models, variant-resolved compatibility, homepage links | `frontend-developer` (owner), `clone-website` (support: garmin.com nav/filter recon), `evidence-collector` (verifier) | `src/app/c/**`, `src/app/p/**`, `src/lib/products.ts`, `src/lib/homepage-nav.ts`, `src/lib/catalog-constants.ts`, `src/components/{CatalogueGrid,ProductCard,ProductTop,ProductTabs,ProductAccessories,RelatedProducts}*`, `src/components/home/**` links, `src/server/catalog/**`, `docs/research/www.garmin.com/**` | M2 |
| M5 Overview editor + import | CKEditor 5 (GPL, client-only, GHS allowlist), editable preview styling, YouTube media block + storefront click-to-play, shared allowlist sanitizer, importer: ov-video→media, in-the-box images | `frontend-developer` (owner), `appsec-engineer` (verifier: sanitizer/XSS) | `src/components/admin/product-editor/OverviewEditor*.tsx`, `src/lib/overview/**` (allowlist, youtube), `src/lib/import/garmin-parse.js`, `src/app/api/admin/import/garmin/route.ts`, `src/components/product/CmsOverview*`, `package.json` deps | M3 (tab split) |
| M6 Variants UX + compatibility UI | Redesigned Options & variants step; Accessories & compatibility tab (category→group→product, option-value picker, sentence readback, copy-from) | `frontend-developer` (owner), `design-taste-frontend` + `anti-ui-slop` (support), `ui-finish-gate-reviewer` (verifier) | `src/components/admin/product-editor/{OptionsEditor,VariantsTable,VariantsStep,CompatibilityTab}*.tsx` | M3 |
| M7 Demo purchases | Sandbox auto-capture provider, D03a record, cart/checkout wiring, Demo labels in orders/dashboard/reports, export filter | `payments-billing-engineer` (owner), `superpowers:test-driven-development` (support) | `src/server/payments/{providers,sandbox}.ts`, `src/server/cart/service.ts`, `src/components/CheckoutPanel.tsx`, `src/components/CartView.tsx`, `src/app/admin/_components/{Dashboard,Reports}Screen.tsx`, `src/server/reports/**`, `docs/backend/decisions.md`; `checkout/service.ts` and `payments/service.ts` only after owner answer Q3 | M0, M2 |
| M8 KZ address + Yandex map + profile | AddressForm component (KZ regions/cities data, Yandex JS map, geocoder proxy), account modal + checkout reuse, lat/lng, birthday, email | `frontend-developer` (owner), `backend-architect` (support: proxy route + validation) | `src/components/address/**`, `src/lib/kz-regions.ts`, `src/app/api/geo/**`, `src/server/account/**`, `src/components/AccountDashboard.tsx`, `src/lib/account-client.ts` | M1 |
| M9 Verification & review | Full gates, browser E2E of the owner spot checks, perf bench, code review, plan Result | `superpowers:verification-before-completion` (owner), `code-reviewer` + `reality-checker` (verifiers) | `docs/plans/**`, `outputs/smoke/**` | all |

Gaps (no fitting skill): none. CKEditor integration has no dedicated skill, so it is `agent_direct` inside M5 and follows the official CKEditor 5 React/Next.js docs.

Waves (at most 2 parallel units, disjoint write scopes; parallel agents use their own worktrees):
- **Wave 0:** M0 ‖ M1
- **Wave 1:** M2 (serial, largest backend unit)
- **Wave 2:** M3 ‖ M4
- **Wave 3:** M5 ‖ M6 (M3 splits the editor into per-tab files first, so the scopes are disjoint)
- **Wave 4:** M7 ‖ M8 (CheckoutPanel address wiring is the last task of M8, after M7 merges)
- **Wave 5:** M9

## 5. Tasks
(Each wave's steps are expanded with `superpowers:writing-plans` before it starts; listed here at module-task granularity with verification.)

### M0 — Dev stack (wave 0, owner: `devops-automator`)
- [x] M0.1 Back up `src/lib/cms/data.json` → `data.json.bak-2026-11-21`; confirm `storage/devdb/` gitignored — verify: `git check-ignore storage/devdb` — done: `data.json.bak-2026-11-21` created (untracked), `git check-ignore` → `.gitignore:52:storage/`
- [x] M0.2 `scripts/dev/postgres.mjs`: persistent embedded PG (initdb once, start/stop, fixed loopback port, data in `storage/devdb/`) — verify: start, write sentinel, restart, read sentinel — done: scripts/dev/postgres.mjs + lib.mjs, persistent cluster in storage/devdb, secrets in dev-secrets.json; 3 restarts kept data (agent report)
- [x] M0.3 `scripts/dev/seed.mjs`: store_settings, KZ tax configuration, KZ shipping zone and KZT rate, default stock location, idempotent — verify: quote API returns a total for a seeded product — done: scripts/dev/seed.mjs: main location, 16% inclusive KZ VAT, flat 2000 KZT KZ shipping, store_settings; + taxonomy 112 nodes (lead, e65c700)
- [x] M0.4 Catalog import: extend `scripts/migration` mapping to write options/variants/prices/media/categories (breadcrumb→taxonomy)/opening stock movements from data.json; dry-run diff report — verify: `npm run dev:import -- --dry-run` 0 errors, then real run counts match — done: legacy importer once + per-product variant-sync (src/server/catalog/variant-sync.ts, integration 6/6) + initial categories via category-match.ts (unit 7/7); 22 products, 67 variants, 67 prices, 67 balances, 339 media, 0 dup SKUs, 0 uncategorized
- [x] M0.5 Dev-only console OTP sender (refused when `NODE_ENV=production`) — verify: unit test — done: src/server/auth/dev-phone-sender.ts gated by AUTH_DEV_OTP_CONSOLE, unit test
- [x] M0.6 `npm run dev:stack` (+ `--check`), `.env.local` template additions (no secrets committed), admin bootstrap steps in `docs/backend/local-development.md`; add `dev-stack` to `.claude/launch.json` only if the owner's dirty change allows (else document) — verify: A0 — done: npm run dev:stack/dev:db/dev:seed/dev:import/dev:admin; docs/backend/local-development.md + dev-stack-env.md; .claude/launch.json left untouched (owner dirty file). Merged-branch `npm run dev:stack -- --check` exit 0: catalog 200 (21 links), product 200, cart quote 1,252,000 KZT, admin login 200, import row PASS (outputs/runtime/dev-stack-check-1.log)

### M1 — Schema 0013 (wave 0, owner: `database-optimizer`)
- [x] M1.1 Migration: `categories` + `kind` (`catalog|accessory|group`), `slug` unique, `preset_filters jsonb`, `nav_visible`, `description` — verify: integration migrate-from-0012 test
- [x] M1.2 `product_compatibility` table with uniqueness and indexes on both sides, FK guards, check that device option value belongs to device product (trigger) — verify: integration constraint tests
- [x] M1.3 `customer_addresses` + `latitude`, `longitude`, `geo_precision` nullable with range checks — verify: integration test
- [x] M1.4 `products.in_the_box` accepts `{label,image?}` items (jsonb shape check allows strings and objects) — verify: integration test
- [x] M1.5 Taxonomy seed data file `src/server/catalog/taxonomy-seed.ts` from garmin.com nav (catalog tree) + accessory categories + groups (QuickFit 20/22/26, Lily, MARQ straps, watch series) with preset filters — verify: unit test shape; applied by M0 seed

### M2 — Catalog write + admin read API (wave 1, owner: `backend-architect`)
- [x] M2.1 Product command schema: options, variants (incl. stock), categories[] + primary, compatibility[], relations[], specGroups, inTheBox items, overviewHtml — verify: unit schema tests — done: src/server/cms/product-command.ts strict superset of legacy CMSProduct + categories/compatibility/relations/specGroups/inTheBox items/stock; unit cms-product-command. Merged d98990b; merged branch unit 226/226, integration 121/121 (13 files), boundaries ok
- [x] M2.2 Transactional save: upsert options/values/variants/variant_option_values/prices/media, product_categories, compatibility rows, relations; SKU uniqueness; optimistic version — verify: integration `cms-product-write.test.mjs` — done: src/server/cms/catalog-write.ts transactional writer reusing variant-sync; SKU 409 with conflicts; version 409; integration cms-product-write. Merged d98990b; merged branch unit 226/226, integration 121/121 (13 files), boundaries ok
- [x] M2.3 Stock via ledger: set-to-quantity per variant as a stock movement (reason `admin_set`), no direct balance writes; dashboard restock uses it — verify: A15 integration — done: stock via setStockFromSource with baseline/STOCK_CONFLICT; dashboard restock → POST /api/admin/catalog/restock ledger receive; integration stock-sync. Merged d98990b; merged branch unit 226/226, integration 121/121 (13 files), boundaries ok
- [x] M2.4 Admin list API: grouped (product rows + variant count + stock sum + thumbnail) and SKU view (variant rows), keyset pagination, filters (status, category, family, stock state), search, total count; per-product GET; lazy cross-sell picker endpoint — verify: integration + payload size assertion — done: GET /api/admin/catalog/products|skus|products/:key|products/:key/variants|taxonomy|picker, keyset paging + total; integration cms-admin-list. Merged d98990b; merged branch unit 226/226, integration 121/121 (13 files), boundaries ok
- [x] M2.5 Quick-edit endpoint for a variant (price, compare-at, stock, status, images) — verify: integration — done: PATCH /api/admin/catalog/variants/:id (price, compare-at, stock, status, images) with product version. Merged d98990b; merged branch unit 226/226, integration 121/121 (13 files), boundaries ok
- [x] M2.6 Indexes + perf seed (1,000 products / 5,000 SKUs) + `scripts/perf/admin-list-bench.mjs` — verify: A14 p95 < 300 ms — done: migration 0014 (option display, swatches, thumbnail_source, products_admin_order_idx); scripts/perf/admin-list-bench.mjs at 1,000/5,000: worst p95 103.5 ms (stock=low), others 7-16 ms, pages 17-34 KB (legacy list was 834 KB). Merged d98990b; merged branch unit 226/226, integration 121/121 (13 files), boundaries ok
- [x] M2.7 Garmin import route writes into the new command shape (draft) — verify: existing import tests + integration — done: garmin import draft validates against the command schema (unit test with fenix9 fixture). Merged d98990b; merged branch unit 226/226, integration 121/121 (13 files), boundaries ok

### M3 — Admin shell, list, editor base (wave 2, owner: `frontend-developer`)
- [x] M3.1 Measure garmin.com button/select shape (`scripts/clone/inspect.mjs states`), build `src/components/admin/ui/{Button,Select,StatusSelect}.tsx`, replace rectangular controls across admin screens — verify: grep audit, screenshots — done: src/components/admin/ui/{Button,Select,StatusBadge,StatusSelect}.tsx from CONTROLS.md; shape in ui/shape.ts = square (option A, owner confirmation pending; one-line switch to pill); applied across all admin screens. Merged d9f65dc
- [x] M3.2 Replace `ProductsScreen` + `PostgresProductsScreen` with one `ProductEditor` (full-viewport sheet, sticky save bar, unsaved indicator) split into tab files: General, Media, Variants, Specs, Overview, InTheBox, Accessories, SEO — verify: typecheck, cms-ui smoke — done: ProductEditor full-viewport sheet + sticky save, useProductEditorState + editor-state.ts, tabs/ per-tab files; old ProductsScreen/PostgresProductsScreen deleted; 409 handling. Merged d9f65dc
- [x] M3.3 Category tree multi-select with primary; remove default activities — verify: A1 browser step — done: CategoryPicker tree (catalog/accessory/group panels), one primary star, import breadcrumb preselect; default activities removed. Merged d9f65dc
- [x] M3.4 List page: Grouped / All SKUs toggle (remembered), expandable variants, quick-edit drawer, total count, debounced search, virtualized rows if >100 — verify: A2 — done: CatalogScreen Grouped/All SKUs, lazy variant expand, quick-edit drawer → PATCH variants/:id, filters, total, keyset pager. Merged d9f65dc
- [x] M3.5 Specs tab: editable groups + `src/lib/admin/spec-paste.ts` + Paste dialog with preview; remove default specs — verify: A4 — done: editable spec groups + src/lib/admin/spec-paste.ts (TSV, colon lines, HTML tables, dl) + paste dialog; unit spec-paste 11/11. Merged d9f65dc
- [x] M3.6 In-the-box tab: no presets, items with optional image upload — verify: A7 grep + UI — done: in-the-box {label,image?} rows with image pick/upload; no presets in client. Merged d9f65dc
- [x] M3.7 Preview modal includes overview and in-the-box from unsaved state — verify: browser — done: preview shows overview/specs/in-the-box from unsaved state. Merged d9f65dc; agent: unit 247/247, build ok, browser checks + screenshots docs/design-references/admin-products/

### M4 — Storefront catalog, stock, accessories (wave 2, owner: `frontend-developer`)
- [x] M4.1 Recon garmin.com nav and category filter sets → `docs/research/www.garmin.com/NAV_AND_FILTERS.md` — verify: file exists with per-category preset list — done: docs/research/www.garmin.com/NAV_AND_FILTERS.md (+CONTROLS.md, ACCESSORY_TAXONOMY.md)
- [x] M4.2 `/c/[...slug]` resolves taxonomy slug (any depth), includes descendants, applies preset filters, empty state instead of 404 — verify: A1/A13 — done: /c/[...slug] from taxonomy, curated membership incl. descendants, empty state 200, 404 unknown, sitemap. Merged 3f69578
- [x] M4.3 Facets computed from data with counts (Series, Case size per variant, Activity, Price range, Availability) — verify: unit + browser — done: computed facets with counts (Activity, Level, Case size per variant with garmin buckets, Series, Price, Availability), sorts. Merged 3f69578
- [x] M4.4 `homepage-nav.ts` + homepage tiles/carousels → local links; nav link test — verify: A13 — done: 94 megaNav links local; EXTERNAL_NAV_LINKS allowlist with reasons; home/series tiles local; unit nav-links. Merged 3f69578
- [x] M4.5 Availability: card "Out of stock" badge, product page disables out-of-stock values and selects an in-stock default — verify: A15 — done: Out of stock on cards, struck sold-out option values, in-stock default variant, ?sku= wins. Merged 3f69578
- [x] M4.6 Accessories tab grouped by the 9 categories + View All, variant-resolved compatibility; "Supported models" on accessory pages; remove hardcoded fēnix 8 accessories notice — verify: A9/A10 — done: Accessories tab per selected variant grouped Apps…Sensors+View All; Compatible devices on accessory pages; hardcoded fēnix 8 accessories removed. Merged 3f69578
- [x] M4.7 Breadcrumbs from primary category — verify: unit — done: breadcrumbs from primary category path (hidden groups skipped). Merged 3f69578
- [x] M4.8 Catalog `publicImage` accepts `/uploads/` media so imported galleries display (gap found by M0) — verify: product page shows imported gallery — done: publicImage accepts /uploads/ safely; imported galleries display. Merged 3f69578; screenshots docs/design-references/storefront-catalog/

### M5 — Overview editor + import (wave 3, owner: `frontend-developer`)
- [x] M5.1 Read Next 16 dynamic-import docs; add `ckeditor5` + `@ckeditor/ckeditor5-react` pinned; client-only `OverviewEditor` with GPL key — verify: `npm run build`, no CKEditor in storefront chunks — done: OverviewEditor (CKEditor 5 classic, GPL key, next/dynamic ssr:false), textarea fallback; build shows CKEditor chunks only in admin/products. Merged b50781c; merged branch unit 269/269, legacy 77/77, boundaries ok
- [x] M5.2 Shared allowlist `src/lib/overview/allowlist.ts` used by GHS config and `sanitizeOverviewHtml` — verify: A5 round trip — done: src/lib/overview/allowlist.ts shared by GHS config and sanitizeOverviewHtml; unit overview-roundtrip
- [x] M5.3 Editor styled with storefront overview CSS (edit-in-preview), block drag/cut-paste — verify: A6 — done: editor surface uses storefront overview CSS; fēnix 9 Pro text/blocks preserved; preview modal uses the storefront component
- [x] M5.4 YouTube: Media Embed limited to YouTube, stored as `<figure class="media"><oembed url>`; storefront click-to-play inline iframe (youtube-nocookie) — verify: A8 — done: src/lib/overview/youtube.ts + OverviewContent click-to-play inline youtube-nocookie iframe; legacy ov-video converted in editor; browser verified
- [x] M5.5 Importer: `ov-video` → media block (poster kept), in-the-box images downloaded — verify: import tests with fixture — done: importer: ov-video → media block, in-the-box {label,image} with res.garmin.com downloads (cap 40); garmin-import 17/17
- [x] M5.6 Migrate existing overview HTML (3 imported products) to the new video markup, idempotent — verify: integration — done: Postgres product pages render overview, spec groups, in-the-box tiles (no data migration needed: old ov-video renders and converts on edit); integration catalog-read 17/17

### M6 — Variants UX + compatibility UI (wave 3, owner: `frontend-developer`)
- [x] M6.1 `ui-radar` references for variant matrices; design contract per `anti-ui-slop` — verify: contract in `docs/design-references/admin-variants/` — done: design contract docs/design-references/admin-variants/README.md (UIZZE MCP not connected; references from knowledge, stated). Merged 4e28dd3
- [x] M6.2 Variants step: options-as-chips step, responsive grid with key columns, selection bulk bar, ready-to-sell indicators — verify: A3 finish gate + screenshots — done: VariantsStep: options as chip cards with Buttons/Swatches/Dropdown, one create/keep/remove bar with preview, responsive rows, ready-to-sell summary, selection bulk bar incl. 'All 51 mm'; finish gate pass. Merged 4e28dd3
- [x] M6.3 Accessories & compatibility tab: category→group→product picker (and reverse), add whole group, option-value chips, sentence readback, copy-from — verify: A9/A10 browser — done: CompatibilityTab: accessory side device picker → option-value chips → sentences ('fēnix 9 Pro – 51 mm (all 11 variants)'), exceptions, copy-from, QuickFit hint; device side grouped accessories, add whole group, finer rows read-only with 'Edit on accessory'; related products below. Merged 4e28dd3
- [x] M6.4 Watch-side "add accessory" writes the same compatibility row — verify: integration via API — done: tests/integration/compatibility-editor.test.mjs 4 cases + unit variants-state/compatibility-state; agent: unit 275/275, integration 28/28, build ok. Merged 4e28dd3

### M7 — Demo purchases (wave 4, owner: `payments-billing-engineer`)
- [x] M7.1 Record D03a in `docs/backend/decisions.md` — verify: file diff — done: D03a recorded in docs/backend/decisions.md. Merged 25f0bb9
- [x] M7.2 Sandbox auto-capture provider, env gates and production refusal — verify: unit — done: migration 0015 (sandbox provider/environment, orders.payment_mode sandbox, payment_attempts_sandbox_guard trigger; demo/live guards untouched) + src/server/payments/sandbox.ts gate (DEMO_PURCHASES, production refusal, live-provider refusal). Merged 25f0bb9
- [x] M7.3 Cart service passes providers; CheckoutPanel uses sandbox method when enabled; immediate capture path (depends on Q3) — verify: A11 integration — done: cart passes providers; checkout captures sandbox orders at once via applyPaymentEvent (paid, stock consumed, coupon used, order.paid, capture row); idempotent; CheckoutPanel demo notice + Paid (Demo) receipt. Merged 25f0bb9
- [x] M7.4 Demo labels in orders, dashboard, reports; exports can exclude sandbox — verify: integration + screenshots — done: Demo badges in fulfillment, 'Demo (sandbox)' series in reports/dashboard, exports exclude sandbox unless toggled; sandbox orders can ship. Merged 25f0bb9
- [x] M7.5 Update the affected existing tests (checkout, payments, fulfillment, cart-view) deliberately — verify: `npm test` — done: tests/integration/demo-purchases.test.mjs 6 tests + unit gate/panel; existing checkout/payments/fulfillment/promotions/reports tests updated with reasons; agent: unit 294/294, integration 136/136, build ok, dev:stack --check 7/7 incl. demo checkout → paid. Merged 25f0bb9

### M8 — KZ address + Yandex map + profile (wave 4, owner: `frontend-developer`)
- [x] M8.1 `src/lib/kz-regions.ts` (17 oblasts + 3 cities, main cities per region, centers) — verify: unit — done: src/lib/kz-regions.ts 17 regions + Astana/Almaty/Shymkent, en/ru/kk, centres verified via Wikipedia + Yandex; unit kz-regions. Merged 026b053
- [x] M8.2 Server: KZ-only validation, lat/lng, birthday + email in profile DTO/service — verify: integration — done: src/server/account/address-rules.ts: KZ only (400 otherwise), region codes, lat/lng KZ bbox, geo_precision; birthDate (age 10–120) + email; integration account-kz-address 7/7. Merged 026b053
- [x] M8.3 Geocoder proxy `src/app/api/geo/geocode` (forward + reverse, KZ bbox, rate limit, key server-side) — verify: unit with mocked fetch — done: POST /api/geo/geocode same-origin proxy, server-side key, KZ filter, fuzzy-guess guard, rate limits, 502/503/429 without leaking key; unit geo-geocode 12/12. Merged 026b053
- [x] M8.4 `AddressForm` with Yandex JS API 2.1 map (lazy script), two-way sync, not-found flow that keeps the typed line — verify: A12 browser with real keys — done: src/components/address/AddressForm.tsx with lazy Yandex JS 2.1 map, two-way sync, not-found flow keeps typed line (precision manual), graceful no-map mode; real-key browser checks passed. Merged 026b053
- [x] M8.5 Account modal + profile birthday/email UI; checkout reuses AddressForm (after M7 merge) — verify: browser — done: account modal + birthday/email (026b053); checkout saved-address cards + AddressForm + server checkKzAddress (400 non-KZ inline, ADDRESS_NOT_DELIVERABLE saved non-KZ) + admin "Deliver to" with region labels (fb83a00); agent: unit 333/333, integration 74/74, build ok, dev:stack --check 7/7, real-key guest + saved-card demo purchases

### M9 — Verification & review (wave 5, owner: `superpowers:verification-before-completion`)
- [x] M9.1 `npm test`, `npm run check` — verify: exit 0, counts recorded — done: final on bf4a3c7: `npm test` exit 0 (legacy 77/77, unit 342/342, integration 428/428, boundaries ok); `npm run check` exit 0 (lint 0 errors / 24 pre-existing warnings, typecheck, build 99 pages); `dev:stack --check` 7/7 incl. demo checkout → paid. Logs outputs/runtime/final-*.log
- [x] M9.2 Browser E2E of all manual spot checks with screenshots in `outputs/smoke/2026-11-21/` — verify: files — done: evidence-collector run 12/12 PASS (2 wording deviations explained) — docs/design-references/e2e-2026-11-21/RESULTS.md + screenshots; `npm run test:cms-ui` exit 0 after test-only fix (uppercase button text) and stale-step updates; storefront fix: single-SKU products no longer show a 'null' variant select. Merged bf4a3c7
- [x] M9.3 `code-reviewer` + `reality-checker` passes; fix Critical/Important — verify: review notes — done: code-reviewer pass (no money/stock/SQLi/leak issues) + 6 findings fixed TDD and merged 4e34845 (agent: unit 342/342, integration 151/151 across 15 suites, boundaries ok)
- [x] M9.4 Fill Result + Handoff; remove merged worktrees created by this run — verify: `git worktree list` — done: Result + Handoff filled; all agent worktrees/branches removed with junction-safe cleanup; no stray postgres

## 6. Verification
- `npm run typecheck`, `npm run lint`, `npm run build` (= `npm run check`)
- `npm test` (legacy + unit + integration + boundaries)
- `npm run test:cms-ui` browser smoke against `dev:stack`
- `node scripts/perf/admin-list-bench.mjs` (A14)
- Browser E2E via the built-in browser on `dev:stack` (A0–A15 manual parts)

## 7. Rollback
- All schema changes are additive (`0013`). Rollback means stopping `dev:stack` and restoring `storage/devdb` from its pre-import copy. The dev DB is disposable and re-importable from `data.json`.
- `data.json` is untouched by the new path. The backup `data.json.bak-2026-11-21` is kept.
- Each wave merges as its own commits on this branch, so a failed wave is reverted by its merge commit.
- Unrelated dirty files (§0) are never staged by this run.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|
| ~~M7.3~~ | Resolved 2026-11-21: owner said "Yes, commit them"; WhatsApp alerts committed as 7d0f76f (unit test 5/5) | – | – |

## Revisions
- 2026-11-22: owner answered "A" — admin controls stay Garmin square with pill status badges (already implemented; comment updated in shape.ts).
- 2026-11-21: plan drafted from 3 code-mapping agents and a 3-agent council.
- 2026-11-21: owner approved the plan as written ("Approve, start Wave 0"): D-R1 Postgres single runtime and D-D1/D03a demo purchases accepted. Q3 (WhatsApp files) and Q4 (key restriction) unanswered; Q3 blocks only M7.3 and is re-asked before Wave 4. Yandex keys written to `.env.local` (gitignored).
- 2026-11-21: Wave 0 done. M0 merged fe3913e, M1 merged d5bcd10, lead taxonomy/category assignment e65c700. Both worktrees were created from master by the harness; agents reset to 51b72b3 before working. Worktrees and branches removed (junctions removed first; main node_modules intact).
- 2026-11-21: Revision (in scope of #3/#14): M2 may add additive migration 0014 for option display type and option-value swatch color/image (M0 found no columns; today they survive only in legacy_content). Added M4.8 (/uploads media on storefront). Wave expansions are written into each agent's task contract (TDD inside the unit) rather than a separate writing-plans pass.
- 2026-11-21: Wave 1 started: M2 agent in its own worktree (base e65c700). In parallel, a research-only agent captures garmin.com nav/filters, control shapes and band widths into `docs/research/www.garmin.com/` (prep for M3.1, M4.1, M6.3; no code).
- 2026-11-21: Research landed (`docs/research/www.garmin.com/NAV_AND_FILTERS.md`, `CONTROLS.md`, `ACCESSORY_TAXONOMY.md`). Findings that change the build: (a) garmin.com subcategories are curated lists, not "parent + preset filter" (Running 73 vs All-Smartwatches-filtered-to-running 102); only Women pre-applies a filter. So M4 category pages list explicitly assigned products (incl. descendant categories) and `preset_filters` only pre-check facets where garmin.com does (Women). (b) garmin.com buttons, selects, checkboxes and size options are square (0 radius); only badges are pills (1.625em) and swatches are circles. Item 14 wording ("change status dropdown shape according to garmin design") asked to the owner.
- 2026-11-21: Wave 1 done: M2 merged d98990b (9 commits; API under /api/admin/catalog; compatibility ownership rule in catalog-media-schema.md). Incident: removing Wave 0 worktrees with `git worktree remove --force` followed per-package junctions and emptied main `node_modules/pg` and `postcss` (16:53). Restored from M2's locked-version copies (pg 8.23.1, postcss 8.5.33); lockfile audit shows only 4 optional wasm packages absent (not used on win32). Worktree cleanup now unlinks junctions and stops test clusters first (memory saved). M2 worktree, its orphan test postgres and the outside fallback D:projectsgarmin
ode_modules removed.
- 2026-11-21: Wave 2 done: M3 merged d9f65dc, M4 merged 3f69578. Lead fix eca8e77: dev import publishes imported homepage/active banners once (homepage was 503 on fresh DB), stack check gained a homepage row; cms-services test moved off the deleted PostgresProductsScreen. Merged-branch checks: unit 258/258, legacy 73/73, integration 150/150 (17 files, after the test fix), boundaries ok, typecheck ok, lint 0 errors in project code (15 errors only in the owner's untracked .claude/skills/design-taste-frontend/assets/effects/fx.js), `dev:stack --check` 6/6 (outputs/runtime/dev-stack-check-2.log). Worktrees removed with junction-safe cleanup.
- 2026-11-21: Wave 3 done: M5 merged b50781c, M6 merged 4e28dd3 (clean merges). Notes: M6 accidentally created 2 test products in M5's dev DB through the shared browser pane (that DB was deleted with M5's worktree; no effect on the main checkout). Open items for M9: `npm run test:cms-ui` fails at the homepage-editor step (pre-existing on b65f05b); check watch-series group assignment of imported products on the main dev DB.
- 2026-11-21: Post-Wave-3 full suite on the merged branch (402d3b3): unit 286/286, legacy 77/77, FULL integration 405/405 (all files), boundaries ok.
- 2026-11-21: Wave 4 merged: M7 25f0bb9, M8 026b053. Account address modal + birthday/email done; checkout wiring of AddressForm remains (M8.5). Server-only `YANDEX_GEOCODER_API_KEY` added to `.env.local` (same value). Key scan: no key values in tracked files.
- 2026-11-21: Checked main dev DB: all 22 imported products have a primary category and their watch-series group (open item resolved; M6 observation came from its own DB). Still open for M9: `test:cms-ui` fails at "Homepage editor did not load" (button text exists in HomepageScreen; page likely errors at render under Postgres).
- 2026-11-21: M9.3 independent review (code-reviewer, read-only, diff 51b72b3..b1b12b7): no money/stock/SQLi/leak issues; findings: (1) Important archived variant with compatibility link blocks saves, (2) Important DEMO_PURCHASES_ALLOW_PRODUCTION lets anonymous users take real stock, (3) stockBaseline race, (4) missing price becomes 0 KZT on resave, (5) bad percent-encoding 500, (6) editor reload/double-submit/restock double-click. Fix agent launched (TDD); E2E evidence + homepage-editor smoke fix agent launched in parallel. Lint config now ignores .claude/** and storage/** (b1b12b7): lint 0 errors.
- 2026-11-21: M9.1 gates on b1b12b7 (all features merged, before review fixes): `npm test` exit 0 — legacy 77/77, unit 333/333, integration 421/421, boundaries ok; `npm run check` exit 0 — lint 0 errors (24 pre-existing warnings), typecheck ok, build ok (99 pages). Logs: outputs/runtime/m9-npm-test.log, m9-npm-check.log. Gates rerun after the review-fix merge.
- 2026-11-21: Q3 answered "Yes, commit them" → WhatsApp alert edits committed as `7d0f76f`; `checkout/service.ts` and `payments/service.ts` are now free for M7. Note: Wave 0 worktrees were cut from 51b72b3 (before 7d0f76f); merges will carry it forward.
- 2026-11-21: M0 owns a reusable `src/server/catalog/variant-sync.ts` (legacy-shaped options/variants/prices/opening stock → Postgres) because the existing migration importer only writes a default variant; M2 reuses it in the admin save path. Category mapping of imported products into the taxonomy runs as a lead task after the Wave 0 merge (needs M1 columns).

## Result
**Delivered (all 15 owner items, branch `merge/backend-into-cms-variants`, final merge bf4a3c7, not pushed):**
1. Multi-category assignment (tree + primary) saved to `product_categories`; category pages list assigned products incl. descendants.
2. Admin list: Grouped / All SKUs views, lazy variant expand, SKU quick-edit drawer.
3. Redesigned Options & variants step (chips, create/keep/remove preview, ready-to-sell summary, selection bulk bar).
4. Editable spec groups + "Paste specs" (Excel/Sheets TSV, colon lines, website tables).
5. CKEditor 5 (GPL, 49.1.0) overview editor, admin-only bundle.
6. Edit-in-preview of imported garmin.com overview (storefront styling, block move, any language).
7. No in-the-box presets anywhere; items with photos; importer downloads garmin.com in-the-box photos.
8. YouTube media blocks swappable in the editor; storefront click-to-play inline iframe in place.
9. Accessories by category (Apps…Sensors + View All) on device pages; "Compatible devices" on accessory pages; editable from both sides.
10. Variant-level compatibility via option values (e.g. fēnix 51 mm only), single stored link (`product_compatibility`).
11. Demo purchases: sandbox provider (D03a), paid at checkout, stock consumed, Demo labels in orders/dashboard/reports, exports exclude sandbox; staff-only under the production override.
12. Kazakhstan-only addresses with Yandex map two-way sync + geocoder proxy, birthday and email; KZ address step in checkout with saved cards.
13. Taxonomy-driven `/c/` pages with computed facets; 94 mega-menu links local; homepage/series tiles local.
14. Admin list API p95 ≤ 91 ms at 1,000 products / 5,000 SKUs (pages ≤ 34 KB vs 834 KB before); Garmin-measured square controls across admin.
15. Stock through the inventory ledger everywhere (editor, drawer, restock); availability on cards/product page; purchasable when stock > 0.
Foundation: Postgres single runtime with `npm run dev:stack` (persistent embedded PG, migrations 0013–0015, KZ seed, taxonomy, data.json import, dev OTP).

**Checks run:** see M9.1 (npm test / npm run check / dev:stack --check all green), M9.2 (12/12 browser scenarios + test:cms-ui green), M9.3 (independent review; 6 findings fixed TDD), M2 benchmark.

**Gaps (honest):**
- Admin control shape: option A (Garmin square controls, pill status badges), confirmed by the owner 2026-11-22; switch stays in `src/components/admin/ui/shape.ts`.
- Legacy JSON mode is frozen: new features need `CMS_BACKEND=postgres` (use `npm run dev:stack`).
- Imported legacy simple products carry small prices (e.g. 249.99 KZT) from data.json — likely USD-era values; needs owner price review.
- Generated draft SKUs can be very long; Women page preset is empty (no tag data); KZT price facet buckets are my choice.
- Yandex keys must be restricted by HTTP referrer in the Yandex console; free-tier quota/terms need checking for production.
- `DEMO_PURCHASES` must be off for the real launch (refused automatically in production unless overridden).

**Follow-ups (owner):** review imported prices and stock; assign products to categories/accessory groups in the new editor; restrict Yandex keys.

## Handoff
All 57 tasks done and merged on `merge/backend-into-cms-variants` (HEAD after bf4a3c7 + plan commit); nothing pushed, no worktrees left. Run locally with `npm run dev:stack` (first run: `npm run dev:admin` for an owner account, enroll TOTP at first login). Owner confirmed admin control shape A on 2026-11-22; no open decisions. Evidence: docs/design-references/e2e-2026-11-21/RESULTS.md and outputs/runtime/final-*.log. Next work, if any, should start a new plan.
