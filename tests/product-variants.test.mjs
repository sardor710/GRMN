import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VARIANTS,
  generateVariants,
  selectionSignature,
  ensureSingleDefault,
  resolveVariant,
  availableValueIds,
  sizeBucketFromLabel,
  syncLegacyFields,
  findSkuConflicts,
} from '../src/lib/cms/product-variants.js';

const opt = (id, name, labels) => ({
  id,
  key: name.toLowerCase(),
  name,
  display: 'buttons',
  values: labels.map((label, i) => ({ id: `${id}-v${i}`, key: label.toLowerCase(), label })),
});

const size = opt('o1', 'Size', ['42', 'Biggest']);
const groupset = opt('o2', 'Groupset', ['Shimano', 'SLR']);
const base = { sku: 'edge-x', price: 100000, stock: 5 };

test('generates 2×2 = 4 variants for Size[42,Biggest] × Groupset[Shimano,SLR]', () => {
  const { variants, removed } = generateVariants([size, groupset], [], base);
  assert.equal(variants.length, 4);
  assert.equal(removed, 0);
  const skus = variants.map((v) => v.sku).sort();
  assert.deepEqual(skus, ['EDGE-X-42-SHIMANO', 'EDGE-X-42-SLR', 'EDGE-X-BIGGEST-SHIMANO', 'EDGE-X-BIGGEST-SLR']);
  for (const v of variants) {
    assert.equal(v.price, 100000);
    assert.equal(v.stock, 5);
    assert.equal(Object.keys(v.selections).length, 2);
  }
});

test('keeps sku/price/stock of an existing matching variant', () => {
  const first = generateVariants([size, groupset], [], base).variants;
  const edited = first.map((v) =>
    v.selections.o1 === 'o1-v0' && v.selections.o2 === 'o2-v1' ? { ...v, sku: 'CUSTOM-1', price: 777, stock: 9 } : v,
  );
  const { variants } = generateVariants([size, groupset], edited, base);
  const kept = variants.find((v) => v.sku === 'CUSTOM-1');
  assert.ok(kept);
  assert.equal(kept.price, 777);
  assert.equal(kept.stock, 9);
});

test('reports removed count when a value is deleted', () => {
  const first = generateVariants([size, groupset], [], base).variants;
  const smaller = { ...size, values: size.values.slice(0, 1) };
  const { variants, removed } = generateVariants([smaller, groupset], first, base);
  assert.equal(variants.length, 2);
  assert.equal(removed, 2);
});

test('exactly one default after generation and after ensureSingleDefault', () => {
  const { variants } = generateVariants([size, groupset], [], base);
  assert.equal(variants.filter((v) => v.isDefault).length, 1);
  const many = variants.map((v) => ({ ...v, isDefault: true }));
  assert.equal(ensureSingleDefault(many).filter((v) => v.isDefault).length, 1);
  const none = variants.map((v) => ({ ...v, isDefault: false }));
  assert.equal(ensureSingleDefault(none).filter((v) => v.isDefault).length, 1);
});

test('throws RangeError for 3 options × 8 values (512 combinations)', () => {
  const labels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  assert.ok(512 > MAX_VARIANTS);
  assert.throws(() => generateVariants([opt('a', 'A', labels), opt('b', 'B', labels), opt('c', 'C', labels)], [], base), RangeError);
});

test('returns a warning above 100 combinations', () => {
  const labels = Array.from({ length: 11 }, (_, i) => `v${i}`);
  const { variants, warning } = generateVariants([opt('a', 'A', labels), opt('b', 'B', labels)], [], base);
  assert.equal(variants.length, 121);
  assert.match(warning, /121/);
});

test('no options → no variants (simple product)', () => {
  const { variants } = generateVariants([], [], base);
  assert.equal(variants.length, 0);
});

test('selectionSignature is order independent', () => {
  assert.equal(
    selectionSignature({ o2: 'o2-v1', o1: 'o1-v0' }, [size, groupset]),
    selectionSignature({ o1: 'o1-v0', o2: 'o2-v1' }, [size, groupset]),
  );
});

