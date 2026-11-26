import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orders, orderItems } from "./commerce.ts";
import { inventoryAllocations, stockLocations } from "./inventory.ts";
import { user } from "./identity.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => time("created_at").notNull().defaultNow();

export const shipments = pgTable("shipments", {
  id: id(), orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  mode: text("mode").notNull().default("manual"), status: text("status").notNull().default("draft"),
  sourceNamespace: text("source_namespace").notNull().default("manual"), externalId: text("external_id"),
  carrier: text("carrier"), trackingReference: text("tracking_reference"), internalNotes: text("internal_notes"),
  dispatchedAt: time("dispatched_at"), deliveredAt: time("delivered_at"), version: integer("version").notNull().default(1), createdAt: createdAt(),
}, t => [
  unique("shipments_identity_order_unique").on(t.id, t.orderId),
  uniqueIndex("shipments_external_unique").on(t.sourceNamespace, t.externalId).where(sql`${t.externalId} IS NOT NULL`),
  index("shipments_order_idx").on(t.orderId), index("shipments_queue_idx").on(t.status, t.createdAt, t.id),
  check("shipments_fields_valid", sql`${t.mode}='manual' AND ${t.version}>0 AND length(btrim(${t.sourceNamespace}))>0 AND (${t.externalId} IS NULL OR length(btrim(${t.externalId}))>0) AND ${t.status} IN ('draft','ready','dispatched','delivered','cancelled')`),
  check("shipments_times_valid", sql`(${t.status} NOT IN ('dispatched','delivered') OR ${t.dispatchedAt} IS NOT NULL) AND (${t.status}<>'delivered' OR (${t.deliveredAt} IS NOT NULL AND ${t.deliveredAt}>=${t.dispatchedAt}))`),
]);

