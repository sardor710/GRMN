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
  return { db: drizzle(pool), pool, close: () => pool.end() };
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
