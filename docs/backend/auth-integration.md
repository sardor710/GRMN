# Authentication integration — Task 05B

Implemented 2026-11-11 using the Task 05A Better Auth 1.7.19 / Next.js 16.2.1 foundation. Authentication remains disabled by default (`AUTH_ENABLED=0`). No real bootstrap, identity import, provider delivery, migration, deployment or external send was performed.

## Entry points and authority

- Every `/api/admin/**` data operation delegates to `src/server/auth/admin-service.ts` through the private runtime adapter. Both the service and runtime validate an active, signed DB session, staff membership and per-session MFA admission. The runtime checks permission before importing the legacy store; the service rechecks before accessing it. Disabled runtime access is 503; no session/forged legacy cookie is 401; staff admission or permission denial is 403. SQL/library failures produce a safe 503 without raw errors or credentials.
- The old login/logout URLs delegate to the restricted foundation (`/sign-in/email` and `/sign-out`) and expire `garmin_admin_session`. No source password, username alias, default password or base64 cookie grants identity. `/api/admin/auth/me` returns an explicit DB-derived staff view; it never reads source admins.
- Every private admin `page.tsx` is a Server Component that calls `authorizeAdminPage` before rendering its client screen. A layout alone is not the boundary. Request headers are read outside the error handler so Next request-time rendering cannot be accidentally swallowed as an unavailable static page. Enabled unauthenticated pages redirect to `/admin/login`; forbidden/unavailable pages render a clear denied state. Navigation follows permissions, and sensitive-page denials link to fresh MFA verification.
- Since Task 10A, `/api/account/{profile,addresses,addresses/[id],orders,orders/[id]}` serves only the signed-in session owner.
  - It is available only when `CMS_BACKEND=postgres` and `AUTH_ENABLED=1`; otherwise it returns 503, with no shared or demo fallback.
  - Email, phone and user-ID query selectors are rejected with 400. Resources the caller does not own return 404.
  - Writes require the same-origin `Origin` header.
- `/account` still shows only an unavailable notice. `AccountDashboard.tsx`, its profile/address/order literals, source JSON and all old business values remain preserved for extraction until 10B wires the UI.
- Historical (legacy) order claims and verified phone change remain Task 10B.

## Permission matrix v1

All entries additionally require active staff membership and a per-session MFA grant. Fresh proof means a grant verified in the last 15 minutes.

| Resource | Read | Mutation | Additional restrictions |
|---|---|---|---|
| Products | `catalog:read` | `catalog:write` | Creation or explicit stock requires `inventory:write` |
| Discounts | `catalog:read` | `catalog:write` | Strict existing fields only |
| Banners, blogs, homepage | `content:write` | `content:write` | Homepage PUT accepts only `{config}`; reset accepts only `{action:"reset"}` |
| Clients | `customers:read` | `customers:write` | All mutations closed, 501 after authorization; directory read-only |
| Orders | `orders:read` | `orders:fulfill` | Only existing-order fulfillment/tracking/notes updates; financial fields additionally require fresh `payments:refund`, then remain 501 |
| Staff | fresh `staff:manage` | fresh `staff:manage` | Read lists actual DB staff via safe DTO; creation/role/password/lifecycle changes closed, 501 |
| Settings | fresh `settings:write` | fresh `settings:write` | Strict documented settings fields only |
| Exports | unavailable | unavailable | Browser export controls removed until the authorized, audited export workflow exists |

`super_admin` receives all 12 permissions; `product_manager` has catalog read/write plus inventory write; `editor` has catalog read plus content write; `support` has customer/order read. The current DB assignment is authoritative on each request. No role or actor submitted by the client is trusted. Mutation capabilities that are unavailable must never fall back to legacy JSON account writes.

## Inputs, output and source isolation

Mutations require the configured exact origin and JSON content type. The bounded streaming reader admits at most 128 KiB; content-length claims do not bypass it. Strict Zod objects reject unknown fields, including credentials, actor/role injection and nested unknown input. URLs only accept HTTP(S), local absolute paths or `#`; numeric values and arrays have explicit bounds. GET query fields and duplicate/unknown delete query fields are rejected. Auth requests retain their smaller 4 KiB limit and shared persistent budgets from 05A.

Every protected response is `Cache-Control: no-store` and varies by Cookie. Response DTOs recursively validate primitive, array and object types and omit malformed legacy values rather than copying arbitrary objects through allowed keys. Projection includes nested order items, coordinates, milestones, product specs, features and string arrays. Staff credential/account/MFA/session columns never enter these DTOs. Source `createdAt` metadata stays read-only: UI mutations omit it. No broad request body is spread into legacy persistence.

The temporary JSON adapter is private and has no staff/customer save path. It continues to support permission-guarded catalog/content/settings and limited fulfillment operations until Task 08. It is not a transactional, multi-process production persistence layer; write concurrency, audited actors and transaction-level domain authorization move to the owning backend services in later tasks. Monetary/refund/accounting execution remains closed pending the commerce workflows in Tasks 13–17.

