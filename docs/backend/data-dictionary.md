# Backend data dictionary — foundation v1

Task 02, 2026-11-10. This locks cross-module representations; application SQL tables/migrations arrive in Tasks 03–04. The exhaustive legacy field/type inventory remains `source-manifest.md` and `source-inventory.json`. No real data has been imported or converted.

| Concept | Logical storage / wire type | Rules / owner |
|---|---|---|
| Internal identity | UUID / string | New UUID, separate `legacy_id_map`; preserved public product/order keys never replaced |
| Legacy record | Restricted original source + source checksum and import run ID | Preserve all owner-confirmed real records, even when code calls them seed/demo |
| Customer identity | Auth user + unique verified E.164 phone identity | Provisional entered name/phone/address does not authenticate/merge; verified claim before access |
| Provisional contact | Nullable user ID, name, entered phone, optional email, profile state | Name/phone/delivery address required at new quick checkout; full profile requires email later |
| Session/principal | Auth-owned expiring/revocable session; server-only user ID/permissions | No browser-submitted role/user ID as authority |
| Guest actor | Hash of random cookie capability; server-only | Token/hash never stored in public DTO or logs |
| Product / variant | Product owns public content; variant owns unique SKU/options | Simple product has one default variant; no manufactured SKU for orphan historical item |
| Current price | `bigint` minor units + KZT / canonical integer string | No JS-number summation; historic source currencies confirmed separately before conversion |
| USD presentation | Separate converted integer string + FX snapshot | Display only; payment/refund/order ledger KZT. Retain original quote/receipt equivalent when shown |
| Exchange rate | `numeric(20,8)` proposed + version/author/time, active pointer | Positive KZT per 1 USD; manual admin editing; audit/invalidate cache; never rewrite money history |
| Product markdown | Typed fixed/percentage rule, scope, validity and version | Distinct from promo code; preserve selling/compare-at prices and checkout allocations |
| Coupon | Normalized code, rule scope/limit/dates + redemption lifecycle | Atomic reserved/used/released quota, no reset of legacy usage baseline |
| Stock | Variant/location balance + reservation + append-only movement | Nonnegative sellable on-hand/reserved; paid allocations excluded; consume/release/compensate once |
| Cart | User ID or guest capability + market/version/expiry; variant/qty lines | Max 100 lines / 99 units per line; server repricing; one winning checkout per cart revision |
| Quote | Immutable accepted price/address/policy/cart/FX snapshot + expiry | KZT grand total equals subtotal − discount + shipping + tax after tax normalization |
| Order | Immutable purchase snapshots + independent order/payment/fulfillment states | Sequence-backed unique display number; no cascade deletion; owner linkage independent of contact text |
| Order line | Nullable historical catalog link/SKU + original purchased text/options/money/quantity | Null/legacy flags where facts absent; never guess tax/payment/currency/shipments |
| Address | Structured new address or explicit raw legacy snapshot | Editing saved address cannot mutate an old order; internal locations/notes not customer DTO |
| Payment/refund | Provider attempt/transaction IDs, money, idempotency and state | One active payable attempt; unresolved refundable reservations count; demo is not captured cash |
| Manual fulfillment | Staff-only shipment/item/allocation + actual event evidence | No customer carrier/map details, carrier integration deferred; shipped quantity cannot be cancelled/restocked twice |
| Wishlist | User/product unique membership and created timestamp | Required; safe public DTOs and strict ownership |
| Content/media | Versioned blocks and metadata, persistent object/path/checksum | Retain original static copy/media; translation modeling later; private attachments separate |
| Email/newsletter | Preferences/consent boundaries and future delivery references | Integration/sending deferred; imported contact does not imply consent |
| Events/audit | Append-only occurred/recorded times, actor/provenance/dedupe | Redact secrets/PII; generated timeline not carrier evidence |
| Jobs/inbox/outbox | Stable event ID, lease, retry/dead-letter state | Worker module execution is standalone Node with documented server condition; no request fire-and-forget |

## Implemented infrastructure types

`ServerConfig`: server-only database URL and bounded pool/timeouts; parsed on explicit use, not import. Runtime credentials (`DATABASE_URL`) and migration credentials (`DATABASE_MIGRATION_URL`) are separate configuration paths. Task 02 local/test roles are development-only; Task 03/production provisioning must enforce a least-privilege DML runtime role and a separate DDL role.

`DatabaseHandle`: Drizzle `db`, owned `pg` pool and async `close`. `getDatabase` is lazy and reuses one module handle; `closeDatabase` drains it for process shutdown. Pool defaults: maximum 5 connections, acquire timeout 2 seconds, query/server statement and idle-transaction timeout 5 seconds, idle pool connection timeout 10 seconds. Bounds are validation safeguards, not a measured production sizing recommendation.

