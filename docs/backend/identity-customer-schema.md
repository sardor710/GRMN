# Identity and customer schema — Task 03A

Date: 2026-11-10. Initial migration: `drizzle/0000_identity-customers.sql`. Source models: `src/server/db/schema/identity.ts` and `customers.ts`. This migration has been exercised only on disposable synthetic PostgreSQL; no real database migration/import or auth replacement has occurred.

## Compatibility basis

The schema follows **installed Better Auth / Drizzle adapter 1.7.19**, not an assumed older schema. `src/server/auth/schema-options.ts` is a schema contract, not an auth instance or HTTP route. It selects UUID IDs, core user/session/account/verification, phone plugin, staff MFA fields and database-backed rate-limit storage. Its OTP sender throws until explicitly configured, and `signUpOnVerification` is not enabled. No placeholder emails are generated.

`authTables` maps logical model names (`user`, `session`, `account`, `verification`, `twoFactor`, `rateLimit`) to the actual Drizzle tables. Adapter lookup uses these keys even though physical tables use names such as `auth_sessions`. Do not turn on adapter joins without adding/test-driving the required relations in the later auth task.

`auth-schema-contract.json` records installed expected fields and actual SQL types/nullability. Unit tests compare directly against the installed package's metadata; real PostgreSQL tests call the actual adapter to create/read UUID-backed users, sessions, accounts, verification, MFA and shared rate counters. The migration snapshot/journal and SQL must stay in sync. No new dependency was required in this task.

## Email-free checkout and authenticated users

Better Auth 1.7.19 requires a non-null email on an authenticated `users` row. A quick-checkout customer instead starts as a **provisional `customer_profiles` record**, with name/entered phone and no user/email required. Its order delivery snapshot is a commerce-domain table in Task 04; it does not require inventing a saved authenticated address.

For a returning provisional customer, the later auth task will verify/consume the phone OTP and issue only a short-lived profile-completion capability. The installed phone plugin provides a server-only OTP-consumption operation that does not create a user/session; no delivery or endpoint is connected now. The capability is hashed, expires, and has the fixed `complete_profile` scope. It does not authorize staff actions, other customers' records, or unrestricted old-order claims.

After required name/email/phone completion and identity checks, create/reuse the real auth user and atomically link its canonical customer profile. Normal phone login can then establish a regular session. Entering a matching phone/email at checkout never performs that link or changes an existing account. Email remains unverified until a separate approved flow; contact possession and marketing consent are distinct facts.

This refines the earlier nullable-auth-email proposal while preserving the owner's checkout requirement. No incomplete customer needs a fake email. Final delivery provider, recovery/recycled-number policy and eligible legacy-order claim proof still belong to Task 05/10.

## Tables and view

| Object | Main keys / storage / constraints |
|---|---|
| `users` | Application UUID; required nonempty name/normalized unique email; email verified flag; optional unique canonical phone only when verified; account status; MFA enabled; timestamps |
| `auth_sessions` | UUID; user FK; unique library session token; expiry and user indexes; library-owned credential format |
| `auth_accounts` | UUID; user FK; unique provider/account pair; optional password hash/provider secrets/expiry/scope; restricted access |
| `auth_verifications` | UUID; identifier/value/expiry; identifier and expiry indexes; token/OTP representation must follow pinned auth security configuration in Task 05 |
| `auth_two_factors` | UUID; user FK; secret/backup-code storage, verification state, nonnegative failure counter and lock expiry; runtime encryption/MFA behavior is Task 05 |
| `auth_rate_limits` | UUID; unique key; nonnegative count and bigint epoch milliseconds; shared state for multiple app processes |
| `phone_identities` | View over verified `users.phone_number`; one canonical phone source, no separate mutable phone table to synchronize; grant application consumers read access only |
| `roles` | UUID; unique code among super_admin/editor/product_manager/support; no seeded membership |
| `permissions` | UUID; unique nonempty permission code; assignment policy enforced by future staff service |
| `user_roles` | Composite user/role PK; referencing indexes and FKs |
| `role_permissions` | Composite role/permission PK; referencing indexes and FKs |
| `customer_profiles` | UUID; nullable unique linked user; optional unique legacy client ID; name, raw entered phone, optional normalized phone/email/country/birthday/avatar; status, provisional/complete state, positive version, timestamps |
| `customer_private_notes` | UUID; profile FK; optional real author FK or legacy actor label; body/timestamps; never a public DTO |
| `customer_addresses` | UUID; authenticated owner FK; label/recipient/phone/country/city/street/optional region/postal; primary flag; positive version/timestamps; unique primary per user |
| `customer_preferences` | One row per profile; optional kk/ru/en preference without choosing a translation strategy; marketing request defaults false; positive version/timestamp |
| `consent_events` | UUID; profile/optional actor FKs; purpose/channel/action/policy/source; separate occurred/recorded timestamps; append-only mutation trigger |
| `customer_completion_sessions` | UUID; optional provisional profile FK; canonical proved phone, unique 64-character hash, scope, verification/expiry/consumption/revocation times; expiry/profile indexes |

