// Task 23 G5: the operator health check (plan Section 11 alert list, minimum version). It turns
// gathered facts into alerts and a non-zero exit, so cron or a monitor can page on it.
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHealth } from "../../scripts/ops/health.ts";

const healthy = { jobs: { dead: 0, expiredLeases: 0, oldestReadyAgeMs: 2000, overdueHolds: 0 }, archiver: { failedCount: 0, lastFailedAt: null, lastArchivedAgeMs: 60_000 }, backup: { newestBaseAgeMs: 3600_000 }, invariants: [{ name: "on_hand equals the ledger", ok: true }] };

test("a healthy system has no alerts", () => {
  assert.deepEqual(evaluateHealth(healthy), { ok: true, alerts: [] });
});

test("dead jobs, a stale job queue, overdue holds and expired leases alert", () => {
  const r = evaluateHealth({ ...healthy, jobs: { dead: 2, expiredLeases: 1, oldestReadyAgeMs: 10 * 60_000, overdueHolds: 3 } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.alerts.map(a => a.code).sort(), ["expired_leases", "jobs_dead", "jobs_stale", "overdue_holds"]);
});

test("WAL archiving failures, a silent archiver and an old or missing base backup alert", () => {
  assert.deepEqual(evaluateHealth({ ...healthy, archiver: { failedCount: 1, lastFailedAt: "2026-11-18T10:00:00Z", lastArchivedAgeMs: 60_000, lastFailedAfterArchived: true } }).alerts.map(a => a.code), ["wal_archive_failing"]);
  assert.deepEqual(evaluateHealth({ ...healthy, archiver: { failedCount: 0, lastFailedAt: null, lastArchivedAgeMs: 20 * 60_000 } }).alerts.map(a => a.code), ["wal_archive_stale"]);
  assert.deepEqual(evaluateHealth({ ...healthy, backup: { newestBaseAgeMs: 30 * 3600_000 } }).alerts.map(a => a.code), ["base_backup_old"]);
  assert.deepEqual(evaluateHealth({ ...healthy, backup: { newestBaseAgeMs: null } }).alerts.map(a => a.code), ["base_backup_missing"]);
  // An old failure that a later successful archive has superseded does not alert.
  assert.equal(evaluateHealth({ ...healthy, archiver: { failedCount: 5, lastFailedAt: "x", lastArchivedAgeMs: 60_000, lastFailedAfterArchived: false } }).ok, true);
});

test("a failed invariant alerts with its name", () => {
  const r = evaluateHealth({ ...healthy, invariants: [{ name: "no negative available stock", ok: false }, { name: "x", ok: true }] });
  assert.deepEqual(r.alerts, [{ code: "invariant_failed", message: "Invariant failed: no negative available stock" }]);
});

test("backup facts are optional when the check runs without the backup directory", () => {
  assert.equal(evaluateHealth({ ...healthy, backup: undefined }).ok, true);
});
