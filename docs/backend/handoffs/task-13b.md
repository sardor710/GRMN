# Task 13B handoff: quotes, markdowns, coupons and USD display

**Status: complete, 2026-11-17**, including the review fix pass. Task 13 is complete. Task 14A is next.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `40a16cb` (13A). 13B is committed on the same branch; see `git log`.

No push, merge, deployment, real import or backend activation has been done. **Checkout is still not enabled.** The cart page's Checkout button stays disabled, and no UI calls the quote route yet; Task 14A wires it.

**No migration.** The 0002–0004 schema already had every table and guard 13B needs:
- `checkout_quotes`, immutable;
- `promotions`, `promotion_redemptions` and the redemption limit trigger;
- `price_adjustment_rules`;
- `exchange_rate_versions`, `tax_configuration` and the shipping policy, zone and rate tables. The rate, tax and shipping band rows are immutable (0004).

## Files

### New

- **`src/server/pricing/money.ts`** (pure bigint arithmetic):
  - `allocate(total, weights)` is a deterministic largest-remainder split. The parts always sum to the total; ties go to the earliest line.
  - `percentageOf` floors basis points.
  - `percentageHalfUp` rounds tax on the order total half up.
  - `parseKztPerUsd` is strict: a positive decimal with at most 12 integer and 8 decimal digits, and no sign, exponent or `NaN`.
  - `usdMinorFromKzt` divides KZT by the rate exactly, rounding half up.
- **`src/server/pricing/quote.ts`**:
  - **`priceCart(db, cart, request)`** prices a cart without writing:
    1. **Active KZT prices.** Every line must be offered, with enough free stock (409 `CART_NOT_QUOTABLE` otherwise).
    2. **Admin markdowns.** Active `price_adjustment_rules` in their window, scoped to all products, categories or variants. A line gets either the best single nonstackable rule or the sum of its stackable rules, whichever is larger, capped at the unit price. The selling unit price is the base price minus the markdown.
    3. **At most one coupon code.** It is normalised to trimmed lower case and checked for validity, window, scope, minimum spend on the eligible lines, and advisory global and per-user counts. A nonstackable coupon skips marked-down lines. The discount is allocated across the eligible lines by their net amount.
    4. **Active tax and shipping policy versions from `store_settings`.**
       - No active tax or shipping policy is 409 `POLICY_UNAVAILABLE`; there is no default tax.
       - Shipping is the cheapest matching band of the active policy in an active zone for the delivery country, and free above `free_shipping_threshold_minor`. No band is 409 `SHIPPING_UNAVAILABLE`.
       - A tax configuration scoped to a country prices only deliveries to that country.
       - Exclusive tax is rounded half up on goods net of discount, then allocated to lines. Inclusive tax is reported as `includedTax` and adds nothing.
    5. **Optional USD** from the active admin rate, only when `usd_display_enabled`. Without one, USD is null and KZT stays usable.
  - **`createQuote`** stores an immutable `checkout_quotes` row: `cart_version`, a `cart_hash`, the line snapshot, totals, and `usd_snapshot`. Quotes expire after 15 minutes. Its `policy_versions` hold:
    - `pricing`, a sha256 over line, price id/version and markdown rules;
    - `tax:vN`, `shipping:vN`, `promotion` (`id:vN`), the markdown rules and the exchange rate;
    - the full tax and shipping policy detail (ids, mode, rate, chosen band, zone, free-shipping threshold);
    - the coupon (id, code, version, discount) and the request.
  - **`revalidateQuote(client, { quoteId, cartId, cartVersion, checkoutAttemptId? })`** is checkout's guard:
    - The quote must belong to this unchanged, active cart revision (409 `QUOTE_STALE`) and be unexpired (409 `QUOTE_EXPIRED`).
    - A fresh pricing must match the stored lines, totals and policy detail (otherwise `QUOTE_STALE`). A 409 from pricing keeps its own code, for example `COUPON_EXHAUSTED`.
    - The attempt's own coupon hold is excluded from the counts, so a retry after reserving passes.
    - USD is display only: a rate change never invalidates a quote.
