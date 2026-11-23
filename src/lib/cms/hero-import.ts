import type { HeroBanner, HomepageConfig } from "./types";

/** One banner to import (owner 2026-11-23: hero banners from garmin.com.tr). `image` is the stored upload src. */
export interface ImportedHeroBanner {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  image: string;
  translations?: Partial<Record<"ru" | "kk", { title?: string; subtitle?: string }>>;
}

/**
 * Append imported hero banners after the current slides (which stay as they are). Ids are `${prefix}${key}`;
 * a banner whose id already exists is skipped, so re-running an import adds nothing.
 */
export function appendHeroBanners(
  config: HomepageConfig,
  banners: readonly ImportedHeroBanner[],
  prefix = "tr-",
): { config: HomepageConfig; added: string[]; skipped: string[] } {
  const existing = new Set(config.heroBanners.map((banner) => banner.id));
  const added: string[] = [];
  const skipped: string[] = [];
  let order = config.heroBanners.reduce((max, banner) => Math.max(max, banner.order), 0);
  const heroBanners: HeroBanner[] = [...config.heroBanners];
  const translations = structuredClone(config.translations ?? {});

  for (const banner of banners) {
    const id = `${prefix}${banner.key}`;
    if (existing.has(id)) {
      skipped.push(id);
      continue;
    }
    order += 1;
    heroBanners.push({ id, key: id, title: banner.title, subtitle: banner.subtitle, image: banner.image, href: banner.href, active: true, order });
    for (const locale of ["ru", "kk"] as const) {
      const text = banner.translations?.[locale];
      if (!text) continue;
      const overlay = (translations[locale] ??= {});
      overlay.heroBanners = { ...overlay.heroBanners, [id]: { ...text } };
    }
    existing.add(id);
    added.push(id);
  }

  if (added.length === 0) return { config, added, skipped };
  return { config: { ...config, heroBanners, translations }, added, skipped };
}
