import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeProductInput, isAllowedImageSrc } from '../src/lib/cms/product-input.js';

test('S2: overviewHtml is always a sanitized string, whatever type was sent', () => {
  const arr = sanitizeProductInput({ name: 'x', price: 1, overviewHtml: ['<img src=x onerror=alert(1)>'] });
  assert.equal(arr.ok, true);
  assert.equal(arr.product.overviewHtml, '');
  const obj = sanitizeProductInput({ name: 'x', price: 1, overviewHtml: { toString: () => '<script>x</script>' } });
  assert.equal(obj.product.overviewHtml, '');
  const str = sanitizeProductInput({ name: 'x', price: 1, overviewHtml: '<p onclick="x()">hi</p><script>alert(1)</script>' });
  assert.equal(str.product.overviewHtml, '<p>hi</p>');
  const none = sanitizeProductInput({ name: 'x', price: 1 });
  assert.equal('overviewHtml' in none.product, false);
});

test('S3: image sources must be same-site paths or res.garmin.com', () => {
  assert.equal(isAllowedImageSrc('/uploads/products/2026/a.jpg'), true);
  assert.equal(isAllowedImageSrc('/marq/images/marq-spec-captain.png'), true);
  assert.equal(isAllowedImageSrc('https://res.garmin.com/en/products/x/v/cf-lg.jpg'), true);
  for (const bad of ['https://evil.com/p.gif', '//evil.com/p.gif', 'javascript:alert(1)', 'http://res.garmin.com/a.jpg', 'data:image/png;base64,AA', '']) {
    assert.equal(isAllowedImageSrc(bad), false, bad);
  }
  const res = sanitizeProductInput({ name: 'x', price: 1, images: [{ id: 'a', src: 'https://evil.com/t.gif', alt: '', source: 'url' }] });
  assert.equal(res.ok, false);
  assert.match(res.error, /evil\.com/);
  const legacy = sanitizeProductInput({ name: 'x', price: 1, image: 'https://evil.com/t.gif' });
  assert.equal(legacy.ok, false);
});

test('S3/S6: swatch images and colors are validated', () => {
  const opt = (value) => ({ name: 'x', price: 1, options: [{ id: 'o', key: 'c', name: 'Color', display: 'swatch', values: [{ id: 'v', key: 'k', label: 'L', ...value }] }] });
  assert.equal(sanitizeProductInput(opt({ swatchColor: '#1a2B3c' })).ok, true);
  assert.equal(sanitizeProductInput(opt({ swatchColor: 'url(https://evil/t)' })).ok, false);
  assert.equal(sanitizeProductInput(opt({ swatchImage: 'https://res.garmin.com/a.jpg' })).ok, true);
  assert.equal(sanitizeProductInput(opt({ swatchImage: 'https://evil.com/a.jpg' })).ok, false);
});
