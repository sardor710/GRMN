// npm run dev:db -- start|stop|status|url
// Persistent development PostgreSQL under storage/devdb/ (see scripts/dev/lib.mjs). `start` initializes
// the cluster on first use, starts it in the background (it keeps running until `stop`), creates the
// database and applies migrations. `stop` is a fast, clean pg_ctl shutdown. The data is never deleted.
import { clusterStatus, databaseUrl, DATA_DIR, DEV_DIR, log, migrateDatabase, readSecrets, startCluster, stopCluster } from "./lib.mjs";

const command = process.argv[2] ?? "status";
try {
  if (command === "start") {
    const started = await startCluster();
    const migration = await migrateDatabase(databaseUrl(started.secrets, started.port));
    log(`${started.startedNow ? "started" : "already running"} on 127.0.0.1:${started.port}; migrations ${migration.after} applied (${migration.after - migration.before} new)`);
    log("it keeps running in the background; stop it with: npm run dev:db -- stop");
  } else if (command === "stop") {
    log((await stopCluster()) ? "stopped" : "not running");
  } else if (command === "status") {
    const status = await clusterStatus();
    log(`data: ${DATA_DIR}`);
    log(status.initialized ? (status.running ? `running on 127.0.0.1:${status.port}` : "stopped") : `not initialized yet (npm run dev:db -- start creates ${DEV_DIR})`);
  } else if (command === "url") {
    // Prints the local connection string (contains the dev password) for psql/drizzle-kit use.
    const status = await clusterStatus(), secrets = await readSecrets();
    if (!status.running || !secrets) throw new Error("The dev database is not running");
    process.stdout.write(`${databaseUrl(secrets, status.port)}\n`);
  } else throw new Error("Usage: npm run dev:db -- start|stop|status|url");
} catch (error) {
  process.stderr.write(`[dev] ${error instanceof Error ? error.message : "dev:db failed"}\n`);
  process.exitCode = 1;
}
