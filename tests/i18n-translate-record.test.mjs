import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localizeRecord,
  localizeList,
  isRecordTranslated,
  PRODUCT_SPEC,
  BLOG_SPEC,
  BANNER_SPEC,
  HOMEPAGE_SPEC,
  SETTINGS_SPEC,
  localizeProduct,
  localizeBlog,
  localizeBanner,
  localizeHomepage,
  localizeSettings,
} from '../src/i18n/translate-record.js';

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}

const makeProduct = (translations) => ({
  id: 'p1',
  name: 'Phoenix',
  description: 'English description',
  price: 100,
  specs: [
    { label: 'Weight', value: '50 g' },
    { label: 'Display', value: '1.3 in' },
    { label: 'Battery', value: '14 days' },
  ],
  inTheBox: ['Watch', 'Cable'],
  options: [
    {
      id: 'o1',
      name: 'Size',
      values: [
        { id: 'o1-v0', label: 'Large' },
        { id: 'o1-v1', label: 'Small' },
      ],
    },
  ],
  variants: [{ id: 'var1', title: 'Large / Black' }],
  images: [{ id: 'img1', src: '/a.jpg', alt: 'Front view' }],
  translations,
});

test('en: deep-equal copy with translations stripped', () => {
  const p = deepFreeze(makeProduct({ ru: { name: 'Феникс' } }));
  const out = localizeRecord(p, 'en', PRODUCT_SPEC);
  const rest = { ...p };
  delete rest.translations;
  assert.deepEqual(out, rest);
  assert.equal('translations' in out, false);
  assert.notEqual(out.specs, p.specs);
});

test('ru: scalar override and blank falls back', () => {
  const p = deepFreeze(makeProduct({ ru: { name: 'Феникс', description: '  ' } }));
  const out = localizeRecord(p, 'ru', PRODUCT_SPEC);
  assert.equal(out.name, 'Феникс');
  assert.equal(out.description, 'English description');
  assert.equal('translations' in out, false);
});

test('missing locale overlay returns base values', () => {
  const p = deepFreeze(makeProduct({ ru: { name: 'Феникс' } }));
  const out = localizeRecord(p, 'kk', PRODUCT_SPEC);
  assert.equal(out.name, 'Phoenix');
});

test('specs merge by index with per-field fallback', () => {
  const p = deepFreeze(makeProduct({ ru: { specs: [{ label: 'Вес' }] } }));
  const out = localizeRecord(p, 'ru', PRODUCT_SPEC);
  assert.equal(out.specs.length, 3);
  assert.deepEqual(out.specs[0], { label: 'Вес', value: '50 g' });
  assert.deepEqual(out.specs[2], { label: 'Battery', value: '14 days' });
});

test('extra overlay rows beyond base are ignored', () => {
  const p = deepFreeze(
    makeProduct({
      ru: { specs: [{}, {}, {}, { label: 'Лишнее', value: 'x' }], inTheBox: ['Часы', '', 'Лишнее'] },
    }),
  );
  const out = localizeRecord(p, 'ru', PRODUCT_SPEC);
  assert.equal(out.specs.length, 3);
  assert.deepEqual(out.inTheBox, ['Часы', 'Cable']);
});

test('id maps patch options, values, variants and images; unknown ids ignored', () => {
  const p = deepFreeze(
    makeProduct({
      ru: {
        optionNames: { o1: 'Размер', nope: 'X' },
        valueLabels: { 'o1-v0': 'Самый большой', zzz: 'Y', 'o1-v1': ' ' },
        variantTitles: { var1: 'Большой / Чёрный' },
        imageAlts: { img1: 'Вид спереди' },
      },
    }),
  );
  const out = localizeRecord(p, 'ru', PRODUCT_SPEC);
  assert.equal(out.options[0].name, 'Размер');
  assert.equal(out.options[0].values[0].label, 'Самый большой');
  assert.equal(out.options[0].values[1].label, 'Small');
  assert.equal(out.variants[0].title, 'Большой / Чёрный');
  assert.equal(out.images[0].alt, 'Вид спереди');
  assert.equal('optionNames' in out, false);
  assert.equal(out.options.length, 1);
});

