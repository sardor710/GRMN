import type { CarouselBlock, HomepageConfig } from "./types";

/**
 * Owner 2026-11-23: every homepage banner, carousel, carousel card and tile can be archived
 * (hidden on the storefront, kept in admin) or deleted. These helpers address entries by id,
 * never by array index, and always return a new config.
 */
export type HomepageListSection = "heroBanners" | "carousels" | "promoTiles" | "storyTiles" | "categoryTiles";
export type HomepageEntryRef =
  | { section: HomepageListSection; id: string }
  | { section: "carouselItems"; carouselId: string; id: string };

interface Entry { id: string; order: number; archived?: boolean }

const live = <T extends { archived?: boolean }>(list: T[]) => list.filter((entry) => entry.archived !== true);

/** The storefront view: archived banners, carousels, cards and tiles removed. */
export function withoutArchived(config: HomepageConfig): HomepageConfig {
  return {
    ...config,
    heroBanners: live(config.heroBanners),
    carousels: live(config.carousels).map((carousel) => ({ ...carousel, items: live(carousel.items) })),
    promoTiles: live(config.promoTiles),
    storyTiles: live(config.storyTiles),
    categoryTiles: live(config.categoryTiles),
  };
}

/** Apply `change` to the list the ref points at; an unknown carousel leaves the config as it is. */
function updateList(config: HomepageConfig, ref: HomepageEntryRef, change: <T extends Entry>(list: T[]) => T[]): HomepageConfig {
  if (ref.section !== "carouselItems") {
    const list = config[ref.section] as Entry[];
    const next = change(list);
    return next === list ? config : { ...config, [ref.section]: next };
  }
  const index = config.carousels.findIndex((carousel) => carousel.id === ref.carouselId);
  if (index < 0) return config;
  const carousel = config.carousels[index];
  const items = change(carousel.items);
  if (items === carousel.items) return config;
  const carousels: CarouselBlock[] = [...config.carousels];
  carousels[index] = { ...carousel, items };
  return { ...config, carousels };
}

export function setEntryArchived(config: HomepageConfig, ref: HomepageEntryRef, archived: boolean): HomepageConfig {
  return updateList(config, ref, (list) => {
    const index = list.findIndex((entry) => entry.id === ref.id);
    if (index < 0) return list;
    const next = [...list];
    const { archived: _drop, ...rest } = list[index];
    void _drop;
    next[index] = (archived ? { ...rest, archived: true } : rest) as typeof list[number];
    return next;
  });
}

export function removeEntry(config: HomepageConfig, ref: HomepageEntryRef): HomepageConfig {
  return updateList(config, ref, (list) => {
    const next = list.filter((entry) => entry.id !== ref.id);
    return next.length === list.length ? list : next;
  });
}

/** Swap with the nearest non-archived neighbour, then renumber `order` 1..n over the whole list. */
export function moveEntry(config: HomepageConfig, ref: HomepageEntryRef, direction: "up" | "down"): HomepageConfig {
  return updateList(config, ref, (list) => {
    const index = list.findIndex((entry) => entry.id === ref.id);
    if (index < 0) return list;
    const step = direction === "up" ? -1 : 1;
    let target = index + step;
    while (target >= 0 && target < list.length && list[target].archived === true) target += step;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((entry, i) => ({ ...entry, order: i + 1 }));
  });
}
