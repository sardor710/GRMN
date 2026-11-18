// Task 23 G5: operator health check. Gathers job/worker state, the WAL archiver, the newest base
// backup (when --backup-dir is given) and the data invariants (scripts/perf/invariants.sql), prints one
// JSON line and exits 1 when anything needs attention. Run every few minutes from cron and wire the
// non-zero exit to the owner's alert channel. Only counts and names are printed.
//   DATABASE_URL=… node --conditions=react-server scripts/ops/health-check.mjs [--backup-dir /backup] [--skip-invariants]
import { readFile, readdir } from "node:fs/promises";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { getJobMetrics } from "../../src/server/operations/admin.ts";
import { evaluateHealth } from "./health.ts";

const args = process.argv.slice(2), at = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const database = createDatabase(parseServerEnv({ ...process.env, DATABASE_POOL_MAX: "1", DATABASE_STATEMENT_TIMEOUT_MS: "30000" }));
try {
  const jobs = await getJobMetrics(database.pool);
  const a = (await database.pool.query(`SELECT failed_count::int AS failed,last_failed_time,
      (extract(epoch FROM clock_timestamp()-last_archived_time)*1000)::bigint AS archived_age,
      COALESCE(last_failed_time>last_archived_time OR (last_archived_time IS NULL AND last_failed_time IS NOT NULL),false) AS failing
    FROM pg_stat_archiver`)).rows[0];
  let backup;
  const dir = at("--backup-dir");
  if (dir) {
    const stamps = (await readdir(`${dir}/base`).catch(() => [])).filter(n => /^\d{8}T\d{6}Z$/.test(n)).sort();
    const newest = stamps.at(-1);
    backup = { newestBaseAgeMs: newest ? Date.now() - Date.parse(newest.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")) : null };
  }
  const invariants = args.includes("--skip-invariants") ? [] : (await database.pool.query(await readFile(new URL("../perf/invariants.sql", import.meta.url), "utf8"))).rows.map(r => ({ name: String(r.invariant ?? r.name ?? Object.values(r)[0]), ok: Object.values(r)[1] === true }));
  const facts = {
    jobs: { dead: jobs.dead, expiredLeases: jobs.expiredLeases, oldestReadyAgeMs: jobs.oldestReadyAgeMs, overdueHolds: jobs.reservations.overdue },
    archiver: { failedCount: a.failed, lastFailedAt: a.last_failed_time?.toISOString?.() ?? null, lastArchivedAgeMs: a.archived_age === null ? null : Number(a.archived_age), lastFailedAfterArchived: a.failing },
    ...(backup ? { backup } : {}), invariants,
  };
  const result = evaluateHealth(facts);
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), ...result, facts: { ...facts, invariants: `${invariants.filter(i => i.ok).length}/${invariants.length} ok` } }) + "\n");
  process.exitCode = result.ok ? 0 : 1;
} catch { process.stderr.write("Health check could not run (database unreachable or misconfigured).\n"); process.exitCode = 2; }
finally { await database.close(); }
