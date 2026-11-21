import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { AuthFailure } from "../auth/config.ts";
import { consumeReservation, expireReservation, releaseReservation, reserveStock, withInventoryTransaction } from "../inventory/reservations.ts";
import { consumeCouponQuota, releaseCouponQuota } from "../pricing/coupons.ts";
import { enqueueJob } from "../operations/outbox.ts";
import { enqueueOrderAlerts } from "../notifications/whatsapp.ts";
import { PAYMENT_START_KIND } from "../checkout/service.ts";
import type { PaymentEvent, PaymentProvenance, PaymentProvider, PaymentProviders } from "./provider.ts";

export { createPaymentProviders } from "./provider.ts";
export { createDemoProvider } from "./demo.ts";

// Task 14B. Payment sessions, the durable inbox of verified provider events, idempotent capture,
// one active payable attempt per order, reconciliation, and the order-level expiry of unpaid
// orders whose stock and coupon holds ended.
//
// No database transaction waits on a provider: sessions and lookups are called first, and their
// result is applied in a short transaction afterwards. Every writer here takes the same locks in
// the same order: checkout attempt, order, payment attempts, promotion row, the stock reservation
// header, balances, and last the coupon redemption row (review M4: the promotion is locked before
// any stock row, as checkout does; the redemption row itself is touched last, under the promotion
// and checkout-attempt locks, so no cycle exists). Capture is idempotent on the
// provider transaction id (payment_transactions dedupe), so duplicates, provider retries, a crashed
// worker and reconciliation racing a webhook apply each charge once.
// The demo provider is simulated: it never emits events and reconciliation skips it, so a demo
// order is never paid and no capture fact is written for it (D03, O07).

/** Worker job: process one verified inbox event. */
export const PAYMENT_INBOX_KIND = "payments.inbox.process";
const PAYABLE = new Set(["created", "pending", "requires_action", "authorized", "unknown"]);
const PAID = new Set(["paid", "partially_refunded", "refunded"]);
const EXPIRABLE_PAYMENT = ["unpaid", "pending", "failed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEXT = /^[ -~]{1,200}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const MAX_WEBHOOK_BYTES = 64 * 1024;
const RETRYABLE = new Set(["40P01", "40001"]);

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");
const unavailable = (): never => fail("PAYMENT_PROVIDER_UNAVAILABLE", 503, "The payment provider is not configured");
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]"
  : value !== null && typeof value === "object" ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}"
  : JSON.stringify(value);
const errorCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

export type PaymentOutcome = "paid" | "duplicate" | "exception" | "refund_required" | "failed" | "cancelled" | "authorized" | "ignored" | "mismatch" | "unmatched" | "unreadable";

interface OrderRow { id: string; order_number: string; checkout_attempt_id: string | null; order_status: string; payment_status: string; fulfillment_status: string; total_minor: string }
interface AttemptRow {
  id: string; order_id: string; provider: string; environment: string; merchant_account: string; merchant_reference: string;
  provider_session_id: string | null; idempotency_key: string; amount_minor: string; status: string;
}
const ATTEMPT_COLUMNS = "id,order_id,provider,environment,merchant_account,merchant_reference,provider_session_id,idempotency_key,amount_minor::text AS amount_minor,status";

function providerFor(providers: PaymentProviders, attempt: Pick<AttemptRow, "provider" | "environment" | "merchant_account">): PaymentProvider {
  const provider = providers.get(attempt.provider);
  if (!provider || provider.environment !== attempt.environment || provider.merchantAccount !== attempt.merchant_account) return unavailable();
  return provider!;
}
const provenance = (provider: PaymentProvider): PaymentProvenance => ({ provider: provider.name, environment: provider.environment, merchantAccount: provider.merchantAccount, simulated: provider.simulated });

