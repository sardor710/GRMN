# Variant pages, per-variant SEO and Google integration — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Executing | 2 | 10/19 | 2026-11-23 | Wave 2 merge: feed agent; then Wave 3 (M4 lead ‖ M5 agent) |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

**Why (owner, 2026-11-23):** every sellable option must be findable on Google on its own — a search for
"fenix 9 pro 43mm" or "fenix 9 чёрный" should land on that exact variant — and the store's product pages should be
laid out like garmin.com: one product code = one page, one sub-page per variant. The owner left the details
("do as your choice") to us.

**Today (measured on production 2026-11-23):** 11 published products, 290 active variants, live sitemap has 76 URLs.
Product URLs are `/{lang}/p/<uuid>`; a variant is only `?variant=<sku>` and canonicalizes back to the product, so
Google sees 11 product pages. Auto-Generate (`generateProductSEOMeta`, `src/lib/seo/analyzer.ts`) writes one English
title/description/keywords per product with a hard-coded "GPS Smartwatch" template (also for watch bands). JSON-LD is
one `Product` with every offer on the same URL. No GA4/GTM, no Search Console verification, no Merchant feed.
Every published product already carries its garmin.com product id (`legacy_content.source.productId`, e.g. fēnix 9 Pro
= 1953727). RU/KK translations already hold `valueLabels` and `variantTitles` for option names.

- **Goal:** each active variant of each published product is its own indexable page, with its own URL, title,
  description, image, hreflang and structured data in EN/RU/KK; auto-generated SEO covers every variant in every
  language; Google Analytics/Tag Manager, Search Console verification and a Google Merchant feed are in place.

- **Deliverables:**
  1. **Product codes and URLs (garmin.com layout).** New `products.product_code` (digits only, unique). Backfilled from
     the garmin.com id for the 11 imported products; new products get one assigned automatically (from a range that
     cannot collide with garmin.com ids) and the admin can change it. URLs:
     - product page `/{lang}/p/{code}` → e.g. `garmin.tigr.uz/ru/p/1953727` (shows the default variant);
     - variant page `/{lang}/p/{code}/{sku}` → e.g. `garmin.tigr.uz/ru/p/1953727/010-04336-00`.
     Picking an option on the page moves the address to that variant's sub-page without a reload (and Back works).
  2. **No redirects (owner, 2026-11-23).** Old and new products both use only the new format. Old `/p/<uuid>` URLs
     and `?variant=`/`?sku=` links are not redirected: they answer 404, and so does an unknown or archived SKU under a
     valid code. URLs without a locale keep today's locale redirect. All internal links (catalog cards, compare, cart, search,
     accessory/compatible-device links, related products, admin "view on site", order emails/Telegram) use the new URLs.
  3. **Per-variant metadata.** Variant page: self-canonical; title and description built from product name + that
     variant's localized option values (e.g. "fēnix 9 Pro 43 мм — чёрный …"); og/twitter image = the variant's image;
     hreflang en/ru/kk + x-default pointing at the same variant. Product page: self-canonical, product-level SEO.
  4. **Structured data.** Product page: `ProductGroup` (`productGroupID` = code, `variesBy` from the options,
     `hasVariant` = each variant as a `Product` with its own `url`, sku, mpn, gtin when a barcode exists, color/size,
     image, `Offer` in KZT with availability). Variant page: that variant's `Product` with `isVariantOf` the group.
     BreadcrumbList on both. Organization + WebSite on the home page.
  5. **Sitemap.** Product page + every active variant page of every indexable product, per indexed locale, with
     hreflang alternates and lastModified; noIndex products and draft/archived variants excluded.
  6. **Auto-generate SEO for everything.** One generator used by the product editor button, the SEO screen's bulk
     "optimize", and the page renderer as fallback: product-level and per-variant title/description/keywords in
     EN/RU/KK, category-aware wording (watch vs band/accessory), Garmin naming without ®/™ noise in titles, lengths
     within Google's limits. Admin can override a variant's SEO title/description per language; empty = generated.
     A variant created later gets correct SEO with no admin action (generated at render time).
  7. **Google tags.** Admin ▸ Settings ▸ SEO/Analytics fields: GA4 measurement id, GTM container id, Google Search
     Console verification token (plus Yandex Webmaster token, since the market is KZ). Site injects only what is set.
     Ecommerce events: `view_item` (with the variant), `select_item`/variant switch, `add_to_cart`, `begin_checkout`,
     `purchase` (once per order). Admin pages never load tags.
  8. **Google Merchant feed.** `/feeds/google/{lang}.xml` (RSS 2.0, `g:` namespace): one item per active variant —
     `id` = sku, `item_group_id` = product code, title/description (localized), variant `link`, `image_link` +
     additional images, `price` KZT, `availability`, `brand` Garmin, `mpn`, `gtin` when present, `color`/`size`,
     `condition` new, `google_product_category`. Listed on the admin SEO screen.
  9. **Admin SEO screen** shows per-variant rows (URL, generated vs overridden, missing RU/KK option labels) and the
     preview uses the real site domain instead of garmin.com.
  10. **Shipped to production** (garmin.tigr.uz) after a staging rehearsal, with a pre-deploy dump and rollback note.

