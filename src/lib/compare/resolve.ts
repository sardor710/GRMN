// Task C-a (plan 2026-11-21 §3): one compare column from the product page's own detail read, for both
// backends. PostgreSQL details carry `commerce.variants[]` with each variant's effective, localized content;
// legacy JSON details carry `variantModel` (variants share the product's specs there).
// Pure: the detail reader is injected (src/lib/compare/server.ts passes getProductDetail).
import type { Locale } from "../../contracts/commerce";
import type { ProductDetail } from "../../types";
import type { ProductSpecItem, SpecGroup } from "../cms/types";
import { toMinor, type KztAmount } from "../money.ts";
import { resolveInitialVariantId, variantTabContent } from "../catalog/variant-selection.ts";
import { COMPARE_MAX_ITEMS, COMPARE_VALUE_MAX_LENGTH, type CompareItemRef } from "./compare-items.ts";

/** One entry of a column's size picker. */
export interface CompareVariantOption { sku: string; label: string }

/** Everything a compare column shows, for the chosen variant (or the product when it has no variants). */
export interface CompareItem {
  productId: string;
  /** The SKU actually shown: the requested one when it is on sale, else the default variant's; the part number without variants. */
  sku: string;
  name: string;
  image: string;
  /** For `<Price amount>`; null when the stored price cannot be read (never a guessed number). */
  price: KztAmount | null;
  /** For `<Price compareAt>` (the original price; `Price` shows a sale only when it is higher). */
  compareAt?: KztAmount;
  /** A legacy USD price with no KZT rate: pass to `<Price unconverted>`. */
  unconverted?: true;
  /**
   * The size picker: on-sale variants in the product's own option order (legacy: option value positions;
   * PostgreSQL, whose detail carries no positions: numeric-aware label order). Empty for a product without
   * variants, or with a single variant and no options (nothing to choose).
   */
  variants: CompareVariantOption[];
  /** The chosen variant's effective, localized specs (feed to `buildCompareRows`). */
  content: { specs: ProductSpecItem[]; specGroups: SpecGroup[] };
}

/** Reads one product's storefront detail, as the product page does; undefined when unknown or unpublished. */
export type CompareDetailReader = (productId: string, locale: Locale) => Promise<ProductDetail | undefined>;

const LABEL_SEPARATOR = " · ";
/** Numeric-aware label order ("42 mm" < "47 mm" < "51 mm"), for variant lists that carry no positions. */
const labelOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const FALLBACK_IMAGE = "/images/products/1228429.jpg";

const amountFromMajor = (value: number | string | undefined): KztAmount | null =>
  value === undefined || value === "" || toMinor({ major: value }) === null ? null : { major: value };

function contentOf(detail: ProductDetail, variantId: string): CompareItem["content"] {
  const tab = variantTabContent(detail, variantId);
  return { specs: tab.specs.map((s) => ({ label: s.label, value: s.value })), specGroups: (tab.specGroups ?? []).map((g) => ({ title: g.title, items: g.items.map((s) => ({ label: s.label, value: s.value })) })) };
}

function fromCommerce(detail: ProductDetail, commerce: NonNullable<ProductDetail["commerce"]>, requestedSku: string | undefined): CompareItem {
  const productImage = detail.gallery[0]?.src || commerce.image?.url || FALLBACK_IMAGE;
  const order = Object.keys(commerce.optionNames ?? {});
  const label = (options: Readonly<Record<string, string>>, name: string, sku: string) => {
    const keys = [...order.filter((key) => key in options), ...Object.keys(options).filter((key) => !order.includes(key))];
    const values = keys.map((key) => options[key]?.trim()).filter((value): value is string => Boolean(value));
    return values.length ? values.join(LABEL_SEPARATOR) : name.trim() || sku;
  };
  // Every PostgreSQL product has at least one variant; a single variant without options is not a size choice.
  const choosable = commerce.variants.length > 1 || commerce.variants.some((v) => Object.keys(v.options).length > 0);
  // The PostgreSQL detail lists variants default-first and carries no option value positions: sort by label.
  const variants = choosable
    ? commerce.variants.map((v) => ({ sku: v.sku, label: label(v.options, v.name, v.sku) })).sort((a, b) => labelOrder.compare(a.label, b.label))
    : [];
  const base = { productId: detail.id, name: detail.title, variants };
  const chosenId = resolveInitialVariantId(commerce.variants, requestedSku, commerce.selectedVariantId);
  const chosen = commerce.variants.find((v) => v.id === chosenId);
  const price = chosen?.price ?? commerce.price;
  return {
    ...base,
    sku: chosen?.sku ?? detail.partNumber,
    image: chosen?.gallery?.[0]?.url || productImage,
    price: { minor: price.selling.amountMinor },
    ...(price.compareAt ? { compareAt: { minor: price.compareAt.amountMinor } } : {}),
    content: contentOf(detail, chosen?.id ?? ""),
  };
}