/** Locks the checkout attempt, then the order (the canonical order), and returns the order. */
async function lockOrder(client: PoolClient, orderId: string): Promise<OrderRow> {
  const found = (await client.query<{ checkout_attempt_id: string | null }>("SELECT checkout_attempt_id FROM orders WHERE id=$1", [orderId])).rows[0] ?? notFound();
  if (found.checkout_attempt_id) await client.query("SELECT 1 FROM checkout_attempts WHERE id=$1 FOR UPDATE", [found.checkout_attempt_id]);
  return (await client.query<OrderRow>(
    "SELECT id,order_number,checkout_attempt_id,order_status,payment_status,fulfillment_status,total_minor::text AS total_minor FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
}

/** Locks the promotion of the order's coupon hold (if any) before any stock row (Task 13B lock order). */
async function lockCouponPromotion(client: PoolClient, checkoutAttemptId: string): Promise<void> {
  const found = (await client.query<{ promotion_id: string }>("SELECT promotion_id FROM promotion_redemptions WHERE checkout_attempt_id=$1 ORDER BY promotion_id LIMIT 1", [checkoutAttemptId])).rows[0];
  if (found) await client.query("SELECT 1 FROM promotions WHERE id=$1 FOR UPDATE", [found.promotion_id]);
}

async function orderEvent(client: PoolClient, orderId: string, type: string, source: string, dedupeKey: string, visibility: "internal" | "customer", payload: Record<string, unknown>): Promise<void> {
  await client.query(
    "INSERT INTO order_events(id,order_id,type,source,dedupe_key,visibility,occurred_at,payload) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),$7) ON CONFLICT (dedupe_key) DO NOTHING",
    [randomUUID(), orderId, type, source, dedupeKey, visibility, JSON.stringify(payload)]);
}

// Runs `work` under a savepoint. A business refusal rolls back to the savepoint and is returned;
// a deadlock or serialization failure is rethrown so the whole transaction is retried.
async function attempt<T>(client: PoolClient, work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  await client.query("SAVEPOINT payment_step");
  try {
    const value = await work();
    await client.query("RELEASE SAVEPOINT payment_step");
    return { ok: true, value };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT payment_step");
    const code = errorCode(error);
    if (typeof code === "string" && RETRYABLE.has(code)) throw error;
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------------------------
// Sessions

/**
 * Opens the provider session of a created attempt, outside any transaction, with the attempt's
 * stable idempotency key; then records it. A lost response leaves nothing recorded, and the retry
 * reaches the same provider session. A recorded or ended attempt is not sent again.
 */
export async function startPaymentSession(pool: Pool, providers: PaymentProviders, paymentAttemptId: string): Promise<{ status: "started" | "skipped"; sessionId: string | null }> {
  if (!UUID.test(paymentAttemptId)) notFound();
  const row = (await pool.query<AttemptRow>(`SELECT ${ATTEMPT_COLUMNS} FROM payment_attempts WHERE id=$1`, [paymentAttemptId])).rows[0] ?? notFound();
  if (row.provider_session_id || row.status !== "created") return { status: "skipped", sessionId: row.provider_session_id };
  const provider = providerFor(providers, row);
  const session = await provider.startSession({
    attemptId: row.id, orderId: row.order_id, idempotencyKey: row.idempotency_key, merchantReference: row.merchant_reference, amountMinor: row.amount_minor, currency: "KZT",
  });
  if (typeof session?.sessionId !== "string" || !TEXT.test(session.sessionId)) throw new AuthFailure("PAYMENT_PROVIDER_INVALID", 502, "The payment provider returned an invalid session");
  return withInventoryTransaction(pool, async client => {
    await lockOrder(client, row.order_id);
    const current = (await client.query<AttemptRow>(`SELECT ${ATTEMPT_COLUMNS} FROM payment_attempts WHERE id=$1 FOR UPDATE`, [row.id])).rows[0];
    if (current.provider_session_id || current.status !== "created") return { status: "skipped" as const, sessionId: current.provider_session_id };
    await client.query("UPDATE payment_attempts SET provider_session_id=$2,status='pending',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [row.id, session.sessionId]);
    await orderEvent(client, row.order_id, "payment.session_started", "payments", `payment-session:${row.id}`, "internal",
      { paymentAttemptId: row.id, sessionId: session.sessionId, provenance: provenance(provider) });
    return { status: "started" as const, sessionId: session.sessionId };
  });
}

// ---------------------------------------------------------------------------------------------
// Inbox

function validEvent(event: PaymentEvent | null): event is PaymentEvent {
  return Boolean(event) && typeof event!.eventId === "string" && TEXT.test(event!.eventId)
    && ["authorized", "captured", "failed", "cancelled"].includes(event!.kind)
    && typeof event!.merchantReference === "string" && TEXT.test(event!.merchantReference)
    && typeof event!.merchantAccount === "string" && typeof event!.environment === "string"
    && typeof event!.amountMinor === "string" && /^\d{1,18}$/.test(event!.amountMinor) && typeof event!.currency === "string"
    && (event!.sessionId === null || (typeof event!.sessionId === "string" && TEXT.test(event!.sessionId)))
    && (event!.transactionId === null || (typeof event!.transactionId === "string" && TEXT.test(event!.transactionId)))
    // Review M3: a malformed timestamp would abort the capture transaction in PostgreSQL.
    && (event!.occurredAt === null || (typeof event!.occurredAt === "string" && ISO_TIME.test(event!.occurredAt) && !Number.isNaN(Date.parse(event!.occurredAt))));
}
// A verified event must also belong to the adapter's own merchant account and environment.
const inContext = (provider: PaymentProvider, event: PaymentEvent) => event.merchantAccount === provider.merchantAccount && event.environment === provider.environment;

/**
 * Records a provider webhook durably before anything else, then verifies its signature over the
 * exact raw body. A verified event is queued once per provider event id; a forged, altered,
 * unreadable or out-of-context body stays as a rejected receipt. Simulated providers have no webhooks.
 */
export async function receiveWebhook(pool: Pool, providers: PaymentProviders, providerName: string, rawBody: Uint8Array, headers: Headers): Promise<{ status: "queued" | "duplicate" | "rejected"; inboxId: string }> {
  const provider = providers.get(providerName);
  if (!provider || provider.simulated) return notFound();
  if (rawBody.byteLength > MAX_WEBHOOK_BYTES) fail("PAYLOAD_TOO_LARGE", 413, "The webhook body is too large");
  const body = Buffer.from(rawBody), inboxId = randomUUID();
  await pool.query("INSERT INTO webhook_inbox(id,provider,environment,merchant_account,raw_body,body_sha256) VALUES($1,$2,$3,$4,$5,$6)",
    [inboxId, provider!.name, provider!.environment, provider!.merchantAccount, body, sha256(body)]);
  let event: PaymentEvent | null = null;
  try { event = provider!.verifySignature(body, headers) ? provider!.parseEvent(body) : null; } catch { event = null; }
  const reject = async () => {
    await pool.query("UPDATE webhook_inbox SET verification_state='rejected',status='rejected' WHERE id=$1 AND verification_state='unverified'", [inboxId]);
  };
  if (!validEvent(event) || !inContext(provider!, event)) { await reject(); return { status: "rejected", inboxId }; }
  try {
    return await withInventoryTransaction(pool, async client => {
      const existing = (await client.query<{ id: string }>(
        "SELECT id FROM webhook_inbox WHERE provider=$1 AND environment=$2 AND merchant_account=$3 AND external_event_id=$4 AND verification_state='verified'",
        [provider!.name, provider!.environment, provider!.merchantAccount, event!.eventId])).rows[0];
      if (existing) return { status: "duplicate" as const, inboxId: existing.id };
      await client.query("UPDATE webhook_inbox SET verification_state='verified',status='queued',verified_at=clock_timestamp(),external_event_id=$2 WHERE id=$1", [inboxId, event!.eventId]);
      await enqueueJob(client, { kind: PAYMENT_INBOX_KIND, dedupeKey: `inbox:${inboxId}`, payload: { inboxId } });
      return { status: "queued" as const, inboxId };
    }).then(async result => {
      // A duplicate delivery keeps its receipt, closed as rejected; the first verified row is the fact.
      if (result.status === "duplicate") await reject();
      return result;
    });
  } catch (error) {
    if (errorCode(error) !== "23505") throw error;
    await reject();
    const winner = (await pool.query<{ id: string }>(
      "SELECT id FROM webhook_inbox WHERE provider=$1 AND environment=$2 AND merchant_account=$3 AND external_event_id=$4 AND verification_state='verified'",
      [provider!.name, provider!.environment, provider!.merchantAccount, event!.eventId])).rows[0];
    return { status: "duplicate", inboxId: winner?.id ?? inboxId };
  }
}

/** Applies one verified inbox event and marks it processed, atomically. A processed event is not applied again. */
export async function processInboxEvent(pool: Pool, providers: PaymentProviders, inboxId: string, options: { beforeCommit?: () => void } = {}): Promise<{ outcome: PaymentOutcome | "already_processed" }> {
  if (!UUID.test(inboxId)) notFound();
  return withInventoryTransaction(pool, async client => {
    const row = (await client.query<{ provider: string; environment: string; merchant_account: string; raw_body: Buffer; status: string; verification_state: string }>(
      "SELECT provider,environment,merchant_account,raw_body,status,verification_state FROM webhook_inbox WHERE id=$1 FOR UPDATE", [inboxId])).rows[0] ?? notFound();
    if (row.status === "processed") return { outcome: "already_processed" as const };
    if (row.verification_state !== "verified") fail("WEBHOOK_NOT_VERIFIED", 409, "Only verified events are processed");
    const provider = providerFor(providers, row);
    const event = provider.parseEvent(row.raw_body);
    const outcome: PaymentOutcome = validEvent(event) && inContext(provider, event) ? await applyPaymentEvent(client, provider, event, "webhook") : "unreadable";
    options.beforeCommit?.();
    await client.query("UPDATE webhook_inbox SET status='processed',processed_at=clock_timestamp() WHERE id=$1", [inboxId]);
    return { outcome };
  });
}

// ---------------------------------------------------------------------------------------------
// Applying a verified fact

async function requestRefund(client: PoolClient, provider: PaymentProvider, order: OrderRow, transactionId: string, amountMinor: string, reason: string, source: string): Promise<void> {
  await client.query(
    `INSERT INTO refunds(id,transaction_id,order_id,provider,environment,merchant_account,idempotency_key,request_hash,amount_minor,status,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved',$10)`,
    [randomUUID(), transactionId, order.id, provider.name, provider.environment, provider.merchantAccount, `refund:${transactionId}`,
      sha256(canonical({ transactionId, amountMinor, reason })), amountMinor, reason]);
  await orderEvent(client, order.id, "payment.refund_required", source, `refund-required:${transactionId}`, "internal", { transactionId, amountMinor, reason });
}

/**
 * Applies one verified provider fact inside the caller's transaction. Exported for reconciliation;
 * webhooks arrive through the inbox. Events never move an attempt backwards: a failure or
 * authorization after a capture is ignored, and a capture is recorded at most once.
 */
export async function applyPaymentEvent(client: PoolClient, provider: PaymentProvider, event: PaymentEvent, source: "webhook" | "reconciliation"): Promise<PaymentOutcome> {
  if (provider.simulated) return "ignored";
  const found = (await client.query<{ id: string; order_id: string }>(
    "SELECT id,order_id FROM payment_attempts WHERE provider=$1 AND environment=$2 AND merchant_account=$3 AND merchant_reference=$4",
    [provider.name, provider.environment, provider.merchantAccount, event.merchantReference])).rows[0];
  if (!found) return "unmatched";
  const order = await lockOrder(client, found.order_id);
  const row = (await client.query<AttemptRow>(`SELECT ${ATTEMPT_COLUMNS} FROM payment_attempts WHERE id=$1 FOR UPDATE`, [found.id])).rows[0];
  const eventKey = `${provider.name}:${provider.environment}:${provider.merchantAccount}:${event.eventId}`;

  const mismatch = event.currency !== "KZT" || event.amountMinor !== row.amount_minor
    || (event.sessionId !== null && row.provider_session_id !== null && event.sessionId !== row.provider_session_id)
    || ((event.kind === "captured" || event.kind === "authorized") && !event.transactionId);
  if (mismatch) {
    await orderEvent(client, order.id, "payment.event_rejected", source, `payment-rejected:${eventKey}`, "internal",
      { paymentAttemptId: row.id, eventId: event.eventId, kind: event.kind, amountMinor: event.amountMinor, currency: event.currency, reason: "amount, currency, session or transaction mismatch" });
    // Review I2: a verified capture that does not match is still money taken. Record it when it can
    // be recorded (KZT), flag the order for staff and request a refund; never mark the order paid.
    if (event.kind === "captured" && event.transactionId) await mismatchedCapture(client, provider, order, row, event, eventKey, source);
    return "mismatch";
  }

  if (event.kind === "failed" || event.kind === "cancelled") {
    // Review I3: an authorization only ends by an explicit cancellation (void), never by a stray failure.
    if (!PAYABLE.has(row.status) || (row.status === "authorized" && event.kind === "failed")) return "ignored";
    await client.query("UPDATE payment_attempts SET status=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1", [row.id, event.kind]);
    // Review M7: a stale attempt's failure never flips an order that still has an open attempt.
    const open = (await client.query("SELECT 1 FROM payment_attempts WHERE order_id=$1 AND id<>$2 AND status=ANY($3::text[])", [order.id, row.id, [...PAYABLE]])).rowCount;
    if (order.order_status === "pending_payment" && !PAID.has(order.payment_status) && !open)
      await client.query("UPDATE orders SET payment_status='failed',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [order.id]);
    await orderEvent(client, order.id, `payment.${event.kind}`, source, `payment-${event.kind}:${row.id}`, "customer", { paymentAttemptId: row.id, eventId: event.eventId });
    return event.kind;
  }

  const transactionKind = event.kind === "captured" ? "capture" : "authorization";
  const inserted = await recordTransaction(client, provider, order, row, event, transactionKind, row.amount_minor, source);
  if (!inserted) return "duplicate";

  if (event.kind === "authorized") {
    if (!PAYABLE.has(row.status) || row.status === "authorized" || order.order_status !== "pending_payment" || PAID.has(order.payment_status)) return "ignored";
    await client.query("UPDATE payment_attempts SET status='authorized',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [row.id]);
    await client.query("UPDATE orders SET payment_status='authorized',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [order.id]);
    await orderEvent(client, order.id, "payment.authorized", source, `payment-authorized:${inserted}`, "internal", { paymentAttemptId: row.id, transactionId: inserted });
    return "authorized";
  }
  return capture(client, provider, order, row, inserted, source);
}

async function recordTransaction(client: PoolClient, provider: PaymentProvider, order: OrderRow, row: AttemptRow, event: PaymentEvent, kind: "capture" | "authorization", amountMinor: string, source: string): Promise<string | null> {
  return (await client.query<{ id: string }>(
    `INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,currency,amount_minor,dedupe_key,evidence,occurred_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'KZT',$9,$10,$11,$12) ON CONFLICT DO NOTHING RETURNING id`,
    [randomUUID(), row.id, order.id, provider.name, provider.environment, provider.merchantAccount, event.transactionId, kind, amountMinor,
      `${provider.name}:${provider.environment}:${provider.merchantAccount}:${kind}:${event.transactionId}`,
      JSON.stringify({ eventId: event.eventId, source, sessionId: event.sessionId, provenance: provenance(provider) }), event.occurredAt])).rows[0]?.id ?? null;
}

async function flagException(client: PoolClient, orderId: string): Promise<void> {
  await client.query("UPDATE orders SET fulfillment_status='exception',version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND fulfillment_status<>'exception'", [orderId]);
}

async function mismatchedCapture(client: PoolClient, provider: PaymentProvider, order: OrderRow, row: AttemptRow, event: PaymentEvent, eventKey: string, source: string): Promise<void> {
  if (event.currency === "KZT" && BigInt(event.amountMinor) > BigInt(0)) {
    const transactionId = await recordTransaction(client, provider, order, row, event, "capture", event.amountMinor, source);
    if (!transactionId) return;
    await requestRefund(client, provider, order, transactionId, event.amountMinor, "capture_mismatch", source);
  } else {
    await orderEvent(client, order.id, "payment.unrecorded_capture", source, `payment-unrecorded:${eventKey}`, "internal",
      { paymentAttemptId: row.id, eventId: event.eventId, transactionId: event.transactionId, amountMinor: event.amountMinor, currency: event.currency });
  }
  await flagException(client, order.id);
}

// The capture is already recorded as a financial fact; this decides what it does to the order. No
// business error after this point may roll the fact back (review I1): a failed allocation becomes
// a fulfillment exception with a refund request.
async function capture(client: PoolClient, provider: PaymentProvider, order: OrderRow, row: AttemptRow, transactionId: string, source: string): Promise<PaymentOutcome> {
  const lateStatus = async () => client.query("UPDATE payment_attempts SET status='late_captured',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [row.id]);
  await orderEvent(client, order.id, "payment.captured", source, `payment-captured:${transactionId}`, "internal", { paymentAttemptId: row.id, transactionId, amountMinor: row.amount_minor });

  // A superseded attempt, or an order another attempt already paid: money in, nothing to allocate.
  if (row.status === "superseded" || PAID.has(order.payment_status)) {
    await lateStatus();
    await requestRefund(client, provider, order, transactionId, row.amount_minor, "duplicate_capture", source);
    return "refund_required";
  }
  // Review I4: money arrived on this attempt, so no other attempt of the order may stay payable.
  // Their provider sessions must be voided; with no real provider yet, staff get a void request.
  const superseded = (await client.query<{ id: string }>(
    "UPDATE payment_attempts SET status='superseded',version=version+1,updated_at=clock_timestamp() WHERE order_id=$1 AND id<>$2 AND status=ANY($3::text[]) RETURNING id",
    [order.id, row.id, [...PAYABLE]])).rows;
  for (const other of superseded) await orderEvent(client, order.id, "payment.void_required", source, `payment-void:${other.id}`, "internal", { paymentAttemptId: other.id, capturedBy: row.id });

  const expired = order.order_status === "cancelled" && Boolean((await client.query("SELECT 1 FROM order_events WHERE order_id=$1 AND type='order.expired'", [order.id])).rowCount);
  // An explicit cancellation is final: the capture never reactivates the order or triggers fulfillment.
  if (order.order_status !== "pending_payment" && !expired) {
    await lateStatus();
    await client.query("UPDATE orders SET payment_status='paid',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [order.id]);
    await requestRefund(client, provider, order, transactionId, row.amount_minor, "late_capture_after_cancellation", source);
    return "refund_required";
  }

  if (PAYABLE.has(row.status) || row.status === "failed")
    await client.query("UPDATE payment_attempts SET status='captured',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [row.id]);
  else await lateStatus();
  const checkoutAttemptId = order.checkout_attempt_id;
  if (checkoutAttemptId) await lockCouponPromotion(client, checkoutAttemptId);

  // Stock: consume the hold; if it already ended (the expiry raced the capture), try to hold the
  // same lines again atomically. Never manufacture stock. Any refusal leaves allocated=false.
  const reservation = checkoutAttemptId ? (await client.query<{ id: string; status: string }>(
    "SELECT id,status FROM inventory_reservations WHERE checkout_attempt_id=$1 AND status IN ('active','consumed') ORDER BY status,id LIMIT 1", [checkoutAttemptId])).rows[0] : undefined;
  let allocated = reservation?.status === "consumed", refusal: unknown = null;
  if (checkoutAttemptId && reservation?.status === "active") {
    const result = await attempt(client, () => consumeReservation(client, { reservationId: reservation.id, orderId: order.id }));
    allocated = result.ok;
    if (!result.ok) refusal = result.error;
  } else if (checkoutAttemptId && !reservation) {
    const lines = (await client.query<{ variant_id: string | null; quantity: number }>("SELECT variant_id,quantity FROM order_items WHERE order_id=$1", [order.id])).rows;
    const result = await attempt(client, async () => {
      if (lines.some(line => !line.variant_id)) fail("INSUFFICIENT_STOCK", 409, "A line has no variant to hold");
      const held = await reserveStock(client, { checkoutAttemptId, lines: lines.map(line => ({ variantId: line.variant_id!, quantity: line.quantity })) });
      return consumeReservation(client, { reservationId: held.reservationId, orderId: order.id });
    });
    allocated = result.ok;
    if (!result.ok) refusal = result.error;
  }

  if (!allocated) {
    // Payment received, nothing to ship: a fulfillment exception and a refund request for staff.
    // A hold that could not be consumed is released, so the stock is not stranded.
    if (reservation?.status === "active") await releaseReservation(client, { reservationId: reservation.id });
    if (checkoutAttemptId) await releaseCouponQuota(client, { checkoutAttemptId });
    const reason = !reservation && checkoutAttemptId && refusal instanceof AuthFailure && refusal.code === "INSUFFICIENT_STOCK" ? "late_capture_no_stock" : "allocation_failed";
    await client.query("UPDATE orders SET order_status='cancelled',payment_status='paid',fulfillment_status='exception',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [order.id]);
    await orderEvent(client, order.id, "fulfillment.exception", source, `fulfillment-exception:${transactionId}`, "internal",
      { transactionId, reason, code: typeof errorCode(refusal) === "string" ? errorCode(refusal) : null });
    await requestRefund(client, provider, order, transactionId, row.amount_minor, reason, source);
    return "exception";
  }

  // The shopper paid the quoted, discounted price; if the coupon hold already ended, that is
  // recorded for staff rather than refusing captured money.
  const coupon = await attempt(client, () => consumeCouponQuota(client, { checkoutAttemptId, orderId: order.id }));
  if (!coupon.ok) await orderEvent(client, order.id, "coupon.quota_overrun", source, `coupon-overrun:${transactionId}`, "internal",
    { transactionId, code: typeof errorCode(coupon.error) === "string" ? errorCode(coupon.error) : null });
  await client.query("UPDATE orders SET order_status='confirmed',payment_status='paid',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [order.id]);
  await orderEvent(client, order.id, "order.paid", source, `order-paid:${transactionId}`, "customer", { transactionId });
  await enqueueOrderAlerts(client, order.id, "paid");
  if (expired) await orderEvent(client, order.id, "order.reinstated", source, `order-reinstated:${transactionId}`, "customer", { transactionId });
  return "paid";
}

// ---------------------------------------------------------------------------------------------
// Reconciliation, replacement and expiry

/**
 * Asks each real provider for the state of open attempts (no transaction is held during the call)
 * and applies a reported fact exactly like a webhook. Simulated providers are skipped.
 */
export async function reconcilePayments(pool: Pool, providers: PaymentProviders, options: { olderThanMs?: number; limit?: number } = {}): Promise<{ checked: number; applied: number; failed: number }> {
  const olderThanMs = Math.max(0, Math.trunc(options.olderThanMs ?? 60_000)), limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 500);
  const real = [...providers.values()].filter(provider => !provider.simulated).map(provider => provider.name);
  if (real.length === 0) return { checked: 0, applied: 0, failed: 0 };
  const rows = (await pool.query<AttemptRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM payment_attempts WHERE provider=ANY($1::text[]) AND status IN ('pending','requires_action','authorized','unknown') AND provider_session_id IS NOT NULL
     AND updated_at<=clock_timestamp()-make_interval(secs=>$2::double precision/1000) ORDER BY updated_at,id LIMIT $3`, [real, olderThanMs, limit])).rows;
  let applied = 0, failed = 0;
  for (const row of rows) {
    try {
      const provider = providerFor(providers, row);
      const state = await provider.lookup({ attemptId: row.id, merchantReference: row.merchant_reference, sessionId: row.provider_session_id, idempotencyKey: row.idempotency_key });
      if (state.state !== "event") continue;
      const event = state.event;
      if (!validEvent(event) || !inContext(provider, event) || event.merchantReference !== row.merchant_reference) { failed++; continue; }
      const outcome = await withInventoryTransaction(pool, client => applyPaymentEvent(client, provider, event, "reconciliation"));
      if (!["duplicate", "ignored", "unmatched"].includes(outcome)) applied++;
    } catch { failed++; }
  }
  return { checked: rows.length, applied, failed };
}

/**
 * Opens a new attempt for an unpaid order. Only one payable attempt may exist: the previous one
 * must be definitively failed, cancelled or voided first (an unknown result is reconciled first).
 */
export async function replacePaymentAttempt(pool: Pool, providers: PaymentProviders, orderId: string): Promise<{ paymentAttemptId: string }> {
  if (!UUID.test(orderId)) notFound();
  return withInventoryTransaction(pool, async client => {
    const order = await lockOrder(client, orderId);
    if (order.order_status !== "pending_payment" || !["unpaid", "failed"].includes(order.payment_status)) fail("ORDER_NOT_PAYABLE", 409, "This order cannot take a new payment");
    const rows = (await client.query<AttemptRow & { created_at: Date }>(`SELECT ${ATTEMPT_COLUMNS},created_at FROM payment_attempts WHERE order_id=$1 ORDER BY created_at,id FOR UPDATE`, [orderId])).rows;
    if (rows.some(row => PAYABLE.has(row.status))) fail("PAYMENT_ATTEMPT_ACTIVE", 409, "A payment attempt is still open; it must fail or be reconciled first");
    const last = rows[rows.length - 1] ?? notFound();
    const provider = providerFor(providers, last);
    const sequence = rows.length + 1, id = randomUUID();
    await client.query(
      `INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,currency,amount_minor,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'KZT',$9,'created')`,
      [id, orderId, provider.name, provider.environment, provider.merchantAccount, `${order.order_number}-${sequence}`, `payment:${order.checkout_attempt_id ?? orderId}:${sequence}`,
        sha256(canonical({ orderId, amountMinor: order.total_minor, currency: "KZT", sequence })), order.total_minor]);
    await enqueueJob(client, { kind: PAYMENT_START_KIND, dedupeKey: `payment-start:${id}`, payload: { paymentAttemptId: id } });
    await orderEvent(client, orderId, "payment.attempt_replaced", "payments", `payment-replaced:${id}`, "internal", { paymentAttemptId: id, previousAttemptId: last.id });
    return { paymentAttemptId: id };
  });
}

/**
 * Order-level expiry (Task 14A ruling): an unpaid order whose stock hold ended is cancelled. Its
 * open attempts are cancelled, the hold is expired and the coupon hold released, and the customer
 * sees an order.expired event. Each order is one short transaction; an order with an authorized or
 * unknown attempt is left for reconciliation. A later capture is handled by the capture policy.
 */
export interface OrderExpiryCursor { placedAt: Date; id: string }
export async function expireUnpaidOrders(pool: Pool, options: { asOf?: Date; limit?: number; after?: OrderExpiryCursor } = {}): Promise<{
  checked: number; expired: number; skipped: number; failed: number; failures: { orderId: string; code: string }[]; cursor: OrderExpiryCursor | null;
}> {
  const asOf = options.asOf ?? null, limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 1000);
  // Review I5: orders waiting on the provider (authorized, unknown, requires action) are never
  // selected, and the caller pages by (placed_at, id), so rows that are skipped or fail never
  // block the orders behind them.
  const due = (await pool.query<{ id: string; placed_at: Date }>(
    `SELECT o.id,o.placed_at FROM orders o WHERE o.order_status='pending_payment' AND o.payment_status=ANY($3::text[]) AND o.checkout_attempt_id IS NOT NULL AND o.placed_at IS NOT NULL
       AND ($4::timestamptz IS NULL OR (o.placed_at,o.id)>($4::timestamptz,$5::uuid))
       AND EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.checkout_attempt_id=o.checkout_attempt_id)
       AND NOT EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.checkout_attempt_id=o.checkout_attempt_id
         AND (r.status='consumed' OR (r.status='active' AND r.expires_at>COALESCE($1::timestamptz,now()))))
       AND NOT EXISTS(SELECT 1 FROM payment_attempts a WHERE a.order_id=o.id AND a.status IN ('authorized','unknown','requires_action'))
     ORDER BY o.placed_at,o.id LIMIT $2`, [asOf, limit, EXPIRABLE_PAYMENT, options.after?.placedAt ?? null, options.after?.id ?? null])).rows;
  let expired = 0, skipped = 0;
  const failures: { orderId: string; code: string }[] = [];
  for (const { id } of due) {
    const done = await withInventoryTransaction(pool, async client => {
      const order = await lockOrder(client, id);
      if (order.order_status !== "pending_payment" || !EXPIRABLE_PAYMENT.includes(order.payment_status) || !order.checkout_attempt_id) return false;
      const rows = (await client.query<AttemptRow>(`SELECT ${ATTEMPT_COLUMNS} FROM payment_attempts WHERE order_id=$1 ORDER BY id FOR UPDATE`, [id])).rows;
      if (rows.some(row => row.status === "authorized" || row.status === "unknown" || row.status === "requires_action")) return false;
      await lockCouponPromotion(client, order.checkout_attempt_id);
      const holds = (await client.query<{ id: string; status: string; due: boolean }>(
        "SELECT id,status,expires_at<=COALESCE($2::timestamptz,now()) AS due FROM inventory_reservations WHERE checkout_attempt_id=$1 ORDER BY id FOR UPDATE", [order.checkout_attempt_id, asOf])).rows;
      if (holds.some(hold => hold.status === "consumed" || (hold.status === "active" && !hold.due))) return false;
      for (const row of rows.filter(row => PAYABLE.has(row.status)))
        await client.query("UPDATE payment_attempts SET status='cancelled',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [row.id]);
      await releaseCouponQuota(client, { checkoutAttemptId: order.checkout_attempt_id });
      for (const hold of holds.filter(hold => hold.status === "active")) await expireReservation(client, { reservationId: hold.id, ...(asOf ? { asOf } : {}) });
      await client.query("UPDATE orders SET order_status='cancelled',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [id]);
      await orderEvent(client, id, "order.expired", "worker", `order-expired:${id}`, "customer", { reason: "payment_hold_expired" });
      return true;
    }).catch((error: unknown) => {
      // Reported, not swallowed: the sweep continues past it and the next slot retries it.
      const code = errorCode(error);
      failures.push({ orderId: id, code: typeof code === "string" ? code : "UNKNOWN" });
      return null;
    });
    if (done) expired++; else if (done === false) skipped++;
  }
  const last = due[due.length - 1];
  return { checked: due.length, expired, skipped, failed: failures.length, failures, cursor: last ? { placedAt: last.placed_at, id: last.id } : null };
}
