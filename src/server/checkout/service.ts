import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { CheckoutResultDTO, CheckoutStatusDTO, FulfillmentStatus, Money, OrderStatus, PaymentStatus } from "../../contracts/commerce.ts";
import { AuthFailure } from "../auth/config.ts";
import { reserveStock, withInventoryTransaction } from "../inventory/reservations.ts";
import { reserveCouponQuota } from "../pricing/coupons.ts";
import { revalidateQuote, type DeliverySnapshot } from "../pricing/quote.ts";
import { appendOutboxEvent } from "../operations/outbox.ts";
import { enqueueOrderAlerts } from "../notifications/whatsapp.ts";
import type { PaymentProvider, PaymentProviders } from "../payments/provider.ts";

// Task 14A. Idempotent checkout inside the exact plan Section 6 boundary, in ONE short
// transaction with no network call: claim the idempotency key (checkout_attempts), lock the cart
// revision, revalidate the quote, reserve the coupon quota and the stock, write the immutable
// order snapshot (GRM- sequence number), a demo payment attempt, an order event, an outbox event,
// a hashed guest status token and the idempotency result, and convert the cart. The deferred
// orders_seal trigger checks that lines, address and totals reconcile and commits the attempt.
// Lock order: checkout attempt, cart, promotion, stock balances (then order rows it creates).
// Any failure rolls everything back, so the key can simply be retried.

/** Consumer of order.placed. Payment session creation (Task 14B) hangs off this job kind. */
export const PAYMENT_START_KIND = "payments.session.start";
const OPERATION = "checkout";
const IDEMPOTENCY_KEY = /^[ -~]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const STATUS_TOKEN_DAYS = 90, IDEMPOTENCY_DAYS = 30;

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");
const stale = (): never => fail("QUOTE_STALE", 409, "Your cart changed; request a new quote");

const checkoutInput = z.strictObject({
  quoteId: z.string().regex(UUID),
  cartVersion: z.number().int().min(1).max(2147483647),
  paymentMethod: z.enum(["demo", "kaspi", "secondary"]),
  contactEmail: z.string().trim().max(254).email().optional(),
});
const statusInput = z.strictObject({ orderId: z.string().regex(UUID), statusToken: z.string().regex(STATUS_TOKEN).optional() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

export interface CheckoutActor { userId: string | null; guestTokenHash: string | null }
interface StoredLine { variantId: string; productId: string; quantity: number; unitMinor: string; discountMinor: string; taxMinor: string; includedTaxMinor: string; totalMinor: string; baseUnitMinor: string; markdownRules: string[] }
interface QuoteSnapshot {
  delivery_snapshot: DeliverySnapshot; lines_snapshot: StoredLine[]; policy_versions: Record<string, unknown> & { coupon: { code: string; promotionId: string } | null; shippingPolicy: Record<string, unknown> };
  usd_snapshot: Record<string, unknown> | null; subtotal_minor: string; discount_minor: string; shipping_minor: string; tax_minor: string; total_minor: string;
}

const kzt = (amountMinor: string): Money => ({ amountMinor, currency: "KZT" });
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]"
  : value !== null && typeof value === "object" ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}"
  : JSON.stringify(value);

function actorScope(actor: CheckoutActor): string | null {
  if (actor.userId) return `user:${actor.userId}`;
  return actor.guestTokenHash ? `guest:${actor.guestTokenHash}` : null;
}

// The raw guest token is never stored: it is derived from the order id with the server secret, so
// a retried checkout (a lost response) returns the same token, and only its sha256 is in the table.
const statusToken = (secret: string, orderId: string) => createHmac("sha256", secret).update("grmn-order-status:v1:" + orderId).digest("base64url");

async function result(client: Pick<PoolClient, "query">, secret: string, scope: string, orderId: string, replayed: boolean): Promise<CheckoutResultDTO> {
  const order = (await client.query<{ order_number: string; order_status: OrderStatus; total_minor: string; payment_mode: string }>(
    "SELECT order_number,order_status,total_minor::text AS total_minor,payment_mode FROM orders WHERE id=$1", [orderId])).rows[0] ?? notFound();
  return {
    orderId, orderNumber: order.order_number, status: order.order_status, paymentMode: order.payment_mode === "demo" ? "demo" : "live", paymentState: "pending", paymentRedirectUrl: null,
    total: kzt(order.total_minor), statusToken: scope.startsWith("guest:") ? statusToken(secret, orderId) : null, replayed,
  };
}

