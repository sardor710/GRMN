import assert from "node:assert/strict";
import { test } from "node:test";
import { syntheticCMS, sourceOptions } from "../fixtures/migration.mjs";

// Task 24: owner dispositions resolve quarantine explicitly. Breaks caught: a removal that still
// imports live rows, an acceptance that hides an unrelated blocker, a stale rule that silently
// matches nothing, and decisions that are not part of the checksummed archive.
const extraction = () => import("../../scripts/migration/extract.ts");
const validation = () => import("../../scripts/migration/validate.ts");
const decisions = rules => ({ version: 1, approvedBy: "owner", approvedAt: "2026-11-19", rules });
const report = async (cms, rules) => (await validation()).validateSnapshot((await extraction()).extractSources(sourceOptions(cms, rules ? { decisions: decisions(rules) } : {})));
const record = (r, entity) => r.records.find(x => x.entity === entity);

test("an exclude rule removes importable and quarantined records from live targets and resolves their blockers", async () => {
  const cms = syntheticCMS(); cms.orders[0].items[0].productId = "missing";
  const r = await report(cms, [
    { id: "no-products", entity: "products", action: "exclude", reason: "Owner removes all legacy products" },
    { id: "no-orders", entity: "orders", action: "exclude", reason: "Owner removes all legacy orders" },
  ]);
  for (const entity of ["products", "orders"]) {
    const row = record(r, entity);
    assert.equal(row.disposition, "excluded");
    assert.ok(row.issues.some(i => i.code === "OWNER_EXCLUDED" && i.severity === "warning"));
    assert.ok(row.issues.filter(i => i.severity === "blocker").every(i => i.resolution?.action === "exclude"));
  }
  assert.ok(record(r, "orders").issues.some(i => i.code === "UNRESOLVED_PRODUCT" && i.resolution.rule === "no-orders"));
  assert.equal(r.counts.products.excluded, 1); assert.equal(r.counts.orders.excluded, 1);
  assert.equal(record(r, "clients").disposition, "importable");
});

test("an accept rule resolves only the named blocker codes; another blocker still quarantines", async () => {
  const cms = syntheticCMS(); cms.banners[0].image = "/images/missing.jpg";
  let r = await report(cms, [{ id: "banner-images", entity: "banners", action: "accept", codes: ["MISSING_ASSET"], reason: "Staff replace the image before publishing" }]);
  assert.equal(record(r, "banners").disposition, "importable");
  assert.equal(record(r, "banners").issues.find(i => i.code === "MISSING_ASSET").resolution.action, "accept");
  cms.banners[0].order = -1;
  r = await report(cms, [{ id: "banner-images", entity: "banners", action: "accept", codes: ["MISSING_ASSET"], reason: "Staff replace the image before publishing" }]);
  assert.equal(record(r, "banners").disposition, "quarantined");
  assert.equal(record(r, "banners").issues.find(i => i.code === "INVALID_INTEGER").resolution, undefined);
});

test("keys and entity prefixes narrow a rule", async () => {
  const cms = syntheticCMS(); cms.clients.push({ ...cms.clients[0], id: "c2", phone: "+77000000002", email: "two@example.invalid" });
  const r = await report(cms, [{ id: "one-client", entity: "clients", keys: ["c2"], action: "exclude", reason: "Owner removes this contact" }]);
  assert.deepEqual(r.records.filter(x => x.entity === "clients").map(x => [x.identity, x.disposition]), [["c1", "importable"], ["c2", "excluded"]]);
  const staticReport = await (await validation()).validateSnapshot((await extraction()).extractSources(sourceOptions(syntheticCMS(), {
    sources: [...sourceOptions().sources, { path: "src/components/AccountDashboard.tsx", contents: "export const devices = [{id:\"d1\",name:\"Demo\"}];" }],
    staticDefinitions: ["src/components/AccountDashboard.tsx#devices"],
    decisions: decisions([{ id: "demo", entity: "static:src/components/AccountDashboard.tsx#*", action: "exclude", reason: "Demo literals removed in 24C" }]),
  })));
  const demo = staticReport.records.find(x => x.entity.startsWith("static:"));
  assert.equal(demo.disposition, "excluded");
  assert.equal(demo.issues.find(i => i.code === "UNVERIFIED_OWNER").resolution.rule, "demo");
});

test("a rule that matches nothing, or an accept code no record has, is refused", async () => {
  await assert.rejects(report(syntheticCMS(), [{ id: "stale", entity: "invoices", action: "exclude", reason: "x" }]), /Owner decision "stale" matches no source record/);
  await assert.rejects(report(syntheticCMS(), [{ id: "stale-code", entity: "banners", action: "accept", codes: ["MISSING_ASSET"], reason: "x" }]), /Owner decision "stale-code" accepts no open blocker/);
  await assert.rejects(report(syntheticCMS(), [{ id: "dup", entity: "products", action: "exclude", reason: "x" }, { id: "dup", entity: "orders", action: "exclude", reason: "x" }]), /Invalid owner decisions/);
  await assert.rejects(report(syntheticCMS(), [{ id: "no-codes", entity: "banners", action: "accept", reason: "x" }]), /Invalid owner decisions/);
});

test("decisions are part of the checksummed archive, and archives without them still validate", async () => {
  const { extractSources, assertSnapshot } = await extraction();
  const rules = [{ id: "no-products", entity: "products", action: "exclude", reason: "x" }];
  const withDecisions = extractSources(sourceOptions(syntheticCMS(), { decisions: decisions(rules) })), without = extractSources(sourceOptions());
  assert.notEqual(withDecisions.artifactChecksum, without.artifactChecksum);
  assert.equal(without.decisions, undefined);
  assertSnapshot(withDecisions); assertSnapshot(without);
  const tampered = structuredClone(withDecisions); tampered.decisions.rules[0].entity = "orders";
  assert.throws(() => assertSnapshot(tampered), /checksum/);
});

test("the shipped owner dispositions leave no quarantine in the current legacy source", async () => {
  const { collectCurrentSources, extractSources } = await extraction();
  const current = await collectCurrentSources();
  assert.ok(current.decisions, "docs/backend/owner-dispositions.json is collected");
  const r = (await validation()).validateSnapshot(extractSources({ ...current, namespace: "garmin-legacy-v1", classification: "owner_confirmed_real", cmsMoney: "KZT-major" }));
  assert.deepEqual(r.records.filter(x => x.disposition === "quarantined").map(x => `${x.entity} ${x.identity}`), []);
  for (const entity of ["products", "orders", "clients", "admins", "discounts", "settings", "activities"]) assert.equal(r.counts[entity].importable, 0, entity);
  assert.equal(r.counts.banners.importable, 4); assert.equal(r.counts.blogs.importable, 12); assert.equal(r.counts.homepage.importable, 1);
});
