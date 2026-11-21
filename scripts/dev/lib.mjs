// Shared helpers for the persistent local development stack (npm run dev:stack / dev:db / dev:seed /
// dev:import / dev:admin). Development only: a single loopback PostgreSQL 18 cluster under
// storage/devdb/ (gitignored), initialized once with random credentials kept in
// storage/devdb/dev-secrets.json. Nothing here ever deletes the data directory; a reset is a
// deliberate manual step (see docs/backend/local-development.md).
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";

const execute = promisify(execFile);

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEV_DIR = resolve(ROOT, "storage", "devdb");
export const DATA_DIR = resolve(DEV_DIR, "data");
export const SECRETS_FILE = resolve(DEV_DIR, "dev-secrets.json");
export const LOG_FILE = resolve(DEV_DIR, "postgres.log");
export const DEFAULT_PORT = 55433;
const USER = "grmn_dev_admin";
const DATABASE = "grmn_dev";

export function log(message) { process.stdout.write(`[dev] ${message}\n`); }

export function requestedPort(env = process.env) {
  const raw = env.DEV_DB_PORT ?? String(DEFAULT_PORT);
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1024 || port > 65535) throw new Error("DEV_DB_PORT must be a port number between 1024 and 65535");
  return port;
}

async function binaries() {
  const platform = { win32: "windows", linux: "linux", darwin: "darwin" }[process.platform];
  if (!platform) throw new Error("Unsupported platform for the embedded PostgreSQL development binaries");
  const { initdb, pg_ctl: pgCtl } = await import(`@embedded-postgres/${platform}-${process.arch}`);
  return { initdb, pgCtl };
}

const strongSecret = () => { for (;;) { const value = randomBytes(32).toString("hex"); if (new Set(value).size >= 8) return value; } };

export async function readSecrets() {
  if (!existsSync(SECRETS_FILE)) return null;
  const secrets = JSON.parse(await readFile(SECRETS_FILE, "utf8"));
  if (secrets?.version !== 1 || typeof secrets.password !== "string" || !/^[a-f0-9]{64}$/.test(secrets.authSecret ?? "")) throw new Error(`${SECRETS_FILE} is not a valid dev secrets file; restore it or reset the dev database deliberately`);
  return secrets;
}

export const isInitialized = () => existsSync(resolve(DATA_DIR, "PG_VERSION"));

/** Creates storage/devdb (secrets + initdb) once. Returns the secrets. Never touches an existing cluster. */
export async function ensureCluster() {
  await mkdir(DEV_DIR, { recursive: true });
  let secrets = await readSecrets();
  if (isInitialized()) {
    if (!secrets) throw new Error(`The dev cluster exists but ${SECRETS_FILE} is missing; its password cannot be recovered. Restore the file or reset storage/devdb deliberately.`);
    return secrets;
  }
  if (existsSync(DATA_DIR)) throw new Error(`${DATA_DIR} exists but is not an initialized cluster (interrupted initdb?). Inspect it and remove it yourself before retrying.`);
  if (!secrets) {
    secrets = { version: 1, user: USER, database: DATABASE, password: randomBytes(24).toString("hex"), authSecret: strongSecret(), createdAt: new Date().toISOString() };
    await writeFile(SECRETS_FILE, `${JSON.stringify(secrets, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    log(`created ${SECRETS_FILE} (random DB password and AUTH_SECRET)`);
  }
  const { initdb } = await binaries();
  const passwordFile = resolve(DEV_DIR, "initdb-password.local");
  await writeFile(passwordFile, secrets.password, { mode: 0o600 });
  try {
    log("initializing PostgreSQL cluster (one time)…");
    await execute(initdb, ["-D", DATA_DIR, "-U", secrets.user, "--pwfile", passwordFile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"], { windowsHide: true, timeout: 120000 });
  } finally { await rm(passwordFile, { force: true }); }
  return secrets;
}

/** Port of the running postmaster (line 4 of postmaster.pid), or null. */
async function runningPort() {
  try { const port = Number((await readFile(resolve(DATA_DIR, "postmaster.pid"), "utf8")).split(/\r?\n/)[3]); return Number.isInteger(port) && port > 0 ? port : null; }
  catch { return null; }
}

export async function clusterStatus() {
  if (!isInitialized()) return { initialized: false, running: false, port: null };
  const { pgCtl } = await binaries();
  try {
    await execute(pgCtl, ["-D", DATA_DIR, "status"], { windowsHide: true, timeout: 10000 });
    return { initialized: true, running: true, port: await runningPort() };
  } catch (error) {
    if (error.code === 3) return { initialized: true, running: false, port: null };
    throw new Error("Cannot determine dev PostgreSQL status", { cause: error });
  }
}

async function portFree(port) {
  return new Promise(accept => {
    const probe = createServer();
    probe.once("error", () => accept(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => accept(true)));
  });
}

async function logTail() { try { return (await readFile(LOG_FILE, "utf8")).split(/\r?\n/).slice(-15).join("\n"); } catch { return "(no log)"; } }

/** Starts the cluster when stopped. `startedNow` tells the caller whether it owns the shutdown. */
export async function startCluster() {
  const secrets = await ensureCluster();
  const status = await clusterStatus();
  if (status.running) return { secrets, port: status.port ?? requestedPort(), startedNow: false };
  const port = requestedPort();
  if (!(await portFree(port))) throw new Error(`Port ${port} on 127.0.0.1 is in use; stop that process or set DEV_DB_PORT`);
  const { pgCtl } = await binaries();
  log(`starting PostgreSQL on 127.0.0.1:${port}…`);
  try {
    await execute(pgCtl, ["-D", DATA_DIR, "-l", LOG_FILE, "-o", `-h 127.0.0.1 -p ${port} -c lc_messages=C`, "-w", "-t", "60", "start"], { windowsHide: true, timeout: 70000 });
  } catch (error) {
    throw new Error(`PostgreSQL did not start; see ${LOG_FILE}\n${await logTail()}`, { cause: error });
  }
  await ensureDatabase(secrets, port);
  return { secrets, port, startedNow: true };
}

export async function stopCluster() {
  const status = await clusterStatus();
  if (!status.running) return false;
  const { pgCtl } = await binaries();
  log("stopping PostgreSQL…");
  await execute(pgCtl, ["-D", DATA_DIR, "-m", "fast", "-w", "-t", "60", "stop"], { windowsHide: true, timeout: 70000 });
  return true;
}

async function ensureDatabase(secrets, port) {
  const { Client } = await import("pg");
  const admin = new Client({ host: "127.0.0.1", port, user: secrets.user, password: secrets.password, database: "postgres", connectionTimeoutMillis: 10000 });
  await admin.connect();
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [secrets.database])).rowCount) {
      await admin.query(`CREATE DATABASE "${secrets.database.replace(/"/g, "")}"`);
      log(`created database ${secrets.database}`);
    }
  } finally { await admin.end(); }
}

