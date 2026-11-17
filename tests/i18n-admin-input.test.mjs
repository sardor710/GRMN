import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTranslations,
  mergeTranslations,
  translationStatus,
  fieldLimit,
} from '../src/lib/cms/translation-input.js';
import { sanitizeProductInput } from '../src/lib/cms/product-input.js';
import {
  sanitizeBlogInput,
  sanitizeBannerInput,
  sanitizeSettingsInput,
  sanitizeHomepageInput,
  sanitizeBlogContent,
} from '../src/lib/cms/content-input.js';
import { PRODUCT_SPEC, BLOG_SPEC, HOMEPAGE_SPEC } from '../src/i18n/translate-record.js';

const XSS = '<img src=x onerror=alert(1)><script>alert(1)</script><p onclick="x()">Hi</p>';

test('unknown locale keys (de, en) and unknown fields (price) are dropped', () => {
  const out = normalizeTranslations(
    { de: { name: 'Uhr' }, en: { name: 'Watch' }, ru: { name: 'Часы', price: 1, sku: 'X' }, kk: { stock: 3 } },
    PRODUCT_SPEC,
  );
  assert.deepEqual(out, { ru: { name: 'Часы' } });
});

test('allowed may be a plain list of scalar field names', () => {
  const out = normalizeTranslations({ ru: { title: ' A ', price: 2 }, kk: { title: 'B' } }, ['title']);
  assert.deepEqual(out, { ru: { title: 'A' }, kk: { title: 'B' } });
});

test('strings are trimmed and an empty string is stored as missing (falls back)', () => {
  const out = normalizeTranslations(
    { ru: { name: '   ', description: '  Описание  ', seoTitle: '' }, kk: { name: '' } },
    PRODUCT_SPEC,
  );
  assert.deepEqual(out, { ru: { description: 'Описание' } });
});

test('non-object input and non-string values are dropped', () => {
  assert.deepEqual(normalizeTranslations('x', PRODUCT_SPEC), {});
  assert.deepEqual(normalizeTranslations(null, PRODUCT_SPEC), {});
  assert.deepEqual(normalizeTranslations([{ name: 'a' }], PRODUCT_SPEC), {});
  assert.deepEqual(normalizeTranslations({ ru: { name: 5, description: ['a'] } }, PRODUCT_SPEC), {});
});

test('lists keep index positions, drop unknown nested fields and trailing empties', () => {
  const out = normalizeTranslations(
    {
      ru: {
        specs: [{ label: ' ', value: 'v', extra: 'x' }, {}, { label: 'L' }, { label: '' }],
        inTheBox: ['', ' Кабель ', ''],
        specGroups: [{ title: 'Общее', items: [{ label: '', value: '' }, { value: 'Да' }] }],
      },
    },
    PRODUCT_SPEC,
  );
  assert.deepEqual(out, {
    ru: {
      specs: [{ value: 'v' }, {}, { label: 'L' }],
      inTheBox: ['', 'Кабель'],
      specGroups: [{ title: 'Общее', items: [{}, { value: 'Да' }] }],
    },
  });
});

test('id maps and keyed overlays reject prototype keys and keep valid ids', () => {
  const input = JSON.parse(
    '{"kk":{"optionNames":{"__proto__":{"x":1},"opt-a":" Түсі ","constructor":"z"},"valueLabels":{"v 1":"bad id","v-1":""}}}',
  );
  const out = normalizeTranslations(input, PRODUCT_SPEC);
  assert.deepEqual(out, { kk: { optionNames: { 'opt-a': 'Түсі' } } });
  assert.equal({}.x, undefined);

  const home = normalizeTranslations(
    { ru: { carousels: { 'carousel-1': { title: 'Т', items: { 'prod-1': { badge: ' Скидка ', price: '$1' } } } }, heroBanners: { b1: { href: 'x' } } } },
    HOMEPAGE_SPEC,
  );
  assert.deepEqual(home, { ru: { carousels: { 'carousel-1': { title: 'Т', items: { 'prod-1': { badge: 'Скидка' } } } } } });
});

test('translations.ru.overviewHtml is sanitized identically to the base field', () => {
  const res = sanitizeProductInput({ name: 'x', price: 1, overviewHtml: XSS, translations: { ru: { overviewHtml: XSS } } });
  assert.equal(res.ok, true);
  assert.equal(res.product.overviewHtml, '<p>Hi</p>');
  assert.equal(res.product.translations.ru.overviewHtml, res.product.overviewHtml);
  assert.doesNotMatch(JSON.stringify(res.product.translations), /onerror|script|onclick/);
});

test('blog content translations go through the same function as the base field', () => {
  const body = 'Keep HR <zone 2> today\u0000';
  const res = sanitizeBlogInput({ title: 'T', content: body, translations: { kk: { content: body } } });
  assert.equal(res.ok, true);
  assert.equal(res.blog.content, sanitizeBlogContent(body));
  assert.equal(res.blog.translations.kk.content, res.blog.content);
  assert.equal(res.blog.content, 'Keep HR <zone 2> today');
});

