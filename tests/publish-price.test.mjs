// Price to publish, shared by both backends: only what the storefront would sell needs a price above 0, and a
// published product with variants must sell at least one. The legacy JSON save path refuses a publish the same
// way the PostgreSQL projection does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICE_TO_PUBLISH, NO_ACTIVE_VARIANT, effectiveVariantStatus, isSellableVariantStatus, sellableVariant, findUnpricedForPublish, unpricedMessage, legacyPublishRefusal } from '../src/lib/cms/publish-price.js';
import { syncLegacyFields } from '../src/lib/cms/product-variants.js';
import { listUnpricedPublishedJSON } from '../scripts/check-unpriced-published.mjs';

const options = [{ id: 'size', key: 'size', name: 'Size', display: 'buttons', values: [{ id: 's', key: 's', label: 'S' }, { id: 'm', key: 'm', label: 'M' }] }];
const sized = ({ s = 5000, sStatus = 'active', m = 5000, mStatus = 'active', status } = {}) => ({
  id: 'p1', name: 'Fixture', sku: 'FX', price: 5000, ...(status ? { status } : {}), options,
  variants: [
    { id: 'va', sku: 'FX-S', title: 'S', selections: { size: 's' }, price: s, stock: 1, ...(sStatus ? { status: sStatus } : {}), isDefault: true, imageIds: [] },
    { id: 'vb', sku: 'FX-M', title: 'M', selections: { size: 'm' }, price: m, stock: 2, ...(mStatus ? { status: mStatus } : {}), isDefault: false, imageIds: [] },
  ],
});

test('the storefront sells active variants, and a variant without a status counts as active (like the projection)', () => {
  assert.equal(effectiveVariantStatus(undefined), 'active');
  assert.equal(effectiveVariantStatus(''), 'active');
  assert.equal(effectiveVariantStatus('draft'), 'draft');
  assert.equal(effectiveVariantStatus('archived'), 'archived');
  for (const status of ['active', undefined, '']) assert.equal(isSellableVariantStatus(status), true, String(status));
  for (const status of ['draft', 'archived']) assert.equal(isSellableVariantStatus(status), false, status);
});

test('sellableVariant: the default when it is sold, else the first sold variant', () => {
  assert.equal(sellableVariant(sized().variants).id, 'va');
  assert.equal(sellableVariant(sized({ sStatus: 'draft' }).variants).id, 'vb');
  assert.equal(sellableVariant(sized({ sStatus: 'draft', mStatus: 'archived' }).variants), undefined);
});

test('findUnpricedForPublish: product price, a named sellable variant, or no sellable variant at all', () => {
  const positive = (p) => Number(p) > 0;
  assert.deepEqual(findUnpricedForPublish({ published: true, hasVariants: false, price: 0, variants: [] }, positive), { reason: 'price' });
  assert.equal(findUnpricedForPublish({ published: false, hasVariants: false, price: 0, variants: [] }, positive), null);
  const variants = [{ sku: 'A', title: 'A', status: 'draft', price: 0 }, { sku: 'B', title: 'B', status: 'active', price: 0 }];
  assert.equal(findUnpricedForPublish({ published: true, hasVariants: true, price: 0, variants }, positive).variant.sku, 'B');
  assert.deepEqual(findUnpricedForPublish({ published: true, hasVariants: true, price: 0, variants: variants.slice(0, 1) }, positive), { reason: 'noActive' });
  assert.equal(findUnpricedForPublish({ published: true, hasVariants: true, price: 0, variants: [{ sku: 'C', title: '', price: 0 }] }, positive).variant.sku, 'C', 'a status-less variant is sold, so it is checked');
  assert.equal(unpricedMessage({ reason: 'price' }), PRICE_TO_PUBLISH);
  assert.equal(unpricedMessage({ reason: 'noActive' }), NO_ACTIVE_VARIANT);
  assert.equal(NO_ACTIVE_VARIANT, 'Make at least one variant active with a price above 0 before publishing.');
  assert.equal(unpricedMessage({ reason: 'variant', variant: { sku: ' B ', title: ' Big ' } }), 'Set a price above 0 for Big (B) before publishing.');
  assert.equal(unpricedMessage({ reason: 'variant', variant: { sku: 'B', title: '' } }), 'Set a price above 0 for B before publishing.');
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

test('legacy save: sellable 0 variants are refused and named; draft/archived ones are allowed; one must be sold', () => {
  assert.equal(legacyPublishRefusal(sized({ m: 0 })), 'Set a price above 0 for M (FX-M) before publishing.');
  assert.equal(legacyPublishRefusal(sized({ m: 0, mStatus: null })), 'Set a price above 0 for M (FX-M) before publishing.');
  assert.equal(legacyPublishRefusal(sized({ m: 0, mStatus: 'draft' })), null);
  assert.equal(legacyPublishRefusal(sized({ m: 0, mStatus: 'archived' })), null);
  assert.equal(legacyPublishRefusal(sized({ m: 0, status: 'draft' })), null);
  assert.equal(legacyPublishRefusal(sized({ sStatus: 'draft', mStatus: 'draft' })), NO_ACTIVE_VARIANT);
  assert.equal(legacyPublishRefusal(sized({ sStatus: 'draft', mStatus: 'draft', status: 'draft' })), null);
});

test('legacy fields mirror the variant the storefront sells: a draft default at 0 does not become the card price', () => {
  const synced = syncLegacyFields(sized({ s: 0, sStatus: 'draft', m: 50000 }));
  assert.equal(synced.price, 50000);
  assert.equal(synced.stock, 2);
  assert.equal(legacyPublishRefusal(synced), null);
  // The default is mirrored while it is sold, and when nothing is sold (a draft product keeps its default).
  assert.equal(syncLegacyFields(sized({ s: 4000, m: 50000 })).price, 4000);
  assert.equal(syncLegacyFields(sized({ s: 4000, sStatus: 'draft', mStatus: 'draft', status: 'draft' })).price, 4000);
});

test('the JSON data check lists sellable unpriced variants and published products that sell no variant', () => {
  const rows = listUnpricedPublishedJSON({ products: [
    sized({ m: 0 }),
    { ...sized({ m: 0, mStatus: 'draft' }), id: 'p2' },
    { id: 'p3', name: 'Simple', price: 0, status: 'published' },
    { ...sized({ sStatus: 'draft', mStatus: 'archived' }), id: 'p4' },
    { ...sized({ m: 0, mStatus: null }), id: 'p5' },
  ] });
  assert.deepEqual(rows.map((row) => [row.product, row.sku ?? null, row.variant_status]), [['p1', 'FX-M', 'active'], ['p3', null, 'active'], ['p4', null, 'none'], ['p5', 'FX-M', 'active']]);
});
