# Task 01 — Source manifest

Snapshot date: 2026-11-10. Scope: read-only static inspection of the current working tree, including pre-existing uncommitted work. All business records are **real according to the owner** and must be preserved. Payment execution is currently demo. Source code labels or sample-looking names do not override that instruction.

The companion `source-inventory.json` contains observed field paths/types, 47 interface definitions, static data declarations, consumer paths, API methods, asset statistics and SHA-256/byte sizes for 605 files. It deliberately contains no customer names/emails/phones/addresses, password values, business record payloads or environment secret values. These checksums identify source evidence; they are not a recoverable data backup.

## Observed record counts and issues

| Source entity | Current count | Required disposition |
|---|---|---|
| Admins | 1 | Preserve identity/profile/role; replace credentials via controlled invitation/reset, no plaintext credential copy |
| Clients | 6 | Preserve profiles/contact/source IDs and restricted notes; no assumption of phone/email verification or marketing consent |
| Products | 20 | Preserve public key/SKU, all prices/content/assets/stock; create default variant without changing source values |
| Discounts | 4 | Preserve code/scope/limits/usage baseline/dates; amounts await currency/unit confirmation |
| Banners | 4 | Preserve position/order/content/active state |
| Blogs | 12 | Preserve slugs/status/body/SEO/editorial attribution |
| Orders | 12 | Preserve numbers, item/address/contact snapshots, totals/status/source refs; historical status is not proof of a provider capture |
| Settings | 1 object | Preserve typed policy fields; current setting is evidence, not confirmation of each historic record's currency |
| Activities | 6 | Preserve existing actor labels and times; do not fabricate missing audit history |
| Homepage | No JSON key | Preserve current rendered/default configuration sources and pending editor implementation; do not invoke getters to materialize it during inventory |

Aggregate checks found zero duplicate IDs within these collections, zero duplicate product-SKU groups, zero duplicate client-email groups, zero duplicate order-number groups, no stored orders without line items, and zero orders whose rounded line subtotal differs from stored total. This arithmetic check does not validate tax, currency, payment capture, fees or real-world completeness.

**Seven of twelve stored orders have at least one product reference absent from the current CMS products collection.** Reconcile against static/detail/retired sources before import. An unresolved reference must retain its original ID and historical snapshots; it is not grounds for deleting an order or fabricating a new sellable SKU.

No product/order row has an explicit currency field. Launch currency is now confirmed as KZT with USD display-only, but that does not establish the historical currencies of these values. Separate source confirmation is required before relabeling/converting existing money. One administrator record has a password field; its value is not copied here or into the generated inventory.

## Source authority and transformations

1. Preserve every source and its provenance; no wholesale reset/reseed or automatic exclusion as demo.
2. `src/lib/cms/data.json` owns current persisted CMS edits. Static sources supplement detail missing from the CMS, only through an explicit per-field merge. Conflicts are reported, never silently overwritten.
3. Static public product keys/SKUs, detail/accessories, blog content, homepage defaults and account records must be reconciled with the JSON. Intentional CMS archive/deletion must not be undone by a runtime fallback.
4. For component-embedded account records, preserve original data in restricted staging and resolve its verified owner before exposing it through a live account. Presence in a shared component is not authorization to show it to every visitor.
5. Preserve raw money; convert to integer minor units only after currency/exponent/rounding semantics are confirmed. Later product price changes are distinct from migration and cannot rewrite historical orders.
6. Preserve original timestamps/status strings alongside an explicit normalized crosswalk. Generated order timelines are derived presentation, not independently verified shipment evidence.
7. Preserve unknown fields in access-controlled staging until explicit target mapping is approved. No public source archive or production credential payload in documentation/Git.
8. Media references are resolved by path/checksum and original source; no speculative redownload/replacement during inventory.

## Source groups, consumers and target ownership

