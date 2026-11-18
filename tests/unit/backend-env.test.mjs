import assert from "node:assert/strict";
import test from "node:test";
import { parseServerEnv, readMigrationDatabaseUrl } from "../../src/server/config/env.ts";

const localUrl = "postgresql://local_user:local_secret@127.0.0.1:5432/grmn_test";

test("runtime configuration requires a database URL without echoing credentials", () => {
  assert.throws(() => parseServerEnv({}), { message: "Missing or invalid server configuration: DATABASE_URL" });
  const secret = "https://user:private_password@example.invalid/database";
  assert.throws(() => parseServerEnv({ DATABASE_URL: secret }), (error) => {
    assert.equal(error.message, "Missing or invalid server configuration: DATABASE_URL");
    assert.ok(!error.message.includes("private_password"));
    return true;
  });
});

test("runtime pools are bounded and reject invalid tuning values", () => {
  const config = parseServerEnv({ DATABASE_URL: localUrl });
  assert.equal(config.poolMax, 5);
  assert.equal(config.connectionTimeoutMs, 2000);
  assert.equal(config.statementTimeoutMs, 5000);
  for (const value of ["0", "-1", "1.5", "Infinity", "101", ""]) {
    assert.throws(() => parseServerEnv({ DATABASE_URL: localUrl, DATABASE_POOL_MAX: value }));
  }
  assert.equal(parseServerEnv({ DATABASE_URL: localUrl, DATABASE_POOL_MAX: "2" }).poolMax, 2);
});

test("migration access never falls back to runtime credentials", () => {
  assert.throws(() => readMigrationDatabaseUrl({ DATABASE_URL: localUrl }), {
    message: "Missing or invalid server configuration: DATABASE_MIGRATION_URL",
  });
  assert.equal(readMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: localUrl }), localUrl);
});

test("publicly prefixed database configuration is rejected", () => {
  assert.throws(() => parseServerEnv({ DATABASE_URL: localUrl, NEXT_PUBLIC_DATABASE_URL: localUrl }), {
    message: "Missing or invalid server configuration: NEXT_PUBLIC_DATABASE_URL",
  });
});

test("importing the database factory does not require credentials or open a connection", async () => {
  const { createDatabase } = await import("../../src/server/db/client.ts");
  assert.equal(typeof createDatabase, "function");
});

test("Task 21B: pool wait statistics are off by default and bounded when enabled", () => {
  assert.equal(parseServerEnv({ DATABASE_URL: localUrl }).poolStatsMs, 0);
  assert.equal(parseServerEnv({ DATABASE_URL: localUrl, DATABASE_POOL_STATS_MS: "5000" }).poolStatsMs, 5000);
  for (const value of ["-1", "1.5", "3600001", "x"]) assert.throws(() => parseServerEnv({ DATABASE_URL: localUrl, DATABASE_POOL_STATS_MS: value }));
});
