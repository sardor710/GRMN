# Admin fixes, per-variant content, demo checkout, garmin.com polish — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done | 5 | 18/18 | 2026-11-21 | Pushed to origin/beta4 (owner revision); follow-ups listed in Result |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

**Why.** The owner wants to start testing the full store end to end (catalogue → order → fulfilment → reports) before a real payment provider is connected, with an admin that is not confusing and a storefront that reads as Garmin, not as a generated template.

**Backend.** PostgreSQL (`CMS_BACKEND=postgres`) is the live mode. All fixes target PostgreSQL. The legacy JSON mode is left as it is (not broken further, not improved).

**Repo / branch.** Work in `D:/projects/garmin/GRMN-beta3`, on a feature branch cut from `beta3` (`feat/admin-variants-demo-polish`). Merge into `beta3` and push `origin/beta3` only after every check in section 6 passes.

### R1 — Admin product list (`/admin/products`)
1. **Stock is the real total.** The Stock column shows available units = Σ(on_hand − reserved) over **all non-archived variants** of the product, across all non-archived stock locations. Today it counts only the default variant (`productSelect` in `src/server/cms/service.ts`). Low-stock colouring uses the same total.
2. **No per-row trash / delete icons.** Both are removed from every row.
3. **Bulk actions.** A checkbox per row plus a select-all (current page/filter). When ≥1 row is selected, an action bar appears with: **Publish**, **Move to draft**, **Archive**, **Delete…**, **Clear selection**. Delete asks for confirmation and keeps the existing server rule (products with orders or stock movements cannot be deleted → reported per product, archive suggested). Results are reported per product (n succeeded, m refused + why); partial success is shown, not hidden.
4. **Click to edit.** Clicking the product image, name or SKU opens that product's editor. Implemented as an invisible link layer over those cells; the checkbox and status control stay independently clickable. Keyboard accessible (a real link, focus-visible).
5. **Status dropdown.** The Status cell is a dropdown (Published / Draft / Archived) that saves on selection, shows a pending state, and reverts with an error message if the save is refused (e.g. version conflict).

### R2 — Per-variant content (inherit with override)
1. Each variant may override three content blocks: **Specs** (incl. grouped specs), **Overview**, **In the box**. Default for each block is "Same as product".
2. Product editor: in each variant's panel, a per-block switch "Own / Same as product"; "Own" opens that block's editor pre-filled with the product's content as a starting copy.
3. Storefront product page: switching variant (e.g. 47 mm → 51 mm, or colour) swaps Specs, Overview and In the box to that variant's effective content immediately, without a page reload; the URL keeps the selected variant so a reload/share shows the same content.
4. Translations (RU/KZ) work for variant overrides the same way they work for product content (auto-translate included).
5. **Garmin import auto-fill.** When importing a product from garmin.com, the importer fetches each variant's own specs / overview / in-the-box from Garmin's variant data and stores them as overrides **only where they differ** from the product-level content. _Builder's call:_ it reads each variant's own Garmin product page (sizes such as 47/51 mm usually differ there); where nothing differs, no override is stored.
6. Storage: a new additive migration (`drizzle/0021_…`); no existing column is dropped.

### R3 — Demo checkout (full demo)
1. While demo mode is on, the purchase button runs the normal checkout (address → shipping → payment). The payment step offers a clearly labelled **Demo payment** action. **Owner decision (B):** demo mode is available on every environment **including the live production site until launch**; it is controlled by an admin setting (Settings → Payments, "Demo checkout", default **on**) with an env override to force it off. **While demo is on, the `manual` (real-money) payment option is hidden** at checkout, so one checkout never offers demo and a live provider together. Accepted risk: a visitor can place a "paid" demo order; mitigations are the DEMO label, demo orders never counted as real money, and a "Demo" filter in admin Orders so they can be found and cancelled.
2. Completing it makes the order behave exactly like a paid order: payment recorded as captured (environment `demo`), stock decremented, normal notifications (incl. WhatsApp alerts if configured), fulfilment through processing → shipped → delivered, refunds possible.
3. Every demo order and demo payment is labelled **DEMO** in the storefront confirmation, account order history, admin orders list/detail and exports. Demo money is never counted in real-money totals.
4. Turning demo mode off hides the demo action and shows `manual` again; existing demo orders keep their label.
6. _Builder's call:_ demo orders created before this change (unpaid under the old D03 rule) are left as they are; only new demo orders can be paid. No backfill.
5. This deliberately changes decision D03 (demo orders could never become paid); the change and its guardrails (demo can never be enabled together with a live provider for the same checkout; demo payments never reconciled as real) are recorded in `docs/backend/`.

### R4 — Dashboard (`/admin`)
1. Shows real-money revenue and a **separate Demo revenue** line (never summed together).
2. Shows order counts by status, recent orders, low-stock items and best-sellers for the selected date range, from all orders (not only paid ones), reading the same PostgreSQL data as Orders and Inventory.
3. _Builder's call:_ order counts by status include every order (real + demo, any status). Best-sellers count paid orders only, real and demo shown separately, cancelled excluded. Low stock reflects stock, so demo sales reduce it like real ones.
4. Empty states say plainly that there is no data yet for the range; errors are shown, not swallowed into zeros.

