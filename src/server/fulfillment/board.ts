import "server-only";
// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, T3.3): the staff order board.
// - Columns follow the shipment-derived fulfillment status: unfulfilled/exception → New, processing → Packed,
//   partially_shipped/shipped → Shipped, delivered → Delivered.
// - Archive: imported (legacy) orders, cancelled/closed, fully refunded, every shipped unit back on a received
//   return, and delivered orders from 00:00 Asia/Almaty on the calendar day after delivery (not 24 hours later).
//   Computed in the query, so there is no nightly job to fail.
// - Periods use the order date (placed_at, else created_at) in Asia/Almaty; weeks start on Monday.

export type BoardStage = "new" | "packed" | "shipped" | "delivered";
export type BoardPeriod = "all" | "today" | "week" | "7d" | "30d" | "month" | "custom";
export type PaymentPill = "awaiting" | "paid" | "problem";
export const BOARD_STAGES = ["new", "packed", "shipped", "delivered"] as const satisfies readonly BoardStage[];
export const BOARD_PERIODS = ["all", "today", "week", "7d", "30d", "month", "custom"] as const satisfies readonly BoardPeriod[];
export const STORE_TIME_ZONE = "Asia/Almaty";

const LOCAL_NOW = `(now() AT TIME ZONE '${STORE_TIME_ZONE}')`;
const local = (expression: string) => `(${expression}) AT TIME ZONE '${STORE_TIME_ZONE}'`;
/** Today's 00:00 in the store time zone, as a timestamptz. */
export const TODAY_START = local(`date_trunc('day', ${LOCAL_NOW})`);
const SHOWN_AT = "COALESCE(o.placed_at,o.created_at)";
const LEGACY = "(o.data_quality<>'complete' OR o.payment_mode='legacy_unknown' OR o.checkout_attempt_id IS NULL)";
const CAPTURED = "EXISTS (SELECT 1 FROM payment_transactions t WHERE t.order_id=o.id AND t.kind='capture')";
const DELIVERED_AT = "(SELECT max(s.delivered_at) FROM shipments s WHERE s.order_id=o.id AND s.status='delivered')";
const SHIPPED_LINES = "shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE si.order_id=o.id AND s.status IN ('dispatched','delivered')";
const RETURNED = `(EXISTS (SELECT 1 FROM ${SHIPPED_LINES}) AND NOT EXISTS (SELECT 1 FROM ${SHIPPED_LINES} AND si.quantity > COALESCE((SELECT sum(ri.received_quantity)
  FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.shipment_item_id=si.id AND r.status IN ('received','inspected','closed')),0)))`;
export const ARCHIVED = `(${LEGACY} OR o.order_status IN ('cancelled','closed') OR o.payment_status='refunded'
  OR (o.fulfillment_status='delivered' AND ${DELIVERED_AT} < ${TODAY_START}) OR ${RETURNED})`;
export const STAGE = `(CASE o.fulfillment_status WHEN 'processing' THEN 'packed' WHEN 'partially_shipped' THEN 'shipped' WHEN 'shipped' THEN 'shipped' WHEN 'delivered' THEN 'delivered' ELSE 'new' END)`;
const PAYMENT = `(CASE WHEN ${CAPTURED} AND o.payment_status IN ('paid','partially_refunded') THEN 'paid' WHEN o.payment_status IN ('failed','refunded') THEN 'problem' ELSE 'awaiting' END)`;

/** Extra columns every board row and the order detail carry. */
export const BOARD_COLUMNS = `${STAGE} AS stage, o.fulfillment_method AS fulfillment_method, ${ARCHIVED} AS archived, ${PAYMENT} AS payment, ${LEGACY} AS legacy, ${DELIVERED_AT} AS delivered_at,
  (SELECT COALESCE(json_agg(n.name),'[]'::json) FROM (SELECT name FROM order_items WHERE order_id=o.id ORDER BY id LIMIT 3) n) AS item_names`;
export interface BoardColumns { fulfillment_method: "delivery" | "pickup"; stage: BoardStage; archived: boolean; payment: PaymentPill; legacy: boolean; delivered_at: Date | null; item_names: string[] }

export interface BoardFilter {
  view?: "active" | "archive"; period?: BoardPeriod; from?: string; to?: string; q?: string; stage?: BoardStage;
}
const likeEscape = (text: string) => text.replace(/[\\%_]/g, character => "\\" + character);

/**
 * WHERE fragments (each starting with " AND ") for a board filter; values are pushed onto `args`.
 * A search covers both views (warranty lookups mostly hit archived orders); `withStage` false leaves out the
 * stage filter (for the per-column counts).
 */
export function boardWhere(filter: BoardFilter, args: unknown[], withStage = true): string {
  let where = "";
  const add = (value: unknown) => { args.push(value); return `$${args.length}`; };
  if (filter.q) {
    const text = filter.q.trim(), like = add(`%${likeEscape(text)}%`), serial = add(likeEscape(text));
    const digits = text.replace(/\D/g, "");
    const phone = digits.length >= 4 ? ` OR regexp_replace(COALESCE(o.contact_phone,''),'\\D','','g') LIKE ${add(`%${digits}%`)}` : "";
    where += ` AND (o.order_number ILIKE ${like} OR o.contact_name ILIKE ${like}${phone}
      OR EXISTS (SELECT 1 FROM order_unit_serials u WHERE u.order_id=o.id AND u.serial_key LIKE grmn_serial_key(${serial}) || '%'))`;
  } else {
    where += filter.view === "archive" ? ` AND ${ARCHIVED}` : ` AND NOT ${ARCHIVED}`;
  }
  switch (filter.period ?? "all") {
    case "today": where += ` AND ${SHOWN_AT} >= ${TODAY_START}`; break;
    case "week": where += ` AND ${SHOWN_AT} >= ${local(`date_trunc('week', ${LOCAL_NOW})`)}`; break;
    case "7d": where += ` AND ${SHOWN_AT} >= ${TODAY_START} - interval '6 days'`; break;
    case "30d": where += ` AND ${SHOWN_AT} >= ${TODAY_START} - interval '29 days'`; break;
    case "month": where += ` AND ${SHOWN_AT} >= ${local(`date_trunc('month', ${LOCAL_NOW})`)}`; break;
    case "custom": {
      const from = add(filter.from), to = add(filter.to);
      where += ` AND ${SHOWN_AT} >= ${local(`${from}::date::timestamp`)} AND ${SHOWN_AT} < ${local(`(${to}::date + 1)::timestamp`)}`;
      break;
    }
    case "all": break;
  }
  if (withStage && filter.stage) where += ` AND ${STAGE} = ${add(filter.stage)}`;
  return where;
}
