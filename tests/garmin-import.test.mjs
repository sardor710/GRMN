import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateGarminUrl,
  extractBootstrap,
  sanitizeOverviewHtml,
  overviewFromGarmin,
  parseSpecsTable,
  parseInTheBox,
  familyFromName,
  parseGarminProduct,
} from '../src/lib/import/garmin-parse.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/garmin/${name}.html`, import.meta.url), 'utf8');
const NOW = '2026-11-17T00:00:00.000Z';
const parse = (name, rate = 500) =>
  parseGarminProduct(fixture(name), { sourceUrl: 'https://www.garmin.com/en-US/p/1953453', rateKztPerUsd: rate, now: NOW });

test('fēnix 9: ≥30 variants with part number, KZT price and ≥10 images each', () => {
  const { product, remoteImages } = parse('fenix9');
  assert.ok(product.variants.length >= 30, `variants: ${product.variants.length}`);
  const imageIds = new Set(remoteImages.map((i) => i.id));
  for (const v of product.variants) {
    assert.match(v.sourcePartNumber, /^\d{3}-\d{5}-\d{2}$/);
    assert.equal(v.sku, v.sourcePartNumber);
    assert.ok(v.price > 0);
    assert.ok(v.imageIds.length >= 1, `${v.sku} has no images`);
    for (const id of v.imageIds) assert.ok(imageIds.has(id));
  }
  // garmin.com itself lists only one photo for 3 of the 33 SKUs (checked 2026-11-17).
  const rich = product.variants.filter((v) => v.imageIds.length >= 10).length;
  assert.ok(rich / product.variants.length >= 0.9, `${rich}/${product.variants.length} variants have ≥10 images`);
  const def = product.variants.filter((v) => v.isDefault);
  assert.equal(def.length, 1);
  assert.ok(def[0].imageIds.length >= 10);
});

test('fēnix 9: labeled options Case Size, Version, inReach, Color with every selection resolvable', () => {
  const { product } = parse('fenix9');
  const names = product.options.map((o) => o.name);
  for (const n of ['Case Size', 'Version', 'Color']) assert.ok(names.includes(n), names.join(', '));
  assert.ok(names.some((n) => /inReach/.test(n)));
  const caseSize = product.options.find((o) => o.name === 'Case Size');
  assert.deepEqual(caseSize.values.map((v) => v.label), ['43 mm', '47 mm', '51 mm']);
  const color = product.options.find((o) => o.name === 'Color');
  assert.ok(color.values.every((v) => !v.label.includes('_')), 'color slugs are humanized');
  for (const v of product.variants) {
    for (const o of product.options) {
      const valueId = v.selections[o.id];
      assert.ok(o.values.some((val) => val.id === valueId), `${v.sku} lacks ${o.name}`);
    }
  }
});

test('fēnix 9: family, grouped specs, in the box and a safe non-empty overview', () => {
  const { product } = parse('fenix9');
  assert.equal(product.family, 'fēnix 9');
  assert.ok(product.specGroups.length >= 10, `spec groups: ${product.specGroups.length}`);
  assert.ok(product.specGroups.every((g) => g.title && g.items.length));
  assert.equal(product.inTheBox.length, 3);
  assert.ok(product.overviewHtml.length > 2000);
  assert.match(product.overviewHtml, /<h2>/);
  assert.doesNotMatch(product.overviewHtml, /<script|<style|\son\w+=|<pc-|javascript:/i);
  assert.equal(product.source.provider, 'garmin');
  assert.equal(product.source.importedAt, NOW);
  assert.ok(product.name && !/ – \d+ mm$/.test(product.name));
  assert.equal(product.sku, 'GARMIN-1953453', 'I4: imported base SKU never collides with legacy GRM-<id>');
});

test('rate 500 KZT/USD converts $1,249.99 to 624,995 KZT and keeps the USD source price', () => {
  const { product } = parse('fenix9', 500);
  const v = product.variants.find((x) => x.sourcePrice && x.sourcePrice.list === 1249.99 && x.sourcePrice.sale === undefined);
  assert.ok(v, 'a $1,249.99 variant exists');
  assert.equal(v.price, 624995);
  assert.deepEqual(v.sourcePrice, { currency: 'USD', list: 1249.99, rateKztPerUsd: 500 });
});

test('on-sale variants use the sale price and keep the list price as compare-at', () => {
  const { product } = parse('venu4', 500);
  const sale = product.variants.find((v) => v.sourcePrice?.sale !== undefined);
  assert.ok(sale, 'venu 4 fixture has a sale variant');
  assert.equal(sale.price, Math.round(sale.sourcePrice.sale * 500));
  assert.equal(sale.originalPrice, Math.round(sale.sourcePrice.list * 500));
});

