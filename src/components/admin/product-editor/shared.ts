import { formatKzt as formatSharedKzt } from "@/lib/money";
import type { CMSProduct, ProductImage, ProductOption, ProductVariant } from "@/lib/cms/types";

/** Draft returned by POST /api/admin/import/garmin (CMSProduct-shaped, not saved). */
export type ProductDraft = Partial<CMSProduct> & Pick<CMSProduct, "name" | "sku" | "price">;

/** The slice of editor form state the preview and variant tools need. */
export interface ProductMediaState {
  images: ProductImage[];
  defaultImageId: string;
  options: ProductOption[];
  variants: ProductVariant[];
}

export const newId = (prefix: string): string =>
  `${prefix}-${
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  }`;

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Editor prices (tenge, major units) through the shared money formatter: "KZT 1,350,000.00". */
export const formatKzt = (value: number | undefined): string =>
  value === undefined || Number.isNaN(value) ? "—" : formatSharedKzt({ major: value }, "en");

export const formatUsd = (value: number | undefined): string =>
  value === undefined || Number.isNaN(value) ? "—" : usdFormatter.format(value);

/** Images to show for a variant (its own picks, else product gallery with the default first). */
export function galleryFor(
  images: ProductImage[],
  defaultImageId: string,
  variant?: ProductVariant,
): ProductImage[] {
  if (variant && variant.imageIds.length) {
    const byId = new Map(images.map((i) => [i.id, i]));
    const own = variant.imageIds.map((id) => byId.get(id)).filter((i): i is ProductImage => Boolean(i));
    if (own.length) return own;
  }
  const def = images.find((i) => i.id === defaultImageId);
  return def ? [def, ...images.filter((i) => i.id !== defaultImageId)] : images;
}

export const labelClass =
  "block text-xs font-semibold text-neutral-600";
export const inputClass =
  "h-9 w-full border border-border bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none";
export const smallInputClass =
  "h-7 w-full border border-border bg-white px-2 text-xs text-black focus:border-black focus:outline-none rounded-none";
export const primaryButtonClass =
  "g-btn g-btn--black gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed";
export const secondaryButtonClass =
  "g-btn g-btn--secondary g-btn--sm gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed";
export const linkButtonClass =
  "inline-flex items-center gap-1 text-xs uppercase font-bold text-garmin-blue hover:underline disabled:opacity-50";