- **Constraints:** Next.js 16 as installed (read `node_modules/next/dist/docs/` before route/metadata code); PostgreSQL
  catalog is the production path — migrations additive so the previous image still runs; production deploy procedure
  from memory (rebuild `grmn:<commit>`, migrate with ops image, restart proxy); no secrets in the repo; GA/GTM ids are
  configuration, not code; admin handlers build URLs with `requestURL()`; existing tests stay green.

- **Non-goals:** switching garmin.kz; ad campaigns or creating the owner's GA4 / Merchant Center / Search Console
  accounts; machine-translating missing RU/KK option labels (missing ones fall back to English and are flagged in the
  admin); redesigning the product page UI; category-page SEO beyond keeping links/sitemap correct; legacy JSON CMS
  backend gets no new variant pages (it keeps working as today); cookie-consent banner (not required in KZ — revisit if
  the owner wants one).

- **Assumptions:** SKUs are unique case-insensitively (DB index exists) and URL-safe (`010-04336-00` style); the
  garmin.com id is acceptable as the public product code; variant URL keeps the SKU's original case and other cases
  open the same variant with the stored-case canonical; the KZ storefront locale path for Kazakh stays `/kz`.

- **Open questions:** none blocking. The owner supplies GA4 / GTM / Search Console ids after delivery (site works without them).

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Every published product has a unique numeric `product_code`; the 11 imported ones equal their garmin.com id | auto | SQL on staging/prod: `select count(*) from products where status='published' and product_code is null` = 0; fēnix 9 Pro = 1953727 |
| A2 | `/ru/p/1953727` and `/ru/p/1953727/<sku>` answer 200 for every active variant; inactive/unknown sku → 404 | auto | crawl script over all 290 variants × 3 locales |
| A3 | Old `/p/<uuid>` URLs answer 404 (no redirect); `?variant=`/`?sku=` are ignored and canonical stays the clean URL | auto | crawl script |
| A4 | Each variant page has a self canonical, its own `<title>`/description containing its option values (localized when RU/KK labels exist), its own og:image, hreflang for indexed locales | auto | crawl script asserts head tags; titles unique across all variant pages per locale |
| A5 | JSON-LD validates: ProductGroup with hasVariant on product page, Product+isVariantOf on variant page, prices KZT | auto + manual | unit tests on builders + Google Rich Results Test on 2 URLs |
| A6 | Sitemap lists product + all active variant URLs per indexed locale (≈ 11 + 290 per locale), none draft/noIndex | auto | count `<loc>` vs SQL |
| A7 | Generator gives distinct, length-bounded titles/descriptions per variant in EN/RU/KK; bands are not called smartwatches | auto | unit tests (`node --test`) |
| A8 | Editor button and bulk optimize fill product + variant SEO; overrides persist per locale; empty override → generated text on page | auto + manual | CMS UI smoke + page check |
| A9 | With GA4/GTM/verification set in admin, tags render on storefront only; events fire with variant data; purchase once per order | auto + manual | Playwright: dataLayer contents on PDP, add to cart, demo checkout (staging) |
| A10 | Merchant feed has one item per active variant with required attributes; valid XML | auto | feed test + xmllint |
| A11 | Choosing an option updates the address to `/p/{code}/{sku}`, Back returns to previous variant, no full reload | auto | Playwright |
| A12 | `npm run check`, unit tests, `npm run test:cms-ui` pass | auto | commands |
| A13 | Live on garmin.tigr.uz; A2–A4, A6, A10 re-run against production | auto | crawl script with BASE=https://garmin.tigr.uz |

Manual spot checks: Google Rich Results Test on `/ru/p/1953727` and one variant; view a variant page on mobile;
admin edit of one variant's RU SEO title shows on the page.

## 3. Anti-drift
- **Primary objective:** Google can index every variant as its own page with variant-specific, localized content, at
  garmin.com-style URLs.
- **Proxy signals (not success by themselves):** build passes; sitemap is longer; generator unit tests pass; tags
  "configured" without seeing dataLayer events; pages answer 200 but all share one title or canonical.
- **Intended scope:** product URLs/routing, product metadata + JSON-LD, sitemap, SEO generator + admin
  SEO fields for variants, Google tags + ecommerce events, Merchant feed, deploy. Not: UI redesign, categories SEO
  overhaul, legacy CMS backend.