function fromLegacy(detail: ProductDetail, requestedSku: string | undefined): CompareItem {
  const productImage = detail.gallery[0]?.src || FALLBACK_IMAGE;
  const model = detail.variantModel;
  const options = model?.options ?? [];
  const onSale = (model?.variants ?? []).filter((v) => v.status === "active");
  type LegacyVariant = (typeof onSale)[number];
  // The picker follows the product's own option order: each option's value position, option by option.
  const rank = (v: LegacyVariant) => options.map((o) => {
    const at = o.values.findIndex((value) => value.id === v.selections[o.id]);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  });
  const byOptionOrder = (a: LegacyVariant, b: LegacyVariant) => {
    const ra = rank(a), rb = rank(b);
    const at = ra.findIndex((value, i) => value !== rb[i]);
    return at < 0 ? 0 : ra[at] - rb[at];
  };
  const variants = [...onSale].sort(byOptionOrder).map((v) => {
    const values = options.map((o) => {
      const valueId = v.selections[o.id];
      return valueId ? o.values.find((value) => value.id === valueId)?.label.trim() : undefined;
    }).filter((value): value is string => Boolean(value));
    return { sku: v.sku, label: values.length ? values.join(LABEL_SEPARATOR) : v.title.trim() || v.sku };
  });
  const defaultId = (onSale.find((v) => v.isDefault) ?? onSale[0])?.id;
  const chosen = onSale.find((v) => v.id === resolveInitialVariantId(onSale, requestedSku, defaultId));
  const images = new Map((model?.images ?? []).map((img) => [img.id, img.src]));
  const ownImage = chosen?.imageIds.map((id) => images.get(id)).find((src): src is string => Boolean(src));
  const compareAt = chosen ? amountFromMajor(chosen.originalPrice) : null;
  return {
    productId: detail.id,
    name: detail.title,
    variants,
    sku: chosen?.sku ?? detail.partNumber,
    image: ownImage || productImage,
    price: amountFromMajor(chosen ? chosen.price : detail.price),
    ...(compareAt ? { compareAt } : {}),
    ...(detail.currency === "USD" ? { unconverted: true as const } : {}),
    // Legacy variants have no own content: every size shows the product's specs.
    content: contentOf(detail, ""),
  };
}

/** The compare column for one product detail and the requested SKU (case-insensitive; unknown → default variant). */
export function compareItemFromDetail(detail: ProductDetail, requestedSku: string | undefined): CompareItem {
  return detail.commerce ? fromCommerce(detail, detail.commerce, requestedSku) : fromLegacy(detail, requestedSku);
}

/**
 * Final review I2: product detail reads bypass the listing limit and the pool is small (DATABASE_POOL_MAX
 * defaults to 5, with a 2 s connect timeout), so one compare request reads at most this many at a time and
 * never starves checkout.
 */
export const COMPARE_READ_CONCURRENCY = 2;

/** A tiny FIFO limiter: at most `limit` tasks run at once; a failing task frees its slot like any other. */
function limiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = () => { active--; waiting.shift()?.(); };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resume) => waiting.push(resume));
    active++;
    try { return await task(); } finally { release(); }
  };
}

/** The compare columns, plus the products whose read failed (not the same as unknown: they may come back). */
export interface CompareResult {
  items: CompareItem[];
  /** Product ids whose read threw, in request order, once each; their columns are missing from `items`. */
  unavailable: string[];
}

/**
 * The compare columns for the requested refs, in order: at most five, read with `read` at most
 * COMPARE_READ_CONCURRENCY at a time and once per product (several sizes of one product share one read).
 * Unknown, unpublished or failing products are dropped (`onError` is told about each dropped column, so the
 * caller can log it with its product id); never throws. Columns that resolve to the same product and SKU
 * (case-insensitive) are one column: a stored ref to a renamed SKU falls back to the default variant,
 * which the shopper may also have added (final review I3). The first one keeps its place.
 */
export async function collectCompareItems(
  items: readonly CompareItemRef[] | null | undefined,
  locale: Locale,
  read: CompareDetailReader,
  onError?: (error: unknown, ref: CompareItemRef) => void,
): Promise<CompareItem[]> {
  return (await collectCompareResult(items, locale, read, onError)).items;
}

/**
 * collectCompareItems plus `unavailable`: the products whose read failed. A failed read is not "this product is
 * gone", so the page keeps those products in the shopper's stored selection (review round, item 2).
 */
export async function collectCompareResult(
  items: readonly CompareItemRef[] | null | undefined,
  locale: Locale,
  read: CompareDetailReader,
  onError?: (error: unknown, ref: CompareItemRef) => void,
): Promise<CompareResult> {
  const unavailable: string[] = [];
  const valid = (value: unknown): value is string => typeof value === "string" && value.trim() !== "" && value.trim().length <= COMPARE_VALUE_MAX_LENGTH;
  const refs = (Array.isArray(items) ? items : [])
    .filter((ref): ref is CompareItemRef => ref !== null && typeof ref === "object" && valid(ref.productId))
    .slice(0, COMPARE_MAX_ITEMS)
    .map((ref) => ({ productId: ref.productId.trim(), ...(valid(ref.sku) ? { sku: ref.sku.trim() } : {}) }));
  const reads = new Map<string, Promise<ProductDetail | undefined>>();
  const limit = limiter(COMPARE_READ_CONCURRENCY);
  const readOnce = (productId: string) => {
    let pending = reads.get(productId);
    if (!pending) {
      // Wrapped so a synchronous throw from `read` also becomes a rejection handled per column below.
      pending = limit(() => Promise.resolve().then(() => read(productId, locale)));
      reads.set(productId, pending);
    }
    return pending;
  };
  const columns = await Promise.all(refs.map(async (ref) => {
    try {
      const detail = await readOnce(ref.productId);
      return detail ? compareItemFromDetail(detail, ref.sku) : null;
    } catch (error) {
      onError?.(error, ref);
      if (!unavailable.includes(ref.productId)) unavailable.push(ref.productId);
      return null;
    }
  }));
  const seen = new Set<string>();
  const kept = columns.filter((column): column is CompareItem => {
    if (column === null) return false;
    const key = `${column.productId}\u0000${column.sku.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Request order (the catch blocks above can run in any order).
  const order = refs.map((ref) => ref.productId);
  return { items: kept, unavailable: unavailable.sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
}
