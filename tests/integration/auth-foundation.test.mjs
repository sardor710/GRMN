import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { parseAuthConfig } from "../../src/server/auth/config.ts";
import { createAuthFoundation } from "../../src/server/auth/http.ts";
import { bootstrapFirstStaff } from "../../src/server/auth/bootstrap.ts";
import { authDigest, createPhoneService, consumeAuthBudget } from "../../src/server/auth/phone-service.ts";
import { onRequestRateLimit } from "../../node_modules/better-auth/dist/api/rate-limiter/index.mjs";
import { getSessionIdentity, requirePermission, revokeUserSessions } from "../../src/server/auth/principal.ts";

let temporary, database, secondDatabase, foundation, second, staffId, staffJar, oldStaffJar, backupCodes, totpSecret;
const config = parseAuthConfig({ AUTH_ENABLED: "1", AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_BASE_URL: "http://localhost:3000", NODE_ENV: "test" });
const staffPassword = randomBytes(24).toString("base64url"), deliveries = new Map();
const sender = async ({ phoneNumber, code }) => { deliveries.set(phoneNumber, code); };
const cookies = jar => new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });
async function request(path, body, jar = new Map(), runtime = foundation, extra = {}) {
  const headers = cookies(jar); headers.set("origin", config.baseURL); headers.set("content-type", "application/json");
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  const response = await runtime.handleRequest(new Request(config.baseURL+"/api/auth"+path, { method: body===undefined ? "GET" : "POST", headers, body: body===undefined ? undefined : JSON.stringify(body) }));
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], i = pair.indexOf("="), name = pair.slice(0, i), value = pair.slice(i+1);
    if (!value || /Max-Age=0/i.test(cookie)) jar.delete(name); else jar.set(name, value);
  }
  return { response, body: await response.json(), jar };
}
function decodeBase32(value) {
  let bits = 0, buffer = 0; const result = [];
  for (const character of value.toUpperCase().replace(/=+$/, "")) {
    buffer = (buffer<<5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(character); bits += 5;
    if (bits>=8) { bits -= 8; result.push((buffer>>bits)&255); }
  }
  return new Uint8Array(result);
}
before(async () => {
  temporary = await startTemporaryPostgres();
  database = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "5" }));
  await migrate(database.db, { migrationsFolder: "drizzle" });
  secondDatabase = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "5" }));
  foundation = createAuthFoundation({ database, config, phoneSender: sender });
  second = createAuthFoundation({ database: secondDatabase, config, phoneSender: sender });
}, { timeout: 120000 });
after(async () => { try { await secondDatabase?.close(); await database?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });
test("auth runtime can persist atomic phone challenges and per-session staff MFA admission", async () => {
  const result = await database.pool.query("SELECT to_regclass('phone_challenges') AS challenge,to_regclass('staff_session_grants') AS admission");
  assert.deepEqual(result.rows[0], { challenge: "phone_challenges", admission: "staff_session_grants" });
});

test("first staff bootstrap is atomic, hashes credentials and never uses source passwords", async () => {
  const input = { name: "Synthetic operator", email: "operator@example.invalid", password: staffPassword };
  const results = await Promise.allSettled([bootstrapFirstStaff(database, input), bootstrapFirstStaff(secondDatabase, input)]);
  assert.equal(results.filter(r => r.status==="fulfilled").length, 1);
  assert.equal(results.find(r => r.status==="rejected").reason.status, 409);
  staffId = results.find(r => r.status==="fulfilled").value.userId;
  const row = (await database.pool.query("SELECT password FROM auth_accounts WHERE user_id=$1", [staffId])).rows[0];
  assert.notEqual(row.password, staffPassword);
  assert.equal(await verifyPassword({ hash: row.password, password: staffPassword }), true);
});

test("legacy forged cookies, public signup, hostile origins and extra fields are rejected", async () => {
  const forged = new Map([["garmin_admin_session", Buffer.from(JSON.stringify({ id: staffId, email: "operator@example.invalid", role: "super_admin" })).toString("base64")]]);
  assert.equal((await request("/get-session", undefined, forged)).body.user, null);
  assert.equal((await request("/sign-up/email", { name: "Injected", email: "bad@example.invalid", password: staffPassword })).response.status, 404);
  assert.equal((await request("/sign-in/email", { email: "operator@example.invalid", password: staffPassword }, new Map(), foundation, { origin: "https://evil.invalid" })).response.status, 403);
  assert.equal((await request("/sign-in/email", { email: "operator@example.invalid", password: staffPassword, role: "super_admin" })).response.status, 400);
});

test("staff password sessions require per-session MFA, including older sessions after enrollment", async () => {
  staffJar = new Map(); oldStaffJar = new Map();
  for (const jar of [staffJar, oldStaffJar]) {
    const login = await request("/sign-in/email", { email: "operator@example.invalid", password: staffPassword }, jar);
    assert.equal(login.response.status, 200, JSON.stringify(login.body));
    assert.equal("token" in login.body, false);
    assert.ok(login.response.headers.getSetCookie().some(c => c.includes("HttpOnly") && /SameSite=Lax/i.test(c)));
    await assert.rejects(requirePermission(foundation, cookies(jar), "staff:manage"), e => e.status===403);
  }
  const enrollment = await request("/two-factor/enable", { password: staffPassword }, staffJar);
  assert.equal(enrollment.response.status, 200, JSON.stringify(enrollment.body));
  backupCodes = enrollment.body.backupCodes;
  const secret = new URL(enrollment.body.totpURI).searchParams.get("secret");
  totpSecret = secret;
  const code = await createOTP(decodeBase32(secret)).totp();
  const verified = await request("/two-factor/verify-totp", { code }, staffJar);
  assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
  assert.equal((await requirePermission(foundation, cookies(staffJar), "staff:manage")).userId, staffId);
  await assert.rejects(requirePermission(foundation, cookies(oldStaffJar), "staff:manage"), e => e.status===403 || e.status===401);
  const stored = (await database.pool.query("SELECT secret,backup_codes FROM auth_two_factors WHERE user_id=$1", [staffId])).rows[0];
  assert.equal(stored.secret.includes(secret), false);
  assert.equal(stored.backup_codes.includes(backupCodes[0]), false);
});

test("MFA login has no full session before proof and backup codes cannot be reused", async () => {
  const jar = new Map();
  const login = await request("/sign-in/email", { email: "operator@example.invalid", password: staffPassword }, jar);
  assert.equal(login.response.status, 200);
  assert.equal(login.body.mfaRequired, true);
  assert.equal((await request("/get-session", undefined, jar)).body.user, null);
  assert.equal((await request("/two-factor/verify-backup-code", { code: backupCodes[0] }, jar)).response.status, 200);
  assert.equal((await requirePermission(foundation, cookies(jar), "orders:read")).userId, staffId);
  const replay = new Map();
  await request("/sign-in/email", { email: "operator@example.invalid", password: staffPassword }, replay);
  assert.notEqual((await request("/two-factor/verify-backup-code", { code: backupCodes[0] }, replay)).response.status, 200);
});

test("phone challenges are hashed, attempt-limited and consumed once across instances", async () => {
  const service = createPhoneService({ database, secret: config.secret, send: sender });
  const other = createPhoneService({ database: secondDatabase, secret: config.secret, send: sender });
  const phone = "+77000000001", sent = await service.request(phone), code = deliveries.get(phone);
  assert.equal((await database.pool.query("SELECT code_hash FROM phone_challenges WHERE id=$1", [sent.challengeId])).rows[0].code_hash.includes(code), false);
  const results = await Promise.allSettled([service.consume(sent.challengeId, phone, code), other.consume(sent.challengeId, phone, code)]);
  assert.equal(results.filter(r => r.status==="fulfilled").length, 1);
  const wrong = await service.request("+77000000002"), valid = deliveries.get("+77000000002"), bad = valid==="000000" ? "111111" : "000000";
  for (let i=0;i<5;i++) await assert.rejects(service.consume(wrong.challengeId, "+77000000002", bad), e => e.status===401);
  await assert.rejects(service.consume(wrong.challengeId, "+77000000002", valid), e => e.status===401);
  await assert.rejects(service.issueCompletion({ phoneNumber: phone, challengeId: sent.challengeId }), e => e.status===401);
});

test("expired or undelivered OTPs fail and shared rate budgets have one final winner", async () => {
  const short = createPhoneService({ database, secret: config.secret, send: sender, ttlMs: 100 });
  const sent = await short.request("+77000000003"); await delay(150);
  await assert.rejects(short.consume(sent.challengeId, "+77000000003", deliveries.get("+77000000003")), e => e.status===401);
  const unavailable = createPhoneService({ database, secret: config.secret });
  await assert.rejects(unavailable.request("+77000000004"), e => e.status===503);
  let failedCode;
  const failing = createPhoneService({ database, secret: config.secret, send: async ({ code }) => { failedCode = code; throw new Error("synthetic delivery failure"); } });
  await assert.rejects(failing.request("+77000000008"), e => e.status===503);
  const failed = (await database.pool.query("SELECT id,consumed_at FROM phone_challenges WHERE phone_number='+77000000008'")).rows[0];
  assert.ok(failed.consumed_at);
  await assert.rejects(failing.consume(failed.id, "+77000000008", failedCode), e => e.status===401);
  const outcomes = await Promise.allSettled([database, secondDatabase].map(db => consumeAuthBudget(db, config.secret, "synthetic-last-budget", "same-subject", 1, 600)));
  assert.equal(outcomes.filter(o => o.status==="fulfilled").length, 1);
  assert.equal(outcomes.find(o => o.status==="rejected").reason.status, 429);
});

test("concurrent verified completions retain one canonical phone identity without old-profile claims", async () => {
  const phone = "+77000000009", service = createPhoneService({ database, secret: config.secret, send: sender });
  const tokens = [];
  for (let i=0;i<2;i++) {
    const sent = await service.request(phone);
    tokens.push(await service.issueCompletion(await service.consume(sent.challengeId, phone, deliveries.get(phone))));
  }
  const results = await Promise.allSettled(tokens.map((token, i) => service.complete(token, { name: "Synthetic concurrent customer", phoneNumber: phone, email: `concurrent${i}@example.invalid` })));
  assert.equal(results.filter(r => r.status==="fulfilled").length, 1);
  assert.equal(results.find(r => r.status==="rejected").reason.status, 409);
  assert.equal(Number((await database.pool.query("SELECT count(*) FROM users WHERE phone_number=$1", [phone])).rows[0].count), 1);
  assert.equal(Number((await database.pool.query("SELECT count(*) FROM customer_profiles WHERE normalized_phone=$1 AND user_id IS NOT NULL", [phone])).rows[0].count), 1);
});

test("phone proof completes without fake email, linking old profiles or exposing an existing account", async () => {
  const phone = "+77000000005", old = randomUUID(), jar = new Map();
  await database.pool.query("INSERT INTO customer_profiles(id,name,entered_phone) VALUES($1,'Original provisional',$2)", [old, phone]);
  const sent = await request("/grmn/phone/send", { phoneNumber: phone }, jar);
  assert.equal(sent.response.status, 200, JSON.stringify(sent.body));
  const verified = await request("/grmn/phone/verify", { phoneNumber: phone, challengeId: sent.body.challengeId, code: deliveries.get(phone) }, jar);
  assert.equal(verified.body.state, "complete_profile", JSON.stringify(verified.body));
  assert.equal((await request("/get-session", undefined, jar)).body.user, null);
  const completed = await request("/grmn/phone/complete", { name: "Synthetic customer", email: "customer@example.invalid", phoneNumber: phone }, jar);
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body));
  const identity = await getSessionIdentity(foundation, cookies(jar));
  assert.ok(identity?.id);
  assert.equal((await database.pool.query("SELECT user_id FROM customer_profiles WHERE id=$1", [old])).rows[0].user_id, null);
  const user = (await database.pool.query("SELECT email,email_verified,phone_number_verified FROM users WHERE id=$1", [identity.id])).rows[0];
  assert.deepEqual(user, { email: "customer@example.invalid", email_verified: false, phone_number_verified: true });
  const guessed = await request("/grmn/phone/complete", { name: "Guessed", email: "customer@example.invalid", phoneNumber: phone });
  assert.equal(guessed.response.status, 401);
});