test('resolveVariant and availableValueIds disable combos with no active variant', () => {
  const { variants } = generateVariants([size, groupset], [], base);
  const archived = variants.map((v) =>
    v.selections.o1 === 'o1-v1' && v.selections.o2 === 'o2-v1' ? { ...v, status: 'archived' } : { ...v, status: 'active' },
  );
  assert.equal(resolveVariant(archived, { o1: 'o1-v0', o2: 'o2-v0' }).selections.o1, 'o1-v0');
  const avail = availableValueIds(archived, { o1: 'o1-v1', o2: 'o2-v0' }, 'o2');
  assert.ok(avail.has('o2-v0'));
  assert.ok(!avail.has('o2-v1'));
});

test('sizeBucketFromLabel maps mm sizes and ignores free text', () => {
  assert.equal(sizeBucketFromLabel('42 mm'), 'Small');
  assert.equal(sizeBucketFromLabel('43 mm'), 'Medium');
  assert.equal(sizeBucketFromLabel('46mm'), 'Medium');
  assert.equal(sizeBucketFromLabel('51 mm'), 'Large');
  assert.equal(sizeBucketFromLabel('Biggest'), undefined);
});

test('syncLegacyFields mirrors default variant and default image into legacy fields', () => {
  const caseSize = opt('cs', 'Case Size', ['43 mm', '51 mm']);
  const { variants } = generateVariants([caseSize], [], base);
  const withDefault = variants.map((v) => ({ ...v, isDefault: v.selections.cs === 'cs-v1', price: v.selections.cs === 'cs-v1' ? 555 : 1, originalPrice: 600, stock: 3 }));
  const product = syncLegacyFields({
    id: 'p1', name: 'X', sku: 'X', price: 0, description: '', image: '', family: '', category: '', subCategory: '',
    activities: [], level: 'Entry', caseSize: 'Small', stock: 0, status: 'draft', specs: [], inTheBox: [],
    compatibleAccessories: [], createdAt: '2026-11-17',
    options: [caseSize], variants: withDefault,
    images: [{ id: 'i1', src: '/uploads/a.jpg', alt: '', source: 'upload' }, { id: 'i2', src: '/uploads/b.jpg', alt: '', source: 'upload' }],
    defaultImageId: 'i2',
    specGroups: [{ title: 'General', items: [{ label: 'Weight', value: '60 g' }] }],
  });
  assert.equal(product.price, 555);
  assert.equal(product.originalPrice, 600);
  assert.equal(product.stock, 3);
  assert.equal(product.image, '/uploads/b.jpg');
  assert.equal(product.caseSize, 'Large');
  assert.deepEqual(product.specs, [{ label: 'Weight', value: '60 g' }]);
});

test('syncLegacyFields leaves a simple product untouched', () => {
  const simple = { id: 'p', sku: 'S', price: 10, stock: 1, image: '/a.jpg', caseSize: 'Medium', specs: [{ label: 'a', value: 'b' }] };
  assert.deepEqual(syncLegacyFields(simple), simple);
});

test('findSkuConflicts detects duplicates within a product and across products, case-insensitively', () => {
  const product = { id: 'p1', sku: 'BASE', variants: [{ sku: 'abc-1' }, { sku: 'dup' }, { sku: 'DUP' }] };
  const others = [{ id: 'p2', sku: 'X', variants: [{ sku: 'ABC-1' }] }, { id: 'p3', sku: 'base' }, product];
  assert.deepEqual(findSkuConflicts(product, others).sort(), ['ABC-1', 'BASE', 'DUP']);
  assert.deepEqual(findSkuConflicts({ id: 'p9', sku: 'NEW' }, others), []);
});