- **Completion target:** full delivery including production deploy.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Product codes + URLs | `product_code`, `/p/{code}[/{sku}]` routes, every link uses them (no redirects) | agent_direct (owner, lead) · `superpowers:test-driven-development` (support) | `drizzle/0029*`, `src/server/db/schema/catalog.ts`, `src/server/catalog/`, `src/lib/catalog/product-url.ts`, `src/app/[lang]/p/`, link sites in `src/components/`, `src/lib/`, `src/app/[lang]/compare`, admin Basics tab | – |
| M2 SEO generator | localized, category-aware product + variant SEO text | `seo-specialist` agent (owner, worktree) · TDD (support) | `src/lib/seo/generate.ts`, `tests/unit/seo-generate.test.mjs` | – |
| M3 Page SEO | variant/product metadata, ProductGroup JSON-LD, sitemap | agent_direct (owner, lead) · TDD (support) | `src/lib/seo/product-metadata.ts`, `src/lib/seo/product-jsonld.ts`, `src/components/seo/JsonLd.tsx`, `src/app/[lang]/p/`, `src/app/sitemap.ts`, `src/app/[lang]/page.tsx` | M1, M2 |
| M6 Merchant feed | `/feeds/google/{lang}.xml` | `seo-specialist` agent (owner, worktree) | `src/lib/seo/merchant-feed.ts`, `src/app/feeds/`, `tests/unit/merchant-feed.test.mjs` | M1, M2 |
| M4 Admin SEO | variant SEO overrides, generate-all, SEO screen variant rows, product code field | agent_direct (owner, lead) | `src/components/admin/`, `src/app/admin/products`, `src/app/admin/seo`, `src/lib/admin-seo-actions.ts`, product input validation in `src/server/cms/` + `src/lib/catalog/variant-content.ts` | M1, M2, M3 |
| M5 Google tags | GA4/GTM/verification settings + ecommerce dataLayer events | `frontend-developer` agent (owner, worktree) | `src/lib/analytics/`, `src/components/analytics/`, `src/server/settings/service.ts`, `src/app/admin/settings/`, `src/app/[lang]/layout.tsx`, event calls in `ProductTop.tsx`/`CartView.tsx`/`CheckoutPanel.tsx`/order confirmation | M1 |
| M7 QA + ship | crawl verifier, review, staging rehearsal, prod deploy | `code-reviewer` (verifier) · `evidence-collector` (verifier) · `superpowers:verification-before-completion` | `scripts/seo/crawl-check.mjs`, plan file, memory | all |

Gaps (no fitting skill): none. Account creation in Google (GA4, Merchant Center, Search Console) is the owner's, not ours.

