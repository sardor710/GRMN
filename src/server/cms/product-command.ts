import "server-only";
import { z } from "zod";
import { productInput, variantContentInput } from "../auth/admin-schemas.ts";

// Product create/update command for the PostgreSQL CMS (M2). It is a strict SUPERSET of the legacy
// CMSProduct payload (`productInput`, src/lib/cms/types.ts) that the rich editor already sends, so that
// editor can point at this API unchanged, plus the relational data the catalog tables hold:
//   categories (product_categories, one primary), compatibility (product_compatibility, either side),
//   relations (product_relations), typed in-the-box items, per-variant / simple-product stock (ledger).
// Money is exact KZT (number or decimal string, at most two decimals) and is converted to minor units.
// Fields the read API returns for display only (stock totals, resolved compatibility lists, timestamps)
// are accepted and dropped, so an editor may send back exactly what it read.

const short = z.string().max(500);
const key = z.string().trim().min(1).max(128);
const count = z.number().int().min(0).max(2_000_000_000);
const link = z.string().trim().max(2048).refine(value => !value || value === "#" || /^\/(?!\/)/.test(value) || /^https?:\/\//i.test(value), "Use a relative or HTTP(S) URL");

/** Exact KZT → minor units as a decimal string (no float rounding, no exponents). */
export const kztMoney = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.trim();
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(text);
  if (!match) { ctx.addIssue({ code: "custom", message: "Use exact KZT with at most two decimal places" }); return z.NEVER; }
  const minor = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (minor > BigInt("100000000000000")) { ctx.addIssue({ code: "custom", message: "Amount exceeds the supported range" }); return z.NEVER; }
  return minor.toString();
});

const hexColor = z.string().trim().max(32).refine(value => value === "" || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value), "Swatch colors are hex colors like #1a2b3c");
// swatchColorSource (beta, Task C-d): "editor" = staff picked the hex, "name" = the importer guessed it; kept in legacy_content.
const optionValue = z.object({ id: key, key: short.trim().min(1), label: short.trim().min(1), swatchColor: hexColor.optional(), swatchColorSource: z.enum(["editor", "name"]).optional(), swatchImage: link.optional() }).strict();
const option = z.object({ id: key, key: short.trim().min(1), name: short.trim().min(1), display: z.enum(["buttons", "swatch", "dropdown"]).default("buttons"), values: z.array(optionValue).max(200) }).strict();
const image = z.object({ id: key, src: link.pipe(z.string().min(1)), alt: short.default(""), source: z.enum(["upload", "import", "url"]).default("url"), width: count.optional(), height: count.optional() }).strict();
const sourcePrice = z.object({ currency: z.literal("USD"), list: z.number().finite().min(0).max(1e12), sale: z.number().finite().min(0).max(1e12).optional(), rateKztPerUsd: z.number().finite().min(0).max(1e12) }).strict();
/** Owner 2026-11-23: a variant page's own SEO text per language; a blank field means "generate it". */
const seoText = z.object({ title: z.string().trim().max(70, "SEO title is at most 70 characters").optional(), description: z.string().trim().max(200, "SEO description is at most 200 characters").optional() }).strict();
export const variantSeoInput = z.object({ en: seoText.optional(), ru: seoText.optional(), kk: seoText.optional() }).strict();
const variant = z.object({
  id: key, sku: z.string().trim().min(1, "Every variant needs a SKU").max(100), title: short.default(""),
  selections: z.record(key, key).default({}),
  /** null = no price (what the read API returns for a variant without an active price); only draft/archived variants may have none. */
  price: kztMoney.nullable(), originalPrice: kztMoney.nullish(),
  /** On-hand quantity at the main location; omitted = leave stock unchanged. */
  stock: count.optional(),
  /** The on-hand quantity the editor loaded; when given, a concurrent stock change is a 409 instead of being overwritten. */
  stockBaseline: count.optional(),
  status: z.enum(["draft", "active", "archived"]).default("draft"), isDefault: z.boolean().default(false),
  imageIds: z.array(key).max(200).default([]), sourcePartNumber: short.optional(), sourcePrice: sourcePrice.optional(),
  /** beta5 merge (Task 2.1): this variant's own Specs / Overview / In the box; a present key is "Own". Omitted = keep the stored overrides. */
  content: variantContentInput.optional(),
  /** Owner 2026-11-23: this variant page's own SEO title/description per language. Omitted = keep the stored text. */
  seo: variantSeoInput.optional(),
  // Read-only echoes from the read API (ignored).
  stockReserved: z.unknown().optional(), stockAvailable: z.unknown().optional(), stockTracked: z.unknown().optional(), version: z.unknown().optional(), thumbnail: z.unknown().optional(), options: z.unknown().optional(),
}).strict();
const inTheBoxItem = z.union([short.trim().min(1), z.object({ label: short.trim().min(1), image: link.optional() }).strict()]);
const categoryRef = z.object({ key: z.string().trim().min(1).max(200), primary: z.boolean().default(false) }).strict();
const deviceLink = z.object({
  /** Device product public key. */
  productKey: key,
  /** Each entry is one row scoped to that device option value (stored id, or a value key unique within the device). */
  optionValueKeys: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  /** Each entry is one row scoped to that device variant (rare exceptions). */
  variantSkus: z.array(z.string().trim().min(1).max(100)).max(500).default([]),
  /** Narrows the accessory side to one of this product's SKUs. */
  accessoryVariantSku: z.string().trim().min(1).max(100).nullish(),
}).strict();
const accessoryLink = z.object({ productKey: key, accessoryVariantSku: z.string().trim().min(1).max(100).nullish() }).strict();
/** 0028: device → accessory type (charger type, band size); option values narrow it. */
const typeLink = z.object({ categoryKey: key, optionValueKeys: z.array(z.string().trim().min(1).max(128)).max(50).default([]) }).strict();
const readOnly = z.unknown().optional();

