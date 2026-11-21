import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { AdminOrderDetailDTO, AdminOrderSummaryDTO, FulfillmentBlock, FulfillmentStatus, Money, OrderStatus, PaymentStatus, ShipmentDTO, ShipmentResultDTO } from "../../contracts/commerce.ts";

export type { AdminOrderDetailDTO, AdminOrderSummaryDTO, FulfillmentBlock, ShipmentDTO, ShipmentResultDTO, TimelineEventDTO } from "../../contracts/commerce.ts";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { withInventoryTransaction } from "../inventory/reservations.ts";
import { readRefunds, readReturns } from "./aftersales.ts";

// Task 16A. Permissioned, versioned manual fulfillment (D04: staff ship themselves).
//
// - A shipment claims quantities of an order's paid allocations. Capture already consumed the stock
//   (Task 14B), so fulfillment writes NO stock movement: a unit leaves on-hand exactly once.
// - Only a live order with a capture fact, paid or partially refunded, confirmed and not flagged as a
//   fulfillment exception can ship. Demo orders are never paid (D03/O07). Legacy summary orders are
//   flagged and take no item operation.
// - Shipment states only move forward: ready -> dispatched -> delivered, or ready -> cancelled.
//   Milestone times come from the database clock; no client date is accepted.
// - Every write carries the order or shipment version (CAS) and an idempotency key scoped to the
//   acting staff user. The key is the dedupe key of the action's internal order event, so a retry
//   returns the original result and a reused key with another body is 409.
// - Lock order (same as checkout and capture): checkout attempt, order, allocations by id, shipment.
// - Carrier, tracking references and internal notes are staff-only; customers see shipments and
//   the customer-visible events only. Internal notes and carrier need orders:fulfill to read.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_LIMIT = 50;
const FULFILLMENT_STATUSES = ["unfulfilled", "processing", "partially_shipped", "shipped", "delivered", "exception"] as const satisfies readonly FulfillmentStatus[];
type ShipmentStatus = ShipmentDTO["status"];

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");
const versionConflict = (): never => fail("VERSION_CONFLICT", 409, "The order changed; reload and try again");
const money = (amountMinor: string): Money => ({ amountMinor, currency: "KZT" });

const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);
const short = z.string().trim().min(1).max(120);
const note = z.string().trim().min(1).max(1000);
const createInput = z.strictObject({
  orderId: z.string().regex(UUID), expectedOrderVersion: z.number().int().min(1), idempotencyKey: key,
  lines: z.array(z.strictObject({ orderItemId: z.string().regex(UUID), quantity: z.number().int().min(1).max(10000) })).min(1).max(100),
  carrier: short.optional(), trackingReference: short.optional(), internalNote: note.optional(),
}).refine(value => new Set(value.lines.map(line => line.orderItemId.toLowerCase())).size === value.lines.length);
const updateInput = z.strictObject({
  shipmentId: z.string().regex(UUID), expectedVersion: z.number().int().min(1), idempotencyKey: key,
  action: z.enum(["dispatch", "deliver", "cancel", "annotate"]),
  carrier: short.optional(), trackingReference: short.optional(), internalNote: note.optional(),
}).refine(value => value.action !== "annotate" || value.carrier !== undefined || value.trackingReference !== undefined || value.internalNote !== undefined);
const listInput = z.strictObject({
  fulfillmentStatus: z.enum(FULFILLMENT_STATUSES).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}
export const canonical = (value: unknown): string => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]"
  : value && typeof value === "object" ? "{" + Object.keys(value).sort().map(name => JSON.stringify(name) + ":" + canonical((value as Record<string, unknown>)[name])).join(",") + "}"
  : JSON.stringify(value);
export const requestHash = (value: Record<string, unknown>) => {
  const rest = { ...value };
  delete rest.idempotencyKey;
  return createHash("sha256").update(canonical(rest)).digest("hex");
};

export interface OrderRow {
  id: string; order_number: string; checkout_attempt_id: string | null; order_status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus;
  payment_mode: AdminOrderSummaryDTO["paymentMode"]; data_quality: "complete" | "legacy_incomplete"; version: number; captured: boolean;
}
const ORDER_COLUMNS = "o.id,o.order_number,o.checkout_attempt_id,o.order_status,o.payment_status,o.fulfillment_status,o.payment_mode,o.data_quality,o.version," +
  "EXISTS (SELECT 1 FROM payment_transactions t WHERE t.order_id=o.id AND t.kind='capture') AS captured";