- **`src/server/pricing/coupons.ts`** (internal; runs inside the 14A checkout transaction):
  - **`reserveCouponQuota(client, { checkoutAttemptId, holdSeconds? })`**:
    - It locks the attempt, then the promotion, and checks the promotion version against the quote (409 `QUOTE_STALE`).
    - It expires this promotion's overdue holds with `SKIP LOCKED`, then inserts the hold. The 0003 trigger enforces the global and per-user limits against a fresh snapshot.
    - Trigger errors map to `COUPON_EXHAUSTED`, `COUPON_LIMIT_REACHED`, `COUPON_SIGN_IN_REQUIRED` or `COUPON_INVALID`.
    - Repeating it for the same attempt replays. Without a coupon it returns null.
  - **`consumeCouponQuota`, `releaseCouponQuota`, `expireDueCouponReservations`**:
    - The promotion is locked before the redemption row. The sweeper locks one promotion at a time, in id order.
    - Exactly one terminal transition wins. Consume after a release or expiry is 409 `COUPON_RESERVATION_ENDED`. Release after a terminal state is a no-op.
- **`src/app/api/cart/quote/route.ts`:** `POST /api/cart/quote` through the cart handler (same-origin writes, no query string, `no-store`, 503 outside PostgreSQL + auth mode).
- **Tests:** `tests/unit/pricing-money.test.mjs` (3) and `tests/integration/quotes-promotions.test.mjs` (16).

### Changed

- **`src/server/cart/service.ts`:** `quote(headers, input)`:
  - The input is strict: `cartVersion`, `displayCurrency` (KZT/USD), `delivery` (inline address, or a saved address the session owns at its version), an optional `couponCode`, and an optional `paymentCurrency`, which must be `KZT` (400 `UNSUPPORTED_CURRENCY` otherwise). Totals, prices, lines and currency fields are 400.
  - It locks the cart row, checks the version (409 `VERSION_CONFLICT`) and refuses an empty cart (409 `CART_EMPTY`).
  - A guest using a saved address is 401; another user's address is 404.
  - The new `quoteTtlSeconds` option sets the quote lifetime.
- **`src/server/cart/http.ts`:** the `quote` resource.
- **`src/contracts/commerce.ts`:**
  - `QuoteCommand.paymentCurrency`.
  - `QuoteLineDTO` gains `baseUnitPrice` and `includedTax`.
  - `CheckoutQuoteDTO` gains `payableCurrency: "KZT"`, `displayCurrency`, `includedTax` and `coupon`.
  - `policyVersions` gains `markdowns` and `exchangeRate`.
- **`tests/unit/cart-route.test.mjs`:** the quote route.

## Commands and results

All gates run from PowerShell in the worktree, one at a time.

| Gate | Result |
|---|---|
| RED: `pricing-money.test.mjs`, `cart-route.test.mjs` | failed on the missing module and the missing route file |
| RED: `quotes-promotions.test.mjs` (13 tests) | 13/13 failed ("Task 13B requires cart quotes", "requires src/server/pricing/money.ts") |
| RED: 3 review tests | failed: no tax/shipping detail in the snapshot; `QUOTE_STALE` on a retried revalidation; nine `40P01` deadlocks in the sweep/release/reserve test |
| `quotes-promotions.test.mjs` (final) | **16/16** |
| `npm test` (final) | **448/448**: 21 legacy + 161 unit + 266 integration; boundaries pass |
| `npm run check` | **exit 0**: 0 errors; typecheck clean; build compiled. It reported 24 warnings; the new one (an unused destructured name in `quote.ts`) was then removed. ESLint on `src/server/pricing` and `src/server/cart` and `tsc` were rerun clean, giving 23 warnings as before |
| Browser smoke `node --conditions=react-server tests/ui/cms-smoke.mjs` | **exit 0** on the first run (1.6 GB free RAM, `.next/dev` cleared first): PASS Task09 ×2, Task10C, Task13A, "Browser smoke passed". Log: `temp/13b-smoke.log` |

## Review

One read-only reviewer covered the slice and found no Critical issues. It confirmed that the arithmetic (allocation, half-up tax, inclusive tax, USD) is exact and reconciles.

The Important findings, re-graded:
1. **I1 — deadlock (fixed test-first).** Reserve locked the promotion and then redemptions. Consume, release and the sweeper locked a redemption and then the promotion through the trigger, which reproduced as 40P01. Every path now locks the promotion first. The sweeper goes one promotion at a time in id order, and the inline expiry uses `SKIP LOCKED`.
2. **I2 — retry fails revalidation (fixed test-first).** A retried checkout counted its own hold and failed. `revalidateQuote` now takes `checkoutAttemptId` and excludes that hold.
3. **I3 — the snapshot does not reproduce tax and shipping (fixed test-first).** The reviewer believed tax and shipping rows were mutable; they are immutable through 0004, and the tests prove it. Still, the free-shipping threshold lives in mutable `store_settings`, so the quote now stores the full tax and shipping policy detail, and revalidation compares it.
4. **I4 — no rate limit on quotes, coupon codes can be probed (deferred by ruling).** It belongs with the Task 21 rate and capacity work, like the 13A M9 rate limit on anonymous carts.
5. **I5 — revalidation hides the real 409 code (fixed test-first).** It now surfaces `COUPON_EXHAUSTED`, `CART_NOT_QUOTABLE` and the others.

