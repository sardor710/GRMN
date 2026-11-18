import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, symlink, readdir, unlink, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { syntheticCMS, sourceOptions } from "../fixtures/migration.mjs";
import { extractSources, writePrivateExport, readPrivateExport } from "../../scripts/migration/extract.ts";
import { validateSnapshot } from "../../scripts/migration/validate.ts";
import { canonical, sha256 } from "../../scripts/migration/map.ts";
const execute = promisify(execFile);
const report = cms => validateSnapshot(extractSources(sourceOptions(cms)));
const row = (r, entity) => r.records.find(item => item.entity === entity);

test("explicit foreign-currency line evidence quarantines an otherwise balanced KZT order", () => {
  const cms = syntheticCMS(); cms.orders[0].items[0].currency = "USD";
  assert.equal(row(report(cms), "orders").disposition, "quarantined");
});

test("financial numeric source lexemes cannot lose precision or exponent notation during JSON parsing", () => {
  for (const literal of ["1.00000000000000001", "1e3"]) {
    const options = sourceOptions(); options.sources[0].contents = options.sources[0].contents.replace('"price":"1234.56"', `"price":${literal}`);
    const result = validateSnapshot(extractSources(options));
    assert.ok(row(result, "products").issues.some(issue => issue.code === "INVALID_MONEY"));
    assert.equal(row(result, "products").numberLexemes.price, literal);
  }
});

test("malformed normalized fields quarantine their own aggregate before database insertion", () => {
  for (const [entity, field, value] of [["products", "specs", [null]], ["products", "features", ["bad"]], ["products", "sku", " PADDED "], ["products", "createdAt", 42], ["products", "isFeatured", "yes"], ["blogs", "focusKeywords", "bad"], ["blogs", "readingTime", {}], ["banners", "order", 2147483648], ["clients", "createdAt", false], ["clients", "avatar", 42]]) {
    const cms = syntheticCMS(); cms[entity][0][field] = value;
    assert.equal(row(report(cms), entity).disposition, "quarantined", `${entity}.${field}`);
  }
  const cms = syntheticCMS(); cms.homepage = "bad";
  assert.equal(row(report(cms), "homepage").disposition, "quarantined");
  cms.discounts[0].startDate = "2026-02-02T00:00:00Z"; cms.discounts[0].expiresAt = "2026-01-01T00:00:00Z";
  assert.equal(row(report(cms), "discounts").disposition, "quarantined");
});

test("accessory SKU aliases resolve without resurrecting static fallback products", () => {
  const cms = syntheticCMS(), other = { ...cms.products[0], id: "p2", sku: "SYN-2" };
  cms.products.push(other); cms.products[0].compatibleAccessories = ["syn-2"];
  assert.equal(row(report(cms), "products").disposition, "importable");
});

test("accessory dependencies propagate invalid or ambiguous target blockers", () => {
  const cms = syntheticCMS(), other = { ...cms.products[0], id: "p2", sku: "SYN-2", price: "bad" };
  cms.products.push(other); cms.products[0].compatibleAccessories = ["p2"];
  assert.equal(row(report(cms), "products").disposition, "quarantined");
  other.price = "10"; other.sku = "p1"; cms.products[0].compatibleAccessories = ["p1"];
  assert.ok(row(report(cms), "products").issues.some(issue => issue.code === "AMBIGUOUS_ACCESSORY"));
});

test("unsafe unknown property names quarantine normalized payloads while preserving exact source keys", () => {
  const cms = syntheticCMS(); cms.products[0]["unsafe\u0000key"] = "retained";
  const result = report(cms);
  assert.equal(row(result, "products").disposition, "quarantined");
  assert.equal(row(result, "products").payload["unsafe\u0000key"], "retained");
});

test("unknown entity names cannot collide with JavaScript prototype properties", () => {
  const cms = syntheticCMS(); cms.constructor = [{ id: "odd", custom: 1 }];
  Object.defineProperty(cms, "__proto__", { enumerable: true, value: [{ id: "also-odd" }] });
  const result = report(cms);
  assert.equal(result.counts.constructor.quarantined, 1);
  assert.equal(result.counts.__proto__.quarantined, 1);
});

