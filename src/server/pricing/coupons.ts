import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";
import { DEFAULT_HOLD_SECONDS, MAX_HOLD_SECONDS } from "../inventory/reservations.ts";

// Task 13B. Coupon quota on promotion_redemptions, run inside the caller's checkout transaction
// (Task 14A) next to reserveStock. The promotion row is locked first, so reservations for one
// coupon are serialised and the 0003 redemption trigger counts global and per-user use against a
// fresh snapshot: the last use has exactly one winner. Each checkout attempt holds at most one
// redemption; consume and release lock that row, so exactly one terminal transition wins.
// Lock order, for every function here: checkout attempt, promotion, then redemption rows. The
// redemption trigger itself updates the promotion row, so a redemption must never be locked
// before its promotion.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const ended = (): never => fail("COUPON_RESERVATION_ENDED", 409, "This promo code reservation has ended");

const reserveInput = z.strictObject({ checkoutAttemptId: z.string().regex(UUID), holdSeconds: z.number().int().min(1).max(MAX_HOLD_SECONDS).optional() });
const consumeInput = z.strictObject({ checkoutAttemptId: z.string().regex(UUID), orderId: z.string().regex(UUID) });
const releaseInput = z.strictObject({ checkoutAttemptId: z.string().regex(UUID) });
const expireInput = z.strictObject({ limit: z.number().int().min(1).max(1000) });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fail("INVALID_INPUT", 400, "Invalid or unknown fields");
}

export interface CouponReservationDTO { redemptionId: string; promotionId: string; status: "reserved" | "used"; replayed: boolean; expiresAt: string }
export interface CouponTransitionDTO { redemptionId: string; status: string; changed: boolean }
interface RedemptionRow { id: string; promotion_id: string; status: string; order_id: string | null; expires_at: Date }

// The redemption trigger raises check violations; map them to stable shopper-facing codes.
function mapTrigger(error: unknown): never {
  const message = String((error as Error)?.message ?? "");
  if ((error as { code?: unknown }).code === "23514") {
    if (/usage limit reached/.test(message)) fail("COUPON_EXHAUSTED", 409, "This promo code has been fully used");
    if (/subject limit reached/.test(message)) fail("COUPON_LIMIT_REACHED", 409, "You have already used this promo code");
    if (/Subject proof required/.test(message)) fail("COUPON_SIGN_IN_REQUIRED", 409, "Sign in to use this promo code");
    if (/not available for a new reservation/.test(message)) fail("COUPON_INVALID", 409, "This promo code is not valid");
  }
  throw error;
}

/**
 * Reserves the coupon of the attempt's quote, if it has one (null otherwise). The amount and
 * promotion version come from the quote snapshot; a promotion edited since the quote is 409
 * QUOTE_STALE. Holds of this promotion that are past their expiry are expired first, so an
 * abandoned checkout never blocks the last use. Repeating it for the same attempt replays.
 */
export async function reserveCouponQuota(client: PoolClient, input: unknown): Promise<CouponReservationDTO | null> {
  const { checkoutAttemptId, holdSeconds = DEFAULT_HOLD_SECONDS } = parse(reserveInput, input);
  const attempt = (await client.query<{ status: string; user_id: string | null; coupon: { promotionId: string; version: number; discountMinor: string } | null }>(
    `SELECT a.status,c.user_id,q.policy_versions->'coupon' AS coupon FROM checkout_attempts a JOIN checkout_quotes q ON q.id=a.quote_id JOIN carts c ON c.id=a.cart_id
     WHERE a.id=$1 FOR UPDATE OF a`, [checkoutAttemptId])).rows[0];
  if (!attempt) return fail("NOT_FOUND", 404, "Not found");
  if (!attempt.coupon) return null;
  const { promotionId, version, discountMinor } = attempt.coupon;
  const promotion = (await client.query<{ version: number }>("SELECT version FROM promotions WHERE id=$1 FOR UPDATE", [promotionId])).rows[0];
  const existing = (await client.query<RedemptionRow>("SELECT id,promotion_id,status,order_id,expires_at FROM promotion_redemptions WHERE promotion_id=$1 AND checkout_attempt_id=$2", [promotionId, checkoutAttemptId])).rows[0];
  if (existing) {
    if (existing.status !== "reserved" && existing.status !== "used") ended();
    return { redemptionId: existing.id, promotionId, status: existing.status as "reserved" | "used", replayed: true, expiresAt: existing.expires_at.toISOString() };
  }
  if (attempt.status !== "pending") fail("CHECKOUT_CLOSED", 409, "This checkout is no longer open");
  if (!promotion || promotion.version !== version) fail("QUOTE_STALE", 409, "Prices or policies changed; request a new quote");
  await client.query(`UPDATE promotion_redemptions SET status='expired',ended_at=clock_timestamp() WHERE id IN (
    SELECT id FROM promotion_redemptions WHERE promotion_id=$1 AND status='reserved' AND expires_at<=clock_timestamp() FOR UPDATE SKIP LOCKED)`, [promotionId]);
  try {
    const row = (await client.query<RedemptionRow>(
      `INSERT INTO promotion_redemptions(id,promotion_id,checkout_attempt_id,user_id,amount_minor,status,expires_at)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,'reserved',clock_timestamp()+make_interval(secs=>$5)) RETURNING id,promotion_id,status,order_id,expires_at`,
      [promotionId, checkoutAttemptId, attempt.user_id, discountMinor, holdSeconds])).rows[0];
    return { redemptionId: row.id, promotionId, status: "reserved", replayed: false, expiresAt: row.expires_at.toISOString() };
  } catch (error) { return mapTrigger(error); }
}

