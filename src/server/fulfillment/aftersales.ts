import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { CancelResultDTO, FulfillmentStatus, OrderStatus, PaymentStatus, RefundDTO, ReturnDTO } from "../../contracts/commerce.ts";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { releaseReservation } from "../inventory/reservations.ts";
import { releaseCouponQuota } from "../pricing/coupons.ts";
import type { PaymentProvider, PaymentProviders, RefundResult } from "../payments/provider.ts";
import { demoRefundId } from "../payments/demo.ts";
import { inTransaction, isLegacy, lockOrder, orderEvent, refreshOrder, requestHash, type OrderRow } from "./service.ts";

// Task 16B. Cancellation, returns and refunds (manual; absorbs Task 17).
//
// Lock order, shared with checkout, capture and fulfillment (16A ruling M8): checkout attempt,
// order, payment attempts, promotion, shipments, allocations (by id), reservations, refund and
// return rows. Every writer takes the order lock first, so a dispatch and a cancellation, or a
// capture and a cancellation, are serialised and exactly one of them sees the other's result.
//
// - Cancellation depends on the payment and shipping state:
//   uncaptured (unpaid / pending / failed / authorized): payable attempts are cancelled, the stock
//   hold and coupon quota released (an authorization also gets an internal void_required event);
//   captured and unshipped: ready shipments are cancelled first, then every allocation's unshipped
//   units are restored with ONE compensating movement per allocation, and the remaining captured
//   balance is reserved for refund; shipped (anything dispatched): 409, use a return.
// - Refunds lock the order and the capture (by the refunds trigger), check the refundable balance
//   (captured minus reserved, pending, unknown and succeeded refunds) and reserve a `refunds` row with
//   item/shipping/adjustment lines. The provider is called later, outside any transaction, with the
//   refund's stable key; a timeout keeps the reservation ("unknown") until a retry or reconciliation
//   proves the outcome. Only a definitive failure releases it.
// - Item refunds allocate discount and tax by cumulative quantity (floor of the running share), so
//   refunding every unit in any split reproduces the line's discount, tax and total exactly.
//   Refunding units not yet shipped restores them to stock (16A ruling I2); units claimed by a
//   ready shipment must be released by cancelling that shipment first.
// - Returns move requested -> authorized -> received -> inspected -> closed. Only inspection with a
//   `restock` decision puts accepted units back on hand, once per return line; quarantine and
//   dispose never do. A return records goods; any refund for it is a separate refund action.
// - Task 3.2: a refund of a demo capture is settled at once with a local demo reference and keeps
//   its demo provenance; it is never submitted to a provider (settleDemoRefund).
// - Every staff write is idempotent per staff user and key (an internal order event carries the
//   request hash) and audited.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINOR = /^[1-9]\d{0,14}$/;
const ACTIVE_REFUND = ["reserved", "pending", "unknown", "succeeded"];
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const ZERO = BigInt(0);

const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);
const reason = z.string().trim().min(1).max(500);
const uniqueBy = <T>(list: T[], pick: (item: T) => string) => new Set(list.map(item => pick(item).toLowerCase())).size === list.length;
const cancelInput = z.strictObject({ orderId: z.string().regex(UUID), expectedOrderVersion: z.number().int().min(1), idempotencyKey: key, reason });
const refundInput = z.strictObject({
  orderId: z.string().regex(UUID), idempotencyKey: key, reason,
  items: z.array(z.strictObject({ orderItemId: z.string().regex(UUID), quantity: z.number().int().min(1).max(10000) })).min(1).max(100).optional(),
  shipping: z.literal(true).optional(),
  adjustmentMinor: z.string().regex(MINOR).optional(),
  /** Item refunds put unshipped units back on hand unless false (the refunded units were shipped). */
  restock: z.boolean().optional(),
}).refine(value => value.items !== undefined || value.shipping !== undefined || value.adjustmentMinor !== undefined)
  .refine(value => !value.items || uniqueBy(value.items, item => item.orderItemId));
const returnInput = z.strictObject({
  orderId: z.string().regex(UUID), idempotencyKey: key, reason,
  lines: z.array(z.strictObject({ orderItemId: z.string().regex(UUID), quantity: z.number().int().min(1).max(10000) })).min(1).max(100),
}).refine(value => uniqueBy(value.lines, line => line.orderItemId));
const returnBase = { returnId: z.string().regex(UUID), expectedVersion: z.number().int().min(1), idempotencyKey: key };
const updateReturnInput = z.discriminatedUnion("action", [
  z.strictObject({ ...returnBase, action: z.enum(["authorize", "reject", "cancel", "close"]) }),
  z.strictObject({ ...returnBase, action: z.literal("receive"), lines: z.array(z.strictObject({ returnItemId: z.string().regex(UUID), receivedQuantity: z.number().int().min(0).max(10000) })).min(1).max(100) }),
  z.strictObject({ ...returnBase, action: z.literal("inspect"), lines: z.array(z.strictObject({ returnItemId: z.string().regex(UUID), acceptedQuantity: z.number().int().min(0).max(10000), decision: z.enum(["restock", "quarantine", "dispose"]) })).min(1).max(100) }),
]);
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

// ---------------------------------------------------------------------------------------------
// Shared steps (caller holds the order lock)

