import type { HomepageConfig, ProductCarouselItem } from "./types";
import { formatKzt } from "../money.ts";

/** A published collection as the public read returns it (Task 18A `readCollection`). */
export interface PublicCollection {
  key: string;
  name: string;
  /** Public product DTOs; only id, name, description, image, price, originalPrice and badge are read. */
  products: Record<string, unknown>[];
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
/** Task 5a.2: the shared tenge format. The homepage config is not per-language, so the label uses the default (en). */
const kzt = (value: number) => formatKzt({ major: value }, "en");

/**
 * Fill carousels that reference a merchandising collection (`collectionKey`) with the collection's
 * published products. A collection that is missing or not published leaves the carousel's inline
 * items in place (18A ruling I6: the homepage never regresses to nothing because of a collection).
 */
export async function resolveHomepageCollections(
  config: HomepageConfig,
  readCollection: (key: string) => Promise<PublicCollection | null>,
): Promise<HomepageConfig> {
  const keys = [...new Set(config.carousels.map((c) => c.collectionKey).filter((k): k is string => Boolean(k)))];
  if (keys.length === 0) return config;
  const found = new Map<string, PublicCollection>();
  for (const key of keys) {
    const collection = await readCollection(key);
    if (collection) found.set(key, collection);
  }
  return {
    ...config,
    carousels: config.carousels.map((carousel) => {
      const collection = carousel.collectionKey ? found.get(carousel.collectionKey) : undefined;
      if (!collection) return carousel;
      const items: ProductCarouselItem[] = collection.products.map((product, order) => {
        const id = str(product.id), price = num(product.price), originalPrice = num(product.originalPrice), badge = str(product.badge);
        return {
          id: `${collection.key}:${id}`,
          title: str(product.name),
          description: str(product.description),
          price: price === undefined ? "" : kzt(price),
          ...(originalPrice !== undefined && price !== undefined && originalPrice > price ? { originalPrice: kzt(originalPrice) } : {}),
          ...(badge && badge !== "NONE" ? { badge } : {}),
          image: str(product.image),
          href: `/p/${encodeURIComponent(id)}`,
          order,
        };
      });
      return { ...carousel, type: "product", items };
    }),
  };
}