test('R14: blog content cleaning is lossless (rendered as React text, never HTML)', () => {
  for (const text of [
    'Use x<y',
    'Keep HR <zone 2> today',
    'see <https://garmin.com>',
    '<!-- note --> text',
    'a &amp; b',
    '&lt;b&gt; stays',
    'Tom & Jerry <b>bold</b> > 3',
    'line 1\n\tline 2\r\n',
    XSS,
  ]) {
    const once = sanitizeBlogContent(text);
    assert.equal(once, text.trim(), text);
    assert.equal(sanitizeBlogContent(once), once, `idempotent: ${text}`);
  }
  assert.equal(sanitizeBlogContent('  a\u0000b\u0007c\u001Fd\u007Fe\u000Bf\u000Cg  '), 'abcdefg');
  assert.equal(sanitizeBlogContent('keep\n\r\twhitespace'), 'keep\n\r\twhitespace');
  assert.equal(sanitizeBlogContent(undefined), '');
});

test('every translated field keeps the same length limit as its base field', () => {
  for (const field of PRODUCT_SPEC.scalars) {
    const limit = fieldLimit(field);
    assert.ok(limit > 0, field);
    const ok = 'a'.repeat(limit);
    const tooLong = 'a'.repeat(limit + 1);
    const asHtml = (s) => (field === 'overviewHtml' ? s : s);
    assert.equal(sanitizeProductInput({ name: 'x', price: 1, [field]: asHtml(ok) }).ok, true, `base ${field} at limit`);
    assert.equal(sanitizeProductInput({ name: 'x', price: 1, [field]: tooLong }).ok, false, `base ${field} over limit`);
    assert.equal(
      sanitizeProductInput({ name: 'x', price: 1, translations: { ru: { [field]: ok } } }).ok,
      true,
      `ru ${field} at limit`,
    );
    const bad = sanitizeProductInput({ name: 'x', price: 1, translations: { kk: { [field]: tooLong } } });
    assert.equal(bad.ok, false, `kk ${field} over limit`);
    assert.match(bad.error, new RegExp(field));
  }
  for (const field of BLOG_SPEC.scalars) {
    const limit = fieldLimit(field);
    const base = { title: 'T', content: 'C', [field]: 'a'.repeat(limit + 1) };
    assert.equal(sanitizeBlogInput(base).ok, false, `blog base ${field}`);
    assert.equal(
      sanitizeBlogInput({ title: 'T', content: 'C', translations: { ru: { [field]: 'a'.repeat(limit + 1) } } }).ok,
      false,
      `blog ru ${field}`,
    );
    assert.equal(
      sanitizeBlogInput({ title: 'T', content: 'C', translations: { ru: { [field]: 'a'.repeat(limit) } } }).ok,
      true,
      `blog ru ${field} at limit`,
    );
  }
  // nested: spec rows and id maps use the base field's limit too
  const label = 'a'.repeat(fieldLimit('label') + 1);
  assert.equal(sanitizeProductInput({ name: 'x', price: 1, specs: [{ label, value: 'v' }] }).ok, false);
  assert.equal(sanitizeProductInput({ name: 'x', price: 1, translations: { ru: { specs: [{ label }] } } }).ok, false);
  const optName = 'a'.repeat(fieldLimit('optionNames') + 1);
  assert.equal(fieldLimit('optionNames'), fieldLimit('name'));
  assert.equal(
    sanitizeProductInput({ name: 'x', price: 1, options: [{ id: 'o', key: 'c', name: optName, display: 'buttons', values: [] }] }).ok,
    false,
  );
  assert.equal(sanitizeProductInput({ name: 'x', price: 1, translations: { ru: { optionNames: { o: optName } } } }).ok, false);
});

test('saving merges per locale: other locale preserved, sent-empty locale cleared, absent translations untouched', () => {
  const existing = { id: 'p1', name: 'W', translations: { ru: { name: 'Ч' }, kk: { name: 'С' } } };
  const onlyKk = sanitizeProductInput({ id: 'p1', name: 'W', price: 1, translations: { kk: { name: ' Жаңа ' } } }, existing);
  assert.deepEqual(onlyKk.product.translations, { ru: { name: 'Ч' }, kk: { name: 'Жаңа' } });

  const clearKk = sanitizeProductInput({ id: 'p1', name: 'W', price: 1, translations: { kk: { name: '' } } }, existing);
  assert.deepEqual(clearKk.product.translations, { ru: { name: 'Ч' } });

  const none = sanitizeProductInput({ id: 'p1', name: 'W', price: 1 }, existing);
  assert.equal('translations' in none.product, false);

  assert.deepEqual(mergeTranslations({ ru: { title: 'a' } }, { de: {}, kk: { title: 'b' } }, ['title']), {
    ru: { title: 'a' },
    kk: { title: 'b' },
  });
});