async function audit(client: PoolClient, actor: string, action: string, targetType: string, targetId: string, eventId: string, changes: Record<string, unknown>): Promise<void> {
  await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [randomUUID(), actor, action, targetType, targetId, `aftersales-audit:${eventId}`, JSON.stringify(changes)]);
}
/** The prior result of this staff user's key; 409 when it was used for another body. */
async function prior(client: PoolClient, dedupeKey: string, hash: string): Promise<Record<string, unknown> | null> {
  const row = (await client.query<{ payload: Record<string, unknown> }>("SELECT payload FROM order_events WHERE dedupe_key=$1", [dedupeKey])).rows[0];
  if (!row) return null;
  if (row.payload.requestHash !== hash) fail("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was used for a different action");
  return row.payload;
}
/** Maps the refund-balance trigger to the same 409 the service check gives. */
async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  try { return await inTransaction(pool, work); }
  catch (error) {
    const message = (error as { message?: unknown } | null)?.message;
    if ((error as { code?: unknown } | null)?.code === "23514" && typeof message === "string" && message.includes("Refund reservations exceed captured cash"))
      fail("REFUND_EXCEEDS_BALANCE", 409, "The refund exceeds the refundable balance");
    throw error;
  }
}

interface AllocationRow { id: string; order_item_id: string; variant_id: string; location_id: string; free: number; owed: number }
/** Locks the allocations of the given items (by id) and measures them. free: units no shipment claims; owed: units not dispatched. */
async function lockAllocations(client: PoolClient, orderItemIds: string[]): Promise<AllocationRow[]> {
  const rows = (await client.query<{ id: string; order_item_id: string; variant_id: string; location_id: string; free: string; owed: string }>(`
    SELECT a.id,a.order_item_id,a.variant_id,a.location_id,
      (a.quantity-a.restored_quantity-COALESCE(c.claimed,0)+COALESCE(r.returned,0))::text AS free,
      (a.quantity-a.restored_quantity-COALESCE(c.dispatched,0)+COALESCE(r.returned,0))::text AS owed
    FROM inventory_allocations a
    LEFT JOIN LATERAL (SELECT sum(i.quantity) FILTER (WHERE s.status<>'cancelled') AS claimed, sum(i.quantity) FILTER (WHERE s.status IN ('dispatched','delivered')) AS dispatched
      FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id WHERE i.allocation_id=a.id) c ON true
    LEFT JOIN LATERAL (SELECT sum(ri.restocked_quantity) AS returned FROM return_items ri JOIN shipment_items i ON i.id=ri.shipment_item_id WHERE i.allocation_id=a.id) r ON true
    WHERE a.order_item_id=ANY($1::uuid[]) ORDER BY a.id FOR UPDATE OF a`, [orderItemIds])).rows;
  return rows.map(row => ({ ...row, free: Math.max(Number(row.free), 0), owed: Math.max(Number(row.owed), 0) }));
}
/** Restores `count` free units of one item to stock: one compensating movement per allocation touched. */
async function restore(client: PoolClient, allocations: AllocationRow[], count: number, actor: string, source: string): Promise<number> {
  let left = count;
  for (const allocation of allocations) {
    const take = Math.min(left, allocation.free);
    if (take <= 0) continue;
    await client.query("UPDATE inventory_allocations SET restored_quantity=restored_quantity+$2,version=version+1 WHERE id=$1", [allocation.id, take]);
    await client.query(
      "INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference,allocation_id,actor_user_id,occurred_at) VALUES($1,$2,$3,$4,0,'compensate',$5,$6,$7,$8,clock_timestamp())",
      [randomUUID(), allocation.variant_id, allocation.location_id, take, `compensate:${allocation.id}:${source}`, source, allocation.id, actor]);
    allocation.free -= take; allocation.owed -= take; left -= take;
    if (left === 0) break;
  }
  return count - left;
}

interface CaptureRow { id: string; provider: string; environment: string; merchant_account: string; amount_minor: string }
// Review I1: the capture that paid the order. Duplicate, mismatched and late captures each carry the
// 14B refund request keyed `refund:<transactionId>`, so they are never the paying charge.
const PAYING_CAPTURE = `SELECT t.id,t.provider,t.environment,t.merchant_account,t.amount_minor::text AS amount_minor FROM payment_transactions t
  WHERE t.order_id=$1 AND t.kind='capture' AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.order_id=t.order_id AND r.idempotency_key='refund:'||t.id::text)
  ORDER BY t.created_at,t.id LIMIT 1`;
async function payingCapture(client: PoolClient, orderId: string): Promise<CaptureRow | undefined> {
  return (await client.query<CaptureRow>(PAYING_CAPTURE, [orderId])).rows[0];
}
async function firstCapture(client: PoolClient, orderId: string): Promise<CaptureRow> {
  return await payingCapture(client, orderId) ?? fail("ORDER_NOT_PAID", 409, "Only captured orders can be refunded");
}
/** Units of an item already put back on hand by refunds (review C1: a failed refund does not undo them). */
async function restoredByRefunds(client: PoolClient, orderItemId: string): Promise<number> {
  return Number((await client.query<{ n: string }>(
    "SELECT COALESCE(sum(m.delta_on_hand),0)::text AS n FROM stock_movements m JOIN inventory_allocations a ON a.id=m.allocation_id WHERE a.order_item_id=$1 AND m.reason='compensate' AND m.source_reference LIKE 'refund:%'", [orderItemId])).rows[0].n);
}
async function refundedUnits(client: PoolClient, orderItemId: string): Promise<number> {
  return Number((await client.query<{ n: string }>(
    "SELECT COALESCE(sum(i.quantity),0)::text AS n FROM refund_items i JOIN refunds r ON r.id=i.refund_id WHERE i.order_item_id=$1 AND i.kind='item' AND r.status=ANY($2::text[])", [orderItemId, ACTIVE_REFUND])).rows[0].n);
}
async function committed(client: PoolClient, transactionId: string): Promise<bigint> {
  return BigInt((await client.query<{ total: string }>("SELECT COALESCE(sum(amount_minor),0)::text AS total FROM refunds WHERE transaction_id=$1 AND status=ANY($2::text[])", [transactionId, ACTIVE_REFUND])).rows[0].total);
}

