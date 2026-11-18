import "server-only";

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export interface ServerConfig {
  databaseUrl: string;
  poolMax: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  idleTimeoutMs: number;
  /** Task 21B: when > 0, log pool acquisition-wait statistics every this many ms (0 = off). */
  poolStatsMs: number;
  /** Task 21B follow-up: concurrent catalog listings per process (default half the pool, at least 1). */
  listingConcurrency: number;
  /** How long a listing waits for a slot before 503 CATALOG_BUSY. */
  listingWaitMs: number;
}

function invalid(field: string): never {
  throw new Error(`Missing or invalid server configuration: ${field}`);
}

function databaseUrl(source: EnvironmentSource, field: string): string {
  const value = source[field];
  if (!value) return invalid(field);
  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
      return invalid(field);
    }
  } catch {
    return invalid(field);
  }
  return value;
}

function integer(source: EnvironmentSource, field: string, fallback: number, min: number, max: number): number {
  const raw = source[field];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) return invalid(field);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) return invalid(field);
  return value;
}

export function parseServerEnv(source: EnvironmentSource): ServerConfig {
  for (const field of ["NEXT_PUBLIC_DATABASE_URL", "NEXT_PUBLIC_DATABASE_MIGRATION_URL"]) {
    if (source[field] !== undefined) return invalid(field);
  }
  const poolMax = integer(source, "DATABASE_POOL_MAX", 5, 1, 100);
  return {
    databaseUrl: databaseUrl(source, "DATABASE_URL"),
    poolMax,
    connectionTimeoutMs: integer(source, "DATABASE_CONNECT_TIMEOUT_MS", 2000, 100, 30000),
    statementTimeoutMs: integer(source, "DATABASE_STATEMENT_TIMEOUT_MS", 5000, 100, 60000),
    idleTimeoutMs: integer(source, "DATABASE_IDLE_TIMEOUT_MS", 10000, 100, 300000),
    poolStatsMs: integer(source, "DATABASE_POOL_STATS_MS", 0, 0, 3600000),
    listingConcurrency: integer(source, "CATALOG_LISTING_CONCURRENCY", Math.max(1, Math.floor(poolMax / 2)), 1, 100),
    listingWaitMs: integer(source, "CATALOG_LISTING_WAIT_MS", 2000, 1, 30000),
  };
}

export function readMigrationDatabaseUrl(source: EnvironmentSource): string {
  return databaseUrl(source, "DATABASE_MIGRATION_URL");
}
