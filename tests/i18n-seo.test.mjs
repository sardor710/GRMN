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