interface RefundLine { kind: "item" | "shipping" | "adjustment"; orderItemId: string | null; quantity: number | null; net: bigint; discount: bigint; tax: bigint }
const lineAmount = (line: RefundLine) => line.net - line.discount + line.tax;

/** Lines for `quantity` more units of an item: discount and tax by cumulative quantity share. */
async function itemLine(client: PoolClient, orderId: string, orderItemId: string, quantity: number): Promise<RefundLine> {
  const item = (await client.query<{ quantity: number; unit: string; discount: string; tax: string }>(
    "SELECT quantity,unit_price_minor::text AS unit,discount_minor::text AS discount,tax_minor::text AS tax FROM order_items WHERE id=$1 AND order_id=$2", [orderItemId, orderId])).rows[0] ?? notFound();
  const done = await refundedUnits(client, orderItemId);
  if (done + quantity > item.quantity) fail("REFUND_EXCEEDS_ITEM", 409, "More units than were bought would be refunded");
  const total = BigInt(item.quantity), before = BigInt(done), after = BigInt(done + quantity);
  const share = (amount: string) => BigInt(amount) * after / total - BigInt(amount) * before / total;
  return { kind: "item", orderItemId, quantity, net: BigInt(item.unit) * BigInt(quantity), discount: share(item.discount), tax: share(item.tax) };
}
async function shippingLine(client: PoolClient, orderId: string): Promise<RefundLine | null> {
  const already = (await client.query("SELECT 1 FROM refund_items i JOIN refunds r ON r.id=i.refund_id WHERE i.order_id=$1 AND i.kind='shipping' AND r.status=ANY($2::text[]) LIMIT 1", [orderId, ACTIVE_REFUND])).rowCount;
  if (already) return null;
  const order = (await client.query<{ shipping: string | null; shipping_tax: string | null }>("SELECT shipping_minor::text AS shipping,shipping_tax_minor::text AS shipping_tax FROM orders WHERE id=$1", [orderId])).rows[0];
  const net = BigInt(order.shipping ?? "0"), tax = BigInt(order.shipping_tax ?? "0");
  return net + tax > ZERO ? { kind: "shipping", orderItemId: null, quantity: null, net, discount: ZERO, tax } : null;
}