export const databaseUrl = (secrets, port) => `postgresql://${secrets.user}:${secrets.password}@127.0.0.1:${port}/${secrets.database}`;

/** Applies the reviewed drizzle/ migrations (the integration-test path). Idempotent. Returns applied count. */
export async function migrateDatabase(url) {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { createDatabase } = await import("../../src/server/db/client.ts");
  const { parseServerEnv } = await import("../../src/server/config/env.ts");
  const handle = createDatabase(parseServerEnv({ DATABASE_URL: url, DATABASE_POOL_MAX: "1", DATABASE_CONNECT_TIMEOUT_MS: "10000", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
  try {
    const count = async () => { try { return Number((await handle.pool.query("SELECT count(*) AS n FROM drizzle.__drizzle_migrations")).rows[0].n); } catch { return 0; } };
    const before = await count();
    await migrate(handle.db, { migrationsFolder: resolve(ROOT, "drizzle") });
    return { before, after: await count() };
  } finally { await handle.close(); }
}

/** Runs `work({ url, port, secrets, database })` against the started + migrated dev database. Stops the cluster afterwards only if this call started it. */
export async function withDevDatabase(work, { poolMax = "5" } = {}) {
  const started = await startCluster();
  const url = databaseUrl(started.secrets, started.port);
  try {
    const migration = await migrateDatabase(url);
    if (migration.after !== migration.before) log(`applied ${migration.after - migration.before} migration(s) (${migration.after} total)`);
    const { createDatabase } = await import("../../src/server/db/client.ts");
    const { parseServerEnv } = await import("../../src/server/config/env.ts");
    const database = createDatabase(parseServerEnv({ DATABASE_URL: url, DATABASE_POOL_MAX: poolMax, DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
    try { return await work({ url, port: started.port, secrets: started.secrets, database }); }
    finally { await database.close(); }
  } finally { if (started.startedNow) await stopCluster(); }
}

/** .env.local parsed like --env-file-if-exists (values only; nothing is exported to process.env). */
export async function readEnvLocal() {
  const file = resolve(ROOT, ".env.local");
  return existsSync(file) ? parseEnv(await readFile(file, "utf8")) : {};
}

/** Variables that always come from the dev stack, whatever .env.local says. */
export const FORCED_KEYS = ["CMS_BACKEND", "AUTH_ENABLED", "DATABASE_URL", "DATABASE_MIGRATION_URL", "AUTH_SECRET", "AUTH_BASE_URL"];

export async function nextEnv({ url, secrets, baseURL }) {
  const defaults = { DATABASE_POOL_MAX: "5", AUTH_DEV_OTP_CONSOLE: "1", DEMO_PURCHASES: "1" };
  const forced = { CMS_BACKEND: "postgres", AUTH_ENABLED: "1", DATABASE_URL: url, DATABASE_MIGRATION_URL: url, AUTH_SECRET: secrets.authSecret, AUTH_BASE_URL: baseURL };
  const local = await readEnvLocal();
  const env = { ...process.env, ...defaults, ...local, ...forced };
  delete env.NODE_ENV; // next dev sets development itself
  return env;
}
