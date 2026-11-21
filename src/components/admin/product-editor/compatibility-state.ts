// Pure helpers for the "Accessories & compatibility" tab (plan M6.3/M6.4, decision D-C1). No React, no DOM:
// unit tested in tests/unit/compatibility-state.test.mjs and driven against a real database in
// tests/integration/compatibility-editor.test.mjs.
//
// API contract (docs/backend/catalog-media-schema.md, "Compatibility ownership rule"):
//   GET  product.compatibility = { devices, accessories, compatibleDevices, compatibleAccessories }
//   save compatibility.devices      (on an accessory) = every row where this product is the accessory, any scope
//        compatibility.accessories  (on a device)     = only this device's whole-device rows
// The editor keeps a display model per side and turns it back into the command shape on save. A side the
// user did not change is sent back exactly as GET returned it.
import type { PickerRow, TaxonomyNode } from "../../../contracts/admin-catalog.ts";

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);

export interface DeviceValueRef { id: string; key: string; label: string; optionName: string; variantCount: number }
export interface DeviceVariantRef { sku: string; title: string | null }

/** One "accessory fits device" link as the accessory editor shows it. No values and no variants = whole device. */
export interface DeviceLinkModel {
  productKey: string;
  name: string;
  thumbnail: string | null;
  categoryKey: string | null;
  /** Narrows the link to one SKU of this accessory. */
  accessoryVariantSku: string | null;
  /** Non-archived variants of the device. */
  deviceVariantCount: number;
  optionValues: DeviceValueRef[];
  variants: DeviceVariantRef[];
}

/** A whole-device link as the device editor shows it (the only kind the device side owns). */
export interface AccessoryLinkModel {
  productKey: string;
  name: string;
  thumbnail: string | null;
  categoryKey: string | null;
  categoryName: string | null;
  status: string | null;
  accessoryVariantSku: string | null;
}

export interface CompatibilityForm { devices: DeviceLinkModel[]; accessories: AccessoryLinkModel[] }

export interface DeviceLinkCommand { productKey: string; optionValueKeys: string[]; variantSkus: string[]; accessoryVariantSku?: string }
export interface AccessoryLinkCommand { productKey: string; accessoryVariantSku?: string }

export const emptyCompatibility = (): CompatibilityForm => ({ devices: [], accessories: [] });

const sameLink = (a: { productKey: string; accessoryVariantSku: string | null }, b: { productKey: string; accessoryVariantSku: string | null }) =>
  a.productKey === b.productKey && (a.accessoryVariantSku ?? null) === (b.accessoryVariantSku ?? null);

// ---------------------------------------------------------------------------------------------------------
// GET payload → editor model

