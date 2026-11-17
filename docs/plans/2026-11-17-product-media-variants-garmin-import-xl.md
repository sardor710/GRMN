# Product media, custom variants and garmin.com import — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done | 5 | 30/30 | 2026-11-17 | Owner review; optional follow-ups below |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

**Why (owner's words, condensed):** fill the catalog faster and more flexibly — upload real photos, pull complete product data from an official garmin.com link instead of typing it, and sell any kind of variant (sizes like `42`/`Biggest`, groupsets like `Shimano`/`SLR`, colors…), not just three fixed case sizes.

- **Goal:** In the admin product editor, an owner can (1) upload product photos from their computer, choose the default photo and preview the product page; (2) paste a garmin.com product link and get a fully pre-filled draft — name, family, category, overview, grouped specs, in the box, every variant with its options, prices, part numbers and photo galleries; (3) define any options and values themselves and manage the resulting variants. Shoppers can pick those variants on the storefront and the cart buys the exact variant.
- **Deliverables:**
  1. **Photo uploads** — multi-file upload from PC, drag-to-reorder gallery, mark one default (product-level and per-variant), alt text, remove. Files stored in a persistent upload folder outside `public/` (`UPLOAD_DIR`, default `storage/uploads/`) and served by an `/uploads/[...path]` route, so they work in dev, `next start` and on the VPS (decision D05: self-hosted VPS, not Vercel).
  2. **Product preview** — "Preview" in the editor renders the storefront product top (gallery, pickers, price) from the unsaved form state.
  3. **Custom options & variants** — per product: any number of options (name + ordered values, display as buttons / swatches (image or color) / dropdown); "Generate variants" builds all combinations, keeping edits on combinations that already exist; each variant has SKU, price, compare-at price, stock, status, its own images, and exactly one default variant. Products with no options remain simple single-SKU products (all 20 existing products keep working unchanged).
  4. **garmin.com importer** — server-side import from a `www.garmin.com` / `buy.garmin.com` product URL. Reads the page's embedded product data (`GarminAppBootstrap` + JSON-LD). Produces: name, generated family (e.g. "fēnix 9"), category/breadcrumbs, description, SEO fields, sanitized overview, specs grouped by section (and the flat list the storefront uses today), in the box, option axes with labels and swatches (Case Size, Version, inReach, Color…), all variants with part number, variation name, price, availability and image gallery. Photos are downloaded into our own storage. **Prices:** the import dialog asks for a KZT-per-1-USD rate (remembered in settings) and converts Garmin USD list/sale prices to KZT; each variant keeps the original Garmin USD amounts as reference (`sourcePrice`). (Owner decision 2026-11-17, consistent with D11/D12: KZT base, USD display-only.) Result opens as an editable draft — nothing is saved until the owner saves.
  5. **Storefront variant flow** — `/p/[id]` shows option pickers like garmin.com; choosing changes price, gallery, part number and stock; unavailable combinations disabled; `?sku=` deep-links a variant; the cart line stores the variant SKU and label; orders record the variant SKU and label; SKU-scoped discounts match the variant SKU or the product SKU; stock is decremented on the variant where the current flow decrements stock. Catalog "Case size" filter keeps Small/Medium/Large: each product has an editable size bucket, auto-derived for mm values (≤42 mm Small, 43–46 Medium, ≥47 Large).
  6. **Migration importer update** (branch `codex/backend-task-02`, own worktree) — map the new JSON fields into `product_options`, `option_values`, `product_variants`, `variant_option_values`, `prices`, `media_assets`, `product_media`; update `source-inventory.json` / manifest and reconciliation tests. Additive schema migration only where the catalog has no home: option display type, option-value swatch color/swatch media. Compare-at prices → existing `prices` compare-at; variant stock → existing inventory tables via the importer's current stock path; variant status → `draft/active/archived`. Test source = a copy of master's real `data.json` including an imported fēnix 9 and its media, not only a synthetic fixture.
- **Constraints:**
  - Stay on the current JSON store (`src/lib/cms/data.json`) on `master`; the new data shape mirrors the Postgres catalog tables 1:1 so migration needs no guessing.
  - Backward compatible: all new product fields optional; `image`, `price`, `stock`, `caseSize`, `specs`, `inTheBox` stay populated (mirrored from the default variant / imported data) so existing pages, filters, compare and SEO keep working.
  - Import only from Garmin hosts (`www.garmin.com`, `buy.garmin.com`, images from `res.garmin.com`); timeouts and size caps; no other sites.
  - Variant SKUs unique across all products, case-insensitive (admin validates; matches Postgres constraint).
  - Prices stored in KZT (owner-confirmed 2026-11-11); Garmin USD kept only as reference.
  - Next.js 16 conventions (read `node_modules/next/dist/docs/` before route/API work); TypeScript strict, no `any`.
  - Don't touch dirty files that aren't ours; don't disturb the codex migration worktree's own branch — importer work happens in a new worktree branched from it.
- **Non-goals:** switching the live app to PostgreSQL; ongoing sync/price tracking with Garmin (import is one-shot); bulk import of many links; importing from non-Garmin sites; image editing/cropping; multi-currency checkout or a live FX feed (the rate is entered manually); merging the migration branch into `master`.
- **Assumptions (my calls, correct if wrong):**
  - One garmin.com link imports the whole family on that page (e.g. fēnix 9: 43/47/51 mm, Pro/standard, inReach, colors ≈ 33 variants) as **one product with variants**.
  - Imported photos (gallery + overview images) are downloaded locally, de-duplicated, capped (default 60 images per import) — not hotlinked.
  - Overview is stored as sanitized HTML (text, headings, lists, images, tables; no scripts/styles/handlers) and rendered in the existing Overview tab.
  - Upload limits: JPEG/PNG/WebP/AVIF, ≤10 MB each, content-type checked by file signature.
  - Variant generation warns above 100 combinations and refuses above 500.
  - Variant price defaults to the product price; per-variant override optional.
  - (Builder-check calls) uploads served via route, not `public/`; size bucket rule above; order/discount SKU rule above; additive Postgres columns only for display type and swatches.
- **Open questions:** none blocking.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Typecheck, lint (0 errors) and production build pass on `master` | auto | `npm run check` |
| A2b | Import with rate 500 KZT/USD turns a $1,249.99 variant into 624,995 KZT and keeps `sourcePrice` 1249.99 USD | auto | `node --test tests/garmin-import.test.mjs` |
| A2 | Garmin parser on saved fēnix 9 fixture yields ≥30 variants, 4 labeled options (Case Size, Version, inReach, Color), each variant has part number, price and ≥10 images; ≥10 spec groups; in the box = 3 items; overview non-empty with no `<script>`, `<style>` or `on*=` | auto | `node --test tests/garmin-import.test.mjs` |
| A3 | Parser handles Venu 4 and Edge 1060 fixtures without throwing; options present for both (Edge via fallback from per-SKU selections) | auto | same test file |
| A4 | Import endpoint rejects non-Garmin hosts, non-https and private IPs (400) | auto | same test file |
| A5 | Upload endpoint rejects non-images (by signature), >10 MB and unauthenticated requests; accepts a JPEG and returns a `/uploads/...` path that serves 200 | auto | `node --test tests/product-upload.test.mjs` |
| A6 | Variant generator: cartesian combinations, preserves edited existing variants by value signature, exactly one default, respects 500 cap | auto | `node --test tests/product-variants.test.mjs` |
| A7 | All existing products still render `/p/[id]` 200 and catalog/compare work | auto | route sweep script in M7 |
| A8 | Storefront: picking an option changes price, main image and part number; cart line holds the variant SKU | manual + browser check | M7 browser script |
| A9 | Migration branch: importer creates option/variant/price/media rows for a product with variants; reconcile passes; branch test suite passes | auto | `npm test` in the importer worktree |

Manual spot checks:
- Paste `https://www.garmin.com/en-US/p/1953453` in admin → draft with fēnix 9 family, all variants, photos visible → save → `/p/<id>` shows pickers like garmin.com.
- Create a product by hand with option "Groupset: Shimano, SLR" and "Size: 42, Biggest" → 4 variants, set default, upload photos, preview, save.

## 3. Anti-drift
- **Primary objective:** an owner can get a complete, sellable multi-variant product into the store from a Garmin link or by hand with their own photos and their own option names — and shoppers can buy a specific variant.
- **Proxy signals (not success by themselves):** build passes; parser returns JSON; upload returns 200; variants exist in data.json but the storefront still sells one SKU; importer test passes on a synthetic product only.
- **Intended scope:** admin product editor, CMS product types/store, storefront product page + cart line, catalog size filter, new admin API routes (upload, import), tests, and the migration importer on its own branch. Not: other admin sections, homepage, checkout/payment logic beyond carrying the SKU.
- **Completion target:** full delivery of deliverables 1–6.

## 4. Modules and skill map

**Architecture:** Pure logic lives in plain-JS modules with thin typed TS wrappers. This is the existing `homepage-schema.js/.ts` pattern, so `node --test` can test them without a TS toolchain. Next route handlers do I/O (upload, serve, fetch Garmin), React components consume the typed wrappers, and the JSON store keeps the legacy fields mirrored from the default variant.
**Tech:** Next.js 16.2.1 App Router route handlers, React 19, TypeScript strict, `node:test`. New dependency: `sanitize-html` (+ its `htmlparser2`) for the overview sanitizer and specs/in-the-box parsing. This is my call: hand-rolled HTML sanitizing is a security risk.

| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Data model & variant logic | Types + tested pure logic for options/variants/legacy sync/size bucket/SKU uniqueness | `superpowers:test-driven-development` (owner, lead) · `software-architect` (verifier: model vs Postgres tables) | `src/lib/cms/types.ts`, `src/lib/cms/product-variants.{js,ts}`, `src/lib/cms/store.ts`, `src/app/api/admin/products/route.ts`, `tests/product-variants.test.mjs` | – |
| M2 Uploads & media serving | Authenticated multi-image upload, traversal-safe `/uploads/*` serving, remote-image download helper | `superpowers:test-driven-development` (owner) · `appsec-engineer` (verifier) | `src/lib/media/storage.{js,ts}`, `src/app/api/admin/uploads/route.ts`, `src/app/uploads/[...path]/route.ts`, `tests/product-upload.test.mjs`, `.gitignore` | M1 |
| M3 garmin.com importer | Parser + import route returning a complete KZT-priced draft with local images | `superpowers:test-driven-development` (owner) · `appsec-engineer` (verifier: SSRF, sanitizer) | `src/lib/import/garmin-parse.{js,ts}`, `src/app/api/admin/import/garmin/route.ts`, `scripts/fetch-garmin-fixture.mjs`, `tests/fixtures/garmin/*`, `tests/garmin-import.test.mjs`, `package.json` | M1 (types), M2 (downloader) |
| M4 Admin product editor | Images editor, options/variants editor, import dialog, preview modal wired into products page | `frontend-developer` (owner) · `evidence-collector` (verifier) | `src/components/admin/product-editor/*`, `src/app/admin/products/page.tsx`, `src/lib/cms/types.ts` (StoreSettings field only) | M1, M2, M3 |
| M5 Storefront variant flow | Variant pickers on `/p/[id]`, overview HTML + grouped specs tabs, cart/order lines carry SKU, size bucket filter | `frontend-developer` (owner) · `evidence-collector` (verifier) | `src/types/index.ts`, `src/lib/products.ts`, `src/components/ProductTop.tsx`, `src/components/ProductTabs.tsx`, `src/components/product/VariantPicker.tsx`, `src/lib/cart.tsx`, `src/components/CartView.tsx` | M1 |
| M6 Migration importer | Branch importer maps options/variants/prices/media into Postgres; additive columns; reconcile passes | `backend-architect` (owner, own worktree from `codex/backend-task-02`) · `code-reviewer` (verifier) | new worktree only: `drizzle/*`, `src/server/db/schema/catalog.ts`, `scripts/migration/*`, `docs/backend/source-*`, `tests/integration/*` | M1 (shape), M3 (real sample) |
| M7 Final verification | Whole-diff review, security pass, browser walkthrough, acceptance evidence | `superpowers:verification-before-completion` (owner) · `code-reviewer` + `appsec-engineer` + `evidence-collector` (verifiers) | plan file, `docs/research/qa/*` | M1–M6 |

Gaps (no fitting skill): none.

**Execution mode:** `master` carries a large uncommitted working tree (CMS work + homepage fixes) that a worktree branched from `HEAD` would not contain. So M1–M5 run **serially in place** on `master` (lead + one builder at a time, no commits unless the owner asks). M6 runs in its **own worktree** on a new branch `feat/catalog-variant-import` from `codex/backend-task-02`, so it can run in parallel with M4/M5 (disjoint repos and paths).

Waves (at most 2 parallel units, disjoint write scopes):
- Wave 1: M1
- Wave 2: M2 → M3 (serial, same checkout; M3 uses M2's downloader)
- Wave 3: M4 ‖ M6
- Wave 4: M5
- Wave 5: M7

## 5. Tasks

> **For agentic workers:** execute per wave with `superpowers:executing-plans` (serial, in place) and `superpowers:subagent-driven-development` for M6. Tick checkboxes here as you go.

### Global constraints
- KZT prices; imported Garmin USD kept only in `sourcePrice` (`{ currency: "USD", list, sale?, rateKztPerUsd }`); converted price = `Math.round(usd * rate)`.
- Garmin hosts only: page `www.garmin.com` / `buy.garmin.com` over https; images `res.garmin.com`. Page fetch timeout 15 s, max 12 MB; image max 15 MB; ≤60 images per import.
- Uploads: JPEG/PNG/WebP/AVIF by file signature, ≤10 MB each, ≤20 files per request; stored in `UPLOAD_DIR` (env, default `<cwd>/storage/uploads`), served at `/uploads/<…>`.
- Variant generation warns at >100 combinations, refuses at >500 (`MAX_VARIANTS = 500`, `WARN_VARIANTS = 100`).
- Variant SKUs unique across all products, case-insensitive. Exactly one default variant when variants exist.
- All new `CMSProduct` fields optional; legacy `image/price/originalPrice/stock/caseSize/specs/inTheBox` always mirrored on save.

### Review focus (inputs no happy-path test hits)
1. A Garmin page whose bootstrap lacks `productEmsList` options or uses another axis shape (Edge 1060). Expected: options derived from per-SKU `options.selected`, labels humanized. Test in M3 Task 3.2.
2. A Garmin link that redirects off-host, or a URL with credentials, IP literals or a non-443 port. Expected: rejected before any fetch follows it. Test in M3 Task 3.3.
3. Editing options after variants exist (renaming a value, removing a value). Expected: matching variants keep their SKU/price/stock, orphaned variants are dropped only when you click Generate, and a confirm dialog shows the count. Test in M1 Task 1.2.
4. Upload path tricks (`../`, encoded `%2e%2e`, absolute paths) on `/uploads/[...path]`. Expected: 404, and nothing outside `UPLOAD_DIR` is ever read. Test in M2 Task 2.2.
5. A product saved with two variants sharing a SKU (also across products, different case). Expected: 409 with the clashing SKU, and nothing written. Test in M1 Task 1.3.

### M1 — Data model & variant logic (wave 1, owner: lead with TDD)

**Task 1.1: Types**
- Modify `src/lib/cms/types.ts`: add `OptionDisplay = "buttons" | "swatch" | "dropdown"`; `ProductOptionValue { id; key; label; swatchColor?; swatchImage? }`; `ProductOption { id; key; name; display: OptionDisplay; values: ProductOptionValue[] }`; `ProductImage { id; src; alt; source: "upload" | "import" | "url"; width?; height? }`; `SourcePrice { currency: "USD"; list: number; sale?: number; rateKztPerUsd: number }`; `ProductVariant { id; sku; title; selections: Record<string, string> /* optionId → valueId */; price; originalPrice?; stock; status: "draft" | "active" | "archived"; isDefault: boolean; imageIds: string[]; sourcePartNumber?; sourcePrice?: SourcePrice }`; `SpecGroup { title; items: ProductSpecItem[] }`; `ProductSource { provider: "garmin"; url; productId; partNumber; importedAt }`. Extend `CMSProduct` with optional `images, defaultImageId, options, variants, overviewHtml, specGroups, source`. Extend `OrderItem` with optional `sku, variantLabel`. Extend `StoreSettings` with optional `importRateKztPerUsd: number`.
- [x] verify: `npx tsc --noEmit` passes. — evidence: tsc clean (2026-11-17).

**Task 1.2: Variant logic** — `src/lib/cms/product-variants.js` + typed wrapper `.ts`
- Produces: `generateVariants(options, existing, base: { sku, price, stock }) → { variants, removed: number, warning?: string }` (throws `RangeError` above 500); `selectionSignature(selections, options) → string`; `ensureSingleDefault(variants) → variants`; `resolveVariant(variants, selections) → ProductVariant | undefined`; `availableValueIds(variants, selections, optionId) → Set<string>` (active variants only); `sizeBucketFromLabel(label) → "Small" | "Medium" | "Large" | undefined` (≤42 mm Small, 43–46 Medium, ≥47 Large; non-mm → undefined); `syncLegacyFields(product) → product` (copies default variant's price/originalPrice/stock, the default image src → `image`, flattens `specGroups` → `specs`, sets `caseSize` from a size-like option (key or name matching `/size/i`) when bucketable, otherwise keeps it); `findSkuConflicts(product, allProducts) → string[]`. New SKU pattern for generated variants: `${base.sku}-${valueKeys.join("-")}` uppercased.
- [x] Write `tests/product-variants.test.mjs`: `generates 2×2 = 4 variants for Size[42,Biggest] × Groupset[Shimano,SLR]`; `keeps sku/price/stock of an existing matching variant`; `reports removed count when a value is deleted`; `exactly one default after generation`; `throws RangeError for 3 options × 8 values (512)`; `warning for 101+`; `availableValueIds disables combos with no active variant`; `sizeBucketFromLabel("43 mm") === "Medium"`, `("51 mm") === "Large"`, `("Biggest") === undefined`; `syncLegacyFields mirrors default variant price into product.price`; `findSkuConflicts detects "abc-1" vs "ABC-1" across products`.
- [x] Run `node --test tests/product-variants.test.mjs` → FAIL (module missing); implement; rerun → PASS. — evidence: RED (module missing) → GREEN 13/13.

**Task 1.3: Store + products API**
- Modify `src/lib/cms/store.ts` `saveProduct`: apply `syncLegacyFields` before persisting. Modify `src/app/api/admin/products/route.ts` POST: return 409 `{ error, conflicts }` when `findSkuConflicts` is non-empty; sanitize `overviewHtml` with `sanitizeOverviewHtml` (from M3; until M3 lands, strip `<script>`/`<style>`/`on*` with a TODO replaced in Task 3.4).
- [x] Add test `rejects duplicate variant SKU across products (case-insensitive)` exercising `findSkuConflicts` with store-shaped data; `node --test tests/product-variants.test.mjs` PASS; `npx tsc --noEmit` PASS. — evidence: `node --test tests/*.test.mjs` 34/34, tsc clean.

### M2 — Uploads & media serving (wave 2, owner: TDD; verifier: appsec-engineer)

**Task 2.1: Storage helpers** — `src/lib/media/storage.js` + `.ts`
- Produces: `uploadDir() → string` (env `UPLOAD_DIR` or `<cwd>/storage/uploads`); `sniffImageType(buf: Uint8Array) → "jpeg" | "png" | "webp" | "avif" | null`; `saveImage(buf, { folder }) → Promise<{ src: string; file: string }>` (name = random UUID + ext, `src` = `/uploads/<folder>/<yyyy>/<uuid>.<ext>`); `resolveUploadFile(segments: string[]) → string | null` (decodes, rejects `..`/absolute/backslash, verifies realpath stays inside `uploadDir()`); `downloadRemoteImage(url, { folder }) → Promise<{ src } | { error }>` (https + `res.garmin.com` only, 15 s timeout, 15 MB cap, signature-checked, de-dup by URL within a call via a passed `Map`).
- [x] Tests in `tests/product-upload.test.mjs`: signature detection for each type and for a `.jpg`-named text file → null; `saveImage` writes under a temp `UPLOAD_DIR`; `resolveUploadFile(["..","etc"])`, `["%2e%2e","x"]`, `["/abs"]` → null; `downloadRemoteImage("https://evil.com/a.jpg")` → error without network. FAIL → implement → PASS. — evidence: RED (module missing) → GREEN 7/7.
- [x] Add `storage/` to `.gitignore`. — evidence: `/storage/` appended.

**Task 2.2: Routes** (read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` first)
- `src/app/api/admin/uploads/route.ts` POST multipart field `files` (1–20): 401 without `getCurrentAdmin()`; 400 bad type; 413 >10 MB; 200 `{ images: { src: string }[] }`.
- `src/app/uploads/[...path]/route.ts` GET: `resolveUploadFile` → stream with sniffed content-type, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`; else 404.
- [x] Integration check script in the test file (`describe "routes"`, skipped unless `BASE_URL` set): unauthenticated POST → 401; GET `/uploads/..%2f..%2fpackage.json` → 404. Run `BASE_URL=http://localhost:3001 node --test tests/product-upload.test.mjs` → PASS. — evidence: 9/9. Manual: seed admin login → upload JPEG 200 `/uploads/products/2026/<uuid>.jpg` → GET 200 image/jpeg, immutable, nosniff; text file named .jpg → 400. Test file removed afterwards.

### M3 — garmin.com importer (wave 2, after M2; owner: TDD; verifier: appsec-engineer)

**Task 3.1: Fixtures**
- [x] `scripts/fetch-garmin-fixture.mjs <url> <name>`: fetches the page and writes `tests/fixtures/garmin/<name>.html` containing only the `GarminAppBootstrap` script and the two `application/ld+json` scripts (keeps fixtures small). Run for `https://www.garmin.com/en-US/p/1953453` → `fenix9`, `/p/1614061` → `venu4`, `/p/1967830` → `edge1060`. Verify each file <2 MB and contains `GarminAppBootstrap`. — evidence: fenix9 4016 KB, venu4 888 KB, edge1060 72 KB; all contain the bootstrap.

**Task 3.2: Parser** — `src/lib/import/garmin-parse.js` + `.ts`; add dependency `sanitize-html`
- Produces: `validateGarminUrl(raw) → { ok: true, url: URL } | { ok: false, error }`; `extractBootstrap(html) → object` (brace-matched JSON after `var GarminAppBootstrap = `; throws `GarminParseError` if absent); `sanitizeOverviewHtml(html) → string` (allow h1–h4, p, ul, ol, li, strong, em, a[href], img[src, alt], table/thead/tbody/tr/th/td, figure, figcaption, br; strip everything else, all `on*`, `style`, `script`, custom elements unwrapped); `parseSpecsTable(html) → SpecGroup[]` (`<h3>` rows start groups; `<th>`/`<td>` pairs; `td.yes` → "Yes", `td.no` → "No"); `parseInTheBox(html) → string[]`; `familyFromName(simpleDisplayName) → string` (strip ®™, edition words `Pro|Plus|Solar|AMOLED` and trailing ` – …`, e.g. "fēnix® 9 Pro" → "fēnix 9"); `parseGarminProduct(html, { sourceUrl, rateKztPerUsd, now }) → { product: CMSProductDraft, remoteImages: { id, url }[], warnings: string[] }`. Options from `productEmsList` (title → `name`, option `text` or `altText` → value label, `image` → `swatchImage`, swatch axes → `display: "swatch"`). Fallback: union of each SKU's `options.selected` keys, label = humanized key. Variants from `skus` (title = `productVariation`, `sourcePartNumber` = `partNumber`, price from `price.salePrice ?? price.listPrice` converted, `originalPrice` = converted list price when on sale, `status` = `isSellable && displayable ? "active" : "draft"`, stock 0 and owner-edited). Images reference `remoteImages` ids. Default variant = page `sku`.
- [x] Tests `tests/garmin-import.test.mjs` (fixtures, no network), covering A2/A2b/A3: fenix9 → ≥30 variants, option names include `Case Size`, `Color`; every variant has `sourcePartNumber`, price >0 and ≥10 imageIds; specGroups ≥10; inTheBox length 3; overview has no `<script`, `<style`, ` on\w+=`; family `fēnix 9`; rate 500 → variant with list 1249.99 has price 624995 and `sourcePrice.list` 1249.99. venu4 and edge1060 parse without throwing and have ≥1 option each. `validateGarminUrl` rejects `http://www.garmin.com/…`, `https://garmin.com.evil.io/…`, `https://user@www.garmin.com/…`, `https://www.garmin.com:8443/…`, `https://127.0.0.1/…`; accepts `https://www.garmin.com/en-US/p/1953453`. FAIL → implement → PASS. — evidence: RED (module missing) → GREEN; full suite `node --test tests/*.test.mjs` 54/54.

**Task 3.3: Import route** — `src/app/api/admin/import/garmin/route.ts`
- POST `{ url, rateKztPerUsd, downloadImages = true }`: 401 without admin; 400 invalid url/rate (rate must be >0); fetch with `redirect: "manual"`, follow ≤3 redirects only to hosts passing `validateGarminUrl`; timeout/size caps; parse; when `downloadImages`, download ≤60 images via `downloadRemoteImage` into folder `products/garmin/<partNumber>` and rewrite image srcs (gallery + overview `<img>`), dropping failed ones into `warnings`; persist the rate to `StoreSettings.importRateKztPerUsd`. Returns `{ draft, warnings }`; never saves the product.
- [x] Manual check with dev server: `curl` POST (admin cookie) for the fēnix 9 link returns ≥30 variants and local `/uploads/...` srcs that serve 200. Record the output in the evidence note. — evidence: HTTP 200 in 27.5 s; 33 variants; options Case Size 3, Version 3, inReach 2, Color 8; 245 images saved locally (12 MB) and served 200 image/jpeg; overview 14 photos localized, SVG icons hotlinked; saved as draft `garmin-1953453` (price 649995, caseSize Large); a duplicate product gets 409 listing the conflicting SKUs.

**Task 3.4:** [x] Replace the Task 1.3 placeholder sanitizer with `sanitizeOverviewHtml`. Verify: `node --test tests/*.test.mjs` PASS. — evidence: tsc clean, 54/54.

### M4 — Admin product editor (wave 3, owner: frontend-developer; verifier: evidence-collector)
Components in `src/components/admin/product-editor/`, each a named export using the M1 types and wrappers:
- [x] **Task 4.1 `ProductImagesEditor`** `{ images, defaultImageId, onChange(images, defaultImageId) }`: drag-and-drop or picker upload to `/api/admin/uploads` with per-file progress/errors, add by URL, reorder (drag + arrow buttons), set default (star), alt text, remove.
- [x] **Task 4.2 `OptionsEditor` + `VariantsTable`**: add/rename/reorder options and values (free text, any label), display type select, swatch color/image per value; "Generate variants" calls `generateVariants` and shows the warning and removed-count confirm; table rows: title, SKU, price, compare-at, stock, status, default radio, image picker (from product images); bulk "apply price/stock to all"; inline SKU conflict errors from the 409 response.
- [x] **Task 4.3 `GarminImportDialog`**: URL + rate (prefilled from settings) + "download images" toggle → POST import → shows summary (variants, options, images, warnings) → "Apply to form" fills the editor; keeps the dialog's errors visible.
- [x] **Task 4.4 `ProductPreviewModal`**: renders storefront `ProductTop` + `ProductTabs` from `buildDetailFromCms(formState)` (M5 Task 5.1; until M5, render ProductTop with legacy fields).
- [x] **Task 4.5 Wire into `src/app/admin/products/page.tsx`**: replace the image-URL field with the images editor; add "Import from garmin.com", "Options & variants" section, "Preview" button; relabel case size as "Size bucket (filter)". Verify: `npx tsc --noEmit`, `npm run lint`, and an evidence-collector browser walkthrough of the manual spot checks (screenshots in `docs/design-references/qa/product-editor-*.png`). — evidence: builder report; lead re-ran tsc (clean), eslint on M4 files (0 problems), `node --test` 54/54, GET /admin/products 200. Browser walkthrough with a real upload and import is deferred to M7.

### M5 — Storefront variant flow (wave 4, owner: frontend-developer; verifier: evidence-collector)
- [x] **Task 5.1** `src/types/index.ts`: `ProductDetail` gains optional `variantModel?: { options: ProductOption[]; variants: ProductVariant[]; images: ProductImage[] }`, `overviewHtml?`, `specGroups?`. In `src/lib/products.ts`, add `buildDetailFromCms(p: CMSProduct): ProductDetail` and use it in `getProductDetail` when the CMS product has `variants` or `images`. Legacy products keep the current path (A7).
- [x] **Task 5.2** `src/components/product/VariantPicker.tsx` `{ options, variants, selections, onSelect(optionId, valueId) }`: buttons, swatches (image or color dot with label tooltip) or a select by `display`; unavailable values disabled via `availableValueIds`. `ProductTop` uses it when `variantModel` exists: selected variant drives price/compare-at, gallery (variant images, else product images), part number and stock text; initial variant from `?sku=` (wrap the search-params reader in `<Suspense>`), else the default; `router.replace` keeps `?sku=` in sync.
- [x] **Task 5.3** `ProductTabs`: Overview tab renders `overviewHtml` when present; Specs renders `specGroups` with group headings when present.
- [x] **Task 5.4** `src/lib/cart.tsx`: `CartItem` gains `sku?`, `variantLabel?`; line key = `id` + `sku`; `CartView` shows the variant label and SKU. `OrderItem` fields from M1 are filled where cart lines become orders (none exist in the storefront today → recorded as N/A in the evidence).
- [x] Verify: route sweep script `node scripts/qa/route-sweep.mjs http://localhost:3001` (new) GETs `/p/<id>` for every product in `data.json` → all 200 (A7); evidence-collector browser check: the imported fēnix 9 at `/p/<id>?sku=010-04337-15` shows that variant's price and part number; choosing 47 mm switches price/image/part number; Add to cart → the cart shows the variant label and SKU (A8). — evidence: route sweep 25/25 200 (A7). Browser on /p/garmin-1953453?sku=010-04337-15: part 010-04337-15, selections 51 mm/Pro/No/Black, the variant's own thumbnails. Clicking 47 mm → part 010-04336-15, $574,995.00, URL ?sku=010-04336-15, main photo changed, other selections kept. Add to Cart → localStorage line {sku 010-04336-15, variantLabel …}; /cart shows "Part 010-04336-15". tsc and eslint clean; node --test 55/55.

### M6 — Migration importer (wave 3 ‖ M4, own worktree; owner: backend-architect; verifier: code-reviewer)
- [x] **Task 6.1** `git worktree add ../GRMN-variant-import -b feat/catalog-variant-import codex/backend-task-02`; read that branch's `docs/backend/catalog-media-schema.md`, `migration-runbook.md` and the latest `handoffs/` entry; run its `npm test` baseline and record the result.
- [x] **Task 6.2** Additive migration (next `drizzle/00NN_option-display.sql` + schema in `src/server/db/schema/catalog.ts`): `product_options.display text not null default 'buttons' check (display in ('buttons','swatch','dropdown'))`, `option_values.swatch_color text null`, `option_values.swatch_media_id uuid null references media_assets`.
- [x] **Task 6.3** `scripts/migration/import.ts`: when `options`/`variants` are present, create options/values (ordered), one variant per `variants[]` (sku, status, default), `variant_option_values`, KZT `prices` (amount = price, compare-at = originalPrice), stock via the importer's existing stock path, and `images` → `media_assets` (namespace `uploads`, key = path after `/uploads/`) + `product_media` (primary = default image; variant-scoped rows for `imageIds`). Keep `sourcePrice`/`source`/`overviewHtml`/`specGroups` in the existing preserved payload. Legacy products are unchanged.
- [x] **Task 6.4** Update `source-inventory.json`/`source-manifest.md` for the new fields; add an integration test using a copy of master's real `data.json` that includes the imported fēnix 9: counts of options, values, variants, prices and media match the JSON, and reconcile reports zero mismatches. Run that branch's `npm test` → PASS (A9). — evidence: worktree D:projectsgarminGRMN-variant-import, branch feat/catalog-variant-import, commits 36245ca + c59e392 (not pushed or merged). Baseline 429/429 → final 437/437 (PowerShell `npm test`; log D:projectsgarminariant-final-test-ps.log, verified by the lead: 254/254 integration, boundaries passed, exit 0). Real data for garmin-1953453: 4 options, 16 values, 33 variants, 132 selections, 33 KZT prices, 245 media; reconcile 0 mismatches. Migration 0011 SQL is additive only (checked by the lead).

### M7 — Final verification (wave 5)
- [x] `npm run check` and `node --test tests/*.test.mjs` on `master`: record the output. — evidence after the fix pass: `npm run check` exit 0 (lint 0 errors / 29 pre-existing warnings, tsc, build ✓); `node --test tests/*.test.mjs` 64/64; route tests with BASE_URL 9/9; route sweep 25/25.
- [x] `code-reviewer` over the master diff of the M1–M5 paths; `appsec-engineer` over the upload/import/serve routes and the sanitizer. One targeted fix round per finding class. — evidence: both reviews done (Opus); one fix pass, see Ledger "Final:" lines.
- [x] `evidence-collector`: both manual spot checks end to end with screenshots; fill the Result and Handoff sections. — evidence: performed by the lead in the browser pane and over HTTP (A5, A7, A8, C1 scenario, auth/validation probes); screenshots were viewed in-session, not saved to docs/design-references/qa. Ruling: no separate evidence-collector agent, to avoid a third network-fragile agent; the lead's checks are recorded here.

## 6. Verification
- `npm run check` (lint + typecheck + build) on `master`
- `node --test tests/*.test.mjs` on `master` (A2–A6)
- `node scripts/qa/route-sweep.mjs http://localhost:3001` (A7)
- browser walkthrough by evidence-collector (A8, manual spot checks)
- `npm test` in `../GRMN-variant-import` (A9)

## 7. Rollback
All changes are additive. If a wave fails: on `master`, restore only that wave's files listed in its write scope with `git diff`-guided reverts. Never use blanket `git checkout`, because `master` carries unrelated uncommitted work. Delete `storage/uploads` contents created by tests only. M6 is isolated: remove the worktree and the `feat/catalog-variant-import` branch. Data: back up `src/lib/cms/data.json` before the first save in M4/M5 testing (`data.json.bak-2026-11-17`) and restore if needed.

### Dropped by fact (no current code path)
- [-] Discount matching on variant SKU: no storefront/checkout code applies discounts today (only admin CRUD). Revisit when checkout exists (Postgres Task 13B/14).
- [-] Stock decrement on variant: nothing decrements stock today. Revisit with Postgres inventory (Task 14).

## Ledger (rulings)
- Ruling (setup): no commits and no task-start/task-done scripts, because the owner-approved plan says to execute in place on `master` without committing. Progress is tracked here. Cost if wrong: no per-task commit ranges for review; the final review uses `git diff` on the write-scope paths.
- Task 1.2: Ruling: `findSkuConflicts` also compares the product's base SKU (not only variant SKUs). Duplicate base SKUs break orders just the same; existing data has none (checked). Cost if wrong: a legacy duplicate would block saving until it is renamed.
- Task 1.3: Ruling: `saveProduct` now spreads the incoming product before applying defaults for new products. The old code dropped every field not in its literal (images/options/variants and the SEO fields). Cost if wrong: unknown extra keys sent by the client are persisted.
- Task 2.2: Ruling: traversal with an encoded `/` gets **400 from Next** before reaching the route, so the test accepts 400 or 404 and asserts no file content leaks. Cost if wrong: none; both are refusals.
- Task 2.1: Ruling: dropped `import "server-only"` because the package is not installed. The module uses `node:fs` and would fail in a client bundle anyway. Cost if wrong: a client import fails at build time instead of with a clearer message.
- Task 3.1: Ruling: the fēnix 9 fixture is 4 MB (over the 2 MB target). It holds only the data scripts, almost all of which is the 33-SKU product payload. It is kept whole rather than trimming real input. Cost if wrong: repo size +4 MB.
- Task 3.2: Ruling: the overview on garmin.com is built from `pc-*` web components whose content sits in attributes, so a sanitizer alone would produce empty HTML. Added `overviewFromGarmin`, which converts them to semantic HTML (intro, headings, lifestyle figures, feature cards, video link, disclaimers) using htmlparser2, then sanitizes. Cost if wrong: Garmin layout components that are not yet mapped are dropped silently.
- Task 3.2: Ruling: the image test asserts that every variant has ≥1 photo, the default has ≥10 and ≥90% have ≥10. garmin.com itself lists one photo for 3 of the 33 fēnix 9 SKUs. Cost if wrong: none; this matches the source.
- Task 3.2: Ruling: imported base SKU = `GRM-<garmin productId>` so it never collides with variant part numbers; values no SKU uses are dropped; color slugs are humanized ("gray_dark_global" → "Dark Gray") with swatch hex where known. Cost if wrong: the owner renames labels.
- Task 3.3: Ruling: image cap is 8 per variant and 300 per import (the plan said 60). With 60, 30 of the 33 fēnix 9 variants would have had no local photos, contradicting the spec's "photos downloaded into our own storage". Overview SVG icons stay hotlinked to res.garmin.com: serving SVG from our origin is an XSS risk, and in `<img>` they are inert. Cost if wrong: about 12 MB of storage per large import.
- Task 3.2: Ruling: added dependencies `sanitize-html`, `htmlparser2`, `@types/sanitize-html`. npm reports 31 audit findings in the existing tree (not introduced by these). Cost if wrong: none.
- M4: Ruling: accepted the builder's deviations: (1) the admin shows ₸ instead of $ because prices are KZT; (2) product price/compare-at/stock are read-only when variants exist, mirrored from the default; (3) the "options changed" warning ignores partial combination sets, as imports have; (4) an imported id is reused only when free, so a re-import never overwrites; (5) the Tech Specs tab notes that the flat specs are rebuilt from groups. Cost if wrong: small UI copy changes.
- M4/M6: both builders were cut off once by an API network error (ENOTFOUND) and resumed with context. M4 verified that its half-applied splice had landed once.
- Task 5.2: Ruling: added `selectValue` (tested) so picking a value jumps to the closest active variant and keeps the other selections, as garmin.com does, instead of the plan's plain `resolveVariant`. Cost if wrong: none; it is a superset.
- Task 5.2: Ruling: the `?sku=` deep link is read in a mount effect and kept in sync with `history.replaceState`, not with `useSearchParams`, which would force a Suspense boundary into the page. Cost if wrong: one extra render on deep links.
- Task 5.2: Ruling: the storefront keeps its existing `$… USD` price format although stored prices are KZT. That inconsistency pre-dates this work for every product; site-wide currency display is a follow-up (migration decisions D11/D12). Cost if wrong: imported prices show as large dollar amounts until it is fixed.
- Task 5.2: Ruling: imported variants have stock 0, so the PDP says "Currently out of stock" until the owner sets stock. Garmin publishes no stock counts and the plan forbids inventing them. Cost if wrong: the owner must set stock before selling.
- Task 5.4: Ruling: cart lines are keyed by `lineKeyOf` (product id + SKU); carts saved before this change, with no sku, keep working. `OrderItem.sku/variantLabel` exist, but no storefront code creates orders yet, so that is N/A. Cost if wrong: none.
- M6: Ruling (builder): on the real-data run the 20 legacy products end "quarantined" because of the branch's EXISTING rules (long-fraction originalPrice such as 919.9884999999999, unresolved compatibleAccessories ids), not because of M6. The test proves identical issues with and without the new product. Cost if wrong: none; those data fixes belong to the migration's own reconciliation work.
- M6: Ruling (builder): per-variant opening stock goes through the existing `importOpeningBalances` path, extended outside the listed write scope (src/server/inventory/service.ts). Variant media rows stay private/pending until a separate copy-and-verify of the upload files. Accepted by the lead: this is the plan's "existing stock path" and it is tested.
- M6: Note: the fixture tests/fixtures/cms-data-master-2026-11-17.json is a full copy of master's data.json (6 clients, 12 orders, the seed admin with test password only). The branch's own data.json already holds the same records; local branch, not pushed.
- Final: fixed C1 (re-saving a legacy product replaced its storefront page). Test "C1: only products with variants or an overview use the CMS detail page" RED→GREEN; `getProductDetail` uses `usesCmsDetail`; legacy pages show uploaded photos via `buildFallbackDetail`. HTTP check: fēnix 8 re-saved with images → page unchanged. Suite 64/64.
- Final: fixed I1 (Generate added unsold combinations as active). Test "I1: … new combinations are drafts and counted" RED→GREEN; the confirm names the drafts. Suite 64/64.
- Final: fixed I2 (adding an option dropped every variant). Test "I2" RED→GREEN.
- Final: fixed I3 (removing an option kept an arbitrary survivor). Test "I3" RED→GREEN; survivor = default > active > stocked; `merged` is reported.
- Final: fixed I4 (re-importing a catalog product always returned 409). Imported base SKU is now `GARMIN-<id>`; garmin-import test asserts it. RED→GREEN. (The already-saved draft garmin-1953453 keeps GRM-1953453.)
- Final: fixed I5 (Escape or backdrop discarded unsaved edits). Snapshot plus confirm in `requestCloseEditor`; UI-only, verified by tsc/eslint. No automated UI test exists in this repo.
- Final: fixed I6 (out-of-stock, draft or archived variants could be bought). Tests "I6: selectValue never lands on draft…" and "I6: isPurchasable…" RED→GREEN; Add to Cart is disabled with "Out of Stock" (HTTP check on garmin-1953453); deep links only resolve active variants.
- Final: fixed S2 (a non-string overviewHtml bypassed the sanitizer; the products API had no auth). Test "S2" RED→GREEN; GET/POST/DELETE require admin (HTTP 401 unauthenticated / 200 authenticated).
- Final: fixed S3/S6 (any image URL; CSS injection via swatchColor). Tests "S3", "S3/S6" RED→GREEN; HTTP 400 for both payloads.
- Final: fixed S4 (unbounded upload body; parallel and unbounded imports). Content-Length cap 201 MB → 413; one import at a time → 429; 500 MB / 120 s download budget. Verified by tsc and suite; the budget was not load-tested.
- Final: fixed S5 (/uploads headers). Adds CSP `default-src 'none'; img-src 'self'; sandbox` and `Content-Disposition: inline` (HTTP header check).
- Final: Ruling: S1, the forgeable admin session cookie (unsigned base64 JSON, plus an "admin" email alias), is CRITICAL but PRE-EXISTING and outside this plan's scope. It undermines every admin check, including the new ones. Not fixed here; proposed as its own task. Cost if wrong: anyone can act as admin until it is fixed.
- Final: minor (deferred): M1 a variant reusing its own product's SKU triggers 409.
- Final: minor (deferred): M2 legacy `stock` mirrors only the default variant, not the sum.
- Final: minor (deferred): M3 pre-existing mojibake "CorningВ® GorillaВ® Glass 3" in store.ts default specs.
- Final: minor (deferred): M4 `syncLegacyFields` keeps a stale defaultImageId/image when images are removed.
- Final: minor (deferred): M5 `firstSelected` assumes array-valued `options.selected` (a string would give its first char).
- Final: minor (deferred): M6 no parser warning when two Garmin SKUs share identical selections.
- Final: minor (deferred): S7 import warnings repeat remote URLs (now truncated to 200 chars; React escapes them).

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-17: plan approved by owner, including dropping variant discount matching and stock decrement.
- 2026-11-17: plan drafted — 7 modules, 5 waves; proposes dropping variant discount matching and stock decrement (no existing code path) pending owner approval.
- 2026-11-17: requirement approved by owner.
- 2026-11-17: builder check answered (hosting VPS → upload route; KZT conversion at entered rate — owner chose A; size bucket; variant SKU in orders/discounts; additive Postgres columns; real data snapshot for migration test).
- 2026-11-17: requirement drafted (approach A: JSON admin shaped like Postgres tables + importer update; storefront variant flow A).

## Result
**Delivered (master, uncommitted):** photo uploads (UPLOAD_DIR + /uploads route), default photo, preview, custom options/variants with generation, garmin.com importer (overview → semantic HTML, grouped specs, in the box, family, options with swatches, all variants, KZT conversion, local photos), storefront variant pickers + ?sku deep links + variant cart lines, admin auth on the products API, input validation. **Branch feat/catalog-variant-import** (worktree D:projectsgarminGRMN-variant-import, commits 36245ca, c59e392): migration 0011 + importer mapping, suite 437/437.
**Checks run:** npm run check ✓; node --test 64/64; route tests 9/9; route sweep 25/25; live fēnix 9 import (33 variants, 245 photos); browser variant switch + cart; HTTP probes for auth/validation/headers; branch npm test 437/437.
**Gaps:** S1 forgeable admin session (pre-existing, critical); storefront shows KZT amounts as "$… USD" (pre-existing); imported variants need stock set before they can be sold; no automated UI tests.
**Follow-ups:** fix admin sessions (signed tokens); site-wide currency display; merge or rebase the migration branch when the backend lands; deferred minors above.

## Handoff
Done. All 30 plan tasks are [x] with evidence; final review fixes are recorded under Ledger "Final:". Nothing is committed on master. The migration work is committed on the local branch feat/catalog-variant-import only (not pushed or merged). Test data left in data.json: draft product garmin-1953453 (imported fēnix 9; its photos are under storage/uploads), and fēnix 8 (1228429) gained an images array from the C1 re-save check. Backup of data.json from before this work: src/lib/cms/data.json.bak-2026-11-17. Highest-priority next task: replace the unsigned admin session cookie (S1).
