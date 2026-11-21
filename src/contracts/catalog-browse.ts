// Browser-safe wire contracts for taxonomy-driven category pages, product option pickers,
// breadcrumbs and accessory/device compatibility (M4). Additive to commerce.ts.
import type { Availability, MediaDTO, PriceDTO, ProductCardDTO } from "./commerce.ts";

export type CategoryKindDTO = "catalog" | "accessory" | "group";

export interface CategoryCrumbDTO {
  name: string;
  slug: string;
}

export interface CategoryDTO {
  name: string;
  slug: string;
  kind: CategoryKindDTO;
  description: string | null;
  /** Root first, this category last. */
  path: CategoryCrumbDTO[];
  /** Store preset filters as stored on the category (`activities`, `levels`, `caseSizes`, `families`). */
  presetFilters: Readonly<Record<string, readonly string[]>>;
}

export type FacetKey = "activities" | "levels" | "caseSizes" | "series" | "prices" | "availability";

export interface FacetOptionDTO {
  value: string;
  label: string;
  count: number;
  checked: boolean;
}

export interface FacetDTO {
  key: FacetKey;
  label: string;
  options: FacetOptionDTO[];
}

export type CatalogSortKey = "featured" | "name-asc" | "name-desc" | "price-asc" | "price-desc";

export interface CategoryFilterInput {
  series?: readonly string[];
  activities?: readonly string[];
  levels?: readonly string[];
  caseSizes?: readonly string[];
  prices?: readonly string[];
  inStock?: boolean;
}

export interface CategoryPageDTO {
  category: CategoryDTO;
  facets: FacetDTO[];
  items: ProductCardDTO[];
  /** Products in the category before filters. */
  categoryTotal: number;
  /** Products matching the current filters. */
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  sort: CatalogSortKey;
  /** The facet selection the page was rendered with (after presets). */
  selection: Required<CategoryFilterInput>;
  /** True when the selection came from the category's preset filters (no explicit filter in the URL). */
  presetApplied: boolean;
}

export interface ProductOptionValueDTO {
  label: string;
  swatchColor: string | null;
  swatchImage: string | null;
}

export interface ProductOptionDTO {
  /** Matches the keys of VariantDTO.options. */
  key: string;
  name: string;
  display: "buttons" | "swatch" | "dropdown";
  values: ProductOptionValueDTO[];
}

export interface CompatibleAccessoryDTO {
  publicKey: string;
  name: string;
  image: MediaDTO | null;
  price: PriceDTO;
  availability: Availability;
  /** Deep link SKU when the link narrows to one accessory variant. */
  sku: string | null;
  /** Nearest accessory category (tab) of the accessory; null when it has none. */
  group: CategoryCrumbDTO | null;
  /** Device variant ids this accessory fits; null = every variant of the device. */
  variantIds: string[] | null;
}

export interface CompatibleDeviceDTO {
  publicKey: string;
  /** garmin.com wording: "<device name> – <option value(s)>" or just the device name. */
  label: string;
  image: MediaDTO | null;
  /** SKU of a matching device variant for scoped rows; null for whole-device rows. */
  sku: string | null;
}