async function replay(client: PoolClient, secret: string, scope: string, key: string, requestHash: string): Promise<CheckoutResultDTO | null> {
  const record = (await client.query<{ request_hash: string; result: { orderId: string } }>(
    "SELECT request_hash,result FROM idempotency_records WHERE actor_scope=$1 AND operation=$2 AND key=$3 AND status='completed'", [scope, OPERATION, key])).rows[0];
  if (!record) return null;
  if (record.request_hash !== requestHash) fail("IDEMPOTENCY_CONFLICT", 409, "This checkout key was already used for a different request");
  return result(client, secret, scope, record.result.orderId, true);
}

/**
 * Places a pending order for the actor's quoted cart revision. A repeated key returns the original
 * order. Payment is the demo adapter unless the caller registers a real provider for the requested
 * method (Task 14B; the application registers none yet, D03), so kaspi/secondary stay 409.
 */
export async function placeOrder(pool: Pool, secret: string, actor: CheckoutActor, idempotencyKey: string, input: unknown, options: { payments?: PaymentProviders } = {}): Promise<CheckoutResultDTO> {
  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(idempotencyKey)) invalid();
  const command = parse(checkoutInput, input);
  const provider: PaymentProvider | null = command.paymentMethod === "demo" ? null : options.payments?.get(command.paymentMethod) ?? null;
  if (command.paymentMethod !== "demo" && (!provider || provider.simulated || provider.name !== command.paymentMethod)) fail("PAYMENT_UNAVAILABLE", 409, "This payment method is not available yet");
  const paymentMode = provider ? "live" : "demo";
  const payment = provider ? { name: provider.name, environment: provider.environment, merchantAccount: provider.merchantAccount } : { name: "demo", environment: "demo", merchantAccount: "demo" };
  const scope = actorScope(actor) ?? notFound();
  const requestHash = sha256(canonical({ quoteId: command.quoteId.toLowerCase(), cartVersion: command.cartVersion, paymentMethod: command.paymentMethod, contactEmail: command.contactEmail ?? null }));

  return withInventoryTransaction(pool, async client => {
    const replayed = await replay(client, secret, scope, idempotencyKey, requestHash);
    if (replayed) return replayed;

    // The quote must belong to one of the actor's own carts: a session uses its account cart, a guest its capability cart.
    const owned = (await client.query<{ cart_id: string; cart_version: number }>(
      `SELECT q.cart_id,q.cart_version FROM checkout_quotes q JOIN carts c ON c.id=q.cart_id
       WHERE q.id=$1 AND CASE WHEN $2::uuid IS NOT NULL THEN c.user_id=$2::uuid ELSE c.user_id IS NULL AND c.guest_token_hash=$3 END`,
      [command.quoteId, actor.userId, actor.guestTokenHash])).rows[0] ?? notFound();
    if (owned.cart_version !== command.cartVersion) stale();

    // 1. Claim the key. A concurrent request with the same key waits here and then replays; a
    //    different key for the same cart revision loses on checkout_attempts_revision_winner_unique.
    const attemptId = randomUUID();
    let claimed: boolean;
    try {
      claimed = Boolean((await client.query(
        `INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,operation,idempotency_key,request_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (actor_scope,operation,idempotency_key) DO NOTHING RETURNING id`,
        [attemptId, owned.cart_id, owned.cart_version, command.quoteId, scope, OPERATION, idempotencyKey, requestHash])).rowCount);
    } catch (error) {
      if ((error as { code?: unknown }).code === "23505" && (error as { constraint?: unknown }).constraint === "checkout_attempts_revision_winner_unique") fail("CHECKOUT_CONFLICT", 409, "This cart was already checked out");
      throw error;
    }
    if (!claimed) return (await replay(client, secret, scope, idempotencyKey, requestHash)) ?? fail("CHECKOUT_CONFLICT", 409, "This checkout is already in progress");

    // 2. Lock the cart revision; it must still be the active, unchanged cart that was quoted.
    const cart = (await client.query<{ status: string; version: number }>("SELECT status,version FROM carts WHERE id=$1 FOR UPDATE", [owned.cart_id])).rows[0];
    if (!cart || cart.status !== "active" || cart.version !== command.cartVersion) stale();

    // 3. Revalidate (ignoring this attempt's own coupon hold), then hold the coupon and the stock.
    await revalidateQuote(client, { quoteId: command.quoteId, cartId: owned.cart_id, cartVersion: command.cartVersion, checkoutAttemptId: attemptId });
    const quote = (await client.query<QuoteSnapshot>(
      "SELECT delivery_snapshot,lines_snapshot,policy_versions,usd_snapshot,subtotal_minor::text,discount_minor::text,shipping_minor::text,tax_minor::text,total_minor::text FROM checkout_quotes WHERE id=$1",
      [command.quoteId])).rows[0];
    const couponHold = await reserveCouponQuota(client, { checkoutAttemptId: attemptId });
    const reservation = await reserveStock(client, { checkoutAttemptId: attemptId, lines: quote.lines_snapshot.map(line => ({ variantId: line.variantId, quantity: line.quantity })) });

    // 4. The immutable order snapshot.
    const delivery = quote.delivery_snapshot, orderId = randomUUID();
    const { coupon, ...policies } = quote.policy_versions;
    // Admin markdowns are already in the unit price; keep the pre-markdown price beside the snapshot.
    const markdownLines = quote.lines_snapshot.filter(line => line.baseUnitMinor !== line.unitMinor)
      .map(line => ({ variantId: line.variantId, baseUnitMinor: line.baseUnitMinor, unitMinor: line.unitMinor, rules: line.markdownRules }));
    const orderNumber = (await client.query<{ order_number: string }>(
      `INSERT INTO orders(id,checkout_attempt_id,user_id,contact_name,contact_phone,contact_email,currency,subtotal_minor,discount_minor,shipping_minor,tax_minor,shipping_tax_minor,total_minor,usd_snapshot,policy_versions,payment_mode,placed_at)
       VALUES($1,$2,$3,$4,$5,$6,'KZT',$7,$8,$9,$10,0,$11,$12,$13,$14,clock_timestamp()) RETURNING order_number`,
      [orderId, attemptId, actor.userId, delivery.recipientName, delivery.phone, command.contactEmail ?? null, quote.subtotal_minor, quote.discount_minor, quote.shipping_minor, quote.tax_minor, quote.total_minor,
        quote.usd_snapshot ? JSON.stringify(quote.usd_snapshot) : null, JSON.stringify({ ...policies, coupon, quoteId: command.quoteId, markdownLines }), paymentMode])).rows[0].order_number;

    const variants = new Map((await client.query<{ id: string; sku: string | null; variant_name: string; public_key: string; name: string }>(
      "SELECT v.id,v.sku,v.name AS variant_name,p.public_key,p.name FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=ANY($1::uuid[])",
      [quote.lines_snapshot.map(line => line.variantId)])).rows.map(row => [row.id, row]));
    for (const line of quote.lines_snapshot) {
      const variant = variants.get(line.variantId) ?? stale(), itemId = randomUUID();
      await client.query(
        `INSERT INTO order_items(id,order_id,product_id,variant_id,product_key,sku,name,options,quantity,unit_price_minor,discount_minor,tax_minor,total_minor)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [itemId, orderId, line.productId, line.variantId, variant.public_key, variant.sku, variant.name, JSON.stringify({ variant: variant.variant_name }),
          line.quantity, line.unitMinor, line.discountMinor, line.taxMinor, line.totalMinor]);
      if (BigInt(line.discountMinor) > BigInt(0) && coupon) await client.query(
        "INSERT INTO order_adjustments(id,order_id,order_item_id,kind,code,label,amount_minor,source_snapshot) VALUES($1,$2,$3,'discount',$4,$5,$6,$7)",
        [randomUUID(), orderId, itemId, coupon.code, `Promo code ${coupon.code}`, line.discountMinor, JSON.stringify(coupon)]);
      if (BigInt(line.taxMinor) > BigInt(0)) await client.query(
        "INSERT INTO order_adjustments(id,order_id,order_item_id,kind,label,amount_minor,source_snapshot) VALUES($1,$2,$3,'tax','Tax',$4,$5)",
        [randomUUID(), orderId, itemId, line.taxMinor, JSON.stringify(policies.taxPolicy ?? {})]);
      // Inclusive tax is inside the unit price (tax_minor stays 0), but the order still records it (review I3).
      if (BigInt(line.includedTaxMinor ?? "0") > BigInt(0)) await client.query(
        "INSERT INTO order_adjustments(id,order_id,order_item_id,kind,label,amount_minor,source_snapshot) VALUES($1,$2,$3,'tax','Tax included in the price',$4,$5)",
        [randomUUID(), orderId, itemId, line.includedTaxMinor, JSON.stringify({ ...(policies.taxPolicy as Record<string, unknown> ?? {}), mode: "inclusive", included: true })]);
    }
    if (BigInt(quote.shipping_minor) > BigInt(0)) await client.query(
      "INSERT INTO order_adjustments(id,order_id,kind,label,amount_minor,source_snapshot) VALUES($1,$2,'shipping','Shipping',$3,$4)",
      [randomUUID(), orderId, quote.shipping_minor, JSON.stringify(policies.shippingPolicy ?? {})]);
    await client.query(
      "INSERT INTO order_addresses(id,order_id,kind,recipient_name,phone,country_code,city,line1,line2,region,postal_code) VALUES($1,$2,'structured',$3,$4,$5,$6,$7,$8,$9,$10)",
      [randomUUID(), orderId, delivery.recipientName, delivery.phone, delivery.countryCode, delivery.city, delivery.line1, delivery.line2 ?? null, delivery.region ?? null, delivery.postalCode ?? null]);
    await client.query("UPDATE inventory_reservations SET order_id=$1 WHERE id=$2", [orderId, reservation.reservationId]);
    // The coupon hold belongs to this order too (review I2); its promotion is already locked above.
    if (couponHold) await client.query("UPDATE promotion_redemptions SET order_id=$1 WHERE id=$2 AND order_id IS NULL", [orderId, couponHold.redemptionId]);

    // 5. The payment attempt. No provider call here: the payments.session.start job opens the
    //    session after commit with the attempt's stable key (Task 14B).
    const paymentAttemptId = randomUUID();
    await client.query(
      `INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,currency,amount_minor,status)
       VALUES($1,$2,$7,$8,$9,$3,$4,$5,'KZT',$6,'created')`,
      [paymentAttemptId, orderId, orderNumber, `payment:${attemptId}`, sha256(canonical({ orderId, amountMinor: quote.total_minor, currency: "KZT" })), quote.total_minor,
        payment.name, payment.environment, payment.merchantAccount]);
    await client.query(
      "INSERT INTO order_events(id,order_id,type,source,actor_user_id,dedupe_key,visibility,occurred_at,payload) VALUES($1,$2,'order.placed','checkout',$3,$4,'customer',clock_timestamp(),$5)",
      [randomUUID(), orderId, actor.userId, `order-placed:${orderId}`, JSON.stringify({ orderNumber, totalMinor: quote.total_minor, paymentMode })]);
    await appendOutboxEvent(client, {
      topic: "order.placed", dedupeKey: `order-placed:${orderId}`, aggregate: { type: "order", id: orderId }, consumers: [PAYMENT_START_KIND],
      payload: { orderId, orderNumber, checkoutAttemptId: attemptId, paymentAttemptId, totalMinor: quote.total_minor, currency: "KZT", paymentMode },
    });
    // Staff WhatsApp alert (no-op unless WHATSAPP_* is configured); the worker sends it after commit.
    await enqueueOrderAlerts(client, orderId, "placed");
    if (!actor.userId) await client.query(
      `INSERT INTO order_access_tokens(id,order_id,token_hash,scope,expires_at) VALUES($1,$2,$3,'order_status',clock_timestamp()+make_interval(days=>${STATUS_TOKEN_DAYS}))`,
      [randomUUID(), orderId, sha256(statusToken(secret, orderId))]);

    // 6. The cart revision is consumed; the next purchase needs a new cart.
    await client.query("UPDATE carts SET status='converted',updated_at=clock_timestamp() WHERE id=$1", [owned.cart_id]);
    await client.query(
      `INSERT INTO idempotency_records(id,actor_scope,operation,key,request_hash,status,result,expires_at) VALUES($1,$2,$3,$4,$5,'completed',$6,clock_timestamp()+make_interval(days=>${IDEMPOTENCY_DAYS}))`,
      [randomUUID(), scope, OPERATION, idempotencyKey, requestHash, JSON.stringify({ orderId, orderNumber, checkoutAttemptId: attemptId })]);
    return result(client, secret, scope, orderId, false);
  });
}

/** Order status for polling: the owning session, or a guest's status token. Anything else is 404. */
export async function readCheckoutStatus(pool: Pool, actor: CheckoutActor, input: unknown): Promise<CheckoutStatusDTO> {
  const command = parse(statusInput, input);
  const row = (await pool.query<{ id: string; order_number: string; order_status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; total_minor: string; placed_at: Date | null; payment_mode: string }>(
    `SELECT o.id,o.order_number,o.order_status,o.payment_status,o.fulfillment_status,o.total_minor::text AS total_minor,o.placed_at,o.payment_mode FROM orders o
     WHERE o.id=$1 AND o.payment_mode IN ('demo','live') AND o.checkout_attempt_id IS NOT NULL AND (($2::uuid IS NOT NULL AND o.user_id=$2::uuid) OR EXISTS(
       SELECT 1 FROM order_access_tokens t WHERE t.order_id=o.id AND t.token_hash=$3 AND t.scope='order_status' AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp()))`,
    [command.orderId, actor.userId, command.statusToken ? sha256(command.statusToken) : null])).rows[0] ?? notFound();
  return {
    orderId: row.id, orderNumber: row.order_number, status: row.order_status, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status,
    paymentMode: row.payment_mode === "demo" ? "demo" : "live", total: kzt(row.total_minor), placedAt: row.placed_at ? row.placed_at.toISOString() : null,
  };
}
