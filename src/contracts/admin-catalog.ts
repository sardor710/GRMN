// Response shapes of the admin catalog API (/api/admin/catalog/*, M2). Pure types shared by the server
// (src/server/cms/catalog-read.ts) and admin clients. Money is KZT (minor units / 100).

export interface ListPage<T> { items: T[]; nextCursor: string | null; total: number; limit: number }

/** GET /api/admin/catalog/products — one row per product (grouped view). */
export interface ProductListRow {
  id: string; name: string; family: string | null; status: string;
  primaryCategory: { key: string; name: string } | null; thumbnail: string | null;
  variantCount: number; stock: { onHand: number; available: number };
  price: { min: number | null; max: number | null }; updatedAt: string; version: number;
}

/** GET /api/admin/catalog/skus and products/:key/variants — one row per non-archived variant. */
export interface SkuRow {
  variantId: string; sku: string; title: string | null; options: { option: string; value: string }[];
  productId: string; productName: string; productStatus: string; productVersion: number;
  price: number | null; compareAt: number | null;
  stock: { onHand: number; reserved: number; available: number; tracked: boolean };
  status: string; isDefault: boolean; thumbnail: string | null; updatedAt: string;
}

/** GET /api/admin/catalog/taxonomy — parents always precede children. */
export interface TaxonomyNode { key: string; name: string; kind: string; slug: string | null; parentKey: string | null; position: number; navVisible: boolean }

/** GET /api/admin/catalog/picker — relations/cross-sell picker rows. */
export interface PickerRow {
  id: string; name: string; family: string | null; status: string; thumbnail: string | null;
  primaryCategory: { key: string; name: string } | null; variantCount: number; price: { min: number | null; max: number | null };
}

export type CatalogStockState = "in" | "low" | "out";
export interface CatalogListQuery {
  limit?: number; cursor?: string; search?: string; status?: "draft" | "published" | "archived" | "all";
  category?: string; family?: string; stock?: CatalogStockState;
}