test('translations must be an object when sent', () => {
  const res = sanitizeProductInput({ name: 'x', price: 1, translations: 'ru' });
  assert.equal(res.ok, false);
  assert.match(res.error, /translations/);
});

test('banner, settings and homepage validators normalize translations and preserve the other locale', () => {
  const banner = sanitizeBannerInput(
    { title: 'Sale', translations: { ru: { title: ' Распродажа ', ctaUrl: 'https://evil' } } },
    { translations: { kk: { title: 'Жеңілдік' } } },
  );
  assert.equal(banner.ok, true);
  assert.deepEqual(banner.banner.translations, { ru: { title: 'Распродажа' }, kk: { title: 'Жеңілдік' } });

  const settings = sanitizeSettingsInput({ seoTitle: 'G', translations: { kk: { seoTitle: 'Г', storeName: 'x' } } }, {});
  assert.equal(settings.ok, true);
  assert.deepEqual(settings.settings.translations, { kk: { seoTitle: 'Г' } });

  const existingHome = { heroBanners: [], carousels: [], translations: { ru: { heroBanners: { b1: { title: 'Р' } } } } };
  const keep = sanitizeHomepageInput({ heroBanners: [], carousels: [] }, existingHome);
  assert.equal(keep.ok, true);
  assert.deepEqual(keep.config.translations, existingHome.translations);
  const kkOnly = sanitizeHomepageInput(
    { heroBanners: [], carousels: [], translations: { kk: { heroBanners: { b1: { title: ' Қ ' } } } } },
    existingHome,
  );
  assert.deepEqual(kkOnly.config.translations, { ru: { heroBanners: { b1: { title: 'Р' } } }, kk: { heroBanners: { b1: { title: 'Қ' } } } });
  const tooLong = sanitizeHomepageInput(
    { heroBanners: [], carousels: [], translations: { kk: { heroBanners: { b1: { subtitle: 'a'.repeat(fieldLimit('subtitle') + 1) } } } } },
    existingHome,
  );
  assert.equal(tooLong.ok, false);
});

test('translationStatus: complete / partial / empty', () => {
  const required = ['name', 'description'];
  const base = { name: 'W', description: 'D', seoTitle: 'S' };
  assert.equal(translationStatus({ ...base }, 'ru', PRODUCT_SPEC, required), 'empty');
  assert.equal(translationStatus({ ...base, translations: { ru: { seoTitle: 'x' } } }, 'ru', PRODUCT_SPEC, required), 'partial');
  assert.equal(
    translationStatus({ ...base, translations: { ru: { name: 'a', description: 'b' } } }, 'ru', PRODUCT_SPEC, required),
    'complete',
  );
  // without required fields: every present base field must be translated
  const banner = { title: 'T', subtitle: 'S', ctaLabel: '', translations: { kk: { title: 'a' } } };
  assert.equal(translationStatus(banner, 'kk', ['title', 'subtitle', 'ctaLabel']), 'partial');
  banner.translations.kk.subtitle = 'b';
  assert.equal(translationStatus(banner, 'kk', ['title', 'subtitle', 'ctaLabel']), 'complete');
  const home = { heroBanners: [{ id: 'b1', title: 'H', subtitle: 'S' }], translations: { ru: { heroBanners: { b1: { title: 'Х' } } } } };
  assert.equal(translationStatus(home, 'ru', HOMEPAGE_SPEC), 'partial');
  assert.equal(translationStatus(home, 'kk', HOMEPAGE_SPEC), 'empty');
});

test('editor overlay helper writes one path immutably and keeps the other locale', async () => {
  const { setOverlayValue, getOverlayString } = await import('../src/lib/cms/translation-edit.ts');
  const before = { kk: { name: 'A' } };
  let t = setOverlayValue(before, 'ru', ['specs', 2, 'label'], 'L');
  t = setOverlayValue(t, 'ru', ['inTheBox', 1], 'X');
  t = setOverlayValue(t, 'ru', ['optionNames', 'opt-a'], 'N');
  assert.deepEqual(t, { kk: { name: 'A' }, ru: { specs: [{}, {}, { label: 'L' }], inTheBox: ['', 'X'], optionNames: { 'opt-a': 'N' } } });
  assert.deepEqual(before, { kk: { name: 'A' } });
  assert.equal(getOverlayString(t, 'ru', ['specs', 2, 'label']), 'L');
  assert.equal(getOverlayString(t, 'ru', ['specs', 9, 'label']), '');
  // what the editor sends round-trips through the server normalizer
  assert.deepEqual(normalizeTranslations(t, PRODUCT_SPEC), t);
});