Waves (at most 2 parallel units, disjoint write scopes; each parallel agent works in its own git worktree, lead merges at wave end):
- Wave 1: M1 (lead) ‖ M2 (agent)
- Wave 2: M3 (lead) ‖ M6 (agent; the lead adds `feeds` to the proxy's NOT_LOCALIZED list at merge)
- Wave 3: M4 (lead) ‖ M5 (agent)
- Wave 4: M7 (lead + verifiers)

## 5. Tasks

**Goal:** every active variant gets its own garmin.com-style, localized, indexable page; SEO text is generated for
all of them; Google tags and a Merchant feed are in place.
**Architecture:** a numeric `product_code` keys the public URL; one shared page component renders `/p/{code}` (default
variant) and `/p/{code}/{sku}`; metadata, JSON-LD, sitemap and feed all derive from the same ProductDetailDTO plus a
pure generator, with stored overrides winning over generated text. Old URLs are not redirected (404).
**Tech stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` for `generateMetadata`, dynamic segments,
route handlers, `next/script`), PostgreSQL + drizzle migrations, node:test.

### Global constraints
- URLs: product `/{lang}/p/{code}`, variant `/{lang}/p/{code}/{sku}`; `{code}` matches `^[0-9]{1,12}$`; SKU kept in its stored case, path-encoded with `encodeURIComponent`.
- New product codes come from sequence `product_code_seq` starting at `90000001` (above every garmin.com id).
- No product redirects: old URL forms answer 404; `?variant=`/`?sku=` are not read anymore.
- Titles ≤ 60 characters, descriptions 120–160 characters (generated); `®`/`™` stripped from generated titles only.
- Prices KZT only; availability from the variant.
- Migrations additive: image 06e14d3 must still run on the migrated database.
- Admin handlers build URLs with `requestURL()`; no secrets in the repo; analytics ids are settings.
- Legacy JSON CMS backend keeps `/p/<id>` behaviour (no variant pages).

### Review focus
1. SKU with odd characters or different case (a lowercase `010-04336-ab` typed as `010-04336-AB`, a SKU containing `/` or space) → link is encoded; a different case still opens the variant and its canonical is the stored case. Test in Task 1.2 and 1.4.
2. Variant archived or never active under a valid code → 404; out-of-stock variant → 200 with OutOfStock. Test in Task 1.4 and 3.2.
3. Product `noIndex` or record `canonicalUrl` override → variant pages are noindex too and left out of sitemap and feed; a canonical override applies to the product page only. Test in Task 3.1, 3.3, 6.1.
4. Missing RU/KK option label or a locale not in `translatedLocales` → English label used, page for that locale noindex and not in sitemap. Test in Task 2.1 and 3.1.
5. Two variants whose option labels give the same title → second title disambiguated with the SKU so titles stay unique per locale. Test in Task 3.1.

---

### Task 1.1: `product_code` column (M1)
> ✅ 071dd3e — catalog-product-code integration 2/2 pass (backfill 1953727, seq ≥ 90000001, unique + digits checks); catalog-schema unit 3/3
**Files:** Create `drizzle/0029_product-code.sql` (+ drizzle meta journal entry); Modify `src/server/db/schema/catalog.ts` (products); Test `tests/unit/catalog-schema.test.mjs`, `tests/integration/catalog-product-code.test.mjs`.
**Produces:** column `products.product_code text NOT NULL UNIQUE DEFAULT nextval('product_code_seq')::text`, check `product_code ~ '^[0-9]{1,12}$'`; drizzle field `productCode`.
- [x] Unit test `product code is required, unique and defaulted`: `getTableColumns(products).productCode.notNull === true` and has a default.
- [x] Integration test: after migrate, a product with `legacy_content.source.productId='1953727'` has `product_code='1953727'`; a product inserted without a code gets a value ≥ 90000001; inserting a duplicate code fails with unique violation; `'12a'` fails the check.
- [x] Run both, expect FAIL.
- [x] Write the migration: create sequence (start 90000001), add nullable column, backfill from `legacy_content->'source'->>'productId'` when digits and not already taken (first by created_at wins), else `nextval`, then set NOT NULL, default, unique index, check. Update drizzle schema + journal.
- [x] Run `npm run test:unit -- --test-name-pattern="product code"` and the integration test (`npm run test:integration` file), expect PASS.
- [x] Commit `feat(catalog): product_code (garmin.com id or sequence) for public URLs`.

### Task 1.2: URL helpers (M1)
> ✅ 483dd0c — product-url unit 3/3 pass
**Files:** Create `src/lib/catalog/product-url.ts`; Test `tests/unit/product-url.test.mjs`.
**Produces:** `productPath(code: string, sku?: string | null): string`; `parseProductPath(pathname: string): { locale: string | null; key: string; sku: string | null } | null`; `isProductCode(value: string): boolean`.
- [x] Tests: `productPath("1953727")==="/p/1953727"`; `productPath("1953727","010-04336-00")==="/p/1953727/010-04336-00"`; `productPath("1","A/B C")==="/p/1/A%2FB%20C"`; `parseProductPath("/ru/p/1953727/010-04336-00")` → `{locale:"ru",key:"1953727",sku:"010-04336-00"}`; `parseProductPath("/p/28c9f52f-38ad-45c4-8d5e-9be6f3906cfd")` → key uuid, sku null; `isProductCode("0123")===true`, `isProductCode("garmin-1")===false`.
- [x] Run `node --conditions=react-server --test tests/unit/product-url.test.mjs`, FAIL; implement; PASS.
- [x] Commit.

### Task 1.3: Catalog service by code (M1)
> ✅ c9e0a55 — catalog-product-code-service integration 2/2; cart-wishlist + catalog-availability 11/11; test:unit 593/593; tsc clean
**Files:** Modify `src/server/catalog/service.ts`, `src/contracts/commerce.ts`, `src/contracts/catalog-browse.ts`, `src/lib/products.ts`; cart/wishlist/compare DTO producers that expose `productKey`; Test `tests/integration/catalog-product-code.test.mjs`.
**Produces:** `productCode: string` on `ProductCardDTO`, `ProductDetailDTO`, `CompatibleAccessoryDTO`, `CompatibleDeviceDTO`, cart line, wishlist item, compare item; service `getProductByCode(code, market, displayCurrency, locale)` (same result as `getProductByPublicKey`). `getProductDetail(idOrCode, locale)` in `products.ts` accepts a code.
- [x] Integration tests: `getProductByCode("1953727")` returns fēnix 9 Pro fixture with `productCode`; `getProductByCode(<uuid>)` → null; draft product → null.
- [x] FAIL → implement (select `product_code` in the list/detail SQL; lookup by code) → PASS.
- [x] Commit.

### Task 1.4: Product + variant routes (M1)
> ✅ commit below — product-route unit 2/2; dev on staging copy: /ru/p/1953727 200, /ru/p/1953727/010-04336-00 200 (canonical + hreflang en/ru/kz/x-default = same variant), /ru/p/<uuid> 404, unknown sku 404; tsc clean
**Files:** Move `src/app/[lang]/p/[id]/page.tsx` → `src/app/[lang]/p/[code]/page.tsx`; Create `src/app/[lang]/p/[code]/[sku]/page.tsx`, `src/app/[lang]/p/[code]/product-page.tsx` (shared `renderProductPage({ params, sku })` and `productMetadata`); Test `tests/unit/product-route.test.mjs` (static checks) + crawl in Task 7.1.
**Produces:** both routes render the same page; the variant route opens on that SKU (case-insensitive match); an unmatched SKU or a non-code key calls `notFound()`. Legacy backend: `[code]` still accepts a legacy id.
- [x] Test that `/p/[code]/[sku]/page.tsx` exports `generateMetadata` and default, the variant page passes `sku` to the shared renderer, and the pure resolver `resolvePageVariant(variants, sku)` returns the variant case-insensitively and null for unknown/archived.
- [x] Implement; `npm run typecheck`; dev server: `/ru/p/1953727/010-04336-00` 200 with that variant selected.
- [x] Commit.

### Task 1.5: 301 redirects in the proxy (M1) — [-] dropped by owner 2026-11-23 (no redirects)
**Files:** Create `src/lib/catalog/product-redirect.ts`; Modify `src/proxy.ts`; Test `tests/unit/product-redirect.test.mjs`.
**Produces:** pure `decideProductRedirect(input: { pathname: string; search: URLSearchParams; resolved: { code: string; skus: string[] } | null }): string | null` returning the target path (locale kept, other query params dropped except `utm_*`/`gclid`) or null.
- [-] Tests: `/ru/p/<uuid>` → `/ru/p/1953727`; `/ru/p/<uuid>?variant=010-04336-00` → `/ru/p/1953727/010-04336-00`; `?sku=` same; `/ru/p/1953727?variant=x` → `/ru/p/1953727/x` when x active else `/ru/p/1953727`; sku in a different case than stored → stored case; archived sku → `/ru/p/1953727`; already canonical → null; `resolved=null` → null (404 path); `?utm_source=a` kept.
- [-] FAIL → implement; wire into `src/proxy.ts` for `/p/` paths using `resolveProductKey`, response `NextResponse.redirect(url, 301)`; runs after the locale redirect so the result is one hop.
- [-] PASS + `curl -sI` on dev for the three old-URL forms shows one 301.
- [-] Commit.

### Task 1.6: Every link uses the new URLs (M1)
> ✅ commit after 2ca0414 — test:unit 605/605 + product-links guard; dev on staging copy: category cards link /ru/p/{code}, no ?sku=/?variant= on pages; option pick pushState /en/p/{code}/{sku} (catalog-ui test); Back via popstate
**Files:** Modify `src/components/ProductCard.tsx`, `CartView.tsx`, `AccountDashboard.tsx`, `product/CompatibleDevices.tsx`, `product/ProductAccessories.tsx`, `ProductTop.tsx` (history: `productPath(code, sku)` instead of `?variant=`), `RelatedProducts.tsx`, `src/app/[lang]/compare/page.tsx`, `src/lib/cms/homepage-collections.ts`, `src/server/catalog/local-links.ts` (garmin.com id → `/p/{code}` directly), order email/Telegram builders, admin "view on site"; Test existing UI unit tests updated + `tests/unit/product-links.test.mjs`.
- [x] Test: `rg -n '/p/\$\{' src` lists only `product-url.ts` (static test reads files); ProductTop variant change produces `/p/{code}/{sku}` (unit test of the pure history helper).
- [x] Implement; Back button restores previous variant (`popstate` → select variant from path).
- [x] `npm run test:unit` PASS; commit.

### Task 1.7: Product code in the admin editor (M1)
**Files:** Modify product editor Basics tab (`src/components/admin/product-editor/`), product input validation in `src/server/cms/`, `src/app/api/admin/products` PATCH; Test `tests/unit/product-input.test.mjs` (or existing `cms-product-command.test.mjs`).
- [ ] Tests: code `'12a'` rejected with field error; duplicate code → 409 field error "Product code already used"; blank on create → server assigns.
- [ ] Implement field (shows the live URL `garmin.tigr.uz/p/{code}` under it); PASS; commit.

### Task 2.1: SEO generator (M2, agent in worktree)
> ✅ 88f96d9 + fix cherry-picked (Yes/No → option name, name repeats dropped, no dangling words, distinguishing value kept): seo-generate 14/14; real catalog 870 variant pages 0 out of limits; 37 remaining same-title pairs are SKUs with identical option text (SKU added by Task 3.1)
> … 63f86b4 cherry-picked to beta5: seo-generate 11/11, tsc + eslint clean; real-catalog run 870 variant pages 0 out of limits; quality fixes (Yes/No values, repeated name, dangling words, 37 duplicate en titles) sent back to the agent
**Files:** Create `src/lib/seo/generate.ts`; Test `tests/unit/seo-generate.test.mjs`.
**Produces:**
```ts
export type SeoLocale = "en" | "ru" | "kk";
export interface SeoSubject { name: string; family?: string | null; kind: "device" | "accessory"; categoryName?: string | null; description?: string | null; specs?: { label: string; value: string }[] }
export interface SeoVariantSubject { sku: string; optionValues: { name: string; value: string }[] } // already localized; English fallback
export interface SeoText { title: string; description: string; keywords: string[] }
export function generateProductSeo(subject: SeoSubject, locale: SeoLocale): SeoText
export function generateVariantSeo(subject: SeoSubject, variant: SeoVariantSubject, locale: SeoLocale): SeoText
export function seoKind(categoryPath: readonly string[]): "device" | "accessory"
```
Rules: brand "Garmin" once; `®`/`™` removed from title; title ≤ 60 (drop the store suffix first, then the category word, then trim on a word boundary); description 120–160 ending on a full word; RU/KK wording uses "купить … в Казахстане" / "Қазақстанда … сатып алу", official warranty; accessories never say smartwatch/смарт-часы; keywords include name, name + each option value, "купить {name}" (RU), max 8, deduped case-insensitively.
- [x] Tests (exact values): fēnix 9 Pro, variant `[Case Size: 43 mm, Model/Color: черный]`, ru → title contains `fēnix 9 Pro`, `43 mm` and `черный` (values are used as given), no `®`, length ≤ 60; en product title for "QuickFit® 22 Watch Bands" (accessory) does not match `/smartwatch/i`; every description length in [120,160] for 5 fixtures × 3 locales; two variants of one product give different titles; keywords ≤ 8, unique; kk description contains `Қазақстан`.
- [x] FAIL → implement → PASS (`node --conditions=react-server --test tests/unit/seo-generate.test.mjs`).
- [x] `seo-specialist` reviews the RU/KK templates for natural wording; commit.

### Task 2.2: Old generator delegates (M2)
> ✅ generateProductSEOMeta wraps generateProductSeo(en) (in 88f96d9); analyzer callers' unit tests pass
**Files:** Modify `src/lib/seo/analyzer.ts` (`generateProductSEOMeta` → wrapper over `generateProductSeo(…, "en")`, returns same shape).
- [x] Existing analyzer tests still pass; commit.

### Task 3.1: Product/variant metadata (M3)
> ✅ 1fb4b7c — product-metadata 6/6, variant-labels 3/3, test:unit 626/626; dev on staging copy: /ru/p/1953727/010-04336-00 title 'Garmin fēnix 9 Pro 47 mm, … Оранжевый осенний', own description, self canonical, variant og:image
**Files:** Create `src/lib/seo/product-metadata.ts`; Modify `src/app/[lang]/p/[code]/product-page.tsx`; Test `tests/unit/product-metadata.test.mjs`.
**Consumes:** `generateProductSeo`, `generateVariantSeo`, `productPath`, `localizedSeo`. **Produces:** `buildProductMetadata(input: { detail: ProductDetailDTO; locale: Locale; variant?: ProductDetailVariantDTO; siblings?: ProductDetailVariantDTO[] }): Metadata` and `variantSeoText(detail, variant, locale): SeoText` (override → generated; title disambiguated with SKU when another sibling yields the same title).
- [x] Tests: variant metadata canonical = `${SITE_URL}/ru/p/1953727/010-04336-00`; `alternates.languages` has en/ru/kk(as `/kz`)/x-default for the same variant; `openGraph.images[0].url` = variant gallery[0]; stored RU override wins; noIndex product → `robots.index=false` on variant; canonicalUrl override applied to product page only; locale not translated → noindex; duplicate-title siblings → second contains SKU.
- [x] FAIL → implement → PASS; commit.

### Task 3.2: Structured data (M3)
> ✅ commit above — product-jsonld 3/3, test:unit pass; dev on staging copy: /ru/p/1953727 ProductGroup (33 variants, variesBy size+color), variant page Product isVariantOf 1953727 with color/size/offer 599995.00 KZT InStock, /ru Organization+WebSite. Rich Results Test pending (Task 7.2)
**Files:** Create `src/lib/seo/product-jsonld.ts`; Modify `src/components/seo/JsonLd.tsx`, product page, `src/app/[lang]/page.tsx` (Organization + WebSite); Test `tests/unit/product-jsonld.test.mjs`.
**Produces:** `productGroupJsonLd(detail, locale)`; `variantProductJsonLd(detail, variant, locale)`; `organizationJsonLd()`, `websiteJsonLd(locale)`.
- [x] Tests: group `@type` `ProductGroup`, `productGroupID` = code, `variesBy` maps option keys (`color`→`https://schema.org/color`, case size→`https://schema.org/size`, other → omitted from variesBy but kept as `additionalProperty`), `hasVariant.length` = active variants, each with `url` = variant URL, `sku`, `mpn`, `gtin` only when barcode; offer `priceCurrency:"KZT"`, out-of-stock → `https://schema.org/OutOfStock`; variant JSON has `isVariantOf.productGroupID`.
- [x] FAIL → implement → PASS; manual Rich Results Test deferred to Task 7.2; commit.

### Task 3.3: Sitemap with variants (M3)
> ✅ commit above — sitemap-products 2/2, test:unit pass; staging copy sitemap: 465 product/variant <loc> = SQL expectation (11 products + 290 variants × translated languages), hreflang en/ru/kk/x-default per variant
**Files:** Modify `src/app/sitemap.ts`; Create helper `src/lib/seo/sitemap-products.ts` (`productSitemapRoutes(products): SitemapRoute[]`); Test `tests/unit/sitemap-products.test.mjs`.
- [x] Tests: product with 3 active variants and locales [en,ru] → 4 routes each with indexedLocales [en,ru]; noIndex product → 0; canonical-override product → product URL only.
- [x] FAIL → implement (service needs active variant SKUs per product: add `listIndexableVariants()` returning `{productCode, sku, updatedAt}`) → PASS; commit.

### Task 6.1: Google Merchant feed (M6, agent in worktree)
**Files:** Create `src/lib/seo/merchant-feed.ts`, `src/app/feeds/google/[file]/route.ts`; Test `tests/unit/merchant-feed.test.mjs`.
**Consumes:** `productPath`, `variantSeoText` (Task 3.1), catalog service detail by code. **Produces:** `buildMerchantFeed(items: MerchantItem[], opts: { locale: Locale; siteUrl: string; title: string }): string` (RSS 2.0, `xmlns:g="http://base.google.com/ns/1.0"`), route answering `/feeds/google/en.xml|ru.xml|kz.xml`, 404 otherwise, `Content-Type: application/xml; charset=utf-8`, cached 1h.
- [ ] Tests: one `<item>` per variant; `g:id`=sku, `g:item_group_id`=code, `g:link` absolute variant URL in the feed's locale, `g:price` `"189990.00 KZT"`, `g:availability` `in_stock|out_of_stock`, `g:brand` Garmin, `g:mpn` sku, `g:gtin` only with barcode, `g:condition` new, `g:google_product_category` from kind (device/accessory, values checked against Google's taxonomy file during implementation), XML special chars escaped; noIndex products excluded.
- [ ] FAIL → implement → PASS; `xmllint --noout` on the output; commit. Lead adds `feeds` to `NOT_LOCALIZED` in `src/proxy.ts` at merge.

