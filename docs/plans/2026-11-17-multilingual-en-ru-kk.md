# Multilingual storefront (English · Russian · Kazakh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Progress
| Status | Done | Last updated | Next action |
|---|---|---|---|
| Done – partial (Task 11 skipped by provisional OD3) | 11/12 | 2026-11-17 | Owner confirms OD1–OD3; human proofreads docs/i18n/REVIEW.md |

**Goal:** Serve every public storefront page in English, Russian and Kazakh at its own indexable URL (`/en/…`, `/ru/…`, `/kk/…`), rendered on the server, with a language switcher, hreflang tags, a per-language sitemap, and admin editing of translated CMS content.

**Architecture:** One set of components under `src/app/[lang]/`. Interface text comes from `messages/{en,ru,kk}.json` through `next-intl` (server-side `getTranslations`, so no translation JSON is sent to the browser beyond what client components need). CMS records keep their current fields as the **English source** and gain an optional `translations.{ru,kk}` overlay. Fields fall back to English one at a time. This overlay maps 1:1 onto the `*_translations` tables proposed in the PostgreSQL plan. `src/proxy.ts` sends unprefixed URLs to a language: saved cookie first, then `Accept-Language`, then the default.

**Tech Stack:** Next.js 16.2.1 App Router (`proxy.ts`, `[lang]` segment, `generateMetadata` `alternates.languages`, `MetadataRoute.Sitemap` alternates), `next-intl` 4.x, `Intl.NumberFormat`/`Intl.DateTimeFormat`/`Intl.PluralRules`, `node --test` for pure logic.

**Spec:** this file, sections *Decisions* and *Global Constraints*. It also resolves open item **O11** in [`docs/backend/decisions.md`](../backend/decisions.md) (localization storage, routing, fallback and translation source), subject to owner approval.

## Decisions

Decisions already made (record them in `docs/backend/decisions.md` as **D13** once the owner approves this plan):

| # | Decision |
|---|---|
| L1 | Locales `en`, `ru`, `kk` (BCP-47; `kk` = Kazakh, Cyrillic script). `<html lang>` uses these codes. Open Graph locales: `en_US`, `ru_RU`, `kk_KZ`. Intl formatting locales: `en-US`, `ru-RU`, `kk-KZ`. |
| L2 | **Every** public URL has a language prefix, including the default language. `/` and any unprefixed public path give a **307** to the negotiated language, and the path and query are kept. Old indexed URLs therefore keep working. |
| L3 | Negotiation order: `NEXT_LOCALE` cookie → `Accept-Language` → `DEFAULT_LOCALE`. Choosing a language in the switcher sets the cookie (1 year). Bots get no special handling: Googlebot sends no Accept-Language, so it lands on the default and discovers the other languages through hreflang. |
| L4 | `x-default` hreflang points to the unprefixed URL (the redirector). |
| L5 | Slugs and IDs stay the same in every language (`/ru/p/fenix-8-pro`, `/kk/blog/<same-slug>`). There are no translated slugs. |
| L6 | CMS overlay model: the base fields are English; `translations?: { ru?: Partial<T>, kk?: Partial<T> }` holds only the translatable fields. Each field falls back to English when the translation is missing or blank. |
| L7 | Pages whose **main content** is not translated yet are excluded from search for that language: `robots: noindex`, no hreflang alternate, and no sitemap entry. A visitor still sees the page, with English text. This prevents mixed-language pages from being indexed. |
| L8 | The admin panel (`/admin/**`) stays English-only and unprefixed. It gains EN/RU/KK tabs for *content* editing only. |
| L9 | Currency rules are unchanged by this plan. Only the number and date *formatting* follows the language. Currency and USD display belong to the backend plan (D11/D12). |
| L10 | Interface strings for `ru`/`kk` are machine-drafted by the implementer and listed in `docs/i18n/REVIEW.md` for human proofreading before launch. CMS translations are entered by the owner in the admin panel. |

Owner decisions still needed. Each has a provisional value so work isn't blocked, and each is a single constant or file to change:

