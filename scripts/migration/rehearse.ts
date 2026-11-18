import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, sep, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { z } from "zod";
import { startTemporaryPostgres } from "../db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { readPrivateExport, secureDirectory } from "./extract.ts";
import { importSnapshot } from "./import.ts";
import { reconcileSnapshot, rollbackSafely } from "./reconcile.ts";
import type { Reconciliation } from "./reconcile.ts";
import { canonical, compareExact, sha256 } from "./map.ts";

const databaseSnapshotSchema = z.object({ version: z.literal(1), tables: z.record(z.string(), z.array(z.record(z.string(), z.json()))), migrations: z.array(z.object({ file: z.string(), checksum: z.string() }).strict()), checksum: z.string() }).strict();
type DatabaseSnapshot = z.infer<typeof databaseSnapshotSchema>;

export async function saveStagingSnapshot(pool: Pool, directory: string): Promise<{ checksum: string; tables: Record<string, number> }> {
  await secureDirectory(directory);
  const client = await pool.connect();
  const tables: DatabaseSnapshot["tables"] = Object.create(null), state = { unsafe: false };
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const names = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    for (const row of names.rows) {
      const name = String(row.tablename);
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Unsupported staging table");
      const rows = (await client.query(`SELECT * FROM public."${name}"`)).rows;
      tables[name] = JSON.parse(JSON.stringify(rows)).sort((a: unknown, b: unknown) => compareExact(canonical(a), canonical(b)));
    }
    await client.query("COMMIT");
  } catch (error) { await rollbackSafely(client, state); throw error; } finally { client.release(state.unsafe); }
  const files = (await readdir(resolve("drizzle"))).filter(file => file.endsWith(".sql")).sort();
  const migrations = await Promise.all(files.map(async file => ({ file, checksum: sha256(await readFile(resolve("drizzle", file))) })));
  const body = { version: 1 as const, tables, migrations }, checksum = sha256(canonical(body));
  await writeFile(resolve(directory, "database.json.snapshot"), canonical({ ...body, checksum }), { flag: "wx", mode: 0o600 });
  return { checksum, tables: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])) };
}

export async function readStagingSnapshot(directory: string): Promise<DatabaseSnapshot> {
  const snapshot = databaseSnapshotSchema.parse(JSON.parse(await readFile(resolve(directory, "database.json.snapshot"), "utf8")));
  const { checksum, ...body } = snapshot;
  if (sha256(canonical(body)) !== checksum) throw new Error("Staging snapshot checksum mismatch");
  return snapshot;
}

export function rehearsalExitCode(phases: Pick<Reconciliation, "ready" | "status" | "mismatches">[]): number {
  if (phases.some(phase => phase.mismatches.length || !["completed", "quarantined"].includes(phase.status))) return 1;
  return phases.every(phase => phase.ready) ? 0 : 2;
}

export async function protectTemporaryDatabase(pool: Pool): Promise<string> {
  const row = (await pool.query("SELECT current_database() AS database,current_user AS username,host(inet_server_addr()) AS host,current_setting('data_directory') AS directory")).rows[0];
  const directory = resolve(row.directory, ".."), root = resolve("temp");
  if (row.database !== "grmn_test" || row.username !== "grmn_test_admin" || row.host !== "127.0.0.1" || !directory.startsWith(root + sep) || !basename(directory).startsWith("grmn-test-postgres-")) throw new Error("Not an owned disposable cluster");
  await secureDirectory(directory);
  // Before business writes, reset descendants to the now-private parent DACL.
  if (process.platform === "win32") await promisify(execFile)("icacls", [resolve(row.directory), "/reset", "/T", "/q"], { windowsHide: true });
  await secureDirectory(resolve(row.directory));
  return directory;
}

export async function runRehearsal(args: string[]): Promise<number> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!["--archive", "--output"].includes(key) || !value || value.startsWith("--") || options.has(key)) throw new Error("Invalid rehearsal arguments");
    options.set(key, value);
  }
  if (options.size !== 2) throw new Error("A checked archive and private output are required");
  const snapshot = await readPrivateExport(options.get("--archive")!);
  const directory = options.get("--output")!;
  await secureDirectory(directory);
  // Reserve output before starting a database, to reject accidental overwrite.
  await writeFile(resolve(directory, "rehearsal.lock"), snapshot.artifactChecksum, { flag: "wx", mode: 0o600 });
  const temporary = await startTemporaryPostgres();
  const handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "2" }));
  try {
    await protectTemporaryDatabase(handle.pool);
    await migrate(handle.db, { migrationsFolder: "drizzle" });
    const first = await importSnapshot(handle.pool, snapshot, { offline: true });
    const replay = await importSnapshot(handle.pool, snapshot, { offline: true });
    const reconciliation = await reconcileSnapshot(handle.pool, snapshot);
    const database = await saveStagingSnapshot(handle.pool, directory);
    await readStagingSnapshot(directory);
    const report = { version: 1, artifactChecksum: snapshot.artifactChecksum, sourceChecksum: snapshot.sourceChecksum, first, replay, reconciliation, database };
    await writeFile(resolve(directory, "reconciliation.json"), canonical(report), { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return rehearsalExitCode([first, replay, reconciliation]);
  } finally { try { await handle.close(); } finally { await temporary.stop(); } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await runRehearsal(process.argv.slice(2)); }
  catch { process.stderr.write("Local rehearsal failed; inspect private receipts. No external target or source file was written.\n"); process.exitCode = 1; }
}