// Locks the attempt's promotion, then its redemption (see the lock order above).
async function lockRedemption(client: PoolClient, checkoutAttemptId: string): Promise<RedemptionRow | undefined> {
  const found = (await client.query<{ promotion_id: string }>("SELECT promotion_id FROM promotion_redemptions WHERE checkout_attempt_id=$1 ORDER BY promotion_id LIMIT 1", [checkoutAttemptId])).rows[0];
  if (!found) return undefined;
  await client.query("SELECT 1 FROM promotions WHERE id=$1 FOR UPDATE", [found.promotion_id]);
  return (await client.query<RedemptionRow>("SELECT id,promotion_id,status,order_id,expires_at FROM promotion_redemptions WHERE checkout_attempt_id=$1 AND promotion_id=$2 FOR UPDATE", [checkoutAttemptId, found.promotion_id])).rows[0];
}

/** Marks the attempt's reservation used by its order (once). A released or expired hold is 409. Null when the attempt has no coupon. */
export async function consumeCouponQuota(client: PoolClient, input: unknown): Promise<CouponTransitionDTO | null> {
  const { checkoutAttemptId, orderId } = parse(consumeInput, input);
  const row = await lockRedemption(client, checkoutAttemptId);
  if (!row) return null;
  if (row.status === "used") return row.order_id === orderId ? { redemptionId: row.id, status: "used", changed: false } : fail("CONFLICT", 409, "This promo code was used by another order");
  if (row.status !== "reserved") return ended();
  try {
    await client.query("UPDATE promotion_redemptions SET status='used',order_id=$2,ended_at=clock_timestamp() WHERE id=$1", [row.id, orderId]);
  } catch (error) { return mapTrigger(error); }
  return { redemptionId: row.id, status: "used", changed: true };
}

/** Returns a reserved hold to the quota. A no-op (changed: false) once used, released or expired. */
export async function releaseCouponQuota(client: PoolClient, input: unknown): Promise<CouponTransitionDTO | null> {
  const { checkoutAttemptId } = parse(releaseInput, input);
  const row = await lockRedemption(client, checkoutAttemptId);
  if (!row) return null;
  if (row.status !== "reserved") return { redemptionId: row.id, status: row.status, changed: false };
  await client.query("UPDATE promotion_redemptions SET status='released',ended_at=clock_timestamp() WHERE id=$1", [row.id]);
  return { redemptionId: row.id, status: "released", changed: true };
}

/** Expires a bounded batch of reserved holds past their expiry, skipping rows another transaction holds. */
export async function expireDueCouponReservations(client: PoolClient, input: unknown): Promise<{ expired: number }> {
  const { limit } = parse(expireInput, input);
  // Promotions are locked one at a time in id order, each before its own redemption rows.
  const promotions = (await client.query<{ promotion_id: string }>(
    "SELECT DISTINCT promotion_id FROM promotion_redemptions WHERE status='reserved' AND expires_at<=clock_timestamp() ORDER BY promotion_id LIMIT $1", [limit])).rows;
  let expired = 0;
  for (const { promotion_id } of promotions) {
    if (expired >= limit) break;
    await client.query("SELECT 1 FROM promotions WHERE id=$1 FOR UPDATE", [promotion_id]);
    const result = await client.query(`UPDATE promotion_redemptions SET status='expired',ended_at=clock_timestamp() WHERE id IN (
       SELECT id FROM promotion_redemptions WHERE promotion_id=$1 AND status='reserved' AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT $2 FOR UPDATE SKIP LOCKED)`, [promotion_id, limit - expired]);
    expired += result.rowCount ?? 0;
  }
  return { expired };
}