interface ShipmentRow {
  id: string; order_id: string; status: ShipmentStatus; version: number; carrier: string | null; tracking_reference: string | null; internal_notes: string | null;
  created_at: Date; dispatched_at: Date | null; delivered_at: Date | null;
}
const SHIPMENT_COLUMNS = "id,order_id,status,version,carrier,tracking_reference,internal_notes,created_at,dispatched_at,delivered_at";

export const isLegacy = (order: Pick<OrderRow, "data_quality" | "payment_mode" | "checkout_attempt_id">) =>
  order.data_quality !== "complete" || order.payment_mode === "legacy_unknown" || order.checkout_attempt_id === null;

/** Why this order cannot ship now, or null when it can. */
export function fulfillmentBlock(order: Pick<OrderRow, "data_quality" | "payment_mode" | "checkout_attempt_id" | "payment_status" | "captured" | "fulfillment_status" | "order_status">): FulfillmentBlock | null {
  if (isLegacy(order)) return "LEGACY_ORDER";
  // D03a: a captured sandbox (demo purchase) order ships like a live one, so staff can test fulfillment end to end; demo orders never ship.
  if ((order.payment_mode !== "live" && order.payment_mode !== "sandbox") || !order.captured || !["paid", "partially_refunded"].includes(order.payment_status)) return "ORDER_NOT_PAID";
  if (order.fulfillment_status === "exception") return "FULFILLMENT_EXCEPTION";
  if (order.order_status !== "confirmed") return "ORDER_NOT_SHIPPABLE";
  return null;
}
const BLOCK_MESSAGES: Record<FulfillmentBlock, string> = {
  LEGACY_ORDER: "Legacy summary orders cannot take item operations",
  ORDER_NOT_PAID: "Only paid orders can be fulfilled",
  FULFILLMENT_EXCEPTION: "This order has a fulfillment exception and must not ship",
  ORDER_NOT_SHIPPABLE: "This order cannot ship in its current state",
};
const refuse = (block: FulfillmentBlock): never => fail(block, 409, BLOCK_MESSAGES[block]);