### R5 — garmin.com design and copy cleanup (copy-and-styling, not a rebuild)
1. Measure garmin.com with `scripts/clone/inspect.mjs` (tokens, type scale, number styling, buttons, side/mega menu, form controls, badges, price display) and record it in `docs/research/www.garmin.com/` (extend what exists).
2. Storefront (home, catalogue, product page, cart, checkout, account, header/footer/side menu): restyle buttons, blocks, numbers/prices, menus and labels to match garmin.com's design code; replace generated-sounding copy with Garmin-style wording (short, factual, Garmin's terms).
3. Admin: apply the same tokens (font, colours, button and input styles, number formatting); remove "AI slop" — decorative gradients, emoji, filler sentences, redundant icons, over-explaining helper text, marketing tone in an operator tool.
4. Layout structure of pages is kept; no new sections are invented.
5. _Builder's call — pass bar:_ reference = the garmin.com region already measured in `docs/research/www.garmin.com/`. Done = this checklist, each pixel-diffed with `scripts/clone/diff.mjs` and screenshotted side by side: header + side/mega menu, primary/secondary/text buttons, price and number styles, product-page price/buy block, product cards, form inputs/selects, badges, footer.

- **Deliverables:** code on `beta3` (pushed), migration 0021, updated tests, research notes for garmin.com, a short `docs/backend/demo-checkout.md`, this plan file with evidence.
- **Constraints:** Next.js 16 conventions (read `node_modules/next/dist/docs/` before touching routing/data APIs); TypeScript strict, no `any`; Tailwind utilities, no inline styles; additive migrations; existing optimistic-concurrency and permission checks stay; do not touch the dirty files in `D:/projects/garmin/GRMN` (merge/backend-into-cms-variants).
- **Non-goals:** connecting a real payment provider; legacy JSON-mode fixes; new storefront sections or page layouts; changing the i18n pipeline beyond variant overrides; mobile apps.
- **Assumptions:** local PostgreSQL via `npm run db:local:up` is available for integration tests and browser checks; garmin.com is reachable for measurement and import; the owner is fine with demo orders existing in the database until demo mode is turned off.
- **Open questions:** none blocking (see Builder-check calls below once filled).

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Product with 2 variants (stock 3 + 7, one reservation of 1) shows Stock 9 in the admin list API | auto | integration test `tests/integration/admin-products-stock.test.mjs` |
| A2 | No trash/delete icon rendered in product rows; bulk bar appears on selection | auto+manual | UI smoke + screenshot |
| A3 | Bulk publish/draft/archive/delete apply per product and report refusals (ordered product cannot be deleted) | auto | integration test |
| A4 | Clicking image, name or SKU navigates to the editor; checkbox and status dropdown do not | manual | browser check |
| A5 | Status dropdown saves and reverts with error on conflict | auto+manual | integration test + browser |
| A6 | Variant override stored, inherited when off; product page swaps specs/overview/in-the-box on variant switch without reload; URL keeps variant | auto+manual | unit + integration + browser |
| A7 | Garmin import stores per-variant overrides only where they differ | auto | unit test on importer with fixture |
| A8 | Demo checkout: order paid (demo), stock decremented, fulfilment steps work, DEMO label shown in storefront + admin | auto+manual | integration test + browser end-to-end order |
| A9 | Demo money excluded from real totals; dashboard shows both lines, counts, recent orders, low stock, best-sellers | auto | integration test on reports |
| A10 | Demo action unavailable when demo mode off; `manual` hidden while demo on and shown when off | auto | integration test |
| A11 | garmin.com measurements recorded; buttons/numbers/menus match (visual diff per key component) | manual+auto | `scripts/clone/diff.mjs` + screenshots |
| A12 | Full suite green | auto | `npm test` and `npm run check` |

Manual spot checks: one complete demo order from product page to "delivered" in admin; dashboard after that order; variant switch on a watch with 47/51 mm; admin product list bulk archive of 2 products; side-by-side screenshots vs garmin.com for header/menu, product page price block and buttons.

