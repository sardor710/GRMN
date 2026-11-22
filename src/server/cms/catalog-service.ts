import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import type { InventoryService } from "../inventory/service.ts";
import { writeProduct } from "./catalog-write.ts";
import { assertPurgeable, deleteVariantReferences, purgeVariantStock } from "./catalog-purge.ts";
import { kztMoney } from "./product-command.ts";
import { createCategory, deleteCategory, orderCategories, readCategoryTree, setPlacements, updateCategory, type AdminCategoryTree } from "./category-admin.ts";
import { listProducts, listSkus, loadEditorProduct, pickProducts, productIdForKey, productVariantRows, readTaxonomy, type EditorProduct, type SkuRow } from "./catalog-read.ts";

// Guarded admin catalog service (M2) behind /api/admin/catalog/*. Reads need catalog:read; saves and
// quick edits need catalog:write, plus inventory:write when they create a product or change stock;
// restock needs inventory:write (it is an audited ledger `receive` through the inventory service).

interface Options {
  pool: Pool;
  authorize: (headers: Headers, permission: Permission) => Promise<Principal>;
  inventory?: Pick<InventoryService, "adjust">;
}
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (message = "Invalid or unknown fields"): never => fail("INVALID_INPUT", 400, message);
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); return result.success ? result.data : invalid(result.error.issues[0]?.message); }

const quickEdit = z.object({
  /** The product version the row was read with (list rows carry it as productVersion). */
  version: z.number().int().min(1),
  price: kztMoney.optional(), originalPrice: kztMoney.nullable().optional(),
  stock: z.number().int().min(0).max(2_000_000_000).optional(), stockBaseline: z.number().int().min(0).max(2_000_000_000).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  imageIds: z.array(z.string().trim().min(1).max(128)).max(200).optional(),
}).strict().refine(value => Object.keys(value).length > 1, "Nothing to change");
const restockInput = z.object({
  productId: z.string().trim().min(1).max(128), variantId: z.uuid().optional(),
  quantity: z.number().int().min(1).max(1_000_000), note: z.string().trim().min(1).max(500).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_:-]{8,128}$/),
}).strict();