### Task 4.1: Variant SEO overrides (M4)
**Files:** Modify `src/lib/catalog/variant-content.ts` (add `seoTitle?: string; seoDescription?: string` to the override object and its translation spec), catalog writer + product input validation (`src/server/cms/…`), detail DTO (`ProductDetailVariantDTO.seo?: { title?: string; description?: string }` localized); Test `tests/unit/garmin-variant-content.test.mjs` / `product-variants.test.mjs`.
- [ ] Tests: EN override saved in `content_overrides.seoTitle`; RU override at `product_translations.content.variants[<id>].content.seoTitle`; title > 70 chars rejected; empty string = no override; page uses override.
- [ ] FAIL → implement → PASS; commit.

### Task 4.2: Editor — generate SEO for product + all variants (M4)
**Files:** Modify `src/components/admin/product-editor/tabs/SeoTab.tsx`, `src/components/admin/SEOEditor.tsx`, variant panel in product editor, `ProductTranslationPanel.tsx`; Test `tests/ui/cms-smoke.mjs` block `variant-seo`.
- [ ] Button "Generate SEO — product and all variants (EN/RU/KK)" fills product + every variant's title/description in the three languages using Task 2.1 (empty fields only by default; "Overwrite existing" checkbox); variant rows show URL `/p/{code}/{sku}`, generated text as placeholder; preview domain = `SITE_URL`.
- [ ] CMS smoke: generate → save → `/ru/p/{code}/{sku}` title equals saved RU title. `CMS_SMOKE_ONLY=variant-seo npm run test:cms-ui` PASS; commit.

