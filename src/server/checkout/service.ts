import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { CheckoutResultDTO, CheckoutStatusDTO, FulfillmentStatus, Money, OrderStatus, PaymentStatus } from "../../contracts/commerce.ts";
import { AuthFailure } from "../auth/config.ts";
import { MAX_HOLD_SECONDS, reserveStock, withInventoryTransaction } from "../inventory/reservations.ts";
import { reserveCouponQuota } from "../pricing/coupons.ts";
import { revalidateQuote, type DeliverySnapshot } from "../pricing/quote.ts";
import { appendOutboxEvent } from "../operations/outbox.ts";
import type { PaymentMethodCode } from "../../contracts/commerce.ts";
import type { PaymentProvider, PaymentProviders } from "../payments/provider.ts";
import { createManualProvider } from "../payments/manual-provider.ts";
import { availablePaymentMethods } from "../payments/demo-mode.ts";
import { confirmDemoCapture } from "../payments/service.ts";

// Task 14A. Idempotent checkout inside the exact plan Section 6 boundary, in ONE short
// transaction with no network call: claim the idempotency key (checkout_attempts), lock the cart
// revision, revalidate the quote, reserve the coupon quota and the stock, write the immutable
// order snapshot (GRM- sequence number), a demo payment attempt, an order event, an outbox event,
// a hashed guest status token and the idempotency result, and convert the cart. The deferred
// orders_seal trigger checks that lines, address and totals reconcile and commits the attempt.
// Lock order: checkout attempt, cart, unpaid-order limit (advisory, customer then address),
// promotion, stock balances (then order rows it creates).
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
  paymentMethod: z.enum(["demo", "manual", "kaspi", "secondary"]),
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
    // Task 3.2: a demo order is paid by the simulated demo capture, so its payment is "simulated".
    orderId, orderNumber: order.order_number, status: order.order_status, paymentMode: order.payment_mode === "demo" ? "demo" : "live",
    paymentState: order.payment_mode === "demo" ? "simulated" : "pending", paymentRedirectUrl: null,
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

/** The default stock and coupon hold of a manual-payment order when settings do not say (O07). */
export const MANUAL_HOLD_HOURS = 48;

/**
 * Hold abuse (owner decision 2026-11-18): a manual-payment order holds stock for up to the manual
 * hold, so one customer, and one client address, may have at most this many unpaid manual orders at
 * a time. An order stops counting once it is paid, cancelled or expired, or its hold has ended.
 */
export const MAX_UNPAID_MANUAL_ORDERS = 3;
/** The longest hold a reservation can have (settings allow at most 168 h): older orders cannot still be held. */
const MAX_HOLD_HOURS = MAX_HOLD_SECONDS / 3600;
const UNPAID_MANUAL = `o.order_status='pending_payment' AND o.payment_status IN ('unpaid','pending','failed') AND o.payment_mode='live'
  AND EXISTS(SELECT 1 FROM payment_attempts a WHERE a.order_id=o.id AND a.provider='manual')
  AND EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.checkout_attempt_id=o.checkout_attempt_id AND r.status='active' AND r.expires_at>clock_timestamp())`;

/** The keyed hash stored for the limit: no raw address is kept (the rate-limit convention). */
function clientAddressHash(secret: string, address: string | null | undefined): string | null {
  return address ? createHmac("sha256", secret).update(`unpaid-orders:v1:${address}`).digest("hex") : null;
}

/**
 * Refuses a manual checkout when the customer or the client address already has the maximum of
 * unpaid manual orders. A transaction-scoped advisory lock per identity (customer first, then
 * address) serialises concurrent checkouts, so they cannot pass the limit together; under READ
 * COMMITTED the count after the lock sees every order committed by the previous holder.
 */
async function enforceUnpaidLimit(client: PoolClient, userId: string | null, addressHash: string | null): Promise<void> {
  if (userId) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`unpaid-orders:user:${userId}`]);
  if (addressHash) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`unpaid-orders:address:${addressHash}`]);
  // 21B re-run: the identity must drive the plan. Planned freely, PostgreSQL started from every manual
  // payment attempt when its statistics were stale (414 ms per checkout at 1M orders, 87% of database
  // time). The MATERIALIZED CTE reads only this identity's orders, bounded to the longest possible hold.
  const count = async (mine: string, value: string) => (await client.query<{ n: number }>(
    `WITH mine AS MATERIALIZED (${mine} AND o.placed_at>now()-make_interval(hours=>${MAX_HOLD_HOURS}))
     SELECT count(*)::int AS n FROM (SELECT 1 FROM mine o WHERE ${UNPAID_MANUAL} LIMIT $2) x`, [value, MAX_UNPAID_MANUAL_ORDERS])).rows[0].n;
  const columns = "o.id,o.checkout_attempt_id,o.order_status,o.payment_status,o.payment_mode";
  if (userId && await count(`SELECT ${columns} FROM orders o WHERE o.user_id=$1`, userId) >= MAX_UNPAID_MANUAL_ORDERS)
    fail("TOO_MANY_UNPAID_ORDERS", 409, `You already have ${MAX_UNPAID_MANUAL_ORDERS} orders awaiting payment. Pay for or cancel one before placing another.`);
  if (addressHash && await count(`SELECT ${columns} FROM checkout_attempts c JOIN orders o ON o.checkout_attempt_id=c.id WHERE c.client_address_hash=$1 AND c.created_at>now()-make_interval(hours=>${MAX_HOLD_HOURS})`, addressHash) >= MAX_UNPAID_MANUAL_ORDERS)
    fail("TOO_MANY_UNPAID_ORDERS", 409, `Too many orders from this connection are awaiting payment. Pay for one before placing another.`);
}

