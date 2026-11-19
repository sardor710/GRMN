import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { extractSources } from "../../scripts/migration/extract.ts";
import { syntheticCMS, sourceOptions } from "../fixtures/migration.mjs";

let temporary, handle, serial = 0;
const q = (sql, values = []) => handle.pool.query(sql, values);
const importer = () => import("../../scripts/migration/import.ts");
const reconciler = () => import("../../scripts/migration/reconcile.ts");
function fixture() {
  const prefix = `case${++serial}`, cms = syntheticCMS();
  delete cms.admins; delete cms.settings;
  for (const rows of Object.values(cms)) for (const row of rows) row.id = `${prefix}-${row.id}`;
  cms.products[0].sku = `${prefix}-SKU`; cms.orders[0].items[0].productId = cms.products[0].id;
  cms.orders[0].orderNumber = `${prefix}-OLD-${9000000 + serial}`;
  cms.blogs[0].slug = `${prefix}-blog`; cms.discounts[0].code = `${prefix}-promo`;
  return { cms, get options() { return sourceOptions(cms, { namespace: prefix }); } };
}
before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "4" }));
  await migrate(handle.db, { migrationsFolder: "drizzle" });
}, { timeout: 120000 });
after(async () => { try { await handle?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

// Breaks caught: non-atomic checkpoints, replay overwrite/duplicates, unsafe
// source merges, missing target/child rows, invented financial/identity facts.
test("catalog/content and contact/order/promo import replays without duplicate rows or lost fields", async () => {
  const f = fixture(); f.cms.products[0].futureField = { preserved: "Қазақша / Русский" };
  const snapshot = extractSources(f.options), { importSnapshot } = await importer();
  const first = await importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 2 });
  const second = await importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 2 });
  assert.equal(first.status, "completed"); assert.equal(second.ready, true);
  assert.deepEqual(second.mismatches, []);
  assert.equal(Number((await q("SELECT count(*) FROM migration_runs WHERE source_namespace=$1", [snapshot.namespace])).rows[0].count), 1);
  const map = await q("SELECT target_id FROM legacy_id_map WHERE source_namespace=$1 AND entity='products'", [snapshot.namespace]);
  const product = (await q("SELECT * FROM products WHERE id=$1", [map.rows[0].target_id])).rows[0];
  assert.equal(product.public_key, f.cms.products[0].id); assert.equal(product.seo_title, "Synthetic SEO");
  assert.deepEqual(product.legacy_content.futureField, { preserved: "Қазақша / Русский" });
  assert.equal(Number((await q("SELECT count(*) FROM product_variants WHERE product_id=$1", [product.id])).rows[0].count), 1);
  assert.equal(second.counts.products.imported, 1);
  assert.equal(second.fieldCoverage.mismatched, 0);
});

test("a crash after a committed batch resumes from its durable checkpoint", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  await assert.rejects(importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 1, onBatchCommitted: () => { throw new Error("Synthetic interruption"); } }), /interruption/);
  const checkpoint = (await q("SELECT manifest FROM migration_runs WHERE source_namespace=$1", [snapshot.namespace])).rows[0].manifest;
  assert.equal(checkpoint.cursor, 1);
  const result = await importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 1 });
  assert.equal(result.ready, true);
  assert.equal(Number((await q("SELECT count(*) FROM legacy_source_records s JOIN migration_runs r ON s.run_id=r.id WHERE r.source_namespace=$1", [snapshot.namespace])).rows[0].count), snapshot.records.length);
});

test("changed source or interpretation in one namespace conflicts before new target writes", async () => {
  const f = fixture(), initial = f.options, originalName = f.cms.products[0].name, snapshot = extractSources(initial), { importSnapshot } = await importer();
  await importSnapshot(handle.pool, snapshot, { offline: true });
  f.cms.products[0].name = "Changed source";
  await assert.rejects(importSnapshot(handle.pool, extractSources(f.options), { offline: true }), /SOURCE_CHANGED/);
  await assert.rejects(importSnapshot(handle.pool, extractSources({ ...initial, cmsMoney: null }), { offline: true }), /SOURCE_CHANGED/);
  assert.equal((await q("SELECT name FROM products WHERE public_key=$1", [f.cms.products[0].id])).rows[0].name, originalName);
});