/** GET product.compatibility → display model for both sides. Junk entries are skipped, never thrown on. */
export function compatibilityFromPayload(payload: Raw): CompatibilityForm {
  const compat = isRecord(payload.compatibility) ? payload.compatibility : {};
  const views = arr(compat.compatibleDevices).filter(isRecord);
  const devices: DeviceLinkModel[] = arr(compat.devices).filter(isRecord).flatMap((command, index): DeviceLinkModel[] => {
    const productKey = str(command.productKey);
    if (!productKey) return [];
    const accessoryVariantSku = strOrNull(command.accessoryVariantSku);
    const matches = (view: Raw) => str(view.productKey) === productKey && strOrNull(view.accessoryVariantSku) === accessoryVariantSku;
    const view = views[index] && matches(views[index]) ? views[index] : views.find(matches) ?? {};
    const viewValues = arr(view.optionValues).filter(isRecord);
    const viewVariants = arr(view.variants).filter(isRecord);
    const optionValues = arr(command.optionValueKeys).map(str).filter(Boolean).map((reference): DeviceValueRef => {
      const found = viewValues.find((value) => str(value.id) === reference || str(value.key) === reference);
      return found
        ? { id: str(found.id), key: str(found.key), label: str(found.label) || str(found.key), optionName: str(found.optionName), variantCount: num(found.variantCount) }
        : { id: reference, key: reference, label: reference, optionName: "", variantCount: 0 };
    });
    const variants = arr(command.variantSkus).map(str).filter(Boolean).map((sku): DeviceVariantRef => {
      const found = viewVariants.find((variant) => str(variant.sku).toLowerCase() === sku.toLowerCase());
      return { sku, title: found ? strOrNull(found.title) : null };
    });
    return [{
      productKey, name: str(view.name) || productKey, thumbnail: strOrNull(view.thumbnail), categoryKey: strOrNull(view.primaryCategoryKey),
      accessoryVariantSku, deviceVariantCount: num(view.deviceVariantCount), optionValues, variants,
    }];
  });
  const accessoryViews = arr(compat.compatibleAccessories).filter(isRecord);
  const accessories: AccessoryLinkModel[] = arr(compat.accessories).filter(isRecord).flatMap((command): AccessoryLinkModel[] => {
    const productKey = str(command.productKey);
    if (!productKey) return [];
    const accessoryVariantSku = strOrNull(command.accessoryVariantSku);
    const view = accessoryViews.find((item) => str(item.productKey) === productKey && strOrNull(item.accessoryVariantSku) === accessoryVariantSku && str(item.scope) === "device") ?? {};
    return [{
      productKey, name: str(view.name) || productKey, thumbnail: strOrNull(view.thumbnail), categoryKey: strOrNull(view.primaryCategoryKey),
      categoryName: strOrNull(view.primaryCategoryName), status: strOrNull(view.status), accessoryVariantSku,
    }];
  });
  return { devices, accessories };
}

/** A link made on the accessory side with a finer scope ("51 mm only"): shown read-only on the device. */
export interface FineAccessoryLink {
  productKey: string; name: string; thumbnail: string | null; categoryKey: string | null; categoryName: string | null; status: string | null;
  accessoryVariantSku: string | null; scope: "optionValue" | "variant"; scopeLabel: string;
}

export function fineAccessoryLinks(payload: Raw): FineAccessoryLink[] {
  const compat = isRecord(payload.compatibility) ? payload.compatibility : {};
  return arr(compat.compatibleAccessories).filter(isRecord).flatMap((view): FineAccessoryLink[] => {
    const scope = str(view.scope);
    if (scope !== "optionValue" && scope !== "variant") return [];
    const value = isRecord(view.optionValue) ? view.optionValue : {};
    return [{
      productKey: str(view.productKey), name: str(view.name) || str(view.productKey), thumbnail: strOrNull(view.thumbnail),
      categoryKey: strOrNull(view.primaryCategoryKey), categoryName: strOrNull(view.primaryCategoryName), status: strOrNull(view.status),
      accessoryVariantSku: strOrNull(view.accessoryVariantSku), scope,
      scopeLabel: scope === "optionValue" ? str(value.label) || str(value.key) : `SKU ${str(view.variantSku)}`,
    }];
  });
}

// ---------------------------------------------------------------------------------------------------------
// Editor model → command

export function deviceLinksToCommand(links: readonly DeviceLinkModel[]): DeviceLinkCommand[] {
  return links.map((link) => ({
    productKey: link.productKey,
    optionValueKeys: link.optionValues.map((value) => value.id),
    variantSkus: link.variants.map((variant) => variant.sku),
    ...(link.accessoryVariantSku ? { accessoryVariantSku: link.accessoryVariantSku } : {}),
  }));
}

export function accessoryLinksToCommand(links: readonly AccessoryLinkModel[]): AccessoryLinkCommand[] {
  return links.map((link) => ({ productKey: link.productKey, ...(link.accessoryVariantSku ? { accessoryVariantSku: link.accessoryVariantSku } : {}) }));
}

/**
 * The `compatibility` field of the save command. Each side is compared with what GET returned; an untouched
 * side keeps GET's exact value, a changed side is replaced. Returns undefined when there is nothing to send.
 */
