// Task 23 G5: turns gathered operational facts into alerts (plan Section 11 alert list, first cut).
// Thresholds follow the provisional targets: routine jobs start within 60 s (alert at 5 min),
// WAL archived at least every archive_timeout (300 s; alert at 15 min, the proposed RPO), and a
// base backup at least daily (alert after 26 h).
export interface HealthFacts {
  jobs: { dead: number; expiredLeases: number; oldestReadyAgeMs: number | null; overdueHolds: number };
  archiver: { failedCount: number; lastFailedAt: string | null; lastArchivedAgeMs: number | null; lastFailedAfterArchived?: boolean };
  backup?: { newestBaseAgeMs: number | null };
  invariants: { name: string; ok: boolean }[];
}
export interface Alert { code: string; message: string }

const MIN = 60_000, HOUR = 60 * MIN;
export const THRESHOLDS = { jobStaleMs: 5 * MIN, walStaleMs: 15 * MIN, baseBackupMs: 26 * HOUR } as const;

export function evaluateHealth(facts: HealthFacts): { ok: boolean; alerts: Alert[] } {
  const alerts: Alert[] = [];
  const add = (code: string, message: string) => alerts.push({ code, message });
  if (facts.jobs.dead > 0) add("jobs_dead", `${facts.jobs.dead} dead-lettered jobs need replay or review`);
  if (facts.jobs.expiredLeases > 0) add("expired_leases", `${facts.jobs.expiredLeases} job leases expired (a worker died or stalled)`);
  if ((facts.jobs.oldestReadyAgeMs ?? 0) > THRESHOLDS.jobStaleMs) add("jobs_stale", `Oldest ready job waited ${Math.round((facts.jobs.oldestReadyAgeMs ?? 0) / 1000)} s; is the worker running?`);
  if (facts.jobs.overdueHolds > 0) add("overdue_holds", `${facts.jobs.overdueHolds} stock holds are past expiry and not released`);
  if (facts.archiver.lastFailedAfterArchived) add("wal_archive_failing", `WAL archiving is failing (last failure ${facts.archiver.lastFailedAt})`);
  else if (facts.archiver.lastArchivedAgeMs === null || facts.archiver.lastArchivedAgeMs > THRESHOLDS.walStaleMs) add("wal_archive_stale", "No WAL segment archived recently; point-in-time recovery is at risk");
  if (facts.backup) {
    if (facts.backup.newestBaseAgeMs === null) add("base_backup_missing", "No base backup found");
    else if (facts.backup.newestBaseAgeMs > THRESHOLDS.baseBackupMs) add("base_backup_old", `Newest base backup is ${Math.round(facts.backup.newestBaseAgeMs / HOUR)} h old`);
  }
  for (const invariant of facts.invariants) if (!invariant.ok) add("invariant_failed", `Invariant failed: ${invariant.name}`);
  return { ok: alerts.length === 0, alerts };
}
