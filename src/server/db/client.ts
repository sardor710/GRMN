import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { parseServerEnv } from "../config/env.ts";
import type { ServerConfig } from "../config/env.ts";

export function createDatabase(config: ServerConfig) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    query_timeout: config.statementTimeoutMs,
    idle_in_transaction_session_timeout: config.statementTimeoutMs,
    application_name: "grmn-backend",
  });
  // Never forward driver errors/connection strings to logs or HTTP responses.
  pool.on("error", () => console.error("Database pool connection failed"));
  const stopStats = config.poolStatsMs > 0 ? samplePoolWait(pool, config.poolStatsMs) : () => {};
  return { db: drizzle(pool), pool, close: () => { stopStats(); return pool.end(); } };
}

/**
 * Task 21B: opt-in pool wait measurement (DATABASE_POOL_STATS_MS). Every acquisition, including the
 * implicit one inside pool.query, is timed from request to checkout; each interval logs one JSON line
 * with the counts, wait percentiles and pool occupancy. Nothing but numbers is logged.
 */
function samplePoolWait(pool: Pool, intervalMs: number): () => void {
  let waits: number[] = [], failures = 0, peakWaiting = 0;
  const connect = pool.connect.bind(pool) as (callback?: (error: Error | undefined, client: unknown, release: unknown) => void) => unknown;
  (pool as unknown as { connect: typeof connect }).connect = (callback?: (error: Error | undefined, client: unknown, release: unknown) => void) => {
    const started = performance.now();
    peakWaiting = Math.max(peakWaiting, pool.waitingCount + 1);
    const done = (error: Error | undefined) => { if (error) failures++; else waits.push(performance.now() - started); };
    if (callback) return connect((error, client, release) => { done(error); callback(error, client, release); });
    return (connect() as Promise<unknown>).then(client => { done(undefined); return client; }, error => { done(error as Error); throw error; });
  };
  const timer = setInterval(() => {
    const sorted = waits.sort((a, b) => a - b), at = (q: number) => sorted.length ? Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(2)) : 0;
    console.log(JSON.stringify({ poolStats: { at: new Date().toISOString(), acquisitions: sorted.length, failures, waitP50Ms: at(0.5), waitP95Ms: at(0.95), waitP99Ms: at(0.99), waitMaxMs: at(1),
      total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, peakWaiting } }));
    waits = []; failures = 0; peakWaiting = pool.waitingCount;
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;
export type Database = DatabaseHandle["db"];

let handle: DatabaseHandle | undefined;

export function getDatabase(): DatabaseHandle {
  handle ??= createDatabase(parseServerEnv(process.env));
  return handle;
}

export async function closeDatabase(): Promise<void> {
  const current = handle;
  handle = undefined;
  await current?.close();
}
