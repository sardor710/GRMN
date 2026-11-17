import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_LOCALES, buildAlternates, isIndexable } from '../src/i18n/seo-core.js';

const ALL = ['en', 'ru', 'kk'];

test('buildAlternates: ru product page', () => {
  const a = buildAlternates({ path: '/p/x', locale: 'ru', indexedLocales: ALL });
  assert.equal(a.canonical, '/ru/p/x');
  assert.deepEqual(a.languages, { en: '/en/p/x', ru: '/ru/p/x', kk: '/kk/p/x', 'x-default': '/p/x' });
});

test('buildAlternates: canonicalOverride applies to en only', () => {
  const en = buildAlternates({ path: '/p/x', locale: 'en', indexedLocales: ALL, canonicalOverride: 'https://x/y' });
  assert.equal(en.canonical, 'https://x/y');
  const kk = buildAlternates({ path: '/p/x', locale: 'kk', indexedLocales: ALL, canonicalOverride: 'https://x/y' });
  assert.equal(kk.canonical, '/kk/p/x');
});

test('buildAlternates: en-only page excludes ru/kk from languages', () => {
  const a = buildAlternates({ path: '/p/x', locale: 'ru', indexedLocales: ['en'] });
  assert.deepEqual(a.languages, { en: '/en/p/x', 'x-default': '/p/x' });
  assert.equal(isIndexable('ru', ['en']), false);
  assert.equal(isIndexable('en', ['en']), true);
});

test('buildAlternates: home uses bare locale paths and "/" x-default', () => {
  const a = buildAlternates({ path: '/', locale: 'kk', indexedLocales: ALL });
  assert.equal(a.canonical, '/kk');
  assert.deepEqual(a.languages, { en: '/en', ru: '/ru', kk: '/kk', 'x-default': '/' });
});

test('buildAlternates: languages follow LOCALES order regardless of input order', () => {
  const a = buildAlternates({ path: '/blog', locale: 'en', indexedLocales: ['kk', 'en'] });
  assert.deepEqual(Object.keys(a.languages), ['en', 'kk', 'x-default']);
});

test('ROUTE_LOCALES table', () => {
  for (const key of ['home', 'category', 'product', 'blogIndex', 'blogPost', 'compare', 'cart', 'account', 'newsletter']) {
    assert.deepEqual(ROUTE_LOCALES[key], ALL, key);
  }
  for (const key of ['garminPay', 'minisite:fenix-8', 'minisite:marq', 'minisite:marq2', 'minisite:why-garmin', 'minisite:garmin-pay']) {
    assert.deepEqual(ROUTE_LOCALES[key], ['en'], key);
  }
});

import { absoluteUrl, localizedUrl } from '../src/i18n/seo-core.js';

test('absoluteUrl / localizedUrl use the given site origin', () => {
  assert.equal(absoluteUrl('/images/a.jpg', 'https://h.test'), 'https://h.test/images/a.jpg');
  assert.equal(absoluteUrl('https://cdn/x.jpg', 'https://h.test'), 'https://cdn/x.jpg');
  assert.equal(localizedUrl('/p/x', 'kk', 'https://h.test'), 'https://h.test/kk/p/x');
  assert.equal(localizedUrl('/', 'ru', 'https://h.test'), 'https://h.test/ru');
});

import { buildSitemapEntries } from '../src/i18n/seo-core.js';

const NOW = new Date('2026-01-01T00:00:00Z');
const route = (path, indexedLocales) => ({ path, indexedLocales, lastModified: NOW, priority: 0.5, changeFrequency: 'weekly' });

test('buildSitemapEntries: product translated in ru only yields en + ru entries with matching alternates', () => {
  const entries = buildSitemapEntries('https://x.test', [route('/p/x', ['en', 'ru'])]);
  assert.deepEqual(entries.map((e) => e.url), ['https://x.test/en/p/x', 'https://x.test/ru/p/x']);
  for (const e of entries) {
    assert.deepEqual(e.alternates.languages, {
      en: 'https://x.test/en/p/x',
      ru: 'https://x.test/ru/p/x',
      'x-default': 'https://x.test/p/x',
    });
    assert.equal(e.priority, 0.5);
    assert.equal(e.changeFrequency, 'weekly');
    assert.equal(e.lastModified, NOW);
  }
});

test('buildSitemapEntries: en-only route yields one entry; home has no trailing path', () => {
  assert.equal(buildSitemapEntries('https://x.test', [route('/minisite/marq', ['en'])]).length, 1);
  const home = buildSitemapEntries('https://x.test', [route('/', ['en', 'ru', 'kk'])]);
  assert.deepEqual(home.map((e) => e.url), ['https://x.test/en', 'https://x.test/ru', 'https://x.test/kk']);
  assert.equal(home[0].alternates.languages['x-default'], 'https://x.test');
});

test('buildSitemapEntries: routes without indexed locales produce nothing', () => {
  assert.deepEqual(buildSitemapEntries('https://x.test', [route('/p/x', [])]), []);
});
