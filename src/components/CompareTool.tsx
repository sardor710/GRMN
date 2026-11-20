"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAppLocale } from "@/i18n/useAppLocale";
import { Price } from "@/components/ui/price";
import { COMPARE_DIFF_PARAM, COMPARE_MAX_ITEMS, COMPARE_SEARCH_MAX_LENGTH, compareSearch, isDifferentRow, renderedQuery, type CompareGroup, type CompareItemRef } from "@/lib/compare/compare-items";
import type { CompareItem } from "@/lib/compare/resolve";

/** One compare column as the page sends it: the compare read without its spec content, plus the Shop link. */
export type CompareColumn = Omit<CompareItem, "content"> & { href: string };
/** One "+" tile search hit. */
export interface CompareSearchResult { id: string; name: string; image: string }
/** The "+" tile's search: the text searched for and the first hits (never the whole catalogue). */
export interface CompareSearch { query: string; results: CompareSearchResult[] }

export interface CompareToolProps {
  items: CompareColumn[];
  /** `buildCompareRows` over the columns' content, in column order. */
  groups: CompareGroup[];
  search?: CompareSearch | null;
  /** "Return to shopping" and the empty state link (no locale prefix). */
  catalogueHref: string;
  /** `renderedQuery(...)` of the URL the server rendered these props for. */
  renderedFor: string;
}

/** garmin.com compare shows five slots at ≥1024px: products, the "+" tile, then grey placeholders. */
const SLOTS = COMPARE_MAX_ITEMS;
// Under 1024px every slot is half the scroller wide (two visible), so the content is (slots / 2) × 100% wide.
const MOBILE_COLS: Record<number, string> = { 2: "max-lg:grid-cols-2", 3: "max-lg:grid-cols-3", 4: "max-lg:grid-cols-4", 5: "max-lg:grid-cols-5" };
const MOBILE_WIDTH: Record<number, string> = { 2: "max-lg:w-full", 3: "max-lg:w-[150%]", 4: "max-lg:w-[200%]", 5: "max-lg:w-[250%]" };
const ADD_PANEL_ID = "compare-add-panel";
const SEARCH_INPUT_ID = "compare-search";
/** Text pinned to the left edge of the horizontal scroller under 1024px (the scroller is the viewport minus 32px). */
const PINNED = "max-lg:sticky max-lg:left-0 max-lg:w-[calc(100vw-32px)]";
const TILE_HOVER = "transition-shadow duration-[135ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:shadow-garmin-raised-hover";

const refOf = (item: CompareColumn): CompareItemRef => ({ productId: item.productId, ...(item.variants.length ? { sku: item.sku } : {}) });
const sameRef = (a: CompareItemRef, b: CompareItemRef) => a.productId === b.productId && (a.sku ?? "").toLowerCase() === (b.sku ?? "").toLowerCase();
const sizeOf = (item: CompareColumn) => (item.variants.length >= 2 ? item.variants.find((v) => v.sku === item.sku)?.label : undefined);
const refValue = (ref: CompareItemRef) => (ref.sku ? `${ref.productId}~${ref.sku}` : ref.productId);
/** Final review I3: React keys are unique by position too, even if two columns ever share a ref. */
const columnKey = (ref: CompareItemRef, index: number) => `${index}:${refValue(ref)}`;