export async function lockOrder(client: PoolClient, orderId: string): Promise<OrderRow> {
  const found = (await client.query<{ checkout_attempt_id: string | null }>("SELECT checkout_attempt_id FROM orders WHERE id=$1", [orderId])).rows[0] ?? notFound();
  if (found.checkout_attempt_id) await client.query("SELECT 1 FROM checkout_attempts WHERE id=$1 FOR UPDATE", [found.checkout_attempt_id]);
  await client.query("SELECT 1 FROM orders WHERE id=$1 FOR UPDATE", [orderId]);
  return (await client.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id=$1`, [orderId])).rows[0];
}

async function shipmentItems(client: PoolClient | Pool, shipmentIds: string[]): Promise<Map<string, { orderItemId: string; quantity: number }[]>> {
  const map = new Map<string, { orderItemId: string; quantity: number }[]>();
  if (!shipmentIds.length) return map;
  const rows = (await client.query<{ shipment_id: string; order_item_id: string; quantity: string }>(
    "SELECT shipment_id,order_item_id,sum(quantity)::text AS quantity FROM shipment_items WHERE shipment_id=ANY($1::uuid[]) GROUP BY shipment_id,order_item_id ORDER BY order_item_id", [shipmentIds])).rows;
  for (const row of rows) {
    const list = map.get(row.shipment_id) ?? [];
    list.push({ orderItemId: row.order_item_id, quantity: Number(row.quantity) });
    map.set(row.shipment_id, list);
  }
  return map;
}
function shipmentDTO(row: ShipmentRow, items: { orderItemId: string; quantity: number }[], staffDetail: boolean): ShipmentDTO {
  return {
    id: row.id, status: row.status, version: row.version,
    carrier: staffDetail ? row.carrier : null, trackingReference: staffDetail ? row.tracking_reference : null, internalNotes: staffDetail ? row.internal_notes : null,
    createdAt: row.created_at.toISOString(), dispatchedAt: row.dispatched_at?.toISOString() ?? null, deliveredAt: row.delivered_at?.toISOString() ?? null,
    items,
  };
}
async function readShipment(client: PoolClient, shipmentId: string): Promise<ShipmentDTO> {
  const row = (await client.query<ShipmentRow>(`SELECT ${SHIPMENT_COLUMNS} FROM shipments WHERE id=$1`, [shipmentId])).rows[0] ?? notFound();
  return shipmentDTO(row, (await shipmentItems(client, [shipmentId])).get(shipmentId) ?? [], true);
}

/** Derives the order's fulfillment status from its shipments; an exception is never overwritten. */
export async function refreshOrder(client: PoolClient, orderId: string): Promise<{ id: string; version: number; fulfillmentStatus: FulfillmentStatus }> {
  const totals = (await client.query<{ ordered: string; ready: string; dispatched: string; delivered: string }>(`
    -- Review I1: units restored to stock (16B) are no longer owed, so they leave the denominator.
    SELECT (SELECT COALESCE(sum(a.quantity-a.restored_quantity),0) FROM inventory_allocations a JOIN order_items oi ON oi.id=a.order_item_id WHERE oi.order_id=$1)::text AS ordered,
      COALESCE(sum(i.quantity) FILTER (WHERE s.status='ready'),0)::text AS ready,
      COALESCE(sum(i.quantity) FILTER (WHERE s.status IN ('dispatched','delivered')),0)::text AS dispatched,
      COALESCE(sum(i.quantity) FILTER (WHERE s.status='delivered'),0)::text AS delivered
    FROM shipments s JOIN shipment_items i ON i.shipment_id=s.id WHERE s.order_id=$1`, [orderId])).rows[0];
  const ordered = Number(totals.ordered), ready = Number(totals.ready), dispatched = Number(totals.dispatched), delivered = Number(totals.delivered);
  const next: FulfillmentStatus = ordered > 0 && delivered >= ordered ? "delivered" : ordered > 0 && dispatched >= ordered ? "shipped"
    : dispatched > 0 ? "partially_shipped" : ready > 0 ? "processing" : "unfulfilled";
  const row = (await client.query<{ id: string; version: number; fulfillment_status: FulfillmentStatus }>(
    "UPDATE orders SET fulfillment_status=CASE WHEN fulfillment_status='exception' THEN fulfillment_status ELSE $2 END,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,version,fulfillment_status",
    [orderId, next])).rows[0];
  return { id: row.id, version: row.version, fulfillmentStatus: row.fulfillment_status };
}

export async function orderEvent(client: PoolClient, input: { orderId: string; type: string; actor: string; dedupeKey: string; visibility: "internal" | "customer"; payload: Record<string, unknown> }): Promise<string> {
  const id = randomUUID();
  await client.query(
    "INSERT INTO order_events(id,order_id,type,source,actor_user_id,dedupe_key,visibility,occurred_at,payload) VALUES($1,$2,$3,'staff',$4,$5,$6,clock_timestamp(),$7)",
    [id, input.orderId, input.type, input.actor, input.dedupeKey, input.visibility, JSON.stringify(input.payload)]);
  return id;
}
async function shipmentEvent(client: PoolClient, shipmentId: string, type: string, actor: string, dedupeKey: string, internalNote: string | undefined): Promise<void> {
  await client.query(
    "INSERT INTO shipment_events(id,shipment_id,type,source,dedupe_key,actor_user_id,occurred_at,internal_note) VALUES($1,$2,$3,'staff',$4,$5,clock_timestamp(),$6)",
    [randomUUID(), shipmentId, type, dedupeKey, actor, internalNote ?? null]);
}
async function audit(client: PoolClient, actor: string, action: string, shipmentId: string, eventId: string, changes: Record<string, unknown>): Promise<void> {
  await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,$3,'shipment',$4,$5,$6)",
    [randomUUID(), actor, action, shipmentId, `fulfillment-audit:${eventId}`, JSON.stringify(changes)]);
}
/** Returns the prior result of this staff user's key, 409 when the key was used for another body. */
async function priorAction(client: PoolClient, dedupeKey: string, hash: string): Promise<string | null> {
  const prior = (await client.query<{ payload: { requestHash?: string; shipmentId?: string } }>("SELECT payload FROM order_events WHERE dedupe_key=$1", [dedupeKey])).rows[0];
  if (!prior) return null;
  if (prior.payload.requestHash !== hash || !prior.payload.shipmentId) fail("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was used for a different action");
  return prior.payload.shipmentId!;
}

const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
function decodeCursor(cursor: string): { at: Date; id: string } {
  const [at, id, extra] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const date = new Date(at ?? "");
  if (extra !== undefined || !id || !UUID.test(id) || Number.isNaN(date.getTime())) invalid();
  return { at: date, id };
}

// Review I3: one staff key used for different bodies on two orders at once passes both prior-action
// checks (different order locks); the event dedupe key then rejects the second. That is the same
// 409 a serial reuse gets, never a raw database error (which the HTTP layer would report as 503).
export async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  try { return await withInventoryTransaction(pool, work); }
  catch (error) {
    if ((error as { constraint?: unknown } | null)?.constraint === "order_events_dedupe_key_unique") fail("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was used for a different action");
    throw error;
  }
}

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }

export function createFulfillmentService({ pool, authorize }: Options) {
  return {
    /** Staff order queue, newest first, optionally by fulfillment status. Keyset-paged. */
    async listOrders(headers: Headers, input: unknown): Promise<{ items: AdminOrderSummaryDTO[]; nextCursor: string | null }> {
      await authorize(headers, "orders:read");
      const query = parse(listInput, input ?? {});
      const limit = query.limit ?? PAGE_LIMIT, args: unknown[] = [limit + 1];
      let where = "";
      if (query.fulfillmentStatus) { args.push(query.fulfillmentStatus); where += ` AND o.fulfillment_status=$${args.length}`; }
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        args.push(cursor.at, cursor.id);
        where += ` AND (COALESCE(o.placed_at,o.created_at),o.id)<($${args.length - 1},$${args.length})`;
      }
      const rows = (await pool.query<{ id: string; order_number: string; shown_at: Date; order_status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; payment_mode: AdminOrderSummaryDTO["paymentMode"]; data_quality: "complete" | "legacy_incomplete"; total_minor: string; items_count: number; contact_name: string }>(
        `SELECT o.id,o.order_number,COALESCE(o.placed_at,o.created_at) AS shown_at,o.order_status,o.payment_status,o.fulfillment_status,o.payment_mode,o.data_quality,o.total_minor::text AS total_minor,
          (SELECT COALESCE(sum(quantity),0)::int FROM order_items WHERE order_id=o.id) AS items_count,o.contact_name
         FROM orders o WHERE true${where} ORDER BY COALESCE(o.placed_at,o.created_at) DESC,o.id DESC LIMIT $1`, args)).rows;
      const page = rows.slice(0, limit), last = page[page.length - 1];
      return {
        items: page.map(row => ({ id: row.id, orderNumber: row.order_number, placedAt: row.shown_at.toISOString(), status: row.order_status, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status, paymentMode: row.payment_mode, dataQuality: row.data_quality, total: money(row.total_minor), itemsCount: row.items_count, contactName: row.contact_name })),
        nextCursor: rows.length > limit && last ? encodeCursor(last.shown_at, last.id) : null,
      };
    },

    /** One order with its items, shipments and the full recorded timeline. */
    async getOrder(headers: Headers, orderId: unknown): Promise<AdminOrderDetailDTO> {
      const principal = await authorize(headers, "orders:read");
      const staffDetail = principal.permissions.includes("orders:fulfill");
      if (typeof orderId !== "string" || !UUID.test(orderId)) return notFound();
      const order = (await pool.query<OrderRow & { shown_at: Date; total_minor: string; contact_name: string; contact_phone: string | null; contact_email: string | null }>(
        `SELECT ${ORDER_COLUMNS},COALESCE(o.placed_at,o.created_at) AS shown_at,o.total_minor::text AS total_minor,o.contact_name,o.contact_phone,o.contact_email FROM orders o WHERE o.id=$1`, [orderId])).rows[0] ?? notFound();
      const [items, address, shipments, events] = await Promise.all([
        pool.query<{ id: string; name: string; sku: string | null; quantity: number; allocated: string; claimed: string; shipped: string; remaining: string }>(`
          SELECT i.id,i.name,i.sku,i.quantity,
            COALESCE((SELECT sum(a.quantity-a.restored_quantity) FROM inventory_allocations a WHERE a.order_item_id=i.id),0)::text AS allocated,
            COALESCE((SELECT sum(si.quantity) FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE si.order_item_id=i.id AND s.status<>'cancelled'),0)::text AS claimed,
            COALESCE((SELECT sum(si.quantity) FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE si.order_item_id=i.id AND s.status IN ('dispatched','delivered')),0)::text AS shipped,
            '0' AS remaining
          FROM order_items i WHERE i.order_id=$1 ORDER BY i.id`, [orderId]),
        pool.query<Record<string, string | null>>("SELECT kind,recipient_name,phone,country_code,city,line1,line2,region,postal_code,legacy_raw FROM order_addresses WHERE order_id=$1", [orderId]),
        pool.query<ShipmentRow>(`SELECT ${SHIPMENT_COLUMNS} FROM shipments WHERE order_id=$1 ORDER BY created_at,id`, [orderId]),
        pool.query<{ id: string; type: string; visibility: "internal" | "customer"; source: string; actor_user_id: string | null; happened_at: Date; payload: Record<string, unknown> }>(
          "SELECT id,type,visibility,source,actor_user_id,COALESCE(occurred_at,recorded_at) AS happened_at,payload FROM order_events WHERE order_id=$1 ORDER BY COALESCE(occurred_at,recorded_at),recorded_at,id", [orderId]),
      ]);
      const lines = await shipmentItems(pool, shipments.rows.map(row => row.id));
      const block = fulfillmentBlock(order);
      const snapshot = address.rows[0];
      const deliveryAddress = snapshot ? Object.fromEntries(Object.entries(snapshot).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : null;
      return {
        id: order.id, orderNumber: order.order_number, placedAt: order.shown_at.toISOString(), status: order.order_status, paymentStatus: order.payment_status,
        fulfillmentStatus: order.fulfillment_status, paymentMode: order.payment_mode, dataQuality: order.data_quality, total: money(order.total_minor),
        itemsCount: items.rows.reduce((sum, row) => sum + row.quantity, 0), contactName: order.contact_name,
        version: order.version, legacy: isLegacy(order), fulfillable: { allowed: block === null, reason: block },
        contact: { name: order.contact_name, phone: order.contact_phone, email: order.contact_email }, deliveryAddress,
        items: items.rows.map(row => {
          const allocated = Number(row.allocated), claimed = Number(row.claimed);
          return { id: row.id, name: row.name, sku: row.sku, quantity: row.quantity, allocated, claimed, shipped: Number(row.shipped), remaining: Math.max(allocated - claimed, 0) };
        }),
        shipments: shipments.rows.map(row => shipmentDTO(row, lines.get(row.id) ?? [], staffDetail)),
        timeline: events.rows.map(row => {
          const shipmentId = typeof row.payload.shipmentId === "string" ? row.payload.shipmentId : null;
          const internalNote = staffDetail && typeof row.payload.internalNote === "string" ? row.payload.internalNote : undefined;
          return { id: row.id, type: row.type, visibility: row.visibility, source: row.source, occurredAt: row.happened_at.toISOString(), actorUserId: row.actor_user_id, shipmentId, ...(internalNote ? { internalNote } : {}) };
        }),
        refunds: await readRefunds(pool, orderId),
        returns: await readReturns(pool, orderId),
      };
    },

    /** Creates a ready shipment for quantities of the order's paid allocations. No stock movement. */
    async createShipment(headers: Headers, input: unknown): Promise<ShipmentResultDTO> {
      const principal = await authorize(headers, "orders:fulfill");
      const command = parse(createInput, input);
      const hash = requestHash(command), dedupeKey = `fulfillment:${principal.userId}:${command.idempotencyKey}`;
      return inTransaction(pool, async client => {
        const order = await lockOrder(client, command.orderId);
        const prior = await priorAction(client, dedupeKey, hash);
        if (prior) {
          if ((await client.query<{ order_id: string }>("SELECT order_id FROM shipments WHERE id=$1", [prior])).rows[0]?.order_id !== order.id) fail("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was used for a different action");
          return { shipment: await readShipment(client, prior), order: { id: order.id, version: order.version, fulfillmentStatus: order.fulfillment_status }, replayed: true };
        }
        const block = fulfillmentBlock(order);
        if (block) refuse(block);
        if (order.version !== command.expectedOrderVersion) versionConflict();
        const itemIds = command.lines.map(line => line.orderItemId.toLowerCase());
        const owned = (await client.query<{ id: string }>("SELECT id FROM order_items WHERE order_id=$1 AND id=ANY($2::uuid[])", [order.id, itemIds])).rows;
        if (owned.length !== itemIds.length) notFound();
        // Lock the allocations (stable id order) and measure what each can still ship.
        const allocations = (await client.query<{ id: string; order_item_id: string; available: string }>(`
          SELECT a.id,a.order_item_id,GREATEST(LEAST(
              a.quantity-COALESCE(c.claimed,0),
              a.quantity-a.restored_quantity-COALESCE(c.claimed,0)+COALESCE(r.returned,0)),0)::text AS available
          FROM inventory_allocations a
          LEFT JOIN LATERAL (SELECT sum(i.quantity) AS claimed FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id WHERE i.allocation_id=a.id AND s.status<>'cancelled') c ON true
          LEFT JOIN LATERAL (SELECT sum(ri.restocked_quantity) AS returned FROM return_items ri JOIN shipment_items i ON i.id=ri.shipment_item_id WHERE i.allocation_id=a.id) r ON true
          WHERE a.order_item_id=ANY($1::uuid[]) ORDER BY a.id FOR UPDATE OF a`, [itemIds])).rows;
        const plan: { allocationId: string; orderItemId: string; quantity: number }[] = [];
        for (const line of command.lines) {
          let wanted = line.quantity;
          for (const allocation of allocations.filter(row => row.order_item_id === line.orderItemId.toLowerCase())) {
            const take = Math.min(wanted, Number(allocation.available));
            if (take > 0) { plan.push({ allocationId: allocation.id, orderItemId: allocation.order_item_id, quantity: take }); wanted -= take; }
            if (wanted === 0) break;
          }
          if (wanted > 0) fail("OVER_SHIPMENT", 409, "The shipment exceeds the paid quantity not yet shipped");
        }
        const shipmentId = randomUUID();
        await client.query("INSERT INTO shipments(id,order_id,carrier,tracking_reference,internal_notes) VALUES($1,$2,$3,$4,$5)",
          [shipmentId, order.id, command.carrier ?? null, command.trackingReference ?? null, command.internalNote ?? null]);
        for (const line of plan) {
          await client.query("INSERT INTO shipment_items(id,shipment_id,order_id,order_item_id,allocation_id,quantity) VALUES($1,$2,$3,$4,$5,$6)",
            [randomUUID(), shipmentId, order.id, line.orderItemId, line.allocationId, line.quantity]);
        }
        await client.query("UPDATE shipments SET status='ready',version=version+1 WHERE id=$1", [shipmentId]);
        const eventId = await orderEvent(client, { orderId: order.id, type: "shipment.created", actor: principal.userId, dedupeKey, visibility: "internal",
          payload: { shipmentId, requestHash: hash, lines: command.lines, ...(command.internalNote ? { internalNote: command.internalNote } : {}) } });
        await shipmentEvent(client, shipmentId, "created", principal.userId, `shipment-created:${shipmentId}`, command.internalNote);
        await audit(client, principal.userId, "fulfillment.shipment_created", shipmentId, eventId, { orderId: order.id, lines: command.lines, carrier: command.carrier !== undefined, trackingReference: command.trackingReference !== undefined });
        const updated = await refreshOrder(client, order.id);
        return { shipment: await readShipment(client, shipmentId), order: updated, replayed: false };
      });
    },

    /** dispatch (ready -> dispatched), deliver (dispatched -> delivered), cancel (ready -> cancelled) or annotate. */
    async updateShipment(headers: Headers, input: unknown): Promise<ShipmentResultDTO> {
      const principal = await authorize(headers, "orders:fulfill");
      const command = parse(updateInput, input);
      const hash = requestHash(command), dedupeKey = `fulfillment:${principal.userId}:${command.idempotencyKey}`;
      return inTransaction(pool, async client => {
        const orderId = (await client.query<{ order_id: string }>("SELECT order_id FROM shipments WHERE id=$1", [command.shipmentId])).rows[0]?.order_id ?? notFound();
        const order = await lockOrder(client, orderId);
        const prior = await priorAction(client, dedupeKey, hash);
        if (prior) {
          if (prior !== command.shipmentId) fail("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was used for a different action");
          return { shipment: await readShipment(client, prior), order: { id: order.id, version: order.version, fulfillmentStatus: order.fulfillment_status }, replayed: true };
        }
        if (isLegacy(order)) refuse("LEGACY_ORDER");
        const shipment = (await client.query<ShipmentRow>(`SELECT ${SHIPMENT_COLUMNS} FROM shipments WHERE id=$1 FOR UPDATE`, [command.shipmentId])).rows[0];
        if (shipment.version !== command.expectedVersion) fail("VERSION_CONFLICT", 409, "The shipment changed; reload and try again");
        const from: Record<string, ShipmentStatus> = { dispatch: "ready", deliver: "dispatched", cancel: "ready" };
        if (command.action !== "annotate" && shipment.status !== from[command.action]) fail("INVALID_TRANSITION", 409, `A ${shipment.status} shipment cannot ${command.action}`);
        if (command.action === "annotate" && (shipment.status === "cancelled")) fail("INVALID_TRANSITION", 409, "A cancelled shipment cannot change");
        if (command.action === "dispatch") { const block = fulfillmentBlock(order); if (block) refuse(block); }
        const to: Record<string, ShipmentStatus> = { dispatch: "dispatched", deliver: "delivered", cancel: "cancelled", annotate: shipment.status };
        await client.query(`UPDATE shipments SET status=$2,version=version+1,
            carrier=COALESCE($3,carrier),tracking_reference=COALESCE($4,tracking_reference),internal_notes=COALESCE($5,internal_notes),
            dispatched_at=CASE WHEN $2='dispatched' THEN clock_timestamp() ELSE dispatched_at END,
            delivered_at=CASE WHEN $2='delivered' THEN clock_timestamp() ELSE delivered_at END
          WHERE id=$1`, [shipment.id, to[command.action], command.carrier ?? null, command.trackingReference ?? null, command.internalNote ?? null]);
        const past = { dispatch: "dispatched", deliver: "delivered", cancel: "cancelled", annotate: "annotated" }[command.action];
        const eventId = await orderEvent(client, { orderId: order.id, type: `shipment.${past}`, actor: principal.userId, dedupeKey, visibility: "internal",
          payload: { shipmentId: shipment.id, requestHash: hash, ...(command.internalNote ? { internalNote: command.internalNote } : {}) } });
        await shipmentEvent(client, shipment.id, past, principal.userId, `shipment-${past}:${shipment.id}:${command.action === "annotate" ? eventId : "once"}`, command.internalNote);
        const items = (await shipmentItems(client, [shipment.id])).get(shipment.id) ?? [];
        if (command.action === "dispatch" || command.action === "deliver") {
          const type = command.action === "dispatch" ? "fulfillment.shipped" : "fulfillment.delivered";
          await orderEvent(client, { orderId: order.id, type, actor: principal.userId, dedupeKey: `${type}:${shipment.id}`, visibility: "customer", payload: { shipmentId: shipment.id, items } });
        }
        await audit(client, principal.userId, `fulfillment.shipment_${past}`, shipment.id, eventId, { orderId: order.id, from: shipment.status, to: to[command.action], carrier: command.carrier !== undefined, trackingReference: command.trackingReference !== undefined, note: command.internalNote !== undefined });
        const updated = command.action === "annotate" ? { id: order.id, version: order.version, fulfillmentStatus: order.fulfillment_status } : await refreshOrder(client, order.id);
        return { shipment: await readShipment(client, shipment.id), order: updated, replayed: false };
      });
    },
  };
}
export type FulfillmentService = ReturnType<typeof createFulfillmentService>;
