import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { sql } from "drizzle-orm";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { createDatabase } from "../../src/server/db/client.ts";
import { withTransaction } from "../../src/server/db/transaction.ts";

let temporary;
let database;

before(async () => {
  temporary = await startTemporaryPostgres();
  database = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "2" }));
  await database.db.execute(sql`CREATE TABLE task02_probe (id integer PRIMARY KEY, label text NOT NULL, amount bigint NOT NULL)`);
}, { timeout: 120000 });

after(async () => {
  try {
    await database?.close();
  } finally {
    await temporary?.stop();
  }
}, { timeout: 20000 });

test("a failed transaction rolls back every write and the connection remains usable", async () => {
  await assert.rejects(withTransaction(database.db, async (transaction) => {
    await transaction.execute(sql`INSERT INTO task02_probe VALUES (1, 'synthetic rollback row', 100)`);
    throw new Error("intentional rollback");
  }), /intentional rollback/);
  const result = await database.db.execute(sql`SELECT count(*)::integer AS count FROM task02_probe`);
  assert.equal(result.rows[0].count, 0);
  assert.equal(database.pool.waitingCount, 0);
});

test("committed bigint amounts and Kazakh/Russian/English text round-trip without precision loss", async () => {
  await withTransaction(database.db, async (transaction) => {
    await transaction.execute(sql`INSERT INTO task02_probe VALUES (2, ${"Қазақша / Русский / English"}, ${"9007199254740993"})`);
  });
  const result = await database.db.execute(sql`SELECT label, amount FROM task02_probe WHERE id = 2`);
  assert.equal(result.rows[0].label, "Қазақша / Русский / English");
  assert.equal(result.rows[0].amount, "9007199254740993");
});

test("server modules load in a plain Node worker with the documented condition", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--conditions=react-server", "--input-type=module", "-e",
    'const { createDatabase } = await import("./src/server/db/client.ts"); console.log(typeof createDatabase);',
  ], { windowsHide: true });
  assert.equal(stdout.trim(), "function");
});

test("the default browser/Node import condition rejects database module access", async () => {
  await assert.rejects(promisify(execFile)(process.execPath, [
    "--input-type=module", "-e", 'await import("./src/server/db/client.ts");',
  ], { windowsHide: true }), (error) => {
    assert.match(error.stderr, /cannot be imported from a Client Component module/);
    return true;
  });
});
