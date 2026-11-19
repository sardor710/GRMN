import "server-only";
import type { Pool, PoolClient } from "pg";
import { JobError } from "./outbox.ts";

// Task 24: order notifications to the owner's Telegram group. A scheduled worker job reads
// order_events after a durable per-channel cursor (notification_cursors) and sends one plain-text
// message per event of interest. Delivery is at-least-once: the cursor advances after each send, so
// a crash between a send and its cursor update can repeat one message, but no event is skipped.
// Events younger than `settleMs` wait for the next run, so a transaction that started earlier but
// committed later is not passed by the cursor. On first enable the cursor starts at "now".

export const ORDER_NOTIFY_KIND = "notifications.orders.telegram";
const CHANNEL = "telegram.orders";
const BATCH = 25;

export interface NotificationSender { send(text: string): Promise<void> }
export interface NotifyOptions { baseURL?: string; settleMs?: number; limit?: number }

const titles: Record<string, string> = {
  "order.placed": "🛒 New order",
  "order.paid": "✅ Paid",
  "order.cancelled": "❌ Cancelled",
  "order.expired": "⌛ Expired (not paid in time)",
  "fulfillment.shipped": "🚚 Shipped",
  "fulfillment.delivered": "📦 Delivered",
  "refund.succeeded": "↩️ Refunded",
};
export const NOTIFIED_EVENT_TYPES = Object.keys(titles);

export function formatKzt(minor: string | number | bigint): string {
  const value = BigInt(minor), negative = value < BigInt(0), abs = negative ? -value : value;
  const major = (abs / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "), cents = abs % BigInt(100);
  return `${negative ? "-" : ""}${major}${cents ? "," + cents.toString().padStart(2, "0") : ""} KZT`;
}

interface EventRow { id: string; order_id: string; type: string; payload: Record<string, unknown> }

async function message(client: PoolClient, event: EventRow, baseURL: string | undefined): Promise<string> {
  const order = (await client.query<{ order_number: string; contact_name: string; contact_phone: string | null; total_minor: string; shipping_minor: string | null; payment_mode: string }>(
    "SELECT order_number,contact_name,contact_phone,total_minor::text,shipping_minor::text,payment_mode FROM orders WHERE id=$1", [event.order_id])).rows[0];
  if (!order) return `${titles[event.type]} (order ${event.order_id})`;
  const head = `${titles[event.type]} ${order.order_number}`;
  const admin = baseURL ? `\nAdmin: ${baseURL}/admin/orders` : "";
  if (event.type === "order.placed") {
    const items = (await client.query<{ name: string; quantity: number; total_minor: string }>(
      "SELECT name,quantity,total_minor::text FROM order_items WHERE order_id=$1 ORDER BY name,id", [event.order_id])).rows;
    const address = (await client.query<{ city: string | null; line1: string | null; line2: string | null }>(
      "SELECT city,line1,line2 FROM order_addresses WHERE order_id=$1", [event.order_id])).rows[0];
    const lines = items.slice(0, 30).map(item => `• ${item.name} × ${item.quantity} — ${formatKzt(item.total_minor)}`);
    if (items.length > 30) lines.push(`• … and ${items.length - 30} more`);
    const delivery = order.shipping_minor && order.shipping_minor !== "0" ? ` (delivery ${formatKzt(order.shipping_minor)})` : " (free delivery)";
    return [head, ...lines, `Total: ${formatKzt(order.total_minor)}${delivery}`,
      `Payment: ${order.payment_mode === "manual" ? "manual, awaiting payment" : order.payment_mode}`,
      `Customer: ${order.contact_name}${order.contact_phone ? ", " + order.contact_phone : ""}`,
      ...(address ? [`Delivery: ${[address.city, address.line1, address.line2].filter(Boolean).join(", ")}`] : [])].join("\n") + admin;
  }
  if (event.type === "order.paid") return `${head} — ${formatKzt(order.total_minor)}${admin}`;
  if (event.type === "refund.succeeded" && typeof event.payload.amountMinor === "string") return `${head} — ${formatKzt(event.payload.amountMinor)}${admin}`;
  return head + admin;
}

/** One notification run. Returns how many messages were sent; throws a retryable JobError on a failed send (progress so far is kept). */
export async function notifyOrderEvents(pool: Pool, sender: NotificationSender, options: NotifyOptions = {}): Promise<{ initialized: boolean; sent: number }> {
  const client = await pool.connect();
  let sent = 0;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('grmn-order-notifications'))");
    const cursor = (await client.query<{ last_recorded_at: string; last_event_id: string }>(
      "SELECT last_recorded_at::text AS last_recorded_at,last_event_id FROM notification_cursors WHERE channel=$1 FOR UPDATE", [CHANNEL])).rows[0];
    if (!cursor) {
      await client.query("INSERT INTO notification_cursors(channel,last_recorded_at) VALUES($1,clock_timestamp())", [CHANNEL]);
      await client.query("COMMIT");
      return { initialized: true, sent: 0 };
    }
    const events = (await client.query<EventRow>(
      `SELECT id,order_id,type,payload FROM order_events
       WHERE (recorded_at,id) > ($1::timestamptz,$2::uuid) AND recorded_at < clock_timestamp() - ($3::int * interval '1 millisecond')
       ORDER BY recorded_at,id LIMIT $4`,
      [cursor.last_recorded_at, cursor.last_event_id, options.settleMs ?? 15_000, options.limit ?? BATCH])).rows;
    let failure: unknown = null;
    for (const event of events) {
      if (Object.hasOwn(titles, event.type)) {
        try { await sender.send(await message(client, event, options.baseURL)); }
        catch (error) { failure = error; break; }
        sent++;
      }
      // The database copies the exact timestamp: a JavaScript Date would drop its microseconds.
      await client.query("UPDATE notification_cursors SET last_recorded_at=(SELECT recorded_at FROM order_events WHERE id=$2),last_event_id=$2,updated_at=clock_timestamp() WHERE channel=$1", [CHANNEL, event.id]);
    }
    await client.query("COMMIT");
    if (failure) throw new JobError("TELEGRAM_SEND_FAILED", "Telegram notification failed; it is retried", { retryable: true, cause: failure });
    return { initialized: false, sent };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

/** Telegram Bot API sender. Errors carry the HTTP status only, never the token. */
export function telegramSender(input: { token: string; chatId: string; fetch?: typeof fetch }): NotificationSender {
  const request = input.fetch ?? fetch;
  return {
    async send(text) {
      const response = await request(`https://api.telegram.org/bot${input.token}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ chat_id: input.chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      });
      if (!response.ok) throw new Error(`Telegram send failed: ${response.status}`);
    },
  };
}

export function telegramConfig(env: Readonly<Record<string, string | undefined>>): { token: string; chatId: string } | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim(), chatId = env.TELEGRAM_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}