test("session revocation and account suspension take effect without a cookie-cache window", async () => {
  const customer = (await database.pool.query("SELECT id FROM users WHERE email='customer@example.invalid'")).rows[0].id;
  const phone = "+77000000005", jar = new Map(), sent = await request("/grmn/phone/send", { phoneNumber: phone }, jar);
  await request("/grmn/phone/verify", { phoneNumber: phone, challengeId: sent.body.challengeId, code: deliveries.get(phone) }, jar);
  assert.equal((await getSessionIdentity(second, cookies(jar))).id, customer);
  await revokeUserSessions(foundation, cookies(staffJar), customer);
  assert.equal(await getSessionIdentity(second, cookies(jar)), null);
  await database.pool.query("UPDATE users SET status='suspended' WHERE id=$1", [staffId]);
  assert.equal(await getSessionIdentity(second, cookies(staffJar)), null);
});

test("editor and support permissions are enforced from current database roles", async () => {
  await database.pool.query("UPDATE users SET status='active' WHERE id=$1", [staffId]);
  try {
    for (const [role, allowed, denied] of [["editor", "content:write", "staff:manage"], ["support", "orders:read", "payments:refund"]]) {
      await database.pool.query("DELETE FROM user_roles WHERE user_id=$1", [staffId]);
      await database.pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2", [staffId, role]);
      assert.equal((await requirePermission(second, cookies(staffJar), allowed)).userId, staffId);
      await assert.rejects(requirePermission(second, cookies(staffJar), denied), e => e.status===403);
    }
  } finally {
    await database.pool.query("DELETE FROM user_roles WHERE user_id=$1", [staffId]);
    await database.pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin'", [staffId]);
  }
});

