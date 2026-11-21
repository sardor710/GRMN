# Backend decisions and open items

Date: 2026-11-10. Source: the owner's answers in this chat, followed by a read-only Task 01 repository inventory. This register overrides earlier unconfirmed defaults in the [XL plan](../plans/2026-11-10-postgresql-backend-migration-xl.md).

## Confirmed by the owner

| ID | Decision | Effect on the backend plan |
|---|---|---|
| D01 | Languages: Kazakh, Russian, English | Reserve locale support for `kk`, `ru`, `en`; preserve Unicode. Translation storage, URL/fallback rules and editorial workflow will be reviewed later. Do not prebuild a translation strategy now. |
| D02 | All existing business data is real; prices can be revised later | Preserve current products, customers, orders and other source records. Code labels such as seed/demo are provenance, not permission to delete or reclassify them. Preserve current price values; a later catalog price edit must not change historical order amounts. |
| D03 | Payments remain demo for now; Kaspi Pay and a second provider such as Freedom will be connected later | Keep an explicit demo adapter/environment. Never equate a new simulated payment with captured money. Real provider selection/eligibility, live webhooks, settlement, capture/refund behavior and fees are deferred. Existing historical payment statuses are preserved with legacy provenance. |
| D03a | Owner request 2026-11-21: "Enable demo buys now. All available products should be available for purchase. Without merchant payment checks. Just skip that part and make demo purchases so we could check sales and admin dashboards." | Demo purchases complete as **paid** through a separate, honestly named `sandbox` provider in the `sandbox` environment (orders `payment_mode='sandbox'`, migration 0015). The sandbox adapter auto-captures inside the checkout request through the normal capture path: stock reservation consumed, coupon consumed, `order.paid` event, a `payment_transactions` capture row with `provider='sandbox'`, `environment='sandbox'`. Sandbox money is **never** live money: dashboards and reports show it as a separate "Demo (sandbox)" series next to live, admin orders carry a "Demo" badge, and accounting exports exclude sandbox orders unless the export explicitly includes them. Staff can ship sandbox orders end to end. Gates: registered only when `DEMO_PURCHASES=1`; refused when `NODE_ENV=production` unless `DEMO_PURCHASES_ALLOW_PRODUCTION=1`; refused when a live provider is registered or `store_settings.payment_mode='live'`. D03 still holds for the `demo` provider: its triggers are unchanged and a `demo` attempt can never reach captured, and a sandbox capture is never reported as live revenue. |
| D04 | Staff arrange shipping themselves; carrier/back-office details are not customer-facing | Internal fulfillment actions and staff-only logistics fields; no customer carrier integration or public tracking map required now. Preserve existing logistics data in restricted storage. Review integrations later. |
| D05 | Deploy on VPS; determine minimum resources when the project is ready | Default to self-hosted Next.js + PostgreSQL + durable worker on private networking, persistent volumes and independent backups. No managed DB subscription or server purchase selected. Size after representative tests. |
| D06 | Guest/quick checkout requires name, phone number and delivery address; email is optional until account completion | Create a provisional customer/order association without exposing or modifying an existing phone owner's account. Later phone verification claims/links eligible orders, creates/reuses a canonical account and allows profile completion. |
| D07 | Normal signup/profile completion needs name, email and phone; login must support the same phone | Store profile-completion state separately from verified identity. Require name, phone and delivery address for quick checkout; email is optional until full signup/profile completion. Never fabricate a customer email. |
| D08 | Wishlist, promo codes, and admin-managed discounts are required | Wishlist becomes core launch scope with persistent ownership. Promo codes and product discounts are separate features with defined stacking and price snapshots. |
| D09 | Email updates and newsletter added later | Reserve preferences/consent/delivery boundaries; no email provider, automated campaign, or sending in current scope. Phone verification cannot depend on transactional email being enabled. |
| D10 | Expected daily users: 200–500, up to 1,000 normally, potentially 5,000 during promotions | Use these as planning traffic estimates, not simultaneous users/RPS. Retain 5,000-product / 100k+ registered-user growth envelope. Measure peak arrival/concurrency and resource usage before selecting the VPS. |
| D11 | Base prices and checkout use KZT; USD is display-only | All new orders, discounts, tax/shipping amounts and provider payment requests use KZT. Do not add USD settlement or separate manually maintained USD product prices. |
| D12 | Owner manually maintains the USD conversion rate in admin | Store a positive decimal rate with explicit direction: KZT per 1 USD; permissioned, audited and versioned updates. No live FX feed. Converted display uses that rate; historical purchases remain unchanged. |

