"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SearchIcon } from "@/components/icons";
import type { Product } from "@/types";
import {
  CATALOGUE_COMPARE_SEARCH_PARAM,
  COMPARE_ITEM_PARAM,
  COMPARE_MAX_ITEMS,
  COMPARE_SEARCH_MAX_LENGTH,
  parseCompareItems,
} from "@/lib/compare/compare-items";
import {
  COMPARE_LIMIT_NOTE_ID,
  addItem,
  hasProduct,
  isSelectionFull,
  removeItem,
  selectionHref,
  type CompareSelectionItem,
  type CompareSelectionStore,
} from "@/lib/compare/selection";

const SEARCH_INPUT_ID = "compare-bar-search";
const STATUS_ID = "compare-bar-status";
const SEARCH_RESULTS_ID = "compare-bar-results";

export interface CompareBarHit { id: string; name: string; image: string }
export interface CompareBarSearch { query: string; results: CompareBarHit[] }

export interface CompareBarProps {
  /** The selection (from useCompareSelection) and its update function. */
  items: readonly CompareSelectionItem[];
  onChange: CompareSelectionStore["update"];
  /** The catalogue page's products: names and images for items stored without them. */
  products: readonly Pick<Product, "id" | "name" | "image">[];
  /** Server-side hits for `compareSearch` (the bounded storefront search), or null. */
  search: CompareBarSearch | null;
  /** Compare mode (`compare=1`): the bar shows even with nothing selected, like garmin.com. */
  compareMode: boolean;
  /** The shopper changed the selection elsewhere (a card): the live status may speak. Off on page load. */
  announce?: boolean;
}

/**
 * garmin.com's catalogue compare banner (Compare.spec.md, "Catalogue compare banner"): #F2F2F2 with a #D9D9D9 rule;
 * from 1024px one 87px row stuck to the top of the catalogue (search 238px, five 53px slots, Compare 140×52),
 * below 1024px a block stuck to the bottom of the viewport (slots, search, full-width Compare). It sticks inside the
 * catalogue block only, so it never covers the footer or the "Next Products" link. Garmin's empty left side holds our
 * status line and "Clear all".
 */