### Deferred minors

- **M1:** a hold past its expiry can still be consumed until it is swept, and a replay reports it as `reserved`. It still counts against the quota, so the limit holds.
- **M2:** one attempt could hold redemptions for two promotions; the unique index is per (promotion, attempt). One coupon per quote makes this unreachable today.
- **M3:** lowering `usage_limit` below the outstanding holds makes their consumes fail with `COUPON_EXHAUSTED`. 14B must handle this after a capture (staff resolution).
- **M4:** the version strings omit the policy id (`tax:vN`). `version` is globally unique, and the full detail with ids is now in the snapshot.
- **Untested review gaps:** a markdown, coupon or policy-activation change between quote and revalidation, and a lowered limit before consume. Revalidation compares every one of these, but only a price change is tested.

## Rulings

- **Fail closed without policies.** No active tax or shipping policy means no quote (409 `POLICY_UNAVAILABLE`); there is no implicit zero tax (O03 is open). The owner configures them; the admin editors are Task 18B. If wrong, quotes need one seeded zero-rate policy.
- **Inclusive tax is informational.** The `checkout_quotes` check requires `total = subtotal − discount + shipping + tax`, so inclusive tax is reported as `includedTax`, and `tax_minor` is 0. If wrong, receipts need a schema field.
- **Shipping is untaxed, and weight bands are not modelled.** Only bands with `minimum_weight_grams = 0` apply, and the catalog has no weights. Revisit with O03.
- **Markdowns apply in quotes only.** The catalog and cart still show the active price, and the quote shows `baseUnitPrice` → `unitPrice`. There is no admin markdown UI before Task 18B, so no markdown can exist outside SQL.
- **Coupon policy:**
  - One coupon per quote, nonstackable by default; a nonstackable coupon skips marked-down lines.
  - Minimum spend counts only the eligible lines.
  - Guests cannot use a coupon with a per-customer limit (no verified guest identifier, per Section 6).
  - Quote-time counts are advisory; the trigger at reservation is authoritative.
- **No coupon sweeper job yet.** Overdue holds are expired lazily per promotion at reservation, and `expireDueCouponReservations` exists. 14A schedules it with the stock reservation expiry, once holds are created for real.
- **No UI in 13B.** The quote route exists for the 14A checkout UI.
- **Ledger.** As in 13A, the ledger is these handoff and progress docs, not the SDD workspace script.

## Exact next step

**Task 14A — idempotent checkout and pending order.**
1. Read the Task 14 section of the XL plan, Section 6 "Checkout, inventory, and payment", and decisions D03, D06 and O07 in `docs/backend/decisions.md`.
2. Read the internal APIs this task builds on:
   - `src/server/inventory/reservations.ts` (`reserveStock`, `withInventoryTransaction`);
   - `src/server/pricing/quote.ts` (`revalidateQuote` with `checkoutAttemptId`);
   - `src/server/pricing/coupons.ts`;
   - `src/server/operations/outbox.ts`;
   - the `checkout_attempts`, `orders` and `order_*` tables and triggers in `drizzle/0002`.
3. Build `createCheckout` in one transaction, in the plan's lock order (attempt, cart, promotion, stock):
   - claim the idempotency key;
   - `revalidateQuote`;
   - `reserveStock` and `reserveCouponQuota`;
   - write the snapshots from the quote and the pending order (`GRM-` sequence), the payment attempt, the outbox event and the idempotency result;
   - issue hashed guest status tokens.
   - Mark the cart converted.
   - Schedule `expireDueCouponReservations` beside the stock expiry.
4. Wire the checkout UI to `/api/cart/quote`, then checkout. Remove the fake success and clear-cart behaviour.
5. Payments stay the explicit demo adapter (14B). O07 (manual orders before real payment) is open, so do not describe orders as paid.
6. Run the gates from PowerShell, one at a time. Keep the smoke alone on the machine; if it shows "Next did not start" or stalls on `Compiling ...`, remove `.next/dev` and rerun. Do not round-trip source files through PowerShell `Get-Content`/`Set-Content`.

**STOP_AFTER is Task 22.**
