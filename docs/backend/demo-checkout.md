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
- **A failed capture never loses the order.** The capture runs after the checkout commits (the deferred
  seal check fires at commit). If it fails, checkout logs the order id and error code and still returns the
  order, `pending_payment` and demo, instead of an error. The order is recovered in one of two ways:
  - a same-key retry replays it and captures it once;
  - if nobody retries, the unpaid-order sweep cancels it when its stock hold ends, cancels the attempt and
    releases the stock (`order.expired`). A later retry then replays the cancelled order and never captures.
- **Not paid when nothing can ship.** If a demo capture finds its hold ended and no stock left, `capture()`
  records the fact, cancels the order as a fulfilment exception and requests a refund, as for real money.
  For demo that refund is settled at once with a `demo-refund:<id>` reference, because the refund worker
  never submits simulated providers. Capture-time and staff demo refunds settle through one helper,
  `settleDemoRefund` (`src/server/payments/demo-refund.ts`, F-b): succeeded, `demo-refund:<id>`, version bump,
  exactly one demo row or 409 `REFUND_NOT_SETTLED`, the caller's payment-summary rule, then the customer
  `refund.succeeded` event (`demo: true`, dedupe `refund-succeeded:<id>`). The order ends `cancelled/refunded/exception`, and
  `confirmDemoCapture` answers `DEMO_CAPTURE_NOT_PAID` (409) rather than reporting `paid`.
- **Only demo orders.** `confirmDemoCapture` refuses anything but a demo order's own demo attempt
  (`PAYMENT_NOT_DEMO`, 409), and only while the order still awaits payment for exactly its total. The
  database guard (`payments_guard_attempt`, replaced in 0021) still ties a demo attempt to a demo order and
  its total, and now allows it to end `captured`; it never allows the real-money states (authorized,
  unknown, late_captured, superseded).
- **Abuse cap (final review I1).** Because a demo order captures like a paid one (it consumes on_hand stock
  and limited promo uses and sends a Telegram alert), one customer or guest session (the checkout actor scope),
  and one trusted client address, may place at most `DEMO_ORDER_LIMIT` demo orders in 24 hours (follow-up F-b;
  env, read on every demo checkout through `readDemoOrderLimit` in `src/server/config/env.ts`: a whole number,
  unset or empty = 5, `0` = no cap, anything else falls back to 5 and is logged once per value). Every demo
  order counts, whatever became of it. **Staff are exempt:** when the checkout actor is a signed-in user with
  a staff role (the auth foundation's own staff definition, `user_roles`; `requirePrincipal` has already
  refused a staff session that is not MFA-admitted), nothing is locked or counted. Staff demo orders still
  count towards their address, so heavy staff testing from a shared office address can use up that address's
  allowance for customers on it.
  The check runs inside the checkout transaction after the cart lock, under the same transaction-scoped
  advisory locks as the manual unpaid-order limit (scope first, then address), so concurrent checkouts cannot
  pass it together. Over the cap checkout answers 429 `TOO_MANY_DEMO_ORDERS` with a readable message, and
  nothing is claimed, held or consumed. Without a trusted proxy header (development) only the scope is capped.
- **No capture after demo is turned off (final review M5).** A same-key replay of a demo order that is still
  `pending_payment` (its capture failed) is returned as is, never captured, while demo checkout is off (the
  setting or `DEMO_CHECKOUT_DISABLED=1`). The unpaid-order sweep cancels it when its hold ends.
- **Staff writes unchanged.** Shipments, refunds and cancellations keep their permissions (`orders:fulfill`,
  `payments:refund`), idempotency keys, expected versions and audit entries. Manual confirmation still
  refuses demo orders (`PAYMENT_NOT_MANUAL`).

## Labels (Task 3.3)

- **Checkout.** While demo is on, the button reads "Pay (demo)" with one line under it: "Demo payment — no money
  is charged." The manual payment notice is not shown. If the setting changes while checkout is open, the
  server answers `PAYMENT_METHOD_UNAVAILABLE`; the panel re-reads the cart (every cart response carries
  `paymentMethods`) and shows the localised `Checkout.methodChanged` message.
- **Receipt.** A demo order shows a DEMO badge. If its capture failed (still `pending_payment`), the receipt says
  "Payment not completed" with "Try again", which resends the same checkout with the same idempotency key.
  The key is kept in session storage only while the order still needs that retry.
- **Account.** `OrderSummaryDTO.paymentMode` labels demo orders DEMO in the order history and detail.
- **Admin.** Orders has a Payment filter (All, Demo, Live; `GET /api/admin/orders?paymentMode=demo|live`) and a
  DEMO badge in the queue and the order detail, so stray demo orders can be found and cancelled.
- **Exports.** The order CSV has a `payment_mode` column (`demo`, `live`, `legacy_unknown`). No UI, DTO or export
  adds demo totals to real ones.
- **Cutover.** Turn demo checkout off before the cutover rehearsal (`docs/backend/cutover-runbook.md`, A5).

## Tests

`tests/integration/demo-checkout.test.mjs` covers:

- the setting (Task 3.1);
- the four Task 3.2 cases: paid with stock consumed; one capture on a repeated attempt; shipped, delivered and
  refunded; demo refunds never reach a live provider and stay out of the revenue report;
- the recovery paths: a capture that fails after commit still returns the order, its demo session starts with
  demo provenance, and a same-key retry captures it once; an unpaid demo order is cancelled by the sweep with
  its stock released; a capture with no stock left is cancelled, its demo refund settled, and it is not
  reported paid;
- the abuse cap: the sixth demo order of a customer in 24 h is refused (429) and holds nothing, older orders
  stop counting, and seven customers racing on one address get exactly five orders through;
- `DEMO_ORDER_LIMIT` (F-b): `2` allows exactly two per customer and per address, `0` lets seven through, an
  invalid value falls back to 5 with a warning, and a staff session (through the cart service, as the route
  calls it) places more than the limit while a customer over it still gets 429
  (`tests/unit/demo-order-limit.test.mjs` pins the parsing);
- a same-key replay of a pending demo order is not captured while demo is off.

`tests/integration/fulfillment.test.mjs` pins that a demo order with no capture fact, even forced to paid,
cannot ship.
