import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALES,
  DEFAULT_LOCALE,
  SWITCHER_ORDER,
  INTL_LOCALE,
  OG_LOCALE,
  LOCALE_LABEL,
  isLocale,
} from '../src/i18n/config.js';
import { negotiateLocale, stripLocale, localizeHref, isExcludedPath } from '../src/i18n/routing.js';

test('config values', () => {
  assert.deepEqual([...LOCALES], ['en', 'ru', 'kk']);
  assert.equal(DEFAULT_LOCALE, 'ru');
  assert.deepEqual(SWITCHER_ORDER, ['kk', 'ru', 'en']);
  assert.deepEqual(INTL_LOCALE, { en: 'en-US', ru: 'ru-RU', kk: 'kk-KZ' });
  assert.deepEqual(OG_LOCALE, { en: 'en_US', ru: 'ru_RU', kk: 'kk_KZ' });
  assert.deepEqual(LOCALE_LABEL, { en: 'English', ru: 'Русский', kk: 'Қазақша' });
  assert.equal(isLocale('kk'), true);
  assert.equal(isLocale('de'), false);
});

test('negotiate: valid cookie wins', () => assert.equal(negotiateLocale({ cookie: 'kk', acceptLanguage: 'en-US' }), 'kk'));
test('negotiate: invalid cookie ignored', () => assert.equal(negotiateLocale({ cookie: 'de', acceptLanguage: 'en' }), 'en'));
test('negotiate: q-weights and region tags', () => assert.equal(negotiateLocale({ acceptLanguage: 'de;q=1, kk-KZ;q=0.9, ru;q=0.8' }), 'kk'));
test('negotiate: equal q keeps header order', () => assert.equal(negotiateLocale({ acceptLanguage: 'en, ru' }), 'en'));
test('negotiate: nothing matches → default', () => assert.equal(negotiateLocale({ acceptLanguage: 'fr' }), DEFAULT_LOCALE));
test('negotiate: empty/garbage header → default', () => {
  assert.equal(negotiateLocale({ acceptLanguage: ';;,' }), DEFAULT_LOCALE);
  assert.equal(negotiateLocale({}), DEFAULT_LOCALE);
});
test('negotiate: q=0 is not acceptable', () => assert.equal(negotiateLocale({ acceptLanguage: 'en;q=0, kk;q=0.1' }), 'kk'));

test('localizeHref keeps query+hash', () => assert.equal(localizeHref('/p/fenix-8?sku=010-1#specs', 'ru'), '/ru/p/fenix-8?sku=010-1#specs'));
test('localizeHref root', () => assert.equal(localizeHref('/', 'kk'), '/kk'));
test('localizeHref root with query', () => assert.equal(localizeHref('/?a=1', 'kk'), '/kk?a=1'));
test('localizeHref swaps existing prefix', () => {
  assert.equal(localizeHref('/en/cart', 'kk'), '/kk/cart');
  assert.equal(localizeHref('/en', 'kk'), '/kk');
});
test('localizeHref leaves external, admin, api, uploads, assets', () => {
  for (const h of ['https://www.garmin.com/c/x/', 'mailto:a@b.c', 'tel:+123', '//cdn.x/y', '#top', '/admin/products', '/api/cart', '/uploads/a.jpg', '/seo/favicon-32x32.png', '/favicon.ico'])
    assert.equal(localizeHref(h, 'ru'), h);
});
test('localizeHref does not treat /administrator as excluded', () => assert.equal(localizeHref('/administrator', 'ru'), '/ru/administrator'));

test('isExcludedPath', () => {
  for (const p of ['/admin', '/admin/x', '/api/a', '/uploads/a', '/_next/static/x', '/robots.txt', '/sitemap.xml', '/seo/a.png', '/homepage/a', '/images/a', '/videos/a', '/favicon.ico', '/a/b/c.js'])
    assert.equal(isExcludedPath(p), true, p);
  for (const p of ['/', '/administrator', '/ru/cart', '/p/fenix-8'])
    assert.equal(isExcludedPath(p), false, p);
});

test('stripLocale', () => assert.deepEqual(stripLocale('/ru/blog/x'), { locale: 'ru', rest: '/blog/x' }));
test('stripLocale bare locale', () => assert.deepEqual(stripLocale('/kk'), { locale: 'kk', rest: '/' }));
test('stripLocale does not match /russia', () => assert.deepEqual(stripLocale('/russia'), { locale: null, rest: '/russia' }));
