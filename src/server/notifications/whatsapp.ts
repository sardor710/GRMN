import "server-only";
import type { Pool, PoolClient } from "pg";
import { enqueueJob, JobError } from "../operations/outbox.ts";
import type { JobHandler } from "../operations/outbox.ts";

// Staff order alerts over the WhatsApp Business Platform (Cloud API).
// - Checkout and payment capture call enqueueOrderAlerts inside their own transaction, so an alert
//   job exists only if the order change committed. One job per recipient: a failure for one number
//   never resends to the numbers that already got the message.
// - The worker sends an approved message template (business-initiated messages outside the 24-hour
//   customer window must be templates). The Cloud API has no idempotency key, so a response lost
//   after Meta accepted the message can produce one duplicate on retry (at-least-once).
// - Disabled when no WHATSAPP_* variable is set. Errors name the field, never the token.

export const WHATSAPP_ORDER_ALERT_KIND = "notifications.whatsapp.order";
export type OrderAlertEvent = "placed" | "paid";

type EnvironmentSource = Readonly<Record<string, string | undefined>>;
export interface WhatsAppConfig {
  accessToken: string; phoneNumberId: string; recipients: string[];
  templateName: string; templateLanguage: string; graphVersion: string;
}

const FIELDS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_NOTIFY_TO", "WHATSAPP_TEMPLATE_NAME", "WHATSAPP_TEMPLATE_LANG", "WHATSAPP_GRAPH_VERSION"] as const;
const MAX_RECIPIENTS = 10;
const SEND_TIMEOUT_MS = 10_000;
const MAX_PARAM = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalid = (field: string): never => { throw new Error(`Missing or invalid WhatsApp configuration: ${field}`); };

function required(source: EnvironmentSource, field: string, pattern: RegExp): string {
  const value = source[field]?.trim();
  return value && pattern.test(value) ? value : invalid(field);
}
function optional(source: EnvironmentSource, field: string, pattern: RegExp, fallback: string): string {
  const value = source[field]?.trim();
  if (value === undefined || value === "") return fallback;
  return pattern.test(value) ? value : invalid(field);
}

/** Returns null when WhatsApp alerts are off (no WHATSAPP_* set). A partial setup is an error. */
export function parseWhatsAppEnv(source: EnvironmentSource): WhatsAppConfig | null {
  if (FIELDS.every(field => !source[field]?.trim())) return null;
  const recipients = required(source, "WHATSAPP_NOTIFY_TO", /^[+\d\s,]+$/).split(",").map(entry => entry.replace(/[\s+]/g, "")).filter(Boolean);
  if (recipients.length === 0 || recipients.length > MAX_RECIPIENTS || recipients.some(entry => !/^[1-9]\d{7,14}$/.test(entry))) invalid("WHATSAPP_NOTIFY_TO");
  return {
    accessToken: required(source, "WHATSAPP_ACCESS_TOKEN", /^[A-Za-z0-9_\-.|]{20,1024}$/),
    phoneNumberId: required(source, "WHATSAPP_PHONE_NUMBER_ID", /^\d{5,32}$/),
    recipients: [...new Set(recipients)],
    templateName: optional(source, "WHATSAPP_TEMPLATE_NAME", /^[a-z0-9_]{1,512}$/, "order_alert"),
    templateLanguage: optional(source, "WHATSAPP_TEMPLATE_LANG", /^[a-z]{2,3}(_[A-Z]{2})?$/, "en"),
    graphVersion: optional(source, "WHATSAPP_GRAPH_VERSION", /^v\d{1,3}\.\d$/, "v23.0"),
  };
}

/**
 * Queues one alert job per configured recipient in the caller's transaction. No-op when disabled.
 * A broken WHATSAPP_* setup is logged (field name only) and skipped: alerts never block an order.
 */
export async function enqueueOrderAlerts(client: PoolClient, orderId: string, event: OrderAlertEvent, env: EnvironmentSource = process.env): Promise<number> {
  let config: WhatsAppConfig | null;
  try { config = parseWhatsAppEnv(env); } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid WhatsApp configuration");
    return 0;
  }
  if (!config) return 0;
  for (const to of config.recipients) {
    await enqueueJob(client, { kind: WHATSAPP_ORDER_ALERT_KIND, dedupeKey: `whatsapp:${event}:${orderId}:${to}`, payload: { orderId, event, to }, maxAttempts: 8 });
  }
  return config.recipients.length;
}