export function compatibilityCommand(base: Raw, form: CompatibilityForm): Raw | undefined {
  const loaded = compatibilityFromPayload(base);
  const baseCompat = isRecord(base.compatibility) ? base.compatibility : undefined;
  const devices = deviceLinksToCommand(form.devices);
  const accessories = accessoryLinksToCommand(form.accessories);
  const devicesChanged = JSON.stringify(devices) !== JSON.stringify(deviceLinksToCommand(loaded.devices));
  const accessoriesChanged = JSON.stringify(accessories) !== JSON.stringify(accessoryLinksToCommand(loaded.accessories));
  if (!devicesChanged && !accessoriesChanged) return baseCompat;
  return { ...(baseCompat ?? {}), ...(devicesChanged ? { devices } : {}), ...(accessoriesChanged ? { accessories } : {}) };
}

// ---------------------------------------------------------------------------------------------------------
// Accessory side: choosing a device and its option values

export interface DeviceSummary {
  productKey: string; name: string; thumbnail: string | null; categoryKey: string | null; variantCount: number;
  options: { id: string; key: string; name: string; values: DeviceValueRef[] }[];
  variants: { sku: string; title: string | null; selections: Record<string, string> }[];
}

/** Full GET payload of a device → what the option-value picker needs (archived variants are left out). */
export function deviceSummaryFromPayload(payload: Raw): DeviceSummary {
  const variants = arr(payload.variants).filter(isRecord).filter((variant) => str(variant.status) !== "archived").map((variant) => ({
    sku: str(variant.sku), title: strOrNull(variant.title),
    selections: isRecord(variant.selections) ? Object.fromEntries(Object.entries(variant.selections).map(([key, value]) => [key, str(value)])) : {},
  }));
  const options = arr(payload.options).filter(isRecord).map((option) => {
    const id = str(option.id), name = str(option.name);
    return {
      id, key: str(option.key), name,
      values: arr(option.values).filter(isRecord).map((value): DeviceValueRef => ({
        id: str(value.id), key: str(value.key), label: str(value.label) || str(value.key), optionName: name,
        variantCount: variants.filter((variant) => variant.selections[id] === str(value.id)).length,
      })),
    };
  }).filter((option) => option.values.length > 0);
  const primary = isRecord(payload.primaryCategory) ? strOrNull(payload.primaryCategory.key) : null;
  return {
    productKey: str(payload.id), name: str(payload.name) || str(payload.id), thumbnail: strOrNull(payload.thumbnail) ?? strOrNull(payload.image),
    categoryKey: primary, variantCount: variants.length || 1, options, variants,
  };
}

/** The picker's choice → one link. No values and no SKUs = fits every variant of the device. */
export function buildDeviceLink(device: DeviceSummary, choice: { valueIds?: readonly string[]; variantSkus?: readonly string[]; accessoryVariantSku?: string | null }): DeviceLinkModel {
  const chosen = new Set(choice.valueIds ?? []);
  const skus = new Set((choice.variantSkus ?? []).map((sku) => sku.toLowerCase()));
  return {
    productKey: device.productKey, name: device.name, thumbnail: device.thumbnail, categoryKey: device.categoryKey,
    accessoryVariantSku: choice.accessoryVariantSku || null, deviceVariantCount: device.variantCount,
    optionValues: device.options.flatMap((option) => option.values.filter((value) => chosen.has(value.id))),
    variants: device.variants.filter((variant) => skus.has(variant.sku.toLowerCase())).map((variant) => ({ sku: variant.sku, title: variant.title })),
  };
}

export const isWholeDevice = (link: Pick<DeviceLinkModel, "optionValues" | "variants">) => link.optionValues.length === 0 && link.variants.length === 0;

export type MergeOutcome = "added" | "merged" | "replaced" | "alreadyCovered" | "unchanged";

/**
 * Adds a link, merging with an existing link for the same device (and accessory SKU): a whole-device link
 * replaces finer ones; finer links are unioned; a device that already fits whole stays whole.
 */
