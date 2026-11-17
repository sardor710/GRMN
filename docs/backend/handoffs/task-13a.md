# Task 13A handoff: server cart, login merge and wishlist

**Status: complete, 2026-11-17**, including the review fix pass. Task 13B is next.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `4fe08d2` (12B). 13A is committed on the same branch; see `git log`.

No push, merge, deployment, real import or backend activation has been done. **Real checkout is not enabled**: the cart page's Checkout button is disabled in PostgreSQL mode, and product `purchasable` still means checkout.

## Files

### New

- **`drizzle/0010_cart-price-snapshots.sql`** (+ `meta/0010_snapshot.json`): `cart_items.seen_unit_price_minor bigint` with a `>= 0` check. It is the KZT unit price the shopper last saw, used only for price-change notices.
- **`src/server/cart/service.ts`** — `createCartService({ database, secret, identify, market? })`:
  - **Actor.** `identify(headers)` returns the principal or null. A 401 means guest; any other auth failure (for example staff without MFA) propagates. The guest capability is the `grmn-cart` cookie: 32 random bytes, base64url, 43 characters. Only `HMAC-SHA256(secret, "grmn-cart-capability:v1:" + token)` is stored in `carts.guest_token_hash`.
  - **Which cart.** A signed-in shopper always uses the active account cart for `(user, market, KZT)`. A guest cart is found only by its digest with `user_id IS NULL AND status='active'`. An expired cart is retired (`status='expired'`) under its lock before a new one is created, so `carts_active_user_unique` never collides.
  - **Writes** (`addLine`, `setLine`, `clear`, `acknowledge`) lock the cart row, check `expectedCartVersion`, then bump `version` and slide `expires_at` (guest 30 days, account 90 days). Creating a cart counts as version 1. A concurrent first write for one account loses with 409.
  - **Limits.** A line holds 1–99. A cart holds at most 100 lines (409 `CART_LIMIT`, with the deferred 0002 trigger as backstop). An increase needs the variant to be available with enough free stock (409 `OUT_OF_STOCK`). A decrease or removal is always allowed.
  - **Offers.** One SQL read per call decides eligibility: published product, active complete variant, active KZT price in the market. It also reads free stock across live locations. A malformed id is 400. An unknown, draft, unpublished or unpriced variant is 404. Names and prices never come from the client; strict schemas reject extra fields.
  - **View.** Each view re-reads the current price. An unavailable line has `unitPrice: null` and an `item_unavailable` notice, and is excluded from the subtotal. When the seen price differs from the current one, the line carries `previousUnitPrice` and a `price_changed` notice until `acknowledge`. The subtotal is BigInt over available lines only.
  - **`merge(headers)`** needs a session (401 otherwise):
    - It locks the guest cart, then the account cart. Every other path locks one cart, so there is no lock cycle.
    - It adds the guest quantities, capped at 99 (`quantity_adjusted` notice), and drops lines whose variant is no longer offered (`item_unavailable`).
    - It sets the guest cart to `status='merged'` with `merged_into_cart_id`.
    - Retries and concurrent calls find the guest cart no longer active and add nothing. That holds for any user, so a replayed capability never adds to someone else's cart. The cookie is cleared.
  - **`importLegacy(headers, { items: [{ id, quantity }] })`** is the one-time localStorage import:
    - At most 100 items. An id is a variant UUID or a product key, which resolves to the default active variant.
    - Unresolvable ids are reported as `item_unavailable` notices.
    - A repeated import keeps the larger quantity, so a retry never doubles a line.
  - **`getCart`** never writes. It reports `pendingMerge` when a signed-in shopper still holds an active guest capability, and asks to clear a dead guest cookie.
- **`src/server/cart/http.ts`, `src/server/cart/runtime.ts`** and routes `src/app/api/cart/{route.ts, lines/route.ts, lines/[variantId]/route.ts, merge/route.ts, import/route.ts, acknowledge/route.ts}`:
  - GET and DELETE `/api/cart`; POST `/api/cart/lines`; PUT and DELETE `/api/cart/lines/{variantId}`; POST `/merge`, `/import` and `/acknowledge`.
  - Writes need an exact same-origin `Origin`. Any query string is 400. Responses are `no-store`.
  - The cookie is set with `HttpOnly; SameSite=Lax; Path=/api/cart; Max-Age=30d`, plus `Secure` on an https base URL. It is cleared with `Max-Age=0`.
  - The routes return 503 outside PostgreSQL + auth mode.
- **`src/server/wishlist/service.ts`** — `createWishlistService({ database, authorize, market? })`:
  - `list`, `add({ productKey })` and `remove(productKey)`. The owner is the session principal. Membership is unique per `(wishlist, product)`.
  - Add and remove are idempotent. Adding a product that is not published is 404. At most 200 items (409 `WISHLIST_LIMIT`).
  - An archived product stays listed with `archived: true`, `availability: "unavailable"` and `price: null`.