/** Reserves a refund of the capture with its lines (caller holds the order lock). */
async function reserveRefund(client: PoolClient, input: { order: OrderRow; capture: CaptureRow; lines: RefundLine[]; reason: string; idempotencyKey: string; requestHash: string }): Promise<{ id: string; amount: bigint }> {
  const amount = input.lines.reduce((sum, line) => sum + lineAmount(line), ZERO);
  if (amount <= ZERO) fail("NOTHING_TO_REFUND", 409, "Nothing is left to refund");
  if (await committed(client, input.capture.id) + amount > BigInt(input.capture.amount_minor)) fail("REFUND_EXCEEDS_BALANCE", 409, "The refund exceeds the refundable balance");
  const id = randomUUID();
  await client.query(
    `INSERT INTO refunds(id,transaction_id,order_id,provider,environment,merchant_account,idempotency_key,request_hash,amount_minor,status,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved',$10)`,
    [id, input.capture.id, input.order.id, input.capture.provider, input.capture.environment, input.capture.merchant_account, input.idempotencyKey, input.requestHash, amount.toString(), input.reason]);
  for (const line of input.lines) {
    await client.query("INSERT INTO refund_items(id,refund_id,order_id,order_item_id,kind,quantity,net_minor,discount_minor,tax_minor,amount_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [randomUUID(), id, input.order.id, line.orderItemId, line.kind, line.quantity, line.net.toString(), line.discount.toString(), line.tax.toString(), lineAmount(line).toString()]);
  }
  return { id, amount };
}

/**
 * Task 3.2 ("full demo"): a refund of a demo capture is settled at once, in the same transaction,
 * with a local `demo-refund:<id>` reference. It keeps the capture's demo provenance (provider,
 * environment and merchant 'demo'), is never sent to any provider, and so never reaches the refund
 * worker (which only picks open refunds of real providers). The order's payment summary and the
 * customer's refund.succeeded event follow exactly as for a provider refund.
 */
async function settleDemoRefund(client: PoolClient, capture: CaptureRow, orderId: string, refundId: string, amount: bigint, actor: string): Promise<void> {
  if (capture.provider !== "demo") return;
  if (capture.environment !== "demo" || capture.merchant_account !== "demo") fail("PAYMENT_PROVENANCE_INVALID", 409, "A demo capture must stay in the demo environment");
  const settled = await client.query("UPDATE refunds SET status='succeeded',provider_refund_id=$2,version=version+1,updated_at=now() WHERE id=$1 AND status='reserved'", [refundId, demoRefundId(refundId)]);
  if (settled.rowCount !== 1) fail("REFUND_NOT_SETTLED", 409, "The demo refund could not be settled");
  await refreshPayment(client, orderId);
  await orderEvent(client, { orderId, type: "refund.succeeded", actor, dedupeKey: `refund-succeeded:${refundId}`, visibility: "customer", payload: { refundId, amountMinor: amount.toString(), demo: true } });
}

async function orderState(client: PoolClient, orderId: string): Promise<CancelResultDTO["order"]> {
  const row = (await client.query<{ id: string; version: number; order_status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus }>(
    "SELECT id,version,order_status,payment_status,fulfillment_status FROM orders WHERE id=$1", [orderId])).rows[0];
  return { id: row.id, version: row.version, status: row.order_status, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status };
}

// ---------------------------------------------------------------------------------------------
// Reads (also used by the staff order detail)

export async function readRefunds(db: Pool | PoolClient, orderId: string): Promise<RefundDTO[]> {
  const rows = (await db.query<{ id: string; status: RefundDTO["status"]; amount: string; reason: string | null; created_at: Date; items: RefundDTO["items"]; provider: string; provider_refund_id: string | null }>(`
    SELECT r.id,r.status,r.amount_minor::text AS amount,r.reason,r.created_at,r.provider,r.provider_refund_id,
      COALESCE((SELECT json_agg(json_build_object('kind',i.kind,'orderItemId',i.order_item_id,'quantity',i.quantity,'amountMinor',i.amount_minor::text) ORDER BY i.kind,i.order_item_id) FROM refund_items i WHERE i.refund_id=r.id),'[]'::json) AS items
    FROM refunds r WHERE r.order_id=$1 ORDER BY r.created_at,r.id`, [orderId])).rows;
  return rows.map(row => ({
    id: row.id, status: row.status, amountMinor: row.amount, reason: row.reason, createdAt: row.created_at.toISOString(), items: row.items,
    manual: row.provider === "manual", payoutReference: row.provider === "manual" ? row.provider_refund_id : null,
  }));
}
export async function readReturns(db: Pool | PoolClient, orderId: string, returnId?: string): Promise<ReturnDTO[]> {
  const rows = (await db.query<{ id: string; status: ReturnDTO["status"]; version: number; reason: string; created_at: Date; received_at: Date | null; inspected_at: Date | null; items: ReturnDTO["items"] }>(`
    SELECT r.id,r.status,r.version,r.reason,r.created_at,r.received_at,r.inspected_at,
      COALESCE((SELECT json_agg(json_build_object('id',i.id,'orderItemId',i.order_item_id,'shipmentItemId',i.shipment_item_id,'quantity',i.quantity,'receivedQuantity',i.received_quantity,
        'acceptedQuantity',i.accepted_quantity,'restockedQuantity',i.restocked_quantity,'decision',i.restock_decision) ORDER BY i.id) FROM return_items i WHERE i.return_id=r.id),'[]'::json) AS items
    FROM returns r WHERE r.order_id=$1 AND ($2::uuid IS NULL OR r.id=$2) ORDER BY r.created_at,r.id`, [orderId, returnId ?? null])).rows;
  return rows.map(row => ({ id: row.id, status: row.status, version: row.version, reason: row.reason, createdAt: row.created_at.toISOString(), receivedAt: row.received_at?.toISOString() ?? null, inspectedAt: row.inspected_at?.toISOString() ?? null, items: row.items }));
}
async function oneRefund(client: PoolClient, orderId: string, refundId: string): Promise<RefundDTO> {
  return (await readRefunds(client, orderId)).find(row => row.id === refundId) ?? notFound();
}

// ---------------------------------------------------------------------------------------------
// Provider submission (outside any transaction) and reconciliation

/**
 * Recomputes the payment summary from the paying capture and its succeeded refunds only (review I2):
 * refunding a duplicate, mismatched or late capture never changes what the customer paid for the order.
 */
export async function refreshPayment(client: PoolClient, orderId: string): Promise<void> {
  const paying = await payingCapture(client, orderId);
  if (!paying) return;
  const refundedTotal = (await client.query<{ total: string }>("SELECT COALESCE(sum(amount_minor),0)::text AS total FROM refunds WHERE transaction_id=$1 AND status='succeeded'", [paying.id])).rows[0].total;
  const captured = BigInt(paying.amount_minor), refunded = BigInt(refundedTotal);
  if (captured === ZERO || refunded === ZERO) return;
  const next = refunded >= captured ? "refunded" : "partially_refunded";
  await client.query("UPDATE orders SET payment_status=$2,version=version+1,updated_at=now() WHERE id=$1 AND payment_status IN ('paid','partially_refunded') AND payment_status<>$2", [orderId, next]);
}

interface SubmitRow { id: string; order_id: string; provider: string; environment: string; merchant_account: string; idempotency_key: string; amount: string; external_id: string; status: RefundDTO["status"] }
function refundProvider(providers: PaymentProviders, row: Pick<SubmitRow, "provider" | "environment" | "merchant_account">): PaymentProvider | null {
  const provider = providers.get(row.provider);
  // O07: manual refunds are paid out by staff (manual.ts completeRefund), never submitted.
  return provider && !provider.simulated && provider.name !== "manual" && provider.environment === row.environment && provider.merchantAccount === row.merchant_account ? provider : null;
}

/**
 * Sends one reserved, pending or unknown refund to its provider with the refund's stable key, then
 * applies the answer. A thrown call (timeout, lost response) records `unknown` and keeps the
 * reservation; a repeated answer for a finished refund changes nothing.
 */
export async function submitRefund(pool: Pool, providers: PaymentProviders, refundId: string): Promise<{ status: RefundDTO["status"] | "skipped" }> {
  const row = (await pool.query<SubmitRow>(
    `SELECT r.id,r.order_id,r.provider,r.environment,r.merchant_account,r.idempotency_key,r.amount_minor::text AS amount,t.external_id,r.status
     FROM refunds r JOIN payment_transactions t ON t.id=r.transaction_id WHERE r.id=$1`, [refundId])).rows[0] ?? notFound();
  if (["succeeded", "failed", "cancelled"].includes(row.status)) return { status: row.status };
  const provider = refundProvider(providers, row);
  if (!provider) return { status: "skipped" };
  const started = await inTransaction(pool, async client => {
    await lockOrder(client, row.order_id);
    const current = (await client.query<{ status: RefundDTO["status"] }>("SELECT status FROM refunds WHERE id=$1 FOR UPDATE", [refundId])).rows[0];
    if (current.status === "reserved") await client.query("UPDATE refunds SET status='pending',version=version+1,updated_at=now() WHERE id=$1", [refundId]);
    return !["succeeded", "failed", "cancelled"].includes(current.status);
  });
  if (!started) return { status: (await pool.query<{ status: RefundDTO["status"] }>("SELECT status FROM refunds WHERE id=$1", [refundId])).rows[0].status };
  let answer: RefundResult | null;
  try {
    answer = await provider.refund({ refundId, orderId: row.order_id, idempotencyKey: row.idempotency_key, transactionExternalId: row.external_id, amountMinor: row.amount, currency: "KZT" });
  } catch { answer = null; }
  return inTransaction(pool, async client => {
    await lockOrder(client, row.order_id);
    const current = (await client.query<{ status: RefundDTO["status"]; version: number }>("SELECT status,version FROM refunds WHERE id=$1 FOR UPDATE", [refundId])).rows[0];
    if (["succeeded", "failed", "cancelled"].includes(current.status)) return { status: current.status };
    const event = (type: string, dedupe: string, visibility: "internal" | "customer", payload: Record<string, unknown>) => client.query(
      "INSERT INTO order_events(id,order_id,type,source,dedupe_key,visibility,occurred_at,payload) VALUES($1,$2,$3,'payments',$4,$5,clock_timestamp(),$6) ON CONFLICT (dedupe_key) DO NOTHING",
      [randomUUID(), row.order_id, type, dedupe, visibility, JSON.stringify(payload)]);
    if (!answer) {
      await client.query("UPDATE refunds SET status='unknown',version=version+1,updated_at=now() WHERE id=$1", [refundId]);
      await event("payment.refund_unknown", `refund-unknown:${refundId}:${current.version}`, "internal", { refundId });
      return { status: "unknown" as const };
    }
    const providerRefundId = answer.providerRefundId && /^[ -~]{1,200}$/.test(answer.providerRefundId) ? answer.providerRefundId : null;
    if (answer.state === "succeeded") {
      await client.query("UPDATE refunds SET status='succeeded',provider_refund_id=COALESCE(provider_refund_id,$2),version=version+1,updated_at=now() WHERE id=$1", [refundId, providerRefundId]);
      await refreshPayment(client, row.order_id);
      await event("refund.succeeded", `refund-succeeded:${refundId}`, "customer", { refundId, amountMinor: row.amount });
      return { status: "succeeded" as const };
    }
    if (answer.state === "failed") {
      await client.query("UPDATE refunds SET status='failed',version=version+1,updated_at=now() WHERE id=$1", [refundId]);
      await event("payment.refund_failed", `refund-failed:${refundId}`, "internal", { refundId });
      return { status: "failed" as const };
    }
    await client.query("UPDATE refunds SET status='pending',provider_refund_id=COALESCE(provider_refund_id,$2),version=version+1,updated_at=now() WHERE id=$1", [refundId, providerRefundId]);
    return { status: "pending" as const };
  });
}

/** Worker sweep: submits reserved refunds and retries pending/unknown ones with their stable keys. */
export async function processRefunds(pool: Pool, providers: PaymentProviders, options: { limit?: number } = {}): Promise<{ checked: number; failed: number }> {
  const names = [...providers.values()].filter(provider => !provider.simulated && provider.name !== "manual").map(provider => provider.name);
  if (!names.length) return { checked: 0, failed: 0 };
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 1000);
  const ids = (await pool.query<{ id: string }>("SELECT id FROM refunds WHERE status IN ('reserved','pending','unknown') AND provider=ANY($1::text[]) ORDER BY updated_at,id LIMIT $2", [names, limit])).rows;
  let failed = 0;
  for (const { id } of ids) { try { await submitRefund(pool, providers, id); } catch { failed++; } }
  return { checked: ids.length, failed };
}