`Transaction`: derived from Drizzle's actual PostgreSQL transaction callback type. `withTransaction(database, operation)` commits on success and rolls back on rejection. Services/repositories share this type; never call the global client in a transaction that expects atomic cross-module writes.

`PageInput` / `Page<T>`: bounded cursor pagination with default page sizes in `api-contracts.md`. Cursor version/filter binding and SQL ordering arrive with repositories.

## Deliberately not fixed yet

Migration `0013_taxonomy-compatibility-geo.sql` makes these additions:
- `categories`: `kind` (`catalog`/`accessory`/`group`), unique nullable `slug`, object `preset_filters`, `nav_visible` and `description`
- `product_compatibility`: one accessory-fits-device row, scoped to all device variants, one option value or one variant; composite-FK ownership; RESTRICT deletes
- `customer_addresses`: `latitude`/`longitude` as `numeric(9,6)` (wire: decimal string) and `geo_precision`
- `products.in_the_box`: items may be strings or `{label, image?}` objects

See [catalog-media-schema.md](catalog-media-schema.md) and [identity-customer-schema.md](identity-customer-schema.md).

Task 05A adds [auth-foundation.md](auth-foundation.md), `schema/auth-runtime.ts` and migration `0005_auth-runtime.sql`: HMAC-SHA256 phone challenges with atomic attempts/consumption; session-bound staff TOTP/backup-code admission; and HMAC-keyed shared request budgets isolated from the auth library's cleanup. Signed cookies carry session/completion capabilities; raw codes, passwords and tokens are excluded from public DTOs and logs. Completion creates a new canonical profile after phone proof and required full-profile details; entered contacts never claim old profiles/orders. Task 05B replaces legacy CMS login/guards and integrates staff MFA UI without another migration; see [auth-integration.md](auth-integration.md). Customer data stays closed until Task 10; real OTP/recovery integration remains unconfigured and authentication defaults disabled.

Task 04C adds [content-operations-schema.md](content-operations-schema.md), [schema-source-dispositions.json](schema-source-dispositions.json) and migration `0004_content-operations.sql`: 29 tables covering versioned content, settings/manual FX/shipping/tax, audit/outbox/jobs/inbox/idempotency/private exports/deferred notifications, restricted import evidence and authenticated wishlists. Raw receipt bodies use bytea, rates use numeric(20,8), money uses bigint/string, and internal epochs/leases are not public DTO fields. All original field values remain pending validated import; translation strategy and service/provider activation are unchanged.

Task 04B adds [payments-fulfillment-promotions-schema.md](payments-fulfillment-promotions-schema.md) and migration `0003_payments-fulfillment-promotions.sql`: 16 tables for payment/refund facts, manual shipment/return claims, coupon quota and separate admin markdowns. Money is positive/nonnegative KZT bigint as appropriate; percentages use integer basis points. Provider identity is scoped by provider/environment/merchant. Private epochs serialize refund/quota/return writers; they are infrastructure state, not mutable financial facts. No provider or workflow activation is included.

Task 04A adds the exact stock/cart/checkout/order definitions in [commerce-inventory-schema.md](commerce-inventory-schema.md) and migration `0002_commerce-inventory.sql`: 16 tables plus `order_number_sequence`. Balances/quantities are integers; money is bigint/string; order purchase snapshots seal at commit, and events/movements are append-only. Unknown historical components stay nullable under explicit `legacy_incomplete`; unresolved currency/totals stay in protected staging. Counters and ledgers still require the planned transactional services; this does not activate checkout.

Task 03B adds the exact catalog/media definitions in [catalog-media-schema.md](catalog-media-schema.md) and migration `drizzle/0001_catalog-media.sql`: 17 tables for products, variants/options, taxonomy, typed attributes, KZT prices, directed relations and media metadata/ownership. Money and byte counts are `bigint`; DTOs use integer strings. Numeric attributes are `numeric(20,6)`. Product configuration and taxonomy epochs are internal concurrency state. Draft/private defaults do not constitute publication or storage authorization. Translation modeling and real-data import remain deferred.

Task 03A implementation now lives in `identity-customer-schema.md` and `auth-schema-contract.json`, with reviewed migration `drizzle/0000_identity-customers.sql`. Auth user email remains required by the pinned library; email-free provisional customers live outside auth users and can later use a restricted hashed completion capability after phone verification. `phone_identities` is a verified-phone view, not a second mutable identity table. This replaces any earlier implication that the core library's user email can simply be nullable.

Historical source currency meaning, jurisdiction/tax/receipt/shipping-fee rules, phone provider/recovery, localization storage/routing, manual-payment launch policy, real payment/carrier/email integrations and production VPS minimum are not filled in with guessed defaults. Schema tasks must use these contracts and the decision register while preserving those activation gates.
