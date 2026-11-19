// Task 24: the owner asked for the 4 launch staff accounts. Admin staff creation is closed in the UI,
// and auth:bootstrap creates only one super_admin, so ops:staff-setup creates the initial staff in one
// transaction, each with a generated password and exactly one role. MFA is enrolled by each person
// at first sign-in (/admin/login). Breaks caught: weak or reused passwords, a second run adding
// staff, a role outside the catalog, missing permissions, and a partial set after a failure.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { verifyPassword } from "better-auth/crypto";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

let temporary, handle;
const setup = () => import("../../scripts/ops/staff-setup.ts");
const q = (sql, values = []) => handle.pool.query(sql, values);
const config = { emailDomain: "store.example", accounts: [
  { role: "super_admin", name: "Store administrator", login: "admin" },
  { role: "owner", name: "Store owner", login: "owner" },
  { role: "product_manager", name: "Product manager", login: "products" },
  { role: "support", name: "Customer support", login: "support" },
] };
before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "2" }));
  await migrate(handle.db, { migrationsFolder: "drizzle" });
}, { timeout: 120000 });
after(async () => { try { await handle?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

test("invalid staff configuration is refused before anything is written", async () => {
  const { setupStaff } = await setup();
  const bad = [
    { ...config, accounts: config.accounts.slice(1) },                                         // no super_admin
    { ...config, accounts: [...config.accounts, { role: "super_admin", name: "Two", login: "two" }] }, // two super_admins
    { ...config, accounts: [...config.accounts, { role: "root", name: "X", login: "x" }] },
    { ...config, accounts: [...config.accounts, { role: "support", name: "Dup", login: "support" }] },
    { ...config, emailDomain: "not a domain" }, { ...config, extra: 1 },
  ];
  for (const input of bad) await assert.rejects(setupStaff(handle, input), /Invalid staff configuration/);
  assert.equal((await q("SELECT count(*)::int AS n FROM users")).rows[0].n, 0);
});

test("creates the four accounts once, with their roles, unique strong passwords and an audit trail", async () => {
  const { setupStaff } = await setup();
  const result = await setupStaff(handle, config);
  assert.deepEqual(result.accounts.map(a => [a.role, a.email]), [["super_admin", "admin@store.example"], ["owner", "owner@store.example"], ["product_manager", "products@store.example"], ["support", "support@store.example"]]);
  assert.equal(new Set(result.accounts.map(a => a.password)).size, 4);
  for (const account of result.accounts) {
    assert.match(account.password, /^[A-Za-z0-9_-]{24,}$/);
    const row = (await q("SELECT u.email,a.password,ARRAY(SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=u.id) AS roles FROM users u JOIN auth_accounts a ON a.user_id=u.id AND a.provider_id='credential' WHERE u.id=$1", [account.userId])).rows[0];
    assert.equal(row.email, account.email); assert.deepEqual(row.roles, [account.role]);
    assert.equal(await verifyPassword({ hash: row.password, password: account.password }), true);
  }
  const perms = async role => (await q("SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code=$1 ORDER BY 1", [role])).rows.map(r => r.code);
  assert.ok((await perms("owner")).includes("payments:confirm"));
  assert.deepEqual(await perms("support"), ["customers:read", "orders:read"]);
  assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action='staff.bootstrapped'")).rows[0].n, 4);
  await assert.rejects(setupStaff(handle, config), /Staff already exist/);
  assert.equal((await q("SELECT count(*)::int AS n FROM users")).rows[0].n, 4);
});
