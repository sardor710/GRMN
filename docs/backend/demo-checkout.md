# Demo checkout

Date: 2026-11-19. Owner decisions: "Demo checkout" store setting (Task 3.1) and "full demo" (Task 3.2).

## What it is

- `store_settings.payment_mode='demo'` is the **Demo checkout** setting (Settings -> Payments). It is on by
  default on every environment, production included, until launch. `DEMO_CHECKOUT_DISABLED=1` forces it off.
- While demo is on, checkout offers only the simulated `demo` method and refuses the real-money `manual`
  method. While it is off, checkout offers only `manual`. The two are never offered in the same checkout
  (`availablePaymentMethods`, `PAYMENT_METHOD_UNAVAILABLE` before anything is claimed or reserved).

## Change to D03 (Task 3.2, "full demo")

D03 used to say a demo order could never become paid: the demo adapter never captured, never refunded,
and fulfillment refused unpaid demo orders. The owner chose **full demo** instead: a demo purchase
behaves exactly like a paid order so the whole store can be tried end to end before launch.

A demo order now:

1. is placed like any order (stock and coupon held, sealed snapshot, `order.placed`);
2. is captured in the same request right after the order is sealed and committed
   (`confirmDemoCapture`, `src/server/payments/service.ts`), through the same `capture()` as a webhook or a
   staff manual confirmation: the stock hold and coupon quota are consumed, the order becomes
   `confirmed/paid`, the attempt `captured`, and the same `payment.captured` and `order.paid` order events
   are written, so the notification channels that read `order_events` (the Telegram order alerts, and WhatsApp alerts
   when that channel is configured and reads the same events) announce it;
3. is fulfilled like a paid order: shipments go processing -> shipped -> delivered;
4. is refundable and cancellable: a refund (or the refund of a paid cancellation) is settled at once
   (`settleDemoRefund`, `src/server/fulfillment/aftersales.ts`) and the payment summary moves to
   `partially_refunded` / `refunded` with the customer-visible `refund.succeeded` event.

## Guardrails

- **Always labelled demo.** The order keeps `payment_mode='demo'`; its attempt, capture and refunds carry
  provider, environment and merchant account `demo` (CHECKs widened by migration 0021). The capture's
  evidence records `provenance.simulated=true`. Checkout returns `paymentMode:"demo"` and
  `paymentState:"simulated"`; staff notifications add `[DEMO]` to every message about a demo order.
- **Never real money.** The revenue report leaves out every capture and refund in the `demo` environment, so
  demo amounts are never added to live (or sandbox) totals. Order exports keep the `payment_mode` column.
- **Never a live provider.** The demo adapter has no webhooks (simulated providers are refused before the
  body is read), reconciliation skips it, and a demo refund is settled locally with a `demo-refund:<id>`
  reference. The refund worker only submits open refunds of real, non-manual providers, and a demo refund is
  never open after its transaction, so no demo refund is ever sent anywhere.
- **Exactly once.** The capture's external id is `demo-capture:<paymentAttemptId>` and the checkout key
  replays the same order, so a retry, a double click or a crash between commit and capture records one
  capture and consumes stock once.
- **Only demo orders.** `confirmDemoCapture` refuses anything but a demo order's own demo attempt
  (`PAYMENT_NOT_DEMO`, 409), and only while the order still awaits payment for exactly its total. The
  database guard (`payments_guard_attempt`, replaced in 0021) still ties a demo attempt to a demo order and
  its total, and now allows it to end `captured`; it never allows the real-money states (authorized,
  unknown, late_captured, superseded).
- **Staff writes unchanged.** Shipments, refunds and cancellations keep their permissions (`orders:fulfill`,
  `payments:refund`), idempotency keys, expected versions and audit entries. Manual confirmation still
  refuses demo orders (`PAYMENT_NOT_MANUAL`).

## Tests

`tests/integration/demo-checkout.test.mjs`: the setting (Task 3.1) and the four Task 3.2 cases (paid and
stock consumed, one capture on a repeated attempt, shipped/delivered/refunded, demo refunds never reach a live
provider and stay out of the revenue report).
