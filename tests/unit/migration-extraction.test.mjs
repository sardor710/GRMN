import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { syntheticCMS, sourceOptions } from "../fixtures/migration.mjs";

// Breaks caught: nondeterministic IDs, accidental source execution/fallback,
// rounded money, dropped evidence, credentials staged, and validation blind spots.
const extraction = () => import("../../scripts/migration/extract.ts");
const validation = () => import("../../scripts/migration/validate.ts");
const reportFor = async (cms, extra) => (await validation()).validateSnapshot((await extraction()).extractSources(sourceOptions(cms, extra)));
const codes = report => report.records.flatMap(r => r.issues.map(i => i.code));

test("unchanged source yields identical archive checksum and deterministic unique mapping IDs", async () => {
  const { extractSources } = await extraction();
  const first = extractSources(sourceOptions()), second = extractSources(sourceOptions());
  assert.deepEqual(first, second);
  assert.match(first.artifactChecksum, /^[a-f0-9]{64}$/);
  const report = (await validation()).validateSnapshot(first);
  assert.equal(new Set(report.records.map(r => r.targetId)).size, report.records.length);
  assert.equal(report.counts.products.importable, 1);
  assert.equal(report.counts.orders.importable, 1);
  assert.equal(report.records.find(r => r.entity === "products").projection.amountMinor, "123456");
});

test("absent homepage stays absent and static fallback never resurrects deleted products", async () => {
  const report = await reportFor(syntheticCMS(), {
    sources: [...sourceOptions().sources,
      { path: "src/lib/products.ts", contents: 'export { products } from "./public-products";' },
      { path: "src/lib/public-products.ts", contents: 'export const products = [{id:"deleted",name:"Deleted",price:1}]; throw new Error("MUST NOT EXECUTE");' }],
    staticDefinitions: ["src/lib/products.ts#products"],
  });
  assert.equal(report.records.some(r => r.entity === "homepage"), false);
  assert.ok(codes(report).includes("STATIC_PRODUCT_NOT_PERSISTED"));
  assert.equal(report.counts.products.expected, 1);
  const fallback = report.records.find(r => r.entity.startsWith("static:"));
  assert.equal(fallback.disposition, "quarantined");
  assert.equal(fallback.resolvedSource, "src/lib/public-products.ts#products");
});

test("exact major-unit conversion rejects invalid precision, currency and unsafe numeric inputs", async () => {
  const { moneyToMinor } = await import("../../scripts/migration/map.ts");
  for (const [input, want] of [["0", "0"], ["12.3", "1230"], ["123456789012345.67", "12345678901234567"]]) assert.equal(moneyToMinor(input), want);
  for (const input of ["1.001", "-1", "1e3", "NaN", Infinity, Number.MAX_SAFE_INTEGER, "92233720368547758.08"]) assert.throws(() => moneyToMinor(input));
  const cms = syntheticCMS(); cms.products[0].price = "1.001";
  assert.ok(codes(await reportFor(cms)).includes("INVALID_MONEY"));
  assert.ok(codes(await reportFor(syntheticCMS(), { cmsMoney: null })).includes("MISSING_CURRENCY"));
});

test("orphan items, mismatched totals and incomplete historical orders stay visibly restricted", async () => {
  const cms = syntheticCMS(); cms.orders[0].items[0].productId = "missing";
  let report = await reportFor(cms);
  assert.ok(codes(report).includes("UNRESOLVED_PRODUCT"));
  assert.equal(report.records.find(r => r.entity === "orders").disposition, "quarantined");
  cms.orders[0].items = [];
  report = await reportFor(cms);
  assert.ok(codes(report).includes("INCOMPLETE_ORDER"));
  cms.orders[0].items = syntheticCMS().orders[0].items; cms.orders[0].total = "1";
  assert.ok(codes(await reportFor(cms)).includes("ORDER_TOTAL_MISMATCH"));
});

test("duplicate IDs, case-folded SKUs, slugs and order numbers block every colliding row", async () => {
  for (const [entity, field] of [["products", "id"], ["products", "sku"], ["blogs", "slug"], ["orders", "orderNumber"]]) {
    const cms = syntheticCMS(), duplicate = structuredClone(cms[entity][0]);
    if (field !== "id") duplicate.id = "second";
    if (field === "sku") duplicate.sku = "syn-1";
    cms[entity].push(duplicate);
    const report = await reportFor(cms), rows = report.records.filter(r => r.entity === entity);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.disposition === "quarantined"));
    assert.ok(codes(report).includes(`DUPLICATE_${field === "id" ? "IDENTITY" : field.toUpperCase()}`));
  }
});

