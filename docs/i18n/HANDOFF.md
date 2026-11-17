# Multilingual storefront handoff (English, Russian, Kazakh)

Plan: `docs/plans/2026-11-17-multilingual-en-ru-kk.md`. Decision record: D13 in `docs/backend/decisions.md`. Interface strings awaiting proofreading: `docs/i18n/REVIEW.md`.

## Before deploy (required)

**Set `NEXT_PUBLIC_SITE_URL` in production** to the real store origin (for example `https://shop.example.kz`, no trailing slash). Without it every canonical URL, hreflang alternate, sitemap URL, `robots.txt` sitemap line and JSON-LD URL falls back to `https://www.garmin.com`, which points Google at the wrong site. The value is read in `src/i18n/seo-core.js` (`SITE_URL`) and is also used for `metadataBase`.

## Provisional decisions awaiting owner confirmation

- OD1: `DEFAULT_LOCALE` is `ru` (`src/i18n/config.js`). It is the language for `/` when there is no cookie and no matching `Accept-Language`, and what Googlebot lands on.
- OD2: switcher order is `kk`, `ru`, `en` (`SWITCHER_ORDER`).
- OD3: minisites (fēnix 8, MARQ, MARQ 2, Why Garmin, Garmin Pay) and `/garmin-pay` stay English-only. In `ru`/`kk` they are `noindex` with no hreflang or sitemap entry (`ROUTE_LOCALES` in `src/i18n/seo-core.js`). Task 11 (minisite translation) was skipped.

To change OD1 or OD2, edit `src/i18n/config.js` and run the tests. To translate a minisite later, move its entry in `ROUTE_LOCALES` from `EN_ONLY` to `ALL` once its copy is translated.

## Routing rules

- Locales: `en`, `ru`, `kk`. Every public URL carries a prefix, including the default: `/en/…`, `/ru/…`, `/kk/…`. All routes live under `src/app/[lang]/`.
- `src/proxy.ts` (Next.js 16 proxy) handles unprefixed public paths with a **307** redirect to the negotiated language, keeping path and query. Order: `NEXT_LOCALE` cookie, then `Accept-Language`, then `DEFAULT_LOCALE`. The pure logic is `decideLocaleRedirect` in `src/i18n/routing.js`.
- The language switcher sets the `NEXT_LOCALE` cookie (1 year). Bots get no special handling.
- Not prefixed and never redirected: `/admin/**`, `/api/**`, `/uploads/**`, `/_next/**`, `/seo/**`, `/homepage/**`, `/images/**`, `/videos/**`, `robots.txt`, `sitemap.xml`, and any path with a file extension (see the `matcher` in `src/proxy.ts`).
- Slugs and IDs are the same in every language (`/ru/p/fenix-8-pro`, `/kk/blog/<same-slug>`). There are no translated slugs.
- Use the helpers in `src/i18n/navigation.ts` and `useLocalizeHref` for links so the prefix is kept.

## Adding a UI string

1. Add the key to `messages/en.json` under the right namespace, then add the same key to `messages/ru.json` and `messages/kk.json`. Keep `{placeholders}` identical. Plurals use ICU: Russian needs `one`/`few`/`many`/`other`, Kazakh `one`/`other`.
2. Server components: `getTranslations({ locale, namespace })`. Client components: `useTranslations`. A client component can only read namespaces listed in `CLIENT_NAMESPACES` in `src/app/[lang]/layout.tsx`. Add a new namespace there if a client component uses it, otherwise it throws at runtime.
3. Run `node --test tests/i18n-messages.test.mjs`. It checks that all three catalogs have the same keys, matching placeholders and plural categories, and that no hard-coded English strings remain in components (grep test).
4. Add the new row to `docs/i18n/REVIEW.md` so a proofreader sees it. Brand and product names (Garmin, fēnix, MARQ, Garmin Pay, Connect IQ) stay in Latin script.
5. A blank or missing `ru`/`kk` string falls back to English at runtime.

Number, date and currency formatting use `src/i18n/format.js` with `en-US` / `ru-RU` / `kk-KZ`. Currency rules themselves belong to the backend plan (D11/D12).

