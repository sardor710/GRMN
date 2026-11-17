import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mergeMessages } from '../src/i18n/messages.js';
import { checkCatalogs } from '../src/i18n/messages-check.js';
import { formatMoney, formatDate } from '../src/i18n/format.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (locale) => JSON.parse(readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8'));
const en = load('en');
const ru = load('ru');
const kk = load('kk');

/** Intl uses narrow / no-break spaces as group and currency separators; compare against plain spaces. */
const plainSpaces = (value) => value.replace(/[  ]/g, ' ');

test('mergeMessages: overlay wins, missing keys fall back to base', () => {
  const base = { Meta: { title: 'T', description: 'D' }, Cart: { empty: 'Empty' } };
  assert.deepEqual(mergeMessages(base, { Meta: { title: 'Т' } }), {
    Meta: { title: 'Т', description: 'D' },
    Cart: { empty: 'Empty' },
  });
});
test('mergeMessages: blank strings fall back to base', () =>
  assert.deepEqual(mergeMessages({ A: { b: 'x' } }, { A: { b: '  ' } }), { A: { b: 'x' } }));
test('mergeMessages: does not mutate base', () => {
  const base = { A: { b: 'x' } };
  mergeMessages(base, { A: { b: 'y' } });
  assert.deepEqual(base, { A: { b: 'x' } });
});
test('message files share the Meta namespace', () => {
  for (const [locale, messages] of Object.entries({ en, ru, kk })) {
    assert.equal(typeof messages.Meta.title, 'string', locale);
    assert.equal(typeof messages.Meta.description, 'string', locale);
  }
});

// --- checkCatalogs -------------------------------------------------------------------------

test('checkCatalogs: identical shapes are clean', () => {
  const base = { A: { b: 'Hi {name}', c: { d: 'x' } } };
  assert.deepEqual(checkCatalogs(base, { A: { b: 'Привет {name}', c: { d: 'y' } } }, 'ru'), {
    missing: [],
    extra: [],
    badPlural: [],
  });
});
test('checkCatalogs: reports missing and extra keys by dotted path', () => {
  const result = checkCatalogs({ A: { b: 'x', c: 'y' } }, { A: { b: 'x', z: 'q' }, B: 'w' }, 'kk');
  assert.deepEqual(result.missing, ['A.c']);
  assert.deepEqual(result.extra, ['A.z', 'B']);
});
test('checkCatalogs: blank translation counts as missing', () =>
  assert.deepEqual(checkCatalogs({ A: 'x' }, { A: '  ' }, 'ru').missing, ['A']));
test('checkCatalogs: placeholder sets must match en', () => {
  const result = checkCatalogs({ A: 'Hello {name}' }, { A: 'Привет {nme}' }, 'ru');
  assert.deepEqual(result.badPlural, ['A']);
});
test('checkCatalogs: ru plural needs one/few/many/other', () => {
  const enMsg = { C: '{count, plural, one {# item} other {# items}}' };
  assert.deepEqual(checkCatalogs(enMsg, { C: '{count, plural, one {# товар} other {# товаров}}' }, 'ru').badPlural, ['C']);
  assert.deepEqual(
    checkCatalogs(enMsg, { C: '{count, plural, one {# товар} few {# товара} many {# товаров} other {# товара}}' }, 'ru').badPlural,
    [],
  );
});
test('checkCatalogs: kk plural needs one/other', () => {
  const enMsg = { C: '{count, plural, one {# item} other {# items}}' };
  assert.deepEqual(checkCatalogs(enMsg, { C: '{count, plural, other {# тауар}}' }, 'kk').badPlural, ['C']);
  assert.deepEqual(checkCatalogs(enMsg, { C: '{count, plural, one {# тауар} other {# тауар}}' }, 'kk').badPlural, []);
});
test('checkCatalogs: en plural also needs one/other', () =>
  assert.deepEqual(checkCatalogs({ C: '{count, plural, other {# items}}' }, { C: '{count, plural, other {# items}}' }, 'en').badPlural, ['C']));
test('checkCatalogs: nested placeholders inside plural branches are compared', () =>
  assert.deepEqual(
    checkCatalogs(
      { C: '{count, plural, one {# item for {name}} other {# items for {name}}}' },
      { C: '{count, plural, one {# тауар} other {# тауар}}' },
      'kk',
    ).badPlural,
    ['C'],
  ));

for (const [locale, messages] of [['ru', ru], ['kk', kk]]) {
  test(`catalog ${locale} is complete against en`, () =>
    assert.deepEqual(checkCatalogs(en, messages, locale), { missing: [], extra: [], badPlural: [] }));
}
test('en catalog plurals are well-formed', () => assert.deepEqual(checkCatalogs(en, en, 'en').badPlural, []));