## Proposed engineering rules (not owner claims)

1. **Phone ownership:** Normalize phone numbers to E.164 with an explicit country selection. A verified phone identity is unique; an entered phone on an order is not verified ownership. Use OTP through an approved provider or equivalent verified flow before account/order access. Store verification expiry, attempts, cooldowns and reuse protection. Do not merge orders/accounts from matching text alone. Recycled numbers and account recovery need a documented policy.
2. **Provisional profile:** Save a nullable user link, entered name/phone/delivery-address snapshots, and `profile_state=provisional`. Two unverified checkouts may reference the same entered phone without granting either access to the other's orders. After OTP, serialize claiming/linking and preserve an audit trail. Auth-library defaults that require a temporary email must be evaluated explicitly; no invented deliverable email or accidental mail to a placeholder.
3. **Required fields:** Owner clarification supersedes the earlier interpretation: quick checkout requires name, phone and delivery address; email stays optional until full signup/profile completion. Subsequent phone login uses proof of possession rather than repeatedly asking for name/email. A typed phone alone never grants access.
4. **VPS topology:** TLS reverse proxy, unprivileged app and worker, private PostgreSQL, bounded pools, persistent database/media volumes, health checks, secret injection, host monitoring, security updates and off-host recoverable backup. A single VPS is a single failure domain; it does not imply high availability.
5. **Discount modeling:** Admin product/variant markdown rules calculate current selling prices; coupon codes apply eligible checkout adjustments. Preserve base/compare-at amounts, validity windows and allocations; decide stacking policy before activation, defaulting to nonstackable until approved.
6. **Feature gates:** A disabled payment/carrier/email integration is allowed to be explicitly deferred. Do not fabricate successful external effects. Production checkout cannot be described as accepting online payments until a real provider passes qualification; an offline/manual order workflow needs its own payment/status policy.

7. **Task 03A pinned-adapter ruling:** Better Auth 1.7.19 requires email for a core auth user. Incomplete quick-checkout customers therefore remain provisional profiles with nullable auth link/email, and phone-proved profile completion uses a restricted expiring hashed capability before a full auth user/session is created. No fake-email signup is enabled. Phone identity is a read-only view of canonical verified auth-user phone, avoiding duplicate identity writers. See `identity-customer-schema.md` for actual constraints and tests. No live phone/auth route is activated by this schema choice.

## Open decisions and when they matter

