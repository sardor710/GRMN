import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const execute = promisify(execFile);

export async function startTemporaryPostgres({ runCommand = execute } = {}) {
  const root = resolve("temp");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, "grmn-test-postgres-"));
  if (!directory.startsWith(root + sep)) throw new Error("Invalid temporary database directory");
  const platform = { win32: "windows", linux: "linux", darwin: "darwin" }[process.platform];
  if (!platform) throw new Error("Unsupported test database platform");
  const { initdb, pg_ctl: pgCtl } = await import(`@embedded-postgres/${platform}-${process.arch}`);
  const reservation = createServer();
  await new Promise((accept, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", accept);
  });
  const { port } = reservation.address();
  await new Promise((accept, reject) => reservation.close((error) => error ? reject(error) : accept()));
  const password = randomBytes(24).toString("hex");
  const dataDirectory = resolve(directory, "data");
  const passwordFile = resolve(directory, "password.local");
  await writeFile(passwordFile, password, { mode: 0o600 });
  let startupAttempted = false;
  let cleaned = false;
  async function isRunning() {
    try {
      await runCommand(pgCtl, ["-D", dataDirectory, "status"], { windowsHide: true, timeout: 5000 });
      return true;
    } catch (error) {
      if (error.code === 3) return false;
      // Unknown status must retain files: a readiness timeout does not prove
      // that PostgreSQL failed to start in the background.
      throw new Error("Cannot confirm temporary PostgreSQL status; files retained", { cause: error });
    }
  }
  async function stop() {
    if (cleaned) return;
    if (startupAttempted) {
      // pg_ctl shuts down gracefully; the wrapper's Windows taskkill path can
      // leave inherited stdio handles open and prevent node:test from exiting.
      if (await isRunning()) {
        await runCommand(pgCtl, ["-D", dataDirectory, "-m", "fast", "-w", "-t", "30", "stop"], { windowsHide: true, timeout: 35000 });
      }
      if (await isRunning()) throw new Error("Temporary PostgreSQL is still running; files retained");
    }
    // Only this call's mkdtemp directory under this workspace is removed.
    if (!directory.startsWith(root + sep)) throw new Error("Invalid cleanup target");
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    cleaned = true;
  }
  try {
    await runCommand(initdb, ["-D", dataDirectory, "-U", "grmn_test_admin", "--pwfile", passwordFile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"], { windowsHide: true, timeout: 60000 });
    await rm(passwordFile);
    startupAttempted = true;
    await runCommand(pgCtl, ["-D", dataDirectory, "-l", resolve(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -c lc_messages=C`, "-w", "-t", "30", "start"], { windowsHide: true, timeout: 35000 });
    const admin = new Client({ host: "127.0.0.1", port, user: "grmn_test_admin", password, database: "postgres", connectionTimeoutMillis: 10000, query_timeout: 30000 });
    try {
      await admin.connect();
      await admin.query('CREATE DATABASE "grmn_test"');
    } finally {
      await admin.end();
    }
    return { url: `postgresql://grmn_test_admin:${password}@127.0.0.1:${port}/grmn_test`, stop };
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Temporary PostgreSQL setup failed; files retained for safe cleanup");
    }
    throw error;
  }
}
