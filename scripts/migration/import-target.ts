// Task 23 G2: import a checked private export into a persistent target (staging, or production at
// cutover). Unlike db:import:rehearse, which only writes its own disposable cluster, this points the
// same importer at a real database, so it refuses anything but a deliberate, prepared target:
//   - the target's database name must equal --confirm-database;
//   - every shipped migration must be applied (drizzle journal = applied migrations);
//   - the target must hold no live checkout orders (import happens before cutover, never into live
//     commerce; a replay of the same archive is still allowed and is a no-op).
// The connection comes from IMPORT_DATABASE_URL only (never .env.local or DATABASE_URL), the run holds
// the importer's one-writer namespace lock, and the reconciliation report goes to a private temp/
// directory. Exit codes match the dry run: 0 ready, 2 accounted-for quarantine, 1 failure.
//   IMPORT_DATABASE_URL=… npm run db:import:target -- --archive temp/<export> --output temp/<new> --confirm-database <name>
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import type { Snapshot } from "./extract.ts";
import { readPrivateExport, secureDirectory } from "./extract.ts";
import { importSnapshot } from "./import.ts";
import { reconcileSnapshot } from "./reconcile.ts";
import { canonical } from "./map.ts";
import { rehearsalExitCode } from "./rehearse.ts";

export interface TargetImportResult {
  exitCode: number;
  summary: { database: string; status: string; ready: boolean; mismatches: number; blockers: number; counts: Record<string, unknown>; financial: Record<string, unknown> };
}

export async function importIntoTarget(pool: Pool, snapshot: Snapshot, options: { confirmDatabase: string; output: string }): Promise<TargetImportResult> {
  const database = String((await pool.query("SELECT current_database() AS name")).rows[0].name);
  if (database !== options.confirmDatabase) throw new Error(`Target database "${database}" does not match the confirmation`);
  const journal = (JSON.parse(await readFile(resolve("drizzle", "meta", "_journal.json"), "utf8")) as { entries: unknown[] }).entries.length;
  let applied = -1;
  try { applied = Number((await pool.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")).rows[0].n); } catch { applied = -1; }
  if (applied !== journal) throw new Error(`Target is not migrated to the shipped schema (${Math.max(applied, 0)} of ${journal} migrations)`);
  const live = Number((await pool.query("SELECT count(*)::int AS n FROM orders WHERE checkout_attempt_id IS NOT NULL")).rows[0].n);
  if (live > 0) throw new Error(`Target already holds ${live} live checkout orders; import only before cutover`);

  await secureDirectory(options.output);
  // Reserve the output first, so an accidental reuse fails before any write.
  await writeFile(resolve(options.output, "import.lock"), snapshot.artifactChecksum, { flag: "wx", mode: 0o600 });
  const first = await importSnapshot(pool, snapshot, { offline: true });
  const reconciliation = await reconcileSnapshot(pool, snapshot);
  const report = { version: 1, database, artifactChecksum: snapshot.artifactChecksum, sourceChecksum: snapshot.sourceChecksum, first, reconciliation };
  await writeFile(resolve(options.output, "reconciliation.json"), canonical(report), { flag: "wx", mode: 0o600 });
  return {
    exitCode: rehearsalExitCode([first, reconciliation]),
    summary: { database, status: reconciliation.status, ready: reconciliation.ready, mismatches: first.mismatches.length + reconciliation.mismatches.length, blockers: reconciliation.blockers, counts: reconciliation.counts, financial: reconciliation.financial },
  };
}

export async function runTargetImport(args: string[], env: Readonly<Record<string, string | undefined>> = process.env): Promise<number> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!["--archive", "--output", "--confirm-database"].includes(key) || !value || value.startsWith("--") || options.has(key)) throw new Error("Invalid import arguments");
    options.set(key, value);
  }
  if (options.size !== 3) throw new Error("--archive, --output and --confirm-database are required");
  if (!env.IMPORT_DATABASE_URL) throw new Error("IMPORT_DATABASE_URL is required");
  const snapshot = await readPrivateExport(options.get("--archive")!);
  const handle = createDatabase(parseServerEnv({ DATABASE_URL: env.IMPORT_DATABASE_URL, DATABASE_POOL_MAX: "2", DATABASE_STATEMENT_TIMEOUT_MS: "60000", DATABASE_CONNECT_TIMEOUT_MS: "10000" }));
  try {
    const result = await importIntoTarget(handle.pool, snapshot, { confirmDatabase: options.get("--confirm-database")!, output: options.get("--output")! });
    // Aggregate counts and checksums only; no personal data on stdout.
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    return result.exitCode;
  } finally { await handle.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await runTargetImport(process.argv.slice(2)); }
  catch (error) {
    // Only the guard's own message is printed; driver errors could carry connection details.
    const message = error instanceof Error && /^(Target |Invalid import|--archive|IMPORT_DATABASE_URL|SOURCE_CHANGED)/.test(error.message) ? error.message : "Target import failed; inspect the private output and the database log.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