### Task 4.3: SEO screen per variant (M4)
**Files:** Modify `src/app/admin/seo/_components/SEOScreen.tsx`, `src/lib/admin-seo-actions.ts`, `src/lib/seo/analyzer.ts` (audit rows for variants); Test `tests/unit/admin-seo-actions.test.mjs`.
- [ ] Audit lists product + variant rows (URL, overridden/generated, missing RU/KK option labels); bulk optimize fills product and variant SEO through the same save API; feed + sitemap links shown.
- [ ] Unit test for the batch builder (variant tasks included, skipped without `catalog:write`); PASS; commit.

### Task 5.1: Analytics settings (M5, agent in worktree)
**Files:** Modify `src/server/settings/service.ts` (read/write `presentation_config.analytics`), `src/app/admin/settings/_components/StoreSettingsScreen.tsx`; Create `src/lib/analytics/config.ts`; Test `tests/unit/analytics-config.test.mjs`.
**Produces:** `AnalyticsConfig { ga4Id?: string; gtmId?: string; googleVerification?: string; yandexVerification?: string }`; `parseAnalyticsConfig(value: unknown): AnalyticsConfig` (ga4 `^G-[A-Z0-9]{4,12}$`, gtm `^GTM-[A-Z0-9]{4,10}$`, verification `^[A-Za-z0-9_-]{10,100}$`; invalid → field error on save, dropped on read); public reader `getPublicAnalyticsConfig()`.
- [ ] Tests for parse/validation; FAIL → implement → PASS; commit.