export const shipmentItems = pgTable("shipment_items", {
  id: id(), shipmentId: uuid("shipment_id").notNull(), orderId: uuid("order_id").notNull(), orderItemId: uuid("order_item_id").notNull(),
  allocationId: uuid("allocation_id").notNull().references(() => inventoryAllocations.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(), returnEpoch: bigint("return_epoch", { mode: "bigint" }).notNull().default(sql`0`),
}, t => [
  foreignKey({ columns: [t.shipmentId, t.orderId], foreignColumns: [shipments.id, shipments.orderId] }).onDelete("restrict"),
  foreignKey({ columns: [t.orderItemId, t.orderId], foreignColumns: [orderItems.id, orderItems.orderId] }).onDelete("restrict"),
  unique("shipment_items_identity_item_unique").on(t.id, t.orderItemId),
  uniqueIndex("shipment_items_allocation_unique").on(t.shipmentId, t.allocationId),
  index("shipment_items_allocation_idx").on(t.allocationId), index("shipment_items_order_idx").on(t.orderItemId),
  check("shipment_items_quantity_valid", sql`${t.quantity}>0 AND ${t.returnEpoch}>=0`),
]);

export const shipmentEvents = pgTable("shipment_events", {
  id: id(), shipmentId: uuid("shipment_id").notNull().references(() => shipments.id, { onDelete: "restrict" }),
  type: text("type").notNull(), source: text("source").notNull(), sourceEventId: text("source_event_id"), dedupeKey: text("dedupe_key").notNull().unique(),
  actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
  occurredAt: time("occurred_at"), recordedAt: time("recorded_at").notNull().defaultNow(), internalNote: text("internal_note"),
}, t => [
  uniqueIndex("shipment_events_source_unique").on(t.source, t.sourceEventId).where(sql`${t.sourceEventId} IS NOT NULL`),
  index("shipment_events_history_idx").on(t.shipmentId, t.recordedAt, t.id), index("shipment_events_actor_idx").on(t.actorUserId),
  check("shipment_events_fields_valid", sql`length(btrim(${t.type}))>0 AND length(btrim(${t.source}))>0 AND length(btrim(${t.dedupeKey}))>0 AND (${t.sourceEventId} IS NULL OR length(btrim(${t.sourceEventId}))>0)`),
]);

export const returns = pgTable("returns", {
  id: id(), orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  requestedByUserId: uuid("requested_by_user_id").references(() => user.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("requested"), reason: text("reason").notNull(), idempotencyKey: text("idempotency_key").notNull(),
  receivedAt: time("received_at"), inspectedAt: time("inspected_at"), createdAt: createdAt(), version: integer("version").notNull().default(1),
}, t => [
  unique("returns_identity_order_unique").on(t.id, t.orderId), uniqueIndex("returns_request_unique").on(t.orderId, t.idempotencyKey),
  index("returns_queue_idx").on(t.status, t.createdAt, t.id), index("returns_requester_idx").on(t.requestedByUserId),
  check("returns_fields_valid", sql`${t.status} IN ('requested','authorized','received','inspected','rejected','cancelled','closed') AND ${t.version}>0 AND length(btrim(${t.reason}))>0 AND ${t.idempotencyKey} ~ '^[ -~]{16,128}$'`),
  check("returns_times_valid", sql`(${t.status} NOT IN ('received','inspected','closed') OR ${t.receivedAt} IS NOT NULL) AND (${t.status} NOT IN ('inspected','closed') OR (${t.inspectedAt} IS NOT NULL AND ${t.inspectedAt}>=${t.receivedAt}))`),
]);

export const returnItems = pgTable("return_items", {
  id: id(), returnId: uuid("return_id").notNull(), orderId: uuid("order_id").notNull(), orderItemId: uuid("order_item_id").notNull(),
  shipmentItemId: uuid("shipment_item_id").notNull(), quantity: integer("quantity").notNull(),
  receivedQuantity: integer("received_quantity").notNull().default(0), acceptedQuantity: integer("accepted_quantity").notNull().default(0),
  restockedQuantity: integer("restocked_quantity").notNull().default(0), restockDecision: text("restock_decision").notNull().default("undecided"),
  restockLocationId: uuid("restock_location_id").references(() => stockLocations.id, { onDelete: "restrict" }), inspectedAt: time("inspected_at"),
}, t => [
  foreignKey({ columns: [t.returnId, t.orderId], foreignColumns: [returns.id, returns.orderId] }).onDelete("restrict"),
  foreignKey({ columns: [t.orderItemId, t.orderId], foreignColumns: [orderItems.id, orderItems.orderId] }).onDelete("restrict"),
  foreignKey({ columns: [t.shipmentItemId, t.orderItemId], foreignColumns: [shipmentItems.id, shipmentItems.orderItemId] }).onDelete("restrict"),
  uniqueIndex("return_items_shipment_unique").on(t.returnId, t.shipmentItemId), index("return_items_shipment_idx").on(t.shipmentItemId), index("return_items_order_idx").on(t.orderItemId), index("return_items_location_idx").on(t.restockLocationId),
  check("return_items_quantities_valid", sql`${t.quantity}>0 AND ${t.receivedQuantity} BETWEEN 0 AND ${t.quantity} AND ${t.acceptedQuantity} BETWEEN 0 AND ${t.receivedQuantity} AND ${t.restockedQuantity} BETWEEN 0 AND ${t.acceptedQuantity}`),
  check("return_items_inspection_valid", sql`${t.restockDecision} IN ('undecided','restock','quarantine','dispose') AND (${t.acceptedQuantity}=0 OR ${t.inspectedAt} IS NOT NULL) AND (${t.restockedQuantity}=0 OR (${t.restockDecision}='restock' AND ${t.inspectedAt} IS NOT NULL AND ${t.restockLocationId} IS NOT NULL))`),
]);

// 0030 (owner 2026-11-25): one serial number per physical unit, recorded when the order is packed, for
// warranty claims and returns. serial_key (upper case, no spaces) is what "same serial" means. A serial is
// active while its shipment is not cancelled and it is not on a return that reached received/inspected/closed;
// the service enforces that only one active row holds a key (it depends on other tables, so no index can).
export const orderUnitSerials = pgTable("order_unit_serials", {
  id: id(), orderId: uuid("order_id").notNull(), orderItemId: uuid("order_item_id").notNull(), shipmentItemId: uuid("shipment_item_id").notNull(),
  unitIndex: integer("unit_index").notNull(), serial: text("serial").notNull(),
  // grmn_serial_key (0030): upper case, no whitespace incl. no-break / zero-width spaces, whatever the locale.
  serialKey: text("serial_key").generatedAlwaysAs(sql`grmn_serial_key(serial)`),
  returnItemId: uuid("return_item_id").references(() => returnItems.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by").references(() => user.id, { onDelete: "restrict" }),
  createdAt: createdAt(), updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.shipmentItemId, t.orderItemId], foreignColumns: [shipmentItems.id, shipmentItems.orderItemId] }).onDelete("restrict"),
  foreignKey({ columns: [t.orderItemId, t.orderId], foreignColumns: [orderItems.id, orderItems.orderId] }).onDelete("restrict"),
  uniqueIndex("order_unit_serials_unit_unique").on(t.shipmentItemId, t.unitIndex),
  index("order_unit_serials_key_idx").on(t.serialKey), index("order_unit_serials_order_idx").on(t.orderId), index("order_unit_serials_return_idx").on(t.returnItemId),
  check("order_unit_serials_serial_valid", sql`${t.unitIndex}>=1 AND ${t.serial}=btrim(${t.serial}) AND char_length(${t.serial}) BETWEEN 1 AND 64`),
]);
