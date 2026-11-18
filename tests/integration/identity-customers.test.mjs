import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { authSchemaOptions } from "../../src/server/auth/schema-options.ts";
import { authTables } from "../../src/server/db/auth-tables.ts";

let temporary;
let handle;
let adapter;
const userId = randomUUID();

async function constraint(query, code) {
  await assert.rejects(handle.db.execute(query), (error) => {
    assert.equal(error.cause?.code ?? error.code, code);
    return true;
  });
}

before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "3" }));
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  adapter = drizzleAdapter(handle.db, { schema: authTables, provider: "pg", transaction: true })(authSchemaOptions);
  await handle.db.execute(sql`INSERT INTO users (id, name, email) VALUES (${userId}, 'Synthetic schema user', 'schema@example.invalid')`);
}, { timeout: 120000 });

after(async () => {
  try { await handle?.close(); } finally { await temporary?.stop(); }
}, { timeout: 45000 });

test("the versioned migration applies to empty PostgreSQL and replay makes no changes", async () => {
  const expectedCount = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries.length;
  const first = await handle.db.execute(sql`SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations`);
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  const second = await handle.db.execute(sql`SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations`);
  assert.equal(first.rows[0].count, expectedCount);
  assert.equal(second.rows[0].count, expectedCount);
});

test("normalized emails and verified canonical phone identities are unique", async () => {
  await constraint(sql`INSERT INTO users (id,name,email) VALUES (${randomUUID()},'Duplicate','schema@example.invalid')`, "23505");
  await constraint(sql`INSERT INTO users (id,name,email) VALUES (${randomUUID()},'Not normalized','SCHEMA@example.invalid')`, "23514");
  await handle.db.execute(sql`UPDATE users SET phone_number='+77000000000', phone_number_verified=true WHERE id=${userId}`);
  await constraint(sql`INSERT INTO users (id,name,email,phone_number,phone_number_verified) VALUES (${randomUUID()},'Duplicate phone','duplicate@example.invalid','+77000000000',true)`, "23505");
  await constraint(sql`INSERT INTO users (id,name,email,phone_number) VALUES (${randomUUID()},'Unproven phone','unproven@example.invalid','+77000000001')`, "23514");
  await constraint(sql`INSERT INTO users (id,name,email,phone_number_verified) VALUES (${randomUUID()},'Missing phone','missing@example.invalid',true)`, "23514");
  const phones = await handle.db.execute(sql`SELECT user_id FROM phone_identities WHERE phone_number='+77000000000'`);
  assert.equal(phones.rows[0].user_id, userId);
});

test("provisional customers need no auth user/email and matching entered phones do not merge them", async () => {
  const first = randomUUID(), second = randomUUID();
  await handle.db.execute(sql`INSERT INTO customer_profiles (id,name,entered_phone) VALUES (${first},'Қазақша / Русский / English','+77000000002'),(${second},'Another provisional contact','+77000000002')`);
  const profiles = await handle.db.execute(sql`SELECT user_id,email,profile_state FROM customer_profiles WHERE id IN (${first},${second})`);
  assert.equal(profiles.rows.length, 2);
  for (const row of profiles.rows) assert.deepEqual(row, { user_id: null, email: null, profile_state: "provisional" });
  await constraint(sql`UPDATE customer_profiles SET profile_state='complete' WHERE id=${first}`, "23514");
});