| Source | Consumers / logic | Target disposition |
|---|---|---|
| `src/lib/cms/data.json`, `types.ts`, `store.ts` | Admin API collections; homepage; product/blog adapters; sitemap | Normalized PostgreSQL tables + restricted migration archive; async server services replace file reads/writes |
| `src/lib/cms/seed.ts` and local `BASE_PRODUCTS` | Store bootstrap/fallback; static catalog/blog inputs | Preserve source; reconcile records per ID/SKU rather than execute or overwrite. No production reseed |
| `src/lib/products.ts` | Catalog/product routes, filters, compare, related products, accessories, Garmin Pay marketing | Catalog/variants/prices/attributes/relations/media + versioned product detail; browser-safe filter definitions separated from DB access |
| `src/lib/blog.ts` | Blog listing/detail, categories, seed | Blog/taxonomy/SEO content; preserve generated article-body function/output provenance without claiming an independently authored source |
| `src/lib/content.ts` | Navigation, footer, old homepage/promo components | Version-controlled navigation/editorial config initially or approved CMS blocks; every exported field retained |
| `src/lib/homepage-content.ts`, `src/lib/cms/homepage-schema.{ts,js}` | New home hero/featured/tiles and editor defaults/schema | Versioned blocks/collections, dimension validation; preserve edgeToEdge/hero key fields and computed asset mapping |
| `src/lib/marq.ts`, `src/types/marq.ts` | MARQ lifestyle/material/product carousels | Preserve curated editorial/media/video/edition/accent fields; keep static until CMS management requested |
| `src/components/AccountDashboard.tsx` | Embedded profile, two addresses, four orders, two devices, two subscriptions | Preserve source records, stage restricted account-domain data, establish verified ownership; device/subscription integration deferred, data retained |
| `src/lib/account-addresses.ts` | Address/profile helpers and UI validation | Customers/addresses with server-enforced max/primary rules; original birth date treated as restricted optional profile data |
| `src/lib/cart.tsx`, `src/components/CartView.tsx` | Browser localStorage and simulated checkout | Server-owned cart, validated ID/quantity import; ignore submitted price as authority; demo payment kept explicit |
| `NewsletterSignup.tsx`, `EmailSignup.tsx`, `HomeSignup.tsx`, newsletter page | Component-state submission, URL email prefill, consent UI | Preserve UI copy/config; no durable subscriber source found. Consent/subscribe tables and actual delivery are later work, no historical consent inferred |
| `src/lib/export/excel.ts`, admin dashboard/order components | Loaded-array reports/exports | Bounded SQL reports and private audited exports; CSV formula protection; keep historical value semantics |
| `src/lib/cms/order-{lifecycle,filters}.*` | Generated numbers/milestones and status filtering | Stable DB sequence + actual order events; explicit status aliases; preserve existing numbers and source timelines |
| Other `src/components/**`, `src/app/**` text/config | Page copy, feature descriptions, structured metadata, data constants | Preserve in Git initially; future CMS/localization extraction separately reviewed. No current runtime data storage found beyond documented sources |
| `public/**` | Images, SVG, fonts, videos, metadata/static assets | All 437 files retained with checksum/byte manifest; migrate mutable media to persistent storage later without breaking paths |
| `tests/**`, `scripts/**`, docs/requirements and research | Test fixtures, downloads, existing requirements/reference material | Preserve as development/documentation evidence; not automatically business-row input |
| `FusionCMS/**` | Separate CMS tree; no root runtime integration identified | Leave untouched; external deployment/ownership not verified. Never silently replace current root CMS with it |

## Deployment and write boundaries

- Current branch/HEAD: `master` at `f05050f` at inventory time. Working tree already has many edited admin/account/home/CMS files and untracked tests/routes/docs. Do not reset, move, stage or rewrite them as part of migration preparation.
- Root Next.js config uses standalone output. Docker describes app/dev services only. Current Compose has no DB, worker, persistent DB/media volumes, reverse proxy, off-host backup or metrics service.
- Current store writes whole source JSON, swallows write exceptions after logging, and can create homepage defaults on a read. Do not execute store imports/getters in extraction scripts.
- Existing synchronous adapters can be imported transitively by browser components; server-only separation is required before DB integration.
- API inventory below identifies direct auth references only. It is not proof of full effective access control; comprehensive handler/service denial tests remain required. Login/logout intentionally have different rules from data APIs.
- No environment values, remote VPS, external DB, carrier/payment account or production traffic were inspected. The report cannot establish their current deployment state.

## Field disposition rules

The following tables are generated from observed JSON field paths and declared interfaces. Nested structural paths map to their owning aggregate; leaf fields name a target or retained source value. Task 02/03 will finalize executable column definitions. `legacy_id_map` always preserves legacy identity; references are resolved explicitly. Current locale originals are retained without imposing a translation storage strategy. Credential values never migrate through the raw business-data path.

## Observed JSON fields — exhaustive snapshot