## 3. Anti-drift
- **Primary objective:** the owner can run and test the whole ordering process on PostgreSQL, with correct stock, a usable product list, per-variant content and a Garmin-faithful look.
- **Proxy signals (not success by themselves):** build/lint/tests pass; a component "looks close" in one screenshot; demo button exists but order never reaches paid/stock/dashboard.
- **Intended scope:** R1–R5 above, PostgreSQL mode, storefront + admin of this repo.
- **Completion target:** full delivery, pushed to `origin/beta3`.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 | Admin product list: true stock, bulk actions, click-to-edit, status dropdown | `frontend-developer` (owner) · `superpowers:test-driven-development` (support) · `code-reviewer` (verifier) | `src/server/cms/{service,http}.ts`, `src/app/api/admin/products/**`, `src/app/admin/products/**`, `src/components/admin/products/**` (new), tests | – |
| M3 | Demo checkout that pays, reserves→consumes stock, fulfils, labelled DEMO; demo setting hides manual | `payments-billing-engineer` (owner) · `superpowers:test-driven-development` (support) · `code-reviewer` (verifier) | `drizzle/0021_*`, `src/server/{payments,checkout,cart,settings,fulfillment}/**`, `src/components/CheckoutPanel.tsx`, `src/app/admin/{orders,settings}/**`, `src/app/[lang]/account/**` order list, tests | – |
| M2 | Per-variant specs/overview/in-the-box (inherit with override), storefront swap + URL, translations, Garmin auto-fill | `backend-architect` (owner, data + read path) · `frontend-developer` (support, editor + product page) · `superpowers:test-driven-development` (support) · `code-reviewer` (verifier) | `drizzle/0022_*`, `src/server/cms/product-projection.ts`, `src/server/catalog/service.ts`, `src/i18n/translate-record.js`, `src/app/admin/products/_components/ProductsScreen.tsx` (variants tab only), `src/components/admin/product-editor/**`, `src/components/{ProductTop,ProductTabs}.tsx`, `src/components/product/**`, `src/app/[lang]/p/[id]/page.tsx`, `src/lib/import/garmin-parse.js`, `src/app/api/admin/import/garmin/route.ts`, tests | M1 (same editor file) |
| M4 | Dashboard: real vs demo revenue, status counts, recent orders, low stock, best-sellers | `backend-architect` (owner) · `dataviz` (support, chart/tiles) · `code-reviewer` (verifier) | `src/server/reports/**`, `src/app/api/admin/reports/**`, `src/app/admin/_components/ReportsScreen.tsx`, tests | M3 (demo environment) |
| M5a | garmin.com measurement + storefront restyle and copy cleanup | `clone-website` inspection scripts (support) · `ui-designer` (owner) · `evidence-collector` (verifier) | `docs/research/www.garmin.com/**`, `src/app/{globals,garmin-fonts}.css`, storefront components in `src/components/**` excluding `admin/`, `messages/**` (EN copy) | M2, M3 (their storefront files) |
| M5b | Admin restyle with Garmin tokens + remove AI slop | `ui-designer` (owner) · `ui-finish-gate-reviewer` (verifier) | `src/components/admin/**`, `src/app/admin/**` (styling/copy only) | M1–M4, M5a tokens |
| M6 | Full verification, browser end-to-end, merge to `beta3`, push | `superpowers:verification-before-completion` (owner) · `reality-checker` + `code-reviewer` (verifiers) | plan file, branch ops | all |

Gaps (no fitting skill): none. Note: garmin.com has no admin; M5b applies storefront tokens to the admin (owner-approved).

Waves (at most 2 parallel units, disjoint write scopes; parallel agents use their own worktrees off `feat/admin-variants-demo-polish`, lead merges each wave):
- Wave 1: M1 ‖ M3
- Wave 2: M2 ‖ M4
- Wave 3: M5a
- Wave 4: M5b
- Wave 5: M6

Migration numbering is fixed to avoid collisions: M3 = `0021_demo-payments.sql`, M2 = `0022_variant-content.sql` (generate with `npm run db:generate` after the schema change, rename to these slugs, keep drizzle `meta/_journal.json` in order).

## 5. Tasks

# Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship R1–R5 on PostgreSQL mode and push to `origin/beta3`.

**Architecture:** Server changes go through the existing service layer (`createCMSHTTP` → `cms/service.ts`, `payments/service.ts capture()`, `reports/service.ts`) with versioned writes and permission checks preserved. Variant overrides live in the editor document (`legacy_content.variants[].content`) and are projected to `product_variants.content_overrides` for storefront reads. Demo payments reuse the existing `capture()` path with demo provenance.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, PostgreSQL + drizzle migrations, `node:test` integration tests on a temporary PostgreSQL (`scripts/db/temporary-postgres.mjs`).

**Spec:** sections 1–3 of this file.

## Global Constraints
- PostgreSQL mode only; do not change legacy-JSON behaviour.
- TypeScript strict, no `any`; Tailwind utilities, no inline styles; 2-space indent; named exports.
- Read `node_modules/next/dist/docs/` before touching route handlers, params, or data fetching.
- Migrations additive only (`0021_demo-payments.sql`, `0022_variant-content.sql`).
- Every write keeps `authorize(headers, permission)` and optimistic `version` checks; 409 `VERSION_CONFLICT` stays the conflict signal.
- Demo money is never summed with real money in any DTO, export or UI total.
- Demo and `manual` are never offered in the same checkout.
- Every integration test file follows the existing pattern: `before()` → `startTemporaryPostgres()` → drizzle `migrate` → `createDatabase`/`createAuthFoundation`.