test('selectValue jumps to the closest active variant that has the chosen value', async () => {
  const { selectValue } = await import('../src/lib/cms/product-variants.js');
  const color = opt('c', 'Color', ['Black', 'Pink']);
  const sz = opt('s', 'Size', ['43', '51']);
  const { variants } = generateVariants([sz, color], [], base);
  // 51 mm only exists in Black
  const live = variants.map((v) => (v.selections.s === 's-v1' && v.selections.c === 'c-v1' ? { ...v, status: 'archived' } : v));
  const fromPink43 = { s: 's-v0', c: 'c-v1' };
  const picked = selectValue(live, fromPink43, 's', 's-v1');
  assert.deepEqual(picked.selections, { s: 's-v1', c: 'c-v0' });
  const keepColor = selectValue(live, { s: 's-v1', c: 'c-v0' }, 's', 's-v0');
  assert.deepEqual(keepColor.selections, { s: 's-v0', c: 'c-v0' });
  assert.equal(selectValue(live, fromPink43, 's', 'nope'), undefined);
});

// ---- final-review fix pass ----

test('I2: adding an option keeps existing variants on the new option\'s first value', () => {
  const first = generateVariants([size], [], base).variants.map((v) => ({ ...v, stock: 7, sku: `KEEP-${v.selections.o1}` }));
  const { variants, removed } = generateVariants([size, groupset], first, base);
  assert.equal(removed, 0);
  assert.equal(variants.length, 4);
  for (const v of first) {
    const kept = variants.find((x) => x.sku === v.sku);
    assert.ok(kept, `${v.sku} kept`);
    assert.equal(kept.selections.o2, 'o2-v0');
    assert.equal(kept.stock, 7);
  }
});

test('I3: removing an option keeps the default / active / best-stocked variant and reports merged', () => {
  const all = generateVariants([size, groupset], [], base).variants.map((v) => ({
    ...v,
    isDefault: false,
    stock: v.selections.o2 === 'o2-v0' ? 5 : 0,
    sku: `S-${v.selections.o1}-${v.selections.o2}`,
  }));
  const { variants, removed, merged } = generateVariants([size], all, base);
  assert.equal(variants.length, 2);
  assert.equal(removed, 2);
  assert.equal(merged, 2);
  assert.ok(variants.every((v) => v.stock === 5), 'stocked Shimano variants survive');
  assert.deepEqual(Object.keys(variants[0].selections), ['o1']);
});

test('I1: on a partly covered matrix, new combinations are drafts and counted', () => {
  const full = generateVariants([size, groupset], [], base).variants;
  const sold = full.filter((v) => !(v.selections.o1 === 'o1-v1' && v.selections.o2 === 'o2-v1'));
  const { variants, added } = generateVariants([size, groupset], sold, base);
  assert.equal(added, 1);
  const fresh = variants.find((v) => v.selections.o1 === 'o1-v1' && v.selections.o2 === 'o2-v1');
  assert.equal(fresh.status, 'draft');
  const brandNew = generateVariants([size, groupset], [], base);
  assert.ok(brandNew.variants.every((v) => v.status === 'active'));
  assert.equal(brandNew.added, 4);
});

test('I6: selectValue never lands on draft or archived variants', async () => {
  const { selectValue } = await import('../src/lib/cms/product-variants.js');
  const vs = generateVariants([size], [], base).variants.map((v) =>
    v.selections.o1 === 'o1-v1' ? { ...v, status: 'draft' } : v,
  );
  assert.equal(selectValue(vs, { o1: 'o1-v0' }, 'o1', 'o1-v1'), undefined);
});

test('I6: isPurchasable requires an active variant with stock', async () => {
  const { isPurchasable } = await import('../src/lib/cms/product-variants.js');
  assert.equal(isPurchasable({ status: 'active', stock: 2 }), true);
  assert.equal(isPurchasable({ status: 'active', stock: 0 }), false);
  assert.equal(isPurchasable({ status: 'draft', stock: 9 }), false);
  assert.equal(isPurchasable(undefined), true, 'simple products are unaffected');
});

test('C1: only products with variants or an overview use the CMS detail page', async () => {
  const { usesCmsDetail } = await import('../src/lib/cms/product-variants.js');
  assert.equal(usesCmsDetail({ images: [{ id: 'a', src: '/x.jpg' }] }), false);
  assert.equal(usesCmsDetail({ variants: [{ sku: 'A' }] }), true);
  assert.equal(usesCmsDetail({ overviewHtml: '<p>x</p>' }), true);
  assert.equal(usesCmsDetail({ overviewHtml: '   ' }), false);
});
