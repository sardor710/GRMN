// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, T4.1): rules of the admin order board.
// The server decides what is allowed; these only decide what the screen offers.
import type { AdminOrderSummaryDTO } from "../../../../../contracts/commerce.ts";

export type BoardStage = AdminOrderSummaryDTO["stage"];
export type NextAction = "pack" | "ship" | "deliver";
export type BoardPeriod = "all" | "today" | "week" | "7d" | "30d" | "month" | "custom";

export const BOARD_COLUMNS: readonly { stage: BoardStage; label: string; hint: string }[] = [
  { stage: "new", label: "New", hint: "Placed, waiting to be packed" },
  { stage: "packed", label: "Packed", hint: "Serials recorded, ready to ship" },
  { stage: "shipped", label: "Shipped", hint: "On the way to the customer" },
  { stage: "delivered", label: "Delivered", hint: "Moves to the archive tomorrow" },
];

export const PERIOD_OPTIONS: readonly { value: BoardPeriod; label: string }[] = [
  { value: "all", label: "All time" }, { value: "today", label: "Today" }, { value: "week", label: "This week" },
  { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }, { value: "month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

const ACTION_BY_STAGE: Partial<Record<BoardStage, NextAction>> = { new: "pack", packed: "ship", shipped: "deliver" };
const NEXT_STAGE: Partial<Record<BoardStage, BoardStage>> = { new: "packed", packed: "shipped", shipped: "delivered" };
export const ACTION_LABEL: Record<NextAction, string> = { pack: "Pack", ship: "Ship", deliver: "Mark delivered" };

type CardOrder = Pick<AdminOrderSummaryDTO, "stage" | "paymentPill" | "archived" | "legacy" | "status" | "fulfillmentStatus">;

/** The one step a card offers, or null (unpaid, archived, imported, exception, cancellation pending, part-shipped). */
export function nextAction(order: CardOrder): NextAction | null {
  if (order.archived || order.legacy || order.status !== "confirmed" || order.fulfillmentStatus === "exception") return null;
  if (order.stage === "new" && order.paymentPill !== "paid") return null;
  if (order.fulfillmentStatus === "partially_shipped") return null;
  return ACTION_BY_STAGE[order.stage] ?? null;
}

/** Cards move one column forward, and only when that step is open. */
export function canDrop(order: CardOrder, target: BoardStage): boolean {
  return NEXT_STAGE[order.stage] === target && nextAction(order) !== null;
}

export interface ListFilters { view: "active" | "archive"; period: BoardPeriod; from?: string; to?: string; q: string; mode: string }
/** Query string for GET /api/admin/orders (the board loads up to 200 orders per page). */
export function listQuery(filters: ListFilters, cursor?: string | null): string {
  const query = new URLSearchParams({ limit: "200" });
  if (filters.mode) query.set("paymentMode", filters.mode);
  if (filters.view === "archive") query.set("view", "archive");
  if (filters.period === "custom") {
    if (filters.from && filters.to) { query.set("period", "custom"); query.set("from", filters.from); query.set("to", filters.to); }
  } else if (filters.period !== "all") query.set("period", filters.period);
  if (filters.q.trim()) query.set("q", filters.q.trim());
  if (cursor) query.set("cursor", cursor);
  return query.toString();
}

export interface ShippedItem { serials: { id: string; serial: string }[]; units: number }
export interface ReturnLine { orderItemId: string; quantity: number; serialIds?: string[] }
/**
 * Lines for a new return (final review 2026-11-26): an item whose shipped units have serials returns the picked
 * serials; an item without serials (a band, or a device shipped before serials were recorded) returns the typed count.
 */
export function returnLines(shipped: ReadonlyMap<string, ShippedItem>, picked: Readonly<Record<string, boolean>>, counts: Readonly<Record<string, string>>): ReturnLine[] {
  return [...shipped.entries()].flatMap(([orderItemId, entry]): ReturnLine[] => {
    if (entry.serials.length) {
      const serialIds = entry.serials.filter(serial => picked[serial.id]).map(serial => serial.id);
      return serialIds.length ? [{ orderItemId, quantity: serialIds.length, serialIds }] : [];
    }
    const quantity = Number(counts[orderItemId] ?? 0);
    return Number.isInteger(quantity) && quantity > 0 && quantity <= entry.units ? [{ orderItemId, quantity }] : [];
  });
}