| Source path | Observed shape | Proposed target / transformation |
|---|---|---|
| `activities` | array | audit_events aggregate / ordered membership |
| `activities[]` | object | audit_events aggregate / ordered membership |
| `activities[].action` | string | audit_events.action (preserve original; validate before normalized import) |
| `activities[].adminName` | string | Legacy actor label; do not invent authenticated actor |
| `activities[].id` | string | legacy_id_map + audit event ID |
| `activities[].target` | string | Legacy target label; resolve ID only where evidence exists |
| `activities[].timestamp` | string | audit_events original occurred time + import recorded time |
| `admins` | array | users / staff profile and memberships aggregate / ordered membership |
| `admins[]` | object | users / staff profile and memberships aggregate / ordered membership |
| `admins[].avatar` | string | Profile media reference |
| `admins[].createdAt` | string | users / staff profile and memberships.created_at (preserve original; validate before normalized import) |
| `admins[].email` | string | Normalized staff email + original restricted source |
| `admins[].id` | string | legacy_id_map + new internal user ID |
| `admins[].lastLogin` | string | Legacy last-login timestamp with provenance |
| `admins[].name` | string | users / staff profile and memberships.name (preserve original; validate before normalized import) |
| `admins[].password` | string | Controlled credential reset only; retain original only in protected pre-migration snapshot, never a business-data import |
| `admins[].role` | string | roles / user_roles |
| `admins[].status` | string | Account status; explicit active/inactive mapping |
| `banners` | array | banners / content blocks aggregate / ordered membership |
| `banners[]` | object | banners / content blocks aggregate / ordered membership |
| `banners[].active` | boolean | banners / content blocks.active (preserve original; validate before normalized import) |
| `banners[].createdAt` | string | banners / content blocks.created_at (preserve original; validate before normalized import) |
| `banners[].ctaLabel` | string | banners / content blocks.cta_label (preserve original; validate before normalized import) |
| `banners[].ctaUrl` | string | Validated content link |
| `banners[].id` | string | legacy_id_map + banner ID |
| `banners[].image` | string | Media reference |
| `banners[].order` | number | Stable display sort order |
| `banners[].position` | string | banners / content blocks.position (preserve original; validate before normalized import) |
| `banners[].subtitle` | string | banners / content blocks.subtitle (preserve original; validate before normalized import) |
| `banners[].title` | string | banners / content blocks.title (preserve original; validate before normalized import) |
| `blogs` | array | blog_posts aggregate / ordered membership |
| `blogs[]` | object | blog_posts aggregate / ordered membership |
| `blogs[].author` | string | Preserve editorial label; link user only after reconciliation |
| `blogs[].category` | string | Blog taxonomy |
| `blogs[].content` | string | blog_posts.content (preserve original; validate before normalized import) |
| `blogs[].coverImage` | string | Media reference |
| `blogs[].createdAt` | string | blog_posts.created_at (preserve original; validate before normalized import) |
| `blogs[].excerpt` | string | blog_posts.excerpt (preserve original; validate before normalized import) |
| `blogs[].focusKeywords` | array | seo_metadata.keywords |
| `blogs[].focusKeywords[]` | string | seo_metadata.keywords |
| `blogs[].id` | string | legacy_id_map + blog ID |
| `blogs[].publishedAt` | string | blog_posts.published_at (preserve original; validate before normalized import) |
| `blogs[].readingTime` | string | blog_posts.reading_time (preserve original; validate before normalized import) |
| `blogs[].seoDescription` | string | seo_metadata.description |
| `blogs[].seoTitle` | string | seo_metadata.title |
| `blogs[].slug` | string | Preserve public blog route slug |
| `blogs[].status` | string | blog_posts.status (preserve original; validate before normalized import) |
| `blogs[].title` | string | blog_posts.title (preserve original; validate before normalized import) |
| `clients` | array | customer_profiles aggregate / ordered membership |
| `clients[]` | object | customer_profiles aggregate / ordered membership |
| `clients[].avatar` | string | Profile media reference |
| `clients[].country` | string | customer_profiles.country (preserve original; validate before normalized import) |
| `clients[].createdAt` | string | customer_profiles.created_at (preserve original; validate before normalized import) |
| `clients[].email` | string | Unverified contact email, not login ownership |
| `clients[].id` | string | legacy_id_map + customer_profiles ID |
| `clients[].name` | string | customer_profiles.name (preserve original; validate before normalized import) |
| `clients[].notes` | string | customer_private_notes; staff-only |
| `clients[].ordersCount` | number | Legacy reported baseline; reconcile against orders rather than assume exact linkage |
| `clients[].phone` | string | Unverified entered phone + canonical form after explicit country validation |
| `clients[].status` | string | customer_profiles.status (preserve original; validate before normalized import) |
| `clients[].totalSpent` | number | Restricted legacy summary baseline; future projection from verified order ledger |
| `discounts` | array | promotions aggregate / ordered membership |
| `discounts[]` | object | promotions aggregate / ordered membership |
| `discounts[].applyType` | string | Validated promotion eligibility scope |
| `discounts[].code` | string | Preserve source code, normalized unique lookup |
| `discounts[].createdAt` | string | promotions.created_at (preserve original; validate before normalized import) |
| `discounts[].description` | string | promotions.description (preserve original; validate before normalized import) |
| `discounts[].expiresAt` | string | promotions.expires_at (preserve original; validate before normalized import) |
| `discounts[].id` | string | legacy_id_map + promotions ID |
| `discounts[].isStackable` | boolean | promotions.is_stackable (preserve original; validate before normalized import) |
| `discounts[].minSpend` | number | Minimum eligible spend in confirmed currency minor units |
| `discounts[].perCustomerLimit` | number | promotions.per_customer_limit (preserve original; validate before normalized import) |
| `discounts[].startDate` | string | promotions.start_date (preserve original; validate before normalized import) |
| `discounts[].status` | string | promotions.status (preserve original; validate before normalized import) |
| `discounts[].targetCategories` | array | promotion_categories via resolved category keys |
| `discounts[].targetCategories[]` | string | promotion_categories via resolved category keys |
| `discounts[].targetSkus` | array | promotion_variants via resolved SKU keys |
| `discounts[].targetSkus[]` | string | promotion_variants via resolved SKU keys |
| `discounts[].type` | string | promotions.type (preserve original; validate before normalized import) |
| `discounts[].usageCount` | number | Historical usage baseline; never invent redemption rows/reset quota |
| `discounts[].usageLimit` | number | promotions.usage_limit (preserve original; validate before normalized import) |
| `discounts[].value` | number | Promotion percent/fixed amount by type; currency confirmation for fixed amounts |
| `orders` | array | orders / immutable snapshots aggregate / ordered membership |
| `orders[]` | object | orders / immutable snapshots aggregate / ordered membership |
| `orders[].carrier` | string | Internal shipment metadata; not customer DTO |
| `orders[].clientEmail` | string | Immutable entered email snapshot; never ownership proof |
| `orders[].clientName` | string | Immutable customer name snapshot |
| `orders[].clientPhone` | string | Immutable entered phone snapshot; never ownership proof |
| `orders[].comments` | string | Customer-visible comment only after field semantics review |
| `orders[].coordinates` | object | Restricted legacy location snapshot; no public carrier map |
| `orders[].coordinates.lat` | number | Restricted legacy location snapshot; no public carrier map |
| `orders[].coordinates.lng` | number | Restricted legacy location snapshot; no public carrier map |
| `orders[].createdAt` | string | orders / immutable snapshots.created_at (preserve original; validate before normalized import) |
| `orders[].fulfillmentStatus` | string | Explicit legacy lifecycle crosswalk + original value |
| `orders[].id` | string | legacy_id_map + order ID |
| `orders[].items` | array | order_items snapshots; unresolved refs preserved |
| `orders[].itemsCount` | number | Retain reported count; reconcile count-of-lines versus sum-of-quantities |
| `orders[].items[]` | object | order_items snapshots; unresolved refs preserved |
| `orders[].items[].image` | string | order_items.image_snapshot |
| `orders[].items[].name` | string | order_items.name_snapshot |
| `orders[].items[].price` | number | order_items.unit_amount_minor after confirmed legacy currency |
| `orders[].items[].productId` | string | Unresolved/resolved legacy product link + immutable original reference |
| `orders[].items[].quantity` | number | order_items.quantity; positive integer validation |
| `orders[].notes` | string | Staff-only order note |
| `orders[].orderNumber` | string | orders.order_number, preserve exact unique value |
| `orders[].paymentStatus` | string | Legacy financial-status summary with provenance; not a fabricated provider capture |
| `orders[].shippingAddress` | string | order_addresses raw original + reviewed structured mapping |
| `orders[].total` | number | Immutable legacy total, currency confirmation required |
| `orders[].trackingNumber` | string | Internal shipment reference; not customer DTO |
| `products` | array | products / variants aggregate / ordered membership |
| `products[]` | object | products / variants aggregate / ordered membership |
| `products[].activities` | array | activities / product_activities |
| `products[].activities[]` | string | activities / product_activities |
| `products[].badge` | string | products / variants.badge (preserve original; validate before normalized import) |
| `products[].caseSize` | string | Typed product attribute |
| `products[].category` | string | categories / product_categories primary membership |
| `products[].compatibleAccessories` | array | product_relations, explicit legacy ID-or-SKU resolution |
| `products[].compatibleAccessories[]` | string | product_relations, explicit legacy ID-or-SKU resolution |
| `products[].createdAt` | string | products / variants.created_at (preserve original; validate before normalized import) |
| `products[].description` | string | products / variants.description (preserve original; validate before normalized import) |
| `products[].family` | string | products / variants.family (preserve original; validate before normalized import) |
| `products[].features` | array | Validated product detail blocks: title/body/image preserved |
| `products[].features[]` | object | Validated product detail blocks: title/body/image preserved |
| `products[].features[].body` | string | Validated product detail blocks: title/body/image preserved |
| `products[].features[].title` | string | Validated product detail blocks: title/body/image preserved |
| `products[].focusKeywords` | array | seo_metadata.keywords |
| `products[].focusKeywords[]` | string | seo_metadata.keywords |
| `products[].id` | string | legacy_id_map + products.public_key; preserve /p/[id] |
| `products[].image` | string | media_assets / product_media with original path |
| `products[].inTheBox` | array | Ordered product content list |
| `products[].inTheBox[]` | string | Ordered product content list |
| `products[].isFeatured` | boolean | Merchandising membership / feature flag |
| `products[].level` | string | Typed product attribute |
| `products[].name` | string | products / variants.name (preserve original; validate before normalized import) |
| `products[].originalPrice` | number | prices.compare_at_amount_minor after currency confirmation |
| `products[].price` | number | prices.amount_minor after currency confirmation; preserve raw value |
| `products[].priceSuffix` | string | Product presentation metadata, not a charged amount |
| `products[].seoDescription` | string | seo_metadata.description |
| `products[].seoTitle` | string | seo_metadata.title |
| `products[].sku` | string | product_variants.sku |
| `products[].specs` | array | Validated product detail blocks: original label/value preserved |
| `products[].specs[]` | object | Validated product detail blocks: original label/value preserved |
| `products[].specs[].label` | string | Validated product detail blocks: original label/value preserved |
| `products[].specs[].value` | string | Validated product detail blocks: original label/value preserved |
| `products[].status` | string | products / variants.status (preserve original; validate before normalized import) |
| `products[].stock` | number | Opening inventory balance and opening ledger movement with provenance |
| `products[].subCategory` | string | Category hierarchy/membership |
| `settings` | object | store_settings / policy aggregate / ordered membership |
| `settings.contactEmail` | string | store_settings / policy.contact_email (preserve original; validate before normalized import) |
| `settings.currency` | string | Preserve current configured currency, not proof of each historical amount |
| `settings.currencySymbol` | string | Presentation symbol; not authority for financial conversion |
| `settings.freeShippingThreshold` | number | Versioned shipping policy; money conversion after currency confirmation |
| `settings.garminPaySandbox` | boolean | Legacy UI flag, not merchant integration |
| `settings.maintenanceMode` | boolean | store_settings / policy.maintenance_mode (preserve original; validate before normalized import) |
| `settings.seoDescription` | string | Default seo_metadata.description |
| `settings.seoTitle` | string | Default seo_metadata.title |
| `settings.storeName` | string | store_settings / policy.store_name (preserve original; validate before normalized import) |
| `settings.stripeEnabled` | boolean | Legacy UI flag; future Kaspi/secondary adapters configured separately |
| `settings.supportPhone` | string | store_settings / policy.support_phone (preserve original; validate before normalized import) |
| `settings.taxRate` | number | Legacy policy input; jurisdiction/rate semantics unconfirmed |