| # | Question | Provisional |
|---|---|---|
| OD1 | Which language should `/` use when nothing else matches (and Google's first crawl)? | `ru` (`DEFAULT_LOCALE` in `src/i18n/config.js`) |
| OD2 | Order of languages in the switcher | `kk`, `ru`, `en` |
| OD3 | Must the minisites (fēnix 8, MARQ, MARQ 2, Why Garmin, Garmin Pay, about 2,800 lines of marketing copy) be translated before launch, or ship English-only under L7? | English-only at launch (Task 11 is optional) |

## Global Constraints

- Next.js 16.2.1 conventions. The request hook is `src/proxy.ts` exporting `proxy` (not `middleware`). Read `node_modules/next/dist/docs/01-app/02-guides/internationalization.md` and the `next-intl` docs for its Next 16 / `proxy.ts` setup before Task 2.
- `next-intl`: pin the newest `4.x` version published **at least 14 days** before install (`npm view next-intl time`). Use an exact version, not a `^` range.
- TypeScript strict, no `any`. Named exports. 2-space indentation. Tailwind/CSS modules as they are used now, with no inline styles.
- Pure logic goes in plain `.js` with a typed `.ts` wrapper, tested by `node --test tests/*.test.mjs`. This is the existing pattern (see `src/lib/cms/product-variants.{js,ts}`).
- The existing visual design must not change for `en`. The `en` homepage must look pixel-identical to today's `/`.
- `src/lib/cms/data.json` stays the store. **Do not** rename or remove existing fields: English stays in the base fields. A backup copy goes next to it before the first migration write.
- These paths stay unprefixed and are never touched by the language redirect: `/admin/**`, `/api/**`, `/uploads/**`, `/_next/**`, `/robots.txt`, `/sitemap.xml`, `/seo/**`, `/homepage/**`, `/images/**`, `/videos/**`, and any path with a file extension.
- Do not touch the backend worktree `codex/backend-task-02`. Recording the decision in `docs/backend/decisions.md` is the only backend-side change.

## Review Focus

1. **Cyrillic glyphs.** `src/app/garmin-fonts.css` only ships `latin` and `latin-ext` subsets, and `next/font` loads `subsets: ["latin"]`. Without changes, Russian and Kazakh text falls back to Arial. Kazakh letters (ә ғ қ ң ө ұ ү һ і) need `cyrillic-ext`. → Task 3 adds the subsets and a test that checks their `unicode-range`.
2. **Old URLs and links without a prefix.** Bookmarks, Google's current index, `href`s held in data (`homepage-nav.ts`, `content.ts`, `data.json` banners/CTA URLs), `router.push('/newsletter')`, and query strings like `?sku=` must all end up on the localized URL with the query intact. External `garmin.com` links must not be prefixed. → Task 1 tests `localizeHref`, and Task 2 tests the proxy.
3. **Product canonical override.** `CMSProduct.canonicalUrl` used for every language would tell Google to drop `/ru` and `/kk`. → The override applies to `en` only. `ru`/`kk` always use themselves as canonical (Task 6 test).
4. **Blank or partial translations.** An empty string, whitespace, or a missing nested item (one spec row) must fall back to English per field and never render an empty heading. Russian and Kazakh plural forms must be correct (ru: one/few/many; kk: one/other). → Tasks 1 and 4 tests.
5. **HTML injection through translated rich text.** `overviewHtml` and blog `content` in `translations.*` must go through the same `sanitize-html` path as the English fields when saved. → Task 9 test.

---

## File Structure

```
messages/en.json, ru.json, kk.json        # Interface strings, namespaced by component (en = source of truth)
docs/i18n/REVIEW.md                       # Machine-drafted strings awaiting proofreading
src/i18n/config.js / config.ts            # LOCALES, DEFAULT_LOCALE, intl/OG locale maps, isLocale
src/i18n/routing.js / routing.ts          # negotiateLocale, localizeHref, stripLocale
src/i18n/translate-record.js / .ts        # localizeRecord (L6 field-wise fallback)
src/i18n/format.ts                        # formatMoney, formatDate
src/i18n/seo.ts                           # buildAlternates, ROUTE_LOCALES (L7 coverage)
src/i18n/request.ts                       # next-intl getRequestConfig (en fallback merge)
src/i18n/navigation.ts                    # next-intl createNavigation → Link, useRouter, usePathname, redirect
src/proxy.ts                              # locale redirect (L2/L3)
src/app/fonts.ts                          # shared next/font instances (both root layouts)
src/app/[lang]/layout.tsx                 # storefront root layout (<html lang>)
src/app/[lang]/**                         # moved public routes
src/app/admin/layout.tsx                  # becomes a root layout (<html lang="en">)
src/components/LanguageSwitcher.tsx       # header + footer + mobile menu
src/components/admin/LocaleTabs.tsx       # EN/RU/KK tab strip for editors
tests/i18n-*.test.mjs
```

---

### Task 1: Locale config and pure routing helpers

**Files:**
- Create: `src/i18n/config.js`, `src/i18n/config.ts`, `src/i18n/routing.js`, `src/i18n/routing.ts`
- Test: `tests/i18n-routing.test.mjs`

**Interfaces:**
- Produces:
  - `LOCALES: readonly ['en','ru','kk']`, `type Locale`, `DEFAULT_LOCALE: Locale` (OD1), `SWITCHER_ORDER: Locale[]` (OD2)
  - `INTL_LOCALE: Record<Locale,string>` (`en-US`/`ru-RU`/`kk-KZ`), `OG_LOCALE: Record<Locale,string>`, `LOCALE_LABEL: Record<Locale,string>` (`English`, `Русский`, `Қазақша`)
  - `isLocale(v: string): v is Locale`
  - `negotiateLocale(input: { cookie?: string; acceptLanguage?: string }): Locale`
  - `stripLocale(pathname: string): { locale: Locale | null; rest: string }`
  - `localizeHref(href: string, locale: Locale): string` leaves alone absolute URLs, `mailto:`/`tel:`, `#hash`, excluded prefixes (Global Constraints) and paths that already have a prefix (it swaps the prefix). Otherwise it adds `/${locale}` and keeps the query and hash.
  - `isExcludedPath(pathname: string): boolean`

- [ ] **Step 1: Write the failing tests**

```js
test('negotiate: valid cookie wins', () => assert.equal(negotiateLocale({ cookie: 'kk', acceptLanguage: 'en-US' }), 'kk'));
test('negotiate: invalid cookie ignored', () => assert.equal(negotiateLocale({ cookie: 'de', acceptLanguage: 'en' }), 'en'));
test('negotiate: q-weights and region tags', () => assert.equal(negotiateLocale({ acceptLanguage: 'de;q=1, kk-KZ;q=0.9, ru;q=0.8' }), 'kk'));
test('negotiate: nothing matches → default', () => assert.equal(negotiateLocale({ acceptLanguage: 'fr' }), DEFAULT_LOCALE));
test('negotiate: empty/garbage header → default', () => assert.equal(negotiateLocale({ acceptLanguage: ';;,' }), DEFAULT_LOCALE));
test('localizeHref keeps query+hash', () => assert.equal(localizeHref('/p/fenix-8?sku=010-1#specs', 'ru'), '/ru/p/fenix-8?sku=010-1#specs'));
test('localizeHref root', () => assert.equal(localizeHref('/', 'kk'), '/kk'));
test('localizeHref swaps existing prefix', () => assert.equal(localizeHref('/en/cart', 'kk'), '/kk/cart'));
test('localizeHref leaves external, admin, api, uploads, assets', () => {
  for (const h of ['https://www.garmin.com/c/x/', 'mailto:a@b.c', '#top', '/admin/products', '/api/cart', '/uploads/a.jpg', '/seo/favicon-32x32.png'])
    assert.equal(localizeHref(h, 'ru'), h);
});
test('stripLocale', () => assert.deepEqual(stripLocale('/ru/blog/x'), { locale: 'ru', rest: '/blog/x' }));
test('stripLocale does not match /russia', () => assert.deepEqual(stripLocale('/russia'), { locale: null, rest: '/russia' }));
```

- [ ] **Step 2: Run** `node --test tests/i18n-routing.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the signatures above in `routing.js` and `config.js`, with typed re-exports in the `.ts` files. Parse Accept-Language yourself (split on `,`, read `q`, sort by q while keeping order for equal q, match the primary subtag). Don't add a negotiator dependency.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(i18n): locale config and routing helpers`

### Task 2: Move routes under `[lang]`, add next-intl and the proxy

**Files:**
- Modify: `package.json` (pinned `next-intl`), `next.config.*` (next-intl plugin pointing at `src/i18n/request.ts`)
- Create: `src/proxy.ts`, `src/i18n/request.ts`, `src/i18n/navigation.ts`, `src/app/fonts.ts`, `src/app/[lang]/layout.tsx`, `src/app/[lang]/not-found.tsx`, `messages/{en,ru,kk}.json` (start as `{}` plus the `Meta` namespace)
- Move (`git mv`): `src/app/{page.tsx,homepage.css,account,blog,c,cart,compare,garmin-pay,minisite,newsletter,p}` → `src/app/[lang]/…`
- Delete: `src/app/layout.tsx` (its contents split between `[lang]/layout.tsx` and `admin/layout.tsx`)
- Modify: `src/app/admin/layout.tsx` so it renders `<html lang="en">`, `<body>`, the fonts and global CSS (it becomes a root layout)
- Test: `tests/i18n-proxy.test.mjs`

**Interfaces:**
- Consumes: Task 1 `negotiateLocale`, `stripLocale`, `isExcludedPath`, `LOCALES`, `DEFAULT_LOCALE`.
- Produces: `params.lang` on every public page. `Link`, `useRouter`, `usePathname`, `redirect`, `getPathname` from `@/i18n/navigation` (they localize automatically). `getTranslations`/`useTranslations` work everywhere under `[lang]`. Also `decideLocaleRedirect(pathname: string, search: string, cookie?: string, acceptLanguage?: string): string | null` in `routing.js`, which is the pure core of the proxy.

- [ ] **Step 1: Write failing tests** for `decideLocaleRedirect`:
  - `('/', '', undefined, 'kk')` → `'/kk'`
  - `('/p/fenix-8', '?sku=1', 'ru', 'en')` → `'/ru/p/fenix-8?sku=1'`
  - `('/ru/cart', '', 'en', 'en')` → `null` (already prefixed, so the prefix wins over the cookie)
  - `('/admin', …)`, `('/api/x', …)`, `('/uploads/a.jpg', …)`, `('/favicon.ico', …)` → `null`
- [ ] **Step 2: Run** `node --test tests/i18n-proxy.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `decideLocaleRedirect`. Then write `src/proxy.ts`: call it, return a 307 `NextResponse.redirect` when it is non-null, and otherwise pass the request on with the locale available to next-intl. If next-intl's own proxy/middleware helper is used, keep `decideLocaleRedirect` as the source of truth and configure next-intl with `localePrefix: 'always'` and `localeDetection: false`. The `matcher` excludes the Global Constraints paths.
- [ ] **Step 4: Implement** the `[lang]` root layout. Use `generateStaticParams` → the three locales, `hasLocale` guard → `notFound()`, `setRequestLocale(lang)`, `<html lang={lang}>`, `NextIntlClientProvider` with **only** the namespaces client components use (pass `pick`ed messages), `CartProvider`, and the existing font classes from `src/app/fonts.ts`. `request.ts` deep-merges `en` under the requested locale so missing keys show English (L6/L10).
- [ ] **Step 5: Update every public page and layout** to `await params` and type them with `PageProps<'/[lang]/…'>`. Replace `next/link` imports in public components with `@/i18n/navigation`, and replace `useRouter` in `EmailSignup.tsx`/`HomeSignup.tsx` the same way. Hrefs that come from data go through `localizeHref` (Task 1) where they are rendered.
- [ ] **Step 6: Run** the tests (PASS), then `npm run typecheck`, `npm run lint`, `npm run build`. Expected: all pass, and the build lists `/[lang]` routes with `en`/`ru`/`kk` params.
- [ ] **Step 7: Verify in the browser** (dev server): `/` → 307 to `/ru` (default); with cookie `NEXT_LOCALE=en`, `/p/<id>?sku=…` → `/en/p/<id>?sku=…`; `/admin` loads without a redirect; `/uploads/<existing file>` returns 200; `view-source` of `/kk` shows `<html lang="kk">`. Take a screenshot of `/en` next to the pre-change `/` (`git stash` baseline) and confirm they are identical.
- [ ] **Step 8: Commit** `feat(i18n): [lang] routing, next-intl, proxy redirect`

### Task 3: Cyrillic fonts

**Files:**
- Modify: `src/app/fonts.ts` (`subsets: ['latin','cyrillic','cyrillic-ext']` for Oswald and Roboto), `src/app/garmin-fonts.css`
- Create: `public/homepage/fonts/roboto-{400,500,700}-cyrillic{,-ext}.woff2`, `public/homepage/fonts/oswald-cyrillic{,-ext}.woff2`
- Test: `tests/i18n-fonts.test.mjs`

- [ ] **Step 1: Write a failing test.** Parse `garmin-fonts.css`. For each `font-family` × weight already present, there must be a face whose `unicode-range` includes `U+0400-045F` (Russian) and one that includes `U+04D8`, `U+0492`, `U+049A`, `U+04A2`, `U+04E8`, `U+04B0`, `U+04AE`, `U+04BA`, `U+0456` (Kazakh), and every referenced file must exist on disk.
- [ ] **Step 2: Run** `node --test tests/i18n-fonts.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Download** the matching Google Fonts woff2 subsets (same families, weights and version as the existing latin files). Use the `unicode-range` Google publishes for each subset, and add `@font-face` blocks in the same style as the existing ones.
- [ ] **Step 4: Run** the test (PASS). In the browser, check `/kk` with `document.fonts.check('16px GarminRoboto', 'әғқңөұүһі')` → `true`, and take a screenshot of the header with Kazakh text.
- [ ] **Step 5: Commit** `feat(i18n): cyrillic and cyrillic-ext font subsets`

### Task 4: Message catalogs, completeness test and formatting

**Files:**
- Create: `messages/{en,ru,kk}.json` (filled), `docs/i18n/REVIEW.md`, `src/i18n/format.ts`, `src/i18n/messages-check.js`
- Modify: every public component with user-facing literals: `components/home/*`, `SiteFooter.tsx`, `ProductCard.tsx`, `ProductTop.tsx`, `ProductTabs.tsx`, `CartView.tsx`, `CompareTool.tsx`, `CatalogueGrid.tsx`, `CategoryGrid.tsx`, `BlogExplorer.tsx`, `AccountDashboard.tsx`, `OrderDetailsModal.tsx`, `EmailSignup.tsx`, `NewsletterSignup.tsx`, `RelatedProducts.tsx`, `lib/homepage-nav.ts`, `lib/content.ts`, `lib/homepage-content.ts`, `lib/products.ts` (labels only), and page `metadata` titles/descriptions (`Meta.*`)
- Test: `tests/i18n-messages.test.mjs`

**Interfaces:**
- Produces:
  - Namespaces named after their component (`Header`, `Footer`, `ProductCard`, `Cart`, …).
  - Static data modules turn their label strings into **message keys** (`labelKey: 'Header.nav.smartwatches'`) and are resolved with `t()` where they are rendered. `href`s stay in the data.
  - `formatMoney(amount: number, locale: Locale, currency?: 'USD'|'KZT'): string` keeps today's currency (L9) and replaces the four `toLocaleString("en-US")` copies.
  - `formatDate(iso: string, locale: Locale, style?: 'short'|'long'): string`.
  - `checkCatalogs(en, other, locale): { missing: string[]; extra: string[]; badPlural: string[] }`.

- [ ] **Step 1: Write failing tests.**
  - `checkCatalogs(en, ru,'ru')` and `(en, kk,'kk')` give `missing: []`, `extra: []`, `badPlural: []`. A plural message in `ru` must have `one`, `few`, `many` and `other`. In `kk` it must have `one` and `other`. Placeholders `{name}` must match the `en` set exactly.
  - No public component file contains user-visible English text that isn't a message key. A grep test checks for JSX text nodes `>[A-Z][a-z]+[^<]*<` in the files listed above. An allowlist covers brand names (`Garmin`, `fēnix`, `MARQ`, …).
  - `formatMoney(1299.99,'ru','USD')` → `'1 299,99 $'` and `formatMoney(1299.99,'en','USD')` → `'$1,299.99'`. **Before asserting, normalize narrow no-break spaces (` `, ` `) to a plain space.** `formatDate('2026-11-17','kk','long')` contains `2026`.
- [ ] **Step 2: Run** `node --test tests/i18n-messages.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Extract** the strings into `en.json` and replace them with `t()`/`getTranslations`. Use ICU plurals wherever a count is shown (cart items, results count, reviews).
- [ ] **Step 4: Machine-draft** `ru.json`/`kk.json`. List every key in `REVIEW.md`, grouped by namespace, with checkboxes for the proofreader. Mark brand and product names as do-not-translate.
- [ ] **Step 5: Run** the tests and `npm run check`. Expected: PASS. Take screenshots of the header, the mega menu, the product page and the cart in `/kk` at 375 px and 1440 px. Check for overflow, because Kazakh and Russian words are about 30% longer: no clipped nav items or buttons.
- [ ] **Step 6: Commit** `feat(i18n): en/ru/kk interface catalogs and locale formatting`

### Task 5: Language switcher

**Files:**
- Create: `src/components/LanguageSwitcher.tsx` (client)
- Modify: `components/home/HomeHeader.tsx` (desktop utility bar + mobile accordion), `components/home/HomeFooter.tsx`
- Test: covered by the browser check in Step 2 (the component logic is `localizeHref` + `usePathname`, already tested)

**Interfaces:**
- Consumes: `usePathname`, `Link` from `@/i18n/navigation`, `SWITCHER_ORDER`, `LOCALE_LABEL`.
- Produces: `<LanguageSwitcher variant="header" | "footer" | "mobile" />`. It renders `<Link href={pathname + search} locale={l} hrefLang={l} lang={l}>` for each locale. The current locale has `aria-current="true"`. Following a link sets `NEXT_LOCALE` (next-intl does this, or set it explicitly in `onClick`). These are real `<a>` links, so crawlers find them too.

- [ ] **Step 1: Implement**, styled to match the existing header utility links (same CSS module tokens). No new visual language.
- [ ] **Step 2: Verify in the browser:** on `/ru/p/<id>?sku=X`, switching to Қазақша goes to `/kk/p/<id>?sku=X` with the variant still selected and the cart unchanged. Reloading `/` afterwards → `/kk`. Keyboard: Tab reaches the switcher, and Enter changes the language. Screenshots of the desktop and mobile menus.
- [ ] **Step 3: Commit** `feat(i18n): language switcher in header, mobile menu and footer`

### Task 6: SEO — alternates, canonical, Open Graph, JSON-LD

**Files:**
- Create: `src/i18n/seo.ts`
- Modify: every `metadata`/`generateMetadata` under `src/app/[lang]/**`, `src/components/seo/JsonLd.tsx`, `src/app/[lang]/layout.tsx` (`metadataBase` from `NEXT_PUBLIC_SITE_URL`)
- Test: `tests/i18n-seo.test.mjs` (pure part in `src/i18n/seo-core.js`)

**Interfaces:**
- Produces:
  - `ROUTE_LOCALES: Record<RouteKey, Locale[]>`, where `RouteKey` = `'home'|'category'|'product'|'blogIndex'|'blogPost'|'compare'|'cart'|'account'|'newsletter'|'garminPay'|'minisite:fenix-8'|'minisite:marq'|'minisite:marq2'|'minisite:why-garmin'|'minisite:garmin-pay'`. Minisites start as `['en']` (OD3).
  - `buildAlternates(input: { path: string; locale: Locale; indexedLocales: Locale[]; canonicalOverride?: string }): { canonical: string; languages: Record<string,string> }`, where `languages` holds the indexed locales plus `'x-default': path` (unprefixed).
  - `isIndexable(locale: Locale, indexedLocales: Locale[]): boolean`. When false, the page sets `robots: { index: false, follow: true }`.
  - For CMS pages (product, blog post), Task 6 passes `ROUTE_LOCALES` as it is. Task 8 replaces it with the computed value: a product or blog post counts as translated for `ru`/`kk` when its `name`/`title` and `description`/`content` are present in `translations[locale]` (`isRecordTranslated` from Task 7).

- [ ] **Step 1: Write failing tests.**
  - `buildAlternates({ path:'/p/x', locale:'ru', indexedLocales:['en','ru','kk'] })` → `canonical: '/ru/p/x'` and `languages` with `en:'/en/p/x'`, `ru:'/ru/p/x'`, `kk:'/kk/p/x'`, `'x-default':'/p/x'`.
  - `canonicalOverride:'https://x/y'` with `locale:'en'` → canonical is the override. The same override with `locale:'kk'` → canonical `'/kk/p/x'` (Review Focus 3).
  - `indexedLocales:['en']`, `locale:'ru'` → `isIndexable` is false and `languages` has only `en` and `x-default`.
- [ ] **Step 2: Run** `node --test tests/i18n-seo.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement**, then wire it into every page's metadata. Add `openGraph.locale` and `alternateLocale`. JSON-LD gets `inLanguage` and the localized `name`/`description`.
- [ ] **Step 4: Run** the tests and the build. With `curl -s localhost:3000/kk/p/<id>`, check that the HTML contains `<link rel="alternate" hreflang="ru"`, `hreflang="x-default"`, and a `rel="canonical"` that points at `/kk/p/<id>`.
- [ ] **Step 5: Commit** `feat(i18n): hreflang alternates, per-locale canonical and OG`

### Task 7: CMS translation overlay — types and resolver

**Files:**
- Modify: `src/lib/cms/types.ts`
- Create: `src/i18n/translate-record.js`, `src/i18n/translate-record.ts`
- Test: `tests/i18n-translate-record.test.mjs`

**Interfaces:**
- Produces:
  - `type Translations<T> = Partial<Record<'ru'|'kk', Partial<T>>>`
  - `ProductTranslatable = Pick<CMSProduct,'name'|'description'|'overviewHtml'|'specs'|'specGroups'|'inTheBox'|'features'|'seoTitle'|'seoDescription'|'priceSuffix'>` plus `optionNames?: Record<optionId,string>`, `valueLabels?: Record<valueId,string>`, `variantTitles?: Record<variantId,string>`, `imageAlts?: Record<imageId,string>`
  - `BlogTranslatable = Pick<CMSBlog,'title'|'excerpt'|'content'|'seoTitle'|'seoDescription'>` (plus category/tag labels, if blog has them)
  - `BannerTranslatable = Pick<Banner,'title'|'subtitle'|'ctaLabel'>`
  - `HomepageTranslatable`: per block, `title`/`subtitle`/`description`/`legal`/CTA label, keyed by block id
  - `SettingsTranslatable = Pick<StoreSettings,'seoTitle'|'seoDescription'>`
  - `translations?: Translations<…>` added (optional) to `CMSProduct`, `CMSBlog`, `Banner`, `HomepageConfig`, `StoreSettings`
  - `localizeRecord<T>(record: T & { translations?: Translations<…> }, locale: Locale, spec: FieldSpec): T`. It returns a copy with the overlay applied: scalars fall back when blank, arrays of objects merge **by index** (each item falls back per field), and the `*Labels`/`*Names`/`*Titles` maps patch the nested options, variants and images by id. It never mutates the input.
  - `localizeProduct`, `localizeBlog`, `localizeBanner`, `localizeHomepage`, `localizeSettings` are thin wrappers around it.
  - `isRecordTranslated(record, locale, requiredFields: string[]): boolean`

- [ ] **Step 1: Write failing tests.**
  - With `locale 'en'`, the record is returned deep-equal and `translations` is stripped from the output.
  - `ru` with `{ name: 'Феникс', description: '  ' }` → `name` is Russian and `description` is the English base (blank falls back).
  - `specs`: the base has 3 rows and the `ru` overlay has 2, with row 1 `{label:'Вес'}` and no value. The output has 3 rows: row 1 label is `Вес` with the base value, and row 3 is English.
  - `valueLabels: { 'o1-v0': 'Самый большой' }` relabels only that option value. Unknown ids are ignored.
  - The input object is not mutated (deep-freeze it in the test).
  - `isRecordTranslated(p,'kk',['name','description'])` is false when `kk.description` is missing.
- [ ] **Step 2: Run** `node --test tests/i18n-translate-record.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `localizeRecord` and the wrappers.
- [ ] **Step 4: Run** the tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(i18n): CMS translation overlay types and field-wise resolver`

### Task 8: Storefront reads localized CMS content

**Files:**
- Modify: `src/lib/cms/store.ts` (add `getProductsFor(locale)`, `getBlogsFor(locale)`, `getBannersFor(locale)`, `getHomepageConfigFor(locale)`, `getSettingsFor(locale)`. Keep the existing un-localized getters unchanged for admin and sitemap), and every public page/component that reads the store: `[lang]/page.tsx`, `p/[id]`, `c/[...slug]`, `blog`, `blog/[slug]`, `compare`, `cart` (cart line names: show the localized product name looked up by id/sku when rendering, but keep the stored order snapshot unchanged)
- Test: extend `tests/i18n-translate-record.test.mjs` with one store-level test using a fixture `data.json`

**Interfaces:**
- Consumes: Task 7 `localize*`.
- Produces: `get*For(locale: Locale)`, which returns localized copies.

- [ ] **Step 1: Write a failing test.** The store reads `tests/fixtures/i18n-data.json` (point the store at the fixture the way the existing store tests do). `getProductsFor('kk')[0].name` returns the Kazakh value, and `getProducts()[0].name` stays English.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** the getters and switch the public readers over to them. In `p/[id]` and `blog/[slug]` `generateMetadata`, compute `indexedLocales` with `isRecordTranslated` (`en` is always included) and pass it to `buildAlternates`/`isIndexable`. Product search, filters and sorting keep matching on the English base and on the localized name.
- [ ] **Step 4: Run** the tests and `npm run check`. In the browser, add a `ru` name to one product by hand in a scratch copy of the data, then check that `/ru/p/<id>` shows it, `/en/p/<id>` doesn't, and `/kk/p/<id>` shows English and is `noindex` (Task 6).
- [ ] **Step 5: Commit** `feat(i18n): storefront reads localized CMS records`

### Task 9: Admin — EN/RU/KK content tabs and save validation

**Files:**
- Create: `src/components/admin/LocaleTabs.tsx`
- Modify: the product editor (`src/components/admin/product-editor/*`), `app/admin/blogs/page.tsx`, `app/admin/banners/page.tsx`, `app/admin/homepage/page.tsx`, `app/admin/seo/page.tsx`, their API routes under `src/app/api/admin/**`, `src/lib/cms/product-input.{js,ts}` (accept and validate `translations`), and the blog/homepage input validators
- Test: `tests/i18n-admin-input.test.mjs`

**Interfaces:**
- Consumes: Task 7 types.
- Produces: `<LocaleTabs value={locale} onChange status={{ ru: 'complete'|'partial'|'empty', kk: … }} />`. Each tab shows a completeness dot. In a RU or KK tab, translatable inputs edit `translations[locale]`, show the English value as placeholder text, and non-translatable fields (price, SKU, stock, images) are read-only with the note "shared across languages". `normalizeTranslations(input: unknown, allowed: readonly string[]): Translations<…>`.

- [ ] **Step 1: Write failing tests** for `normalizeTranslations` and the product input validator:
  - Unknown locale keys (`de`) and unknown fields (`price`) are dropped.
  - `translations.ru.overviewHtml` containing `<img src=x onerror=alert(1)><script>…` comes out sanitized identically to the base field (Review Focus 5). The same holds for blog `content`.
  - Strings are trimmed, and an empty string is stored as missing so it falls back.
  - Every field keeps the same length limits as the base field.
- [ ] **Step 2: Run** `node --test tests/i18n-admin-input.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** validation, then the tabs in each editor. The product preview (existing feature) gets a language selector that renders through `localizeProduct`.
- [ ] **Step 4: Run** the tests and `npm run check`. In the browser, log in to `/admin`, open a product, fill in the KK name and description, save and reload: the values persist, `/kk/p/<id>` shows them, and the page is now indexable.
- [ ] **Step 5: Commit** `feat(i18n): admin translation tabs and validated translation input`

### Task 10: Localized sitemap and robots

**Files:**
- Modify: `src/app/sitemap.ts`, `src/app/robots.ts` (only if it hard-codes paths)
- Test: `tests/i18n-seo.test.mjs` (add a pure `buildSitemapEntries` in `seo-core.js`)

**Interfaces:**
- Consumes: `ROUTE_LOCALES`, `isRecordTranslated`, `buildAlternates`.
- Produces: `buildSitemapEntries(baseUrl, routes: { path; indexedLocales; lastModified; priority; changeFrequency }[]): MetadataRoute.Sitemap`. It writes one entry per indexed locale, each with `alternates.languages` listing the same set plus `x-default`.

- [ ] **Step 1: Write failing tests.** A product translated only in `ru` produces exactly two entries (`/en/p/x`, `/ru/p/x`), each with alternates `{en, ru, x-default}`. A minisite with `['en']` produces one entry. Unpublished or `noIndex` records produce none. Category routes use the real category slugs that `c/[...slug]` serves. Today's sitemap lists `smartwatches`, while the nav uses `wearables-smartwatches`, so derive the slugs from the same source the category page uses.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement**, and replace the hand-written arrays in `sitemap.ts`.
- [ ] **Step 4: Run** the tests. `curl -s localhost:3000/sitemap.xml` shows `xhtml:link rel="alternate" hreflang=` entries. Validate it with a sitemap XML schema check or Google's Rich Results / URL Inspection after deploy (noted in the handoff).
- [ ] **Step 5: Commit** `feat(i18n): per-locale sitemap with hreflang alternates`

### Task 11 (optional, OD3): Minisite copy

**Files:**
- Modify: `src/components/{fenix-8,marq,why-garmin,garmin-pay}/*` (`sections.ts` data → message keys under namespaces `Minisite.fenix8`, …), plus the matching `messages/*.json`
- Test: extend the `tests/i18n-messages.test.mjs` grep allowlist to cover the minisite files

- [ ] **Step 1:** Move each minisite's literals into its namespace in the same way as Task 4, one minisite per commit.
- [ ] **Step 2:** Machine-draft `ru`/`kk` and add them to `REVIEW.md`.
- [ ] **Step 3:** After proofreading, add the locale to `ROUTE_LOCALES['minisite:…']`. That makes the page indexable and adds it to the sitemap.
- [ ] **Step 4:** Run `npm run check` and take screenshots of each minisite in `/kk` at 375 and 1440 px.
- [ ] **Step 5: Commit** `feat(i18n): translate <minisite> copy` (one per minisite)

### Task 12: Record the decision, final checks, handoff

**Files:**
- Modify: `docs/backend/decisions.md` (add D13 = L1–L10 and close O11), this plan's Progress block
- Create: `docs/i18n/HANDOFF.md`, covering the routing rules, how to add a string, how to translate CMS content, the overlay → `*_translations` table mapping for the Postgres importer, and the post-deploy Search Console steps (submit the sitemap, inspect one URL per language)

- [ ] **Step 1:** Run `node --test tests/*.test.mjs` (all suites, including the existing ones) and `npm run check`. Expected: all pass.
- [ ] **Step 2:** Browser walkthrough, for each of `en`/`ru`/`kk`: home → category → product (switch variant) → add to cart → cart → blog post → switch language mid-flow. Check for no console errors, no untranslated interface strings in `ru`/`kk`, no layout breaks at 375/768/1440, and no visual diff on `/en` homepage against the baseline.
- [ ] **Step 3:** Lighthouse SEO and Performance on `/kk` and `/en` homepage. The `/kk` scores must be within 2 points of `/en`, which shows the Cyrillic fonts don't regress LCP.
- [ ] **Step 4: Commit** `docs(i18n): decision D13, handoff, plan complete`

---

## Non-goals

- Translating the admin interface itself (L8).
- Translated URL slugs (L5).
- Automatic machine translation inside the admin panel (a "draft with AI" button can be a later feature).
- Currency or price changes (L9; owned by the backend plan).
- Migrating the overlay into PostgreSQL. The backend plan's importer gets the mapping from `HANDOFF.md`.
- Translating transactional or newsletter email (email is deferred per D09).