/** The Garmin product comparison (docs/research/www.garmin.com/components/Compare.spec.md). The URL is the state. */
export function CompareTool({ items, groups, search, catalogueHref, renderedFor }: CompareToolProps) {
  const t = useTranslations("Compare");
  const locale = useAppLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const liveQuery = renderedQuery(params);
  // Next.js 16.2 can keep the old page after the first client navigation away from a URL with repeated `item`
  // parameters (it reuses the cached page segment). When the address and the rendered columns disagree, refetch.
  useEffect(() => {
    if (liveQuery !== renderedFor) router.refresh();
  }, [liveQuery, renderedFor, router]);
  // "Show only differences" lives in the URL (`diff=1`), so Back and Forward restore it.
  const diff = params.get(COMPARE_DIFF_PARAM) === "1";
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [adding, setAdding] = useState(Boolean(search));
  const [query, setQuery] = useState(search?.query ?? "");

  const refs = items.map(refOf);
  const hasItems = items.length > 0;

  // Garmin's compact column bar: once the column cards scroll out of view a fixed bar repeats each column's image,
  // name and size. It is aria-hidden (the real header stays in the DOM) and follows the table's horizontal scroll.
  const cardsRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const cards = cardsRef.current;
    if (!hasItems || !cards || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(cards);
    return () => observer.disconnect();
  }, [hasItems]);
  useEffect(() => {
    const scroller = scrollerRef.current, compact = compactRef.current;
    if (!stuck || !scroller || !compact) return;
    const sync = () => { compact.scrollLeft = scroller.scrollLeft; };
    sync();
    scroller.addEventListener("scroll", sync, { passive: true });
    return () => scroller.removeEventListener("scroll", sync);
  }, [stuck]);
  const canAdd = items.length < SLOTS;
  // Slots under 1024px: the columns plus the "+" tile, at least two.
  const mobileSlots = Math.max(2, Math.min(SLOTS, items.length + (canAdd ? 1 : 0)));

  const hrefFor = (next: readonly CompareItemRef[], extra: { search?: string; onlyDifferences?: boolean } = {}) => {
    const qs = compareSearch(next, { onlyDifferences: extra.onlyDifferences ?? diff, search: extra.search });
    return qs ? `${pathname}?${qs}` : pathname;
  };
  // Column changes reload the server data (price, image and specs of the chosen size) without a full page load.
  const go = (next: readonly CompareItemRef[], mode: "push" | "replace", searchText?: string) => {
    const href = hrefFor(next, { search: searchText });
    if (mode === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  };
  const remove = (index: number) => go(refs.filter((_, i) => i !== index), "push");
  const add = (ref: CompareItemRef) => {
    setAdding(false);
    setQuery("");
    go([...refs, ref], "push");
  };
  // A product already compared is added in its first size not compared yet; with every size compared it is not offered.
  const addRefFor = (productId: string): CompareItemRef | null => {
    const present = items.find((item) => item.productId === productId);
    if (!present) return { productId };
    const free = present.variants.find((variant) => !refs.some((ref) => sameRef(ref, { productId, sku: variant.sku })));
    return free ? { productId, sku: free.sku } : null;
  };
  const hits = (search?.results ?? []).flatMap((result) => {
    const ref = addRefFor(result.id);
    return ref ? [{ ...result, ref }] : [];
  });
  const changeSize = (index: number, sku: string) => go(refs.map((ref, i) => (i === index ? { productId: ref.productId, sku } : ref)), "replace");
  const toggleDiff = (checked: boolean) => {
    // Client-only: every row is already here, so only `diff` in the address changes (the rest of the query is kept
    // as is, so the columns are not refetched). Next.js syncs history.replaceState into useSearchParams, which
    // re-renders with the new filter. The state argument must be null: Next.js ignores its own history entries.
    const next = new URLSearchParams(params.toString());
    if (checked) next.set(COMPARE_DIFF_PARAM, "1");
    else next.delete(COMPARE_DIFF_PARAM);
    const qs = next.toString().replace(/%7E/gi, "~");
    if (typeof window !== "undefined") window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    go(refs, "replace", query);
  };
  const toggleGroup = (key: string) => setCollapsed((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  const shownGroups = groups
    .map((group) => ({ ...group, rows: diff ? group.rows.filter(isDifferentRow) : group.rows }))
    .filter((group) => group.rows.length > 0);
  const noDifferences = diff && groups.length > 0 && shownGroups.length === 0;

  // Slot i is hidden under 1024px when it is past the visible mobile slots.
  const slotVisibility = (i: number) => (i >= mobileSlots ? "max-lg:hidden" : "");
  // Every value cell has a right rule except the last one shown at that width.
  const cellRule = (i: number) => (i === SLOTS - 1 ? "" : i === mobileSlots - 1 ? "border-r border-garmin-control max-lg:border-r-0" : "border-r border-garmin-control");
  const grid = `grid lg:grid-cols-5 ${MOBILE_COLS[mobileSlots]}`;
  // A product compared in two sizes is told apart by its size in the column headers.
  const columnName = (item: CompareColumn) =>
    items.filter((other) => other.productId === item.productId).length > 1
      ? `${item.name}, ${sizeOf(item) ?? item.sku}`
      : item.name;
  const isRepeated = (item: CompareColumn) => items.filter((other) => other.productId === item.productId).length > 1;

  const renderCard = (item: CompareColumn, index: number) => {
    const others = refs.filter((_, i) => i !== index);
    const pickerId = `compare-size-${index}`;
    return (
      <div key={columnKey(refs[index], index)} className="flex min-w-0 flex-col">
        <div className="relative">
          <Link href={item.href} tabIndex={-1} aria-hidden="true" className={`flex h-[161px] items-center justify-center bg-white px-3 py-[18px] shadow-garmin-raised lg:h-[186px] ${TILE_HOVER}`}>
            <Image src={item.image} alt="" width={150} height={150} sizes="150px" className="h-[125px] w-[125px] object-contain lg:h-[150px] lg:w-[150px]" />
          </Link>
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={t("removeLabel", { name: columnName(item) })}
            title={t("remove")}
            className="absolute top-0 right-0 block bg-transparent px-2 text-[28px] leading-[32.2px] text-black"
          >
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col pt-4">
          <div className="flex-1">
            <p className="mb-4 text-[16px] leading-[24px]">
              <Link href={item.href} className="text-black hover:underline">{item.name}</Link>
            </p>
            {item.variants.length >= 2 && (
              <div className="mb-4">
                <label htmlFor={pickerId} className="sr-only">
                  {isRepeated(item) ? t("sizeLabelColumn", { name: item.name, position: index + 1 }) : t("sizeLabel", { name: item.name })}
                </label>
                <select id={pickerId} value={item.sku} onChange={(event) => changeSize(index, event.target.value)} className="g-select my-0 text-[14px]">
                  {item.variants.map((variant) => (
                    // A size already compared in another column is not offered again (it would merge the two columns).
                    <option key={variant.sku} value={variant.sku} disabled={variant.sku !== item.sku && others.some((ref) => sameRef(ref, { productId: item.productId, sku: variant.sku }))}>
                      {variant.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {item.price && (
              <div className="mb-8">
                <Price amount={item.price} compareAt={item.compareAt} unconverted={item.unconverted} locale={locale} size="card" />
              </div>
            )}
          </div>
          <div className="mb-4">
            <Link href={item.href} className="g-btn g-btn--primary">{t("shop")}</Link>
          </div>
        </div>
      </div>
    );
  };

  const renderAddTile = () => (
    <div key="add" className="flex min-w-0 flex-col">
      <button
        type="button"
        onClick={() => setAdding((open) => !open)}
        aria-expanded={adding}
        aria-controls={ADD_PANEL_ID}
        aria-label={t("addProduct")}
        className={`flex h-[161px] w-full items-center justify-center bg-white px-3 py-[18px] text-black shadow-garmin-raised lg:h-[186px] ${TILE_HOVER}`}
      >
        <svg aria-hidden="true" viewBox="0 0 64 65" fill="none" className="h-16 w-[63px]">
          <path d="M32 4.5V32.5M32 32.5V60.5M32 32.5H60M32 32.5H4" stroke="currentColor" strokeWidth="4" strokeLinecap="square" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={ADD_PANEL_ID} hidden={!adding} className="pt-4">
        {/* A plain GET form: it also works before hydration; with JavaScript it navigates client-side. */}
        <form role="search" method="get" action={pathname} onSubmit={submitSearch}>
          {refs.map((ref, i) => (
            <input key={columnKey(ref, i)} type="hidden" name="item" value={refValue(ref)} />
          ))}
          {diff && <input type="hidden" name="diff" value="1" />}
          <label htmlFor={SEARCH_INPUT_ID} className="sr-only">{t("searchLabel")}</label>
          <input
            id={SEARCH_INPUT_ID}
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchLabel")}
            maxLength={COMPARE_SEARCH_MAX_LENGTH}
            className="g-input my-0 text-[14px]"
          />
          <button type="submit" className="g-btn g-btn--black g-btn--sm mt-2 w-full">{t("searchButton")}</button>
        </form>
        <div aria-live="polite">
        {search && (hits.length ? (
          <ul className="mt-2">
            {hits.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => add(result.ref)}
                  aria-label={t("addLabel", { name: result.name })}
                  className="flex w-full items-center gap-2 py-2 text-left text-[14px] leading-[21px] text-black hover:underline"
                >
                  <Image src={result.image} alt="" width={40} height={40} sizes="40px" className="h-10 w-10 shrink-0 object-contain" />
                  <span className="min-w-0">{result.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] leading-[21px]">{t("searchEmpty", { query: search.query })}</p>
        ))}
        </div>
      </div>
    </div>
  );

  const renderPlaceholder = (slot: number) => (
    <div key={`slot-${slot}`} aria-hidden="true" className={`h-[161px] bg-muted lg:h-[186px] ${slotVisibility(slot)}`} />
  );

  const slots = [
    ...items.map(renderCard),
    ...(canAdd ? [renderAddTile()] : []),
    ...Array.from({ length: Math.max(0, SLOTS - items.length - 1) }, (_, i) => renderPlaceholder(items.length + 1 + i)),
  ];

  const renderGroup = (group: CompareGroup, groupIndex: number) => {
    const open = !collapsed.includes(group.key);
    const bodyId = `compare-group-${groupIndex}`;
    return (
      <section key={group.key} className="mb-4">
        <h2 className={`g-heading m-0 my-6 text-[24px] leading-[30px] uppercase lg:text-[32px] lg:leading-[40px] ${PINNED}`}>
          <button
            type="button"
            onClick={() => toggleGroup(group.key)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex w-full items-center p-2 text-left uppercase lg:w-auto"
          >
            <span className="g-heading min-w-0 flex-1">{group.title}</span>
            <svg aria-hidden="true" viewBox="0 0 18.2 11.2" className={`ml-[12.8px] h-[9.59px] w-[14.39px] shrink-0 fill-current max-lg:ml-[20.8px] ${open ? "rotate-180" : ""}`}>
              <path d="M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z" />
            </svg>
          </button>
        </h2>
        <div id={bodyId} hidden={!open} role="table" aria-label={group.title}>
          {/* Screen readers get a column header per product; sighted users see the product cards above. */}
          <div role="rowgroup" className="sr-only">
            <div role="row">
              <span role="columnheader">{t("specColumn")}</span>
              {items.map((item, i) => (
                <span key={columnKey(refs[i], i)} role="columnheader">{columnName(item)}</span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {group.rows.map((row) => (
              <div key={row.key} role="row" className={grid}>
                <div role="rowheader" className="col-span-full border-t border-garmin-control bg-muted px-4 py-[5.6px] text-left text-[12px] leading-[18px] font-bold uppercase">
                  {/* Under 1024px garmin.com centres the label in the visible band (its th keeps the UA centre); the span is
                      the visible band's inner width (scroller 100vw-32px minus the 16px paddings) and pinned to it. */}
                  <span className="max-lg:sticky max-lg:left-4 max-lg:inline-block max-lg:w-[calc(100vw-64px)] max-lg:text-center">{row.label}</span>
                </div>
                {Array.from({ length: SLOTS }, (_, slot) =>
                  slot < items.length ? (
                    <div key={slot} role="cell" className={`min-w-0 p-4 text-left text-[14px] leading-[21px] break-words whitespace-pre-line ${cellRule(slot)}`}>
                      {row.values[slot] ?? ""}
                    </div>
                  ) : (
                    <div key={slot} aria-hidden="true" className={`${cellRule(slot)} ${slotVisibility(slot)}`} />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };

  const compactBar = stuck && hasItems && (
    <div aria-hidden="true" data-compare-compact="" className="fixed inset-x-0 top-0 z-[1000] bg-white py-4 shadow-garmin-raised">
      <div className="mx-auto max-w-[1024px] px-4">
        <div ref={compactRef} className="max-lg:overflow-x-hidden">
          <div className={`${grid} gap-4 ${MOBILE_WIDTH[mobileSlots]}`}>
            {items.map((item, index) => (
              <div key={columnKey(refs[index], index)} className="flex h-24 min-w-0 items-center gap-2 bg-white px-3 shadow-garmin-raised">
                <Image src={item.image} alt="" width={60} height={60} sizes="60px" className="h-[60px] w-[60px] shrink-0 object-contain" />
                <div className="min-w-0 text-[14px] leading-[21px]">
                  <p className="line-clamp-2">{item.name}</p>
                  {sizeOf(item) && <p className="truncate text-[12px] leading-[18px] text-garmin-text-muted">{sizeOf(item)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="text-black">
      {compactBar}
      <header className="flex flex-col justify-center p-4 lg:p-6">
        <Link href={catalogueHref} className="flex items-center self-start text-[14px] leading-[21px] text-black underline transition-colors hover:text-garmin-black-hover">
          <svg aria-hidden="true" viewBox="0 0 11.2 18.1" className="mr-[9.6px] h-[14.53px] w-[8.98px] rotate-180 fill-current">
            <path d="M11.2 9l-9.1 9.1L0 16l6.9-7L0 2.1 2.1 0l9.1 9z" />
          </svg>
          {t("back")}
        </Link>
        <h1 className="g-heading g-h1 m-0 mt-8 text-center uppercase lg:mt-4">{t("title")}</h1>
      </header>

      <div className="mx-auto max-w-[1024px] px-4 pb-10">
        <div ref={scrollerRef} className="max-lg:overflow-x-auto">
          <div className={MOBILE_WIDTH[mobileSlots]}>
            <div className="bg-white py-4">
              <div ref={cardsRef} className={`${grid} gap-4`}>{slots}</div>
              {hasItems && (
                <div className={`pt-4 ${PINNED}`}>
                  <label className="inline-flex cursor-pointer items-center gap-[5.6px] py-2 text-[16px] leading-4">
                    <input type="checkbox" className="g-checkbox" checked={diff} onChange={(event) => toggleDiff(event.target.checked)} />
                    {t("onlyDifferences")}
                  </label>
                </div>
              )}
            </div>
            {shownGroups.map(renderGroup)}
            {hasItems && (
              <div role="status" className={PINNED}>
                {noDifferences && <p className="py-6 text-[16px] leading-[24px]">{t("noDifferences")}</p>}
              </div>
            )}
          </div>
        </div>

        {!hasItems && (
          <div className="py-10 text-center">
            <p className="text-[16px] leading-[24px]">{t("empty", { max: SLOTS })}</p>
            <Link href={catalogueHref} className="g-btn g-btn--black mt-6">{t("emptyLink")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