## Declared type coverage (including optional fields absent from JSON)

Exact field types/optionality are in `source-inventory.json.interfaces`. This prevents fields absent from the current sample from disappearing during migration. Each group below has an explicit owner.

| Source interface | All declared fields | Disposition |
|---|---|---|
| `src/lib/cms/types.ts#AdminUser` | `id`, `name`, `email`, `password?`, `role`, `status`, `avatar?`, `createdAt`, `lastLogin?` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#Client` | `id`, `name`, `email`, `phone`, `country`, `status`, `totalSpent`, `ordersCount`, `avatar?`, `notes?`, `createdAt` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#ProductSpecItem` | `label`, `value` | Catalog/detail/accessory/merchandising mapping; preserve ordered nested values, no automatic variant inference from marketing choices |
| `src/lib/cms/types.ts#ProductFeatureItem` | `title`, `body`, `image?` | Catalog/detail/accessory/merchandising mapping; preserve ordered nested values, no automatic variant inference from marketing choices |
| `src/lib/cms/types.ts#CMSProduct` | `id`, `name`, `sku`, `price`, `originalPrice?`, `priceSuffix?`, `description`, `image`, `badge?`, `family`, `category`, `subCategory`, `activities`, `level`, `caseSize`, `stock`, `status`, `isFeatured?`, `specs`, `inTheBox`, `compatibleAccessories`, `features?`, `seoTitle?`, `seoDescription?`, `focusKeywords?`, `canonicalUrl?`, `noIndex?`, `ogImage?`, `createdAt` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#Discount` | `id`, `code`, `description`, `type`, `value`, `minSpend?`, `usageLimit?`, `perCustomerLimit?`, `usageCount`, `applyType`, `targetCategories?`, `targetSkus?`, `startDate?`, `expiresAt?`, `isStackable?`, `status`, `createdAt` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#Banner` | `id`, `title`, `subtitle?`, `ctaLabel?`, `ctaUrl?`, `image?`, `position`, `active`, `order`, `createdAt` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#CMSBlog` | `id`, `slug`, `title`, `excerpt`, `content`, `coverImage`, `category`, `readingTime`, `author`, `status`, `publishedAt`, `seoTitle?`, `seoDescription?`, `focusKeywords?`, `canonicalUrl?`, `noIndex?`, `ogImage?`, `createdAt` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#SEOCheckItem` | `id`, `label`, `status`, `message`, `impact` | Derived validation/report/config; preserve logic and metadata, no invented transactional rows |
| `src/lib/cms/types.ts#SEOScoreReport` | `score`, `grade`, `status`, `checks`, `suggestions` | Derived validation/report/config; preserve logic and metadata, no invented transactional rows |
| `src/lib/cms/types.ts#PageSEOAudit` | `id`, `title`, `type`, `url`, `seoTitle?`, `seoDescription?`, `score`, `status`, `issuesCount`, `lastUpdated?` | Derived validation/report/config; preserve logic and metadata, no invented transactional rows |
| `src/lib/cms/types.ts#OrderItem` | `productId`, `name`, `price`, `quantity`, `image?` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#OrderMilestone` | `stage`, `label`, `date`, `description`, `completed`, `current?`, `location?` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#Order` | `id`, `orderNumber`, `clientName`, `clientEmail`, `total`, `itemsCount`, `items`, `paymentStatus`, `fulfillmentStatus`, `shippingAddress`, `clientPhone?`, `comments?`, `notes?`, `trackingNumber?`, `carrier?`, `estimatedDeliveryDate?`, `milestones?`, `coordinates?`, `createdAt` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#StoreSettings` | `storeName`, `contactEmail`, `supportPhone`, `currency`, `currencySymbol`, `freeShippingThreshold`, `taxRate`, `maintenanceMode`, `garminPaySandbox`, `stripeEnabled`, `seoTitle`, `seoDescription` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#ActivityLog` | `id`, `adminName`, `action`, `target`, `timestamp` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#CMSData` | `admins`, `clients`, `products`, `discounts`, `banners`, `blogs`, `orders`, `settings`, `activities`, `homepage?` | Core domain mapping above + XL Section 5; retain all optional source fields |
| `src/lib/cms/types.ts#HeroBanner` | `id`, `key`, `title`, `subtitle`, `image`, `href`, `active`, `order` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/cms/types.ts#ProductCarouselItem` | `id`, `title`, `description`, `price`, `originalPrice?`, `badge?`, `image`, `href`, `order` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/cms/types.ts#PromoCarouselItem` | `id`, `title`, `description`, `image`, `href`, `ctaText`, `order` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/cms/types.ts#CarouselBlock` | `id`, `title`, `subtitle?`, `type`, `active`, `order`, `items` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/cms/types.ts#HomepageTileBlock` | `id`, `title`, `image`, `href`, `cta`, `order` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/cms/types.ts#HomepageConfig` | `heroBanners`, `carousels`, `promoTiles`, `storyTiles`, `categoryTiles`, `updatedAt?` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/cms/types.ts#ImageDimensionSpec` | `label`, `recommendedWidth`, `recommendedHeight`, `aspectRatio`, `maxSizeBytes`, `maxSizeFormatted`, `supportedFormats`, `description` | Derived validation/report/config; preserve logic and metadata, no invented transactional rows |
| `src/types/index.ts#HeroSlide` | `title`, `subtitle`, `cta`, `href`, `image`, `alt` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/index.ts#FeaturedCard` | `badge?`, `title`, `description`, `image`, `href`, `fineprint?` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/index.ts#PromoPod` | `title`, `image`, `href`, `cta` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/index.ts#HalfPod` | `title`, `image`, `href`, `cta` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/index.ts#CategoryTile` | `title`, `image`, `href` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/index.ts#NavItem` | `label`, `href`, `columns?` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/index.ts#NavColumn` | `heading?`, `links` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/index.ts#FooterColumn` | `heading`, `links` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/index.ts#Product` | `id`, `name`, `price`, `priceSuffix?`, `description`, `image`, `badge?`, `family`, `activities`, `level`, `caseSize` | Catalog/detail/accessory/merchandising mapping; preserve ordered nested values, no automatic variant inference from marketing choices |
| `src/types/index.ts#WatchFamily` | `name`, `tagline`, `image` | Catalog/detail/accessory/merchandising mapping; preserve ordered nested values, no automatic variant inference from marketing choices |
| `src/types/index.ts#AccessoryItem` | `id`, `name`, `category`, `price`, `image`, `partNumber`, `description?`, `badge?` | Catalog/detail/accessory/merchandising mapping; preserve ordered nested values, no automatic variant inference from marketing choices |
| `src/types/index.ts#ProductDetail` | `id`, `title`, `subtitle`, `partNumber`, `price`, `badge?`, `breadcrumb`, `gallery`, `caseSizes`, `defaultCaseSize`, `versions`, `defaultVersion`, `colors`, `features`, `specs`, `inTheBox`, `accessories?`, `related` | Catalog/detail/accessory/merchandising mapping; preserve ordered nested values, no automatic variant inference from marketing choices |
| `src/types/marq.ts#MarqLifestyleSlide` | `edition`, `model`, `accent`, `href`, `poster`, `video`, `watch` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/marq.ts#MarqMaterialPanel` | `title`, `body`, `background`, `watch`, `imageSide` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/marq.ts#MarqProductCard` | `edition`, `model`, `accent`, `image`, `href`, `isNew?` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/types/marq.ts#MarqCallout` | `title`, `subtitle` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/account-addresses.ts#ShippingAddress` | `id`, `title`, `name`, `street`, `city`, `state`, `zip`, `country`, `phone`, `isPrimary` | Restricted customer/address/profile records; verified-owner linkage required |
| `src/lib/account-addresses.ts#UserProfile` | `name`, `email`, `phone`, `country`, `city`, `birthDate` | Restricted customer/address/profile records; verified-owner linkage required |
| `src/lib/blog.ts#BlogPost` | `slug`, `title`, `category`, `categories`, `date`, `image`, `excerpt`, `readTime` | Blog/taxonomy; preserve date/readTime/categories aliases explicitly |
| `src/lib/blog.ts#BlogCategory` | `key`, `label` | Blog/taxonomy; preserve date/readTime/categories aliases explicitly |
| `src/lib/homepage-content.ts#HomeHeroSlide` | `title`, `subtitle`, `href`, `key` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/homepage-content.ts#HomeFeaturedCard` | `title`, `description`, `image`, `href`, `badge?`, `edgeToEdge?` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |
| `src/lib/homepage-content.ts#HomeTile` | `title`, `image`, `href`, `cta` | Preserve versioned editorial/homepage/navigation/MARQ config; full field fidelity, locale strategy deferred |