- **`src/app/api/account/wishlist/route.ts`** (GET, POST) and **`wishlist/[id]/route.ts`** (DELETE) bind the account handler.
- **`src/lib/cart-client.ts`** — the browser client and **`createCartController`**, the state machine behind `CartProvider`:
  - It falls back to the browser-only cart **only** on a 503. Any other failure stays in server mode with an error, so a PostgreSQL deployment never shows the demo checkout.
  - Writes wait for the initial load, so an early Add to Cart is not lost.
  - Concurrent `start`/`refresh` calls share one sync. A remounted provider (StrictMode) used to create two guest carts.
  - The stored cart is removed only after a successful import. A pending merge always runs, even after an import.
  - After a `VERSION_CONFLICT` the cart reloads. Only a relative change (add) is retried, and only on the same cart. A different cart (for example after sign-in) is merged if needed and shown instead.
  - `announceSessionChange()` and `cartBadgeCount()`. The badge is 0 while loading, so the server and client renders match.
- **`docs/backend/account-tab-dispositions.md`** — the disposition list for the other account domains: devices, warranty, subscriptions and support are preserved and deferred, with no fake records.
- **Tests:**
  - `tests/integration/cart-wishlist.test.mjs` (9 tests).
  - `tests/unit/cart-route.test.mjs` (1), `tests/unit/cart-client.test.mjs` (3), `tests/unit/cart-view.test.mjs` (2), `tests/unit/cart-controller.test.mjs` (8).

### Changed

- **`src/contracts/commerce.ts`:** `CartAddCommand`, `CartLineCommand` (quantity only), `CartImportCommand`, `CartNoticeCode`. `CartLineDTO` gains `variantName`, `image`, nullable `unitPrice`/`lineTotal` and `previousUnitPrice`. `CartDTO` gains `owner` and `pendingMerge`, and `id`/`expiresAt` are nullable. `WishlistItemDTO` was unused and is now a flat product summary.
- **`src/server/db/schema/commerce.ts`:** the `seenUnitPriceMinor` column and its check.
- **`src/server/account/http.ts` and `runtime.ts`:** the `wishlist` resource.
- **`src/lib/cart.tsx`:** `CartProvider` now delegates to the controller and re-syncs on `grmn:session-changed`. Legacy mode still uses the browser-only cart.
- **`src/components/CartView.tsx`:** in server mode it shows KZT server totals, price-change, adjusted and unavailable notices, an "Accept new prices" button, and a disabled Checkout with "Online checkout is not available yet". Legacy mode is unchanged.
- **`src/components/ProductTop.tsx`:** in server mode the button follows the selected variant's real availability ("Out of stock" when it has none) and adds by exact `variantId`. It also has "Save to Wishlist" (401 → "Sign in to save items").
- **`src/components/AccountDashboard.tsx` and `src/lib/account-client.ts`:** a Wishlist tab (list, archived marking, remove). Sign-in, profile completion and sign-out call `announceSessionChange()`.
- **Tests:** `tests/unit/auth-entrypoints.test.mjs` adds the wishlist routes. `tests/unit/account-dashboard.test.mjs` adds 3 tests. `tests/unit/catalog-ui.test.mjs` adds 1.
- **`tests/ui/cms-smoke.mjs`:** a Task 13A block, plus a page dump if `/admin/products` fails to load.
  - A guest's stored cart is imported once and the key removed.
  - Add to Cart reaches quantity 3 in the guest server cart, and the capability cookie is HttpOnly.
  - `/cart` shows 7,500.00 KZT, never the forged name, and survives a reload. Checkout is disabled.
  - Sign-in merges into the account cart and retires the guest cart.
  - Save to Wishlist works, and the account Wishlist tab lists the product.

## Commands and results

All gates run from PowerShell in the worktree.

| Gate | Result |
|---|---|
| RED: `cart-wishlist.test.mjs` before the services existed | 8 fail with "Task 13A requires the cart/wishlist service" |
| RED: route, client, view, dashboard and controller unit tests | each failed on the missing module, route or behaviour before its fix |
| `npm test` (final) | **429/429**: 21 legacy + 158 unit + 250 integration; boundaries pass |
| `npm run check` (final) | **exit 0**: lint 0 errors, 23 warnings (unchanged); typecheck clean; build compiled |
| Browser smoke `node --conditions=react-server tests/ui/cms-smoke.mjs` | **exit 0**: PASS Task09 ×2, Task10C, **Task13A**, "Browser smoke passed". Log: `temp/backend-next-three/08/task-13a-smoke.log` |

