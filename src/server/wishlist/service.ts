import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { DatabaseHandle } from "../db/client.ts";
import type { Principal } from "../context.ts";
import type { Availability, WishlistItemDTO } from "../../contracts/commerce.ts";
import { AuthFailure } from "../auth/config.ts";
import { publicImage } from "../catalog/service.ts";
import { PRODUCT_KEY } from "../cart/service.ts";

// Persistent wishlist (Task 13A, decision D08). Membership is unique per (owner, product) and the owner
// is always the session principal: no input names a user or a wishlist. Adds and removes are idempotent.
// Archived or no-longer-sold products stay listed and are shown as unavailable.

export const MAX_WISHLIST_ITEMS = 200;
const invalid = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };
const addInput = z.strictObject({ productKey: z.string().regex(PRODUCT_KEY) });

const LIST_SQL = `SELECT p.public_key,p.name,p.status,to_char(wi.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS added_at,
 offer.amount,offer.known,offer.free,
 COALESCE((SELECT COALESCE(m.source_path,m.storage_key) FROM product_media pm JOIN media_assets m ON m.id=pm.media_id WHERE pm.product_id=p.id AND m.status='ready' AND m.visibility='public' AND m.kind='image' ORDER BY pm.is_primary DESC,pm.position,pm.id LIMIT 1),p.legacy_content->>'image') AS image
 FROM wishlists w JOIN wishlist_items wi ON wi.wishlist_id=w.id JOIN products p ON p.id=wi.product_id
 LEFT JOIN LATERAL (SELECT min(pr.amount_minor)::text AS amount,count(ib.variant_id)::int AS known,COALESCE(sum(GREATEST(ib.on_hand-ib.reserved,0)),0)::int AS free
   FROM product_variants v JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market=$2
   LEFT JOIN (inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL) ON ib.variant_id=v.id
   WHERE v.product_id=p.id AND v.status='active' AND p.status='published') offer ON true
 WHERE w.user_id=$1 ORDER BY wi.created_at DESC,p.public_key LIMIT ${MAX_WISHLIST_ITEMS}`;

export function createWishlistService({ database, authorize, market = "default" }: { database: Pick<DatabaseHandle, "pool">; authorize: (headers: Headers) => Promise<Principal>; market?: string }) {
  async function list(userId: string): Promise<{ items: WishlistItemDTO[] }> {
    const rows = (await database.pool.query<{ public_key: string; name: string; status: string; added_at: string; amount: string | null; known: number | null; free: number | null; image: string | null }>(LIST_SQL, [userId, market])).rows;
    return { items: rows.map(row => {
      const archived = row.status !== "published", sold = !archived && row.amount !== null;
      const availability: Availability = !sold || !row.known ? "unavailable" : (row.free ?? 0) > 0 ? "available" : "out_of_stock";
      return { productKey: row.public_key, name: row.name, image: publicImage(row.image), price: sold ? { amountMinor: row.amount as string, currency: "KZT" } : null, availability, archived, addedAt: row.added_at };
    }) };
  }
  async function transaction(work: (client: PoolClient) => Promise<void>) {
    const client = await database.pool.connect();
    try { await client.query("BEGIN"); await work(client); await client.query("COMMIT"); }
    catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  return {
    async list(headers: Headers) { return list((await authorize(headers)).userId); },

    async add(headers: Headers, input: unknown) {
      const principal = await authorize(headers), parsed = addInput.safeParse(input);
      if (!parsed.success) invalid();
      const productKey = (parsed.data as { productKey: string }).productKey;
      await transaction(async client => {
        const product = (await client.query<{ id: string }>("SELECT id FROM products WHERE public_key=$1 AND status='published'", [productKey])).rows[0];
        if (!product) throw new AuthFailure("NOT_FOUND", 404, "This product is not available");
        await client.query("INSERT INTO wishlists(id,user_id) VALUES(gen_random_uuid(),$1) ON CONFLICT (user_id) DO NOTHING", [principal.userId]);
        const wishlist = (await client.query<{ id: string }>("SELECT id FROM wishlists WHERE user_id=$1 FOR UPDATE", [principal.userId])).rows[0];
        const present = (await client.query("SELECT 1 FROM wishlist_items WHERE wishlist_id=$1 AND product_id=$2", [wishlist.id, product.id])).rowCount;
        if (present) return;
        const count = (await client.query<{ n: number }>("SELECT count(*)::int AS n FROM wishlist_items WHERE wishlist_id=$1", [wishlist.id])).rows[0].n;
        if (count >= MAX_WISHLIST_ITEMS) throw new AuthFailure("WISHLIST_LIMIT", 409, `A wishlist holds at most ${MAX_WISHLIST_ITEMS} products`);
        await client.query("INSERT INTO wishlist_items(wishlist_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [wishlist.id, product.id]);
      });
      return list(principal.userId);
    },

    // Removing an absent product succeeds; only the caller's own wishlist can ever be touched.
    async remove(headers: Headers, productKey: string) {
      const principal = await authorize(headers);
      if (!PRODUCT_KEY.test(productKey)) invalid();
      await database.pool.query("DELETE FROM wishlist_items wi USING wishlists w,products p WHERE wi.wishlist_id=w.id AND wi.product_id=p.id AND w.user_id=$1 AND p.public_key=$2", [principal.userId, productKey]);
      return list(principal.userId);
    },
  };
}

export type WishlistService = ReturnType<typeof createWishlistService>;
