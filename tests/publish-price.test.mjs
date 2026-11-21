// Price to publish, shared by both backends: only what the storefront would sell needs a price above 0.
// The legacy JSON save path refuses a publish the same way the PostgreSQL projection does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICE_TO_PUBLISH, isSellableVariantStatus, findUnpricedForPublish, unpricedMessage, legacyPublishRefusal } from '../src/lib/cms/publish-price.js';
import { listUnpricedPublishedJSON } from '../scripts/check-unpriced-published.mjs';

const options = [{ id: 'size', key: 'size', name: 'Size', display: 'buttons', values: [{ id: 's', key: 's', label: 'S' }, { id: 'm', key: 'm', label: 'M' }] }];
const sized = ({ m = 5000, mStatus = 'active', status } = {}) => ({
  id: 'p1', name: 'Fixture', sku: 'FX', price: 5000, ...(status ? { status } : {}), options,
  variants: [
    { id: 'va', sku: 'FX-S', title: 'S', selections: { size: 's' }, price: 5000, status: 'active', isDefault: true, imageIds: [] },
    { id: 'vb', sku: 'FX-M', title: 'M', selections: { size: 'm' }, price: m, status: mStatus, isDefault: false, imageIds: [] },
  ],
});

test('the storefront sells only active variants', () => {
  assert.equal(isSellableVariantStatus('active'), true);
  for (const status of ['draft', 'archived', undefined, '']) assert.equal(isSellableVariantStatus(status), false);
});

test('findUnpricedForPublish: simple products need their own price; variant products only their sellable variants', () => {
  const positive = (p) => Number(p) > 0;
  assert.deepEqual(findUnpricedForPublish({ published: true, hasVariants: false, price: 0, variants: [] }, positive), { variant: null });
  assert.equal(findUnpricedForPublish({ published: false, hasVariants: false, price: 0, variants: [] }, positive), null);
  const variants = [{ sku: 'A', title: 'A', status: 'draft', price: 0 }, { sku: 'B', title: 'B', status: 'active', price: 0 }];
  assert.equal(findUnpricedForPublish({ published: true, hasVariants: true, price: 0, variants }, positive).variant.sku, 'B');
  assert.equal(findUnpricedForPublish({ published: true, hasVariants: true, price: 0, variants: variants.slice(0, 1) }, positive), null);
  assert.equal(unpricedMessage(null), PRICE_TO_PUBLISH);
  assert.equal(unpricedMessage({ sku: ' B ', title: ' Big ' }), 'Set a price above 0 for Big (B) before publishing.');
  assert.equal(unpricedMessage({ sku: 'B', title: '' }), 'Set a price above 0 for B before publishing.');
});

test('legacy save: a published simple product at price 0 is refused with the PostgreSQL message; a draft is not', () => {
  assert.equal(PRICE_TO_PUBLISH, 'Set a price above 0 before publishing.');
  assert.equal(legacyPublishRefusal({ name: 'x', price: 0, status: 'published' }), PRICE_TO_PUBLISH);
  // The legacy store publishes a product saved without a status.
  assert.equal(legacyPublishRefusal({ name: 'x', price: 0 }), PRICE_TO_PUBLISH);
  assert.equal(legacyPublishRefusal({ name: 'x', price: '0.00', status: 'published' }), PRICE_TO_PUBLISH);
  assert.equal(legacyPublishRefusal({ name: 'x', price: 0, status: 'draft' }), null);
  assert.equal(legacyPublishRefusal({ name: 'x', price: 0, status: 'archived' }), null);
  assert.equal(legacyPublishRefusal({ name: 'x', price: 10, status: 'published' }), null);
  // Options without variants: the product sells its own price.
  assert.equal(legacyPublishRefusal({ name: 'x', price: 0, status: 'published', options, variants: [] }), PRICE_TO_PUBLISH);
});

test('legacy save: an active 0 variant is refused and named; draft and archived 0 variants are allowed', () => {
  assert.equal(legacyPublishRefusal(sized({ m: 0 })), 'Set a price above 0 for M (FX-M) before publishing.');
  assert.equal(legacyPublishRefusal(sized({ m: 0, mStatus: 'draft' })), null);
  assert.equal(legacyPublishRefusal(sized({ m: 0, mStatus: 'archived' })), null);
  assert.equal(legacyPublishRefusal(sized({ m: 0, status: 'draft' })), null);
});

test('the JSON data check lists only sellable unpriced variants', () => {
  const rows = listUnpricedPublishedJSON({ products: [sized({ m: 0 }), { ...sized({ m: 0, mStatus: 'draft' }), id: 'p2' }, { id: 'p3', name: 'Simple', price: 0, status: 'published' }] });
  assert.deepEqual(rows.map((row) => [row.product, row.sku ?? null]), [['p1', 'FX-M'], ['p3', null]]);
});