**Smoke history.** The machine had about 0.8 GB of free RAM. The first eight runs failed on environmental timeouts at a different page each time: CDP navigate after 30 s, a Postgres connection timeout in `generateStaticParams`, and "Next did not start" from a stale `.next/dev`. A diagnostic dev server in legacy mode had shared and poisoned that cache. After the owner freed memory (1.4–2 GB free), the runs reached 13A and found three real client bugs, each fixed test-first: the badge hydration mismatch, `purchasable:false` blocking Add to Cart, and duplicate guest carts from the StrictMode double start. There was also one test bug: `innerText` is uppercased by CSS. **If the smoke stalls or says "Next did not start", remove `.next/dev`, make sure other dev servers are not starving memory, and rerun. Never run the build or another dev server between smoke runs without clearing `.next/dev`.**

## Review

One read-only reviewer covered the whole slice and found no Critical issues. Its three Important findings were all in the client provider, and each was fixed test-first in `tests/unit/cart-controller.test.mjs` and `account-dashboard.test.mjs`:
1. An Add to Cart during loading was lost. Writes now wait for the load.
2. After an in-page sign-in, the provider kept the guest cart and the conflict retry replayed absolute changes onto the account cart. Sign-in and sign-out now announce a session change, and the provider re-syncs and merges. A conflict on a different cart shows that cart instead of retrying, and only adds are retried.
3. Any error fell back to the local demo cart. Now only a 503 does.

### Deferred minors

- M1 (`pendingMerge` lost after an import) was fixed in passing by the controller, which keeps the `get` result's flag.
- M2: changing a line's quantity silently accepts a price change, because `writeLine` refreshes the seen price.
- M3: the guest cookie's 30-day `Max-Age` does not slide with the cart's `expires_at`. Re-issue it on guest writes.
- M4: import notices for unresolvable ids carry the raw id in `variantId`.
- M5: the import resolves items with sequential pool queries (up to about 200 round trips). Batch them.
- M6: import and merge accept quantities above free stock. Such lines show "Out of stock" and are excluded from the subtotal.
- M7: "−" on an unavailable line returns 404. Remove still works.
- M8: the wishlist's availability predicate differs from the cart's (complete-options check, `GREATEST(...,0)`). Share one predicate.
- M9: there is no sweeper for expired carts and no rate limit on anonymous cart creation. Belongs with the Task 21 rate/capacity work.
- M10: wishlist calls are duplicated in `cart-client.ts` and `account-client.ts`, and `ProductTop` builds a client per click.

The reviewer's untested areas are also deferred, with no defect known: expired-cart retirement, concurrent first add for one account, the 100-line limit, wishlist over HTTP (403/400, 200-item limit) and the in-page sign-in path in the browser smoke.

## Rulings

- **Guest capability, not a session.** A guest cart is a 256-bit capability in an HttpOnly cookie scoped to `/api/cart`, stored as an HMAC digest (as for other capabilities). It costs nothing if wrong: rotating the secret only orphans guest carts.
- **Merge adds; import keeps the larger.** A merge sums the quantities once, guarded by the guest status. An import takes the maximum so that a retry is idempotent. If wrong, a shopper who expected a sum on import sees the larger count.
- **No business quantity limit beyond the DB constraints** (99 per line, 100 lines). Stock caps increases only. An owner limit would be a one-line change.
- **Seen-price migration (0010)** rather than a client-held price: the notice must survive reloads and devices, and the client is not trusted. This added one nullable column.
- **`purchasable` keeps its Task 09 meaning (checkout).** Add to Cart in server mode follows variant availability instead. Checkout stays off until Task 14.
- **Wishlist DTO reshaped.** The old `WishlistItemDTO` embedded a full `ProductCardDTO` and had no users. It now carries only the fields the list needs, and it shows archived products.
- **Ledger.** This repo's ledger is the handoff and progress docs, not the SDD workspace script.

## Exact next step

**Task 13B — quotes, markdowns, coupons and USD display.**
1. Read the Task 13 section of the XL plan (13B), decisions D08 and D11 in `docs/backend/decisions.md`, the 0003 promotions schema (`src/server/db/schema/promotions.ts`), the `checkout_quotes` table in 0002, and `src/server/cart/service.ts` (13B quotes a cart by `cartId` and `version`).
2. Build integer-safe KZT server quotes with expiry and policy versions:
   - admin markdown rules kept separate from coupon codes;
   - coupon validity, stacking, and global and per-user limits, with atomic quota reservation;
   - a configurable tax and shipping policy (manual shipping per owner, no hardcoded demo tax);
   - optional USD display from the admin rate version only.
   - Reject client totals and non-KZT payment currencies.
3. Do **not** enable checkout. That is Task 14A.
4. Read the installed Next.js docs before adding routes. Run the gates from PowerShell, one at a time. Keep the smoke alone on the machine. If it shows "Next did not start" or stalls on `Compiling ...`, remove `.next/dev` and rerun. **Do not round-trip source files through PowerShell `Get-Content`/`Set-Content`.**

**STOP_AFTER is Task 22.**