test("unknown and incorrect staff credentials use the same failure and password work", async () => {
  await database.pool.query("UPDATE users SET status='active' WHERE id=$1", [staffId]);
  const context = await foundation.auth.$context, original = context.password.hash;
  let hashes = 0;
  context.password.hash = async value => { hashes++; return original(value); };
  try {
    const unknown = await request("/sign-in/email", { email: "absent@example.invalid", password: staffPassword });
    const wrong = await request("/sign-in/email", { email: "operator@example.invalid", password: staffPassword+"wrong" });
    assert.deepEqual(unknown.body, wrong.body);
    assert.equal(unknown.response.status, 401);
    assert.ok(hashes>0, "missing account still performs a dummy password hash");
  } finally { context.password.hash = original; }
});
test("auth input is bounded while streaming rather than after buffering", async () => {
  let reads = 0;
  const stream = new ReadableStream({ pull(controller) { reads++; if (reads===1) controller.enqueue(new TextEncoder().encode("x".repeat(4097))); else controller.error(new Error("unexpected extra read")); } }, { highWaterMark: 0 });
  const response = await foundation.handleRequest(new Request(config.baseURL+"/api/auth/grmn/phone/send", { method: "POST", headers: { origin: config.baseURL, "content-type": "application/json" }, body: stream, duplex: "half" }));
  assert.equal(response.status, 413);
  assert.equal(reads, 1);
});
test("role grants cannot turn a customer snapshot into staff permissions without MFA", async () => {
  const jar = new Map(), phone = "+77000000006", sent = await request("/grmn/phone/send", { phoneNumber: phone }, jar);
  await request("/grmn/phone/verify", { phoneNumber: phone, challengeId: sent.body.challengeId, code: deliveries.get(phone) }, jar);
  await request("/grmn/phone/complete", { name: "Race customer", email: "race@example.invalid", phoneNumber: phone }, jar);
  const userId = (await getSessionIdentity(foundation, cookies(jar))).id;
  const original = database.pool.query;
  let injected = false;
  database.pool.query = async function (...args) {
    const result = await original.apply(this, args);
    if (!injected && typeof args[0]==="string" && args[0].startsWith("SELECT u.id,u.name") && result.rows[0]?.id===userId) {
      injected = true;
      await secondDatabase.pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin'", [userId]);
    }
    return result;
  };
  try { await assert.rejects(requirePermission(foundation, cookies(jar), "catalog:write"), e => e.status===403); assert.equal(injected, true); }
  finally { database.pool.query = original; await database.pool.query("DELETE FROM user_roles WHERE user_id=$1", [userId]); }
});
test("parallel guesses count failures before a sixth code is checked", async () => {
  const service = createPhoneService({ database, secret: config.secret, send: sender }), phone = "+77000000007", sent = await service.request(phone), code = deliveries.get(phone);
  const correctHash = authDigest(config.secret, `${sent.challengeId}:${phone}:${code}`), original = database.pool.query;
  let signal, release, waiting = 0;
  const ready = new Promise(resolve => { signal = resolve; }), hold = new Promise(resolve => { release = resolve; });
  database.pool.query = async function (...args) {
    const result = await original.apply(this, args);
    if (typeof args[0]==="string" && args[0].includes("UPDATE phone_challenges") && args[0].includes("code_hash") && args[1]?.[0]===sent.challengeId && args[1]?.[2]!==correctHash) {
      waiting++; if (waiting===5) signal(); await hold;
    }
    return result;
  };
  const bad = code==="000000" ? "111111" : "000000", guesses = Array.from({ length: 5 }, () => service.consume(sent.challengeId, phone, bad).catch(error => error));
  try { await ready; await assert.rejects(service.consume(sent.challengeId, phone, code), e => e.status===401); }
  finally { release(); await Promise.all(guesses); database.pool.query = original; }
});
test("application budgets survive actual Better Auth rate-table cleanup", async () => {
  const subject = randomUUID(), operation = "cleanup-regression", bucket = Math.floor(Date.now()/900000), key = "grmn:"+authDigest(config.secret, `${operation}:${subject}:${bucket}`);
  await consumeAuthBudget(database, config.secret, operation, subject, 1, 900);
  await database.pool.query("UPDATE auth_rate_limits SET last_request=$1 WHERE key=$2", [Date.now()-120000, key]);
  const limited = createAuthFoundation({ database: secondDatabase, config: { ...config, trustedIPHeader: "x-grmn-client-ip" } });
  const libraryKey = "127.0.0.10|/sign-in/email";
  await database.pool.query("INSERT INTO auth_rate_limits(id,key,count,last_request) VALUES($1,$2,1,$3)", [randomUUID(), libraryKey, Date.now()-120000]);
  await onRequestRateLimit(new Request(config.baseURL+"/api/auth/sign-in/email", { headers: { "x-grmn-client-ip": "127.0.0.10" } }), await limited.auth.$context);
  await delay(25);
  assert.ok(Number((await database.pool.query("SELECT last_request FROM auth_rate_limits WHERE key=$1", [libraryKey])).rows[0].last_request)>Date.now()-10000);
  await assert.rejects(consumeAuthBudget(secondDatabase, config.secret, operation, subject, 1, 900), e => e.status===429);
});
test("a failed MFA step-up audit never refreshes the prior grant even when session deletion fails", async () => {
  const identity = await getSessionIdentity(foundation, cookies(staffJar));
  assert.ok(identity);
  const previousGrant=(await database.pool.query("SELECT verified_at FROM staff_session_grants WHERE session_id=$1",[identity.sessionId])).rows[0];
  await database.pool.query("CREATE FUNCTION synthetic_mfa_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END; $$");
  await database.pool.query("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='staff.mfa_verified') EXECUTE FUNCTION synthetic_mfa_fault()");
  await database.pool.query("CREATE TRIGGER synthetic_delete_failure BEFORE DELETE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION synthetic_mfa_fault()");
  try {
    const code = await createOTP(decodeBase32(totpSecret)).totp();
    const result = await request("/two-factor/verify-totp", { code }, staffJar);
    assert.equal(result.response.status, 503);
    assert.equal(result.body.error.code, "MFA_STEP_UP_RETRY");
    assert.equal((await database.pool.query("SELECT verified_at FROM staff_session_grants WHERE session_id=$1", [identity.sessionId])).rows[0].verified_at.getTime(), previousGrant.verified_at.getTime());
  } finally {
    await database.pool.query("DROP TRIGGER synthetic_audit_failure ON audit_events");
    await database.pool.query("DROP TRIGGER synthetic_delete_failure ON auth_sessions");
    await database.pool.query("DROP FUNCTION synthetic_mfa_fault()");
  }
});
test("simultaneous MFA enrollments cannot replace an in-flight secret", async () => {
  const jar = new Map(), id = randomUUID(), email = "enrollment@example.invalid";
  await database.pool.query("INSERT INTO users(id,name,email) VALUES($1,'Synthetic enrollment',$2)", [id, email]);
  await database.pool.query("INSERT INTO auth_accounts(id,account_id,provider_id,user_id,password) VALUES($1,$2::uuid::text,'credential',$2,$3)", [randomUUID(), id, await hashPassword(staffPassword)]);
  await database.pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='editor'", [id]);
  assert.equal((await request("/sign-in/email", { email, password: staffPassword }, jar)).response.status, 200);
  const results = await Promise.all([request("/two-factor/enable", { password: staffPassword }, new Map(jar)), request("/two-factor/enable", { password: staffPassword }, new Map(jar), second)]);
  assert.equal(results.filter(r => r.response.status===200).length, 1);
  assert.equal(results.filter(r => r.response.status===429).length, 1);
  const winner = results.find(r => r.response.status===200);
  const secret = new URL(winner.body.totpURI).searchParams.get("secret");
  const verified = await request("/two-factor/verify-totp", { code: await createOTP(decodeBase32(secret)).totp() }, winner.jar);
  assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
});
test("authenticated MFA guessing is budgeted per account across instances", async () => {
  const bucket = Math.floor(Date.now()/300000), key = "grmn:"+authDigest(config.secret, `mfa-account:${staffId}:${bucket}`);
  const table = (await database.pool.query("SELECT to_regclass('auth_request_budgets') AS name")).rows[0].name ? "auth_request_budgets" : "auth_rate_limits";
  await database.pool.query(`DELETE FROM ${table} WHERE key=$1`, [key]);
  const valid = await createOTP(decodeBase32(totpSecret)).totp(), code = valid==="000000" ? "111111" : "000000";
  const results = [];
  // Previously unadmitted old sessions now require password restart; exercise
  // shared guessing budgets on the legitimately admitted session.
  for (let i=0;i<6;i++) results.push(await request("/two-factor/verify-totp", { code }, staffJar, i%2 ? second : foundation));
  assert.equal(results[5].response.status, 429);
});