## Review Focus
1. **Bulk action with one stale row** — 3 products selected, one edited elsewhere meanwhile: the other two succeed, the stale one reports `VERSION_CONFLICT`, and the UI keeps it selected. Test in Task 1.2.
2. **Product whose variants have no inventory rows or are archived** — stock shows `0` (not blank/NaN), archived variants are excluded. Test in Task 1.1.
3. **Demo payment submitted twice (double click / retry)** — exactly one capture transaction and one stock consumption. Test in Task 3.2.
4. **Variant override "Own" with an empty list** (e.g. empty in-the-box) — shows empty, does not fall back to product content; absent key falls back. Test in Task 2.1.
5. **Demo turned off while a shopper is mid-checkout** — placing a demo order is refused with `PAYMENT_METHOD_UNAVAILABLE` and a readable message; nothing is reserved. Test in Task 3.1.

---

### M1 — Admin product list (wave 1, owner: `frontend-developer`) — [x] merged 990f8f2
> Evidence: 1.1 [x] 133f48a admin-products-stock 2/2; 1.2 [x] 8b4cdb7+1d8079f admin-products-bulk 8/8, cms-services 25/25, integration 402/403 (catalog-variants /tmp env issue); 1.3 [x] d1f556e+33823c3 test:cms-ui PASS incl. stale-row scenario, lint 0 errors; screenshot docs/design-references/admin-products-bulk.png. All reviews clean.

#### Task 1.1: Product stock = sum over all active variants
**Files:** Modify `src/server/cms/service.ts:89` (`productSelect` stock lateral). Test: `tests/integration/admin-products-stock.test.mjs` (new).
**Produces:** list/get DTO field `stock: number` unchanged in name, now the product total.
- [ ] Write test `product stock sums available units across all non-archived variants and active locations`: product with variants A (on_hand 3), B (on_hand 7, reserved 1), C archived (on_hand 50), plus an archived location holding 9 for A → `stock === 9`. Second case: product whose variants have no balances → `stock === 0`.
- [ ] Run `node --conditions=react-server --test tests/integration/admin-products-stock.test.mjs` → FAIL (stock 3).
- [ ] Change the stock lateral to aggregate over `product_variants pv WHERE pv.product_id=p.id AND pv.status<>'archived'` joined to `inventory_balances` and non-archived `stock_locations`; keep price from the default variant.
- [ ] Rerun → PASS. Run `npm run test:integration` → no regressions.
- [ ] Commit `fix(admin): product stock counts every active variant`.

#### Task 1.2: Status-only and bulk endpoints
**Files:** Modify `src/server/cms/service.ts` (add functions), `src/server/cms/http.ts` (routes). Create `src/app/api/admin/products/bulk/route.ts`. Test: `tests/integration/admin-products-bulk.test.mjs`.
**Produces:**
- `cms.setProductStatus(headers: Headers, input: { id: string; version: number; status: "published" | "draft" | "archived" }) => Promise<{ id: string; version: number; status: string }>` — locks row, 409 on version mismatch, bumps version, calls `projectProduct`.
- `cms.bulkProducts(headers: Headers, input: { action: "publish" | "draft" | "archive" | "delete"; items: { id: string; version: number }[] }) => Promise<{ results: BulkResult[] }>` with `BulkResult = { id: string; ok: true; version?: number } | { id: string; ok: false; code: string; message: string }`. Each item in its own transaction; `delete` reuses `deleteProduct` and its "ordered or stocked" refusal. Max 100 items.
- HTTP: `PATCH /api/admin/products` accepts `{ id, version, status }` (extend `patchSchema`); `POST /api/admin/products/bulk` → `bulkProducts`. Permission: same as product save; delete keeps delete's permission.
- [ ] Tests: `status-only save bumps version and rejects stale version with 409`; `bulk publish of three items reports two ok and one VERSION_CONFLICT`; `bulk delete refuses an ordered product with PRODUCT_IN_USE and deletes the other`; `bulk rejects more than 100 items with 400`.
- [ ] Run → FAIL; implement; run → PASS; full integration suite → green.
- [ ] Commit `feat(admin): status-only and bulk product actions`.

