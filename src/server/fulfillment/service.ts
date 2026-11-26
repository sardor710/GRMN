import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { AdminOrderDetailDTO, AdminOrderSummaryDTO, FulfillmentBlock, FulfillmentStatus, Money, OrderStatus, PaymentMethodCode, PaymentStatus, ShipmentDTO, ShipmentResultDTO } from "../../contracts/commerce.ts";

export type { AdminOrderDetailDTO, AdminOrderSummaryDTO, FulfillmentBlock, ShipmentDTO, ShipmentResultDTO, TimelineEventDTO } from "../../contracts/commerce.ts";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { withInventoryTransaction } from "../inventory/reservations.ts";
import { readRefunds, readReturns } from "./aftersales.ts";
import { resolveSerialRequirements } from "./serial-policy.ts";
import { BOARD_COLUMNS, BOARD_PERIODS, BOARD_STAGES, boardWhere, STAGE, type BoardColumns, type BoardStage } from "./board.ts";

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
const serialText = z.string().trim().min(1).max(64);
const createInput = z.strictObject({
  orderId: z.string().regex(UUID), expectedOrderVersion: z.number().int().min(1), idempotencyKey: key,
  lines: z.array(z.strictObject({ orderItemId: z.string().regex(UUID), quantity: z.number().int().min(1).max(10000) })).min(1).max(100),
  carrier: short.optional(), trackingReference: short.optional(), internalNote: note.optional(),
  // 0030 (owner 2026-11-25): one serial per unit packed; required for every serial-required product in the lines.
  serials: z.array(z.strictObject({ orderItemId: z.string().regex(UUID), units: z.array(serialText).max(10000) })).max(100).optional(),
}).refine(value => new Set(value.lines.map(line => line.orderItemId.toLowerCase())).size === value.lines.length)
  .refine(value => {
    if (!value.serials) return true;
    const quantities = new Map(value.lines.map(line => [line.orderItemId.toLowerCase(), line.quantity]));
    const ids = value.serials.map(entry => entry.orderItemId.toLowerCase());
    return new Set(ids).size === ids.length && value.serials.every(entry => (quantities.get(entry.orderItemId.toLowerCase()) ?? -1) >= entry.units.length);
  });
const updateInput = z.strictObject({
  shipmentId: z.string().regex(UUID), expectedVersion: z.number().int().min(1), idempotencyKey: key,
  action: z.enum(["dispatch", "deliver", "cancel", "annotate"]),
  carrier: short.optional(), trackingReference: short.optional(), internalNote: note.optional(),
}).refine(value => value.action !== "annotate" || value.carrier !== undefined || value.trackingReference !== undefined || value.internalNote !== undefined);
// 0030: replace one item's serials on a ready (packed) shipment; units.length = the item's quantity in it, or 0 when
// the product needs no serial.
const serialsInput = z.strictObject({
  shipmentId: z.string().regex(UUID), expectedVersion: z.number().int().min(1), idempotencyKey: key,
  action: z.literal("set_serials"), orderItemId: z.string().regex(UUID), units: z.array(serialText).max(10000),
});
const listInput = z.strictObject({
  fulfillmentStatus: z.enum(FULFILLMENT_STATUSES).optional(),
  // Task 3.3: "demo" lists only demo-checkout orders (to find and cancel stray ones), "live" only real ones.
  // "demo" lists both demo kinds (Task 3.2 demo checkout and D03a sandbox demo purchases); "sandbox" only the latter.
  paymentMode: z.enum(["demo", "live", "sandbox"]).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  // Owner 2026-11-25 board (board.ts).
  view: z.enum(["active", "archive"]).optional(),
  period: z.enum(BOARD_PERIODS).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().min(1).max(80).optional(),
  stage: z.enum(BOARD_STAGES).optional(),
}).refine(value => value.period !== "custom" || (value.from !== undefined && value.to !== undefined && validRange(value.from, value.to)))
  .refine(value => value.period === "custom" || (value.from === undefined && value.to === undefined));