| ID | Question / missing evidence | Required before | Safe action meanwhile |
|---|---|---|---|
| O01 | Launch currency resolved: KZT, USD display-only. Historical source amount currencies still require separate confirmation | Historical money conversion/import | Preserve raw legacy amounts exactly; no automatic relabeling or conversion from the new launch policy |
| O02 | Resolved by owner: quick checkout requires name/phone/delivery address; email optional until full signup/completion | Validate in Task 02 contracts | No missing email fabricated; existing-account login uses verified phone |
| O03 | Business jurisdiction, selling countries, phone country scope, tax/receipt rules, shipping fee rules and return policy | Real checkout and production policy setup | Preserve current fields and keep rules versioned; no hardcoded tax assumption |
| O04 | OTP provider/channel, delivery availability/cost, sandbox method, lost/recycled-number recovery | Phone login/signup going live | Evaluate library capability; no live OTP or mock-verified production sessions |
| O05 | VPS provider/region/OS/budget, off-host storage, administrator/operator | Infrastructure purchase/deployment | Portable containers and benchmark design; no hardware minimum promised |
| O06 | Actual future order rate, peak duration and cache/endpoint mix | Performance acceptance/VPS sizing | Use explicit synthetic stress envelope separately from daily-user forecasts |
| O07 | Whether manual orders can be accepted before real payment integration, and how staff confirm payment | Checkout launch with demo adapter still present | Demo remains clearly marked and isolated; no new fake-paid status |
| O08 | Inventory source accuracy and whether one stock location is enough | Live reservation/fulfillment activation | Preserve opening stock with provenance; do not decrement current files |
| O09 | Retention, RPO/RTO/availability objectives and operational budget | Production release | Existing plan targets remain provisional and must be proved on the actual VPS |
| O10 | Which stored order references map to current/static/retired products? | Financial import reconciliation | Preserve order-item snapshots and unresolved source reference; no invented sellable product |
| O11 | Localization storage/routing/fallback and translation source | Language implementation task | Preserve current original text and reserve locale identity; do not migrate to an unapproved translation model |
| O12 | Carrier/account tabs/devices/subscriptions beyond selected launch features | Feature disposition in Task 20 | Preserve source records; do not invent manufacturer/provider integrations or delete real records |

The owner answered the launch currency and checkout-field questions and confirmed USD display-only. On 2026-11-11 they also confirmed existing saved product prices and historical order totals as KZT in tenge; see the scoped import clarification below. Other source groups' monetary semantics and the explicitly listed operational items remain open.

## Manual USD display conversion contract

Owner clarification, 2026-11-11: existing saved product prices and historical order totals are **KZT, expressed in tenge (major units)**. Tasks 06–07 may validate exact conversion of persisted CMS product prices/original prices and order item/total amounts to integer KZT minor units (exponent 2), preserving original values and rejecting unsupported precision. This does not automatically confirm static/accessory prices, coupon money or reported customer lifetime baselines from other sources. No source values are rewritten and no real-target import is authorized by this clarification.

- Canonical new catalog/checkout currency is KZT. Customer currency selection changes display only; checkout clearly states that the actual payable amount is KZT. USD presentation is an estimate based on the manually configured rate.
- Proposed rate direction is explicit: `kzt_per_usd`, meaning KZT for 1 USD. Compute USD display from KZT divided by that rate using decimal/rational arithmetic and the configured display rounding. Never use the rate to rewrite stored KZT prices or order totals.
- Store immutable `exchange_rate_versions` with pair/direction, decimal value, author, timestamp and version; store settings points to the active version. Reject missing/zero/negative/nonfinite/overprecision inputs. No active valid rate means USD display is unavailable while KZT remains usable.
- Rate edits require an explicit pricing/settings permission and audit record. Invalidate public converted-price cache after commit; include rate version and display currency in cache keys/DTOs. Editing an order's historical KZT amount is never a side effect of changing the rate.
- When a USD equivalent is retained on a quote/receipt, snapshot rate/version and the converted value as presentation metadata, separate from authoritative KZT ledger amounts. Historical snapshot display must not silently change to the latest rate.
- Task 04 adds rate storage, Task 13B implements conversion and snapshot tests, Task 19B exposes the manual admin editor, Task 21 verifies cache invalidation. No external FX service is required.

## Dependency compatibility assessment

Read-only package registry queries and primary documentation were checked on 2026-11-10. These are candidate versions, not installed/pinned dependencies or a runtime integration test.

