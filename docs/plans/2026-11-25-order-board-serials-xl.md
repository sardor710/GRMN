# Order board, archive, serial numbers and customer tracker — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Executing | 4 | 12/19 | 2026-11-26 | T5.1 customer OrderTracker |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

**Why (owner's words, condensed):** staff need a clearer way to run orders day to day (see what is new / packed / shipped / delivered at a glance, filter by period, keep finished orders out of the way), and every electronic device sold must have its serial recorded at packing time **for warranty claims and returns**. Customers should understand where their order is from a clear, good-looking tracker.

- **Goal:** replace the production admin orders screen (`FulfillmentScreen`, postgres mode) with a list + board screen driven by the real fulfillment system; require per-unit serials when packing electronic devices; add a customer-facing progress tracker.
- **Deliverables:**
  1. **Admin orders screen — two views, one toggle.**
     - **Board:** four columns **New · Packed · Shipped · Delivered**.
       - New = confirmed orders not yet packed, *including unpaid ones*. A card shows order number, date, customer, item count / short item names, total in ₸, and a payment pill: amber "◔ Awaiting payment" → green "✓ Paid" once payment is captured. Polished visual design (owner asked for it to look beautiful).
       - Packed = shipment created (shipment `ready`); Shipped = dispatched; Delivered = delivered and not yet archived.
       - Moving forward: a button on each card **or** drag the card to the next column. Pack is offered only once the order is paid.
     - **List:** table with order number, date, customer, total, payment pill, stage; search by order number, customer name/phone, **or serial number**; paginates through all orders (today's screen shows only the first 50).
     - **Time filter** (both views): Today, This week, Last 7 days, Last 30 days, This month, custom range. Store time zone Asia/Almaty.
     - **Archive:** a delivered order leaves the board at **00:00 Asia/Almaty on the calendar day after delivery** (delivered 25 Nov 23:50 → archived 26 Nov 00:00). An **Archive** button opens archived orders (same list/filter UI). Cancelled and returned orders are not on the board; they appear in list view and in the archive.
  2. **Redesigned status change (admin).**
     - **Pack:** one panel listing every item. Each unit of a serial-required product gets its own serial field (qty 2 → 2 fields); other items get a tick. Save is blocked until every required serial is filled. Packs the **whole order** in one go.
     - **Ship:** carrier and tracking number, both optional.
     - **Delivered:** one-click confirm.
     - Serial typo can be corrected while the order is Packed; locked once shipped.
  3. **Serial numbers (for warranty and returns).**
     - Stored one row per physical unit, linked to the order item / shipment item.
     - **Rule:** every electronic device needs a serial; only non-electronic accessories and digital items don't (owner: "even fishfinders and range finders; only accessories like cases, bands, cables and chargers don't").
       - Default = **needs serial**. A category can be set to "no serial"; each category in Admin ▸ Categories gets **Needs serial: yes / no / same as parent**; resolution walks up the tree.
       - Initial "no serial" categories: bands (all band groups, dive bands, MARQ straps/bracelets), cables & chargers, cases, mounts, cycling/biking accessories, indoor-training accessories, watch accessories, apps, subscription plans. Heart-rate monitors and sensors stay **serial-required** even though they are accessory-kind categories.
       - Product page gets a per-product override **Needs serial: auto / yes / no**.
       - Product in no category → needs serial (safe default; staff flip the product switch for an unfiled band/cable).
     - A serial cannot be attached to a second order while it is still on an earlier order that was not returned (catches typos/mix-ups). On a return, the serial stays on record with the returned unit.
     - Admin search by serial → order, date sold, buyer.
     - Customers see their serials in order details.
  4. **Customer profile → Orders: tracker.** Four steps with icons **Ordered → Packed → Shipped → Delivered**; completed steps light up; the line along the passed path is Garmin cyan **#6DCFF6**; cancelled orders show the tracker stopped with a grey "Cancelled" note. Shown on each order in the list and in order details. EN / RU / KK.
  5. Customer-visible "Packed" update (new customer event), EN / RU / KK.
- **Constraints:**
  - Built on the existing shipment system (approach 1 below): stock allocations, payment gate (`ORDER_NOT_PAID`), CAS versions, idempotency keys, audit/order events, refunds and returns keep working.
  - Branch `homepage-deploy` (= live 0b82ec7) in `/home/nick/worktrees/grmn-homepage-deploy`. One additive migration, journal `when` set so it orders correctly alongside beta5's 0029/0030 (same technique as 0029_traffic-analytics).
  - Customers never see "$" — prices only ₸/KZT. Customers never see "demo".
  - Admin HTTP handlers build URLs with `requestURL()`.
  - Admin screens stay English (as today); customer-facing text in EN/RU/KK.
  - No deploy until the owner says "deploy".
- **Non-goals:**
  - Partial packing/shipping from the new screen (orders wait in New until everything is in stock). Existing partial-shipment data still displays correctly.
  - Carrier integrations / live tracking.
  - Changing the legacy JSON-mode `OrdersScreen`.
  - Serial validation against Garmin's registry; serial format rules beyond trimming and non-empty.
  - Merging into beta5 (separate follow-up, as for earlier homepage-deploy work).
- **Assumptions:**
  - Order volume is small (hundreds, not millions): archive and stage are computed in queries, no nightly job.
  - "Ordered" step = order placed; "Packed" = shipment created; "Shipped" = dispatched; "Delivered" = delivered.
  - Staff who can change fulfillment today (`orders:fulfill`) can pack/ship/deliver and edit serials; changing category/product serial settings uses the existing catalog permissions.
- **Open questions:** none.

### Decisions after builder check (owner approved 2026-11-25, "looks good proceed")
- **Demo orders** stay on the board with a small "Demo" tag on the card (admin only; customers never see "demo").
- **Returns:** when staff create a return for a serialized item they tick which serial(s) come back (`return_items` gets per-unit serial links). A serial is "back" — and may be attached to a new order — once its return reaches `received` (or later: `inspected`, `closed`). Returns in `requested`/`authorized`/`rejected`/`cancelled` do not free it.
- **Bundles:** one serial per unit of quantity (no multi-serial bundles).
- **Multi-category resolution (builder call, owner accepted):** per product, explicit category "yes" wins → else any category (or ancestor) explicitly "no" → no serial → else needs serial. **Revised 2026-11-25 after the real-data check (safer):** an ordinary (non-group) category with no setting, e.g. Smartwatches, also means "needs serial" and beats "no"; only series groupings (kind group) without a setting don't vote. Reason: prod MARQ Adventurer is filed under Smartwatches *and* Apps/Cables & Chargers and would otherwise skip its serial. Product override (yes/no) beats all categories. HRM and sensors categories are explicitly "yes". A band in a watch-series group (no setting) + QuickFit 22 mm (no) → no serial.
- **Unfiled products fallback:** no categories → use `products.legacy_content` category/subCategory through the legacy alias table, then name keywords (band, strap, bracelet, cable, charger, case, mount, screen protector, …) → no serial; otherwise needs serial. Before deploy, produce a report of every product with its resolved setting for the owner to scan.
- **Time filters** use the order date (placed_at, else created_at). Board default period = All.
- **Main list = active orders; Archive button = archived (delivered before today Almaty), cancelled, closed, returned.** Search (order no., customer, serial) covers both.
- **Imported legacy orders** (`data_quality='legacy_incomplete'` or `payment_mode='legacy_unknown'`) never appear on the board; list/archive only, tagged "Imported".
- **Orders packed before this ships** keep working; staff may add serials, not forced.
- **Cancelled shipment frees its serials.**
- Permission: fulfillment actions keep `orders:fulfill` (doc earlier said orders:write — corrected).
- Existing order-detail actions (confirm payment, cancel order, refund, manual refund completion, returns) remain available in the new order drawer.

### Approaches (decided)
1. **Build on existing shipments — CHOSEN.** Pack = create shipment (+serials), Ship = dispatch, Delivered = deliver. Serials in a new per-unit table. Archive computed from delivery date vs "today" in Almaty. Keeps stock, payments, audit, CAS, refunds and returns intact; returns can check serial against unit sold.
2. New order-level stage field set by staff — rejected: would drift from shipments; stock and returns wouldn't know an order was packed.
3. Approach 1 with a stored archive flag set by a midnight job — rejected: adds a job that can fail silently; computing is instant at this volume.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode (auto/manual) | Check |
|---|---|---|---|
| A1 | Board shows New/Packed/Shipped/Delivered with correct placement for unpaid, paid, packed, dispatched, delivered-today, delivered-yesterday (archived), cancelled orders | auto | integration test on list service + cms-ui smoke |
| A2 | Delivered order is archived exactly from 00:00 Asia/Almaty the next calendar day (boundary test 23:59 vs 00:00) | auto | unit/integration test |
| A3 | Archive button lists archived orders; time filters (Today/This week/Last 7/Last 30/This month/custom) filter both views | auto | integration + smoke |
| A4 | Pack refuses when any serial-required unit lacks a serial; succeeds with all serials; bands/chargers need none | auto | integration test |
| A5 | Serial rule: category no/yes/inherit + product override + uncategorised default resolve correctly (HRM, sensors, fishfinder → required; band, charger, case → not) | auto | unit test |
| A6 | Duplicate serial on a non-returned earlier order is refused; allowed after that unit is returned | auto | integration test |
| A7 | Serial editable while Packed, refused after dispatch | auto | integration test |
| A8 | Pack blocked while unpaid; card pill goes Awaiting payment → Paid after payment confirm | auto | integration + smoke |
| A9 | Admin search by serial finds the order | auto | integration test |
| A10 | Customer tracker: correct lit steps per stage, cyan #6DCFF6 line on passed path, cancelled state; serials visible in details; EN/RU/KK keys present | auto + manual | unit (account-dashboard) + screenshot |
| A11 | Existing behaviour intact: refunds, returns, cancel, payment confirm, legacy orders | auto | `npm run test:integration`, `npm run test:unit` |
| A12 | Typecheck/lint/build pass | auto | `npm run check` |

Manual spot checks:
- Screenshots of board, list, archive, pack panel (with a watch + band order), customer tracker at each stage, on desktop and mobile width; owner judges "beautiful".
- Full flow on staging (or local) with a demo order: place → confirm payment → pack with serial → ship → deliver → next-day archive (clock-shifted test).

## 3. Anti-drift
- **Primary objective:** staff can run every order through New → Packed → Shipped → Delivered → Archive on one clear screen, and no electronic device leaves without its serial recorded; customers understand their order's progress at a glance.
- **Proxy signals (not success by themselves):** tests/build passing; a board that renders but uses fake/legacy data; serial fields that exist but aren't enforced server-side; a tracker that renders but doesn't match real shipment state.
- **Intended scope:** admin orders screen (postgres mode), fulfillment service/HTTP, one migration (serials + category/product serial setting), Admin ▸ Categories and product editor serial setting, account orders tracker + translations, tests.
- **Completion target:** full delivery on `homepage-deploy`, verified locally/staging; deployment only on owner's word.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Schema + migration | serial table, category/product serial setting, seeded "no serial"/"needs serial" categories; idempotent migration | `agent_direct` (owner), `database-optimizer` index checklist (support) | `src/server/db/schema/{fulfillment,catalog}.ts`, `drizzle/0030_order-serials.sql`, `drizzle/meta/*`, `tests/integration/order-serials-schema.test.mjs` | – |
| M2 Serial rule | one function decides "needs serial" per product; settings writable; pre-deploy report script | `superpowers:test-driven-development` (owner) | `src/server/fulfillment/serial-policy.ts`, `scripts/ops/serial-policy-report.mjs`, `tests/unit/serial-policy.test.mjs`, `tests/integration/serial-policy.test.mjs` | M1 |
| M3 Fulfillment backend | pack-with-serials, serial edit, board/archive/period/search listing, return serial pick, customer "packed" event + account DTOs | `superpowers:test-driven-development` (owner), `backend-architect` (verifier, read-only review of concurrency/locking) | `src/server/fulfillment/{service,board,http,aftersales}.ts`, `src/server/account/service.ts`, `src/contracts/commerce.ts`, `src/server/cms/category-admin.ts`, `tests/integration/order-board.test.mjs` | M2 |
| M4 Admin UI | list + board screen, archive, filters, order drawer, Pack/Ship panels, category + product serial settings | `frontend-developer` (owner), `ui-designer` (support: visual pass), `evidence-collector` (verifier: screenshots) | `src/app/admin/orders/**`, `src/components/admin/categories/{CategoryDialogs,CategoriesScreen,category-api}.tsx/ts`, `src/components/admin/product-editor/tabs/GeneralTab.tsx` | M3 |
| M5 Customer tracker | four-step tracker in account orders (list + detail), serials in details, EN/RU/KK | `frontend-developer` (owner), `ui-designer` + `i18n-engineer` checklist (support) | `src/components/account/OrderTracker.tsx`, `src/components/AccountDashboard.tsx`, `messages/{en,ru,kk}.json`, `tests/unit/order-tracker.test.mjs` | M3 |
| M6 Verify + review | full test suites, smoke orders block, screenshots, code review, owner report | `superpowers:verification-before-completion` (owner), `code-reviewer` + `superpowers:requesting-code-review` (verifier) | `tests/ui/cms-smoke.mjs`, plan file | M4, M5 |

Gaps (no fitting skill): none.

Waves (at most 2 parallel units, disjoint write scopes; parallel agents use their own worktrees):
- Wave 1: M1
- Wave 2: M2
- Wave 3: M3
- Wave 4: M4 ‖ M5 (disjoint: admin files vs account/messages files; contracts already settled in M3). Run **serially** in practice if host memory is low (earlier smoke runs were killed for low memory) — parallel only if `free -g` shows ≥ 6 GB available.
- Wave 5: M6

## 5. Tasks

**Global constraints (every task):** customers never see "$" or "demo"; prices ₸; admin URLs via `requestURL()`; every write keeps CAS version + idempotency key + order/shipment/audit events like today's actions; store time zone `Asia/Almaty`; Garmin cyan `#6DCFF6`; TypeScript strict, no `any`; run tests with the repo scripts (`npm run test:unit`, `npm run test:integration` — temp Postgres).

**Review focus (failure modes no single happy-path test hits; each pinned by a test below):**
1. Two staff pack two orders with the same serial at the same moment → exactly one succeeds, the other gets `SERIAL_IN_USE` (advisory lock per serial key). → T3.2
2. Serial typed as `"abc 123"` vs `"ABC123"` → treated as the same unit (serial_key = upper, whitespace removed). → T1.1, T3.2
3. Delivered 23:59:59 Almaty vs 00:00:00 next day, server clock in UTC → archived exactly at local midnight. → T3.3
4. Item qty 2 spread over two stock allocations → two shipment_items; serials land one per unit across both. → T3.1
5. Order packed before this release (ready shipment, no serials) → still dispatches; staff can add serials later. → T3.2

### M1 — Schema + migration (wave 1, owner: agent_direct)
- [x] **T1.1 Schema + migration.** ✅ 2a954d1 — order-serials-schema 4/4, database.test 4/4.
  - `categories.serial_policy` and `products.serial_policy`: `text NULL`, CHECK `IN ('required','none')` (NULL = same as parent / auto).
  - New table `order_unit_serials` (schema in `src/server/db/schema/fulfillment.ts`, export `orderUnitSerials`): `id uuid pk`, `order_id`, `order_item_id`, `shipment_item_id` (all NOT NULL), `unit_index int NOT NULL CHECK >=1`, `serial text NOT NULL CHECK (serial=btrim(serial) AND char_length(serial) BETWEEN 1 AND 64)`, `serial_key text GENERATED ALWAYS AS (upper(regexp_replace(serial,'\s','','g'))) STORED`, `return_item_id uuid NULL REFERENCES return_items(id) ON DELETE RESTRICT`, `created_by uuid REFERENCES users(id)`, `created_at`, `updated_at`. FKs `(shipment_item_id, order_item_id) → shipment_items(id, order_item_id)`, `(order_item_id, order_id) → order_items(id, order_id)`. Unique `(shipment_item_id, unit_index)`; indexes on `serial_key`, `order_id`, `return_item_id`.
  - Seed **only in the same DO block that first adds `categories.serial_policy`** (so a later re-apply, e.g. at the beta5 merge, never overwrites an owner's choice): `'none'` for keys `bands, dive-bands, marq-straps-bracelets, cables-chargers, apps, subscription-plans, sports-fitness/cycling-biking-accessories, sports-fitness/indoor-training/accessories, wearables-smartwatches-accessories`; `'required'` for `heart-rate-monitors, sensors`. (No case/mount categories exist in the seed; the name fallback in M2 covers them.)
  - `drizzle/0030_order-serials.sql`, fully idempotent (`IF NOT EXISTS`, constraint adds in `DO $$ … EXCEPTION WHEN duplicate_object`), header comment like 0029; journal entry idx 30 tag `0030_order-serials` with `when` **1795410000000** (between 0029 1795400000000 and beta5's 0029 1795419564832); snapshot regenerated.
  - Test `tests/integration/order-serials-schema.test.mjs`: migrate temp DB; re-run the SQL file → no error; `serial_key` of `' abc 123 '`→ CHECK rejects untrimmed, `'abc 123'` → key `ABC123`; seeded policies present after inserting the seed categories then re-running the SQL.
  - verify: `node --conditions=react-server --test tests/integration/order-serials-schema.test.mjs` PASS; `npm run typecheck` PASS. Commit `feat(db): order unit serials and serial policy (0030)`.

### M2 — Serial rule (wave 2, owner: TDD)
- [x] **T2.1 Pure decision** ✅ unit 9/9 (rule tightened, see Decisions) in `src/server/fulfillment/serial-policy.ts`:
  - `export type SerialPolicy = "required" | "none";`
  - `export interface SerialDecision { required: boolean; source: "product" | "category" | "legacy-category" | "name" | "default"; detail: string | null }` (detail = deciding category key or matched word).
  - `export function decideSerial(input: { productPolicy: SerialPolicy | null; categories: { key: string; effective: SerialPolicy | null }[]; legacyCategories: { key: string; effective: SerialPolicy | null }[]; name: string }): SerialDecision`
  - Order: product policy → if `categories` non-empty: any effective `required` → required; else any `none` → not; else required (`default`) → if no categories: same rule over `legacyCategories` (source `legacy-category`) → else `NO_SERIAL_NAME` match → not (`name`) → else required (`default`).
  - Name fallback must fail **safe** (a device must never be exempted by name): a name is "no serial" only when it **starts with / is about** the accessory, not when it merely mentions one. Rule: lower-cased, NFKC name matches `NO_SERIAL_NAME = /^(?:garmin\s+)?(?:[\p{L}\d.\- ]{0,30}\s)?(?:band|bands|strap|bracelet|cable|charger|charging (?:clip|cable|cradle)|case|mount|screen protector|lanyard|ремешок|браслет|кабель|зарядн\S*|чехол|крепление|защитн\S* пл[её]нк\S*)\b/iu` **and** does not contain a device word `DEVICE_NAME = /(?:watch|fēnix|fenix|forerunner|venu|vívo|vivo|instinct|epix|enduro|marq|edge|hrm|sensor|varia|echomap|striker|livescope|approach|descent|tacx|drive|zūmo|zumo|dezl|montana|gpsmap|etrex|inreach|rangefinder|fishfinder|часы|датчик|навигатор)/iu` (Unicode-aware; no `\b` on Cyrillic — `\b` is ASCII-only in JS so the Cyrillic words are matched without it).
  - Tests `tests/unit/serial-policy.test.mjs` (`node:test`): HRM category required + sport null → required; band in watch-series(null) + quickfit (none) → not; watch in multisport (null) → required (default); product `none` overrides HRM; no categories + legacy "Heart rate and sensors" required; no categories, no legacy, name "QuickFit 22 Band" → not (`name`); "Ремешок QuickFit 22" → not; "Charging Cable" → not; name "fēnix 8" → required; **"vívoactive 6 with Silicone Band" → required; "Forerunner 970 Stainless Steel Case" → required; "Edge Mount" → required (device word wins = safe side)**; fishfinder/rangefinder (null categories) → required.
  - verify: `node --conditions=react-server --test tests/unit/serial-policy.test.mjs` PASS.
- [x] **T2.2 DB resolver + settings** ✅ integration 7/7, category tests 25/25 in same file:
  - `export async function resolveSerialRequirements(db: Pick<PoolClient, "query">, productIds: string[]): Promise<Map<string, SerialDecision>>` — one recursive CTE: each product's categories with effective policy (own or nearest ancestor's non-null, skipping archived); legacy categories via `matchLegacyCategories` (`src/server/catalog/category-match.ts:83`) against all category nodes; then `decideSerial`.
  - `export async function setProductSerialPolicy(client: PoolClient, productId: string, policy: SerialPolicy | null): Promise<void>` — updates only `serial_policy` (does **not** bump `products.version`/`updated_at`, so an open product editor's next save is not rejected; the field is outside the editor's CAS-protected content). Writes an `audit_events` row `catalog.serial_policy`.
  - Category setting goes through existing category PATCH: `updateInput` in `src/server/cms/category-admin.ts:68` gains `serialPolicy: z.enum(["required","none"]).nullable().optional()` (refine accepts it as a change); `AdminNode` gains `serialPolicy: SerialPolicy | null` (`rows()` selects `c.serial_policy`). Mirror type in `src/components/admin/categories/category-api.ts`.
  - Test `tests/integration/serial-policy.test.mjs`: temp DB with a tiny tree (accessory root `bands` none → child `bands/quickfit-22-mm` null; `heart-rate-monitors` required; `wearables-smartwatches` → `sports-fitness/multisport-smartwatches`); products filed accordingly → expected decisions; ancestor inheritance; archived category ignored; product override.
  - verify: `node --conditions=react-server --test tests/integration/serial-policy.test.mjs` PASS. Commit `feat(fulfillment): serial requirement rule`.
- [x] **T2.3 Report script + reality check** ✅ prod copy: 20 need serial, 4 bands no, 0 guesses (CSV in grmn-production) `scripts/ops/serial-policy-report.mjs` (run in ops image like `load-taxonomy.mjs`): prints CSV `product_id,status,name,needs_serial,source,detail,guess` (`guess=yes` for `name` and `legacy-category` sources) for every non-archived product; summary counts per source to stderr. Test: `tests/integration/serial-policy.test.mjs` calls exported `serialPolicyReport(client)` on the fixture.
  - **Gate before M3:** restore today's prod dump into `grmn-staging` (memory: staging restore steps), migrate to 0030, run the report. If any device lands on `source=name` (exempted) or any band/cable on `default` in large numbers, adjust rule/seed and re-run before continuing. Save CSV to `/home/nick/grmn-production/serial-policy-report-<date>.csv`; owner gets the summary (guess rows flagged) at delivery.

### M3 — Fulfillment backend (wave 3, owner: TDD; verifier: backend-architect read-only)
All in `tests/integration/order-board.test.mjs` (fixtures copied from `tests/integration/fulfillment.test.mjs`: sandbox-paid orders, demo order, legacy order, `fulfiller`/`support` roles).
- **Existing suites must keep their meaning, not have the default softened:** fixture `product()` helpers in `tests/integration/{fulfillment,aftersales,payments-fulfillment-promotions,account-services}.test.mjs` gain an option `serialPolicy` defaulting to `'none'` (explicit "no serial" — they test shipping, not serials); the smoke fixture product likewise, except the M6 orders block which uses a serial-required product. Customer-timeline assertions that list event types add `fulfillment.packed` where a shipment is created.
- [x] **T3.1 Pack with serials** ✅ (`createShipment`, `src/server/fulfillment/service.ts`):
  - `createInput` gains `serials: z.array(z.strictObject({ orderItemId: uuid, units: z.array(z.string().trim().min(1).max(64)).max(10000) })).max(100).optional()`.
  - Resolve requirements for the lines' products (`resolveSerialRequirements`); every required line needs `units.length === quantity`, else `409 SERIALS_REQUIRED` (message names the items). Units for non-required items allowed (≤ quantity). Units for an orderItemId not in `lines` → 400.
  - Insert serial rows after shipment_items, distributing units in order across the plan rows for that item (`unit_index` 1..n per shipment_item).
  - Customer event `fulfillment.packed` (visibility customer, dedupe `fulfillment.packed:<shipmentId>`, payload `{shipmentId, items}`).
  - Tests: watch+band order → pack without watch serial → SERIALS_REQUIRED; with serial → 201-equivalent, band needs none; qty 2 over two allocations → serial rows on both shipment_items (Review focus 4); `fulfillment.packed` customer event exists once on replay.
- [x] **T3.2 Serial uniqueness + edit:** ✅
  - `async function claimSerials(client, keys: string[], ownShipmentItemIds: string[]): Promise<void>` — sorted keys, `SELECT pg_advisory_xact_lock(hashtextextended('serial:'||$1,0))` each; in-request duplicates → `409 SERIAL_DUPLICATE`; active-elsewhere → `409 SERIAL_IN_USE` ("Serial X is already on order GRM-…"). Active = shipment status ≠ cancelled AND (no return link OR linked return status NOT IN received/inspected/closed).
  - New update action `set_serials`: `{ shipmentId, expectedVersion, idempotencyKey, orderItemId, units: string[] }`; only `ready` shipments (`INVALID_TRANSITION` otherwise); `units.length` must equal the item's quantity in that shipment, or 0 when not required; replaces that item's rows; bumps shipment version; internal event `shipment.serials_updated`; audit `fulfillment.serials_updated`. Wire in `http.ts` next to dispatch/deliver.
  - Tests: same serial on second order → SERIAL_IN_USE; `"abc 123"` vs `"ABC123"` collide (focus 2); two concurrent packs same serial → one fails (focus 1, `Promise.allSettled`); after shipment cancel → serial reusable; edit while ready OK, after dispatch → INVALID_TRANSITION; pre-release shipment with no serials dispatches, then `set_serials` on a ready one works (focus 5).
- [x] **T3.3 Board listing** ✅ — new `src/server/fulfillment/board.ts`:
  - `export type BoardStage = "new" | "packed" | "shipped" | "delivered";`
  - `export type Period = "all" | "today" | "week" | "7d" | "30d" | "month" | "custom";`
  - `listInput` gains `view: z.enum(["active","archive"]).optional()` (default active), `period`, `from`/`to` (`YYYY-MM-DD`, required for custom, max range 366 days), `q` (trim, 1–80), `stage` (BoardStage); `limit` max 200.
  - SQL (Almaty): `today0 = date_trunc('day', now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty'`; week = `date_trunc('week', …)` (Monday); 7d/30d = today0 − 6/29 days; month = `date_trunc('month', …)`; custom = from 00:00 to (to+1) 00:00 local. Filter on `COALESCE(placed_at, created_at)`.
  - `archived` = legacy (`isLegacy` rule) OR `order_status IN ('cancelled','closed')` OR `payment_status='refunded'` (fully refunded) OR (`fulfillment_status='delivered'` AND max(shipments.delivered_at) < today0) OR (every dispatched unit is on a return in received/inspected/closed — "returned"; check because `refreshOrder` yields `partially_shipped` when `ordered=0, dispatched>0`). Active view = NOT archived; archive view = archived; when `q` given both views are searched and each row carries `archived`.
  - `stage`: unfulfilled/exception → new; processing → packed; partially_shipped/shipped → shipped; delivered → delivered.
  - `q`: order_number ILIKE, contact_name ILIKE, contact_phone digits contain, or `EXISTS order_unit_serials serial_key LIKE upper(no-space q)||'%'`.
  - `AdminOrderSummaryDTO` (`src/contracts/commerce.ts:448`) gains `stage: BoardStage`, `archived: boolean`, `payment: "awaiting" | "paid" | "problem"` (paid = captured AND paid/partially_refunded; problem = failed/refunded/partially-refunded-after-cancel; else awaiting), `legacy: boolean`, `itemNames: string[]` (≤3), `deliveredAt: string | null`. Response gains `counts: Record<BoardStage, number>` (same filters, active view only; `null` in archive view).
  - Tests: placement of unpaid, paid, packed, dispatched, delivered-today, delivered-yesterday, cancelled, **cancelled-after-pack (ready shipment auto-cancelled by `cancelOrder` → serial free again)**, **fully refunded**, **fully returned (received)**, failed-payment (pill `problem`), legacy, demo orders (focus: demo on board, legacy not); boundary — set `delivered_at` to today0 − 1 s and today0 + 0 s via SQL relative to `now()` in Almaty (focus 3); periods today/week/30d/custom; `q` by serial finds an archived order.
- [x] **T3.4 Detail DTO + returns serials:** ✅
  - `AdminOrderDetailDTO.items[]` gains `serialRequired: boolean`, `serialSource: SerialDecision["source"]`; `ShipmentDTO.items[]` gains `serials: { id: string; serial: string; returned: boolean }[]` (staff detail only; empty for customers).
  - `returnInput` lines gain `serialIds: z.array(uuid).max(10000).optional()`; `return_items` are per shipment item, so **the ticked serials decide which shipment items take the return quantity** (group serialIds by their shipment_item; one return_item per group; without serials the current allocation order stays); when the item's shipment items have serials, `serialIds.length` must equal `quantity` (409 `SERIALS_REQUIRED`); ids must belong to that order item, not cancelled shipment, not already on an open return; sets `return_item_id`. `update_return` reject/cancel clears `return_item_id` for that return's serials.
  - Tests: return 1 of 2 picks serial B → after `receive`, B can be packed on a new order, A cannot; rejected return frees link.
- [x] **T3.5 Customer data** ✅ (`src/server/account/service.ts`):
  - `EVENT_LABELS["fulfillment.packed"] = "Packed"`.
  - `OrderSummaryDTO` and `OrderDetailDTO` gain `stage: "ordered" | "packed" | "shipped" | "delivered" | "cancelled"` (cancelled when order_status cancelled; else from fulfillment_status as in T3.3 with new→ordered).
  - `OrderDetailDTO` gains `stageDates: { ordered: string; packed: string | null; shipped: string | null; delivered: string | null }` (ordered = placed_at; packed/shipped/delivered = earliest `created_at`/`dispatched_at`/`delivered_at` among **non-cancelled** shipments, so a cancelled pack leaves no date), `OrderItemDTO.serials: string[]` (non-cancelled shipments).
  - Tests in `tests/integration/order-board.test.mjs`: customer sees stage packed + serial after pack; no carrier/notes leaked (existing assertions pattern).
  - verify for M3: `node --conditions=react-server --test tests/integration/order-board.test.mjs tests/integration/fulfillment.test.mjs tests/integration/aftersales.test.mjs tests/integration/account-services.test.mjs` PASS; `npm run typecheck` PASS. Commit per task (`feat(fulfillment): …`).

### M4 — Admin UI (wave 4, owner: frontend-developer; verifier: evidence-collector)
- [x] **T4.1 Client API + stage helpers** ✅ `src/app/admin/orders/_components/board/orders-api.ts` (typed fetch for list/detail/actions incl. `set_serials`, idempotency keys via `crypto.randomUUID()`), `board/stage.ts` (labels, column order). Unit test `tests/unit/orders-board-state.test.mjs` for `nextAction(stage, paid, fulfillable)` → `"confirm_payment" | "pack" | "ship" | "deliver" | null` and drag rule (only one step forward).
- [x] **T4.2 Screen** ✅ `OrdersBoardScreen.tsx` (replaces `FulfillmentScreen` in `src/app/admin/orders/page.tsx` postgres branch):
  - Toolbar: title "Orders", segmented **Board | List**, period select (All, Today, This week, Last 7 days, Last 30 days, This month, Custom… with two date inputs), search box ("Order no., customer or serial"), **Archive** toggle button (shows "Back to active" when on), payment-mode filter kept as "All / Real / Demo".
  - Board (`board/BoardColumn.tsx`, `board/OrderCard.tsx`): 4 columns with count badges; card as in requirement sketch — order no., date, customer, item names, total ₸, pill amber `◔ Awaiting payment` (`#92400E` on `#FEF3C7`), green `✓ Paid` (`#166534` on `#DCFCE7`) or red `! Payment failed / Refunded` (`#991B1B` on `#FEE2E2`), small grey "Demo" tag for demo/sandbox, "Exception" red tag; primary next-step button; HTML5 drag to the next column opens the same panel; mobile: columns stack, horizontal scroll.
  - List (`board/OrdersTable.tsx`): columns order no., date, customer, items, total, payment pill, stage chip, "Imported" tag for legacy; "Load more" with `nextCursor`.
  - Order drawer (`board/OrderDrawer.tsx`): everything FulfillmentScreen offers today (confirm payment, cancel order, refunds, manual refund completion, returns, timeline, address, internal notes) moved here, plus serial list per item with edit while Packed, and return creation with serial checkboxes.
  - Pack panel (`board/PackPanel.tsx`): one row per unit for serial-required items (label "Serial number · unit 1 of 2", autofocus first empty, Enter moves to next — barcode scanners type + Enter), tick rows for others; Save disabled until all filled; server errors (SERIAL_IN_USE) shown on the offending field.
  - Ship panel (`board/ShipPanel.tsx`): carrier + tracking optional; Deliver: confirm dialog.
  - Remove `FulfillmentScreen.tsx` once the drawer covers it (grep for imports).
- [x] **T4.3 Serial settings UI:** ✅ category edit dialog (`CategoryDialogs.tsx`) gains select "Serial number at packing: Same as parent / Needs serial / No serial" sending `serialPolicy`; product editor `tabs/GeneralTab.tsx` gains "Serial number at packing: Automatic (currently: Needs serial — from category X) / Always / Never" using GET `/api/admin/orders?serialProduct=<id>` → `{ policy, decision }` and POST action `set_product_serial_policy` `{ productId, policy }` (permission `catalog:write`; handled in `src/server/fulfillment/http.ts` + service).
  - verify M4: `npm run lint && npm run typecheck` PASS; `npm run test:unit` PASS; screenshots via `/home/nick/tools/browser/review.mjs` of board, list, archive, pack panel, drawer at 1440 and 390 widths saved under scratchpad; commit.

### M5 — Customer tracker (wave 4, owner: frontend-developer)
- [ ] **T5.1** `src/components/account/OrderTracker.tsx`: `export function OrderTracker(props: { stage: OrderStage; dates?: StageDates; compact?: boolean; labels: TrackerLabels }): JSX.Element`. Four steps with lucide icons (Receipt, Package, Truck, PackageCheck); completed = circle filled `#6DCFF6` with black icon; current = cyan ring + bold label; future = grey `#D9D9D9` outline; connecting line cyan on passed segments, grey ahead; dates under steps when given (locale format); `cancelled` → all grey + "Cancelled" note. `role="list"`, each step `aria-current="step"` on current, text not colour-only.
  - Unit test `tests/unit/order-tracker.test.mjs` (render to string like `account-dashboard.test.mjs`): stage packed → 2 completed, line segment 1 cyan, 2 grey; cancelled → no cyan; aria-current on right step.
- [ ] **T5.2** Use in `AccountDashboard.tsx`: compact tracker on each order row (list ~:766 and recent order ~:729) and full tracker with dates on top of the order detail (~:866); serials under each item ("Serial number: …"); event labels translated via `t("events." + type.replace(".", "_"))` with server label fallback (`t.has`).
- [ ] **T5.3** Messages `messages/{en,ru,kk}.json` `AccountPortal.tracker.{ordered,packed,shipped,delivered,cancelled,cancelledNote}`, `AccountPortal.order.serial`, `AccountPortal.events.{order_placed,…,fulfillment_packed,fulfillment_shipped,fulfillment_delivered}` (next-intl treats dots as nesting — event type `a.b` maps to key `a_b`), `AccountPortal.status.{partially_shipped,exception}`. Test: key parity across the three files (extend existing messages parity test if present, else in `order-tracker.test.mjs`).
  - verify M5: `npm run test:unit` PASS; screenshots of account orders list + detail at each stage (EN, RU) at 1440/390; commit.

### M6 — Verify + review (wave 5)
- [ ] **T6.1** Smoke: update `demoOrderScenario` in `tests/ui/cms-smoke.mjs` to drive the new board (pack with a serial, ship, deliver) and add `CMS_SMOKE_ONLY=orders` block; run with `CMS_TEST_CHROME=… CMS_TEST_CHROME_NO_SANDBOX=1 CMS_TEST_BUNDLER=webpack CMS_SMOKE_ONLY=orders npm run test:cms-ui` PASS.
- [ ] **T6.2** Full: `npm run test:unit`, `npm run test:integration`, `npm run check` — record counts.
- [ ] **T6.3** Review: `code-reviewer` agent on the branch diff vs 0b82ec7; fix confirmed issues (one targeted repair each).
- [ ] **T6.4** Re-run the serial report on the staging prod copy with the final code; give owner the summary (needs serial / no serial / guesses). Fill Result + Handoff; update memory.

## 6. Verification
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run check`
- `CMS_TEST_CHROME=/home/nick/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome CMS_TEST_CHROME_NO_SANDBOX=1 CMS_TEST_BUNDLER=webpack CMS_SMOKE_ONLY=orders npm run test:cms-ui`
- Screenshots (board/list/archive/pack/drawer/account tracker) reviewed against requirement 1–4.

## 7. Rollback
Migration 0030 is additive (new table + nullable columns + policy values). Code rollback: `switch-version.sh 0b82ec7` — older image ignores the new table/columns; serials stay stored. Pre-deploy: dump + env backup as for earlier deploys. At beta5 merge: re-apply as the next free number after beta5's re-applied traffic migration (0031 is taken → 0032), same idempotent SQL; seed does not re-run (see T1.1).

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-25: requirement drafted from brainstorming (approach 1 chosen by owner).
- 2026-11-25: builder-check decisions added; requirement approved by owner.
- 2026-11-25: plan approved by owner ("yes"); executing inline (native).

## Result
Delivered: · Checks run: · Gaps: · Follow-ups:

## Handoff
Requirement approved 2026-11-25; XL plan written (sections 4–7), awaiting owner approval. Work happens in /home/nick/worktrees/grmn-homepage-deploy on branch homepage-deploy (live 0b82ec7). Start at M1/T1.1.
