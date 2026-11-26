# One-page sign-up, formal orders, checkout pickup, My devices — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.
> Worktree `/home/nick/worktrees/grmn-account-pickup-devices`, branch `account-pickup-devices`, taken from `signup-traffic-ui` e153164 (= live 1d5e957 + plan docs).

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Executing | 4 | 8/22 | 2026-11-26 | M5 board pickup |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

**Goal (owner, 2026-11-26):** make the customer side of garmin.2well.cloud feel like a normal, formal store: a one-page sign-up, an orders area that is clear and grown-up (not "childish blocks"), a checkout that reuses what the customer already saved and offers store pickup, and a "My devices" area that lists every delivered electronic device with its serial, model, purchase date and warranty left.

**Deliverables**

D1. **One-page sign-up** at `/account/sign-up` (all three locales; the Sign up tab on `/account` leads to it or shows the same form). Every field visible at once:
- Full name (required)
- Phone (required) with a **Send code** button beside it, and an **SMS code** box on the same page (resend after a countdown)
- Email (required)
- Gender (optional): Male / Female / Prefer not to say
- Birthday (optional; same 10–120 years rule as Profile)
- One **Create account** button; "Already have an account? Sign in" link.
- The code is always checked by the server (with `AUTH_TEST_OTP_CODE=1234` on prod the code is 1234 and no SMS is sent; customer text never says "test").
- No delivery address on sign-up: addresses stay in Profile.
- Built on the existing send-code → verify steps (gender/birthday added). The code-free `/grmn/signup` shortcut (`signUpUnverified`) is closed. If the fixed code is off and no SMS sender is configured (send-code 503), the page shows "Sign-up is temporarily unavailable" (my call, 2026-11-26).

D2. **Gender in Profile**: shown in the profile details and editable there (optional). Stored on the customer profile (new nullable column).

D3. **Formal orders area** (Orders tab and the "recent order" block on Profile):
- List as a clean table (desktop) / stacked rows (mobile): Order number · Date · Status (small dot + word) · Items · Total · chevron. No black badges, no boxed cards, thin rules, consistent type scale.
- Status words follow the order's method: delivery = Ordered / Packed / Shipped / Delivered; pickup = Ordered / Ready for pickup / Picked up; Cancelled for both.
- **Opened order**: a full detail view inside the Orders tab with its own link (`/account?order=<order id>`, Back and refresh work), replacing the small popup. Header (number, date, status, payment state), tracker, then product rows with **product photo**, **product name linking to its product page** (`/p/{code}[/{sku}]`; plain text when the product no longer exists), options, quantity, serial(s), line price; totals; delivery address **or** pickup store card; order updates.
- The legacy "claim an order" form stays, visually aligned.

D4. **Checkout delivery step**
- Signed-in customer: saved addresses as choices (primary pre-selected), name/phone/email prefilled from the profile (already true today; keep it).
- New choice **Pick up at store**: shows the store card (name, address, opening hours, phone, small map) and charges **0 ₸ shipping**. Contact name and phone still required (prefilled when signed in).
- **Another address**: an empty address form (map-assisted, as today) with "Save to my addresses".
- Guests: "Pick up at store" and "Deliver to an address".
- Pickup offered only while pickup is switched on in Admin.
- **Pickup orders are paid during checkout** (owner 2026-11-26), with the same payment methods as delivery. No "pay at store". The board's paid-first rule stays: "Ready for pickup" is offered only for paid orders.

D5. **Store pickup settings** in Admin ▸ Settings: on/off, store name, address, opening hours (EN/RU/KK), phone, map point (lat/lng, optional). Seed value: **Garmin showroom, Panfilova St 154, Almaty, daily 10:00–19:00** (from ifit.kz and lap.kz; 2GIS lists Garmin.kz at Rozybakieva 310a as another seller). Phone seed empty. Orders keep a copy of the store details at the time of the order.

D6. **Pickup fulfillment**, three steps, all switched by staff on the existing Admin ▸ Orders board:
- Ordered → **Ready for pickup** (the existing Pack step: serials are entered per device unit exactly as for packing) → **Picked up** (no courier/dispatch step).
- Board cards show a "Pickup" mark and pickup-specific labels/buttons; delivery orders unchanged.
- Customers see the three-step pickup tracker; a picked-up order counts as delivered for My devices and warranty.

