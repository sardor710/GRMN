// Task 24 (owner, 2026-11-19): staff sign in with their password only, until another security layer
// is added. STAFF_MFA_REQUIRED=0 turns the authenticator requirement off; the default (unset or 1)
// keeps per-session MFA and fresh MFA for sensitive permissions. Breaks caught: the flag leaking
// into the default, a staff session still blocked from the admin or from sensitive actions when
// the flag is off, and the login page being sent to enrollment.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomBytes } from "node:crypto";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { parseAuthConfig } from "../../src/server/auth/config.ts";
import { createAuthFoundation } from "../../src/server/auth/http.ts";
import { bootstrapFirstStaff } from "../../src/server/auth/bootstrap.ts";
import { requirePermission, requireStaffPrincipal, requireFreshPermission } from "../../src/server/auth/principal.ts";

let temporary, database, foundation;
const config = parseAuthConfig({ AUTH_ENABLED: "1", AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_BASE_URL: "http://localhost:3000", NODE_ENV: "test" });
const password = randomBytes(24).toString("base64url");
const cookies = jar => new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });
async function request(path, body, jar) {
  const headers = cookies(jar); headers.set("origin", config.baseURL); headers.set("content-type", "application/json");
  const response = await foundation.handleRequest(new Request(config.baseURL+"/api/auth"+path, { method: body===undefined ? "GET" : "POST", headers, body: body===undefined ? undefined : JSON.stringify(body) }));
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], i = pair.indexOf("="); if (!pair.slice(i+1) || /Max-Age=0/i.test(cookie)) jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), pair.slice(i+1)); }
  return { response, body: await response.json() };
}
function withFlag(value, run) {
  const before = process.env.STAFF_MFA_REQUIRED;
  if (value === undefined) delete process.env.STAFF_MFA_REQUIRED; else process.env.STAFF_MFA_REQUIRED = value;
  return Promise.resolve().then(run).finally(() => { if (before === undefined) delete process.env.STAFF_MFA_REQUIRED; else process.env.STAFF_MFA_REQUIRED = before; });
}
before(async () => {
  temporary = await startTemporaryPostgres();
  database = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "4" }));
  await migrate(database.db, { migrationsFolder: "drizzle" });
  foundation = createAuthFoundation({ database, config });
  await bootstrapFirstStaff(database, { name: "Store administrator", email: "admin@example.invalid", password });
}, { timeout: 120000 });
after(async () => { try { await database?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

test("STAFF_MFA_REQUIRED=0: a password session is a full staff session, sensitive actions included", () => withFlag("0", async () => {
  const jar = new Map();
  const login = await request("/sign-in/email", { email: "admin@example.invalid", password }, jar);
  assert.equal(login.response.status, 200); assert.equal(login.body.mfaRequired, false);
  const session = await request("/get-session", undefined, jar);
  assert.equal(session.body.staff, true); assert.equal(session.body.mfaRequired, false); assert.equal(session.body.mfaRestartRequired, false);
  assert.ok((await requireStaffPrincipal(foundation, cookies(jar))).userId);
  for (const permission of ["payments:confirm", "settings:write", "staff:manage", "exports:create"]) assert.ok((await requirePermission(foundation, cookies(jar), permission)).userId, permission);
  assert.ok((await requireFreshPermission(foundation, cookies(jar), "customers:write")).userId);
  // A wrong password is still refused.
  assert.equal((await request("/sign-in/email", { email: "admin@example.invalid", password: password+"x" }, new Map())).response.status, 401);
}));

test("default (flag unset): the same password session still needs MFA", () => withFlag(undefined, async () => {
  const jar = new Map();
  assert.equal((await request("/sign-in/email", { email: "admin@example.invalid", password }, jar)).response.status, 200);
  assert.equal((await request("/get-session", undefined, jar)).body.mfaRequired, true);
  await assert.rejects(requireStaffPrincipal(foundation, cookies(jar)), e => e.status === 403);
  await assert.rejects(requirePermission(foundation, cookies(jar), "payments:confirm"), e => e.status === 403);
}));
