import test from 'node:test';
import assert from 'node:assert/strict';
import { commerceVariantModel } from '../src/lib/cms/commerce-variant-model.js';
import { availableValueIds, selectValue } from '../src/lib/cms/product-variants.js';

const media = (u) => [{ url: `/uploads/${u}.jpg`, alt: '', width: null, height: null }];
const detail = {
  selectedVariantId: 'v41-gold',
  variants: [
    { id: 'v45-slate', sku: '010-03014-00', name: 'Slate', availability: 'available', options: { 'Case Size': '45 mm', 'Model/Color': 'Slate with Black Band' }, gallery: media('slate') },
    { id: 'v41-gold', sku: '010-03013-00', name: 'Gold', availability: 'out_of_stock', options: { 'Case Size': '41 mm', 'Model/Color': 'Lunar Gold with Bone Band' }, gallery: media('gold') },
    { id: 'v41-black', sku: '010-03013-01', name: 'Black', availability: 'available', options: { 'Case Size': '41 mm', 'Model/Color': 'Black' }, gallery: media('black') },
  ],
};

test('PostgreSQL variants become garmin.com pickers: buttons for size, photo swatches for color', () => {
  const model = commerceVariantModel(detail);
  assert.deepEqual(model.options.map((o) => [o.name, o.display, o.values.map((v) => v.label)]), [
    ['Case Size', 'buttons', ['45 mm', '41 mm']],
    ['Model/Color', 'swatch', ['Slate with Black Band', 'Lunar Gold with Bone Band', 'Black']],
  ]);
  assert.equal(model.options[1].values[0].swatchImage, '/uploads/slate.jpg');
  assert.deepEqual(model.variants.filter((v) => v.isDefault).map((v) => v.id), ['v41-gold']);
});

test('choosing a color from another size switches to that variant (garmin.com behaviour)', () => {
  const { options, variants } = commerceVariantModel(detail);
  const gold = variants.find((v) => v.id === 'v41-gold');
  const [size, color] = options;
  const slateValue = color.values.find((v) => v.label.startsWith('Slate')).id;
  assert.ok(!availableValueIds(variants, gold.selections, color.id).has(slateValue), 'slate is a 45 mm color');
  assert.equal(selectValue(variants, gold.selections, color.id, slateValue).id, 'v45-slate');
  assert.equal(selectValue(variants, gold.selections, size.id, size.values[0].id).id, 'v45-slate');
});

test('single-variant products and products without options need no picker', () => {
  assert.equal(commerceVariantModel({ variants: [detail.variants[0]] }), undefined);
  assert.equal(commerceVariantModel({ variants: detail.variants.map((v) => ({ ...v, options: {} })) }), undefined);
});