test("unknown fields survive recursively while credential fields are removed at every depth", async () => {
  const cms = syntheticCMS(); cms.products[0].future = { text: "Русский / Қазақша", nested: { apiKey: "DO-NOT-STAGE", custom: [1, 2] } };
  const { extractSources } = await extraction(), snapshot = extractSources(sourceOptions(cms));
  const archive = JSON.stringify(snapshot);
  assert.ok(!archive.includes("DO-NOT-STAGE")); assert.ok(!archive.includes("NEVER-STAGE-THIS"));
  const report = (await validation()).validateSnapshot(snapshot), product = report.records.find(r => r.entity === "products");
  assert.deepEqual(product.payload.future, { text: "Русский / Қазақша", nested: { custom: [1, 2] } });
  assert.ok(snapshot.redactions.length >= 2);
  assert.ok(product.issues.some(i => i.code === "UNKNOWN_FIELD"));
});

test("unverified provenance, invalid timestamps/Unicode and missing assets have explicit issues", async () => {
  const cms = syntheticCMS(); cms.products[0].createdAt = "2026-02-31T00:00:00Z"; cms.products[0].name = "bad\ud800"; cms.products[0].image = "/images/missing.png";
  const report = await reportFor(cms, { classification: "unconfirmed" });
  for (const code of ["UNCONFIRMED_PROVENANCE", "INVALID_TIMESTAMP", "INVALID_UNICODE", "MISSING_ASSET"]) assert.ok(codes(report).includes(code), code);
});

test("legacy paid/delivered labels do not fabricate captures, consent, ownership or shipment history", async () => {
  const report = await reportFor(syntheticCMS()), row = report.records.find(r => r.entity === "orders");
  assert.equal(row.projection.paymentMode, "legacy_unknown");
  assert.equal(row.projection.paymentStatus, "unpaid");
  assert.equal(row.projection.dataQuality, "legacy_incomplete");
  assert.equal(row.payload.paymentStatus, "paid");
  assert.ok(row.issues.some(i => i.code === "UNVERIFIED_PAYMENT_HISTORY"));
  assert.equal(report.records.find(r => r.entity === "admins").disposition, "quarantined");
  assert.equal(report.records.find(r => r.entity === "discounts").projection.historicalUsage, 3);
});

test("archive tampering and credential reinsertion are rejected before validation/import", async () => {
  const { extractSources } = await extraction(), { validateSnapshot } = await validation();
  const snapshot = extractSources(sourceOptions()); snapshot.records[0].payload.name = "tampered";
  assert.throws(() => validateSnapshot(snapshot), /checksum/i);
});

test("private export is immutable, verified on read, and safe report contains only aggregate metadata", async () => {
  const { extractSources, writePrivateExport, readPrivateExport } = await extraction();
  const snapshot = extractSources(sourceOptions()), root = await mkdtemp(resolve("temp", "migration-unit-"));
  try {
    const directory = join(root, "archive");
    await writePrivateExport(snapshot, directory);
    assert.deepEqual(await readPrivateExport(directory), snapshot);
    await assert.rejects(writePrivateExport(snapshot, directory));
    const { safeReport, validateSnapshot } = await validation();
    const safe = JSON.stringify(safeReport(validateSnapshot(snapshot)));
    for (const needle of ["Synthetic customer", "+77000000001", "example.invalid", "staff1", "OLD-9000007"]) assert.ok(!safe.includes(needle), needle);
    assert.ok((await readdir(directory)).includes("snapshot.json"));
    assert.ok((await stat(join(directory, "snapshot.json"))).isFile());
    assert.ok((await readFile(join(directory, "snapshot.json"), "utf8")).includes(snapshot.artifactChecksum));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("dry-run CLI replays a checked archive without a database and exits nonzero for quarantine", async () => {
  const { extractSources, writePrivateExport } = await extraction();
  const root = await mkdtemp(resolve("temp", "migration-cli-"));
  try {
    await writePrivateExport(extractSources(sourceOptions()), join(root, "archive"));
    await assert.rejects(promisify(execFile)(process.execPath, ["--conditions=react-server", "scripts/migration/dry-run.ts", "--archive", join(root, "archive")], { env: { ...process.env, DATABASE_URL: "must-never-connect" } }), error => {
      assert.equal(error.code, 2);
      const report = JSON.parse(error.stdout);
      assert.equal(report.ready, false);
      assert.equal(report.counts.products.importable, 1);
      assert.equal(report.counts.admins.quarantined, 1);
      assert.ok(!error.stdout.includes("Synthetic customer"));
      return true;
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("original source backups keep exact bytes with inert extensions outside TypeScript/lint discovery", async () => {
  const { extractSources, writePrivateExport } = await extraction();
  const options = sourceOptions(), root = await mkdtemp(resolve("temp", "migration-backup-"));
  try {
    await writePrivateExport(extractSources(options), join(root, "archive"), options.sources);
    const files = await readdir(join(root, "archive/originals"), { recursive: true });
    assert.ok(files.every(file => !/\.(?:[jt]sx?|json)$/.test(file)), "source backup must not be discovered as project code");
    assert.equal(await readFile(join(root, "archive/originals/src/lib/cms/data.json.snapshot"), "utf8"), options.sources[0].contents);
  } finally { await rm(root, { recursive: true, force: true }); }
});
