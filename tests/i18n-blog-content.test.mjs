import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitParagraphs, resolveArticleContent, localizeBlogCard } from '../src/i18n/blog-content.js';
import { formatDate } from '../src/i18n/format.js';

const STATIC_BODY = ['Static lead.', 'Static para.'];
const STATIC_CATEGORIES = ['Outdoor'];
const raw = {
  slug: 'outdoor-maps-plus',
  title: 'What is Outdoor Maps+?',
  excerpt: 'English excerpt',
  content: 'English body',
  category: 'outdoor',
  translations: {
    ru: { title: 'Что такое Outdoor Maps+?', content: 'Первый абзац.\n\nВторой абзац.\nТретий.', category: 'Туризм' },
    kk: { title: 'Outdoor Maps+ дегеніміз не?' },
  },
};

test('splitParagraphs: splits on blank lines and newlines, trims, drops blanks', () => {
  assert.deepEqual(splitParagraphs('A.\n\nB.\r\nC.\n  \n D. '), ['A.', 'B.', 'C.', 'D.']);
  assert.deepEqual(splitParagraphs('   '), []);
  assert.deepEqual(splitParagraphs(undefined), []);
});

test('resolveArticleContent: en always uses the static article body', () => {
  const r = resolveArticleContent({ locale: 'en', rawBlog: raw, staticBody: STATIC_BODY, staticCategories: STATIC_CATEGORIES });
  assert.equal(r.source, 'static');
  assert.deepEqual(r.body, STATIC_BODY);
  assert.deepEqual(r.categories, STATIC_CATEGORIES);
});

test('resolveArticleContent: ru with translated content renders localized CMS content + category', () => {
  const r = resolveArticleContent({ locale: 'ru', rawBlog: raw, staticBody: STATIC_BODY, staticCategories: STATIC_CATEGORIES });
  assert.equal(r.source, 'cms');
  assert.deepEqual(r.body, ['Первый абзац.', 'Второй абзац.', 'Третий.']);
  assert.deepEqual(r.categories, ['Туризм']);
});

test('resolveArticleContent: translated content without translated category keeps static categories', () => {
  const r2 = structuredClone(raw);
  delete r2.translations.ru.category;
  const r = resolveArticleContent({ locale: 'ru', rawBlog: r2, staticBody: STATIC_BODY, staticCategories: STATIC_CATEGORIES });
  assert.equal(r.source, 'cms');
  assert.deepEqual(r.categories, STATIC_CATEGORIES);
});

test('resolveArticleContent: kk without translated content keeps the static body', () => {
  const r = resolveArticleContent({ locale: 'kk', rawBlog: raw, staticBody: STATIC_BODY, staticCategories: STATIC_CATEGORIES });
  assert.equal(r.source, 'static');
  assert.deepEqual(r.body, STATIC_BODY);
  assert.deepEqual(r.categories, STATIC_CATEGORIES);
});

test('resolveArticleContent: blank translated content is not translated', () => {
  const r2 = structuredClone(raw);
  r2.translations.ru.content = '   ';
  const r = resolveArticleContent({ locale: 'ru', rawBlog: r2, staticBody: STATIC_BODY, staticCategories: STATIC_CATEGORIES });
  assert.equal(r.source, 'static');
});

test('resolveArticleContent: CMS-only post (no static body) renders the CMS content in every locale', () => {
  const r = resolveArticleContent({ locale: 'en', rawBlog: raw, staticBody: undefined, staticCategories: undefined });
  assert.equal(r.source, 'cms');
  assert.deepEqual(r.body, ['English body']);
  assert.deepEqual(r.categories, ['outdoor']);
  const ru = resolveArticleContent({ locale: 'ru', rawBlog: raw, staticBody: undefined, staticCategories: undefined });
  assert.deepEqual(ru.body, ['Первый абзац.', 'Второй абзац.', 'Третий.']);
  assert.deepEqual(ru.categories, ['Туризм']);
});

test('localizeBlogCard: en keeps static values; ru/kk use translated CMS fields, else static', () => {
  const post = { slug: 'outdoor-maps-plus', title: 'Static title', excerpt: 'Static excerpt', categories: ['Outdoor'] };
  assert.deepEqual(localizeBlogCard(post, raw, 'en'), { title: 'Static title', excerpt: 'Static excerpt', categories: ['Outdoor'] });
  assert.deepEqual(localizeBlogCard(post, raw, 'ru'), { title: 'Что такое Outdoor Maps+?', excerpt: 'Static excerpt', categories: ['Туризм'] });
  assert.deepEqual(localizeBlogCard(post, raw, 'kk'), { title: 'Outdoor Maps+ дегеніміз не?', excerpt: 'Static excerpt', categories: ['Outdoor'] });
  assert.deepEqual(localizeBlogCard(post, undefined, 'ru'), { title: 'Static title', excerpt: 'Static excerpt', categories: ['Outdoor'] });
});

test('lib/blog: every post isoDate formats (en, long) to exactly its English date string', () => {
  const src = readFileSync(new URL('../src/lib/blog.ts', import.meta.url), 'utf8');
  const pairs = [...src.matchAll(/date: "([^"]+)",\s*isoDate: "([^"]+)"/g)];
  const posts = [...src.matchAll(/^\s*slug: "/gm)].length;
  assert.equal(pairs.length, posts, 'every post has date + isoDate');
  for (const [, date, iso] of pairs) {
    assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(formatDate(iso, 'en', 'long'), date);
  }
});