export function mergeDeviceLink(links: readonly DeviceLinkModel[], link: DeviceLinkModel): { devices: DeviceLinkModel[]; outcome: MergeOutcome } {
  const index = links.findIndex((item) => sameLink(item, link));
  if (index < 0) return { devices: [...links, link], outcome: "added" };
  const existing = links[index];
  if (isWholeDevice(existing)) return { devices: [...links], outcome: "alreadyCovered" };
  if (isWholeDevice(link)) return { devices: links.map((item, i) => (i === index ? link : item)), outcome: "replaced" };
  const values = [...existing.optionValues, ...link.optionValues.filter((value) => !existing.optionValues.some((item) => item.id === value.id))];
  const variants = [...existing.variants, ...link.variants.filter((variant) => !existing.variants.some((item) => item.sku.toLowerCase() === variant.sku.toLowerCase()))];
  if (values.length === existing.optionValues.length && variants.length === existing.variants.length) return { devices: [...links], outcome: "unchanged" };
  return { devices: links.map((item, i) => (i === index ? { ...existing, optionValues: values, variants } : item)), outcome: "merged" };
}

export type DeviceLine = { kind: "whole" } | { kind: "value"; id: string } | { kind: "variant"; sku: string };

/** Removes one sentence of a link; a link with nothing left is removed (it never widens to "all variants"). */
export function removeDeviceLine(links: readonly DeviceLinkModel[], index: number, line: DeviceLine): DeviceLinkModel[] {
  const link = links[index];
  if (!link) return [...links];
  if (line.kind === "whole") return links.filter((_, i) => i !== index);
  const next = line.kind === "value"
    ? { ...link, optionValues: link.optionValues.filter((value) => value.id !== line.id) }
    : { ...link, variants: link.variants.filter((variant) => variant.sku !== line.sku) };
  return isWholeDevice(next) ? links.filter((_, i) => i !== index) : links.map((item, i) => (i === index ? next : item));
}

/** Imports another accessory's device links (its accessory-SKU narrowing does not apply to this product). */
export function copyDeviceLinks(links: readonly DeviceLinkModel[], source: readonly DeviceLinkModel[], selfKey?: string | null): { devices: DeviceLinkModel[]; added: number; merged: number; skipped: number } {
  let devices = [...links], added = 0, merged = 0, skipped = 0;
  for (const link of source) {
    if (selfKey && link.productKey === selfKey) { skipped++; continue; }
    const result = mergeDeviceLink(devices, { ...link, accessoryVariantSku: null });
    devices = result.devices;
    if (result.outcome === "added") added++;
    else if (result.outcome === "merged" || result.outcome === "replaced") merged++;
    else skipped++;
  }
  return { devices, added, merged, skipped };
}

// ---------------------------------------------------------------------------------------------------------
// Readback sentences (garmin.com "Compatible devices" wording)

const variantCountText = (count: number, whole: boolean): string =>
  count > 1 ? `all ${count} variants` : whole ? "all variants" : count === 1 ? "1 variant" : "no variants yet";

export interface DeviceSentence { line: DeviceLine; text: string }

/** "fēnix 9 Pro – 51 mm (all 14 variants)", "Forerunner 970 (all variants)", "fēnix 9 Pro – SKU 010-… (1 variant)". */
export function describeDeviceLink(link: DeviceLinkModel): DeviceSentence[] {
  const suffix = link.accessoryVariantSku ? ` · only this accessory's SKU ${link.accessoryVariantSku}` : "";
  if (isWholeDevice(link)) return [{ line: { kind: "whole" }, text: `${link.name} (${variantCountText(link.deviceVariantCount, true)})${suffix}` }];
  return [
    ...link.optionValues.map((value): DeviceSentence => ({ line: { kind: "value", id: value.id }, text: `${link.name} – ${value.label} (${variantCountText(value.variantCount, false)})${suffix}` })),
    ...link.variants.map((variant): DeviceSentence => ({ line: { kind: "variant", sku: variant.sku }, text: `${link.name} – SKU ${variant.sku}${variant.title ? ` ${variant.title}` : ""} (1 variant)${suffix}` })),
  ];
}

