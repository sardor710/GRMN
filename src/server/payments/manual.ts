import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { FulfillmentStatus, OrderStatus, PaymentStatus, RefundDTO } from "../../contracts/commerce.ts";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { withInventoryTransaction } from "../inventory/reservations.ts";
import { createManualProvider } from "./manual-provider.ts";
import { confirmManualCapture } from "./service.ts";
import { readRefunds, refreshPayment } from "../fulfillment/aftersales.ts";

// Owner decision O07 (Task 21C): payment is confirmed manually by an admin.
//
// - The manual adapter is real money (simulated: false) in the live environment. It opens a local
//   session and nothing else: no webhooks, no lookups, and refunds are paid out by staff, so the
//   reconciliation and refund workers skip it.
// - Staff with payments:confirm (fresh MFA) confirm an order with a method, a reference, the amount
//   received and an optional note. The confirmation goes through the 14B capture path (a capture
//   transaction whose external id is the reference, stock and coupon consumed, order.paid), plus an
//   internal payment.manual_confirmed event and an audit entry, in one transaction.
// - Idempotent: the reference is the natural key. The same reference for the same order with the
//   same method and amount returns the original result; on another order it is REFERENCE_USED.
// - A refund of a manual capture is a manual refund (provider 'manual'). Staff with payments:refund
//   record the payout (method and reference) once the money is sent back; that completes it.