test("recognized credential aliases are excluded recursively before normalized or raw storage", () => {
  const cms = syntheticCMS(); cms.products[0].configuration = { smtpPass: "SMTP-SECRET", nested: { otpSeed: "OTP-SECRET", clientKey: "CLIENT-SECRET" } };
  const snapshot = extractSources(sourceOptions(cms)), serialized = JSON.stringify(snapshot);
  for (const value of ["SMTP-SECRET", "OTP-SECRET", "CLIENT-SECRET"]) assert.ok(!serialized.includes(value));
});

test("recovered malformed TypeScript declarations remain unresolved rather than certified static content", () => {
  const options = sourceOptions(); options.sources.push({ path: "src/lib/broken.ts", contents: 'export const records = [{id:"x",name:"unfinished"}' }); options.staticDefinitions = ["src/lib/broken.ts#records"];
  const result = validateSnapshot(extractSources(options));
  assert.equal(row(result, "static:src/lib/broken.ts#records").disposition, "quarantined");
});

test("canonical hashes distinguish exact Unicode keys but ignore insertion order", () => {
  assert.equal(canonical({ "é": 1, "e\u0301": 2 }), canonical({ "e\u0301": 2, "é": 1 }));
});

test("partial original backups cannot be read as a completed export", async () => {
  const options = sourceOptions(), directory = await mkdtemp(resolve("temp", "migration-incomplete-"));
  try {
    await writePrivateExport(extractSources(options), directory, options.sources);
    await unlink(join(directory, "originals/src/lib/cms/data.json.snapshot"));
    await assert.rejects(readPrivateExport(directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("backup inventory failure publishes no readable completed snapshot", async () => {
  const options = sourceOptions(), directory = await mkdtemp(resolve("temp", "migration-interrupted-export-"));
  try {
    await assert.rejects(writePrivateExport(extractSources(options), directory, [{ ...options.sources[0], contents: "changed" }]));
    await assert.rejects(readPrivateExport(directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("raw source buffers and checksums survive invalid UTF-8 without replacement", async () => {
  const options = sourceOptions(), bytes = Buffer.from([47, 47, 0xff, 10]);
  options.sources.push({ path: "src/raw.ts", contents: bytes.toString("utf8"), bytes });
  const snapshot = extractSources(options), directory = await mkdtemp(resolve("temp", "migration-raw-bytes-"));
  try {
    assert.equal(snapshot.sources.find(source => source.path === "src/raw.ts").sha256, sha256(bytes));
    await writePrivateExport(snapshot, directory, options.sources);
    assert.deepEqual(await readFile(join(directory, "originals/src/raw.ts.snapshot")), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("preexisting linked backup descendants cannot redirect private original writes", async () => {
  const root = await mkdtemp(resolve("temp", "migration-linked-backup-"));
  try {
    const output = join(root, "output"), other = join(root, "other"); await mkdir(output); await mkdir(other);
    await symlink(other, join(output, "originals"), process.platform === "win32" ? "junction" : "dir");
    const options = sourceOptions();
    await assert.rejects(writePrivateExport(extractSources(options), output, options.sources));
    assert.deepEqual(await readdir(other), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("private export removes preexisting explicit access for other Windows principals", { skip: process.platform !== "win32" }, async () => {
  const directory = await mkdtemp(resolve("temp", "migration-explicit-acl-"));
  try {
    await execute("icacls", [directory, "/grant", "*S-1-1-0:(OI)(CI)R"], { windowsHide: true });
    await writePrivateExport(extractSources(sourceOptions()), directory);
    const acl = join(directory, "acl.snapshot");
    await execute("icacls", [directory, "/save", acl, "/q"], { windowsHide: true });
    assert.ok(!(await readFile(acl)).toString("utf16le").includes(";;;WD)"), "Everyone explicit grant must be removed");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rehearsal exit semantics distinguish reconciliation failure from fully accounted quarantine", async () => {
  const { rehearsalExitCode } = await import("../../scripts/migration/rehearse.ts");
  const completed = { ready: true, status: "completed", mismatches: [] }, quarantined = { ready: false, status: "quarantined", mismatches: [] };
  assert.equal(rehearsalExitCode([completed, completed, completed]), 0);
  assert.equal(rehearsalExitCode([quarantined, quarantined, quarantined]), 2);
  assert.equal(rehearsalExitCode([{ ...quarantined, mismatches: [{ code: "TARGET_DRIFT" }] }, completed, completed]), 1);
});