export const productCommandSchema = productInput.extend({
  id: key.optional(),
  version: z.number().int().min(0).max(2147483646).optional(),
  /** Owner 2026-11-23: public URL key /p/{productCode} (1–12 digits). Omitted on create = assigned automatically. */
  productCode: z.string().trim().regex(/^[0-9]{1,12}$/, "The product code is 1 to 12 digits").optional(),
  sku: z.string().trim().max(100).optional(),
  /** Simple products: null = no price (allowed while the product is not published). */
  price: kztMoney.nullish(),
  originalPrice: kztMoney.nullish(),
  stock: count.optional(),
  stockBaseline: count.optional(),
  inTheBox: z.array(inTheBoxItem).max(200).optional(),
  images: z.array(image).max(1000).optional(),
  specs: z.array(z.object({ label: short, value: z.string().max(10000) }).strict()).max(1000).optional(),
  options: z.array(option).max(10).optional(),
  variants: z.array(variant).max(500).optional(),
  categories: z.array(categoryRef).max(50).optional(),
  // compatibleDevices / compatibleAccessories are the resolved read views (echoed back, ignored).
  compatibility: z.object({ devices: z.array(deviceLink).max(500).optional(), accessories: z.array(accessoryLink).max(2000).optional(), types: z.array(typeLink).max(200).optional(), compatibleDevices: z.unknown().optional(), compatibleAccessories: z.unknown().optional(), compatibleTypes: z.unknown().optional() }).strict().optional(),
  relations: z.object({ related: z.array(key).max(200).optional(), upsell: z.array(key).max(200).optional() }).strict().optional(),
  // Read-only fields the read API (and the legacy list DTO) return; accepted and ignored.
  currency: readOnly, stockManaged: readOnly, createdAt: readOnly, updatedAt: readOnly, backend: readOnly,
  compatibleDevices: readOnly, primaryCategory: readOnly, stockReserved: readOnly, stockAvailable: readOnly, stockTracked: readOnly, thumbnail: readOnly,
}).strict().superRefine((value, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const variants = value.variants ?? [];
  // Creating a simple product (or turning one simple with variants: []) needs its own SKU and price; an update that omits
  // variants keeps the stored ones.
  if (!variants.length && (!value.id || value.variants !== undefined)) {
    if (!value.sku) issue(["sku"], "A product without variants needs a SKU");
    if (value.price === undefined) issue(["price"], "A product without variants needs a price");
  }
  if (value.categories?.length) {
    const keys = value.categories.map(category => category.key.toLowerCase());
    if (new Set(keys).size !== keys.length) issue(["categories"], "A category is listed twice");
    if (value.categories.filter(category => category.primary).length !== 1) issue(["categories"], "Mark exactly one category as primary");
  }
  for (const type of ["related", "upsell"] as const) {
    const list = value.relations?.[type];
    if (list && new Set(list).size !== list.length) issue(["relations", type], "A related product is listed twice");
  }
});

export type ProductCommand = z.output<typeof productCommandSchema>;
export type ProductCommandInput = z.input<typeof productCommandSchema>;
export type ProductCommandVariant = NonNullable<ProductCommand["variants"]>[number];
export type InTheBoxCommandItem = NonNullable<ProductCommand["inTheBox"]>[number];

/** Keys that are only ever echoed back from reads and never stored. */
export const READ_ONLY_KEYS = ["currency", "stockManaged", "createdAt", "updatedAt", "backend", "compatibleDevices", "primaryCategory", "stockReserved", "stockAvailable", "stockTracked", "thumbnail"] as const;
export const READ_ONLY_VARIANT_KEYS = ["stockReserved", "stockAvailable", "stockTracked", "version", "thumbnail", "options"] as const;

/** Parses a command; the first issue becomes a readable message. */
export function parseProductCommand(raw: unknown): { ok: true; command: ProductCommand } | { ok: false; message: string; path: string } {
  const result = productCommandSchema.safeParse(raw);
  if (result.success) return { ok: true, command: result.data };
  const first = result.error.issues[0];
  const path = first?.path.map(String).join(".") ?? "";
  return { ok: false, message: first?.code === "unrecognized_keys" ? `Unknown fields: ${(first as { keys?: string[] }).keys?.join(", ")}` : `${path ? path + ": " : ""}${first?.message ?? "Invalid input"}`, path };
}
