# Account tab dispositions (Task 13A)

Task 20 was merged into Task 13. The wishlist is built (13A). Every other account domain from the
legacy demo account page has the disposition below. "Preserved" means any source record the legacy
JSON held is kept untouched by the migration and its import receipts; nothing is converted into a
fake PostgreSQL record, and no tab shows placeholder rows.

| Tab / domain | Disposition | What the customer sees now | What it would need |
|---|---|---|---|
| Profile, addresses, phone | Built (Tasks 10A–10C) | Session-owned data | — |
| Orders, legacy claims | Built (Tasks 10A–10C) | Session-owned order history | — |
| Wishlist | Built (Task 13A) | Saved products; archived ones marked unavailable | — |
| Registered devices | Preserved and deferred | "Device registration is not available yet." | A device/serial data model and an owner decision on proof of purchase |
| Warranty | Preserved and deferred (no tab) | Nothing; no warranty claims are offered | Warranty terms, claim workflow and staff tooling (owner decision) |
| Subscriptions & plans | Preserved and deferred | "You have no subscriptions. Subscription management is not available yet." | A subscription product and billing provider (deferred activation backlog) |
| Support / service requests | Preserved and deferred (no tab) | Nothing; contact details stay on the public site | A support channel and ticket model (owner decision) |

Rules that hold for every deferred tab:
- No seeded, demo or sample records are shown. The unit test
  `the account tabs that are not built yet say so and show no records` pins the two visible tabs.
- Nothing is selected by email, phone or typed contact; any later build derives the owner from the session.
- Deferred domains are not chained tasks. Each needs an owner decision or a provider first.