test("replay preserves live product and price edits and reports target drift", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  await importSnapshot(handle.pool, snapshot, { offline: true });
  await q("UPDATE products SET name='Synthetic staff edit',version=version+1 WHERE public_key=$1", [f.cms.products[0].id]);
  await q("UPDATE prices SET amount_minor=999 WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE public_key=$1))", [f.cms.products[0].id]);
  const result = await importSnapshot(handle.pool, snapshot, { offline: true });
  assert.equal(result.ready, false);
  assert.ok(result.mismatches.some(item => item.code === "TARGET_DRIFT"));
  assert.equal((await q("SELECT name FROM products WHERE public_key=$1", [f.cms.products[0].id])).rows[0].name, "Synthetic staff edit");
  assert.equal((await q("SELECT amount_minor FROM prices p JOIN product_variants v ON v.id=p.variant_id JOIN products x ON x.id=v.product_id WHERE x.public_key=$1", [f.cms.products[0].id])).rows[0].amount_minor, "999");
});

test("missing mapped targets and child rows are detected and never silently recreated", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  await importSnapshot(handle.pool, snapshot, { offline: true });
  await q("DELETE FROM prices WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE public_key=$1))", [f.cms.products[0].id]);
  const result = await importSnapshot(handle.pool, snapshot, { offline: true });
  assert.ok(result.mismatches.some(item => item.code === "TARGET_DRIFT"));
  assert.equal(Number((await q("SELECT count(*) FROM prices WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE public_key=$1))", [f.cms.products[0].id])).rows[0].count), 0);
});

test("legacy orders preserve exact totals/line snapshots and numbers without captures or identity claims", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  const result = await importSnapshot(handle.pool, snapshot, { offline: true });
  const order = (await q("SELECT * FROM orders WHERE order_number=$1", [f.cms.orders[0].orderNumber])).rows[0];
  assert.equal(order.total_minor, "246912"); assert.equal(order.currency, "KZT");
  assert.equal(order.data_quality, "legacy_incomplete"); assert.equal(order.payment_mode, "legacy_unknown"); assert.equal(order.payment_status, "unpaid");
  assert.equal(order.user_id, null); assert.equal(order.profile_id, null);
  assert.equal(order.legacy_summary.source.paymentStatus, "paid");
  assert.equal(order.legacy_summary.lines[0].unitPriceMinor, "123456");
  assert.equal(result.financial.sourceTotalMinor, "246912"); assert.equal(result.financial.targetTotalMinor, "246912");
  assert.equal(result.financial.lineSubtotalMinor, "246912");
  for (const table of ["payment_transactions", "payment_attempts", "shipments", "order_items", "order_events", "promotion_redemptions", "users", "consent_events"]) assert.equal(Number((await q(`SELECT count(*) FROM ${table}`)).rows[0].count), 0, table);
  const promo = (await q("SELECT legacy_used_count,status FROM promotions WHERE code=$1", [f.cms.discounts[0].code.toLowerCase()])).rows[0];
  assert.deepEqual(promo, { legacy_used_count: 3, status: "draft" });
});

test("cancellation aliases map without reactivating historical fulfillment", async () => {
  const f = fixture(); f.cms.orders[0].fulfillmentStatus = "canceled";
  const { importSnapshot } = await importer();
  await importSnapshot(handle.pool, extractSources(f.options), { offline: true });
  assert.equal((await q("SELECT order_status FROM orders WHERE order_number=$1", [f.cms.orders[0].orderNumber])).rows[0].order_status, "cancelled");
});