| Component | Observed / candidate | Assessment |
|---|---|---|
| Existing app | Next.js 16.2.1, React/React DOM 19.2.4; root engine Node >=24 | Preserve current framework versions unless separately required |
| Local runtime / Docker declaration | Node 24.11.1, npm 11.6.2; Docker default Node 24.14.1-slim | Local and declared container versions differ; align and test later, no image started now |
| Better Auth | Registry 1.7.19 | Published peer ranges include Next 16, React 19, pg 8, Drizzle ^0.45.2 and Kit >=0.31.4 |
| Better Auth Drizzle adapter | Registry 1.7.19 | Explicit adapter package documented; inspect pinned package exports/schema generator in Task 02; do not copy unversioned examples blindly |
| Drizzle ORM / Kit | Registry 0.45.4 / 0.31.11 | Stable candidate pair matching observed auth ranges; current online Drizzle guide shows RC examples, which are not a reason to install prereleases |
| node-postgres | Registry pg 8.23.1, Node >=16 | Node 24 satisfies stated engine floor; SQL/driver/pool integration still needs Task 02 real-DB test |
| PostgreSQL | Supported 18 major proposed, current minor chosen at implementation | Official versioning policy supports major versions for five years; avoid unsupported or prerelease server images |
| Phone auth | Better Auth phone plugin supports OTP and phone sign-in/up | Feature availability only; delivery provider, provisional no-email behavior and secure account linking still require tested design |

Sources: [Better Auth phone plugin](https://better-auth.com/docs/plugins/phone-number), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Drizzle PostgreSQL drivers](https://orm.drizzle.team/docs/get-started-postgresql), [PostgreSQL support policy](https://www.postgresql.org/support/versioning/). Registry observations came from `npm view <package> version engines peerDependencies --json` as applicable. No dependency was installed and no lockfile was changed.

## Hosting and recovery assessment

Task 05A runtime decision (2026-11-11): retain the pinned Better Auth/Drizzle mapping, but exclude the raw phone/signup/recovery HTTP endpoints. Use application HMAC challenges and verified-phone completion capabilities, with distinct provisional customers and required-email auth users. Staff admission requires successful TOTP/backup proof for each session, not just an enrolled-user flag. Resolve current roles/permissions/admission together and commit admission plus audit atomically. Store application budgets separately from library counters because library cleanup has different window semantics. Initial staff MFA operations use a conservative shared advisory lock and need at least two pool connections; benchmark before changing that design. See [auth-foundation.md](auth-foundation.md). Provider delivery, recovery, proxy deployment and real staff activation are not supplied by this decision; legacy route replacement remains 05B.

The root Docker/Compose files describe an app and a development service, not a complete database deployment. They contain no PostgreSQL service, database volume, production worker, TLS reverse proxy or backup setup. `.dockerignore` excludes `scripts`, so the future worker must have an explicit build/package path. A separate Laravel/Vue-based FusionCMS subtree is not launched by root Compose; ownership beyond this checkout remains unverified.

Do not purchase capacity for 100k users up front. Provision actual disk/CPU/RAM for launch and grow based on measurements; a VPS still charges for its allocated plan even when the tables are small. Exact minimum resources and provider quotes are intentionally deferred at the owner's request. PITR on self-hosted PostgreSQL requires a valid base backup plus continuous WAL archive; ordinary logical dumps alone do not meet a PITR design. See [PostgreSQL recovery documentation](https://www.postgresql.org/docs/18/continuous-archiving.html).

## Task 01 execution rulings

- Documentation and static inventory only in the current checkout; no product code, dependency installs, database creation, source-data rewrite, environment values, deployment or external messages. No implementation branch/worktree is needed for this bounded documentation step.
- Stop after Task 01 despite generic execution-skill guidance to continue all tasks; the user's request for small independent sessions and the XL plan's session boundary take precedence.
- Do not run tests/builds that execute CMS readers during inventory: `getHomepageConfig()` can write defaults on a read. Read source bytes/AST only and verify their checksums afterward.
- The metadata checksum report is not a backup. Before any source data mutation/import/cutover, take a protected full snapshot with the required recovery procedure.
