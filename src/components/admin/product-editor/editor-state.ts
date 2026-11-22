// Pure editor-state helpers for the PostgreSQL product editor (plan M3.2). No React, no DOM, so they are
// unit tested directly (tests/unit/product-editor-state.test.mjs).
//
// Contract with the admin catalog API: GET /api/admin/catalog/products/:key returns the full payload; the
// save sends back exactly what GET returned (`base`) with the edited fields laid over it. Fields the editor
// does not touch (compatibility, upsell relations, features, read-only echoes) round-trip unchanged.
import type { CMSProduct, ProductImage, ProductOption, ProductSource, ProductStatus, ProductVariant, SpecGroup } from "../../../lib/cms/types.ts";
import { matchBreadcrumbCategories } from "../../../lib/admin/category-breadcrumb.ts";
import type { TaxonomyNode } from "../../../contracts/admin-catalog.ts";
import { normalizeCategories, type CategoryRef } from "../../../lib/admin/taxonomy-tree.ts";
import { compatibilityCommand, compatibilityFromPayload, emptyCompatibility, type CompatibilityForm } from "./compatibility-state.ts";

export type RawPayload = Record<string, unknown>;
export interface InTheBoxItem { label: string; image?: string }
type Level = CMSProduct["level"];
type CaseSize = CMSProduct["caseSize"];

export interface EditorForm {
  name: string;
  sku: string;
  /** Simple products only; null = not entered yet. */
  price: number | null;
  originalPrice: number | null;
  priceSuffix: string;
  /** Simple products only: on-hand quantity at the main location. */
  stock: number;
  description: string;
  badge: string;
  family: string;
  activities: string[];
  level: Level;
  caseSize: CaseSize;
  status: ProductStatus;
  isFeatured: boolean;
  image: string;
  images: ProductImage[];
  defaultImageId: string;
  options: ProductOption[];
  variants: ProductVariant[];
  overviewHtml: string;
  specGroups: SpecGroup[];
  inTheBox: InTheBoxItem[];
  categories: CategoryRef[];
  related: string[];
  /** Accessory ↔ device links (compatibility-state.ts); an untouched side is sent back as GET returned it. */
  compatibility: CompatibilityForm;
  source?: ProductSource;
  seoTitle: string;
  seoDescription: string;
  focusKeywords: string[];
  canonicalUrl: string;
  noIndex: boolean;
  ogImage: string;
}

const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const LEVELS: Level[] = ["Entry", "Advanced", "Premium", "Youth"];
const SIZES: CaseSize[] = ["Small", "Medium", "Large"];
const STATUSES: ProductStatus[] = ["published", "draft", "archived"];

/** A brand-new product: nothing preset (no fake specs, no in-the-box items, no categories, no activities). */
export function blankForm(): EditorForm {
  return {
    name: "", sku: "", price: null, originalPrice: null, priceSuffix: "", stock: 0, description: "", badge: "NONE", family: "",
    activities: [], level: "Premium", caseSize: "Medium", status: "draft", isFeatured: false, image: "", images: [], defaultImageId: "",
    options: [], variants: [], overviewHtml: "", specGroups: [], inTheBox: [], categories: [], related: [], compatibility: emptyCompatibility(),
    seoTitle: "", seoDescription: "", focusKeywords: [], canonicalUrl: "", noIndex: false, ogImage: "",
  };
}

/** Old string items and {label, image?} objects both load; blanks are dropped. */
export function normalizeInTheBox(value: unknown): InTheBoxItem[] {
  return arr<unknown>(value).flatMap((item): InTheBoxItem[] => {
    if (typeof item === "string") return item.trim() ? [{ label: item.trim() }] : [];
    if (item && typeof item === "object" && typeof (item as InTheBoxItem).label === "string") {
      const { label, image } = item as InTheBoxItem;
      if (!label.trim()) return [];
      return [image ? { label: label.trim(), image } : { label: label.trim() }];
    }
    return [];
  });
}