## Translating CMS content

- Records keep their existing fields as the **English source**. Translations live in an optional `translations: { ru?: {...}, kk?: {...} }` overlay on the record (`src/lib/cms/types.ts`). Each field falls back to English separately when the overlay field is missing or blank.
- Admin (`/admin`, English-only) has EN / RU / KK tabs for content: products (`ProductTranslationPanel`), blogs, banners, settings (SEO title and description) and the homepage editor. Edit the RU and KK tabs; the EN tab is the source.
- Each tab shows a completeness indicator (dot) from `translationStatus`. Save validation lives in `src/lib/cms/translation-input.js`.
- **When a page becomes indexable in a language** (rule L7):
  - Product: overlay has non-blank `name` and `description`.
  - Blog post: overlay has non-blank `title` and `content`.
  - Until then the page still renders for visitors (English text fallback) but is `noindex`, has no hreflang alternate and is missing from the sitemap.
  - Home, category, blog index, compare, cart, account and newsletter pages are indexable in all three languages because their text is interface strings.
- Admin write routes for blogs, banners, settings and homepage now require an admin session.

## SEO behaviour

- Each indexable page emits `<link rel="alternate" hreflang>` for `en`, `ru`, `kk` plus `x-default` pointing at the unprefixed URL (the redirector). Built by `buildAlternates` / `localizedSeo` (`src/i18n/seo-core.js`, `src/i18n/seo.ts`).
- Canonical is the page's own localized URL (a record-level `canonicalUrl` override wins). Open Graph locales: `en_US`, `ru_RU`, `kk_KZ`.
- Untranslated pages (L7, OD3 minisites) are `robots: noindex` and are not listed as alternates of other languages. A per-record `noIndex` always wins.
- ru/kk SEO text order: translated `seoTitle`, then translated `name`, then the English base value.
- `src/app/sitemap.ts` lists every indexable language version of each URL with alternates. `src/app/robots.ts` references `${SITE_URL}/sitemap.xml`.
- `<html lang>` follows the locale.

## Overlay to `*_translations` tables (PostgreSQL importer)

Key every translation row by `(record id, locale)` with `locale` in `ru`, `kk`. English stays on the base table. Treat blank strings as absent. Overlay shape is defined by the specs in `src/i18n/translate-record.js` and the types in `src/lib/cms/types.ts`.

| Record | Translatable fields | Child / keyed data |
|---|---|---|
| Product (`product_translations`) | `name`, `description`, `overviewHtml`, `seoTitle`, `seoDescription`, `priceSuffix` | `inTheBox` (string list, merged by index); `specs[i].label/value`, `features[i].title/body`, `specGroups[i].title` and `specGroups[i].items[j].label/value` (merged by array index; consider an `ordinal` column); `optionNames` (optionId to name), `valueLabels` (optionValueId to label), `variantTitles` (variantId to title), `imageAlts` (imageId to alt) go to `product_option_translations`, `option_value_translations`, `variant_translations`, `media_translations` keyed by those ids |
| Blog post (`blog_translations`) | `title`, `excerpt`, `content`, `category`, `readingTime`, `seoTitle`, `seoDescription` | none. Blog category is a plain string, translated inline |
| Banner (`banner_translations`) | `title`, `subtitle`, `ctaLabel` | none |
| Store settings (`settings_translations`) | `seoTitle`, `seoDescription` | none |
| Homepage | hero banners: `title`, `subtitle`, `disclaimer`. Carousels: `title`, `subtitle`. Carousel items: `title`, `description`, `badge`, `ctaText`, `imageAlt`. Promo, story and category tiles: `title`, `cta` | Overlay is keyed by stable block id (`heroBanners[id]`, `carousels[id].items[itemId]`, `promoTiles[id]`, `storyTiles[id]`, `categoryTiles[id]`), so each block or item gets its own translation row keyed by that id |

Not translated: slugs, IDs, URLs, prices, SKUs, images, status fields. Index-based lists (`specs`, `features`, `specGroups`, `inTheBox`) are merged by position, so the importer must preserve the order of the English list and note that stale overlays can appear after reordering English rows.

