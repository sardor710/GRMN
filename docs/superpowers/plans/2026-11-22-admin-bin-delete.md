# Admin Bin-Icon Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bin icon on every product and SKU row of the admin Products list that permanently deletes a never-ordered product or SKU, including its manual stock history, and refuses (offering Archive) anything ordered or ever checked out.

**Architecture:** Migration 0027 opens a narrow, transaction-local door in the append-only stock ledger (`grmn.catalog_purge`). One shared module (`catalog-purge.ts`) owns the "deletable?" rule, the stock purge and its audit event; the existing product delete (`deleteIn`) and a new SKU delete in the catalog service both call it. The SKU delete reuses `writeProduct` with the SKU removed, so variant sync deletes the row, moves the default and refreshes the product document and projection exactly like a save.

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict, PostgreSQL 18 via `pg`, drizzle-kit migrations, `node --test` with temporary Postgres, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-11-22-admin-bin-delete-design.md`

## Global Constraints

- Deletable = no `order_items` row, no `reservation_lines` row, and no `stock_movements` row with a reason other than `opening`, `receive`, `adjust` for any variant concerned.
- The purge door: deleting `stock_movements` and `inventory_balances` rows is allowed only when `current_setting('grmn.catalog_purge', true) = '1'` (set with `set_config(..., true)`, transaction-local). Movement must be `opening|receive|adjust` with `reservation_line_id IS NULL AND allocation_id IS NULL`; balance must have `reserved = 0`. Every other UPDATE/DELETE stays refused with `'Immutable commerce history'` / existing messages.
- Every destructive action asks for confirmation in the browser and names the product or SKU.
- Refusal copy (exact):
  - product with orders: `This product has orders, so it cannot be deleted; archive it instead`
  - product checked out: `This product was in a checkout, so it cannot be deleted; archive it instead`
  - SKU with orders: `This SKU has orders, so it cannot be deleted; archive it instead`
  - SKU checked out: `This SKU was in a checkout, so it cannot be deleted; archive it instead`
  - last SKU: `This is the product's last SKU; delete the whole product instead`