/** Grouped specs; a legacy flat list becomes one "General" group so it is editable the same way. */
export function specGroupsFrom(payload: RawPayload): SpecGroup[] {
  const groups = arr<SpecGroup>(payload.specGroups).filter(group => group && typeof group === "object" && Array.isArray(group.items));
  if (groups.length) return groups.map(group => ({ title: str(group.title), items: group.items.map(item => ({ label: str(item.label), value: str(item.value) })) }));
  const flat = arr<{ label?: unknown; value?: unknown }>(payload.specs).map(item => ({ label: str(item?.label), value: str(item?.value) })).filter(item => item.label || item.value);
  return flat.length ? [{ title: "General", items: flat }] : [];
}

export const defaultImageSrc = (images: ProductImage[], defaultImageId: string): string =>
  (images.find(image => image.id === defaultImageId) ?? images[0])?.src ?? "";

/** GET payload → editable form. */
export function formFromPayload(payload: RawPayload, makeId: (prefix: string) => string = prefix => `${prefix}-legacy`): EditorForm {
  const blank = blankForm();
  const legacyImage = str(payload.image);
  let images = arr<ProductImage>(payload.images);
  if (!images.length && legacyImage) images = [{ id: makeId("img"), src: legacyImage, alt: str(payload.name), source: "url" }];
  const defaultImageId = images.some(image => image.id === payload.defaultImageId) ? str(payload.defaultImageId) : images[0]?.id ?? "";
  const relations = (payload.relations && typeof payload.relations === "object" ? payload.relations : {}) as { related?: unknown };
  return {
    ...blank,
    name: str(payload.name),
    sku: str(payload.sku),
    price: num(payload.price),
    originalPrice: num(payload.originalPrice),
    priceSuffix: str(payload.priceSuffix),
    stock: num(payload.stock) ?? 0,
    description: str(payload.description),
    badge: str(payload.badge, "NONE") || "NONE",
    family: str(payload.family),
    activities: arr<string>(payload.activities).filter(item => typeof item === "string"),
    level: LEVELS.find(level => level === payload.level) ?? blank.level,
    caseSize: SIZES.find(size => size === payload.caseSize) ?? blank.caseSize,
    status: STATUSES.find(status => status === payload.status) ?? "draft",
    isFeatured: payload.isFeatured === true,
    image: legacyImage || defaultImageSrc(images, defaultImageId),
    images,
    defaultImageId,
    options: arr<ProductOption>(payload.options),
    variants: arr<ProductVariant>(payload.variants),
    overviewHtml: str(payload.overviewHtml),
    specGroups: specGroupsFrom(payload),
    inTheBox: normalizeInTheBox(payload.inTheBox),
    categories: normalizeCategories(arr<CategoryRef>(payload.categories).filter(item => item && typeof item.key === "string")),
    related: arr<string>(relations.related).filter(item => typeof item === "string"),
    compatibility: compatibilityFromPayload(payload),
    ...(payload.source && typeof payload.source === "object" ? { source: payload.source as ProductSource } : {}),
    seoTitle: str(payload.seoTitle),
    seoDescription: str(payload.seoDescription),
    focusKeywords: arr<string>(payload.focusKeywords),
    canonicalUrl: str(payload.canonicalUrl),
    noIndex: payload.noIndex === true,
    ogImage: str(payload.ogImage),
  };
}

/** Trims labels/values, drops empty rows and groups that end up empty. */
export function cleanSpecGroups(groups: SpecGroup[]): SpecGroup[] {
  return groups
    .map(group => ({ title: group.title.trim(), items: group.items.map(item => ({ label: item.label.trim(), value: item.value.trim() })).filter(item => item.label || item.value) }))
    .filter(group => group.items.length > 0);
}