D7. **My devices** tab (replaces today's "unavailable" text): one row per **serialised unit** from orders that are Delivered or Picked up and not returned. Each row: product photo, model (product + variant name, linking to the product page), serial number, purchase date, order number, warranty end date, **warranty left** (months/days, progress bar), "Warranty ended" in grey after expiry. Accessories (bands, cables, apps — anything whose serial setting is "no serial") never appear, because they never get serials.

D8. **Warranty length**: default **12 months from the delivery/pick-up date**; can be overridden per category and per product in Admin (same pattern as the serial setting: product → category → default).

**Constraints**
- Owner rules: customers never see "$" (prices ₸/KZT only); customers never see "demo"/"test" wording; EN/RU/KK for all customer text.
- Additive migration only (`0033_…`, idempotent); live image `1d5e957` must still run against the migrated DB (rollback = `switch-version.sh 1d5e957`).
- Build on what exists (approach A): orders/shipments/serials machinery, AddressForm, account API, `/api/auth/grmn/*`.
- garmin.com look (`.g-*` classes, black/white, Garmin blue links, cyan #6DCFF6 only for sale/tracker accents already in use).
- No deploy without the owner's explicit "deploy".

**Non-goals**
- Customer notifications (SMS/email/WhatsApp for "ready for pickup" etc.): owner will add notification services later; customers see status in their account only.
- Real SMS provider setup (stays on the fixed code while the site is not public).
- Courier integrations, pickup time slots, multiple stores, store-locator page.
- Warranty registration with Garmin, warranty claims flow, device photos uploaded by customers.
- Changing the delivery (non-pickup) board flow or shipping prices.
- Merging into beta5 / pushing (only when asked).

**Assumptions (my calls, owner may correct)**
- A1. Warranty starts on the delivered/picked-up date; units delivered before this release also appear (their serials exist since 0030); units with no recorded serial do not appear.
- A2. A returned unit (serial linked to a return) disappears from My devices.
- A3. Pickup orders keep "Packed" in the shared database status; only labels differ by method (no new order status enum).
- A4. "Picked up" on a pickup shipment sets both dispatched and delivered time at once.
- A5. Gender values stored as `male` / `female` / `unspecified` (empty = not given).
- A6. Store pickup settings live in a new `store_settings.pickup_location` jsonb column (versioned with the existing settings row).

- A7. Tax on pickup orders uses the store's country (KZ), same as delivery today.
- A8. If the phone or email already has an account, sign-up answers "sign in instead" (existing server behaviour).

**Decisions log:** 2026-11-26 project = GRMN; approach A (build on existing orders/shipments/serials); one store, editable in Admin, seeded from web search; pickup steps Ordered → Ready for pickup → Picked up, switched by staff; sign-up fields as D1 with SMS box, gender + birthday optional, address stays in Profile; pickup paid at checkout; notifications later.

**Open questions:** none blocking.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| AC1 | `/account/sign-up` (en/ru/kk) shows name, phone + Send code, SMS code, email, gender, birthday and one Create button on a single screen at 390 and 1440 px | auto + screenshot | smoke `CMS_SMOKE_ONLY=signup` + review.mjs screenshots |
| AC2 | Sign-up with a wrong code is refused; with the right code creates the account, signs in, stores gender/birthday when given, lands on Profile | auto | integration test (auth signup) + smoke |
| AC3 | Gender shows and edits in Profile; empty allowed | auto | integration (profile) + unit |
| AC4 | Orders list renders as rows with number/date/status/items/total, no black number badges | auto + screenshot | component test + screenshot 1440/390 |
| AC5 | Opened order shows each line's image and a link to `/p/{code}[/{sku}]`; deleted product → no link, no broken image; `/account?order=N` reopens it after refresh | auto | account integration (DTO has productCode/sku/image) + smoke |
| AC6 | Checkout: signed-in customer sees saved addresses (primary selected), Pick up at store, Another address; pickup quote has shipping 0 and the order stores method=pickup + store copy | auto | integration (checkout/quote) + smoke |
| AC7 | Pickup disabled in Admin → option hidden and a pickup quote is refused by the server | auto | integration |
| AC8 | Admin ▸ Settings edits pickup name/address/hours (EN/RU/KK)/phone/point; seed = Panfilova 154, 10:00–19:00 | auto | integration (settings) + smoke settings |
| AC9 | Board: pickup order goes New → Ready for pickup (serials required for devices) → Picked up; delivery orders unchanged | auto | integration (fulfillment) + smoke `CMS_SMOKE_ONLY=orders` |
| AC10 | Customer tracker shows Ordered/Ready for pickup/Picked up for pickup orders | auto | unit (stage labels) + smoke |
| AC11 | My devices lists only serialised units of delivered/picked-up, not-returned orders, with serial, model link, purchase date, warranty end/left; bands never appear | auto | integration (devices endpoint) + component test |
| AC12 | Warranty months: product override > category override > 12 default | auto | unit + integration |
| AC13 | Migration 0033 applies on a copy of the live DB, re-run is a no-op, and image 1d5e957 still serves account/checkout/board on it | auto | staging rehearsal |
| AC14 | No customer-visible "$", "demo" or "test"; all new strings exist in en/ru/kk | auto | existing wording + i18n tests |
| AC15 | Full suites stay green | auto | `npm run test:unit`, `npm run test:integration`, `tsc`, `next build --webpack`, full `test:cms-ui` |

Manual spot checks (owner): sign up on the phone, open an order and tap a product, place a pickup order, move it through the board, see the device appear in My devices.

## 3. Anti-drift
- **Primary objective:** a customer can sign up on one page, read their orders like a real store's order history (pictures, links), check out with saved data or store pickup, and see their devices with warranty; staff can run pickup orders on the board.
- **Proxy signals (not success by themselves):** tests/build passing; screenshots of empty states; the new tab merely existing; a pickup option that shows but places orders priced with shipping; My devices populated only by fixture data.
- **Intended scope:** customer account (sign-up, profile gender, orders, devices), checkout delivery step, pricing/quote for pickup, order placement copy, Admin Settings pickup block, Admin category/product warranty field, Admin board pickup labels/actions, migration 0033, i18n.
- **Completion target:** full delivery on the branch with verification evidence and staging rehearsal; deploy only on the owner's word.

## 4. Modules and skill map
Owner approved the requirement 2026-11-26 and said: "do it by your choice if you have questions, finish, deploy, ask for pushing". So the plan stop is waived; execution is native (this session), serial.

| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Schema | migration 0033 + drizzle schema | agent_direct (owner) | `drizzle/0033_*`, `drizzle/meta/_journal.json`, `src/server/db/schema/*` | – |
| M2 Sign-up + gender (server) | verified one-step sign-up; gender in profile | agent_direct; `superpowers:test-driven-development` (support) | `src/server/auth/*`, `src/server/account/service.ts` (profile), `src/contracts/commerce.ts`, `src/lib/account-client.ts` | M1 |
| M3 Pickup settings | store pickup block in settings service + Admin UI | agent_direct | `src/server/settings/*`, `src/app/admin/settings/*`, `src/lib/pickup.ts` | M1 |
| M4 Checkout pickup | pickup delivery kind, 0 shipping, order copy, checkout UI | agent_direct; TDD (support) | `src/server/cart/service.ts`, `src/server/pricing/quote.ts`, `src/server/checkout/service.ts`, `src/components/CheckoutPanel.tsx`, `src/lib/checkout-address.ts` | M1, M3 |
| M5 Board pickup | Ready for pickup / Picked up on board, server `pick_up` | agent_direct; TDD (support) | `src/server/fulfillment/*`, `src/app/admin/orders/_components/*` | M4 |
| M6 Account data | order DTO image/link/method/pickup, devices endpoint, warranty resolution + admin warranty fields | agent_direct; TDD (support) | `src/server/account/*`, `src/server/fulfillment/warranty.ts`, `src/app/api/account/devices/*`, category admin + product editor warranty field | M1, M5 |
| M7 Customer UI | sign-up page, profile gender, formal orders + detail, devices tab, pickup tracker, EN/RU/KK | `frontend-developer` approach (owner, done inline), `ui-finish-gate-reviewer` (verifier) | `src/components/account/*`, `src/components/AccountDashboard.tsx`, `src/app/[lang]/account/sign-up/*`, `messages/*.json` | M2, M6 |
| M8 Verify + ship | suites, build, smoke, screenshots, review, staging rehearsal, deploy | `superpowers:verification-before-completion`, `code-reviewer` (verifier), `evidence-collector` approach | tests, docs, prod | M1–M7 |

Gaps: none. Waves (serial, one worktree): W1 M1 → W2 M2, M3 → W3 M4 → W4 M5 → W5 M6 → W6 M7 → W7 M8.

## 5. Tasks
Interfaces fixed here so every module agrees:
- `orders.fulfillment_method text NOT NULL DEFAULT 'delivery' CHECK IN ('delivery','pickup')`, `orders.pickup_snapshot jsonb NULL` (store copy: name, address, hours{en,ru,kk}, phone, lat, lng).
- `store_settings.pickup_location jsonb NOT NULL DEFAULT <seed>` shape `PickupLocation = { enabled: boolean; name: string; address: {en,ru,kk}; hours: {en,ru,kk}; phone: string; lat: number|null; lng: number|null; city: string; region: string }`.
- `customer_profiles.gender text NULL CHECK IN ('male','female','unspecified')`.
- `categories.warranty_months int NULL CHECK 1..120`, `products.warranty_months int NULL CHECK 1..120`; default 12.
- `DeliveryAddressSelection` adds `{ kind: "pickup"; contact: { recipientName: string; phone: string } }`; `DeliverySnapshot` adds `pickup?: PickupSnapshot`.
- `OrderSummaryDTO.fulfillmentMethod: "delivery" | "pickup"`; `OrderItemDTO` adds `productCode: string | null; variantSku: string | null; image: string | null`; `OrderDetailDTO.pickup: PickupSnapshotDTO | null`.
- `DeviceDTO = { serial; productName; variantName|null; productCode|null; sku|null; image|null; orderNumber; purchasedAt; warrantyMonths; warrantyEndsAt }`; `GET /api/account/devices → { items: DeviceDTO[] }`.
- Shipment action `pick_up` (ready → delivered, pickup orders only; sets dispatched_at=delivered_at=now; customer event `fulfillment.picked_up`). `ship`/`dispatch` refused for pickup orders.
- Sign-up `POST /api/auth/grmn/signup` body `{ name, email, phoneNumber, challengeId, code, gender?, birthDate? }`; code always checked (purpose `sign_in`); `/grmn/mode.signUp` = code sending available.

Advisor review 2026-11-26 (folded in):
- `pick_up` = existing dispatch then deliver transitions back to back in one transaction (same constraints/stock/stageDates); board `canDrop`: pickup packed→delivered only, never packed→shipped.
- Pickup pricing is decided inside `priceCart` from the snapshot's pickup flag with a deterministic `shippingPolicy` (`rateKey:"pickup"`) so placement revalidation matches; test quote → place.
- Sign-up page shows the fixed-code note like sign-in; name/email validated client- and server-side before the code is consumed.
- Order link uses the order id: `/account?order=<uuid>` (getOwnOrder is by id; list pages at 20).
- Journal `when` > 0032's; rehearsal asserts columns exist.
- Devices are per unit: that unit's shipment `delivered` + its `delivered_at`. Clear devices/order state in `signedOut()`.
- Expected test updates: direct-signup tests/smoke, CheckoutPanel hook-order tests (append hooks last), i18n parity, wording.
- Deploy: write-path checks on staging; prod checks read-only.
- UI: design pass (`ui-designer`) on current orders screenshots before M7; build to its output.

### M1 — Schema (wave 1)
- [x] T1.1 (schema-0033.test 3/3; journal when 1795727864501 > 0032) Write `drizzle/0033_account-pickup-devices.sql` (idempotent `ADD COLUMN IF NOT EXISTS` + guarded constraints, seed pickup_location = Panfilova 154 / 10:00–19:00), journal entry after 0032, drizzle schema fields — verify: `npm run test:integration -- tests/integration/database.test.mjs` + new `tests/integration/schema-0033.test.mjs` (columns exist, re-run no-op, seed value)

### M2 — Sign-up + gender (server)
- [x] T2.1 (auth-foundation 20/20) `signUpInput` in validation.ts; `phones.signUp()` = consume(sign_in) + create user/profile with gender/birthDate, audit `customer.signup_verified`; remove `signUpUnverified`, remove testCode gate on `/grmn/signup`; mode.signUp = sender or testCode — verify: auth-integration tests (wrong code 401, right code session, duplicate 409, gender stored)
- [x] T2.2 (account-kz-address 8/8 incl. gender) Profile DTO/save carry `gender` — verify: account-services tests

### M3 — Pickup settings
- [x] T3.1 (reports-settings: settings test passes with pickup round-trip) `src/lib/pickup.ts` (type, schema, seed, `pickupHoursFor(locale)`); settings service read/write `pickupLocation` with version check — verify: reports-settings tests
- [x] T3.2 (StorePickupSection; smoke pending in M8) Admin ▸ Settings "Store pickup" block — verify: tsc + smoke settings

### M4 — Checkout pickup
- [x] T4.1 (checkout.test 13/13) Cart quote accepts `kind:"pickup"` (refused `PICKUP_UNAVAILABLE` when disabled), snapshot = store address + contact + pickup copy; pricing shipping 0 for pickup — verify: checkout tests (quote shipping 0, disabled refused)
- [x] T4.2 (checkout.test pickup order row) Order placement stores fulfillment_method/pickup_snapshot + order_addresses = store address — verify: checkout test reads orders row
- [x] T4.3 (checkout-address-step 11/11; /api/store/pickup) CheckoutPanel: saved addresses, Pick up at store (store card), Another address (empty form), guest choices — verify: component/ui test + smoke checkout

### M5 — Board pickup
- [ ] T5.1 Server `pick_up` action + refusal of dispatch for pickup, admin DTO `fulfillmentMethod` — verify: fulfillment/order-board tests
- [ ] T5.2 Board labels (Ready for pickup / Picked up, "Pickup" mark, action "Mark picked up") — verify: unit stage tests + smoke orders

### M6 — Account data + warranty
- [ ] T6.1 Order list/detail DTO: fulfillmentMethod, pickup, item productCode/sku/image — verify: account-services tests
- [ ] T6.2 `warranty.ts` resolve months (product → categories max effective → 12) + `getOwnDevices` + route — verify: new devices integration test (band excluded, returned excluded, undelivered excluded, months override)
- [ ] T6.3 Admin warranty fields (category editor + product General tab) — verify: category-admin tests + tsc

### M7 — Customer UI
- [ ] T7.1 Sign-up page `/[lang]/account/sign-up` + `SignUpForm` component; Sign up tab links there — verify: smoke signup + screenshots
- [ ] T7.2 Profile gender view/edit — verify: smoke
- [ ] T7.3 Orders table + order detail view (`?order=`), recent order row — verify: screenshots 1440/390
- [ ] T7.4 OrderTracker pickup steps — verify: unit
- [ ] T7.5 My devices tab — verify: screenshots
- [ ] T7.6 Messages EN/RU/KK, wording rules — verify: i18n + wording tests

### M8 — Verify + ship
- [ ] T8.1 tsc, unit, integration, webpack build, full cms-ui smoke
- [ ] T8.2 Screenshots + UI finish-gate review; code review; fix
- [ ] T8.3 Staging rehearsal: prod copy → migrate 0033 → new image works, old image 1d5e957 works on migrated DB
- [ ] T8.4 Deploy (owner authorised 2026-11-26): dump, env backup, build, migrate, up, live checks; memory + plan update; ask owner about pushing

## 6. Verification
- `npx tsc --noEmit -p .` (after `npx next typegen`)
- `npm run test:unit`, `npm run test:integration`
- `npx next build --webpack`
- `CMS_TEST_CHROME=... CMS_TEST_CHROME_NO_SANDBOX=1 CMS_TEST_BUNDLER=webpack npm run test:cms-ui`
- Screenshots via /home/nick/tools/browser/review.mjs

## 7. Rollback
Migration 0033 is additive (new nullable/defaulted columns), so `switch-version.sh 1d5e957` is a full rollback; pickup orders placed meanwhile keep a structured order address (the store) and show as ordinary delivery orders on the old image. Pre-deploy dump + env backup named in the Result.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-26: requirement approved; owner waived the plan stop ("do it by your choice … finish, deploy, ask for pushing").

## Result
Delivered: · Checks run: · Gaps: · Follow-ups:

## Handoff
Branch `account-pickup-devices` in worktree /home/nick/worktrees/grmn-account-pickup-devices (node_modules symlinked to /home/nick/GRMN). Next: per Progress block.