## Post-deploy Search Console steps

1. Confirm `NEXT_PUBLIC_SITE_URL` is set and that `/sitemap.xml` and `/robots.txt` show the real domain.
2. In Google Search Console, add the property for the real domain and submit `https://<domain>/sitemap.xml`.
3. Use URL Inspection on one URL per language (for example `/en`, `/ru`, `/kk`, and one product in each). Check that the canonical is the page itself, that hreflang alternates for all three languages plus `x-default` are listed, and that the page is indexable.
4. Inspect one untranslated product in `ru`/`kk` and one minisite page in `ru`/`kk`: both should report `noindex`.
5. Re-check the International Targeting / Pages reports after a few days for hreflang errors.

## Decisions made during implementation

- The header switcher shows compact `KK` / `RU` / `EN` codes; full language names are in the `aria-label`.
- `next/font` stays latin-only. Cyrillic loads lazily through `src/app/garmin-fonts.css` using `unicode-range`. The Cyrillic Roboto and Oswald files are Google's current variable builds.
- Compare and `/garmin-pay` keep the static product list.
- ru/kk SEO text order is translated `seoTitle`, then translated `name`, then the English base.
- Blog content cleaning is lossless (content is rendered as text).
- Admin write routes for blogs, banners, settings and homepage now require an admin session.
- Minisites stay English-only at launch (Task 11 skipped, OD3).

## Known gaps / follow-ups

- Data: product names in `src/lib/cms/data.json` contain pre-existing encoding errors (for example "VenuВ® 4", "Enduroв„ў 3", "fД“nixВ® 8" in `seoTitle`). This is a data fix outside this work.
- Fonts: the Cyrillic Roboto 300 and 900 weights have no dedicated face and clamp to 400-700. One test title in `tests/i18n-fonts.test.mjs` is awkward.
- Messages: the grep test misses JS string literals (the AccountDashboard mock "Home"/"Office"). `ProductOverview.tsx` lines 545 and 586 still have English aria-labels. In ru/kk the price renders as "1 299,99 $ USD" (double currency), for the proofreader or owner to decide. `scanMessage` has offset and apostrophe gaps. `formatDate` / `formatDateTime` use the runtime timezone, which is a hydration risk in client components.
- Switcher: the bold current-locale item shifts width, and the footer switcher adds about 21px of height. The header `aria-label` uses the full name while the visible text is a code, so voice control "click RU" may not match.
- SEO: cart and account pages are indexable with hreflang (pre-existing); consider `noindex`. Breadcrumb labels are untranslated and one crumb hard-codes `/c/wearables-smartwatches`. The `SITE_URL` default path is untested and `absoluteUrl` with an empty string is unhandled.
- Overlay resolver: `mergeInto` writes overlay scalars where the base field is absent (it could show a badge English lacks). `localizeRecord(null)` throws. There are no tests for malformed overlays or `__proto__` keys. TypeScript typing of the `.js` specs relies on `allowJs`.
- Storefront: header search and `BlogExplorer` use static data (no search by localized name). Static-only blog posts are `noindex` in ru/kk (correct per L7). The cart page ships the full catalog. `buildFallbackDetail` and `fenix8Detail` have English labels. When only `name` is translated, the ru title is the bare translated name without the "| Garmin" suffix. `getRawCMSProduct` is called twice per request.
- Admin: stale index or id overlays remain after reordering or deleting records (no prune or warning). The blog error for a non-object overlay is misleading. Length counting differs between client and server. Resetting the homepage orphans overlays. There is no translation editor for product `features`. GET endpoints for blogs, banners, settings and homepage are unauthenticated (pre-existing; writes are now protected).
- Robots and sitemap: `robots.txt` rules `/*/cart` and `/*/account` are over-broad (the Google `*` spans slashes, so `/en/blog/cart-…` is blocked) and are ineffective for the Googlebot group. The sitemap static routes use an `as` cast, and product `lastModified` is `createdAt`.