### Task 5.2: Tags + ecommerce events (M5)
**Files:** Create `src/components/analytics/Analytics.tsx` (`next/script`, GTM if set else gtag if GA4 set), `src/lib/analytics/events.ts`; Modify `src/app/[lang]/layout.tsx` (metadata `verification: { google, yandex }`, render `<Analytics/>`), `ProductTop.tsx` (view_item on load + variant change), cart add handler, `CheckoutPanel.tsx` (begin_checkout), order confirmation (purchase, deduped by `sessionStorage` key `ga-purchase-<orderNumber>`); Test `tests/unit/analytics-events.test.mjs`.
**Produces:** `toGaItem(input: { productCode: string; name: string; sku: string; variantName: string; priceMajor: number; quantity?: number; category?: string }): GaItem`; `track(event: "view_item" | "add_to_cart" | "begin_checkout" | "purchase", params): void` (pushes `{ecommerce:null}` then the event to `window.dataLayer`; no-op on server).
- [ ] Tests: `toGaItem` maps `item_id`=sku, `item_group_id`=code, `item_variant`, `price`, `currency` "KZT"; purchase called twice for one order pushes once; admin layout renders no tag (static check).
- [ ] FAIL → implement → PASS; Playwright on dev with test ids set: dataLayer has view_item with the variant's sku after choosing another option; commit.