/** Validation the server would reject anyway, reported with the tab to open. */
export function validateForm(form: EditorForm): { tab: "general" | "variants" | "media" | "box"; message: string } | null {
  if (!form.name.trim()) return { tab: "general", message: "Give the product a name." };
  if (!form.variants.length) {
    if (!form.sku.trim()) return { tab: "general", message: "A product without variants needs a SKU." };
    if (form.price === null || form.price < 0) return { tab: "general", message: "A product without variants needs a price." };
  }
  if (form.variants.some(variant => !variant.sku.trim())) return { tab: "variants", message: "Every variant needs a SKU." };
  // A variant may have no price (null round-trips as null, never 0 KZT); only an active one must have one.
  const unpriced = form.variants.find(variant => variant.status === "active" && variant.price === null);
  if (unpriced) return { tab: "variants", message: `Active variant ${unpriced.sku.trim()} needs a price (or set it to draft).` };
  if (form.categories.length && form.categories.filter(category => category.primary).length !== 1) return { tab: "general", message: "Mark exactly one category as primary." };
  if (form.inTheBox.some(item => !item.label.trim())) return { tab: "box", message: "Every in-the-box item needs a name (or delete the empty row)." };
  return null;
}

const KZT_MONEY = /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;
/** Exact KZT for the API (at most two decimals), or undefined when not a valid amount. */
export function moneyValue(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  const rounded = Math.round(value * 100) / 100;
  return KZT_MONEY.test(String(rounded)) ? rounded : undefined;
}

/**
 * Form + what GET returned → the POST/PUT body. New products omit `id`; updates carry `version`.
 * Variant products never send product-level stock; simple products send stock with the loaded baseline,
 * so a concurrent sale or restock becomes a 409 STOCK_CONFLICT instead of being overwritten.
 */
export function buildCommand(base: RawPayload, form: EditorForm, isNew: boolean): RawPayload {
  const specGroups = cleanSpecGroups(form.specGroups);
  const command: RawPayload = { ...base };
  delete command.id;
  if (isNew) delete command.version;
  const relations = (base.relations && typeof base.relations === "object" ? base.relations : {}) as RawPayload;
  const hasVariants = form.variants.length > 0;
  Object.assign(command, {
    name: form.name.trim(),
    sku: form.sku.trim(),
    priceSuffix: form.priceSuffix,
    description: form.description,
    badge: form.badge,
    family: form.family.trim(),
    activities: form.activities,
    level: form.level,
    caseSize: form.caseSize,
    status: form.status,
    isFeatured: form.isFeatured,
    image: defaultImageSrc(form.images, form.defaultImageId) || form.image,
    images: form.images,
    defaultImageId: form.defaultImageId,
    options: form.options,
    variants: form.variants,
    overviewHtml: form.overviewHtml,
    specGroups,
    specs: specGroups.flatMap(group => group.items),
    // Items without a photo stay plain strings (what older storefront code expects).
    inTheBox: form.inTheBox.filter(item => item.label.trim()).map(item => (item.image ? { label: item.label.trim(), image: item.image } : item.label.trim())),
    categories: normalizeCategories(form.categories),
    relations: { ...relations, related: [...new Set(form.related)] },
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    focusKeywords: form.focusKeywords,
    canonicalUrl: form.canonicalUrl,
    noIndex: form.noIndex,
    ogImage: form.ogImage,
  });
  const compatibility = compatibilityCommand(base, form.compatibility);
  if (compatibility) command.compatibility = compatibility; else delete command.compatibility;
  if (form.source) command.source = form.source; else delete command.source;
  if (!form.defaultImageId) delete command.defaultImageId;
  const price = moneyValue(form.price);
  if (price !== undefined) command.price = price; else delete command.price;
  const compareAt = moneyValue(form.originalPrice);
  if (compareAt !== undefined) command.originalPrice = compareAt;
  else if (isNew) delete command.originalPrice;
  else command.originalPrice = null;
  if (hasVariants) {
    delete command.stock;
    delete command.stockBaseline;
  } else {
    command.stock = Math.max(0, Math.trunc(form.stock || 0));
    if (isNew || typeof base.stockBaseline !== "number") delete command.stockBaseline;
  }
  return command;
}