export { createManualProvider };
export const MANUAL_METHODS = ["bank_transfer", "kaspi", "cash"] as const;
export type ManualMethod = typeof MANUAL_METHODS[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");

/** References are compared without surrounding or repeated spaces and without case. */
export const normalizeReference = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
const reference = z.string().transform(normalizeReference).pipe(z.string().regex(/^[ -~]{1,120}$/));
const note = z.string().trim().min(1).max(1000);
const confirmInput = z.strictObject({
  orderId: z.string().regex(UUID), method: z.enum(MANUAL_METHODS), reference,
  amountMinor: z.string().regex(/^[1-9]\d{0,14}$/), note: note.optional(),
});
const refundInput = z.strictObject({ refundId: z.string().regex(UUID), method: z.enum(MANUAL_METHODS), reference, note: note.optional() });
function parse<T>(schema: z.ZodType<T, unknown>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

export interface ManualConfirmResultDTO {
  order: { id: string; version: number; status: OrderStatus; paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus };
  transactionId: string;
  replayed: boolean;
}

async function orderState(client: PoolClient, orderId: string): Promise<ManualConfirmResultDTO["order"]> {
  const row = (await client.query<{ id: string; version: number; order_status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus }>(
    "SELECT id,version,order_status,payment_status,fulfillment_status FROM orders WHERE id=$1", [orderId])).rows[0];
  return { id: row.id, version: row.version, status: row.order_status, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status };
}
const event = (client: PoolClient, orderId: string, type: string, actor: string, dedupeKey: string, visibility: "internal" | "customer", payload: Record<string, unknown>) => client.query(
  "INSERT INTO order_events(id,order_id,type,source,actor_user_id,dedupe_key,visibility,occurred_at,payload) VALUES($1,$2,$3,'staff',$4,$5,$6,clock_timestamp(),$7) ON CONFLICT (dedupe_key) DO NOTHING",
  [randomUUID(), orderId, type, actor, dedupeKey, visibility, JSON.stringify(payload)]);
const audit = (client: PoolClient, actor: string, action: string, targetType: string, targetId: string, dedupeKey: string, changes: Record<string, unknown>) => client.query(
  "INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,$3,$4,$5,$6,$7)",
  [randomUUID(), actor, action, targetType, targetId, dedupeKey, JSON.stringify(changes)]);

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }

export function createManualPaymentService({ pool, authorize }: Options) {
  const provider = createManualProvider();
  return {
    /** Confirms a manual payment for an order awaiting payment (see the module comment). */
    async confirm(headers: Headers, input: unknown): Promise<ManualConfirmResultDTO> {
      const principal = await authorize(headers, "payments:confirm");
      const command = parse(confirmInput, input);
      return withInventoryTransaction(pool, async client => {
        const result = await confirmManualCapture(client, provider, { ...command, actorUserId: principal.userId });
        if (!result.replayed) {
          const details = { method: command.method, reference: command.reference, amountMinor: command.amountMinor, note: command.note ?? null, transactionId: result.transactionId };
          await event(client, command.orderId, "payment.manual_confirmed", principal.userId, `manual-confirmed:${result.transactionId}`, "internal", details);
          await audit(client, principal.userId, "payment.manually_confirmed", "order", command.orderId, `manual-confirmed-audit:${result.transactionId}`, { ...details, outcome: result.outcome });
        }
        return { order: await orderState(client, command.orderId), transactionId: result.transactionId, replayed: result.replayed };
      });
    },

    /** Records that staff paid a manual refund back to the customer, which completes it. */
    async completeRefund(headers: Headers, input: unknown): Promise<{ refund: RefundDTO; replayed: boolean }> {
      const principal = await authorize(headers, "payments:refund");
      const command = parse(refundInput, input);
      try {
        return await withInventoryTransaction(pool, async client => {
          const orderId = (await client.query<{ order_id: string }>("SELECT order_id FROM refunds WHERE id=$1", [command.refundId])).rows[0]?.order_id ?? notFound();
          // Lock order: checkout attempt, order, then the refund row (Task 16B).
          const checkoutAttempt = (await client.query<{ checkout_attempt_id: string | null }>("SELECT checkout_attempt_id FROM orders WHERE id=$1", [orderId])).rows[0];
          if (checkoutAttempt?.checkout_attempt_id) await client.query("SELECT 1 FROM checkout_attempts WHERE id=$1 FOR UPDATE", [checkoutAttempt.checkout_attempt_id]);
          await client.query("SELECT 1 FROM orders WHERE id=$1 FOR UPDATE", [orderId]);
          const refund = (await client.query<{ provider: string; status: RefundDTO["status"]; provider_refund_id: string | null; amount: string }>(
            "SELECT provider,status,provider_refund_id,amount_minor::text AS amount FROM refunds WHERE id=$1 FOR UPDATE", [command.refundId])).rows[0];
          if (refund.provider !== "manual") fail("REFUND_NOT_MANUAL", 409, "Only manual refunds are paid out by staff");
          const one = async () => (await readRefunds(client, orderId)).find(row => row.id === command.refundId)!;
          if (refund.status === "succeeded") {
            if (refund.provider_refund_id === command.reference) return { refund: await one(), replayed: true };
            fail("REFUND_ALREADY_COMPLETED", 409, "This refund was already paid out");
          }
          if (!["reserved", "pending", "unknown"].includes(refund.status)) fail("REFUND_NOT_OPEN", 409, "This refund is no longer open");
          if ((await client.query("SELECT 1 FROM refunds WHERE provider='manual' AND environment='live' AND merchant_account='manual' AND provider_refund_id=$1", [command.reference])).rowCount)
            fail("REFERENCE_USED", 409, "This payout reference was already used");
          await client.query("UPDATE refunds SET status='succeeded',provider_refund_id=$2,version=version+1,updated_at=now() WHERE id=$1", [command.refundId, command.reference]);
          await refreshPayment(client, orderId);
          const details = { refundId: command.refundId, method: command.method, reference: command.reference, amountMinor: refund.amount, note: command.note ?? null };
          await event(client, orderId, "refund.manually_completed", principal.userId, `refund-manual:${command.refundId}`, "internal", details);
          // The same customer-visible event (and report timestamp key) as a provider refund (16B, 18B).
          await event(client, orderId, "refund.succeeded", principal.userId, `refund-succeeded:${command.refundId}`, "customer", { refundId: command.refundId, amountMinor: refund.amount });
          await audit(client, principal.userId, "refund.manually_completed", "refund", command.refundId, `refund-manual-audit:${command.refundId}`, { orderId, ...details });
          return { refund: await one(), replayed: false };
        });
      } catch (error) {
        // Two payouts racing with one reference: the unique index decides.
        if ((error as { code?: unknown; constraint?: unknown } | null)?.code === "23505" && (error as { constraint?: unknown }).constraint === "refunds_provider_unique")
          fail("REFERENCE_USED", 409, "This payout reference was already used");
        throw error;
      }
    },
  };
}
export type ManualPaymentService = ReturnType<typeof createManualPaymentService>;