test('does not mutate input', () => {
  const p = deepFreeze(
    makeProduct({ ru: { name: 'Феникс', specs: [{ label: 'Вес' }], valueLabels: { 'o1-v0': 'Z' } } }),
  );
  assert.doesNotThrow(() => localizeProduct(p, 'ru'));
  assert.equal(p.name, 'Phoenix');
  assert.equal(p.options[0].values[0].label, 'Large');
});

test('isRecordTranslated', () => {
  const p = makeProduct({ kk: { name: 'Феникс', description: '' }, ru: { name: 'A', description: 'B' } });
  assert.equal(isRecordTranslated(p, 'en', ['name', 'description']), true);
  assert.equal(isRecordTranslated(p, 'kk', ['name', 'description']), false);
  assert.equal(isRecordTranslated(p, 'kk', ['name']), true);
  assert.equal(isRecordTranslated(p, 'ru', ['name', 'description']), true);
  assert.equal(isRecordTranslated({ id: 'x' }, 'ru', ['name']), false);
});

test('blog, banner and settings wrappers', () => {
  const blog = deepFreeze({
    id: 'b',
    slug: 's',
    title: 'T',
    excerpt: 'E',
    content: 'C',
    category: 'Outdoor',
    readingTime: '5 min read',
    translations: { kk: { title: 'Тақырып', category: 'Сыртқы' } },
  });
  const b = localizeBlog(blog, 'kk');
  assert.equal(b.title, 'Тақырып');
  assert.equal(b.category, 'Сыртқы');
  assert.equal(b.excerpt, 'E');
  const banner = deepFreeze({
    id: 'x',
    title: 'Sale',
    ctaLabel: 'Shop',
    translations: { ru: { title: 'Распродажа', ctaLabel: 'Купить' } },
  });
  assert.deepEqual(localizeBanner(banner, 'ru'), { id: 'x', title: 'Распродажа', ctaLabel: 'Купить' });
  const s = deepFreeze({
    storeName: 'G',
    seoTitle: 'A',
    seoDescription: 'B',
    translations: { ru: { seoTitle: 'А' } },
  });
  assert.deepEqual(localizeSettings(s, 'ru'), { storeName: 'G', seoTitle: 'А', seoDescription: 'B' });
  assert.ok(BLOG_SPEC && BANNER_SPEC && SETTINGS_SPEC);
});

test('homepage: blocks keyed by id, carousel items keyed by item id (incl. badge)', () => {
  const hp = deepFreeze({
    heroBanners: [{ id: 'banner-1', title: 'HOLIDAY SALE', subtitle: 'Save big', disclaimer: 'Legal' }],
    carousels: [
      {
        id: 'car1',
        title: 'Featured',
        items: [
          { id: 'i1', title: 'Watch', description: 'D', badge: 'Save $100', price: '$1' },
          { id: 'i2', title: 'Band', description: 'D2', variant: 'promo', ctaText: 'SHOP' },
        ],
      },
    ],
    promoTiles: [{ id: 't1', title: 'RUN', cta: 'SHOP' }],
    storyTiles: [],
    categoryTiles: [{ id: 'c1', title: 'WATCHES', cta: 'SHOP' }],
    translations: {
      ru: {
        heroBanners: { 'banner-1': { title: 'РАСПРОДАЖА', disclaimer: ' ' } },
        carousels: {
          car1: {
            title: 'Избранное',
            items: { i1: { badge: 'Скидка $100' }, i2: { ctaText: 'КУПИТЬ' }, ghost: { title: 'x' } },
          },
        },
        promoTiles: { t1: { cta: 'КУПИТЬ' } },
        categoryTiles: { c1: { title: 'ЧАСЫ' } },
      },
    },
  });
  const out = localizeHomepage(hp, 'ru');
  assert.equal(out.heroBanners[0].title, 'РАСПРОДАЖА');
  assert.equal(out.heroBanners[0].subtitle, 'Save big');
  assert.equal(out.heroBanners[0].disclaimer, 'Legal');
  assert.equal(out.carousels[0].title, 'Избранное');
  assert.equal(out.carousels[0].items[0].badge, 'Скидка $100');
  assert.equal(out.carousels[0].items[0].price, '$1');
  assert.equal(out.carousels[0].items[1].ctaText, 'КУПИТЬ');
  assert.equal(out.carousels[0].items.length, 2);
  assert.equal(out.promoTiles[0].cta, 'КУПИТЬ');
  assert.equal(out.categoryTiles[0].title, 'ЧАСЫ');
  assert.equal('translations' in out, false);
  assert.ok(HOMEPAGE_SPEC);
  assert.equal(localizeHomepage(hp, 'kk').carousels[0].title, 'Featured');
});