/** Device-side scope text: "All variants", "51 mm only", "SKU 010-… only". */
export function describeAccessoryScope(link: { scope?: "device" | "optionValue" | "variant"; scopeLabel?: string; accessoryVariantSku: string | null }): string {
  const scope = !link.scope || link.scope === "device" ? "All variants" : `${link.scopeLabel ?? ""} only`;
  return link.accessoryVariantSku ? `${scope} · SKU ${link.accessoryVariantSku} of the accessory` : scope;
}

// ---------------------------------------------------------------------------------------------------------
// Device side: adding accessories, grouping by accessory category

export function accessoryFromPickerRow(row: Pick<PickerRow, "id" | "name" | "thumbnail" | "primaryCategory" | "status">): AccessoryLinkModel {
  return { productKey: row.id, name: row.name, thumbnail: row.thumbnail, categoryKey: row.primaryCategory?.key ?? null, categoryName: row.primaryCategory?.name ?? null, status: row.status, accessoryVariantSku: null };
}

/** Adds products as whole-device links ("add whole group"); products already linked are skipped. */
export function addAccessories(links: readonly AccessoryLinkModel[], rows: readonly Pick<PickerRow, "id" | "name" | "thumbnail" | "primaryCategory" | "status">[], selfKey?: string | null): { accessories: AccessoryLinkModel[]; added: number } {
  const next = [...links];
  let added = 0;
  for (const row of rows) {
    if (selfKey && row.id === selfKey) continue;
    const link = accessoryFromPickerRow(row);
    if (next.some((item) => sameLink(item, link))) continue;
    next.push(link);
    added++;
  }
  return { accessories: next, added };
}

export const removeAccessory = (links: readonly AccessoryLinkModel[], productKey: string, accessoryVariantSku: string | null = null): AccessoryLinkModel[] =>
  links.filter((link) => !sameLink(link, { productKey, accessoryVariantSku }));

export const hasWholeAccessory = (links: readonly AccessoryLinkModel[], productKey: string): boolean =>
  links.some((link) => link.productKey === productKey && !link.accessoryVariantSku);

/** Nearest ancestor-or-self of kind "accessory" (Bands for "QuickFit 22 mm"), or null. */
export function accessoryRootFor(categoryKey: string | null, taxonomy: readonly TaxonomyNode[]): TaxonomyNode | null {
  if (!categoryKey) return null;
  const index = new Map(taxonomy.map((node) => [node.key, node]));
  let node = index.get(categoryKey);
  for (let guard = 0; node && guard < 32; guard++) {
    if (node.kind === "accessory") return node;
    node = node.parentKey ? index.get(node.parentKey) : undefined;
  }
  return null;
}

/** An accessory = a product in an accessory category or in a group under one (Bands › QuickFit 22 mm). */
export function isAccessoryProduct(categories: readonly { key: string }[], taxonomy: readonly TaxonomyNode[]): boolean {
  return categories.some((category) => accessoryRootFor(category.key, taxonomy) !== null);
}

/** Accessory categories in garmin.com's watch "Accessories" tab order (taxonomy order). */
export function accessoryCategories(taxonomy: readonly TaxonomyNode[]): TaxonomyNode[] {
  return taxonomy.filter((node) => node.kind === "accessory" && !node.parentKey);
}

export const groupsUnder = (taxonomy: readonly TaxonomyNode[], parentKey: string): TaxonomyNode[] =>
  taxonomy.filter((node) => node.parentKey === parentKey).sort((a, b) => a.position - b.position);

export interface AccessoryDisplayRow {
  productKey: string; name: string; thumbnail: string | null; categoryKey: string | null; categoryName: string | null; status: string | null;
  accessoryVariantSku: string | null; editable: boolean; scopeText: string;
}
export interface AccessoryGroup { key: string; name: string; rows: AccessoryDisplayRow[] }