test("quarantine accounts for all rows, excludes credentials, and cannot complete with open blockers", async () => {
  const f = fixture(); f.cms.admins = syntheticCMS().admins; f.cms.orders[0].items[0].productId = "orphan";
  const snapshot = extractSources(f.options), { importSnapshot } = await importer();
  const result = await importSnapshot(handle.pool, snapshot, { offline: true });
  assert.equal(result.status, "quarantined"); assert.equal(result.ready, false);
  assert.equal(result.counts.admins.quarantined, 1); assert.equal(result.counts.orders.quarantined, 1);
  assert.equal(result.fieldCoverage.mismatched, 0);
  assert.equal(result.financial.sourceTotalMinor, "246912");
  assert.equal(result.financial.quarantinedTotalMinor, "246912");
  assert.equal(result.financial.targetTotalMinor, "0");
  const rows = (await q("SELECT s.payload FROM legacy_source_records s JOIN migration_runs r ON r.id=s.run_id WHERE r.source_namespace=$1", [snapshot.namespace])).rows;
  assert.equal(rows.length, snapshot.records.length);
  assert.ok(!JSON.stringify(rows).includes("NEVER-STAGE-THIS"));
  const run = (await q("SELECT id FROM migration_runs WHERE source_namespace=$1", [snapshot.namespace])).rows[0];
  await assert.rejects(q("UPDATE migration_runs SET status='completed' WHERE id=$1", [run.id]), error => error.code === "23514");
});

test("a natural-key collision rolls back the whole batch including its archive checkpoint", async () => {
  const f = fixture(); await q("INSERT INTO products(id,public_key,name) VALUES(gen_random_uuid(),$1,'Preexisting live product')", [f.cms.products[0].id]);
  const snapshot = extractSources(f.options), { importSnapshot } = await importer();
  await assert.rejects(importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 100 }));
  assert.equal(Number((await q("SELECT count(*) FROM legacy_source_records s JOIN migration_runs r ON r.id=s.run_id WHERE r.source_namespace=$1", [snapshot.namespace])).rows[0].count), 0);
  assert.equal((await q("SELECT name FROM products WHERE public_key=$1", [f.cms.products[0].id])).rows[0].name, "Preexisting live product");
});

test("tampered archives and online-mode requests fail before a migration run is inserted", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  await assert.rejects(importSnapshot(handle.pool, snapshot, { offline: false }), /offline/i);
  snapshot.records[0].payload.changed = true;
  await assert.rejects(importSnapshot(handle.pool, snapshot, { offline: true }), /checksum/i);
  assert.equal(Number((await q("SELECT count(*) FROM migration_runs WHERE source_namespace=$1", [snapshot.namespace])).rows[0].count), 0);
});

test("concurrent same-archive imports serialize and reconcile one run", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  const results = await Promise.all([1, 2].map(() => importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 1 })));
  assert.ok(results.every(result => result.ready));
  assert.equal(Number((await q("SELECT count(*) FROM migration_runs WHERE source_namespace=$1", [snapshot.namespace])).rows[0].count), 1);
});

test("invalid Unicode source remains recoverable in quarantined archive without PostgreSQL JSONB rejection", async () => {
  const f = fixture(); f.cms.products[0].name = "bad\ud800\u0000";
  const snapshot = extractSources(f.options), { importSnapshot } = await importer();
  const result = await importSnapshot(handle.pool, snapshot, { offline: true });
  assert.equal(result.status, "quarantined"); assert.equal(result.fieldCoverage.mismatched, 0);
  const rows = (await q("SELECT s.payload FROM legacy_source_records s JOIN migration_runs r ON r.id=s.run_id WHERE r.source_namespace=$1 AND s.entity='products'", [snapshot.namespace])).rows;
  assert.equal(JSON.parse(Buffer.from(rows[0].payload.data.$jsonBase64, "base64").toString("utf8")).name, "bad\ud800\u0000");
});