/** Template text parameters may not contain newlines, tabs or more than four spaces in a row. */
export function templateText(value: string): string {
  const flat = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  const text = flat.length > MAX_PARAM ? flat.slice(0, MAX_PARAM - 1) + "…" : flat;
  return text || "-";
}

export function formatKzt(minor: string): string {
  const value = BigInt(minor), negative = value < BigInt(0), abs = negative ? -value : value;
  const whole = (abs / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const cents = abs % BigInt(100);
  return `${negative ? "-" : ""}${whole}${cents === BigInt(0) ? "" : "." + cents.toString().padStart(2, "0")} ₸`;
}

export interface OrderAlertDetails {
  orderNumber: string; totalMinor: string; contactName: string; contactPhone: string | null;
  items: { name: string; quantity: number }[];
}

/** The five body parameters of the order_alert template, in order. */
export function orderAlertParameters(event: OrderAlertEvent, order: OrderAlertDetails): string[] {
  const items = order.items.map(item => `${item.quantity}× ${item.name}`).join("; ");
  return [
    event === "paid" ? "Order paid" : "New order",
    order.orderNumber,
    formatKzt(order.totalMinor),
    [order.contactName, order.contactPhone].filter(Boolean).join(", "),
    items,
  ].map(templateText);
}

async function loadOrder(pool: Pool, orderId: string): Promise<OrderAlertDetails | null> {
  const order = (await pool.query<{ order_number: string; total_minor: string; contact_name: string; contact_phone: string | null }>(
    "SELECT order_number,total_minor::text AS total_minor,contact_name,contact_phone FROM orders WHERE id=$1", [orderId])).rows[0];
  if (!order) return null;
  const items = (await pool.query<{ name: string; quantity: number }>(
    "SELECT name,quantity FROM order_items WHERE order_id=$1 ORDER BY name,id", [orderId])).rows;
  return { orderNumber: order.order_number, totalMinor: order.total_minor, contactName: order.contact_name, contactPhone: order.contact_phone, items };
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number }>;

/** Sends one template message. Throws a JobError: retryable for 429/5xx/network, final for other 4xx. */
export async function sendOrderAlert(config: WhatsAppConfig, to: string, parameters: string[], options: { signal?: AbortSignal; fetch?: FetchLike } = {}): Promise<void> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(SEND_TIMEOUT_MS)]) : AbortSignal.timeout(SEND_TIMEOUT_MS);
  const send = options.fetch ?? (fetch as unknown as FetchLike);
  let status: number;
  try {
    ({ status } = await send(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
        template: { name: config.templateName, language: { code: config.templateLanguage }, components: [{ type: "body", parameters: parameters.map(text => ({ type: "text", text })) }] },
      }),
      signal,
    }));
  } catch (error) {
    throw new JobError("WHATSAPP_UNREACHABLE", "WhatsApp API request failed", { cause: error });
  }
  if (status >= 200 && status < 300) return;
  if (status === 429 || status >= 500) throw new JobError("WHATSAPP_UNAVAILABLE", `WhatsApp API answered ${status}`);
  // 401/403: bad token or permissions; 400: unknown template, wrong parameter count, bad number.
  throw new JobError(status === 401 || status === 403 ? "WHATSAPP_UNAUTHORIZED" : "WHATSAPP_REJECTED", `WhatsApp API answered ${status}`, { retryable: false });
}

export const sendWhatsAppOrderAlert: JobHandler = async (job, ctx) => {
  const { orderId, event, to } = job.payload;
  if (typeof orderId !== "string" || !UUID.test(orderId) || (event !== "placed" && event !== "paid") || typeof to !== "string" || !/^[1-9]\d{7,14}$/.test(to))
    throw new JobError("INVALID_PAYLOAD", "The job names no valid order alert", { retryable: false });
  let config: WhatsAppConfig | null;
  try { config = parseWhatsAppEnv(process.env); } catch { config = null; }
  if (!config) throw new JobError("WHATSAPP_NOT_CONFIGURED", "WhatsApp alerts are not configured for the worker", { retryable: false });
  const order = await loadOrder(ctx.pool, orderId);
  if (!order) throw new JobError("NOT_FOUND", "The order no longer exists", { retryable: false });
  await sendOrderAlert(config, to, orderAlertParameters(event, order), { signal: ctx.signal });
  await ctx.complete();
};