export function createCatalogAdminService({ pool, authorize, inventory }: Options) {
  async function tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    let broken = false;
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      const code = (error as { code?: string } | null)?.code;
      if (code === "23505") return fail("CONFLICT", 409, "Identity or SKU already exists");
      if (code === "40P01" || code === "40001") return fail("CONFLICT", 409, "Another save touched the same products; try again");
      throw error;
    } finally { client.release(broken); }
  }
  const context = (headers: Headers, principal: Principal) => ({ principal, requireInventory: () => authorize(headers, "inventory:write") });

  return {
    async getProduct(headers: Headers, key: string): Promise<EditorProduct> {
      await authorize(headers, "catalog:read");
      return loadEditorProduct(pool, await productIdForKey(pool, key));
    },
    /** Create (no id) or update (id = public key, version required). Returns the stored editor payload. */
    async saveProduct(headers: Headers, raw: unknown): Promise<EditorProduct> {
      const principal = await authorize(headers, "catalog:write");
      return tx(async client => loadEditorProduct(client, (await writeProduct(client, context(headers, principal), raw)).productId));
    },
    async listProducts(headers: Headers, query: unknown) { await authorize(headers, "catalog:read"); return listProducts(pool, query); },
    async listSkus(headers: Headers, query: unknown) { await authorize(headers, "catalog:read"); return listSkus(pool, query); },
    async productVariants(headers: Headers, key: string) { await authorize(headers, "catalog:read"); return productVariantRows(pool, key); },
    async taxonomy(headers: Headers) { await authorize(headers, "catalog:read"); return readTaxonomy(pool); },
    async picker(headers: Headers, query: unknown) { await authorize(headers, "catalog:read"); return pickProducts(pool, query); },
    // Admin ▸ Categories (owner 2026-11-22). Every write needs the taxonomy epoch it was read with and returns the new tree.
    async categories(headers: Headers): Promise<AdminCategoryTree> { await authorize(headers, "catalog:read"); return readCategoryTree(pool); },
    async createCategory(headers: Headers, epoch: string, raw: unknown) { await authorize(headers, "catalog:write"); return tx(async client => { await createCategory(client, epoch, raw); return readCategoryTree(client); }); },
    async updateCategory(headers: Headers, epoch: string, key: string, raw: unknown) { await authorize(headers, "catalog:write"); return tx(async client => { await updateCategory(client, epoch, key, raw); return readCategoryTree(client); }); },
    async orderCategories(headers: Headers, epoch: string, raw: unknown) { await authorize(headers, "catalog:write"); return tx(async client => { await orderCategories(client, epoch, raw); return readCategoryTree(client); }); },
    async setPlacements(headers: Headers, epoch: string, menuKey: string, raw: unknown) { await authorize(headers, "catalog:write"); return tx(async client => { await setPlacements(client, epoch, menuKey, raw); return readCategoryTree(client); }); },
    async deleteCategory(headers: Headers, epoch: string, key: string) { await authorize(headers, "catalog:write"); return tx(async client => { await deleteCategory(client, epoch, key); return readCategoryTree(client); }); },

    /** SKU quick edit (price, compare-at, stock via the ledger, status, photos) through the same save path. */
    async quickEditVariant(headers: Headers, variantId: string, raw: unknown): Promise<{ product: { id: string; version: number }; variant: SkuRow }> {
      const principal = await authorize(headers, "catalog:write");
      parse(z.uuid(), variantId);
      const change = parse(quickEdit, raw);
      return tx(async client => {
        const owner = (await client.query<{ product_id: string; version: number }>("SELECT v.product_id,p.version FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 FOR UPDATE OF p", [variantId])).rows[0];
        if (!owner) return fail("NOT_FOUND", 404, "Variant was not found");
        if (owner.version !== change.version) return fail("VERSION_CONFLICT", 409, "Product changed; reload before saving");
        const current = await loadEditorProduct(client, owner.product_id, { relations: false });
        const { compatibility, relations, categories, ...rest } = current; void compatibility; void relations; void categories;
        const command: Record<string, unknown> = { ...rest };
        const toKzt = (minor: string) => (Number(minor) / 100).toFixed(2);
        if (current.variants.length) {
          const target = current.variants.find(variant => variant.id === variantId) ?? fail("NOT_FOUND", 404, "Variant is archived or not editable");
          command.variants = current.variants.map(variant => variant.id !== variantId ? variant : {
            ...variant,
            ...(change.price !== undefined ? { price: toKzt(change.price) } : {}),
            ...(change.originalPrice !== undefined ? { originalPrice: change.originalPrice === null ? null : toKzt(change.originalPrice) } : {}),
            ...(change.stock !== undefined ? { stock: change.stock, stockBaseline: change.stockBaseline ?? target.stockBaseline } : {}),
            ...(change.status ? { status: change.status } : {}),
            ...(change.imageIds ? { imageIds: change.imageIds } : {}),
          });
        } else {
          // A simple product: its single variant mirrors the product-level fields.
          if (change.price !== undefined) command.price = toKzt(change.price);
          if (change.originalPrice !== undefined) command.originalPrice = change.originalPrice === null ? null : toKzt(change.originalPrice);
          if (change.stock !== undefined) { command.stock = change.stock; command.stockBaseline = change.stockBaseline ?? current.stockBaseline; }
          if (change.status) command.status = change.status === "active" ? "published" : change.status;
          if (change.imageIds?.length) command.defaultImageId = change.imageIds[0];
        }
        const saved = await writeProduct(client, context(headers, principal), command);
        const variant = (await productVariantRows(client, current.id)).find(row => row.variantId === variantId)
          ?? (await client.query<{ sku: string }>("SELECT sku FROM product_variants WHERE id=$1", [variantId])).rows.map(row => ({ variantId, sku: row.sku, status: "archived" }))[0] as SkuRow;
        return { product: { id: saved.publicKey, version: saved.version }, variant };
      });
    },

    /**
     * Owner 2026-11-22 (admin bin): delete one SKU for good. Refused when it was ordered or in a checkout, or when it is
     * the product's last live SKU. Its manual stock history is purged (audited), then the product is saved without it
     * through writeProduct, so variant sync deletes the row, moves the default and refreshes document and projection.
     */
    async deleteVariant(headers: Headers, variantId: string, version: number): Promise<{ product: { id: string; version: number }; deleted: true }> {
      const principal = await authorize(headers, "catalog:write");
      parse(z.uuid(), variantId);
      parse(z.number().int().min(1), version);
      return tx(async client => {
        const owner = (await client.query<{ product_id: string; version: number }>("SELECT v.product_id,p.version FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 FOR UPDATE OF p", [variantId])).rows[0];
        if (!owner) return fail("NOT_FOUND", 404, "Variant was not found");
        if (owner.version !== version) return fail("VERSION_CONFLICT", 409, "Product changed; reload before deleting");
        const live = (await client.query<{ n: number }>("SELECT count(*)::int AS n FROM product_variants WHERE product_id=$1 AND status<>'archived'", [owner.product_id])).rows[0].n;
        if (live <= 1) return fail("CONFLICT", 409, "This is the product's last SKU; delete the whole product instead");
        const current = await loadEditorProduct(client, owner.product_id, { relations: false });
        const target = current.variants.find(variant => variant.id === variantId) ?? fail("NOT_FOUND", 404, "Variant is archived or not editable");
        await assertPurgeable(client, [variantId], "SKU");
        await deleteVariantReferences(client, [variantId]);
        await purgeVariantStock(client, principal, { type: "product_variant", id: variantId }, [variantId]);

        const { compatibility, relations, categories, ...rest } = current; void compatibility; void relations; void categories;
        const remaining = current.variants.filter(variant => variant.id !== variantId);
        if (target.isDefault) {
          const next = remaining.find(variant => variant.status === "active") ?? remaining[0];
          remaining.forEach(variant => { variant.isDefault = variant === next; });
        }
        // Option values no remaining SKU selects leave the product (e.g. the only Gray SKU); empty options go too.
        const used = new Set(remaining.flatMap(variant => Object.entries(variant.selections).map(([option, value]) => `${option}\u0000${value}`)));
        const options = current.options
          .map(option => ({ ...option, values: option.values.filter(value => used.has(`${option.id}\u0000${value.id}`)) }))
          .filter(option => option.values.length > 0);
        const saved = await writeProduct(client, context(headers, principal), { ...rest, options, variants: remaining });
        // Sync archives instead of deleting when something still references the row: then nothing may change.
        if ((await client.query("SELECT 1 FROM product_variants WHERE id=$1", [variantId])).rowCount) return fail("CONFLICT", 409, "This SKU is still referenced; archive it instead");
        return { product: { id: saved.publicKey, version: saved.version }, deleted: true as const };
      });
    },

    /** Dashboard quick restock: an audited ledger `receive` (+quantity) for the default (or given) variant. */
    async restock(headers: Headers, raw: unknown) {
      const input = parse(restockInput, raw);
      if (!inventory) return fail("DEPENDENCY_UNAVAILABLE", 503, "Inventory services are not available");
      await authorize(headers, "inventory:write");
      const productId = await productIdForKey(pool, input.productId);
      const variant = (await pool.query<{ id: string }>(
        "SELECT id FROM product_variants WHERE product_id=$1 AND status<>'archived' AND ($2::uuid IS NULL OR id=$2::uuid) ORDER BY is_default DESC,created_at,id LIMIT 1", [productId, input.variantId ?? null])).rows[0];
      if (!variant) return fail("NOT_FOUND", 404, "The product has no variant to restock");
      const result = await inventory.adjust(headers, { variantId: variant.id, delta: input.quantity, reason: "receive", note: input.note ?? "Dashboard quick restock", idempotencyKey: input.idempotencyKey });
      // Stock is part of the editor payload: a stale editor must reload instead of writing the old level back.
      const version = result.replayed
        ? (await pool.query<{ version: number }>("SELECT version FROM products WHERE id=$1", [productId])).rows[0].version
        : (await pool.query<{ version: number }>("UPDATE products SET version=version+1 WHERE id=$1 RETURNING version", [productId])).rows[0].version;
      return { ...result, product: { id: input.productId, version } };
    },
  };
}
export type CatalogAdminService = ReturnType<typeof createCatalogAdminService>;