test("private staging snapshot retains checked table rows and refuses overwrite", async () => {
  const f = fixture(), { importSnapshot } = await importer();
  await importSnapshot(handle.pool, extractSources(f.options), { offline: true });
  const { saveStagingSnapshot, readStagingSnapshot } = await import("../../scripts/migration/rehearse.ts");
  const directory = await mkdtemp(resolve("temp", "migration-staging-snapshot-"));
  try {
    const result = await saveStagingSnapshot(handle.pool, directory);
    const snapshot = await readStagingSnapshot(directory);
    assert.match(result.checksum, /^[0-9a-f]{64}$/);
    assert.ok(snapshot.tables.legacy_source_records.length > 0);
    assert.equal(snapshot.tables.users.length, 0);
    assert.ok((await readFile(join(directory, "database.json.snapshot"), "utf8")).includes(result.checksum));
    await assert.rejects(saveStagingSnapshot(handle.pool, directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("offline import completes with a one-connection bounded pool", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  const pool = new Pool({ connectionString: temporary.url, max: 1, connectionTimeoutMillis: 300 });
  try { assert.equal((await importSnapshot(pool, snapshot, { offline: true })).ready, true); }
  finally { await pool.end(); }
});

test("running parity cannot certify readiness and completed replay detects sequence regression", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer(), { reconcileSnapshot, advanceOrderSequence } = await reconciler();
  await assert.rejects(importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 500, onBatchCommitted: () => { throw new Error("Last-batch interruption"); } }));
  assert.equal((await reconcileSnapshot(handle.pool, snapshot)).ready, false);
  assert.equal((await importSnapshot(handle.pool, snapshot, { offline: true })).ready, true);
  await q("SELECT setval('order_number_sequence',1000000,true)");
  try { assert.equal((await importSnapshot(handle.pool, snapshot, { offline: true })).ready, false); }
  finally { await advanceOrderSequence(handle.pool, { offline: true }); }
});

test("normalized promo stackability matches source evidence independently of first fingerprints", async () => {
  const f = fixture(); f.cms.discounts[0].isStackable = true;
  const { importSnapshot } = await importer();
  assert.equal((await importSnapshot(handle.pool, extractSources(f.options), { offline: true })).ready, true);
  assert.equal((await q("SELECT stackable FROM promotions WHERE code=$1", [f.cms.discounts[0].code.toLowerCase()])).rows[0].stackable, true);
});

test("initial insertion of a wrong normalized value cannot certify a matching raw archive", async () => {
  const f = fixture(), { importSnapshot } = await importer();
  await q("CREATE FUNCTION synthetic_wrong_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.name='Wrong normalized value'; RETURN NEW; END $$");
  await q("CREATE TRIGGER synthetic_wrong_projection BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION synthetic_wrong_projection()");
  try {
    const result = await importSnapshot(handle.pool, extractSources(f.options), { offline: true });
    assert.equal(result.ready, false);
    assert.ok(result.mismatches.some(item => item.code === "NORMALIZED_VALUE_MISMATCH"));
  } finally { await q("DROP TRIGGER synthetic_wrong_projection ON products"); await q("DROP FUNCTION synthetic_wrong_projection()"); }
});

test("line association corruption is detected even when line count and subtotal still match", async () => {
  const f = fixture(), { importSnapshot } = await importer();
  await q(`CREATE FUNCTION synthetic_wrong_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.legacy_summary=jsonb_set(NEW.legacy_summary,'{lines,0,productKey}','"wrong-product"'); RETURN NEW; END $$`);
  await q("CREATE TRIGGER synthetic_wrong_line BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION synthetic_wrong_line()");
  try {
    const result = await importSnapshot(handle.pool, extractSources(f.options), { offline: true });
    assert.equal(result.ready, false);
    assert.ok(result.mismatches.some(item => item.code === "LINE_MISMATCH"));
  } finally { await q("DROP TRIGGER synthetic_wrong_line ON orders"); await q("DROP FUNCTION synthetic_wrong_line()"); }
});

test("relationship-only staff edits invalidate product replay without being overwritten", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  await importSnapshot(handle.pool, snapshot, { offline: true });
  const activity = (await q("INSERT INTO activities(id,key,name) VALUES(gen_random_uuid(),$1,'Synthetic activity') RETURNING id", [snapshot.namespace])).rows[0].id;
  await q("INSERT INTO product_activities(product_id,activity_id) SELECT id,$2 FROM products WHERE public_key=$1", [f.cms.products[0].id, activity]);
  const result = await importSnapshot(handle.pool, snapshot, { offline: true });
  assert.equal(result.ready, false); assert.ok(result.mismatches.some(item => item.code === "TARGET_DRIFT"));
});