#### Task 1.3: List UI — selection, bulk bar, click-to-edit, status dropdown, no row icons
**Files:** Modify `src/app/admin/products/_components/ProductsScreen.tsx:660-740` (rows), remove `handleDelete`/`handleDeletePermanently` row buttons (lines ~712-737) and the out-of-date comment at line 187. Create `src/components/admin/products/BulkActionBar.tsx`, `src/components/admin/products/StatusMenu.tsx`. Test: extend `tests/ui/cms-smoke.mjs` with a products-list scenario.
**Consumes:** Task 1.2 endpoints.
- `BulkActionBar({ count, onAction, onClear, busy })` — actions Publish / Move to draft / Archive / Delete…; Delete uses a confirm dialog naming the count; result toast: "`n` updated · `m` not changed" with per-product reasons listed.
- `StatusMenu({ id, version, status, onSaved, onError })` — native-feel dropdown (Radix `DropdownMenu` from shadcn), optimistic with revert on error.
- Row click target: an absolutely positioned `<Link>`-equivalent button covering image + name + SKU cells (`aria-label="Edit <name>"`, focus-visible ring) that calls `handleOpenEdit(p)`; checkbox and status sit above it (`relative z-10`).
- Header checkbox selects all rows on the current page; selection clears on filter/search change; stale rows from a bulk result stay selected.
- [ ] Extend smoke: no `Trash2`/"Delete" button inside any row; selecting 2 rows shows the bar; clicking a name opens the editor modal; changing status via menu persists after reload.
- [ ] Run `npm run test:cms-ui` → PASS. `npm run lint && npm run typecheck` → clean.
- [ ] Commit `feat(admin): bulk actions, click-to-edit rows and inline status`.

### M3 — Demo checkout (wave 1, owner: `payments-billing-engineer`) — [x] merged 09f2803
> Evidence: 3.1 [x] 2ca0014+6603568 demo-checkout/store-setup/checkout 19/19; 3.2 [x] 3d61b21+5033079 integration 405/406 (catalog-variants /tmp env), covering files 72/72; 3.3 [x] 5154b09+669caab unit 235/235, 12 integration files 155/155, smoke blocks pass (webpack); payment_mode default dropped in 0021. Screenshots docs/design-references/demo-*.png. All reviews clean.

#### Task 3.1: Demo setting, availability and placeOrder
**Files:** Create `drizzle/0021_demo-payments.sql` (+ journal). Modify `src/server/settings/service.ts:58,119` (make `payment_mode` updatable), `src/server/cart/runtime.ts:28` (replace `NODE_ENV` rule), `src/server/checkout/service.ts:137-193`, `src/app/admin/settings/**` (Payments → "Demo checkout" toggle), `.env.example`, `deploy/env.example`. Test: `tests/integration/demo-checkout.test.mjs`.
**Produces:**
- `demoCheckoutEnabled(pool): Promise<boolean>` in `src/server/payments/demo-mode.ts` = `store_settings.payment_mode === 'demo'` AND env `DEMO_CHECKOUT_DISABLED !== "1"`.
- `availablePaymentMethods(pool): Promise<("demo" | "manual")[]>` → `["demo"]` when demo on, else `["manual"]`. Exposed on the existing checkout/cart GET payload as `paymentMethods`.
- Migration 0021: widen `payment_transactions`/`refunds` provider CHECKs to also allow `(provider='demo', environment='demo', merchant_account='demo')`; default `store_settings.payment_mode` stays as is, set row 1 to `'demo'` in the migration.
- `placeOrder` with `paymentMethod: "demo"` when demo is off → `PAYMENT_METHOD_UNAVAILABLE` (409), nothing reserved; `"manual"` when demo is on → same refusal.
- [ ] Tests: `demo on offers only demo; off offers only manual`; `env DEMO_CHECKOUT_DISABLED=1 forces demo off`; `placing a demo order while demo is off is refused and reserves nothing`; `placing manual while demo is on is refused`.
- [ ] FAIL → implement → PASS; full integration suite green.
- [ ] Commit `feat(payments): demo checkout setting replaces manual while on`.

#### Task 3.2: Demo payment captures like a real one
**Files:** Modify `src/server/payments/demo.ts` (D03 change), `src/server/payments/service.ts` (add `confirmDemoCapture`, reuse `capture()` at :299), `src/server/checkout/service.ts` (call after order is sealed), `docs/backend/demo-checkout.md` (new, records the D03 change and guardrails). Test: same file as 3.1.
**Produces:** `confirmDemoCapture(pool, { orderId: string; attemptId: string }) => Promise<{ orderId: string; paymentStatus: "paid" }>` — idempotent on `attemptId`; writes `kind='capture'` with demo provenance; consumes the reservation and coupon via `capture()`; order becomes `confirmed/paid`, `payment_mode='demo'`; emits the same outbox events as a manual capture (notifications, WhatsApp).
- [ ] Tests: `a demo purchase becomes confirmed and paid and consumes its stock reservation`; `submitting the same demo attempt twice records one capture and consumes stock once`; `a demo order can be shipped, delivered and refunded`; `demo refund writes provider demo and never touches a live provider`.
- [ ] FAIL → implement → PASS; suite green.
- [ ] Commit `feat(payments): demo purchases are captured, fulfilled and refundable`.