All new internal IDs are application UUIDs; direct SQL callers must supply them. Auth options use `generateId: "uuid"`; customer repositories will use the declared application default functions. Timestamps are `timestamptz`; birth date is a date. Active state is never inferred from a UUID or mutable contact field.

## Important constraint boundaries

- Auth email must be lowercase and trimmed; duplicate email is rejected. Customer contact email may be null and is not unique/verified ownership. Raw legacy source values remain in the protected migration staging snapshot until normalization is reconciled.
- Canonical authenticated phone is unique and verified. Multiple unverified profiles may contain the same entered phone; preserving them avoids unproved merges. SQL checks establish shape/state, not proof an OTP was actually delivered; the later trusted service supplies that proof.
- A complete profile requires a linked user, email and normalized phone. The service must additionally verify that those fields belong to the linked identity; SQL local checks cannot prove external phone possession.
- Saved-address partial unique index prevents two primaries even under competing inserts. **Max five addresses and exactly one primary when nonempty remain serialized service rules for Task 10**, not falsely claimed as implemented here. Test coverage includes two simultaneous primary inserts with one winner.
- Auth session/account/MFA rows cascade when their user can legitimately be removed. Customer profile/address/history references restrict deletion, so library user deletion cannot erase commerce data. Disable/anonymize through an explicit later policy instead of deleting an account blindly.
- Consent update/delete is rejected by a custom SQL trigger; withdrawal appends a new event. This evidence rule is application-facing, not an invented jurisdictional retention period. Privileged retention/anonymization requires a separately reviewed migration/process. Do not grant runtime TRUNCATE/DDL rights.
- MFA/session/provider/verification data are secrets regardless of storage column type. No table is a public response schema. Typed public DTOs, permissions and auth endpoints are implemented later.
- Profile country/phone normalization and remaining legacy field mapping need the Task 06 source reconciliation; preserve raw originals rather than guess an ISO code, birthday, contact city, money summary or verified identity.

## Saved-address map pin (migration 0013)

`customer_addresses` gains optional `latitude`/`longitude` (`numeric(9,6)`, about 0.11 m resolution) and `geo_precision`:
- `exact`: a geocoded point
- `street`: street-level
- `locality`: city or settlement centroid
- `manual`: a pin the customer placed

The checks are:
- `customer_addresses_geo_pair`: both coordinates or neither
- `customer_addresses_geo_range`: latitude from -90 to 90, longitude from -180 to 180
- `customer_addresses_geo_precision_valid`: a known value, and only when coordinates exist

Coordinates without a precision are allowed. node-postgres returns the numbers as decimal strings, e.g. `"43.238949"`. Existing rows stay unpinned. The 0006 address guard and primary triggers are unchanged. Each address write still serializes on the owner and requires READ COMMITTED. A pin is customer-entered delivery data: keep it out of logs and public DTOs, like the rest of the address.

## Migration and recovery

The first migration is additive: 16 new tables, one view and one trigger function/trigger; no original source-data update, role grant, customer import or seed occurs. The custom consent trigger is intentionally appended to reviewed SQL; Drizzle snapshots do not model it, so later changes require explicit custom migration SQL.

Run migrations only through the explicit migration command/credential path once the target is deliberately selected. Runtime DML credentials must not own tables or receive CREATE/TRUNCATE. The disposable test creates a restricted DML-only role and demonstrates query access but rejected ALTER/TRUNCATE; this does not provision a real VPS runtime role.

Tests apply the initial migration to an empty PostgreSQL cluster and replay the same history without adding another journal entry. Task 03B will append a new catalog/media migration to this now-completed migration history. **Do not regenerate/overwrite 0000 after it is shared/applied to a persistent environment.** No down/reset command is provided. For a failed disposable test, stop its owned cluster and preserve unknown-state files; for future persistent environments use backup plus a reviewed forward migration.

Historical source records have not been converted. Missing catalog references, legacy money currencies and imported-user claiming are still unresolved import gates. Localization, payment/carrier/email integrations and business workflows are unchanged.

Primary documentation: [Better Auth schema concepts](https://better-auth.com/docs/concepts/database), [phone plugin](https://better-auth.com/docs/plugins/phone-number), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Drizzle schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration). Installed package code is the compatibility authority for the pinned version.