test('localizeList maps every record and does not mutate the input', () => {
  const list = deepFreeze([makeProduct({ ru: { name: 'А' } }), { ...makeProduct({ ru: { name: 'Б' } }), id: 'p2' }]);
  const out = localizeList(list, 'ru', localizeProduct);
  assert.deepEqual(
    out.map((p) => p.name),
    ['А', 'Б'],
  );
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 'Phoenix');
  assert.notEqual(out, list);
});

test('localizeList(products, kk) returns the Kazakh name where an overlay exists and English elsewhere', () => {
  const withKk = makeProduct({ kk: { name: 'Феникс-kk' } });
  const withoutKk = { ...makeProduct({ ru: { name: 'Ру' } }), id: 'p2' };
  const list = deepFreeze([withKk, withoutKk]);
  const out = localizeList(list, 'kk', localizeProduct);
  assert.equal(out[0].name, 'Феникс-kk');
  assert.equal(out[1].name, 'Phoenix');
  assert.equal(list[0].name, 'Phoenix');
  assert.equal(out[0].translations, undefined);
});

test('isRecordTranslated: only non-blank strings and non-empty arrays count as present', () => {
  const rec = { translations: { kk: { name: { nested: 'x' }, description: 5, title: 'T', content: ['a'] } } };
  assert.equal(isRecordTranslated(rec, 'kk', ['name']), false);
  assert.equal(isRecordTranslated(rec, 'kk', ['description']), false);
  assert.equal(isRecordTranslated(rec, 'kk', ['title', 'content']), true);
  assert.equal(isRecordTranslated(rec, 'kk', ['missing']), false);
});

test('translatedLocales: en always, plus locales with all required fields', async () => {
  const { translatedLocales } = await import('../src/i18n/translate-record.js');
  const rec = { translations: { ru: { name: 'Н', description: 'О' }, kk: { name: 'К' } } };
  assert.deepEqual(translatedLocales(rec, ['name', 'description']), ['en', 'ru']);
  assert.deepEqual(translatedLocales({}, ['name']), ['en']);
});

test('resolveSeoText: ru with only name/description translated uses the translations', async () => {
  const { resolveSeoText } = await import('../src/i18n/translate-record.js');
  const raw = { seoTitle: 'Base SEO', name: 'Base', seoDescription: 'Base SD', description: 'Base D', translations: { ru: { name: 'Имя', description: 'Описание' } } };
  assert.equal(resolveSeoText(raw, 'ru', ['seoTitle', 'name']), 'Имя');
  assert.equal(resolveSeoText(raw, 'ru', ['seoDescription', 'description']), 'Описание');
});

test('resolveSeoText: a translated seoTitle wins over a translated name', async () => {
  const { resolveSeoText } = await import('../src/i18n/translate-record.js');
  const raw = { seoTitle: 'Base SEO', name: 'Base', translations: { ru: { seoTitle: 'СЕО', name: 'Имя' } } };
  assert.equal(resolveSeoText(raw, 'ru', ['seoTitle', 'name']), 'СЕО');
});

test('resolveSeoText: en returns the base seoTitle and ignores overlays', async () => {
  const { resolveSeoText } = await import('../src/i18n/translate-record.js');
  const raw = { seoTitle: 'Base SEO', name: 'Base', translations: { ru: { name: 'Имя' } } };
  assert.equal(resolveSeoText(raw, 'en', ['seoTitle', 'name']), 'Base SEO');
  assert.equal(resolveSeoText({ name: 'Base' }, 'en', ['seoTitle', 'name']), undefined);
});

test('resolveSeoText: untranslated kk falls back to the base seoTitle', async () => {
  const { resolveSeoText } = await import('../src/i18n/translate-record.js');
  const raw = { seoTitle: 'Base SEO', name: 'Base', translations: { ru: { name: 'Имя' } } };
  assert.equal(resolveSeoText(raw, 'kk', ['seoTitle', 'name']), 'Base SEO');
});