/** Imported garmin.com draft → form (always a draft). Categories come from the breadcrumb when they match. */
export function applyImportedDraft(form: EditorForm, draft: Partial<CMSProduct>, taxonomy: readonly TaxonomyNode[] | null): EditorForm {
  const images = draft.images ?? [];
  const defaultImageId = images.some(image => image.id === draft.defaultImageId) ? str(draft.defaultImageId) : images[0]?.id ?? "";
  let categories: CategoryRef[] = [];
  if (taxonomy?.length) {
    const match = matchBreadcrumbCategories(taxonomy, { category: draft.category, subCategory: draft.subCategory, family: draft.family });
    categories = normalizeCategories(match.keys.map(key => ({ key, primary: key === match.primaryKey })));
  }
  return {
    ...form,
    name: draft.name ?? form.name,
    sku: draft.sku ?? form.sku,
    price: num(draft.price) ?? form.price,
    originalPrice: num(draft.originalPrice),
    priceSuffix: draft.priceSuffix ?? "",
    description: draft.description ?? "",
    badge: draft.badge || "NONE",
    family: draft.family ?? form.family,
    activities: draft.activities ?? [],
    level: draft.level ?? form.level,
    caseSize: draft.caseSize ?? form.caseSize,
    stock: num(draft.stock) ?? form.stock,
    // Imported products start as drafts until someone reviews prices and stock.
    status: "draft",
    image: defaultImageSrc(images, defaultImageId) || str(draft.image),
    images,
    defaultImageId,
    options: draft.options ?? [],
    variants: draft.variants ?? [],
    overviewHtml: draft.overviewHtml ?? "",
    specGroups: specGroupsFrom(draft as RawPayload),
    inTheBox: normalizeInTheBox(draft.inTheBox),
    categories,
    ...(draft.source ? { source: draft.source } : {}),
    seoTitle: draft.seoTitle ?? "",
    seoDescription: draft.seoDescription ?? "",
    focusKeywords: draft.focusKeywords ?? [],
    canonicalUrl: draft.canonicalUrl ?? "",
    ogImage: draft.ogImage ?? "",
  };
}

export type SaveErrorKind = "version" | "stock" | "sku" | "invalid" | "auth" | "notFound" | "network" | "other";
export interface SaveError { kind: SaveErrorKind; message: string; conflicts: string[]; reloadable: boolean }

/** Maps an API error body to a message a content manager can act on. */
export function describeSaveError(status: number, body: unknown): SaveError {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const error = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : {};
  const code = str(error.code) || str(record.code);
  const serverMessage = str(error.message) || (typeof record.error === "string" ? record.error : "");
  const conflicts = arr<string>(error.conflicts ?? record.conflicts).filter(item => typeof item === "string");
  if (status === 409 && code === "STOCK_CONFLICT")
    return { kind: "stock", conflicts, reloadable: true, message: "Stock changed while you were editing (an order or a restock). Nothing was saved. Reload to see the current stock, then enter your change again." };
  if (status === 409 && code === "SKU_CONFLICT")
    return { kind: "sku", conflicts, reloadable: false, message: conflicts.length ? `These SKUs already belong to another product: ${conflicts.join(", ")}. Change them and save again.` : serverMessage || "A SKU already belongs to another product." };
  if (status === 409)
    return { kind: "version", conflicts, reloadable: true, message: "Someone else saved this product after you opened it. Nothing was saved. Reload to get their version, then redo your change." };
  if (status === 400) return { kind: "invalid", conflicts, reloadable: false, message: serverMessage ? `Check the form: ${serverMessage}` : "Some fields are not valid." };
  if (status === 401) return { kind: "auth", conflicts, reloadable: false, message: "Your admin session expired. Sign in again in another tab, then save." };
  if (status === 403) return { kind: "auth", conflicts, reloadable: false, message: "Your role cannot change products or stock." };
  if (status === 404) return { kind: "notFound", conflicts, reloadable: false, message: "This product no longer exists." };
  if (status === 0) return { kind: "network", conflicts, reloadable: false, message: "Network error: the product was not saved. Check the connection and try again." };
  return { kind: "other", conflicts, reloadable: false, message: serverMessage || `Save failed (HTTP ${status}).` };
}

/**
 * Whether the editor must (re)load `key`. After a create, the save response already is the stored payload
 * and becomes the base: the key change it causes must not refetch, or edits typed meanwhile would be wiped.
 */
export const shouldLoadProduct = (key: string | null, adoptedKey: string | null): boolean => key !== null && key !== adoptedKey;

/** Stable string for unsaved-change detection. */
export const formSignature = (form: EditorForm): string => JSON.stringify(form);