## Static and component-embedded declaration counts

These are literal declaration sizes, not de-duplicated additional business-record counts. Computed spreads/maps/function output need static-source reconciliation in Task 06; no source module was executed. Shared IDs may overlap the CMS.

| Source declaration | Literal entries | Fields |
|---|---|---|
| `src/lib/products.ts#watchFamilies` | 5 (array) | `image`, `name`, `tagline` |
| `src/lib/products.ts#products` | 17 (array) | `activities`, `badge`, `caseSize`, `description`, `family`, `id`, `image`, `level`, `name`, `price`, `priceSuffix` |
| `src/lib/products.ts#activityFilters` | 12 (array) | Scalar list; values preserved in source |
| `src/lib/products.ts#levelFilters` | 4 (array) | Scalar list; values preserved in source |
| `src/lib/products.ts#caseSizeFilters` | 3 (array) | `label`, `value` |
| `src/lib/products.ts#catalogues` | 2 (array) | `filter`, `heading`, `hero`, `showFamilies`, `slug`, `title` |
| `src/lib/products.ts#fenix8Accessories` | 7 (array) | `badge`, `category`, `description`, `id`, `image`, `name`, `partNumber`, `price` |
| `src/lib/products.ts#fenix8Detail` | 1 (object) | `accessories`, `badge`, `breadcrumb`, `caseSizes`, `colors`, `defaultCaseSize`, `defaultVersion`, `features`, `gallery`, `id`, `inTheBox`, `partNumber`, `price`, `related`, `specs`, `subtitle`, `title`, `versions` |
| `src/lib/content.ts#topNav` | 7 (array) | `columns`, `href`, `label` |
| `src/lib/content.ts#heroSlides` | 6 (array) | `alt`, `cta`, `href`, `image`, `subtitle`, `title` |
| `src/lib/content.ts#featuredCards` | 10 (array) | `badge`, `description`, `fineprint`, `href`, `image`, `title` |
| `src/lib/content.ts#promoPods` | 3 (array) | `cta`, `href`, `image`, `title` |
| `src/lib/content.ts#halfPods` | 2 (array) | `cta`, `href`, `image`, `title` |
| `src/lib/content.ts#categoryTiles` | 6 (array) | `href`, `image`, `title` |
| `src/lib/content.ts#footerColumns` | 4 (array) | `heading`, `links` |
| `src/lib/content.ts#legalLinks` | 5 (array) | `href`, `label` |
| `src/lib/blog.ts#blogCategories` | 8 (array) | `key`, `label` |
| `src/lib/blog.ts#blogPosts` | 12 (array) | `categories`, `category`, `date`, `excerpt`, `image`, `readTime`, `slug`, `title` |
| `src/lib/marq.ts#lifestyleSlides` | 7 (array) | `accent`, `edition`, `href`, `model`, `poster`, `video`, `watch` |
| `src/lib/marq.ts#accentColor` | 1 (object) | `blue`, `cyan`, `gold`, `green`, `red`, `yellow` |
| `src/lib/marq.ts#materialPanels` | 3 (array) | `background`, `body`, `imageSide`, `title`, `watch` |
| `src/lib/marq.ts#productCards` | 8 (array) | `accent`, `edition`, `href`, `image`, `isNew`, `model` |
| `src/lib/marq.ts#marqAssets` | 1 (object) | `IMG`, `VID` |
| `src/lib/homepage-content.ts#homeHeroSlides` | 6 (array) | `href`, `key`, `subtitle`, `title` |
| `src/lib/homepage-content.ts#homeFeaturedCards` | 10 (array) | `badge`, `description`, `edgeToEdge`, `href`, `image`, `title` |
| `src/lib/homepage-content.ts#homePromoTiles` | 3 (array) | `cta`, `href`, `image`, `title` |
| `src/lib/homepage-content.ts#homeStoryTiles` | 2 (array) | `cta`, `href`, `image`, `title` |
| `src/lib/homepage-content.ts#homeCategoryTiles` | 6 (array) | `cta`, `href`, `image`, `title` |
| `src/lib/cms/seed.ts#initialCMSData` | 1 (object) | `activities`, `admins`, `banners`, `blogs`, `clients`, `discounts`, `orders`, `products`, `settings` |
| `src/components/AccountDashboard.tsx#TABS` | 4 (array) | Scalar list; values preserved in source |
| `src/components/AccountDashboard.tsx#initialProfile` | 1 (object) | `birthDate`, `city`, `country`, `email`, `name`, `phone` |
| `src/components/AccountDashboard.tsx#initialAddresses` | 2 (array) | `city`, `country`, `id`, `isPrimary`, `name`, `phone`, `state`, `street`, `title`, `zip` |
| `src/components/AccountDashboard.tsx#initialAccountOrders` | 4 (array) | `carrier`, `clientEmail`, `clientName`, `clientPhone`, `comments`, `createdAt`, `fulfillmentStatus`, `id`, `items`, `itemsCount`, `orderNumber`, `paymentStatus`, `shippingAddress`, `total`, `trackingNumber` |
| `src/components/AccountDashboard.tsx#devices` | 2 (array) | `image`, `name`, `registered`, `serial` |
| `src/components/AccountDashboard.tsx#subscriptions` | 2 (array) | `active`, `name`, `plan`, `price`, `renews` |

