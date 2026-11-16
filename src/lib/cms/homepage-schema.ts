export * from "./homepage-schema.js";
import {
  IMAGE_DIMENSION_SPECS as JS_IMAGE_DIMENSION_SPECS,
  createDefaultHomepageConfig as jsCreateDefaultHomepageConfig,
  normalizeCarouselItem as jsNormalizeCarouselItem,
  validateHomepageConfig as jsValidateHomepageConfig
} from "./homepage-schema.js";
import type { HomepageConfig, ImageDimensionSpec, CarouselType, ProductCarouselItem, PromoCarouselItem } from "./types";

export const IMAGE_DIMENSION_SPECS: Record<string, ImageDimensionSpec> = JS_IMAGE_DIMENSION_SPECS as unknown as Record<string, ImageDimensionSpec>;

export function createDefaultHomepageConfig(): HomepageConfig {
  return jsCreateDefaultHomepageConfig() as HomepageConfig;
}

export function normalizeCarouselItem(
  type: CarouselType,
  item: Partial<ProductCarouselItem & PromoCarouselItem>
): ProductCarouselItem | PromoCarouselItem {
  return jsNormalizeCarouselItem(type, item) as ProductCarouselItem | PromoCarouselItem;
}

export function validateHomepageConfig(config: unknown): { isValid: boolean; errors: string[] } {
  return jsValidateHomepageConfig(config);
}