#### Task 3.3: Storefront and admin DEMO labels
**Files:** Modify `src/components/CheckoutPanel.tsx:68-129` (method from `paymentMethods`; button "Pay (demo)" + one-line note "Demo payment — no money is charged."), `OrderReceived` (DEMO badge), account order list/detail under `src/app/[lang]/account/**`, `src/app/admin/orders/_components/FulfillmentScreen.tsx` (DEMO badge + "Demo" filter), `src/server/fulfillment/service.ts:201` (`listOrders` accepts `paymentMode?: "demo" | "live"`), order CSV export column `payment_mode`. Test: extend `tests/ui/cms-smoke.mjs` with a demo order scenario.
- [ ] Smoke: add to cart → checkout → Pay (demo) → confirmation shows DEMO → admin Orders "Demo" filter lists it with badge → dispatch → deliver.
- [ ] Run `npm run test:cms-ui` → PASS; lint + typecheck clean.
- [ ] Commit `feat(checkout): demo pay button and DEMO labels across store and admin`.

### M2 — Per-variant content (wave 2, owner: `backend-architect`) — [x] merged 6fa7d12
> Evidence: 2.1 [x] ffa9489 variant-content 6/6; 2.2 [x] b460781 11/11; 2.3 [x] 5077a0e..34888f0 smoke variant-content (flat, grouped, single-variant) PASS; 2.4 [x] e60ca65..b89a651 smoke variant-switch PASS (no navigation, ?variant kept, canonical unchanged), ownsOverview flag; 2.5 [x] accdbd9..c9d6002 garmin-variant-content 9/9, legacy garmin 17/17 (in-page tab diff; save limit 4 MiB products-only). Screenshots variant-*.png. Reviews clean.

#### Task 2.1: Data model, projection and read path
**Files:** Create `drizzle/0022_variant-content.sql` (`product_variants.content_overrides jsonb NOT NULL DEFAULT '{}'` + CHECK `jsonb_typeof = 'object'`). Modify `src/server/cms/product-projection.ts:18,40`, `src/server/catalog/service.ts:137-175`, `src/types/` product DTO. Test: `tests/integration/variant-content.test.mjs`, `tests/unit/variant-content.test.mjs`.
**Produces:**
- `type VariantContent = { specs?: Spec[]; specGroups?: SpecGroup[]; overviewHtml?: string; inTheBox?: string[] }` (reuse existing `Spec`/`SpecGroup` types). A present key means "Own" (even if empty); absent means inherit.
- `EditorVariant.content?: VariantContent` (saved in `legacy_content.variants[]`), projected into `content_overrides`.
- `effectiveVariantContent(product: ProductContentDTO, variant: { content?: VariantContent }) => Required<VariantContent>` in `src/lib/catalog/variant-content.ts`.
- `ProductDetailDTO.variants[].content: Required<VariantContent>` — already effective and localized.
- [ ] Unit tests: `absent override inherits product content`; `own empty inTheBox stays empty`; `own specGroups replace product specGroups`.
- [ ] Integration: `saving a variant override projects it and the product detail returns per-variant effective content`; `RU request returns translated override, falls back to the English override (not product RU) when the override has no RU`.
- [ ] FAIL → implement → PASS; suite green. Commit `feat(catalog): per-variant specs, overview and in-the-box`.

#### Task 2.2: Translations for overrides
**Files:** Modify `src/i18n/translate-record.js:100` (`PRODUCT_SPEC` gains `variants[].content.{overviewHtml,inTheBox,specs,specGroups}`), `src/server/i18n/translate-runtime.ts` only if the spec walker needs nested arrays keyed by variant id. Test: extend `tests/unit/machine-translate.test.mjs`.
- [ ] Test `auto-translate covers variant override text and keys it by variant id`; FAIL → implement → PASS. Commit.

#### Task 2.3: Editor UI — Own / Same as product
**Files:** Modify the variants tab in `src/app/admin/products/_components/ProductsScreen.tsx:1255` and `src/components/admin/product-editor/VariantsTable.tsx`; create `src/components/admin/product-editor/VariantContentEditor.tsx` (three switches + editors reusing the existing specs/in-the-box/overview editors; switching to Own copies product content as a start).
- [ ] Smoke scenario: set 51 mm "Own specs", change one value, save, reopen → value kept and 47 mm still inherits. `npm run test:cms-ui` → PASS. Commit.

#### Task 2.4: Product page swaps content and keeps the variant in the URL
**Files:** Create `src/components/product/ProductVariantContext.tsx` (client context: `selectedVariantId`, `setSelectedVariantId`). Modify `src/app/[lang]/p/[id]/page.tsx:138-139` (wrap `ProductTop` + `ProductTabs` in the provider; read `?variant=<sku>` from `searchParams` for the initial variant), `src/components/ProductTop.tsx:24,79-85` (use context; `history.replaceState` writes `?variant=<sku>` on postgres too), `src/components/ProductTabs.tsx:45-67` (render `variants.find(selected).content`).
- [ ] Browser check on local PostgreSQL: Fenix-style product 47 → 51 mm swaps specs/overview/in-the-box with no navigation request; reload keeps 51 mm. Screenshot to `docs/design-references/variant-switch.png`. Commit.

