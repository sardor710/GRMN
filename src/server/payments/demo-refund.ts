import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AuthFailure } from "../auth/config.ts";
import { demoRefundId } from "./demo.ts";

// Follow-up F-b (item 8): the one place a demo refund is settled. Two callers reserve a `refunds` row
// for a demo capture and settle it at once, inside their own transaction, because the refund worker
// never submits a simulated provider's refund:
//  - payments/service.ts, when capture() asks for a refund of a demo capture that does not pay for the
//    order (an allocation exception, a late or duplicate capture);
//  - fulfillment/aftersales.ts, when staff refund or cancel a paid demo order.
// Imports only leaf modules (auth config, demo provider) so both layers can use it without a cycle.

export interface DemoRefundSettlement {
  orderId: string;
  refundId: string;
  amountMinor: string;
  /** order_events.source of the customer's refund.succeeded event ("staff", "payments", ...). */
  source: string;
  /** The staff user who caused it, or null for a system path (capture). */
  actorUserId: string | null;
  /**
   * Brings the order's payment summary up to date after the refund succeeded. The caller owns the rule:
   * a refund of the paying capture moves it to partially_refunded or refunded, a refund of a capture
   * that never paid moves it to refunded only when no other capture still pays.
   */
  refreshPaymentSummary: (client: PoolClient, orderId: string) => Promise<void>;
}

/**
 * Settles one reserved demo refund: status succeeded, provider_refund_id `demo-refund:<id>`, version
 * bump; exactly one demo row must change (else 409 REFUND_NOT_SETTLED, rolling the caller back); then
 * the order payment summary, then the customer-visible `refund.succeeded` event (payload demo:true,
 * dedupe key `refund-succeeded:<refundId>`). Only a row reserved with demo provenance (provider,
 * environment and merchant account 'demo') can be settled here.
 */
export async function settleDemoRefund(client: PoolClient, input: DemoRefundSettlement): Promise<void> {
  const settled = await client.query(
    "UPDATE refunds SET status='succeeded',provider_refund_id=$2,version=version+1,updated_at=now() WHERE id=$1 AND status='reserved' AND provider='demo' AND environment='demo' AND merchant_account='demo'",
    [input.refundId, demoRefundId(input.refundId)]);
  if (settled.rowCount !== 1) throw new AuthFailure("REFUND_NOT_SETTLED", 409, "The demo refund could not be settled");
  await input.refreshPaymentSummary(client, input.orderId);
  // The rowCount guard above lets each refund reach this insert once; ON CONFLICT only keeps a
  // replayed dedupe key from aborting the transaction.
  await client.query(
    "INSERT INTO order_events(id,order_id,type,source,actor_user_id,dedupe_key,visibility,occurred_at,payload) VALUES($1,$2,'refund.succeeded',$3,$4,$5,'customer',clock_timestamp(),$6) ON CONFLICT (dedupe_key) DO NOTHING",
    [randomUUID(), input.orderId, input.source, input.actorUserId, `refund-succeeded:${input.refundId}`, JSON.stringify({ refundId: input.refundId, amountMinor: input.amountMinor, demo: true })]);
}
