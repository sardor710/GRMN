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
