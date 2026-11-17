import "server-only";
import { expireDueReservations, withInventoryTransaction } from "../inventory/reservations.ts";
import type { ExpiryCursor } from "../inventory/reservations.ts";
import { expireDueCouponReservations } from "../pricing/coupons.ts";
import { PAYMENT_START_KIND } from "../checkout/service.ts";
import { PAYMENT_INBOX_KIND, expireUnpaidOrders, type OrderExpiryCursor, processInboxEvent, reconcilePayments, startPaymentSession } from "../payments/service.ts";
import { paymentProviders } from "../payments/providers.ts";
import { processRefunds } from "../fulfillment/aftersales.ts";
import { CONTENT_INVALIDATE_KIND } from "../content/publishing.ts";
import { cleanupOrphanMedia } from "../content/media.ts";
import { EXPORT_EXPIRE_KIND, EXPORT_GENERATE_KIND, expireExports, generateExport } from "../reports/exports.ts";
import path from "node:path";
import { JobError } from "./outbox.ts";
import type { ClaimedJob, JobHandler, JobHandlers } from "./outbox.ts";
import type { Schedule } from "./schedule.ts";

// Job kinds the production worker runs, keyed by job_runs.kind, and the periodic schedules that
// feed them. Task 12B adds reservation expiry (plan §11: cleanup begins within 60 s of expiry).

export const RESERVATION_EXPIRY_KIND = "inventory.reservations.expire";
const EXPIRY_BATCH = 200;
const EXPIRY_MAX_ROUNDS = 10;

// Each hold ends in its own short transaction inside expireDueReservations, and ending a hold that
// already ended is a no-op (stock_movements dedupes release:<line>), so overlapping runs and
// at-least-once delivery never release stock twice. The job is then completed with no further work.
// The sweep pages by keyset, so holds that fail (a busy row, drifted counters) never block the holds
// behind them, and it is bounded to EXPIRY_MAX_ROUNDS pages. A partial sweep still completes its
// slot: the next slot retries the failed holds, and the job metric reports holds overdue by more than
// the 60-second target (review I1/I2), instead of every slot dead-lettering for one stuck hold.
const expireReservations: JobHandler = async (_job, ctx) => {
  let after: ExpiryCursor | undefined;
  for (let round = 0; round < EXPIRY_MAX_ROUNDS && !ctx.signal.aborted; round++) {
    const result = await expireDueReservations(ctx.pool, { limit: EXPIRY_BATCH, after });
    if (result.checked < EXPIRY_BATCH || !result.cursor) break;
    after = result.cursor;
  }
  await ctx.complete();
};

// Task 14A: coupon holds (promotion_redemptions) made at checkout expire beside the stock holds.
// Each batch runs in its own short transaction; expiring an already-ended hold is impossible
// (status filter + SKIP LOCKED), so overlapping runs are safe.
export const COUPON_EXPIRY_KIND = "promotions.reservations.expire";
const expireCoupons: JobHandler = async (_job, ctx) => {
  for (let round = 0; round < EXPIRY_MAX_ROUNDS && !ctx.signal.aborted; round++) {
    const { expired } = await withInventoryTransaction(ctx.pool, client => expireDueCouponReservations(client, { limit: EXPIRY_BATCH }));
    if (expired < EXPIRY_BATCH) break;
  }
  await ctx.complete();
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function payloadId(job: ClaimedJob, field: string): string {
  const value = job.payload?.[field] ?? job.event?.payload?.[field];
  if (typeof value !== "string" || !UUID.test(value)) throw new JobError("INVALID_PAYLOAD", "The job names no valid " + field, { retryable: false });
  return value;
}

// Task 14B: consumer of order.placed (and of replacement attempts). The provider session is opened
// outside any transaction with the attempt's stable key; a lost response is retried by the job and
// reaches the same provider session. The demo adapter's session is simulated and labelled.
const startPayment: JobHandler = async (job, ctx) => {
  await startPaymentSession(ctx.pool, paymentProviders(), payloadId(job, "paymentAttemptId"));
  await ctx.complete();
};

// Task 14B: one verified inbox event; applying it and marking it processed is one transaction, so a
// worker that dies mid-way leaves the event queued and the retry applies it once.
const processInbox: JobHandler = async (job, ctx) => {
  await processInboxEvent(ctx.pool, paymentProviders(), payloadId(job, "inboxId"));
  await ctx.complete();
};

// Task 14B: ask real providers about attempts with no verified result (lost webhooks, a crash after
// a charge). Simulated providers are skipped.
export const PAYMENT_RECONCILE_KIND = "payments.reconcile";
const reconcile: JobHandler = async (_job, ctx) => {
  await reconcilePayments(ctx.pool, paymentProviders(), { olderThanMs: 60_000, limit: 100 });
  await ctx.complete();
};

// Task 14B: unpaid orders whose stock hold ended are cancelled (the order-level expiry policy).
export const ORDER_EXPIRY_KIND = "orders.unpaid.expire";
// Pages by keyset like the reservation sweep (review I5); failed orders are retried next slot.
const expireOrders: JobHandler = async (_job, ctx) => {
  let after: OrderExpiryCursor | undefined;
  for (let round = 0; round < EXPIRY_MAX_ROUNDS && !ctx.signal.aborted; round++) {
    const result = await expireUnpaidOrders(ctx.pool, { limit: EXPIRY_BATCH, after });
    if (result.failed > 0) console.error("Unpaid-order expiry failures", result.failures.map(failure => failure.code).join(","));
    if (result.checked < EXPIRY_BATCH || !result.cursor) break;
    after = result.cursor;
  }
  await ctx.complete();
};

// Task 16B: submit reserved refunds to their provider (outside any transaction) and retry pending or
// unknown ones with their stable keys. Only real providers are asked; the demo adapter has no captures.
export const REFUND_PROCESS_KIND = "payments.refunds.process";
const processRefundsJob: JobHandler = async (_job, ctx) => {
  const result = await processRefunds(ctx.pool, paymentProviders(), { limit: 100 });
  if (result.failed > 0) console.error("Refund processing failures", result.failed);
  await ctx.complete();
};

// Task 18A: publishing enqueues cache invalidation in the same transaction. Every public page is
// rendered per request today (force-dynamic), so there is no cache to purge yet; the job records the
// hand-off point for the cache layer Task 21A may add.
const invalidateContent: JobHandler = async (_job, ctx) => { await ctx.complete(); };

// Task 18A: archive unfinished and unreferenced editor uploads after a 24-hour grace period.
export const MEDIA_CLEANUP_KIND = "media.orphans.cleanup";
const cleanupMedia: JobHandler = async (_job, ctx) => {
  await cleanupOrphanMedia(ctx.pool, process.env.MEDIA_STORAGE_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_STORAGE_DIR) : path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "media"), { graceMs: 24 * 60 * 60 * 1000, limit: 500 });
  await ctx.complete();
};

