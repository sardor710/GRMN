import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { productVariants } from "./catalog.ts";
import { user } from "./identity.ts";
import { checkoutAttempts, orders, orderItems } from "./commerce.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => time("created_at").notNull().defaultNow();

export const stockLocations = pgTable("stock_locations", {
  id: id(), key: text("key").notNull().unique(), name: text("name").notNull(),
  archived: time("archived_at"), createdAt: createdAt(),
}, t => [check("stock_locations_fields_valid", sql`length(btrim(${t.key}))>0 AND length(btrim(${t.name}))>0`)]);

export const inventoryBalances = pgTable("inventory_balances", {
  variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
  locationId: uuid("location_id").notNull().references(() => stockLocations.id, { onDelete: "restrict" }),
  onHand: integer("on_hand").notNull().default(0), reserved: integer("reserved").notNull().default(0),
  version: integer("version").notNull().default(1), updatedAt: time("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [primaryKey({ columns: [t.variantId, t.locationId] }), index("inventory_balances_location_idx").on(t.locationId, t.variantId), check("inventory_balances_counts_valid", sql`${t.onHand}>=0 AND ${t.reserved} BETWEEN 0 AND ${t.onHand} AND ${t.version}>0`)]);

export const inventoryReservations = pgTable("inventory_reservations", {
  id: id(), checkoutAttemptId: uuid("checkout_attempt_id").notNull().references(() => checkoutAttempts.id, { onDelete: "restrict" }),
  orderId: uuid("order_id"), status: text("status").notNull().default("active"), expiresAt: time("expires_at").notNull(),
  endedAt: time("ended_at"), version: integer("version").notNull().default(1), createdAt: createdAt(),
}, t => [
  foreignKey({ columns: [t.orderId, t.checkoutAttemptId], foreignColumns: [orders.id, orders.checkoutAttemptId] }).onDelete("restrict"),
  uniqueIndex("inventory_reservations_active_unique").on(t.checkoutAttemptId).where(sql`${t.status}='active'`),
  index("inventory_reservations_expiry_idx").on(t.expiresAt, t.id).where(sql`${t.status}='active'`),
  index("inventory_reservations_order_idx").on(t.orderId),
  check("inventory_reservations_valid", sql`${t.version}>0 AND ${t.expiresAt}>${t.createdAt} AND ((${t.status}='active' AND ${t.endedAt} IS NULL) OR (${t.status} IN ('consumed','released','expired') AND ${t.endedAt} IS NOT NULL AND ${t.endedAt}>=${t.createdAt}))`),
]);

export const reservationLines = pgTable("reservation_lines", {
  id: id(), reservationId: uuid("reservation_id").notNull().references(() => inventoryReservations.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id").notNull(), locationId: uuid("location_id").notNull(), quantity: integer("quantity").notNull(),
}, t => [
  foreignKey({ columns: [t.variantId, t.locationId], foreignColumns: [inventoryBalances.variantId, inventoryBalances.locationId] }).onDelete("restrict"),
  unique("reservation_lines_identity_stock_unique").on(t.id, t.variantId, t.locationId, t.quantity),
  uniqueIndex("reservation_lines_stock_unique").on(t.reservationId, t.variantId, t.locationId),
  index("reservation_lines_balance_idx").on(t.variantId, t.locationId), check("reservation_lines_quantity_valid", sql`${t.quantity}>0`),
]);

export const inventoryAllocations = pgTable("inventory_allocations", {
  id: id(), orderItemId: uuid("order_item_id").notNull(), variantId: uuid("variant_id").notNull(), locationId: uuid("location_id").notNull(),
  reservationLineId: uuid("reservation_line_id").notNull().unique(), quantity: integer("quantity").notNull(),
  restoredQuantity: integer("restored_quantity").notNull().default(0), version: integer("version").notNull().default(1), createdAt: createdAt(),
}, t => [
  foreignKey({ columns: [t.orderItemId, t.variantId], foreignColumns: [orderItems.id, orderItems.variantId] }).onDelete("restrict"),
  foreignKey({ columns: [t.variantId, t.locationId], foreignColumns: [inventoryBalances.variantId, inventoryBalances.locationId] }).onDelete("restrict"),
  foreignKey({ columns: [t.reservationLineId, t.variantId, t.locationId, t.quantity], foreignColumns: [reservationLines.id, reservationLines.variantId, reservationLines.locationId, reservationLines.quantity] }).onDelete("restrict"),
  index("inventory_allocations_item_idx").on(t.orderItemId), index("inventory_allocations_stock_idx").on(t.variantId, t.locationId),
  check("inventory_allocations_valid", sql`${t.quantity}>0 AND ${t.restoredQuantity} BETWEEN 0 AND ${t.quantity} AND ${t.version}>0`),
]);

export const stockMovements = pgTable("stock_movements", {
  id: id(), variantId: uuid("variant_id").notNull(), locationId: uuid("location_id").notNull(),
  deltaOnHand: integer("delta_on_hand").notNull(), deltaReserved: integer("delta_reserved").notNull(), reason: text("reason").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(), sourceReference: text("source_reference"),
  reservationLineId: uuid("reservation_line_id").references(() => reservationLines.id, { onDelete: "restrict" }),
  allocationId: uuid("allocation_id").references(() => inventoryAllocations.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
  occurredAt: time("occurred_at"), createdAt: createdAt(),
}, t => [
  foreignKey({ columns: [t.variantId, t.locationId], foreignColumns: [inventoryBalances.variantId, inventoryBalances.locationId] }).onDelete("restrict"),
  index("stock_movements_ledger_idx").on(t.variantId, t.locationId, t.createdAt, t.id),
  index("stock_movements_reservation_idx").on(t.reservationLineId), index("stock_movements_allocation_idx").on(t.allocationId), index("stock_movements_actor_idx").on(t.actorUserId),
  check("stock_movements_valid", sql`(${t.deltaOnHand}<>0 OR ${t.deltaReserved}<>0) AND ${t.reason} IN ('receive','adjust','reserve','release','consume','compensate','return') AND length(btrim(${t.dedupeKey}))>0`),
]);