// --- formatting ----------------------------------------------------------------------------

test('formatMoney: en USD', () => assert.equal(formatMoney(1299.99, 'en', 'USD'), '$1,299.99'));
test('formatMoney: ru USD', () => assert.equal(plainSpaces(formatMoney(1299.99, 'ru', 'USD')), '1 299,99 $'));
test('formatMoney: defaults to USD and keeps two decimals', () => assert.equal(formatMoney(500, 'en'), '$500.00'));
test('formatMoney: kk groups digits', () => assert.match(plainSpaces(formatMoney(1299.99, 'kk', 'USD')), /^1 299,99/));
test('formatDate: kk long contains the year', () => assert.ok(formatDate('2026-11-17', 'kk', 'long').includes('2026')));
test('formatDate: en long matches the current site format', () =>
  assert.equal(formatDate('2026-11-17', 'en', 'long'), 'November 17, 2026'));
test('formatDate: date-only strings do not shift a day', () =>
  assert.equal(formatDate('2026-01-01', 'en', 'short'), 'Jan 1, 2026'));
test('formatDate: ru long uses Russian month names', () => assert.match(formatDate('2026-11-17', 'ru', 'long'), /ноября/));

// --- no hard-coded English in public components ----------------------------------------------

/**
 * Files rendering public storefront UI. Minisite marketing pages and the Garmin Pay marketing
 * page stay English at launch (OD3), and admin is English-only (L8), so they are not listed.
 */
const SCANNED_DIRS = ['src/components', 'src/components/home', 'src/components/product', 'src/app/[lang]'];
const SKIP = [
  /^src\/app\/\[lang\]\/minisite\//,
  /^src\/app\/\[lang\]\/garmin-pay\//,
  /^src\/components\/product\/ProductOverview\.tsx$/, // fēnix 8 marketing banners (product content)
  /icons\.tsx$/,
];

function listTsx(dir, recursive) {
  const out = [];
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    const stat = statSync(path.join(root, rel));
    if (stat.isDirectory()) {
      if (recursive) out.push(...listTsx(rel, true));
    } else if (name.endsWith('.tsx')) {
      out.push(rel);
    }
  }
  return out;
}

const scannedFiles = SCANNED_DIRS.flatMap((dir) => listTsx(dir, dir === 'src/app/[lang]')).filter(
  (file) => !SKIP.some((re) => re.test(file)),
);

/** Brand, product and other never-translated tokens that may appear as literal JSX text. */
const ALLOWED_TEXT = new Set(['Garmin', 'MARQ', 'USD', 'SKU', 'Garmin Pay', 'Garmin Connect', 'X']);

function findEnglish(source) {
  const hits = [];
  const code = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  // JSX text nodes: `>Text<` or `>Text{`, also when the text sits on its own line.
  for (const m of code.matchAll(/(?<![=])>\s*([A-Z][A-Za-z]+[^<>{}]*?)\s*[<{]/g)) {
    if (!ALLOWED_TEXT.has(m[1].trim())) hits.push(m[1].trim());
  }
  // User-visible attributes.
  for (const m of code.matchAll(/\b(?:aria-label|placeholder|title|alt)="([A-Z][^"]*)"/g)) {
    if (!ALLOWED_TEXT.has(m[1])) hits.push(m[1]);
  }
  return hits;
}

test('grep test scans the public component files', () => {
  assert.ok(scannedFiles.length > 25, `only ${scannedFiles.length} files`);
  for (const file of ['src/components/home/HomeHeader.tsx', 'src/components/CartView.tsx', 'src/app/[lang]/not-found.tsx']) {
    assert.ok(scannedFiles.includes(file), file);
  }
});
test('grep helper catches inline and own-line JSX text and attributes', () => {
  assert.deepEqual(findEnglish('<p>Hello world</p>'), ['Hello world']);
  assert.deepEqual(findEnglish('<a>\n  Go to homepage\n</a>'), ['Go to homepage']);
  assert.deepEqual(findEnglish('<b>SHOP</b>'), ['SHOP']);
  assert.deepEqual(findEnglish('<i aria-label="Search" />'), ['Search']);
  assert.deepEqual(findEnglish('<p>{t("x")}</p><span>Garmin</span>'), []);
  assert.deepEqual(findEnglish('const f = (a) => Boolean(a) < 2;'), []);
});
for (const file of scannedFiles) {
  test(`no hard-coded English in ${file}`, () =>
    assert.deepEqual(findEnglish(readFileSync(path.join(root, file), 'utf8')), []));
}