- New admin HTTP handling builds URLs with `requestURL()` (already done by `createCatalogHTTP`).
- No `any`; 2-space indentation in new files; follow the surrounding style in edited files (service.ts is dense one-liners).
- Plan decision (mine, deviates from the spec's sketch): the SKU endpoint is `DELETE /api/admin/catalog/variants/:variantId?version=<productVersion>`, alongside the existing `PATCH variants/:id`, instead of a new `/api/admin/products/variants` route.

## Review Focus

1. **A SKU that sync cannot delete** (something still references it, e.g. a reference added later): the request must fail with 409 and change nothing, never leave the SKU silently archived while the UI says "deleted". → Task 3 test `sku delete rolls back when the variant row survives sync`.
2. **Stale list** (product edited in another tab after the list loaded): delete must return 409 VERSION_CONFLICT, nothing removed. → Task 2 and Task 3 tests use `version+5`.
3. **Deleting the default SKU**: the product must keep exactly one default among remaining live SKUs and stay visible on the storefront. → Task 3 test `deleting the default SKU moves the default`.
4. **Ledger door left open**: after a purge in the same transaction, a later `reserve` movement delete must still be refused. → Task 1 test `purge flag never allows reservation movements`.
5. **Bin inside a clickable row** (SKU rows open the quick-edit drawer): clicking the bin must not open the drawer, and the expanded variant list must not nest a button in a button. → Task 4 test `bin click does not open the drawer`.

---

### Task 1: Migration 0027 — guarded stock purge

**Files:**
- Create: `drizzle/0027_catalog-stock-purge.sql`
- Create: `drizzle/meta/0027_snapshot.json` (copy of `0026_snapshot.json` with `id` = new uuid and `prevId` = 0026's `id`; functions are not modelled, like 0026)
- Modify: `drizzle/meta/_journal.json` (append idx 27, tag `0027_catalog-stock-purge`, `when` = current epoch ms)
- Test: `tests/integration/catalog-stock-purge.test.mjs`

**Interfaces:**
- Produces: DB function `stock_movement_guard()` replacing `commerce_reject_mutation()` on trigger `stock_movements_immutable` (BEFORE UPDATE OR DELETE); `inventory_guard_balance()` gains a DELETE branch for the purge flag. Session flag name `grmn.catalog_purge`.

- [ ] **Step 1: Write the failing tests** (temporary Postgres + `migrate`, same setup as `tests/integration/inventory-ledger.test.mjs`; seed a product/variant/location/balance with raw SQL and insert movements as that file does)

```js
test("without the purge flag a receive movement and its balance cannot be deleted", async () => {
  await assert.rejects(q("DELETE FROM stock_movements WHERE id=$1",[receiveId]), /Immutable commerce history/);
  await assert.rejects(q("DELETE FROM inventory_balances WHERE variant_id=$1",[variantId]), /cannot be deleted/);
});
test("with the purge flag opening/receive/adjust movements and an unreserved balance are deleted", async () => {
  await inTx(async c => {
    await c.query("SELECT set_config('grmn.catalog_purge','1',true)");
    assert.equal((await c.query("DELETE FROM stock_movements WHERE variant_id=$1",[variantId])).rowCount, 3);
    assert.equal((await c.query("DELETE FROM inventory_balances WHERE variant_id=$1",[variantId])).rowCount, 1);
  });
});
test("purge flag never allows reservation movements", async () => {
  // second variant with a 'reserve' movement (delta_reserved 1) after an opening movement
  await inTx(async c => {
    await c.query("SELECT set_config('grmn.catalog_purge','1',true)");
    await assert.rejects(c.query("DELETE FROM stock_movements WHERE variant_id=$1 AND reason='reserve'",[reservedVariant]), /Immutable commerce history/);
  });
  await inTx(async c => {
    await c.query("SELECT set_config('grmn.catalog_purge','1',true)");
    await assert.rejects(c.query("DELETE FROM inventory_balances WHERE variant_id=$1",[reservedVariant]), /cannot be deleted/);
  });
});
test("updates stay refused even with the purge flag", async () => {
  await inTx(async c => {
    await c.query("SELECT set_config('grmn.catalog_purge','1',true)");
    await assert.rejects(c.query("UPDATE stock_movements SET source_reference='x' WHERE id=$1",[receiveId]), /Immutable commerce history/);
  });
});
test("the flag is transaction-local", async () => {
  await inTx(c => c.query("SELECT set_config('grmn.catalog_purge','1',true)"));
  await assert.rejects(q("DELETE FROM stock_movements WHERE id=$1",[receiveId]), /Immutable commerce history/);
});
```
`inTx(fn)` = connect, BEGIN, fn(client), COMMIT (ROLLBACK + rethrow on error), release.

- [ ] **Step 2: Run to verify they fail**
Run: `node --conditions=react-server --test tests/integration/catalog-stock-purge.test.mjs`
Expected: the "with the purge flag" test FAILS with `Immutable commerce history`.

- [ ] **Step 3: Write `drizzle/0027_catalog-stock-purge.sql`**
Header comment explaining owner decision 2026-11-22 (bin delete purges manual stock history of never-ordered items). `CREATE OR REPLACE FUNCTION inventory_guard_balance()` = 0026 body plus, in the DELETE branch before the raise: `IF coalesce(current_setting('grmn.catalog_purge',true),'')='1' AND OLD.reserved=0 THEN RETURN OLD; END IF;`. `CREATE FUNCTION stock_movement_guard()` returning OLD only for `TG_OP='DELETE'` + flag + reason in (`opening`,`receive`,`adjust`) + both FK columns null; otherwise `RAISE EXCEPTION 'Immutable commerce history' USING ERRCODE='23514'`. `DROP TRIGGER stock_movements_immutable ON stock_movements; CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION stock_movement_guard();` Separate statements with `--> statement-breakpoint`. The truncate triggers stay.

- [ ] **Step 4: Add journal entry and snapshot**, then run the tests.
Run: `node --conditions=react-server --test tests/integration/catalog-stock-purge.test.mjs tests/integration/inventory-ledger.test.mjs tests/integration/inventory-reservations.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add drizzle/0027_catalog-stock-purge.sql drizzle/meta/0027_snapshot.json drizzle/meta/_journal.json tests/integration/catalog-stock-purge.test.mjs
git commit -m "feat(db): 0027 lets a catalog delete purge manual stock history"
```

---

### Task 2: Shared purge rule + product delete

**Files:**
- Create: `src/server/cms/catalog-purge.ts`
- Modify: `src/server/cms/service.ts:104-130` (`deleteIn`)
- Modify: `src/components/admin/products/BulkActionBar.tsx` (`bulkReason` delete copy and the confirm text: "Products that were ordered or in a checkout are kept (archive them instead).")
- Test: `tests/integration/catalog-variants.test.mjs:249-271` (rewrite the delete test), `tests/integration/admin-products-bulk.test.mjs:72` (stocked product now deletes)

**Interfaces:**
- Consumes: Task 1 purge door.
- Produces (in `catalog-purge.ts`, `import "server-only"`):
  - `type PurgeSubject = "product" | "SKU"`
  - `assertPurgeable(client: PoolClient, variantIds: string[], subject: PurgeSubject, productId?: string): Promise<void>` — throws `AuthFailure("CONFLICT", 409, <exact copy from Global Constraints>)`; orders checked first (`order_items` by `variant_id`, and by `product_id` when given), then checkout (`reservation_lines` by variant or any non-manual movement).
  - `purgeVariantStock(client: PoolClient, principal: Principal, target: { type: string; id: string }, variantIds: string[]): Promise<{ movements: number; units: number }>` — sets the flag, deletes movements then balances, clears the flag (`set_config('grmn.catalog_purge','',true)`), and when `movements > 0` inserts one `audit_events` row: action `catalog.stock_purged`, `redacted_changes` = `{variants: variantIds.length, movements, units}` where `units` = sum of `delta_on_hand` deleted.
  - `deleteVariantReferences(client: PoolClient, variantIds: string[]): Promise<void>` — removes `cart_items`, `promotion_variants`, `price_adjustment_variants` and `product_compatibility` rows where either `accessory_variant_id` or `device_variant_id` is in the set.

- [ ] **Step 1: Rewrite the failing product-delete test** in `catalog-variants.test.mjs` (keep the never-sold assertions already there)

```js
// stocked (opening movement) → now deleted, ledger rows gone, audit written
const out = await cms.deleteProduct(admin, stocked.id, stocked.version);
assert.deepEqual(out, {deleted:true});
assert.equal((await rows("SELECT 1 FROM stock_movements WHERE variant_id=$1",[variant])).length, 0);
assert.equal((await rows("SELECT 1 FROM inventory_balances WHERE variant_id=$1",[variant])).length, 0);
assert.deepEqual((await rows("SELECT redacted_changes->>'units' AS u FROM audit_events WHERE action='catalog.stock_purged' ORDER BY created_at DESC LIMIT 1"))[0], {u:"3"});
// a product with a compatibility link on either side is deleted and the link goes
// a product with a 'reserve' movement → 409 /was in a checkout/ ; nothing removed
// stale version → 409 VERSION_CONFLICT ; no session → 401 (keep)
```
Add `test("a product with orders is refused with the orders message")` only if the bulk file's ordered fixture (line 127) is easy to reuse; otherwise assert the copy there: `/has orders/`.

- [ ] **Step 2: Run to verify failure**
Run: `node --conditions=react-server --test tests/integration/catalog-variants.test.mjs tests/integration/admin-products-bulk.test.mjs`
Expected: FAIL (`stock history` refusal).

- [ ] **Step 3: Implement `catalog-purge.ts`, then change `deleteIn`**: replace the two inline checks with `assertPurgeable(client, variants, "product", id)`; before the existing deletes call `deleteVariantReferences(client, variants)` and replace `DELETE FROM inventory_balances` with `purgeVariantStock(client, principal, {type: entityTypes.products, id}, variants)`. Keep the rest of the delete order. Update `BulkActionBar` copy and its expectation in `admin-products-bulk.test.mjs`.

- [ ] **Step 4: Run tests**
Run: `node --conditions=react-server --test tests/integration/catalog-variants.test.mjs tests/integration/admin-products-bulk.test.mjs tests/integration/catalog-stock-purge.test.mjs && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/server/cms/catalog-purge.ts src/server/cms/service.ts src/components/admin/products/BulkActionBar.tsx tests/integration/catalog-variants.test.mjs tests/integration/admin-products-bulk.test.mjs
git commit -m "feat(cms): product delete purges manual stock history and compatibility links"
```

---

### Task 3: SKU delete (service + HTTP)

**Files:**
- Modify: `src/server/cms/catalog-service.ts` (new method after `quickEditVariant`)
- Modify: `src/server/cms/catalog-http.ts` (route table comment + `DELETE variants/:id`, query key `version`)
- Test: create `tests/integration/catalog-sku-delete.test.mjs` (uses `startCatalogFixture`, `deviceCommand`, `simpleCommand` from `catalog-helpers.mjs`); extend `tests/unit/catalog-http-proxy.test.mjs` with the DELETE route behind the proxy.

**Interfaces:**
- Consumes: `assertPurgeable`, `purgeVariantStock`, `deleteVariantReferences` (Task 2); `writeProduct`, `loadEditorProduct`.
- Produces: `deleteVariant(headers: Headers, variantId: string, version: number): Promise<{ product: { id: string; version: number }; deleted: true }>` on the catalog admin service (permission `catalog:write`). HTTP: `DELETE /api/admin/catalog/variants/:id?version=N` → 200 `{product:{id,version},deleted:true}`; missing/non-integer `version` → 400.

Algorithm (in one `tx`), the order matters:
1. Lock owner as `quickEditVariant` does; 404 if unknown; `VERSION_CONFLICT` if `version` differs.
2. `current = loadEditorProduct(client, productId, {relations:false})`; target = live variant with that id, else 404 `"Variant is archived or not editable"`. Refuse with the last-SKU copy (409 CONFLICT) when `current.variants.length <= 1`.
3. `assertPurgeable(client, [variantId], "SKU")`, `deleteVariantReferences`, `purgeVariantStock(client, principal, {type:"product_variant", id: variantId}, [variantId])`.
4. Command = editor payload minus `compatibility/relations/categories` (as `quickEditVariant`), `variants` without the target; if the target was default, the first remaining `active` variant (else first remaining) gets `isDefault: true`. Prune `options[].values` not selected by any remaining variant, and drop options left with no values.
5. `writeProduct(client, context(headers, principal), command)`.
6. If `SELECT 1 FROM product_variants WHERE id=$1` still returns a row (sync archived it), throw `AuthFailure("CONFLICT", 409, "This SKU is still referenced; archive it instead")` so the whole transaction rolls back.

- [ ] **Step 1: Write failing tests** in `catalog-sku-delete.test.mjs`

```js
test("deleting a stocked, never-ordered SKU removes it, its prices, stock and option value", async () => {
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(n));          // 4 SKUs with stock
  const gray = saved.variants.find(v => v.sku.endsWith("-51-G"));
  const out = await f.catalog.deleteVariant(f.admin, gray.id, saved.version);
  assert.equal(out.deleted, true); assert.ok(out.product.version > saved.version);
  assert.equal((await f.q("SELECT count(*)::int n FROM product_variants WHERE id=$1",[gray.id])).rows[0].n, 0);
  for (const t of ["prices","stock_movements","inventory_balances","variant_option_values"])
    assert.equal((await f.q(`SELECT count(*)::int n FROM ${t} WHERE variant_id=$1`,[gray.id])).rows[0].n, 0, t);
  const after = await f.catalog.getProduct(f.admin, saved.id);
  assert.equal(after.variants.length, 3);
  assert.ok(!after.options.find(o => o.key === "color").values.some(v => v.label === "Gray"));
});
test("deleting the default SKU moves the default", async () => { /* delete -43-B; exactly one remaining isDefault, active */ });
test("the last SKU and a simple product's only SKU are refused", async () => { /* /last SKU/ 409 */ });
test("an SKU with a reserve movement is refused and nothing changes", async () => { /* /was in a checkout/, variant + movements still there, product version unchanged */ });
test("stale version and missing permission are refused", async () => { /* version+5 → 409; f.reader → 403 */ });
test("sku delete rolls back when the variant row survives sync", async () => {
  // A reference the purge does not know about (stands in for a future table):
  await f.q("CREATE TABLE tmp_variant_ref(v uuid REFERENCES product_variants(id) ON DELETE RESTRICT)");
  await f.q("INSERT INTO tmp_variant_ref VALUES($1)", [target.id]);
  await assert.rejects(f.catalog.deleteVariant(f.admin, target.id, saved.version), e => e.status === 409 && /still referenced/.test(e.message));
  // variant row (not archived), its prices and stock_movements all still present; product version unchanged
  await f.q("DROP TABLE tmp_variant_ref");
});
```
Unit (`catalog-http-proxy.test.mjs`): a `DELETE` to `http://app:3000/api/admin/catalog/variants/<uuid>?version=3` with `x-forwarded-host: garmin.tigr.uz`, `origin: https://garmin.tigr.uz` reaches `service.deleteVariant` with `(headers, "<uuid>", 3)`; `?version=x` → 400.

- [ ] **Step 2: Run to verify failure**
Run: `node --conditions=react-server --test tests/integration/catalog-sku-delete.test.mjs && npm run test:unit`
Expected: FAIL (`deleteVariant is not a function`, route 405).

- [ ] **Step 3: Implement `deleteVariant` and the route** per the algorithm above.

- [ ] **Step 4: Run tests**
Run: `node --conditions=react-server --test tests/integration/catalog-sku-delete.test.mjs tests/integration/catalog-variants.test.mjs tests/integration/variant-sync.test.mjs && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/server/cms/catalog-service.ts src/server/cms/catalog-http.ts tests/integration/catalog-sku-delete.test.mjs tests/unit/catalog-http-proxy.test.mjs
git commit -m "feat(catalog): delete a never-ordered SKU from the admin catalog API"
```

---

### Task 4: Bin icons in the Products list

**Files:**
- Modify: `src/lib/admin-collection.ts` (two helpers)
- Modify: `src/app/admin/products/_components/CatalogScreen.tsx` (`GroupedTable` actions cell and expanded `<li>`, `SkuTable` new last column, handlers in `CatalogScreen`)
- Test: create `tests/unit/catalog-bin-delete.test.mjs` with `componentFixture` / `nodes` from `tests/helpers/component-fixture.mjs` (stub `useCatalogList` data through the fetcher like `cms-admin-list.test.mjs` does)

**Interfaces:**
- Consumes: product delete `DELETE /api/admin/products?id&version&permanent=1` (existing), SKU delete from Task 3.
- Produces:
  - `deleteProductPermanently(fetcher: typeof fetch, record: { id: string; version: number }): Promise<void>`
  - `deleteCatalogVariant(fetcher: typeof fetch, input: { variantId: string; productVersion: number }): Promise<void>`
  - Both throw `AdminDeleteError extends Error { code: string; status: number }` built from the response's `error.code` / `error.message` (fall back to the generic copy), so the screen can tell `CONFLICT` from `VERSION_CONFLICT`.

UI rules:
- `BinButton` (local component in CatalogScreen): `Button size="sm" variant="ghost"` with lucide `Trash2` (`size={16}`, `aria-hidden`), `aria-label` and `title` = `Delete <name>` / `Delete SKU <sku>`, red on hover (`hover:text-[#a30d28]`), `onClick` calls `event.stopPropagation()` first. Visible at all breakpoints.
- Grouped row: bin after Edit/Archive. Confirm: `Delete “<name>” permanently? All its variants, prices, photos, translations and stock are removed. This cannot be undone.` On `CONFLICT` whose message contains `archive it instead` and the row is not archived: `window.confirm("<message>\n\nArchive “<name>” instead?")` → existing `archive` flow without its own confirm. `VERSION_CONFLICT`: `setActionError("This product changed in another window. The list has been reloaded; try again.")` and `reloadAll()`. Success: `reloadAll()`.
- SKU rows (SkuTable and expanded list): confirm `Delete SKU <sku> permanently? Its price, photo links and stock are removed. This cannot be undone.`; refusal message goes to `setActionError` (SKU archiving stays in the quick-edit drawer). Success: `reloadAll()`.
- Expanded `<li>`: becomes `flex items-center` holding the existing row button (`flex-1`) and the bin as a sibling — no nested buttons.
- `SkuTable` gets a trailing `<th><span className="sr-only">Actions</span></th>` and the skeleton uses 7 columns.

- [ ] **Step 1: Write failing tests**

```js
test("grouped row has a bin that confirms and calls the permanent delete", async () => { /* aria-label "Delete Synthetic fēnix" exists; confirm text includes "cannot be undone"; fetch called with DELETE /api/admin/products?id=…&version=…&permanent=1 */ });
test("a refused product delete offers archive", async () => { /* fetcher 409 {error:{code:"CONFLICT",message:"This product has orders, so it cannot be deleted; archive it instead"}}; second confirm contains "Archive"; then DELETE without permanent */ });
test("cancelling the confirm sends nothing", async () => { /* confirm → false; no DELETE */ });
test("bin click does not open the drawer", async () => { /* SKU view: bin onClick with stopPropagation spy; drawer state unchanged; expanded li has no button inside a button */ });
test("SKU bin calls the catalog variant delete with the product version", async () => { /* DELETE /api/admin/catalog/variants/<id>?version=<productVersion> */ });
```

- [ ] **Step 2: Run to verify failure**
Run: `node --conditions=react-server --test tests/unit/catalog-bin-delete.test.mjs`
Expected: FAIL (no element with that aria-label).

- [ ] **Step 3: Implement helpers and UI** per the rules above.

- [ ] **Step 4: Run tests and checks**
Run: `node --conditions=react-server --test tests/unit/catalog-bin-delete.test.mjs && npm run test:unit && npm run typecheck && npm run lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Commit**
```bash
git add src/lib/admin-collection.ts src/app/admin/products/_components/CatalogScreen.tsx tests/unit/catalog-bin-delete.test.mjs
git commit -m "feat(admin): bin icon deletes a product or SKU from the Products list"
```

---

### Task 5: Full verification, staging rehearsal, production

**Files:** none (operations). Production steps follow `/home/nick/.claude/projects/-home-nick/memory/grmn-production.md`.

- [ ] **Step 1: Full suite** — `npm test && npm run check`. Expected: all green. Then `npm run test:cms-ui`.
- [ ] **Step 2: Browser check locally** with `npm run dev:stack`: delete one SKU and one product from the list, screenshot with `/home/nick/tools/browser/review.mjs`; confirm the storefront page of the edited product still renders and the deleted SKU is gone.
- [ ] **Step 3: Build images** `grmn:<commit>` (with `--build-arg NEXT_PUBLIC_SITE_URL=https://garmin.tigr.uz`) and `grmn-ops:<commit>`.
- [ ] **Step 4: Staging rehearsal** — restore a fresh `pg_dump -Fc` of prod into `grmn-staging` (recipe in the memory file), migrate to 0027, start the app, run `psql` checks: `SELECT tgname, tgfoid::regproc FROM pg_trigger WHERE tgname='stock_movements_immutable'` → `stock_movement_guard`; delete one product through the service (staging has no Telegram chat). Stop staging afterwards.
- [ ] **Step 5: Production** — `pg_dump -Fc` to `/home/nick/grmn-production/predeploy-bin-delete-f82dfb9.dump`, back up `production.env` as `production.env.bak-f82dfb9`, set `APP_IMAGE`/`OPS_IMAGE`, migrate with the ops image, `up -d app worker proxy`, `restart proxy`; check `/ru` 200, `/admin` → login, health check exits 0. Ask the owner to try one bin delete on a product they no longer want.
- [ ] **Step 6: Push** the branch, merge into `beta5` (fast-forward), push `beta5`, and update the memory file with the new live commit.