## API inventory

| Source route | Methods | Direct auth-reference scan | Migration owner |
|---|---|---|---|
| `src/app/api/account/orders/route.ts` | GET | Absent; inspect effective checks, do not infer safety | Session/verified-phone-owned customer queries |
| `src/app/api/admin/admins/route.ts` | GET, POST, DELETE | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |
| `src/app/api/admin/auth/login/route.ts` | POST | Absent; inspect effective checks, do not infer safety | Identity |
| `src/app/api/admin/auth/logout/route.ts` | POST | Absent; inspect effective checks, do not infer safety | Identity |
| `src/app/api/admin/auth/me/route.ts` | GET | Present; implementation still needs replacement | Identity |
| `src/app/api/admin/banners/route.ts` | GET, POST, DELETE | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |
| `src/app/api/admin/blogs/route.ts` | GET, POST, DELETE | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |
| `src/app/api/admin/clients/route.ts` | GET, POST, DELETE | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |
| `src/app/api/admin/discounts/route.ts` | GET, POST, DELETE | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |
| `src/app/api/admin/homepage/route.ts` | GET, PUT, POST | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |
| `src/app/api/admin/orders/route.ts` | GET, POST | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |
| `src/app/api/admin/products/route.ts` | GET, POST, DELETE | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |
| `src/app/api/admin/settings/route.ts` | GET, POST | Absent; inspect effective checks, do not infer safety | Permissioned domain service + safe DTO |

## Assets and consumer coverage

All 437 public assets (81,573,174 bytes) are listed by relative path, byte size and SHA-256 in the JSON inventory: 200 JPG, 114 PNG, 85 SVG, 29 MP4, six font files and three extensionless files. Counts alone are not a missing-reference check. Preserve all originals; checksum-based copy validation and restricted-media classification belong to the importer/media tasks.

The inventory records 64 source consumer files importing the relevant CMS/catalog/content/cart/account modules. All current `src/` files are checksummed, including static copy outside those imports. New/deleted files or changed hashes require an updated manifest before import; never overwrite concurrent edits with this snapshot.

## Remaining verification and task boundary

- This task establishes source coverage and identifies issues; it does not resolve every orphan link, assert all asset URLs exist, or validate real tax/payment history. Those are importer qualification gates, not inferred successes.
- No binary/customer source was copied into this documentation. Before future edits/imports, create a protected complete backup; a metadata report cannot restore records.
- User decisions are in `decisions.md`; exact SQL/DTO contracts and local runtime integration are Task 02 onward. No next task is started automatically.