### Task 7.1: Crawl verifier (M7)
**Files:** Create `scripts/seo/crawl-check.mjs` (BASE env; reads sitemap; for every product/variant URL checks 200, self canonical, unique title per locale, og:image, JSON-LD type; checks old `/p/<uuid>` forms answer 404; feed item count = active variants).
- [ ] Run against dev/staging → prints a summary table and exits non-zero on any failure.
- [ ] Commit.

### Task 7.2: Review, rehearsal, deploy (M7)
- [ ] `npm run check`, `npm run test:unit`, `npm run test:legacy`, `npm run test:integration`, `npm run check:boundaries`, `npm run test:cms-ui` all pass.
- [ ] `code-reviewer` agent on the branch diff; fix confirmed findings (one repair per finding, then recheck).
- [ ] Staging: restore a fresh prod dump into grmn-staging, migrate 0029, run app, `BASE=staging crawl-check` passes; verify `product_code` values (A1); Rich Results Test via pasted HTML for one product + one variant page.
- [ ] Production: pre-deploy dump `predeploy-variant-seo-06e14d3.dump`, env backup, build `grmn:<commit>`/`grmn-ops:<commit>` with `NEXT_PUBLIC_SITE_URL=https://garmin.tigr.uz`, migrate, `up -d app worker proxy`, `restart proxy`, `BASE=https://garmin.tigr.uz crawl-check` passes (A13).
- [ ] `evidence-collector` captures screenshots of a variant page + admin SEO generate; update memory `grmn-production.md`; push branch.

## 6. Verification
- `npm run check` (lint + typecheck + build)
- `npm run test:unit`, `npm run test:legacy`, `npm run test:integration`, `npm run check:boundaries`
- `CMS_TEST_CHROME=/home/nick/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome CMS_TEST_CHROME_NO_SANDBOX=1 npm run test:cms-ui`
- `BASE=<staging|https://garmin.tigr.uz> node scripts/seo/crawl-check.mjs`
- `curl -s $BASE/feeds/google/ru.xml | xmllint --noout -`

## 7. Rollback
- Migration 0029 is additive (new column with default + sequence); image 06e14d3 ignores it, so
  `/home/nick/grmn-production/switch-version.sh 06e14d3` rolls the app back. After a rollback the new `/p/{code}`
  URLs 404 and old `/p/<uuid>` URLs work again; resubmitting the sitemap is enough to recover.
- Pre-deploy dump `predeploy-variant-seo-06e14d3.dump` + `production.env.bak-06e14d3-pre-variant-seo`.
- Code: work on branch `beta5`; each task is its own commit, so a failing wave is reverted by commit. Worktrees of
  parallel agents are removed after merge.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-23: requirement drafted and approved by the owner.
- 2026-11-23: XL plan drafted (7 modules, 4 waves, 20 tasks).
- 2026-11-23: plan approved (after the no-redirect revision).
- 2026-11-23: owner revision — no redirects for old URLs; old and new products use only the new format. Task 1.5 dropped, deliverable 2 / A3 / Task 1.4 / Review focus 1–2 / Task 7.1 changed (unknown SKU or old URL → 404).

## Result
Delivered: · Checks run: · Gaps: · Follow-ups:

## Handoff
Requirement approved; plan drafted, awaiting owner approval. Next: Wave 1 — Task 1.1 (lead) and Task 2.1 (seo-specialist agent in a worktree).