/**
 * Places a pending order for the actor's quoted cart revision. A repeated key returns the original
 * order. "manual" (O07) is real checkout: staff confirm the payment later, and the stock and coupon
 * are held for the configured manual hold. "demo" is the simulated method of the "Demo checkout"
 * setting (Task 3.1): while demo checkout is on only demo is accepted, while it is off only manual
 * (PAYMENT_METHOD_UNAVAILABLE otherwise, before anything is claimed or reserved). A demo order is
 * captured right after it is sealed (Task 3.2), so it comes back confirmed and paid, labelled demo.
 * kaspi/secondary need a registered real provider (Task 14B; none yet, D03).
 */
export async function placeOrder(pool: Pool, secret: string, actor: CheckoutActor, idempotencyKey: string, input: unknown, options: { payments?: PaymentProviders; clientAddress?: string | null } = {}): Promise<CheckoutResultDTO> {
  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(idempotencyKey)) invalid();
  const command = parse(checkoutInput, input);
  const provider: PaymentProvider | null = command.paymentMethod === "demo" ? null
    : command.paymentMethod === "manual" ? options.payments?.get("manual") ?? createManualProvider()
    : options.payments?.get(command.paymentMethod) ?? null;
  if (command.paymentMethod !== "demo" && (!provider || provider.simulated || provider.name !== command.paymentMethod)) fail("PAYMENT_UNAVAILABLE", 409, "This payment method is not available yet");
  const paymentMode = provider ? "live" : "demo";
  const payment = provider ? { name: provider.name, environment: provider.environment, merchantAccount: provider.merchantAccount } : { name: "demo", environment: "demo", merchantAccount: "demo" };
  const scope = actorScope(actor) ?? notFound();
  const addressHash = clientAddressHash(secret, options.clientAddress);
  const requestHash = sha256(canonical({ quoteId: command.quoteId.toLowerCase(), cartVersion: command.cartVersion, paymentMethod: command.paymentMethod, contactEmail: command.contactEmail ?? null }));

  const placed = await withInventoryTransaction(pool, async client => {
    const replayed = await replay(client, secret, scope, idempotencyKey, requestHash);
    if (replayed) return replayed;
    // Task 3.1: demo and manual are never offered together. A retried key still replays its order
    // above after the setting changed; a new checkout must use the method offered now.
    if ((command.paymentMethod === "demo" || command.paymentMethod === "manual") && !(await availablePaymentMethods(client)).includes(command.paymentMethod))
      fail("PAYMENT_METHOD_UNAVAILABLE", 409, "Checkout options changed (demo checkout was turned off or on). Reload checkout and try again.");

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
        `INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,operation,idempotency_key,request_hash,client_address_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (actor_scope,operation,idempotency_key) DO NOTHING RETURNING id`,
        [attemptId, owned.cart_id, owned.cart_version, command.quoteId, scope, OPERATION, idempotencyKey, requestHash, addressHash])).rowCount);
    } catch (error) {
      if ((error as { code?: unknown }).code === "23505" && (error as { constraint?: unknown }).constraint === "checkout_attempts_revision_winner_unique") fail("CHECKOUT_CONFLICT", 409, "This cart was already checked out");
      throw error;
    }
    if (!claimed) return (await replay(client, secret, scope, idempotencyKey, requestHash)) ?? fail("CHECKOUT_CONFLICT", 409, "This checkout is already in progress");

    // 2. Lock the cart revision; it must still be the active, unchanged cart that was quoted.
    const cart = (await client.query<{ status: string; version: number }>("SELECT status,version FROM carts WHERE id=$1 FOR UPDATE", [owned.cart_id])).rows[0];
    if (!cart || cart.status !== "active" || cart.version !== command.cartVersion) stale();
    if (command.paymentMethod === "manual") await enforceUnpaidLimit(client, actor.userId, addressHash);

    // 3. Revalidate (ignoring this attempt's own coupon hold), then hold the coupon and the stock.
    await revalidateQuote(client, { quoteId: command.quoteId, cartId: owned.cart_id, cartVersion: command.cartVersion, checkoutAttemptId: attemptId });
    const quote = (await client.query<QuoteSnapshot>(
      "SELECT delivery_snapshot,lines_snapshot,policy_versions,usd_snapshot,subtotal_minor::text,discount_minor::text,shipping_minor::text,tax_minor::text,total_minor::text FROM checkout_quotes WHERE id=$1",
      [command.quoteId])).rows[0];
    // O07: a manual-payment order holds its stock and coupon while staff wait for the money.
    const holdSeconds = command.paymentMethod === "manual"
      ? 3600 * ((await client.query<{ hours: number }>("SELECT manual_payment_hold_hours AS hours FROM store_settings WHERE id=1")).rows[0]?.hours ?? MANUAL_HOLD_HOURS)
      : undefined;
    const hold = holdSeconds === undefined ? {} : { holdSeconds };
    const couponHold = await reserveCouponQuota(client, { checkoutAttemptId: attemptId, ...hold });
    const reservation = await reserveStock(client, { checkoutAttemptId: attemptId, ...hold, lines: quote.lines_snapshot.map(line => ({ variantId: line.variantId, quantity: line.quantity })) });

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

  // Task 3.2 ("full demo", replacing D03): once the order is sealed and committed, a demo order is
  // captured in the same request, like a paid order. The capture is idempotent on the demo payment
  // attempt, so a replayed key (retry, double click, a crash before this step) captures at most once.
  if (placed.paymentMode !== "demo" || placed.status !== "pending_payment") return placed;
  const demoAttempt = (await pool.query<{ id: string }>(
    "SELECT id FROM payment_attempts WHERE order_id=$1 AND provider='demo' AND environment='demo' AND merchant_account='demo' ORDER BY created_at,id LIMIT 1", [placed.orderId])).rows[0];
  if (!demoAttempt) return placed;
  try {
    await confirmDemoCapture(pool, { orderId: placed.orderId, attemptId: demoAttempt.id });
  } catch (error) {
    // The order is committed and its key completed, so the shopper still gets their order. It stays
    // pending_payment (demo); a same-key retry captures it once, and if nobody retries, the unpaid-order
    // sweep cancels it when its hold ends and releases the stock. Only the order id and code are logged.
    const code = (error as { code?: unknown } | null)?.code;
    console.error("Demo capture failed after checkout", placed.orderId, typeof code === "string" ? code : "UNKNOWN");
  }
  return result(pool, secret, scope, placed.orderId, placed.replayed);
}

