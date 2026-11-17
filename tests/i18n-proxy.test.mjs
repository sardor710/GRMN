import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLocaleRedirect } from '../src/i18n/routing.js';

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
  for (const p of ['/admin', '/admin/products', '/api/x', '/uploads/a.jpg', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/_next/static/x.js'])
    assert.equal(decideLocaleRedirect(p, '', 'en', 'en'), null, p);
});
test('redirect: unknown first segment is treated as unprefixed', () =>
  assert.equal(decideLocaleRedirect('/de/p/x', '', 'en', undefined), '/en/de/p/x'));

// The proxy matcher is a static string in src/proxy.ts; compile it the way Next does.
test('proxy matcher: runs for public paths, skips excluded ones', async () => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp');
  const source = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  const sources = [...source.matchAll(/^\s*"(\/\(.*\))",\s*$/gm)].map((m) => m[1]);
  assert.equal(sources.length, 1);
  const re = pathToRegexp(sources[0], [], { delimiter: '/', sensitive: false, strict: true });
  for (const p of ['/', '/en', '/p/1228429', '/de/p/x', '/administrator', '/kk/blog/a', '/apiary'])
    assert.equal(re.test(p), true, p);
  for (const p of ['/admin', '/admin/x', '/api/x', '/uploads/a.png', '/_next/static/a.js', '/robots.txt', '/sitemap.xml', '/seo/x', '/homepage/x', '/images/a', '/videos/a', '/favicon.ico', '/a/b/c.js'])
    assert.equal(re.test(p), false, p);
});

test('locale redirect headers: vary on Cookie + Accept-Language and are never cached publicly', async () => {
  const { LOCALE_REDIRECT_HEADERS } = await import('../src/i18n/routing.js');
  assert.deepEqual({ ...LOCALE_REDIRECT_HEADERS }, { Vary: 'Cookie, Accept-Language', 'Cache-Control': 'private, no-store' });
});