// ---------------------------------------------------------------------------------------------
// Staff service

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal>; providers: PaymentProviders }

export function createAfterSalesService({ pool, authorize }: Options) {
  return {
    /** Cancels an order according to its payment and shipping state (see the module comment). */
    async cancelOrder(headers: Headers, input: unknown): Promise<CancelResultDTO> {
      const principal = await authorize(headers, "orders:fulfill");
      const command = parse(cancelInput, input);
      const hash = requestHash(command), dedupeKey = `aftersales:${principal.userId}:${command.idempotencyKey}`;
      // A paid order's cancellation reserves a refund, which needs payments:refund. Checked before
      // any lock; the transaction re-checks in case a capture landed in between.
      const paidNow = (await pool.query("SELECT 1 FROM orders WHERE id=$1 AND payment_status IN ('paid','partially_refunded')", [command.orderId])).rowCount;
      if (paidNow) await authorize(headers, "payments:refund");
      return transaction(pool, async client => {
        const order = await lockOrder(client, command.orderId);
        const done = await prior(client, dedupeKey, hash);
        if (done) {
          if (done.orderId !== order.id) fail("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was used for a different action");
          return { order: await orderState(client, order.id), refundId: typeof done.refundId === "string" ? done.refundId : null, replayed: true };
        }
        if (isLegacy(order)) fail("LEGACY_ORDER", 409, "Legacy summary orders cannot take item operations");
        if (order.order_status === "cancelled" || order.order_status === "closed") fail("ORDER_NOT_CANCELLABLE", 409, "This order is already cancelled or closed");
        if (order.version !== command.expectedOrderVersion) fail("VERSION_CONFLICT", 409, "The order changed; reload and try again");
        const attempts = (await client.query<{ id: string; status: string }>("SELECT id,status FROM payment_attempts WHERE order_id=$1 ORDER BY id FOR UPDATE", [order.id])).rows;
        let refundId: string | null = null;
        // Review I3: the branch follows what the customer paid for the order, not whether any capture
        // exists. A mismatched capture on an unpaid order already has its own 14B refund request.
        const paid = order.payment_status === "paid" || order.payment_status === "partially_refunded";
        if (!paid) {
          if (attempts.some(row => row.status === "unknown" || row.status === "requires_action")) fail("PAYMENT_PENDING", 409, "The payment result is not known yet; reconcile it first");
          const authorized = attempts.some(row => row.status === "authorized");
          for (const row of attempts.filter(row => ["created", "pending", "authorized"].includes(row.status)))
            await client.query("UPDATE payment_attempts SET status='cancelled',version=version+1,updated_at=clock_timestamp() WHERE id=$1", [row.id]);
          if (order.checkout_attempt_id) {
            const promotion = (await client.query<{ promotion_id: string }>("SELECT promotion_id FROM promotion_redemptions WHERE checkout_attempt_id=$1 ORDER BY promotion_id LIMIT 1", [order.checkout_attempt_id])).rows[0];
            if (promotion) await client.query("SELECT 1 FROM promotions WHERE id=$1 FOR UPDATE", [promotion.promotion_id]);
            const holds = (await client.query<{ id: string; status: string }>("SELECT id,status FROM inventory_reservations WHERE checkout_attempt_id=$1 ORDER BY id FOR UPDATE", [order.checkout_attempt_id])).rows;
            for (const hold of holds.filter(hold => hold.status === "active")) await releaseReservation(client, { reservationId: hold.id });
            await releaseCouponQuota(client, { checkoutAttemptId: order.checkout_attempt_id });
          }
          if (authorized) await orderEvent(client, { orderId: order.id, type: "payment.void_required", actor: principal.userId, dedupeKey: `void-required:${order.id}`, visibility: "internal", payload: { reason: "order_cancelled" } });
          await client.query("UPDATE orders SET order_status='cancelled',version=version+1,updated_at=now() WHERE id=$1", [order.id]);
        } else {
          if (!paidNow) await authorize(headers, "payments:refund");
          const shipments = (await client.query<{ id: string; status: string }>("SELECT id,status FROM shipments WHERE order_id=$1 ORDER BY id FOR UPDATE", [order.id])).rows;
          if (shipments.some(row => row.status === "dispatched" || row.status === "delivered")) fail("ORDER_SHIPPED", 409, "Shipped units need a return, not a cancellation");
          for (const shipment of shipments.filter(row => row.status === "ready")) {
            await client.query("UPDATE shipments SET status='cancelled',version=version+1 WHERE id=$1", [shipment.id]);
            await client.query("INSERT INTO shipment_events(id,shipment_id,type,source,dedupe_key,actor_user_id,occurred_at) VALUES($1,$2,'cancelled','staff',$3,$4,clock_timestamp())",
              [randomUUID(), shipment.id, `shipment-cancelled:${shipment.id}:once`, principal.userId]);
          }
          const items = (await client.query<{ id: string }>("SELECT id FROM order_items WHERE order_id=$1 ORDER BY id", [order.id])).rows.map(row => row.id);
          const allocations = await lockAllocations(client, items);
          for (const itemId of items) {
            const rows = allocations.filter(row => row.order_item_id === itemId);
            await restore(client, rows, rows.reduce((sum, row) => sum + row.free, 0), principal.userId, `cancel:${order.id}`);
          }
          // Review I5: refund the paying capture's remaining balance item by item (cumulative shares, so
          // the item ledger reconciles), plus shipping if not refunded; a positive residual becomes an
          // adjustment line. If earlier adjustments already returned part of that value, the lines
          // would exceed the balance, and the balance is refunded as one adjustment instead.
          const capture = await firstCapture(client, order.id);
          const balance = BigInt(capture.amount_minor) - await committed(client, capture.id);
          if (balance > ZERO) {
            const lines: RefundLine[] = [];
            const bought = (await client.query<{ id: string; quantity: number }>("SELECT id,quantity FROM order_items WHERE order_id=$1 ORDER BY id", [order.id])).rows;
            for (const row of bought) {
              const left = row.quantity - await refundedUnits(client, row.id);
              if (left > 0) lines.push(await itemLine(client, order.id, row.id, left));
            }
            const shipping = await shippingLine(client, order.id);
            if (shipping) lines.push(shipping);
            const total = lines.reduce((sum, line) => sum + lineAmount(line), ZERO);
            if (total < balance) lines.push({ kind: "adjustment", orderItemId: null, quantity: null, net: balance - total, discount: ZERO, tax: ZERO });
            else if (total > balance) lines.splice(0, lines.length, { kind: "adjustment", orderItemId: null, quantity: null, net: balance, discount: ZERO, tax: ZERO });
            const reserved = await reserveRefund(client, { order, capture, lines, reason: "order_cancelled: " + command.reason, idempotencyKey: `cancel:${order.id}`, requestHash: hash });
            refundId = reserved.id;
            await settleDemoRefund(client, capture, order.id, reserved.id, reserved.amount, principal.userId);
          }
          await client.query("UPDATE orders SET order_status='cancelled',updated_at=now() WHERE id=$1", [order.id]);
          await refreshOrder(client, order.id);
        }
        const eventId = await orderEvent(client, { orderId: order.id, type: "order.cancellation", actor: principal.userId, dedupeKey, visibility: "internal", payload: { requestHash: hash, orderId: order.id, refundId, reason: command.reason } });
        await orderEvent(client, { orderId: order.id, type: "order.cancelled", actor: principal.userId, dedupeKey: `order-cancelled:${order.id}`, visibility: "customer", payload: {} });
        await audit(client, principal.userId, "order.cancelled", "order", order.id, eventId, { captured: order.captured, refundId });
        return { order: await orderState(client, order.id), refundId, replayed: false };
      });
    },

    /** Reserves an item, shipping and/or adjustment refund against the order's capture. */
    async refund(headers: Headers, input: unknown): Promise<{ refund: RefundDTO; replayed: boolean }> {
      const principal = await authorize(headers, "payments:refund");
      const command = parse(refundInput, input);
      const hash = requestHash(command), dedupeKey = `aftersales:${principal.userId}:${command.idempotencyKey}`;
      return transaction(pool, async client => {
        const order = await lockOrder(client, command.orderId);
        const done = await prior(client, dedupeKey, hash);
        if (done) return { refund: await oneRefund(client, order.id, String(done.refundId)), replayed: true };
        if (isLegacy(order)) fail("LEGACY_ORDER", 409, "Legacy summary orders cannot take item operations");
        const capture = await firstCapture(client, order.id);
        const lines: RefundLine[] = [];
        const restores: { orderItemId: string; count: number }[] = [];
        if (command.items) {
          const ids = command.items.map(item => item.orderItemId.toLowerCase());
          const owned = (await client.query("SELECT id FROM order_items WHERE order_id=$1 AND id=ANY($2::uuid[])", [order.id, ids])).rowCount;
          if (owned !== ids.length) notFound();
          const allocations = await lockAllocations(client, ids);
          for (const item of command.items) {
            const id = item.orderItemId.toLowerCase();
            const before = await refundedUnits(client, id);
            lines.push(await itemLine(client, order.id, id, item.quantity));
            if (command.restock === false) continue;
            // Units not yet dispatched are refunded first and go back to stock (16A ruling I2), unless
            // staff say the refunded units were shipped (restock: false, review I4).
            // Review C1: units already restored by earlier refunds count, even if that refund later
            // failed, so refunding the same units again never restores them twice.
            const rows = allocations.filter(row => row.order_item_id === id);
            const owed = rows.reduce((sum, row) => sum + row.owed, 0), free = rows.reduce((sum, row) => sum + row.free, 0);
            const already = await restoredByRefunds(client, id);
            const count = Math.max(0, Math.min(item.quantity, Math.min(before + item.quantity, owed + already) - already));
            if (count > free) fail("SHIPMENT_PENDING", 409, "These units are on a ready shipment; cancel it first");
            restores.push({ orderItemId: id, count });
          }
        }
        if (command.shipping) {
          const shipping = await shippingLine(client, order.id);
          if (!shipping) fail("SHIPPING_ALREADY_REFUNDED", 409, "Shipping was already refunded or was free");
          lines.push(shipping!);
        }
        if (command.adjustmentMinor) lines.push({ kind: "adjustment", orderItemId: null, quantity: null, net: BigInt(command.adjustmentMinor), discount: ZERO, tax: ZERO });
        const refund = await reserveRefund(client, { order, capture, lines, reason: command.reason, idempotencyKey: `refund:${sha256(principal.userId + ":" + command.idempotencyKey)}`, requestHash: hash });
        if (restores.some(entry => entry.count > 0)) {
          const allocations = await lockAllocations(client, restores.map(entry => entry.orderItemId));
          for (const entry of restores) if (entry.count > 0) await restore(client, allocations.filter(row => row.order_item_id === entry.orderItemId), entry.count, principal.userId, `refund:${refund.id}`);
          await refreshOrder(client, order.id);
        }
        const eventId = await orderEvent(client, { orderId: order.id, type: "refund.reserved", actor: principal.userId, dedupeKey, visibility: "internal", payload: { requestHash: hash, refundId: refund.id, amountMinor: refund.amount.toString() } });
        await settleDemoRefund(client, capture, order.id, refund.id, refund.amount, principal.userId);
        await audit(client, principal.userId, "refund.reserved", "refund", refund.id, eventId, { orderId: order.id, amountMinor: refund.amount.toString(), lines: lines.map(line => ({ kind: line.kind, orderItemId: line.orderItemId, quantity: line.quantity })) });
        return { refund: await oneRefund(client, order.id, refund.id), replayed: false };
      });
    },

    /** Records a return request for dispatched units (status `requested`). */
    async createReturn(headers: Headers, input: unknown): Promise<{ return: ReturnDTO; replayed: boolean }> {
      const principal = await authorize(headers, "orders:fulfill");
      const command = parse(returnInput, input);
      const hash = requestHash(command), dedupeKey = `aftersales:${principal.userId}:${command.idempotencyKey}`;
      return transaction(pool, async client => {
        const order = await lockOrder(client, command.orderId);
        const done = await prior(client, dedupeKey, hash);
        if (done) return { return: (await readReturns(client, order.id, String(done.returnId)))[0] ?? notFound(), replayed: true };
        if (isLegacy(order)) fail("LEGACY_ORDER", 409, "Legacy summary orders cannot take item operations");
        const returnId = randomUUID();
        await client.query("INSERT INTO returns(id,order_id,requested_by_user_id,reason,idempotency_key) VALUES($1,$2,$3,$4,$5)",
          [returnId, order.id, principal.userId, command.reason, sha256(principal.userId + ":" + command.idempotencyKey)]);
        for (const line of command.lines) {
          const id = line.orderItemId.toLowerCase();
          const shipped = (await client.query<{ id: string; returnable: string }>(`
            SELECT i.id,(i.quantity-COALESCE((SELECT sum(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.shipment_item_id=i.id AND r.status NOT IN ('rejected','cancelled')),0))::text AS returnable
            FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id WHERE i.order_id=$1 AND i.order_item_id=$2 AND s.status IN ('dispatched','delivered') ORDER BY i.id FOR UPDATE OF i`, [order.id, id])).rows;
          let left = line.quantity;
          for (const row of shipped) {
            const take = Math.min(left, Number(row.returnable));
            if (take <= 0) continue;
            await client.query("INSERT INTO return_items(id,return_id,order_id,order_item_id,shipment_item_id,quantity) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), returnId, order.id, id, row.id, take]);
            left -= take;
            if (left === 0) break;
          }
          if (left > 0) fail("RETURN_EXCEEDS_SHIPPED", 409, "More units than were shipped and not yet returned");
        }
        const eventId = await orderEvent(client, { orderId: order.id, type: "return.requested", actor: principal.userId, dedupeKey, visibility: "internal", payload: { requestHash: hash, returnId } });
        await audit(client, principal.userId, "return.requested", "return", returnId, eventId, { orderId: order.id, lines: command.lines });
        return { return: (await readReturns(client, order.id, returnId))[0], replayed: false };
      });
    },

    /** authorize, reject, cancel, receive (quantities), inspect (accepted quantities and decisions; restocks), close. */
    async updateReturn(headers: Headers, input: unknown): Promise<{ return: ReturnDTO; replayed: boolean }> {
      const principal = await authorize(headers, "orders:fulfill");
      const command = parse(updateReturnInput, input);
      const hash = requestHash(command), dedupeKey = `aftersales:${principal.userId}:${command.idempotencyKey}`;
      return transaction(pool, async client => {
        const orderId = (await client.query<{ order_id: string }>("SELECT order_id FROM returns WHERE id=$1", [command.returnId])).rows[0]?.order_id ?? notFound();
        const order = await lockOrder(client, orderId);
        const done = await prior(client, dedupeKey, hash);
        if (done) return { return: (await readReturns(client, order.id, command.returnId))[0], replayed: true };
        const current = (await client.query<{ status: ReturnDTO["status"]; version: number }>("SELECT status,version FROM returns WHERE id=$1 FOR UPDATE", [command.returnId])).rows[0];
        if (current.version !== command.expectedVersion) fail("VERSION_CONFLICT", 409, "The return changed; reload and try again");
        const from: Record<string, ReturnDTO["status"][]> = { authorize: ["requested"], reject: ["requested", "authorized"], cancel: ["requested", "authorized"], receive: ["authorized"], inspect: ["received"], close: ["inspected"] };
        const to: Record<string, ReturnDTO["status"]> = { authorize: "authorized", reject: "rejected", cancel: "cancelled", receive: "received", inspect: "inspected", close: "closed" };
        if (!from[command.action].includes(current.status)) fail("INVALID_TRANSITION", 409, `A ${current.status} return cannot ${command.action}`);
        const items = (await client.query<{ id: string; quantity: number; received_quantity: number; shipment_item_id: string }>(
          "SELECT id,quantity,received_quantity,shipment_item_id FROM return_items WHERE return_id=$1 ORDER BY id FOR UPDATE", [command.returnId])).rows;
        const byId = new Map(items.map(item => [item.id, item]));
        if (command.action === "receive" || command.action === "inspect") {
          const ids = command.lines.map(line => line.returnItemId.toLowerCase());
          if (new Set(ids).size !== ids.length || ids.length !== items.length || ids.some(id => !byId.has(id))) invalid();
        }
        if (command.action === "receive") {
          for (const line of command.lines) if (line.receivedQuantity > byId.get(line.returnItemId.toLowerCase())!.quantity) invalid();
          await client.query("UPDATE returns SET status='received',received_at=clock_timestamp(),version=version+1 WHERE id=$1", [command.returnId]);
          for (const line of command.lines) await client.query("UPDATE return_items SET received_quantity=$2 WHERE id=$1", [line.returnItemId.toLowerCase(), line.receivedQuantity]);
        } else if (command.action === "inspect") {
          for (const line of command.lines) if (line.acceptedQuantity > byId.get(line.returnItemId.toLowerCase())!.received_quantity) invalid();
          // Inspection is recorded first; only then may a line restock (the 0003 trigger enforces it).
          await client.query("UPDATE returns SET status='inspected',inspected_at=clock_timestamp(),version=version+1 WHERE id=$1", [command.returnId]);
          for (const line of command.lines) {
            const id = line.returnItemId.toLowerCase(), restock = line.decision === "restock" ? line.acceptedQuantity : 0;
            const allocation = (await client.query<{ id: string; variant_id: string; location_id: string }>(
              "SELECT a.id,a.variant_id,a.location_id FROM shipment_items i JOIN inventory_allocations a ON a.id=i.allocation_id WHERE i.id=$1", [byId.get(id)!.shipment_item_id])).rows[0];
            await client.query("UPDATE return_items SET accepted_quantity=$2,restock_decision=$3,inspected_at=clock_timestamp(),restocked_quantity=$4,restock_location_id=$5 WHERE id=$1",
              [id, line.acceptedQuantity, line.decision, restock, restock > 0 ? allocation.location_id : null]);
            if (restock > 0) {
              await client.query("UPDATE inventory_allocations SET restored_quantity=restored_quantity+$2,version=version+1 WHERE id=$1", [allocation.id, restock]);
              await client.query(
                "INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference,allocation_id,actor_user_id,occurred_at) VALUES($1,$2,$3,$4,0,'return',$5,$6,$7,$8,clock_timestamp())",
                [randomUUID(), allocation.variant_id, allocation.location_id, restock, `return:${id}`, `return:${command.returnId}`, allocation.id, principal.userId]);
            }
          }
        } else {
          await client.query("UPDATE returns SET status=$2,version=version+1 WHERE id=$1", [command.returnId, to[command.action]]);
        }
        const eventId = await orderEvent(client, { orderId: order.id, type: `return.${to[command.action]}`, actor: principal.userId, dedupeKey, visibility: "internal", payload: { requestHash: hash, returnId: command.returnId } });
        await audit(client, principal.userId, `return.${to[command.action]}`, "return", command.returnId, eventId, { orderId: order.id, from: current.status, to: to[command.action] });
        return { return: (await readReturns(client, order.id, command.returnId))[0], replayed: false };
      });
    },
  };
}
export type AfterSalesService = ReturnType<typeof createAfterSalesService>;