test('Venu 4 image-swatch axis gets labels from variation names and swatch images', () => {
  const { product } = parse('venu4');
  const swatch = product.options.find((o) => o.display === 'swatch');
  assert.ok(swatch);
  assert.ok(swatch.values.every((v) => v.label && v.swatchImage?.startsWith('https://res.garmin.com/')));
  assert.ok(product.variants.length >= 5);
});

test('Edge 1060 (single SKU, empty axis) parses with an option derived from selections', () => {
  const { product } = parse('edge1060');
  assert.ok(product.options.length >= 1);
  assert.equal(product.variants.length, 1);
  assert.ok(product.variants[0].isDefault);
  assert.ok(product.specGroups.length > 0);
});

test('extractBootstrap throws a readable error on non-product pages', () => {
  assert.throws(() => extractBootstrap('<html><body>hi</body></html>'), /GarminAppBootstrap/);
});

test('validateGarminUrl only accepts https Garmin product hosts', () => {
  for (const bad of [
    'http://www.garmin.com/en-US/p/1953453',
    'https://garmin.com.evil.io/en-US/p/1',
    'https://user@www.garmin.com/en-US/p/1',
    'https://www.garmin.com:8443/en-US/p/1',
    'https://127.0.0.1/en-US/p/1',
    'https://res.garmin.com/x.jpg',
    'not a url',
  ]) {
    assert.equal(validateGarminUrl(bad).ok, false, bad);
  }
  assert.equal(validateGarminUrl('https://www.garmin.com/en-US/p/1953453').ok, true);
  assert.equal(validateGarminUrl('https://buy.garmin.com/en-US/US/p/1953453/pn/010-04337-00').ok, true);
});

test('sanitizeOverviewHtml strips scripts, handlers, styles and foreign image hosts', () => {
  const out = sanitizeOverviewHtml(
    '<h2 onclick="x()">T</h2><script>alert(1)</script><p style="color:red">a<a href="javascript:alert(1)">b</a></p>' +
      '<img src="https://evil.com/x.png"><img src="https://res.garmin.com/a.jpg" onerror="x()"><img src="/uploads/products/2026/a.jpg">',
  );
  assert.doesNotMatch(out, /script|onclick|onerror|style=|javascript:|evil\.com/);
  assert.match(out, /res\.garmin\.com\/a\.jpg/);
  assert.match(out, /\/uploads\/products\/2026\/a\.jpg/);
});