/**
 * Everything that fits this device, grouped by accessory category: editable whole-device links from the
 * form plus read-only finer links from the accessory side. A finer link whose accessory is now linked to the
 * whole device is hidden (the whole-device row covers it and the server collapses it on save).
 */
export function groupAccessories(accessories: readonly AccessoryLinkModel[], fine: readonly FineAccessoryLink[], taxonomy: readonly TaxonomyNode[]): AccessoryGroup[] {
  const rows: AccessoryDisplayRow[] = [
    ...accessories.map((link) => ({ ...link, editable: true, scopeText: describeAccessoryScope({ accessoryVariantSku: link.accessoryVariantSku }) })),
    ...fine.filter((link) => !hasWholeAccessory(accessories, link.productKey)).map((link) => ({
      productKey: link.productKey, name: link.name, thumbnail: link.thumbnail, categoryKey: link.categoryKey, categoryName: link.categoryName, status: link.status,
      accessoryVariantSku: link.accessoryVariantSku, editable: false, scopeText: describeAccessoryScope(link),
    })),
  ];
  const order = accessoryCategories(taxonomy);
  const groups = new Map<string, AccessoryGroup>(order.map((node) => [node.key, { key: node.key, name: node.name, rows: [] }]));
  const other: AccessoryGroup = { key: "", name: "Other", rows: [] };
  for (const row of rows) {
    const root = accessoryRootFor(row.categoryKey, taxonomy);
    (root ? groups.get(root.key) ?? other : other).rows.push(row);
  }
  return [...groups.values(), other].filter((group) => group.rows.length > 0);
}

// ---------------------------------------------------------------------------------------------------------
// Smart hint (docs/research/www.garmin.com/ACCESSORY_TAXONOMY.md): QuickFit width ↔ watch case size

/** QuickFit width of an accessory from its categories (bands/quickfit-26-mm → 26), or null. */
export function quickFitWidth(categories: readonly { key: string }[]): 20 | 22 | 26 | null {
  for (const category of categories) {
    const match = /quickfit-(20|22|26)-mm/.exec(category.key);
    if (match) return Number(match[1]) as 20 | 22 | 26;
  }
  return null;
}

const CASE_RANGES: Record<20 | 22 | 26, [number, number]> = { 20: [38, 44], 22: [44, 49], 26: [49, 54] };

/**
 * Rule of thumb from garmin.com: QuickFit 20 ≈ 40–43 mm cases, 22 ≈ 45–47 mm (and every MARQ),
 * 26 ≈ 50–51 mm (and every Enduro). Returns the device's matching option values, "whole" for MARQ/Enduro,
 * or null when nothing in the catalog matches.
 */
export function suggestForWidth(width: 20 | 22 | 26, device: Pick<DeviceSummary, "name" | "options">): { whole: true; text: string } | { whole: false; valueIds: string[]; labels: string[]; text: string } | null {
  if ((width === 22 && /marq/i.test(device.name)) || (width === 26 && /enduro/i.test(device.name))) {
    return { whole: true, text: `QuickFit ${width} mm fits every ${/marq/i.test(device.name) ? "MARQ" : "Enduro"} case` };
  }
  const [min, max] = CASE_RANGES[width];
  const values = device.options.flatMap((option) => option.values).filter((value) => {
    const match = /(\d+(?:\.\d+)?)\s*mm\b/i.exec(value.label);
    if (!match) return false;
    const mm = Number(match[1]);
    return mm >= min && mm < max;
  });
  if (!values.length) return null;
  const labels = values.map((value) => value.label);
  return { whole: false, valueIds: values.map((value) => value.id), labels, text: `QuickFit ${width} mm usually fits the ${labels.join(" / ")} case` };
}

/** Number shown on the tab: links on either side. */
export const compatibilityCount = (form: CompatibilityForm): number => form.devices.length + form.accessories.length;