test("a damaged resume prefix is rejected before any later batch writes", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  await assert.rejects(importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 1, onBatchCommitted: () => { throw new Error("Interrupted"); } }));
  await q("UPDATE migration_runs SET manifest=jsonb_set(manifest,'{cursor}','2') WHERE source_namespace=$1", [snapshot.namespace]);
  await assert.rejects(importSnapshot(handle.pool, snapshot, { offline: true }), /CHECKPOINT_INVALID/);
  assert.equal(Number((await q("SELECT count(*) FROM legacy_source_records s JOIN migration_runs r ON r.id=s.run_id WHERE r.source_namespace=$1", [snapshot.namespace])).rows[0].count), 1);
});

test("missing issue identities cannot disappear from an otherwise matching reconciliation", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  // Existing history guards correctly reject DELETE. A BEFORE INSERT fault
  // reproduces an omitted issue without weakening any installed constraint.
  await q("CREATE FUNCTION synthetic_omit_issue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");
  await q("CREATE TRIGGER synthetic_omit_issue BEFORE INSERT ON migration_issues FOR EACH ROW EXECUTE FUNCTION synthetic_omit_issue()");
  try {
    const result = await importSnapshot(handle.pool, snapshot, { offline: true });
    assert.equal(result.ready, false); assert.ok(result.mismatches.some(item => item.code === "ISSUE_MISMATCH"));
  } finally { await q("DROP TRIGGER synthetic_omit_issue ON migration_issues"); await q("DROP FUNCTION synthetic_omit_issue()"); }
});

test("unsafe source field names are reversibly archived without breaking issue persistence", async () => {
  const f = fixture(); f.cms.products[0]["unsafe\u0000key"] = "retained";
  const { importSnapshot } = await importer();
  const result = await importSnapshot(handle.pool, extractSources(f.options), { offline: true });
  assert.equal(result.status, "quarantined"); assert.equal(result.fieldCoverage.mismatched, 0);
});