test("saved address uniqueness and owner FKs reject two primaries and orphan addresses", async () => {
  const fields = sql`(id,user_id,label,recipient_name,phone,country_code,city,line1,is_primary)`;
  await handle.db.execute(sql`INSERT INTO customer_addresses ${fields} VALUES (${randomUUID()},${userId},'Home','Synthetic recipient','+77000000000','KZ','Test city','Synthetic street',true)`);
  await constraint(sql`INSERT INTO customer_addresses ${fields} VALUES (${randomUUID()},${userId},'Other','Synthetic recipient','+77000000000','KZ','Test city','Synthetic street',true)`, "23505");
  await constraint(sql`INSERT INTO customer_addresses ${fields} VALUES (${randomUUID()},${randomUUID()},'Orphan','Synthetic recipient','+77000000000','KZ','Test city','Synthetic street',false)`, "23503");
  const racingUserId = randomUUID();
  await handle.db.execute(sql`INSERT INTO users (id,name,email) VALUES (${racingUserId},'Address race owner','address-race@example.invalid')`);
  const results = await Promise.allSettled([1, 2].map((position) => handle.db.execute(sql`INSERT INTO customer_addresses ${fields} VALUES (${randomUUID()},${racingUserId},${`Place ${position}`},'Synthetic recipient','+77000000000','KZ','Test city','Synthetic street',true)`)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const primaries = await handle.db.execute(sql`SELECT count(*)::integer AS count FROM customer_addresses WHERE user_id=${racingUserId} AND is_primary=true`);
  assert.equal(primaries.rows[0].count, 1);
});

test("the actual Better Auth adapter writes and reads UUID users, sessions, accounts, verification, MFA and rate counters", async () => {
  const user = await adapter.create({ model: "user", data: { name: "Adapter smoke user", email: "adapter@example.invalid", emailVerified: false } });
  assert.match(user.id, /^[0-9a-f-]{36}$/);
  const expiresAt = new Date(Date.now() + 60000);
  const session = await adapter.create({ model: "session", data: { userId: user.id, token: randomBytes(24).toString("hex"), expiresAt } });
  assert.equal(session.userId, user.id);
  const account = await adapter.create({ model: "account", data: { userId: user.id, providerId: "synthetic", accountId: "fixture-account" } });
  assert.equal(account.userId, user.id);
  const verification = await adapter.create({ model: "verification", data: { identifier: "synthetic-challenge", value: "synthetic-hash", expiresAt } });
  assert.equal(verification.identifier, "synthetic-challenge");
  const mfa = await adapter.create({ model: "twoFactor", data: { userId: user.id, secret: "synthetic-encrypted-secret", backupCodes: "synthetic-encrypted-backup" } });
  assert.equal(mfa.userId, user.id);
  const limit = await adapter.create({ model: "rateLimit", data: { key: "synthetic-limit", count: 1, lastRequest: Date.now() } });
  assert.equal(limit.count, 1);
  const found = await adapter.findOne({ model: "user", where: [{ field: "id", value: user.id }] });
  assert.equal(found.email, "adapter@example.invalid");
});

test("completed customer history blocks physical auth-user deletion and consent is append-only", async () => {
  const profileId = randomUUID(), consentId = randomUUID(), retainedUserId = randomUUID();
  await handle.db.execute(sql`INSERT INTO users (id,name,email,phone_number,phone_number_verified) VALUES (${retainedUserId},'History owner','retained@example.invalid','+77000000004',true)`);
  await handle.db.execute(sql`INSERT INTO customer_profiles (id,user_id,name,email,entered_phone,normalized_phone,profile_state) VALUES (${profileId},${retainedUserId},'Retained contact','retained@example.invalid','+77000000004','+77000000004','complete')`);
  // PostgreSQL 18 reports RESTRICT as restrict_violation, distinct from an orphan FK insert.
  await constraint(sql`DELETE FROM users WHERE id=${retainedUserId}`, "23001");
  await constraint(sql`INSERT INTO customer_profiles (id,user_id,name,entered_phone) VALUES (${randomUUID()},${retainedUserId},'Second link','+77000000004')`, "23505");
  await handle.db.execute(sql`INSERT INTO consent_events (id,profile_id,purpose,channel,action,policy_version,source) VALUES (${consentId},${profileId},'newsletter','email','granted','synthetic-v1','integration fixture')`);
  await constraint(sql`UPDATE consent_events SET action='withdrawn' WHERE id=${consentId}`, "23514");
  await constraint(sql`DELETE FROM consent_events WHERE id=${consentId}`, "23514");
  await handle.db.execute(sql`INSERT INTO consent_events (id,profile_id,purpose,channel,action,policy_version,source) VALUES (${randomUUID()},${profileId},'newsletter','email','withdrawn','synthetic-v1','integration fixture')`);
});

test("role memberships and permissions have unique pairs and valid foreign keys", async () => {
  const roleId = randomUUID(), permissionId = randomUUID();
  await handle.db.execute(sql`INSERT INTO roles (id,code) VALUES (${roleId},'support')`);
  await handle.db.execute(sql`INSERT INTO permissions (id,code) VALUES (${permissionId},'orders:read')`);
  await handle.db.execute(sql`INSERT INTO user_roles (user_id,role_id) VALUES (${userId},${roleId})`);
  await handle.db.execute(sql`INSERT INTO role_permissions (role_id,permission_id) VALUES (${roleId},${permissionId})`);
  await constraint(sql`INSERT INTO user_roles (user_id,role_id) VALUES (${userId},${roleId})`, "23505");
  await constraint(sql`INSERT INTO role_permissions (role_id,permission_id) VALUES (${roleId},${permissionId})`, "23505");
  await constraint(sql`INSERT INTO user_roles (user_id,role_id) VALUES (${randomUUID()},${roleId})`, "23503");
});

test("profile-completion capabilities are hashed, expiring and restricted in scope", async () => {
  const future = new Date(Date.now() + 60000), verified = new Date();
  await handle.db.execute(sql`INSERT INTO customer_completion_sessions (id,phone_number,token_hash,phone_verified_at,expires_at) VALUES (${randomUUID()},'+77000000003',${randomBytes(32).toString("hex")},${verified},${future})`);
  await constraint(sql`INSERT INTO customer_completion_sessions (id,phone_number,token_hash,phone_verified_at,expires_at) VALUES (${randomUUID()},'+77000000003','plaintext-token',${verified},${future})`, "23514");
  await constraint(sql`INSERT INTO customer_completion_sessions (id,phone_number,token_hash,purpose,phone_verified_at,expires_at) VALUES (${randomUUID()},'+77000000003',${randomBytes(32).toString("hex")},'full_account_access',${verified},${future})`, "23514");
});

test("a DML runtime role can query but cannot alter or truncate the schema", async () => {
  const client = await handle.pool.connect();
  try {
    await client.query("CREATE ROLE task03a_runtime NOLOGIN");
    await client.query("GRANT USAGE ON SCHEMA public TO task03a_runtime");
    await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO task03a_runtime");
    await client.query("SET ROLE task03a_runtime");
    const result = await client.query("SELECT count(*)::integer AS count FROM users");
    assert.ok(result.rows[0].count > 0);
    await assert.rejects(client.query("ALTER TABLE users ADD COLUMN forbidden text"), { code: "42501" });
    await assert.rejects(client.query("TRUNCATE users CASCADE"), { code: "42501" });
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
});