#### Task 2.5: Garmin import auto-fill per variant
**Files:** Modify `src/lib/import/garmin-parse.js:273-389` (export `parseGarminTabs(html) => { specGroups, overviewHtml, inTheBox }`), `src/app/api/admin/import/garmin/route.ts:31-129` (for each non-default sku fetch `<productUrl>?sku=<sku>`, 3 at a time, 20 s each; diff against default; set `variants[i].content` only for differing blocks; a failed fetch adds a warning and stores no override). Fixtures via `scripts/fetch-garmin-fixture.mjs` into `tests/fixtures/garmin/` (two sizes of one watch). Test: `tests/unit/garmin-variant-content.test.mjs`.
- [ ] Tests: `variant with different specs gets an own specGroups override`; `identical tabs store no override`; `fetch failure yields a warning and no override`. FAIL → implement → PASS. Commit.

### M4 — Dashboard (wave 2, owner: `backend-architect`) — [x] merged 9cefcb9
> Evidence: 4.1 [x] 5b37763+c5988fc reports-settings 16/16, demo-checkout 13/13 (best-sellers net of refunds — ruling); 4.2 [x] b6d0228+0f2ce93 dashboard unit 9/9, smoke ONLY=dashboard PASS, git clean after smoke; screenshot docs/design-references/dashboard.png. Reviews clean.

#### Task 4.1: Reports service
**Files:** Modify `src/server/reports/service.ts:25-65`, `src/server/reports/runtime.ts:51`. Test: extend `tests/integration/reports-settings.test.mjs`.
**Produces:** `CurrencyTotalDTO.environment: "sandbox" | "live" | "demo"`; new views `?view=status_counts` → `{ orderStatus: Record<string, number>; fulfillmentStatus: Record<string, number>; demo: number; real: number }`; `?view=recent_orders&limit=10` → `{ items: { id, number, createdAt, totalMinor, currency, paymentStatus, fulfillmentStatus, demo: boolean }[] }`; `?view=best_sellers&limit=8` → `{ real: Item[]; demo: Item[] }` with `Item = { variantId, sku, name, units, revenueMinor }` (paid orders, cancelled excluded). All take the summary's `from/to/timeZone`.
- [ ] Tests: `demo captures are reported in a separate demo total, never in live`; `status counts include unpaid and demo orders`; `best sellers split real and demo and exclude cancelled`. FAIL → implement → PASS. Commit.

#### Task 4.2: Dashboard screen
**Files:** Modify `src/app/admin/_components/ReportsScreen.tsx` (tiles: Revenue, Demo revenue, Orders, Awaiting shipment; daily revenue chart per `dataviz` rules; recent orders table linking to the order; low stock; best-sellers real/demo tabs; explicit empty and error states).
- [ ] Browser check after one demo order: Demo revenue > 0, Revenue 0, the order in Recent orders, its product in best-sellers (Demo). Screenshot to `docs/design-references/dashboard.png`. Commit.

### M5a — garmin.com measurement and storefront cleanup (wave 3, owner: `ui-designer`) — [x] merged 2ba8bb0
> Evidence: 5a.1 [x] 9eb2485 research (TOKENS, COPY_GUIDE, 11 component specs); 5a.2 [x] ae40f17..40dc3ed tokens + one KZT Price (unit 293/293), buttons 3.86%/2.35% diff; 5a.3 [x] 9ea8aaf..9065aa7 header 2.19%/0.08%, filter 1.25%/1.30%, buy box 14.04%/26.15% (content), card shell matched; copy en/ru/kk key-synced. Reviews clean.

#### Task 5a.1: Measure
- [ ] Run `scripts/clone/inspect.mjs` (`recon`, `section`, `states`) on garmin.com product page, catalogue page, cart and the header mega menu (the region already used in `docs/research/www.garmin.com/recon.json`). Write `docs/research/www.garmin.com/components/{ProductBuyBox,ProductCard,Buttons,Price,MegaMenu,Forms,Badges}.spec.md` with exact values (font family/size/weight/tracking, number formatting, colours, radii, spacing, states).

#### Task 5a.2: Tokens and shared primitives
**Files:** `src/app/globals.css`, `src/app/garmin-fonts.css`, shared button/price/badge components (locate under `src/components/ui/` and `src/components/product/`).
- [ ] Apply measured tokens; one `Price` component used everywhere (Garmin number style); buttons match primary/secondary/text specs incl. hover/focus. `npm run check` → clean. Commit.

#### Task 5a.3: Pages and copy
**Files:** header/mega menu (`src/components/home/HomeHeader.tsx`, `header-icons.tsx`), `SiteFooter.tsx`, catalogue cards, `ProductTop.tsx`/`ProductTabs.tsx` styling, `CartView.tsx`, `CheckoutPanel.tsx` styling, account pages, `messages/en*.json`.
- [ ] Copy rules: short, factual, Garmin terms ("Add to Cart", "Specs", "In the Box", "Compare"); remove filler/marketing sentences, emoji and decorative gradients. Keep RU/KZ keys in sync (re-run auto-translate for changed keys).
- [ ] For each checklist item in R5.5: `node scripts/clone/diff.mjs` vs garmin.com at 390/1440 and side-by-side screenshots in `docs/design-references/garmin-compare/`. Record pixel % per item in section 6. Commit per area.

