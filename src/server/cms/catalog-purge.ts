import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";

// Owner 2026-11-22 (admin bin delete): a product or SKU that was never ordered and never in a checkout may be deleted
// for good, manual stock history included. Orders and checkout history (reservations, consumption, returns) are
// immutable, so anything that has them is refused and the owner archives it instead. Migration 0027 opens the ledger
// only inside a transaction that set grmn.catalog_purge, and only for manual movements and unreserved balances.

export type PurgeSubject = "product" | "SKU";

const MANUAL_REASONS = ["opening", "receive", "adjust"];
const refuse = (message: string): never => { throw new AuthFailure("CONFLICT", 409, message); };

/** Refuses (409 CONFLICT) when any of these variants, or the product, was ordered or was in a checkout. */
export async function assertPurgeable(client: PoolClient, variantIds: string[], subject: PurgeSubject, productId?: string): Promise<void> {
  const name = subject === "product" ? "This product" : "This SKU";
  const ordered = await client.query("SELECT 1 FROM order_items WHERE variant_id=ANY($1::uuid[]) OR product_id=$2::uuid LIMIT 1", [variantIds, productId ?? null]);
  if (ordered.rowCount) refuse(`${name} has orders, so it cannot be deleted; archive it instead`);
  const checkout = await client.query(
    "SELECT 1 FROM reservation_lines WHERE variant_id=ANY($1::uuid[]) UNION ALL SELECT 1 FROM stock_movements WHERE variant_id=ANY($1::uuid[]) AND reason<>ALL($2::text[]) LIMIT 1",
    [variantIds, MANUAL_REASONS]);
  if (checkout.rowCount) refuse(`${name} was in a checkout, so it cannot be deleted; archive it instead`);
}

/** Deletes the variants' manual stock movements and balances through the 0027 door; audits what was purged. */
export async function purgeVariantStock(client: PoolClient, principal: Principal, target: { type: string; id: string }, variantIds: string[]): Promise<{ movements: number; units: number }> {
  if (!variantIds.length) return { movements: 0, units: 0 };
  await client.query("SELECT set_config('grmn.catalog_purge','1',true)");
  const deleted = (await client.query<{ delta: number }>("DELETE FROM stock_movements WHERE variant_id=ANY($1::uuid[]) RETURNING delta_on_hand AS delta", [variantIds])).rows;
  await client.query("DELETE FROM inventory_balances WHERE variant_id=ANY($1::uuid[])", [variantIds]);
  await client.query("SELECT set_config('grmn.catalog_purge','',true)");
  const result = { movements: deleted.length, units: deleted.reduce((sum, row) => sum + Number(row.delta), 0) };
  if (result.movements > 0) {
    await client.query(
      "INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'catalog.stock_purged',$3,$4,$5,$6)",
      [randomUUID(), principal.userId, target.type, target.id, randomUUID(), JSON.stringify({ variants: variantIds.length, ...result })]);
  }
  return result;
}

/** Removes the shopper and promotion rows that point at these variants (cart lines, promotion and price-adjustment links). */
export async function deleteVariantReferences(client: PoolClient, variantIds: string[]): Promise<void> {
  if (!variantIds.length) return;
  for (const table of ["cart_items", "promotion_variants", "price_adjustment_variants"])
    await client.query(`DELETE FROM ${table} WHERE variant_id=ANY($1::uuid[])`, [variantIds]);
}