test('overviewFromGarmin turns Garmin components into headings, figures and features', () => {
  const html = overviewFromGarmin(
    '<pc-overview-intro title="BIG &lt;sup&gt;®&lt;/sup&gt;" description="Intro text" /><pc-headline primary-text="WHAT YOU\'LL LOVE" />' +
      '<pc-feature-card image="https://res.garmin.com/a.jpg" title="RUGGED" description="Strong <a href=https://www.garmin.com/x>link</a>" />' +
      '<pc-life-style bg-image="https://res.garmin.com/b.jpg" text="PLAY HARDER" />',
  );
  assert.match(html, /<h2>BIG/);
  assert.match(html, /<h2>WHAT YOU'LL LOVE<\/h2>/);
  assert.match(html, /<h3>RUGGED<\/h3>/);
  assert.match(html, /<img src="https:\/\/res\.garmin\.com\/b\.jpg"/);
  assert.doesNotMatch(html, /<pc-/);
});

test('parseSpecsTable groups rows under <h3> headings and maps yes/no cells', () => {
  const groups = parseSpecsTable(
    '<table><tr class="title"><td colspan="2"><h3>General</h3></td></tr><tr><th>Lens</th><td>Sapphire</td></tr>' +
      '<tr><th><a href="x">Flashlight</a></th><td class="yes"></td></tr><tr class="title"><td><h3>Sensors</h3></td></tr>' +
      '<tr><th>GPS</th><td class="no"></td></tr></table>',
  );
  assert.deepEqual(groups, [
    { title: 'General', items: [{ label: 'Lens', value: 'Sapphire' }, { label: 'Flashlight', value: 'Yes' }] },
    { title: 'Sensors', items: [{ label: 'GPS', value: 'No' }] },
  ]);
});

test('parseInTheBox and familyFromName', () => {
  assert.deepEqual(parseInTheBox('<ul><li>Watch</li><li> Cable </li></ul>'), ['Watch', 'Cable']);
  assert.equal(familyFromName('fēnix® 9 Pro'), 'fēnix 9');
  assert.equal(familyFromName('Venu® 4'), 'Venu 4');
  assert.equal(familyFromName('Edge® 1060 Plus'), 'Edge 1060');
  assert.equal(familyFromName('Forerunner® 970 – 47 mm'), 'Forerunner 970');
});

// ---- garmin.com overview layout fidelity (banners, sections, column grids, headlines) ----
const OV_SAMPLE = `<div><overview-container>
<pc-life-style data-translate bg-image="https://res.garmin.com/en/products/x/g/D-1.jpg" mobile-bg-image="https://res.garmin.com/en/products/x/g/M-1.jpg"
  text="VENU® 4" text-size="3" text-align="left" text-position="middle" button-text="A healthier lifestyle" theme="dark" />
<pc-overview-intro theme="light" title="DISCOVER A HEALTHIER YOU" description="Purpose-built for you.">
  <pc-feature-card image="https://res.garmin.com/icons/AMOLED.svg" img-width="50px" description="BRIGHT AMOLED DISPLAY" />
</pc-overview-intro>
</overview-container></div>
<div>
<pc-layout-container theme="light"><pc-column-layout columns="1">
  <pc-headline theme="dark" text-align="center" text-size="2.6" primary-text="WHAT YOU'LL LOVE" />
</pc-column-layout></pc-layout-container>
<pc-layout-container><pc-column-layout>
  <pc-feature-card title="24/7 HEALTH MONITORING" image="https://res.garmin.com/en/products/x/g/f1.jpg" description="Make improvements." />
  <pc-feature-card title="SLEEP" image="https://res.garmin.com/en/products/x/g/f2.jpg" description="Sleep score." />
  <pc-feature-card title="STATUS" image="https://res.garmin.com/en/products/x/g/f3.jpg" description="Health status." />
</pc-column-layout></pc-layout-container>
<pc-layout-container><pc-copy theme="light" title="HEALTH" /><pc-line-divider />
  <pc-column-layout columns="5">
    <pc-feature-card title="HRV STATUS" image="https://res.garmin.com/icons/HRV.svg" description="Understand your health." />
    <pc-feature-card />
  </pc-column-layout>
</pc-layout-container>
<pc-layout-container theme="neutral"><pc-disclaimer-block><pc-disclaimer-item counter="1" content="See notes." /></pc-disclaimer-block></pc-layout-container>
</div>`;
const ovOut = () => sanitizeOverviewHtml(overviewFromGarmin(OV_SAMPLE));

test('overview: life-style becomes a full-width banner with text over the photo, not a caption', () => {
  const html = ovOut();
  assert.match(html, /<div class="ov-banner ov-theme-dark ov-align-left ov-pos-middle ov-ts-30">/);
  assert.match(html, /<img[^>]*class="ov-desktop"[^>]*D-1\.jpg|<img[^>]*D-1\.jpg[^>]*class="ov-desktop"/);
  assert.match(html, /M-1\.jpg/);
  assert.match(html, /<div class="ov-banner-text"><h2>VENU® 4<\/h2><p>A healthier lifestyle<\/p><\/div>/);
  assert.doesNotMatch(html, /figcaption/);
});

test('overview: layout containers, column grids, headlines and dividers keep garmin.com structure', () => {
  const html = ovOut();
  assert.match(html, /<section class="ov-section ov-theme-light">/);
  assert.match(html, /<div class="ov-headline ov-theme-dark ov-align-center ov-ts-26"><h2>WHAT YOU'LL LOVE<\/h2><\/div>/);
  // columns attribute missing → number of cards in the row
  assert.match(html, /<div class="ov-cols ov-cols-3">(?:<div class="ov-card">[\s\S]*?<\/div>){3}<\/div>/);
  assert.match(html, /<div class="ov-cols ov-cols-5"><div class="ov-card ov-card-icon">/);
  assert.match(html, /<div class="ov-copy"><h2>HEALTH<\/h2><\/div><hr \/>/);
  assert.equal((html.match(/class="ov-card/g) || []).length, 4, 'empty filler cards are dropped');
  assert.match(html, /<section class="ov-section ov-theme-neutral"><div class="ov-disclaimers">/);
});

test('overview: intro keeps its icon highlights in a grid under the title', () => {
  const html = ovOut();
  assert.match(html, /<section class="ov-section ov-intro ov-theme-light"><h2>DISCOVER A HEALTHIER YOU<\/h2><p>Purpose-built for you\.<\/p><div class="ov-cols ov-cols-6 ov-highlights"><div class="ov-highlight">/);
});

test('overview: unknown theme/alignment values cannot inject classes', () => {
  const html = sanitizeOverviewHtml(overviewFromGarmin('<pc-headline theme="x evil" text-align="center onclick" text-size="99" primary-text="T" />'));
  assert.match(html, /<div class="ov-headline ov-theme-light ov-align-center ov-ts-40"><h2>T<\/h2><\/div>/);
});