// Task 18B: build one requested CSV export into a private file; sweep expired exports hourly.
const storageRoot = () => process.env.MEDIA_STORAGE_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_STORAGE_DIR) : path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "media");
const buildExport: JobHandler = async (job, ctx) => {
  await generateExport(ctx.pool, storageRoot(), payloadId(job, "exportId"), typeof job.payload.maxRows === "number" ? { maxRows: job.payload.maxRows } : {});
  await ctx.complete();
};
const sweepExports: JobHandler = async (_job, ctx) => {
  await expireExports(ctx.pool, storageRoot());
  await ctx.complete();
};

export { PAYMENT_INBOX_KIND, CONTENT_INVALIDATE_KIND, EXPORT_EXPIRE_KIND, EXPORT_GENERATE_KIND };
export const jobHandlers: JobHandlers = {
  [RESERVATION_EXPIRY_KIND]: expireReservations,
  [COUPON_EXPIRY_KIND]: expireCoupons,
  [PAYMENT_START_KIND]: startPayment,
  [PAYMENT_INBOX_KIND]: processInbox,
  [PAYMENT_RECONCILE_KIND]: reconcile,
  [ORDER_EXPIRY_KIND]: expireOrders,
  [REFUND_PROCESS_KIND]: processRefundsJob,
  [CONTENT_INVALIDATE_KIND]: invalidateContent,
  [MEDIA_CLEANUP_KIND]: cleanupMedia,
  [EXPORT_GENERATE_KIND]: buildExport,
  [EXPORT_EXPIRE_KIND]: sweepExports,
};

/**
 * RESERVATION_EXPIRY_INTERVAL_MS: 1000–60000, default 30000 (stock and coupon holds, and unpaid
 * orders whose holds ended). Payment reconciliation runs every 60 s. Errors name the field, never its value.
 */
export function jobSchedules(env: Readonly<Record<string, string | undefined>>): Schedule[] {
  const raw = env.RESERVATION_EXPIRY_INTERVAL_MS;
  const everyMs = raw === undefined ? 30_000 : /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(everyMs) || everyMs < 1000 || everyMs > 60_000) throw new Error("Missing or invalid worker configuration: RESERVATION_EXPIRY_INTERVAL_MS");
  return [{ kind: RESERVATION_EXPIRY_KIND, everyMs }, { kind: COUPON_EXPIRY_KIND, everyMs }, { kind: ORDER_EXPIRY_KIND, everyMs }, { kind: PAYMENT_RECONCILE_KIND, everyMs: 60_000 }, { kind: REFUND_PROCESS_KIND, everyMs: 60_000 }, { kind: MEDIA_CLEANUP_KIND, everyMs: 3_600_000 }, { kind: EXPORT_EXPIRE_KIND, everyMs: 3_600_000 }];
}