/** Order status for polling: the owning session, or a guest's status token. Anything else is 404. */
export async function readCheckoutStatus(pool: Pool, actor: CheckoutActor, input: unknown): Promise<CheckoutStatusDTO> {
  const command = parse(statusInput, input);
  const row = (await pool.query<{ id: string; order_number: string; order_status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; total_minor: string; placed_at: Date | null; payment_mode: string;
    method: PaymentMethodCode | null; pay_by: Date | null; instructions: string | null }>(
    `SELECT o.id,o.order_number,o.order_status,o.payment_status,o.fulfillment_status,o.total_minor::text AS total_minor,o.placed_at,o.payment_mode,
       (SELECT a.provider FROM payment_attempts a WHERE a.order_id=o.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS method,
       (SELECT max(r.expires_at) FROM inventory_reservations r WHERE r.checkout_attempt_id=o.checkout_attempt_id AND r.status='active') AS pay_by,
       (SELECT s.manual_payment_instructions FROM store_settings s WHERE s.id=1) AS instructions
     FROM orders o
     WHERE o.id=$1 AND o.payment_mode IN ('demo','live') AND o.checkout_attempt_id IS NOT NULL AND (($2::uuid IS NOT NULL AND o.user_id=$2::uuid) OR EXISTS(
       SELECT 1 FROM order_access_tokens t WHERE t.order_id=o.id AND t.token_hash=$3 AND t.scope='order_status' AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp()))`,
    [command.orderId, actor.userId, command.statusToken ? sha256(command.statusToken) : null])).rows[0] ?? notFound();
  const awaiting = row.order_status === "pending_payment" && ["unpaid", "pending", "failed"].includes(row.payment_status);
  return {
    orderId: row.id, orderNumber: row.order_number, status: row.order_status, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status,
    paymentMode: row.payment_mode === "demo" ? "demo" : "live", total: kzt(row.total_minor), placedAt: row.placed_at ? row.placed_at.toISOString() : null,
    paymentMethod: row.method,
    // O07: instructions and the hold end only matter while the order still awaits payment.
    paymentInstructions: awaiting && row.method === "manual" ? row.instructions : null,
    payBy: awaiting && row.pay_by ? row.pay_by.toISOString() : null,
  };
}
