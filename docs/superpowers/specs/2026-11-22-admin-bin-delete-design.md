# Admin bin-icon delete (product and SKU)

Date: 2026-11-22 · Size: small change · Branch: `feat/admin-bin-delete` (from `beta5`)

## Intent
The owner wants to clean up the catalog quickly: a bin icon on each row of the admin Products list
(`src/app/admin/products/_components/CatalogScreen.tsx`) that deletes a whole product (Grouped view) or one
variant/SKU (All SKUs view and the expanded variant rows under a grouped product).

## Goals
- Bin icon (lucide `Trash2`, icon-only, `aria-label="Delete <name/SKU>"`) on product rows and SKU rows.
- Confirmation popup every time, naming the product or SKU and saying it cannot be undone.
- **Never-ordered** product or SKU: deleted for good, including its stock history (owner confirmed 2026-11-22).
- **Ordered** product or SKU: refused with a clear message offering Archive instead; orders stay intact.

## Non-goals / anti-goals
- No change to orders, payments or checkout history; anything a shopper ever reserved or bought is never purged.
- No undo/trash bin. No change to the bulk bar's behaviour beyond sharing the new delete rule.
- Failure: a delete that leaves a product half-removed, a storefront page showing a deleted SKU, or orders losing lines.

## Constraints found
- The stock ledger is append-only in the database: `stock_movements_immutable` (0002) rejects every delete, and
  `inventory_guard_balance` (0026) only lets an untouched balance go. All 11 live products have `opening`/`receive`
  movements (the 5-per-variant receipt), none has orders, reservations, or reservation lines.
- Existing product delete (`deleteIn` in `src/server/cms/service.ts`) refuses on stock history and does not remove
  `product_compatibility` rows (added in 0023), so a product with compatibility links would also fail today.
- There is no variant delete endpoint; variants are archived through the editor.

## Approaches considered
1. **Purge only manual stock history behind a guarded migration (chosen).** Migration 0027 lets `stock_movements`
   and `inventory_balances` rows be deleted only inside a transaction that set `grmn.catalog_purge` locally, and only
   for manual movements (`opening`, `receive`, `adjust`, no reservation line or allocation) and balances with
   `reserved = 0`. Everything else stays immutable. Keeps the ledger's protection for real commerce.
2. Drop the immutability triggers. Simpler, but removes the safety net for orders and reservations. Rejected.
3. Delete = archive only. Safe, but not what the owner asked for. Rejected.

## Design
- **Deletable rule (product and SKU):** no `order_items`, no `reservation_lines`, and no stock movement other than
  `opening`/`receive`/`adjust`. Otherwise `409 CONFLICT` "has orders or checkout history; archive it instead".
- **Product delete:** extend `deleteIn` with the new rule, `SET LOCAL grmn.catalog_purge='1'`, delete the variants'
  stock movements and balances, plus `product_compatibility` rows on either side. Audit entry records how many stock
  movements and units were purged.
- **SKU delete:** new `DELETE /api/admin/products/variants?id=<variantId>&product=<publicKey>&version=<productVersion>`
  (same auth, same-origin and `requestURL()` rules as the other admin handlers). Same rule per variant. Refused if it is
  the product's last non-archived variant ("delete the whole product instead"). If it was the default, the next active
  variant becomes default. Removes the variant's prices, option selections, media links, compatibility, promotion and
  cart/wishlist lines; option values no longer used by any variant go too. Bumps the product version and refreshes the
  stored product document and catalog projection the same way a save does.
- **UI:** bin replaces nothing; it sits next to Archive on grouped rows and at the row end on SKU rows. On success the
  list reloads; on refusal the message shows with an "Archive instead" action for products.

## Left to the builder
Exact SQL ordering inside the transactions, reuse of the catalog writer's projection refresh, test layout
(unit tests for the rule and the guard; a migration test proving reserve/consume movements stay undeletable).
Deploy follows the usual staging rehearsal, then production with a pre-deploy dump.
