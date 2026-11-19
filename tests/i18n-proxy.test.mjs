import test from 'node:test';
import assert from 'node:assert/strict';
import { cmsRedirectLookupPaths, decideLocaleRedirect, localizeCmsRedirectTarget } from '../src/i18n/routing.js';

test('redirect: root uses Accept-Language when no cookie', () =>
  assert.equal(decideLocaleRedirect('/', '', undefined, 'kk'), '/kk'));
test('redirect: cookie wins and query is kept', () =>
  assert.equal(decideLocaleRedirect('/p/fenix-8', '?sku=1', 'ru', 'en'), '/ru/p/fenix-8?sku=1'));
test('redirect: nothing known → default locale', () =>
  assert.equal(decideLocaleRedirect('/cart', '', undefined, undefined), '/ru/cart'));
test('redirect: invalid cookie ignored', () =>
  assert.equal(decideLocaleRedirect('/blog', '', 'de', 'en-US,en;q=0.9'), '/en/blog'));
test('redirect: already prefixed → null (prefix beats cookie)', () => {
  assert.equal(decideLocaleRedirect('/ru/cart', '', 'en', 'en'), null);
  assert.equal(decideLocaleRedirect('/kk', '', 'en', 'en'), null);
});
test('redirect: excluded paths → null', () => {
  for (const p of ['/admin', '/admin/products', '/api/x', '/uploads/a.jpg', '/media/products/a', '/fonts/x', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/_next/static/x.js'])
    assert.equal(decideLocaleRedirect(p, '', 'en', 'en'), null, p);
});
test('redirect: unknown first segment is treated as unprefixed', () =>
  assert.equal(decideLocaleRedirect('/de/p/x', '', 'en', undefined), '/en/de/p/x'));

// The proxy matcher is a static string in src/proxy.ts; compile it the way Next does. Task 23 G1: the
// proxy also runs for /api and /admin (the maintenance freeze gates them); the locale and CMS redirect
// logic skips those paths through NOT_LOCALIZED instead of the matcher.
test('proxy matcher: runs for public, api and admin paths, skips static assets', async () => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp');
  const source = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  const sources = [...source.matchAll(/^\s*"(\/\(.*\))",\s*$/gm)].map((m) => m[1]);
  assert.equal(sources.length, 1);
  const re = pathToRegexp(sources[0], [], { delimiter: '/', sensitive: false, strict: true });
  for (const p of ['/', '/en', '/p/1228429', '/de/p/x', '/administrator', '/kk/blog/a', '/apiary', '/account', '/kk/account', '/mediaplayer', '/admin', '/admin/x', '/api/x'])
    assert.equal(re.test(p), true, p);
  for (const p of ['/_next/static/a.js', '/robots.txt', '/seo/x', '/homepage/x', '/images/a', '/videos/a', '/fonts/x', '/favicon.ico'])
    assert.equal(re.test(p), false, p);
});

test('proxy NOT_LOCALIZED: locale and CMS redirects skip admin, api, uploads, media and files', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  const literal = source.match(/const NOT_LOCALIZED = \/(.*)\/;$/m)[1];
  const re = new RegExp(literal);
  for (const p of ['/admin', '/admin/x', '/api/x', '/uploads/a.png', '/_next/static/a.js', '/robots.txt', '/sitemap.xml', '/seo/x', '/homepage/x', '/images/a', '/videos/a', '/media/products/abc', '/fonts/x', '/a/b/c.js'])
    assert.equal(re.test(p), true, p);
  for (const p of ['/', '/en', '/p/1228429', '/administrator', '/kk/blog/a', '/apiary', '/account', '/kk/account', '/mediaplayer'])
    assert.equal(re.test(p), false, p);
});

test('locale redirect headers: vary on Cookie + Accept-Language and are never cached publicly', async () => {
  const { LOCALE_REDIRECT_HEADERS } = await import('../src/i18n/routing.js');
  assert.deepEqual({ ...LOCALE_REDIRECT_HEADERS }, { Vary: 'Cookie, Accept-Language', 'Cache-Control': 'private, no-store' });
});

test('account: unprefixed /account still gets the locale redirect', () =>
  assert.equal(decideLocaleRedirect('/account', '?tab=orders', undefined, 'kk'), '/kk/account?tab=orders'));

test('cms redirect lookup: stripped path first, then as-is; excluded and account paths skipped', () => {
  assert.deepEqual(cmsRedirectLookupPaths('/old-watch'), ['/old-watch']);
  assert.deepEqual(cmsRedirectLookupPaths('/ru/old-watch'), ['/old-watch', '/ru/old-watch']);
  assert.deepEqual(cmsRedirectLookupPaths('/kk'), ['/', '/kk']);
  assert.deepEqual(cmsRedirectLookupPaths('/de/x'), ['/de/x']);
  for (const p of ['/account', '/account/orders', '/ru/account', '/kk/account/x', '/admin/x', '/api/x', '/media/a', '/fonts/a', '/a.png'])
    assert.deepEqual(cmsRedirectLookupPaths(p), [], p);
  assert.deepEqual(cmsRedirectLookupPaths('/accounts'), ['/accounts']);
});

test('cms redirect target: prefixed requests keep their locale on internal targets', () => {
  assert.equal(localizeCmsRedirectTarget('/p/new', '/kk/p/old'), '/kk/p/new');
  assert.equal(localizeCmsRedirectTarget('/', '/ru/old'), '/ru');
  assert.equal(localizeCmsRedirectTarget('/p/new?x=1#a', '/en/p/old'), '/en/p/new?x=1#a');
  // A target that names a locale, an excluded target and an external one stay as authored.
  assert.equal(localizeCmsRedirectTarget('/en/p/new', '/kk/p/old'), '/en/p/new');
  assert.equal(localizeCmsRedirectTarget('/media/a/b', '/kk/old'), '/media/a/b');
  assert.equal(localizeCmsRedirectTarget('/api/x', '/kk/old'), '/api/x');
  assert.equal(localizeCmsRedirectTarget('//evil.example/x', '/kk/old'), '//evil.example/x');
  assert.equal(localizeCmsRedirectTarget('https://example.com/x', '/kk/old'), 'https://example.com/x');
  // Unprefixed requests get the target as authored; the locale redirect follows on the next hop.
  assert.equal(localizeCmsRedirectTarget('/p/new', '/p/old'), '/p/new');
});