test("failed advisory unlock destroys the real pooled session instead of leaking its namespace lock", async () => {
  const f = fixture(), snapshot = extractSources(f.options), { importSnapshot } = await importer();
  const proxy = { connect: async () => {
    const client = await handle.pool.connect();
    return { query: (sql, args) => sql.includes("pg_advisory_unlock(hashtextextended($1,0))") ? Promise.reject(new Error("Synthetic unlock failure")) : client.query(sql, args), release: error => client.release(error) };
  } };
  await assert.rejects(importSnapshot(proxy, snapshot, { offline: true }));
  const probe = new Pool({ connectionString: temporary.url, max: 1 });
  try { assert.equal((await probe.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired", [`legacy-import:${snapshot.namespace}`])).rows[0].acquired, true); }
  finally { await probe.end(); }
});

test("temporary database protection runs before any current-source migration writes", async () => {
  const { protectTemporaryDatabase } = await import("../../scripts/migration/rehearse.ts");
  const path = await protectTemporaryDatabase(handle.pool);
  assert.ok(path.startsWith(resolve("temp") + (process.platform === "win32" ? "\\" : "/")));
});

// Runs before the suffix-collision test, which leaves colliding legacy order numbers behind (orders are immutable).
// Task 24: owner dispositions. Breaks caught: removed records leaking into live tables, a money
// total that no longer balances once orders are excluded, decisions lost from migration_issues,
// and a replay that re-decides differently.
test("owner dispositions complete the import: excluded records are archived only, accepted blockers resolved, money balances", async () => {
  const f = fixture(); f.cms.banners[0].image = "/images/missing-owner.jpg";
  const decisions = { version: 1, approvedBy: "owner", approvedAt: "2026-11-19", rules: [
    { id: "remove-products", entity: "products", action: "exclude", reason: "Owner removes products" },
    { id: "remove-orders", entity: "orders", action: "exclude", reason: "Owner removes orders" },
    { id: "keep-banners", entity: "banners", action: "accept", codes: ["MISSING_ASSET"], reason: "Staff replace the image" },
  ] };
  const snapshot = extractSources(sourceOptions(f.cms, { namespace: `${f.cms.products[0].id}-owner`, decisions }));
  const { importSnapshot } = await importer(), { reconcileSnapshot } = await reconciler();
  const first = await importSnapshot(handle.pool, snapshot, { offline: true, batchSize: 3 });
  assert.equal(first.status, "completed"); assert.equal(first.ready, true); assert.deepEqual(first.mismatches, []); assert.equal(first.blockers, 0);
  assert.equal(first.counts.products.excluded, 1); assert.equal(first.counts.orders.excluded, 1); assert.equal(first.counts.banners.imported, 1);
  assert.equal(first.financial.excludedOrders, 1); assert.equal(first.financial.excludedTotalMinor, "246912"); assert.equal(first.financial.targetTotalMinor, "0");
  assert.equal(Number((await q("SELECT count(*) FROM products WHERE public_key=$1", [f.cms.products[0].id])).rows[0].count), 0);
  assert.equal(Number((await q("SELECT count(*) FROM orders WHERE order_number=$1", [f.cms.orders[0].orderNumber])).rows[0].count), 0);
  const map = (await q("SELECT entity,target_type FROM legacy_id_map WHERE source_namespace=$1 AND entity IN ('products','orders') ORDER BY entity", [snapshot.namespace])).rows;
  assert.deepEqual(map.map(r => r.target_type), ["legacy_source_records", "legacy_source_records"]);
  const issues = (await q("SELECT entity,code,disposition,resolution,resolved_at FROM migration_issues i JOIN migration_runs r ON r.id=i.run_id WHERE r.source_namespace=$1 AND (severity='blocker' OR code='OWNER_EXCLUDED') ORDER BY entity,code", [snapshot.namespace])).rows;
  const banner = issues.find(r => r.entity === "banners" && r.code === "MISSING_ASSET");
  assert.equal(banner.disposition, "resolved"); assert.ok(banner.resolved_at);
  assert.deepEqual(banner.resolution, { rule: "keep-banners", action: "accept", reason: "Staff replace the image", approvedBy: "owner", approvedAt: "2026-11-19" });
  assert.ok(issues.some(r => r.entity === "orders" && r.code === "OWNER_EXCLUDED"));
  assert.ok(issues.filter(r => r.code !== "OWNER_EXCLUDED").every(r => r.disposition === "resolved"));
  const replay = await importSnapshot(handle.pool, snapshot, { offline: true });
  assert.equal(replay.ready, true); assert.deepEqual(replay.mismatches, []);
  const again = await reconcileSnapshot(handle.pool, snapshot);
  assert.equal(again.ready, true);
  await assert.rejects(q("UPDATE migration_issues SET resolution=NULL,resolved_at=NULL,disposition='open' WHERE code='MISSING_ASSET' AND run_id=(SELECT id FROM migration_runs WHERE source_namespace=$1)", [snapshot.namespace]), /Import run is finished/);
  // Changing a decision is a new interpretation of the same source: it conflicts before any write.
  const changed = extractSources(sourceOptions(f.cms, { namespace: snapshot.namespace, decisions: { ...decisions, rules: decisions.rules.slice(1) } }));
  await assert.rejects(importSnapshot(handle.pool, changed, { offline: true }), /SOURCE_CHANGED/);
});

test("sequence floor exceeds every numeric suffix, preserves a higher high-water mark and detects suffix collisions", async () => {
  const f = fixture(), { importSnapshot } = await importer(), { advanceOrderSequence } = await reconciler();
  await importSnapshot(handle.pool, extractSources(f.options), { offline: true });
  assert.ok(BigInt((await q("SELECT nextval('order_number_sequence') AS value")).rows[0].value) > 9000007n);
  await q("SELECT setval('order_number_sequence', 99000000, true)");
  await advanceOrderSequence(handle.pool, { offline: true });
  assert.ok(BigInt((await q("SELECT nextval('order_number_sequence') AS value")).rows[0].value) > 99000000n);
  await q("INSERT INTO orders(id,order_number,contact_name,data_quality,total_minor,payment_mode) VALUES(gen_random_uuid(),'A-00042','Synthetic','legacy_incomplete',0,'legacy_unknown'),(gen_random_uuid(),'B-42','Synthetic','legacy_incomplete',0,'legacy_unknown')");
  await assert.rejects(advanceOrderSequence(handle.pool, { offline: true }), /SUFFIX_COLLISION/);
});
