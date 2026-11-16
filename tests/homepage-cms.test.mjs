import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_DIMENSION_SPECS,
  validateHomepageConfig,
  normalizeCarouselItem,
  createDefaultHomepageConfig
} from '../src/lib/cms/homepage-schema.js';

test('IMAGE_DIMENSION_SPECS defines exact dimensions, aspect ratios and size limits for all block types', () => {
  assert.ok(IMAGE_DIMENSION_SPECS.heroBanner);
  assert.equal(IMAGE_DIMENSION_SPECS.heroBanner.recommendedWidth, 1920);
  assert.equal(IMAGE_DIMENSION_SPECS.heroBanner.recommendedHeight, 800);
  assert.ok(IMAGE_DIMENSION_SPECS.heroBanner.aspectRatio.includes('16:9') || IMAGE_DIMENSION_SPECS.heroBanner.aspectRatio.includes('2.4:1'));
  assert.equal(IMAGE_DIMENSION_SPECS.heroBanner.maxSizeFormatted, '2 MB');

  assert.ok(IMAGE_DIMENSION_SPECS.productCarousel);
  assert.equal(IMAGE_DIMENSION_SPECS.productCarousel.recommendedWidth, 800);
  assert.equal(IMAGE_DIMENSION_SPECS.productCarousel.recommendedHeight, 800);
  assert.equal(IMAGE_DIMENSION_SPECS.productCarousel.aspectRatio, '1:1');
  assert.equal(IMAGE_DIMENSION_SPECS.productCarousel.maxSizeFormatted, '1 MB');

  assert.ok(IMAGE_DIMENSION_SPECS.promoCarousel);
  assert.equal(IMAGE_DIMENSION_SPECS.promoCarousel.recommendedWidth, 1200);
  assert.equal(IMAGE_DIMENSION_SPECS.promoCarousel.recommendedHeight, 600);
  assert.ok(IMAGE_DIMENSION_SPECS.promoCarousel.aspectRatio.includes('2:1'));
  assert.equal(IMAGE_DIMENSION_SPECS.promoCarousel.maxSizeFormatted, '1.5 MB');

  assert.ok(IMAGE_DIMENSION_SPECS.tileBlock);
  assert.equal(IMAGE_DIMENSION_SPECS.tileBlock.recommendedWidth, 600);
  assert.equal(IMAGE_DIMENSION_SPECS.tileBlock.recommendedHeight, 400);
  assert.equal(IMAGE_DIMENSION_SPECS.tileBlock.aspectRatio, '3:2');
  assert.equal(IMAGE_DIMENSION_SPECS.tileBlock.maxSizeFormatted, '1 MB');
});

test('createDefaultHomepageConfig generates complete baseline config with banners and 2 carousel types', () => {
  const config = createDefaultHomepageConfig();
  assert.ok(Array.isArray(config.heroBanners));
  assert.ok(config.heroBanners.length >= 3);
  assert.equal(config.heroBanners[0].order, 1);
  assert.equal(config.heroBanners[0].active, true);

  assert.ok(Array.isArray(config.carousels));
  assert.ok(config.carousels.length >= 2);

  const productCarousel = config.carousels.find((c) => c.type === 'product');
  assert.ok(productCarousel, 'Product carousel (type 1) must exist');
  assert.ok(productCarousel.items.length > 0);
  assert.ok(productCarousel.items.some((i) => i.badge === 'NEW'));
  assert.ok(productCarousel.items.some((i) => i.badge === 'SALE'));

  const promoCarousel = config.carousels.find((c) => c.type === 'promo');
  assert.ok(promoCarousel, 'Promo carousel (type 2) must exist');
  assert.ok(promoCarousel.items.length > 0);
  assert.ok(promoCarousel.items[0].href);
  assert.ok(promoCarousel.items[0].ctaText);

  // Containing blocks verification
  assert.ok(Array.isArray(config.promoTiles));
  assert.ok(config.promoTiles.length >= 3);
  assert.ok(Array.isArray(config.storyTiles));
  assert.ok(config.storyTiles.length >= 2);
  assert.ok(Array.isArray(config.categoryTiles));
  assert.ok(config.categoryTiles.length >= 6);
});

test('normalizeCarouselItem correctly enforces fields for product vs promo carousel types', () => {
  const productItem = normalizeCarouselItem('product', {
    title: 'Fenix 9',
    price: '$999.99',
    originalPrice: '$1,099.99',
    badge: 'NEW',
    image: '/fenix9.jpg',
    href: '/p/fenix9'
  });
  assert.equal(productItem.title, 'Fenix 9');
  assert.equal(productItem.price, '$999.99');
  assert.equal(productItem.originalPrice, '$1,099.99');
  assert.equal(productItem.badge, 'NEW');

  const promoItem = normalizeCarouselItem('promo', {
    title: 'Special Event',
    image: '/banner.jpg',
    href: 'https://example.com/event',
    ctaText: 'DISCOVER'
  });
  assert.equal(promoItem.ctaText, 'DISCOVER');
  assert.equal(promoItem.href, 'https://example.com/event');
  assert.equal(promoItem.title, 'Special Event');
});

test('validateHomepageConfig validates structure and reports errors for malformed configs', () => {
  const valid = createDefaultHomepageConfig();
  const validResult = validateHomepageConfig(valid);
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.errors.length, 0);

  const invalidResult = validateHomepageConfig({
    heroBanners: 'not-an-array',
    carousels: [{ type: 'unknown_type' }]
  });
  assert.equal(invalidResult.isValid, false);
  assert.ok(invalidResult.errors.length >= 2);

  const invalidNull = validateHomepageConfig(null);
  assert.equal(invalidNull.isValid, false);
});
