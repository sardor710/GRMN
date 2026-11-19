// Task 23 G1: the write freeze. store_settings.maintenance_mode (and MAINTENANCE_MODE=1 for the
// legacy site) was stored but never enforced. While it is on, customers get a 503 maintenance page or
// a 503 JSON error and no business write is accepted; staff keep sign-in and admin reads, and can take
// a short-lived signed bypass (settings:write with fresh MFA) to verify the closed site.
import assert from "node:assert/strict";
import test from "node:test";
import { maintenanceDecision, issueBypass, verifyBypass, createMaintenanceFlag, createBypassHandler, BYPASS_COOKIE } from "../../src/server/operations/maintenance.ts";

const secret = "a".repeat(64), base = "https://shop.example";

test("when maintenance is off everything is allowed", () => {
  for (const [path, method] of [["/", "GET"], ["/api/cart/checkout", "POST"], ["/api/admin/products", "PUT"]])
    assert.equal(maintenanceDecision({ active: false, bypass: false, path, method }), "allow");
});

test("during maintenance pages show the maintenance page and every business API is refused", () => {
  const d = (path, method = "GET") => maintenanceDecision({ active: true, bypass: false, path, method });
  for (const path of ["/", "/c/wearables", "/p/fenix-8", "/account", "/checkout"]) assert.equal(d(path), "page", path);
  for (const [path, method] of [["/api/cart", "GET"], ["/api/cart/checkout", "POST"], ["/api/account/orders", "GET"], ["/api/admin/auth/login", "POST"], ["/api/payments/return", "GET"]])
    assert.equal(d(path, method), "api", `${method} ${path}`);
});

test("during maintenance staff sign-in, admin pages and admin reads, webhooks and the bypass route stay open", () => {
  const d = (path, method = "GET") => maintenanceDecision({ active: true, bypass: false, path, method });
  assert.equal(d("/api/auth/sign-in/email", "POST"), "allow");
  assert.equal(d("/admin"), "allow"); assert.equal(d("/admin/orders"), "allow");
  assert.equal(d("/api/admin/orders", "GET"), "allow"); assert.equal(d("/api/admin/orders", "HEAD"), "allow");
  assert.equal(d("/api/payments/webhooks/kaspi", "POST"), "allow", "a durable webhook intake stays open during the freeze (plan step 9)");
  assert.equal(d("/api/admin/maintenance-bypass", "POST"), "allow");
  // Owner 2026-11-19: staff prepare the closed store (products, garmin.com import, photo uploads,
  // content, settings), so admin API writes stay open; each admin route enforces staff sign-in and
  // permissions itself. Customers stay frozen (cart, checkout, account, legacy admin login).
  for (const [path, method] of [["/api/admin/products", "POST"], ["/api/admin/products", "PUT"], ["/api/admin/import/garmin", "POST"], ["/api/admin/uploads", "POST"], ["/api/admin/settings", "PUT"], ["/api/admin/inventory", "POST"]])
    assert.equal(d(path, method), "allow", `${method} ${path}`);
  // Look-alike prefixes do not match.
  assert.equal(d("/administrator"), "page"); assert.equal(d("/api/authx", "POST"), "api"); assert.equal(d("/api/admin-x", "GET"), "api");
});

test("a valid bypass allows everything during maintenance", () => {
  for (const [path, method] of [["/", "GET"], ["/api/cart/checkout", "POST"], ["/api/admin/settings", "PUT"]])
    assert.equal(maintenanceDecision({ active: true, bypass: true, path, method }), "allow");
});

test("the bypass token is signed, expires, and is refused when tampered or signed with another secret", () => {
  const now = Date.UTC(2026, 10, 18, 12), token = issueBypass(secret, now, 2 * 3600_000);
  assert.equal(verifyBypass(secret, token, now + 3600_000), true);
  assert.equal(verifyBypass(secret, token, now + 2 * 3600_000 + 1), false, "expired");
  assert.equal(verifyBypass("b".repeat(64), token, now), false, "another secret");
  const [v, exp, mac] = token.split(".");
  assert.equal(verifyBypass(secret, `${v}.${Number(exp) + 3600_000}.${mac}`, now), false, "extended expiry");
  for (const bad of [undefined, "", "x", "v1..", "v2." + exp + "." + mac, token + "x"]) assert.equal(verifyBypass(secret, bad, now), false, String(bad));
});

test("the flag is on with MAINTENANCE_MODE=1 or the stored setting, and the setting is cached briefly", async () => {
  let reads = 0, stored = false, now = 0;
  const flag = createMaintenanceFlag({ env: {}, read: async () => { reads++; return stored; }, ttlMs: 5000, clock: () => now });
  assert.equal(await flag(), false);
  stored = true; assert.equal(await flag(), false, "cached"); assert.equal(reads, 1);
  now = 5001; assert.equal(await flag(), true); assert.equal(reads, 2);
  const forced = createMaintenanceFlag({ env: { MAINTENANCE_MODE: "1" }, read: async () => { throw new Error("no database"); } });
  assert.equal(await forced(), true, "the environment switch needs no database (legacy site freeze)");
  const failing = createMaintenanceFlag({ env: {}, read: async () => { throw new Error("down"); } });
  assert.equal(await failing(), false, "a failed read does not lock the site; the failing database already returns 503s");
  assert.throws(() => createMaintenanceFlag({ env: { MAINTENANCE_MODE: "yes" }, read: async () => false }), /MAINTENANCE_MODE/);
});

test("the bypass route needs same-origin POST and settings:write, sets a secure cookie, and DELETE clears it", async () => {
  let asked = null;
  const handler = createBypassHandler({ secret, baseURL: base, enabled: true, authorize: async (headers, permission) => { asked = permission; if (headers.get("x-role") !== "owner") throw Object.assign(new Error("Permission is required"), { status: 403, code: "FORBIDDEN" }); return { userId: "u1" }; }, audit: async () => {} });
  const req = (method, headers = {}) => new Request(base + "/api/admin/maintenance-bypass", { method, headers: { origin: base, ...headers } });
  const ok = await handler(req("POST", { "x-role": "owner" }));
  assert.equal(ok.status, 200); assert.equal(asked, "settings:write");
  const cookie = ok.headers.get("set-cookie");
  assert.match(cookie, new RegExp(`^${BYPASS_COOKIE}=v1\\.`)); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=Strict/i); assert.match(cookie, /Max-Age=7200/);
  assert.equal((await handler(req("POST", { "x-role": "support" }))).status, 403);
  assert.equal((await handler(req("POST", { "x-role": "owner", origin: "https://evil.example" }))).status, 403);
  assert.equal((await handler(req("GET", { "x-role": "owner" }))).status, 405);
  const cleared = await handler(req("DELETE", { "x-role": "owner" }));
  assert.match(cleared.headers.get("set-cookie"), /Max-Age=0/);
  const disabled = createBypassHandler({ secret, baseURL: base, enabled: false, authorize: async () => ({ userId: "u1" }), audit: async () => {} });
  assert.equal((await disabled(req("POST", { "x-role": "owner" }))).status, 503, "the legacy site has no bypass: its freeze is total");
});
