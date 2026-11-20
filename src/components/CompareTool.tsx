"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAppLocale } from "@/i18n/useAppLocale";
import { Price } from "@/components/ui/price";
import { COMPARE_MAX_ITEMS, compareSearch, isDifferentRow, type CompareGroup, type CompareItemRef } from "@/lib/compare/compare-items";
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
  /** `diff=1` in the URL. */
  onlyDifferences: boolean;
  search?: CompareSearch | null;
  /** "Return to shopping" and the empty state link (no locale prefix). */
  catalogueHref: string;
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
const TILE_HOVER = "transition-shadow duration-[135ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:shadow-[0_1px_3px_1px_rgba(77,77,77,0.2),0_2px_8px_4px_rgba(77,77,77,0.1)]";

const refOf = (item: CompareColumn): CompareItemRef => ({ productId: item.productId, ...(item.variants.length ? { sku: item.sku } : {}) });
const sameRef = (a: CompareItemRef, b: CompareItemRef) => a.productId === b.productId && (a.sku ?? "").toLowerCase() === (b.sku ?? "").toLowerCase();
const refValue = (ref: CompareItemRef) => (ref.sku ? `${ref.productId}~${ref.sku}` : ref.productId);

/** The Garmin product comparison (docs/research/www.garmin.com/components/Compare.spec.md). The URL is the state. */
export function CompareTool({ items, groups, onlyDifferences, search, catalogueHref }: CompareToolProps) {
  const t = useTranslations("Compare");
  const locale = useAppLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [diff, setDiff] = useState(onlyDifferences);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [adding, setAdding] = useState(Boolean(search));
  const [query, setQuery] = useState(search?.query ?? "");

  const refs = items.map(refOf);
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
  const add = (productId: string) => {
    setAdding(false);
    setQuery("");
    go([...refs, { productId }], "push");
  };
  const changeSize = (index: number, sku: string) => go(refs.map((ref, i) => (i === index ? { productId: ref.productId, sku } : ref)), "replace");
  const toggleDiff = (checked: boolean) => {
    setDiff(checked);
    // Client-only state: every row is already here, so only the address changes (Next.js syncs history.replaceState).
    if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", hrefFor(refs, { onlyDifferences: checked }));
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    go(refs, "replace", query);
  };
  const toggleGroup = (key: string) => setCollapsed((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  const shownGroups = groups
    .map((group) => ({ ...group, rows: diff ? group.rows.filter(isDifferentRow) : group.rows }))
    .filter((group) => group.rows.length > 0);

  // Slot i is hidden under 1024px when it is past the visible mobile slots.
  const slotVisibility = (i: number) => (i >= mobileSlots ? "max-lg:hidden" : "");
  // Every value cell has a right rule except the last one shown at that width.
  const cellRule = (i: number) => (i === SLOTS - 1 ? "" : i === mobileSlots - 1 ? "border-r border-garmin-control max-lg:border-r-0" : "border-r border-garmin-control");
  const grid = `grid lg:grid-cols-5 ${MOBILE_COLS[mobileSlots]}`;
  // A product compared in two sizes is told apart by its size in the column headers.
  const columnName = (item: CompareColumn) =>
    items.filter((other) => other.productId === item.productId).length > 1
      ? `${item.name}, ${item.variants.find((v) => v.sku === item.sku)?.label ?? item.sku}`
      : item.name;

  const renderCard = (item: CompareColumn, index: number) => {
    const others = refs.filter((_, i) => i !== index);
    const pickerId = `compare-size-${index}`;
    return (
      <div key={refValue(refs[index])} className="flex min-w-0 flex-col">
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
                <label htmlFor={pickerId} className="sr-only">{t("sizeLabel", { name: item.name })}</label>
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
          {refs.map((ref) => (
            <input key={refValue(ref)} type="hidden" name="item" value={refValue(ref)} />
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
            maxLength={100}
            className="g-input my-0 text-[14px]"
          />
          <button type="submit" className="g-btn g-btn--black g-btn--sm mt-2 w-full">{t("searchButton")}</button>
        </form>
        {search && (search.results.length ? (
          <ul className="mt-2">
            {search.results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => add(result.id)}
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
          <p role="status" className="mt-2 text-[14px] leading-[21px]">{t("searchEmpty", { query: search.query })}</p>
        ))}
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
            <svg aria-hidden="true" viewBox="0 0 18.2 11.2" className={`ml-[4.8px] h-[9.59px] w-[14.39px] shrink-0 fill-current max-lg:mx-2 ${open ? "rotate-180" : ""}`}>
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
                <span key={refValue(refs[i])} role="columnheader">{columnName(item)}</span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {group.rows.map((row) => (
              <div key={row.key} role="row" className={grid}>
                <div role="rowheader" className="col-span-full border-t border-garmin-control bg-muted px-4 py-[5.6px] text-left text-[12px] leading-[18px] font-bold uppercase">
                  <span className="max-lg:sticky max-lg:left-4 max-lg:inline-block max-lg:max-w-[calc(100vw-64px)]">{row.label}</span>
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

  return (
    <div className="text-black">
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
        <div className="max-lg:overflow-x-auto">
          <div className={MOBILE_WIDTH[mobileSlots]}>
            <div className="bg-white py-4">
              <div className={`${grid} gap-4`}>{slots}</div>
              {items.length > 0 && (
                <div className={`pt-4 ${PINNED}`}>
                  <label className="inline-flex cursor-pointer items-center gap-[5.6px] py-2 text-[16px] leading-4">
                    <input type="checkbox" className="g-checkbox" checked={diff} onChange={(event) => toggleDiff(event.target.checked)} />
                    {t("onlyDifferences")}
                  </label>
                </div>
              )}
            </div>
            {shownGroups.map(renderGroup)}
          </div>
        </div>

        {items.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-[16px] leading-[24px]">{t("empty", { max: SLOTS })}</p>
            <Link href={catalogueHref} className="g-btn g-btn--black mt-6">{t("emptyLink")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