### M5b — Admin cleanup (wave 4, owner: `ui-designer`) — [x] merged 2ba8bb0
> Evidence: 5b.1 [x] 196172d..01b1ee3 Garmin side menu, one KZT format, slop removed, FulfillmentScreen stale-response race fixed; before/after shots docs/design-references/admin/. Reviews clean.
#### Task 5b.1: Admin tokens, shell, copy
**Files:** `src/components/admin/{AdminLayoutShell,AdminSidebar,AdminHeader}.tsx`, admin screens under `src/app/admin/**/_components/` (styling and copy only, no behaviour).
- [ ] Apply storefront tokens (font, colours, buttons, inputs, number formatting via the shared `Price`/number helpers); remove gradients, emoji, redundant icons and over-explaining helper text; sidebar styled like Garmin's side menu (measured in 5a.1).
- [ ] `ui-finish-gate-reviewer` pass on dashboard, products, orders, settings; fix findings; `npm run test:cms-ui` → PASS. Commit.

### M6 — Verification and delivery (wave 5)
- [x] Run section 6 commands — see Outputs in section 6.
- [x] Browser end-to-end on local PostgreSQL (tests/ui/cms-smoke.mjs full run, 13 PASS blocks): demo order → delivered, dashboard, variant switch, bulk archive, status dropdown, hydration on /en and /ru PDPs.
- [x] Whole-branch review in 3 areas (server, storefront, admin): 0 Critical; 4 Important + 16 minors fixed in b5b2b1e..eee9d2f; scoped re-review ready to merge.
- [-] Merge into `beta3` — dropped by owner revision 2026-11-20. [x] Pushed the verified branch as new `origin/beta4`.
- [x] Clean up worktrees this run created (GRMN-wt-m1..m5, wt-fix, wt-final).

## 6. Verification
- `npm run lint` · `npm run typecheck` · `npm run test:unit` · `npm run test:integration` · `npm run check:boundaries` · `npm run test:cms-ui` · `npm run build` · browser checks on the local dev server against local PostgreSQL (`npm run db:local:up`, `CMS_BACKEND=postgres`).
- Design: `scripts/clone/diff.mjs` per R5.5 checklist item (390 and 1440 widths).

Outputs (final, 2026-11-21, GRMN-beta3 real checkout): typecheck 0 · lint 0 errors (24 pre-existing warnings) · test:unit 314/314 · test:legacy 302/302 · check:boundaries 0 · test:integration 442/442 · build (turbopack) OK (75a96f8) · test:cms-ui full webpack run PASS, 13 blocks (16c8b6d, test-only race fix after 75a96f8).

## 7. Rollback
Migration 0021 is additive. Each wave is a separate set of commits on the feature branch; a failed wave is reverted by commit. Nothing reaches `beta3` until all checks pass.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-19: requirement drafted from brainstorming (PostgreSQL; delete in bulk bar; full demo; inherit-with-override; Garmin auto-fill; approach A; push to beta3).
- 2026-11-20: owner revision — push to a NEW branch `beta4` (created from the verified feature branch) instead of merging into `beta3`; beta3 stays untouched.
- 2026-11-19: builder check folded in. Owner chose demo on live site until launch with `manual` hidden while demo is on (B). Builder's calls marked in R2.5, R3.6, R4.3, R5.5.

## Result
Delivered: R1 admin products (true stock, bulk bar, click-to-edit, status dropdown); R2 per-variant specs/overview/in-the-box (editor, PDP swap + ?variant=, RU/KK, Garmin auto-fill); R3 full demo checkout (setting, capture, fulfilment, refunds, DEMO labels, 5/24h demo cap); R4 connected dashboard (real vs demo revenue, status counts, recent orders, net best-sellers, low stock); R5 garmin.com tokens, KZT price, storefront + admin restyle, copy cleanup en/ru/kk. Migrations 0021, 0022.
Checks run: see section 6 Outputs.
Gaps: card colour swatches and Z→A sort need data/API; buy-box 390 diff remainder is content; Turbopack dev/build cannot run inside junction worktrees (fine in a real checkout).
Follow-ups: mobile ProductTabs renders hidden duplicate body; price 0 can be saved; demo cap has no reset/override (shared per address); legacy compareAt ×1.1 default; product-projection chained SKU rename; duplicated demo-refund settle helper; dev-only non-hydration after webpack compile.

## Handoff
Done. All 18 tasks reviewed and merged on feat/admin-variants-demo-polish and pushed as origin/beta4 (beta3 untouched per owner). Before deploying: run `npm run db:migrate` (0021 demo payments, 0022 variant content); demo checkout is ON by default — turn it off in Admin → Settings → Payments (or DEMO_CHECKOUT_DISABLED=1) at launch. Next work = the Follow-ups list in Result.