The pre-existing client product import graph could reach `cms/store` and its complete private dataset. `public-products.ts` now owns the exact moved `watchFamilies`, `products`, `activityFilters`, `levelFilters` and `caseSizeFilters` literal text. `products.ts` re-exports those public definitions for stable server consumers and retains its server repository functions, accessories/detail data and metadata. Public components import only the public module. The store, seed and server product repository are poisoned with `server-only`; the boundary checker also rejects direct/transitive access to the private legacy JSON even if a poison import is removed. Seed literals retain their distinct variants unchanged. Task 06 extraction must follow the public re-exports and moved admin screen paths under `_components`.

## Staff browser flow and recovery

`/admin/login` starts with blank credentials, then either requests first authenticator enrollment or prompts for an existing TOTP/unused backup code. First enrollment shows the authenticator setup URI and backup codes in memory, requires private recovery-code acknowledgement and confirms a live authenticator code before admission. It stores neither setup secrets nor credentials in localStorage. The sign-in page also supports fresh MFA verification for an existing session; the header links to it.

Library proof consumption/rotation commits before application admission. Initial admission/audit failure returns `MFA_ADMISSION_RETRY` (503) and the signed response cookie needed to revoke the actual unadmitted session. An enrolled session without a grant is now prohibited from direct MFA verification (`MFA_RESTART_REQUIRED`,409), including an old password-only session whose factor was enrolled elsewhere. It must restart password sign-in. This policy derives from authoritative session/factor/grant state and needs no new table or migration. A failure refreshing a **previously admitted** session instead returns `MFA_STEP_UP_RETRY`; rollback leaves the prior grant unchanged, without extending freshness. Its UI clears proof state and explains that distinction.

Recovery clears password/code/setup URI/recovery codes synchronously and switches to a restart-only state **before** making any cleanup call. HTTP errors, rejected fetches and non-JSON responses leave that state in place with only sign-out/restart available. The helper accepts cleanup only when the response is successful and explicitly acknowledges success. Initial admission failure requires a new password stage and authenticator or a different unused backup code. A pending password-stage MFA challenge is also cancelled by acknowledged restart, even when no full session exists.

Sign-out uses an application-owned authoritative transaction instead of trusting the pinned library endpoint, which swallows delete errors. Under the same cross-instance advisory lock used for MFA consumption, it verifies the particular signed session/challenge cookies, deletes the addressed session (cascading its grant), deletes hashed/plain-compatible verification identifiers for that challenge and attempt counter, and confirms absence before commit. Only after commit are session/challenge cookies expired. A database failure leaves browser cookies available for a real retry and returns503. Tests inject an actual session-delete failure, confirm the admitted row/grant and cookie remain, then confirm a successful retry revokes the saved signed cookie. This narrow implementation is coupled to the pinned DB-only session/verification mapping and configured absence of external providers/cache; revisit it before any provider, adapter or storage change. Normal header sign-out navigates only after acknowledgement.

SEO now has strict metadata-only PATCH on products/blogs: id plus SEO title/description/keywords/canonical/noIndex/image only. Existing-record checks and catalog/content write permission apply, while stock/price/business fields are rejected. Server-derived permissions disable unauthorized editor actions; the shared client helper checks HTTP status and explicit acknowledgement. Batches report actual saved, failed and permission-skipped counts, and individual failures retain the edit form. Product metadata changes do not submit stock or require inventory permission.

All wired dashboard/order export handlers are removed while exports are closed. Shared product/article/breadcrumb JSON-LD sinks serialize less-than characters as JSON Unicode escapes, preserving the text value while preventing an HTML script delimiter. Regression tests render each actual JSX component to HTML using inert delimiter text and verify one script boundary and round-trip content.

Reset, recovery, MFA disable, staff invitations/role changes, lifecycle/revocation UI and real providers remain unexposed activation gates. Operators must approve and implement those policies before real staff/customer launch. Existing source admins cannot be activated through this UI. Do not restore legacy authentication as rollback.

## Verification scope

Final checkpoint corrections use the pinned Better Call parser **and signed-cookie verifier**, including whitespace, quoted values, duplicate precedence and equivalent Base64 signature bytes. MFA response-cookie overlays use the same first-duplicate selection as the actual proof handler, so a proof cannot admit a different same-user session. The legacy adapter now propagates write failure as an unavailable result and does not publish an unpersisted edit in its cache. Required dashboard collection denials/failures show an explicit unavailable view instead of deriving empty business metrics; successful empty responses remain valid.

See the task handoff/report for commands and results. Disposable PostgreSQL tests exercise the same guarded handler/service dispatcher with an injected synthetic store and actual signed sessions/role/MFA state. Separate tests call the actual disabled Next route exports and statically inventory all bindings/page gates. These are not enabled Next HTTP/browser end-to-end journeys. No real database, source identity or provider was used.


## Deferred review minors

The query-only DELETE path currently ignores unexpected bodies; the blanket JSON-mutation contract has that known exception. Independent boundaries still perform repeated authorization projections, and some identity views read a second snapshot. Dense dispatcher formatting remains. Sidebar SEO visibility still requires content permission, although catalog readers can reach the guarded page through the header/direct URL. These four minors are deferred. The prior dashboard denial-to-zero issue was regraded Important and fixed. Existing illustrative charts, currency conversion and timeframe calculations are not production financial reporting; those broader concerns remain for later reporting/pricing work.