/** A real calendar range, from <= to, at most 366 days. */
function validRange(from: string, to: string): boolean {
  const a = Date.parse(from + "T00:00:00Z"), b = Date.parse(to + "T00:00:00Z");
  return Number.isFinite(a) && Number.isFinite(b) && new Date(a).toISOString().startsWith(from) && new Date(b).toISOString().startsWith(to) && a <= b && b - a <= 366 * 86400000;
}

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
  // Task 3.2 ("full demo"): a captured demo order is fulfilled like a paid one; D03a: so is a captured
  // sandbox (demo purchase) order, so staff can test fulfillment end to end. An uncaptured order never ships.
  if (!["live", "demo", "sandbox"].includes(order.payment_mode) || !order.captured || !["paid", "partially_refunded"].includes(order.payment_status)) return "ORDER_NOT_PAID";
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

type ShipmentLine = ShipmentDTO["items"][number];
async function shipmentItems(client: PoolClient | Pool, shipmentIds: string[], withSerials = false): Promise<Map<string, ShipmentLine[]>> {
  const map = new Map<string, ShipmentLine[]>();
  if (!shipmentIds.length) return map;
  const rows = (await client.query<{ shipment_id: string; order_item_id: string; quantity: string; serials: { id: string; serial: string; returned: boolean }[] }>(
    `SELECT i.shipment_id,i.order_item_id,sum(i.quantity)::text AS quantity,
       COALESCE((SELECT json_agg(json_build_object('id',u.id,'serial',u.serial,'returned',COALESCE(r.status IN ('received','inspected','closed'),false)) ORDER BY u.shipment_item_id,u.unit_index)
         FROM order_unit_serials u JOIN shipment_items x ON x.id=u.shipment_item_id LEFT JOIN return_items ri ON ri.id=u.return_item_id LEFT JOIN returns r ON r.id=ri.return_id
         WHERE x.shipment_id=i.shipment_id AND x.order_item_id=i.order_item_id),'[]'::json) AS serials
     FROM shipment_items i WHERE i.shipment_id=ANY($1::uuid[]) GROUP BY i.shipment_id,i.order_item_id ORDER BY i.order_item_id`, [shipmentIds])).rows;
  for (const row of rows) {
    const list = map.get(row.shipment_id) ?? [];
    list.push({ orderItemId: row.order_item_id, quantity: Number(row.quantity), ...(withSerials ? { serials: row.serials } : {}) });
    map.set(row.shipment_id, list);
  }
  return map;
}
function shipmentDTO(row: ShipmentRow, items: ShipmentLine[], staffDetail: boolean): ShipmentDTO {
  return {
    id: row.id, status: row.status, version: row.version,
    carrier: staffDetail ? row.carrier : null, trackingReference: staffDetail ? row.tracking_reference : null, internalNotes: staffDetail ? row.internal_notes : null,
    createdAt: row.created_at.toISOString(), dispatchedAt: row.dispatched_at?.toISOString() ?? null, deliveredAt: row.delivered_at?.toISOString() ?? null,
    items,
  };
}
async function readShipment(client: PoolClient, shipmentId: string): Promise<ShipmentDTO> {
  const row = (await client.query<ShipmentRow>(`SELECT ${SHIPMENT_COLUMNS} FROM shipments WHERE id=$1`, [shipmentId])).rows[0] ?? notFound();
  return shipmentDTO(row, (await shipmentItems(client, [shipmentId], true)).get(shipmentId) ?? [], true);
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

// ---------------------------------------------------------------- serials (0030, owner 2026-11-25)
/** The serial key the database stores: upper case, no whitespace (same as order_unit_serials.serial_key). */
export const serialKey = (serial: string) => serial.replace(/\s/g, "").toUpperCase();

/** 409 SERIALS_REQUIRED unless every serial-required item has one serial per unit in `unitsByItem`. */
async function requireSerials(client: PoolClient, lines: { orderItemId: string; quantity: number }[], unitsByItem: Map<string, string[]>): Promise<void> {
  const items = (await client.query<{ id: string; product_id: string | null; name: string }>("SELECT id,product_id,name FROM order_items WHERE id=ANY($1::uuid[])", [lines.map(line => line.orderItemId)])).rows;
  const decisions = await resolveSerialRequirements(client, items.flatMap(item => item.product_id ? [item.product_id] : []));
  const missing = lines.flatMap(line => {
    const item = items.find(row => row.id === line.orderItemId);
    // An item whose product is gone is treated as a device (the safe side).
    const required = item?.product_id ? decisions.get(item.product_id)?.required ?? true : true;
    return required && (unitsByItem.get(line.orderItemId)?.length ?? 0) !== line.quantity ? [item?.name ?? line.orderItemId] : [];
  });
  if (missing.length) fail("SERIALS_REQUIRED", 409, `Enter a serial number for every unit of: ${missing.join(", ")}`);
}

/**
 * Locks the serial keys (sorted, so two packers never deadlock) and refuses a duplicate in the request or a serial
 * still active on another unit. Active = its shipment is not cancelled and it is not on a return that was received.
 * `ownShipmentItemIds` are lines whose serials are being replaced, so their current rows don't count.
 */
async function claimSerials(client: PoolClient, serials: string[], ownShipmentItemIds: string[]): Promise<void> {
  const keys = serials.map(serialKey);
  const seen = new Set<string>();
  for (const [index, k] of keys.entries()) {
    if (!k) invalid();
    if (seen.has(k)) fail("SERIAL_DUPLICATE", 409, `Serial ${serials[index]} is entered twice`);
    seen.add(k);
  }
  for (const k of [...seen].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtextextended('grmn:serial:' || $1, 0))", [k]);
  if (!seen.size) return;
  const taken = (await client.query<{ serial: string; order_number: string }>(`
    SELECT u.serial, o.order_number FROM order_unit_serials u
      JOIN shipment_items si ON si.id = u.shipment_item_id JOIN shipments s ON s.id = si.shipment_id JOIN orders o ON o.id = u.order_id
      LEFT JOIN return_items ri ON ri.id = u.return_item_id LEFT JOIN returns r ON r.id = ri.return_id
    WHERE u.serial_key = ANY($1::text[]) AND s.status <> 'cancelled' AND COALESCE(r.status, '') NOT IN ('received', 'inspected', 'closed')
      AND NOT (u.shipment_item_id = ANY($2::uuid[]))
    ORDER BY u.serial LIMIT 1`, [[...seen], ownShipmentItemIds])).rows[0];
  if (taken) fail("SERIAL_IN_USE", 409, `Serial ${taken.serial} is already on order ${taken.order_number}`);
}

type SummaryRow = { id: string; order_number: string; shown_at: Date; order_status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; payment_mode: AdminOrderSummaryDTO["paymentMode"]; data_quality: "complete" | "legacy_incomplete"; total_minor: string; items_count: number; contact_name: string } & BoardColumns;
function summary(row: SummaryRow): AdminOrderSummaryDTO {
  return {
    id: row.id, orderNumber: row.order_number, placedAt: row.shown_at.toISOString(), status: row.order_status, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status,
    paymentMode: row.payment_mode, dataQuality: row.data_quality, total: money(row.total_minor), itemsCount: row.items_count, contactName: row.contact_name,
    stage: row.stage, archived: row.archived, paymentPill: row.payment, legacy: row.legacy, itemNames: row.item_names, deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
  };
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
  const service = {
    /**
     * Staff order board and list, newest first: active or archived orders (a search covers both), by period, stage,
     * fulfillment status and payment mode. Keyset-paged; `counts` per column for the active view without a search.
     */
    async listOrders(headers: Headers, input: unknown): Promise<{ items: AdminOrderSummaryDTO[]; nextCursor: string | null; counts: Record<BoardStage, number> | null }> {
      await authorize(headers, "orders:read");
      const query = parse(listInput, input ?? {});
      const limit = query.limit ?? PAGE_LIMIT;
      const filter = { view: query.view, period: query.period, from: query.from, to: query.to, q: query.q, stage: query.stage };
      // Filters shared by the page and the column counts; built once per argument list so placeholders line up.
      const shared = (args: unknown[], withStage: boolean) => {
        let where = "";
        if (query.fulfillmentStatus) { args.push(query.fulfillmentStatus); where += ` AND o.fulfillment_status=$${args.length}`; }
        if (query.paymentMode) { args.push(query.paymentMode === "demo" ? ["demo", "sandbox"] : [query.paymentMode]); where += ` AND o.payment_mode=ANY($${args.length}::text[])`; }
        return where + boardWhere(filter, args, withStage);
      };
      const args: unknown[] = [limit + 1];
      let where = shared(args, true);
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        args.push(cursor.at, cursor.id);
        where += ` AND (COALESCE(o.placed_at,o.created_at),o.id)<($${args.length - 1},$${args.length})`;
      }
      const rows = (await pool.query<SummaryRow>(
        `SELECT o.id,o.order_number,COALESCE(o.placed_at,o.created_at) AS shown_at,o.order_status,o.payment_status,o.fulfillment_status,o.payment_mode,o.data_quality,o.total_minor::text AS total_minor,
          (SELECT COALESCE(sum(quantity),0)::int FROM order_items WHERE order_id=o.id) AS items_count,o.contact_name,${BOARD_COLUMNS}
         FROM orders o WHERE true${where} ORDER BY COALESCE(o.placed_at,o.created_at) DESC,o.id DESC LIMIT $1`, args)).rows;
      let counts: Record<BoardStage, number> | null = null;
      if (query.view !== "archive" && !query.q) {
        const countArgs: unknown[] = [];
        const countWhere = shared(countArgs, false);
        const grouped = (await pool.query<{ stage: BoardStage; n: number }>(`SELECT ${STAGE} AS stage,count(*)::int AS n FROM orders o WHERE true${countWhere} GROUP BY 1`, countArgs)).rows;
        counts = { new: 0, packed: 0, shipped: 0, delivered: 0 };
        for (const row of grouped) counts[row.stage] = row.n;
      }
      const page = rows.slice(0, limit), last = page[page.length - 1];
      return { items: page.map(summary), nextCursor: rows.length > limit && last ? encodeCursor(last.shown_at, last.id) : null, counts };
    },

    /** One order with its items, shipments and the full recorded timeline. */
    async getOrder(headers: Headers, orderId: unknown): Promise<AdminOrderDetailDTO> {
      const principal = await authorize(headers, "orders:read");
      const staffDetail = principal.permissions.includes("orders:fulfill");
      if (typeof orderId !== "string" || !UUID.test(orderId)) return notFound();
      const order = (await pool.query<OrderRow & BoardColumns & { shown_at: Date; total_minor: string; contact_name: string; contact_phone: string | null; contact_email: string | null }>(
        `SELECT ${ORDER_COLUMNS},COALESCE(o.placed_at,o.created_at) AS shown_at,o.total_minor::text AS total_minor,o.contact_name,o.contact_phone,o.contact_email,${BOARD_COLUMNS} FROM orders o WHERE o.id=$1`, [orderId])).rows[0] ?? notFound();
      const [items, address, shipments, events] = await Promise.all([
        pool.query<{ id: string; product_id: string | null; name: string; sku: string | null; quantity: number; allocated: string; claimed: string; shipped: string; remaining: string }>(`
          SELECT i.id,i.product_id,i.name,i.sku,i.quantity,
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
      // Serials are shown to every order reader (support looks them up for warranty claims).
      const lines = await shipmentItems(pool, shipments.rows.map(row => row.id), true);
      const serialDecisions = await resolveSerialRequirements(pool, items.rows.flatMap(row => row.product_id ? [row.product_id] : []));
      const block = fulfillmentBlock(order);
      // O07: how the order is paid, whether a manual payment can be confirmed now, and the confirmation.
      const payment = (await pool.query<{ method: PaymentMethodCode | null; attempt_open: boolean; hold_running: boolean }>(
        `SELECT (SELECT a.provider FROM payment_attempts a WHERE a.order_id=o.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS method,
           EXISTS(SELECT 1 FROM payment_attempts a WHERE a.order_id=o.id AND a.provider='manual' AND a.status IN ('created','pending','requires_action','authorized','unknown')) AS attempt_open,
           EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.checkout_attempt_id=o.checkout_attempt_id AND r.status='active' AND r.expires_at>now()) AS hold_running
         FROM orders o WHERE o.id=$1`, [orderId])).rows[0];
      const confirmation = (await pool.query<{ external_id: string; amount: string; evidence: Record<string, unknown>; created_at: Date }>(
        "SELECT external_id,amount_minor::text AS amount,evidence,created_at FROM payment_transactions WHERE order_id=$1 AND provider='manual' AND kind='capture' ORDER BY created_at,id LIMIT 1", [orderId])).rows[0];
      const confirmable = payment.method === "manual" && payment.attempt_open && payment.hold_running && order.order_status === "pending_payment" && ["unpaid", "pending", "failed"].includes(order.payment_status);
      const snapshot = address.rows[0];
      const deliveryAddress = snapshot ? Object.fromEntries(Object.entries(snapshot).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : null;
      return {
        id: order.id, orderNumber: order.order_number, placedAt: order.shown_at.toISOString(), status: order.order_status, paymentStatus: order.payment_status,
        fulfillmentStatus: order.fulfillment_status, paymentMode: order.payment_mode, dataQuality: order.data_quality, total: money(order.total_minor),
        itemsCount: items.rows.reduce((sum, row) => sum + row.quantity, 0), contactName: order.contact_name,
        stage: order.stage, archived: order.archived, paymentPill: order.payment, itemNames: order.item_names, deliveredAt: order.delivered_at ? new Date(order.delivered_at).toISOString() : null,
        version: order.version, legacy: isLegacy(order), fulfillable: { allowed: block === null, reason: block },
        contact: { name: order.contact_name, phone: order.contact_phone, email: order.contact_email }, deliveryAddress,
        items: items.rows.map(row => {
          const allocated = Number(row.allocated), claimed = Number(row.claimed);
          const decision = row.product_id ? serialDecisions.get(row.product_id) : undefined;
          return { id: row.id, name: row.name, sku: row.sku, quantity: row.quantity, allocated, claimed, shipped: Number(row.shipped), remaining: Math.max(allocated - claimed, 0),
            serialRequired: decision?.required ?? true, serialSource: decision?.source ?? "default" };
        }),
        shipments: shipments.rows.map(row => shipmentDTO(row, lines.get(row.id) ?? [], staffDetail)),
        timeline: events.rows.map(row => {
          const shipmentId = typeof row.payload.shipmentId === "string" ? row.payload.shipmentId : null;
          const internalNote = staffDetail && typeof row.payload.internalNote === "string" ? row.payload.internalNote : undefined;
          return { id: row.id, type: row.type, visibility: row.visibility, source: row.source, occurredAt: row.happened_at.toISOString(), actorUserId: row.actor_user_id, shipmentId, ...(internalNote ? { internalNote } : {}) };
        }),
        refunds: await readRefunds(pool, orderId),
        returns: await readReturns(pool, orderId),
        payment: {
          method: payment.method, confirmable,
          confirmation: confirmation ? {
            method: String(confirmation.evidence.method ?? ""), reference: confirmation.external_id, amountMinor: confirmation.amount,
            note: typeof confirmation.evidence.note === "string" ? confirmation.evidence.note : null, confirmedAt: confirmation.created_at.toISOString(),
            actorUserId: typeof confirmation.evidence.confirmedBy === "string" ? confirmation.evidence.confirmedBy : null,
          } : null,
        },
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
        const unitsByItem = new Map((command.serials ?? []).map(entry => [entry.orderItemId.toLowerCase(), entry.units]));
        await requireSerials(client, command.lines.map(line => ({ orderItemId: line.orderItemId.toLowerCase(), quantity: line.quantity })), unitsByItem);
        await claimSerials(client, [...unitsByItem.values()].flat(), []);
        const shipmentId = randomUUID();
        await client.query("INSERT INTO shipments(id,order_id,carrier,tracking_reference,internal_notes) VALUES($1,$2,$3,$4,$5)",
          [shipmentId, order.id, command.carrier ?? null, command.trackingReference ?? null, command.internalNote ?? null]);
        const nextUnit = new Map<string, number>();
        for (const line of plan) {
          const shipmentItemId = randomUUID();
          await client.query("INSERT INTO shipment_items(id,shipment_id,order_id,order_item_id,allocation_id,quantity) VALUES($1,$2,$3,$4,$5,$6)",
            [shipmentItemId, shipmentId, order.id, line.orderItemId, line.allocationId, line.quantity]);
          // Serials go one per unit, in the order given, across this item's shipment lines.
          const units = unitsByItem.get(line.orderItemId) ?? [], from = nextUnit.get(line.orderItemId) ?? 0;
          const mine = units.slice(from, from + line.quantity);
          nextUnit.set(line.orderItemId, from + mine.length);
          for (const [index, serial] of mine.entries()) {
            await client.query("INSERT INTO order_unit_serials(id,order_id,order_item_id,shipment_item_id,unit_index,serial,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
              [randomUUID(), order.id, line.orderItemId, shipmentItemId, index + 1, serial, principal.userId]);
          }
        }
        await client.query("UPDATE shipments SET status='ready',version=version+1 WHERE id=$1", [shipmentId]);
        const eventId = await orderEvent(client, { orderId: order.id, type: "shipment.created", actor: principal.userId, dedupeKey, visibility: "internal",
          payload: { shipmentId, requestHash: hash, lines: command.lines, ...(command.internalNote ? { internalNote: command.internalNote } : {}) } });
        await shipmentEvent(client, shipmentId, "created", principal.userId, `shipment-created:${shipmentId}`, command.internalNote);
        // 0030: customers see "Packed" in their order tracker.
        await orderEvent(client, { orderId: order.id, type: "fulfillment.packed", actor: principal.userId, dedupeKey: `fulfillment.packed:${shipmentId}`, visibility: "customer",
          payload: { shipmentId, items: command.lines.map(line => ({ orderItemId: line.orderItemId.toLowerCase(), quantity: line.quantity })) } });
        await audit(client, principal.userId, "fulfillment.shipment_created", shipmentId, eventId, { orderId: order.id, lines: command.lines, carrier: command.carrier !== undefined, trackingReference: command.trackingReference !== undefined, serials: [...unitsByItem.values()].flat().length });
        const updated = await refreshOrder(client, order.id);
        return { shipment: await readShipment(client, shipmentId), order: updated, replayed: false };
      });
    },

    /** dispatch (ready -> dispatched), deliver (dispatched -> delivered), cancel (ready -> cancelled), annotate, or set_serials. */
    async updateShipment(headers: Headers, input: unknown): Promise<ShipmentResultDTO> {
      if ((input as { action?: unknown } | null)?.action === "set_serials") return service.setSerials(headers, input);
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

    /** Replaces one item's serials while its shipment is packed (ready); locked once dispatched. */
    async setSerials(headers: Headers, input: unknown): Promise<ShipmentResultDTO> {
      const principal = await authorize(headers, "orders:fulfill");
      const command = parse(serialsInput, input);
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
        if (shipment.status !== "ready") fail("INVALID_TRANSITION", 409, `Serials of a ${shipment.status} shipment cannot change`);
        const itemId = command.orderItemId.toLowerCase();
        const lines = (await client.query<{ id: string; quantity: number }>("SELECT id,quantity FROM shipment_items WHERE shipment_id=$1 AND order_item_id=$2 ORDER BY id FOR UPDATE", [shipment.id, itemId])).rows;
        if (!lines.length) notFound();
        const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
        if (command.units.length > quantity) invalid();
        if (command.units.length !== quantity) await requireSerials(client, [{ orderItemId: itemId, quantity }], new Map([[itemId, command.units]]));
        await claimSerials(client, command.units, lines.map(line => line.id));
        await client.query("DELETE FROM order_unit_serials WHERE shipment_item_id=ANY($1::uuid[])", [lines.map(line => line.id)]);
        let next = 0;
        for (const line of lines) {
          for (const [index, serial] of command.units.slice(next, next + line.quantity).entries()) {
            await client.query("INSERT INTO order_unit_serials(id,order_id,order_item_id,shipment_item_id,unit_index,serial,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
              [randomUUID(), order.id, itemId, line.id, index + 1, serial, principal.userId]);
          }
          next += line.quantity;
        }
        await client.query("UPDATE shipments SET version=version+1 WHERE id=$1", [shipment.id]);
        const eventId = await orderEvent(client, { orderId: order.id, type: "shipment.serials_updated", actor: principal.userId, dedupeKey, visibility: "internal",
          payload: { shipmentId: shipment.id, requestHash: hash, orderItemId: itemId, units: command.units.length } });
        await shipmentEvent(client, shipment.id, "serials_updated", principal.userId, `shipment-serials:${shipment.id}:${eventId}`, undefined);
        await audit(client, principal.userId, "fulfillment.serials_updated", shipment.id, eventId, { orderId: order.id, orderItemId: itemId, units: command.units.length });
        return { shipment: await readShipment(client, shipment.id), order: { id: order.id, version: order.version, fulfillmentStatus: order.fulfillment_status }, replayed: false };
      });
    },
  };
  return service;
}
export type FulfillmentService = ReturnType<typeof createFulfillmentService>;