export function CompareBar({ items, onChange, products, search, compareMode, announce = false }: CompareBarProps) {
  const t = useTranslations("CompareBar");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(search?.query ?? "");
  // The live status stays empty until the shopper changes the selection, so loading the page announces nothing.
  const [acted, setActed] = useState(false);
  const userChange: CompareSelectionStore["update"] = (change) => {
    setActed(true);
    onChange(change);
  };

  // A link can carry the selection (`item=<id>~<sku>`, like the compare page): add it, then drop it from the
  // address without a server round trip (Next.js syncs useSearchParams for `history.replaceState(null, …)`).
  const seeded = params.getAll(COMPARE_ITEM_PARAM).join("&");
  useEffect(() => {
    if (!seeded) return;
    const refs = parseCompareItems(new URLSearchParams(seeded.split("&").map((value) => [COMPARE_ITEM_PARAM, value])));
    onChange((current) =>
      refs.reduce<readonly CompareSelectionItem[]>((list, ref) => {
        const product = products.find((p) => p.id === ref.productId);
        return addItem(list, { ...ref, ...(product ? { name: product.name, image: product.image } : {}) });
      }, current),
    );
    const next = new URLSearchParams(window.location.search);
    next.delete(COMPARE_ITEM_PARAM);
    const qs = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [seeded, onChange, products]);

  const full = isSelectionFull(items);
  const canCompare = items.length >= 2;
  const liveSearch = params.get(CATALOGUE_COMPARE_SEARCH_PARAM) ?? "";
  const showHits = Boolean(search && search.query && liveSearch.trim() === search.query);
  const hits = (search?.results ?? []).filter((hit) => !hasProduct(items, hit.id));

  if (!compareMode && items.length === 0) return null;

  const withSearch = (text: string) => {
    const next = new URLSearchParams(params.toString());
    if (text) next.set(CATALOGUE_COMPARE_SEARCH_PARAM, text);
    else next.delete(CATALOGUE_COMPARE_SEARCH_PARAM);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.replace(withSearch(query.trim().slice(0, COMPARE_SEARCH_MAX_LENGTH)), { scroll: false });
  };
  // Closing the hits only changes the address (no refetch); the hits stay hidden while it lacks the search.
  const closeHits = () => window.history.replaceState(null, "", withSearch(""));
  const addHit = (hit: CompareBarHit) => {
    userChange((current) => addItem(current, { productId: hit.id, name: hit.name, image: hit.image }));
    setQuery("");
    closeHits();
  };
  const display = (item: CompareSelectionItem) => {
    const product = products.find((p) => p.id === item.productId);
    return { name: item.name ?? product?.name ?? item.productId, image: item.image ?? product?.image };
  };
  const status = items.length < 2 ? t("minimum") : full ? t("limit", { max: COMPARE_MAX_ITEMS }) : t("status", { count: items.length, max: COMPARE_MAX_ITEMS });

  return (
    <section
      role="region"
      aria-label={t("region")}
      data-compare-bar
      className="sticky bottom-0 z-20 order-last border-t border-garmin-control bg-muted p-4 text-black shadow-garmin-raised lg:top-0 lg:bottom-auto lg:order-first lg:border-b lg:shadow-none"
    >
      {/* DOM order = the mobile stack: our status line and "Clear all", then garmin.com's slots, search (12px under) and
          Compare (16px under). From 1024px the row is status (Garmin's empty left side), search, slots, Compare. */}
      <div className="flex flex-col lg:flex-row lg:items-center">
        <div className="flex min-h-6 items-center justify-between gap-4 lg:order-1 lg:mr-auto lg:justify-start">
          <p id={full ? COMPARE_LIMIT_NOTE_ID : STATUS_ID} className="text-[14px] leading-[21px]">{status}</p>
          {items.length > 0 && (
            <button type="button" onClick={() => userChange(() => [])} className="g-btn g-btn--text py-0 text-[14px] leading-[21px] underline hover:no-underline">
              {t("clearAll")}
            </button>
          )}
        </div>

        <ul className="mt-3 flex gap-2 pt-[5.6px] lg:order-3 lg:mt-0 lg:ml-2 lg:pt-0">
          {Array.from({ length: COMPARE_MAX_ITEMS }, (_, slot) => {
            const item = items[slot];
            const box = "relative aspect-square w-[calc((100%-2rem)/5)] max-w-[75px] lg:size-[53px] lg:max-w-none";
            if (!item) return <li key={`empty-${slot}`} aria-hidden="true" className={`${box} border border-garmin-control`} />;
            const { name, image } = display(item);
            return (
              <li key={`${item.productId}~${item.sku ?? ""}`} title={name} className={`${box} border border-black bg-white`}>
                {image && <Image src={image} alt="" fill sizes="75px" className="object-contain p-[3px]" />}
                <span className="sr-only">{name}</span>
                <button
                  type="button"
                  onClick={() => userChange((current) => removeItem(current, item))}
                  aria-label={t("removeLabel", { name })}
                  className="absolute top-0 right-0 flex h-6 w-6 items-start justify-end pr-[3px] text-[16px] leading-[18.4px] text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            );
          })}
        </ul>

        <form role="search" method="get" action={pathname} onSubmit={submitSearch} className="relative mt-3 lg:order-2 lg:mt-0 lg:w-[238px]">
          {[...params.entries()]
            .filter(([name]) => name !== CATALOGUE_COMPARE_SEARCH_PARAM)
            .map(([name, value], index) => <input key={`${name}-${index}`} type="hidden" name={name} value={value} />)}
          <label htmlFor={SEARCH_INPUT_ID} className="sr-only">{t("searchLabel")}</label>
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-[14px] size-[18px] -translate-y-1/2" />
          <input
            id={SEARCH_INPUT_ID}
            name={CATALOGUE_COMPARE_SEARCH_PARAM}
            type="search"
            value={query}
            disabled={full}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape" && showHits) closeHits(); }}
            placeholder={t("searchLabel")}
            maxLength={COMPARE_SEARCH_MAX_LENGTH}
            aria-controls={showHits ? SEARCH_RESULTS_ID : undefined}
            className="g-input my-0 h-[53px] py-[14px] pr-[14px] pl-10 text-[16px] leading-[23.2px]"
          />
          <div aria-live="polite">
            {showHits && search && (
              <div
                id={SEARCH_RESULTS_ID}
                className="absolute inset-x-0 bottom-full z-10 mb-[3.2px] max-h-[50vh] overflow-y-auto bg-white shadow-garmin-raised lg:top-full lg:bottom-auto lg:mt-[3.2px] lg:mb-0"
              >
                {hits.length ? (
                  <ul>
                    {hits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          disabled={full}
                          onClick={() => addHit(hit)}
                          aria-label={t("searchAdd", { name: hit.name })}
                          className="flex w-full items-center gap-2 px-[14px] py-2 text-left text-[14px] leading-[21px] text-black hover:bg-muted focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring"
                        >
                          {hit.image && <Image src={hit.image} alt="" width={40} height={40} sizes="40px" className="size-10 shrink-0 object-contain" />}
                          <span className="min-w-0">{hit.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-[14px] py-2 text-[14px] leading-[21px]">{t("searchEmpty", { query: search.query })}</p>
                )}
              </div>
            )}
          </div>
        </form>

        <div className="mt-4 lg:order-4 lg:mt-0 lg:ml-2">
          {canCompare ? (
            <Link href={selectionHref(items)} className="g-btn g-btn--lg g-btn--primary h-[52px] w-full lg:w-[140px]">
              {t("compare")}
            </Link>
          ) : (
            // Focusable but inert below two products; the status line ("Select at least 2 products") says why.
            <button
              type="button"
              aria-disabled="true"
              aria-describedby={STATUS_ID}
              onClick={(event) => event.preventDefault()}
              className="g-btn g-btn--lg h-[52px] w-full lg:w-[140px]"
            >
              {t("compare")}
            </button>
          )}
        </div>
      </div>
      <p role="status" className="sr-only">{announce || acted ? t("status", { count: items.length, max: COMPARE_MAX_ITEMS }) : ""}</p>
    </section>
  );
}
