// node --conditions=react-server scripts/dev/catalog-smoke.mjs --base http://localhost:3000
// End-to-end smoke of the admin catalog API (M2) through the running dev server's real HTTP routes, as an
// authenticated staff session. Staff sign-in needs TOTP, so instead of driving the login UI this script
// signs a session for a dedicated dev-only staff account (role product_manager) directly in the local dev
// database (storage/devdb) — the same thing the integration tests do — and removes that account's role,
// sessions and MFA marker again at the end, so `npm run dev:admin` still sees the database as it was.
// It creates one synthetic accessory product, links it to an imported device, edits stock (editor, quick
// edit, restock) and archives the product. Refuses NODE_ENV=production; never targets another database.
import { createHmac, randomUUID } from "node:crypto";
import { log, withDevDatabase } from "./lib.mjs";

if (process.env.NODE_ENV === "production") throw new Error("catalog-smoke refuses to run with NODE_ENV=production");
const args = process.argv.slice(2);
const base = (args.indexOf("--base") >= 0 ? args[args.indexOf("--base") + 1] : "http://localhost:3000").replace(/\/$/, "");
const SMOKE_EMAIL = "catalog-smoke@example.invalid";

const rows = [];
async function step(name, work) {
  const started = Date.now();
  try { const detail = await work(); rows.push({ name, ok: true, ms: Date.now() - started, detail }); }
  catch (error) { rows.push({ name, ok: false, ms: Date.now() - started, detail: error instanceof Error ? error.message : String(error) }); }
}
const expect = (condition, message) => { if (!condition) throw new Error(message); };

await withDevDatabase(async ({ database, secrets }) => {
  const { parseAuthConfig } = await import("../../src/server/auth/config.ts");
  const { createAuthFoundation } = await import("../../src/server/auth/http.ts");
  const config = parseAuthConfig({ AUTH_ENABLED: "1", AUTH_SECRET: secrets.authSecret, AUTH_BASE_URL: base, NODE_ENV: "development" });
  const runtime = createAuthFoundation({ database, config });
  const q = (sql, values = []) => database.pool.query(sql, values);
  if (!(await q("SELECT 1 FROM roles WHERE code='product_manager'")).rowCount) throw new Error("No staff roles yet: run `npm run dev:admin` once (it seeds the roles), then retry");
  let userId = (await q("SELECT id FROM users WHERE email=$1", [SMOKE_EMAIL])).rows[0]?.id;
  if (!userId) { userId = randomUUID(); await q("INSERT INTO users(id,name,email) VALUES($1,'Catalog smoke (dev only)',$2)", [userId, SMOKE_EMAIL]); }
  await q("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='product_manager' ON CONFLICT DO NOTHING", [userId]);
  await q("UPDATE users SET two_factor_enabled=true WHERE id=$1", [userId]);
  await q("INSERT INTO auth_two_factors(id,user_id,secret,backup_codes,verified) SELECT $1,$2,'dev-smoke','dev-smoke',true WHERE NOT EXISTS (SELECT 1 FROM auth_two_factors WHERE user_id=$2)", [randomUUID(), userId]);
  const session = await (await runtime.auth.$context).internalAdapter.createSession(userId);
  await q("INSERT INTO staff_session_grants(session_id,user_id,method) VALUES($1,$2,'totp')", [session.id, userId]);
  const cookie = `grmn-auth.session_token=${encodeURIComponent(session.token + "." + createHmac("sha256", config.secret).update(session.token).digest("base64"))}`;
  const call = async (method, path, body) => {
    const response = await fetch(base + path, { method, headers: { cookie, origin: base, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(300000) });
    const text = await response.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, json, bytes: Buffer.byteLength(text) };
  };
  const n = Date.now().toString(36);
  let device, accessory, accessoryVariantId;
  try {
    await step("auth: unauthenticated list is refused", async () => {
      const response = await fetch(base + "/api/admin/catalog/products", { signal: AbortSignal.timeout(300000) });
      expect(response.status === 401, `status ${response.status}`); return "401";
    });
    await step("GET taxonomy", async () => {
      const r = await call("GET", "/api/admin/catalog/taxonomy");
      expect(r.status === 200 && r.json.categories.length > 50, `status ${r.status}`); return `${r.json.categories.length} categories, epoch ${r.json.epoch}`;
    });
    await step("GET grouped list", async () => {
      const r = await call("GET", "/api/admin/catalog/products?limit=50");
      expect(r.status === 200 && r.json.total > 0, `status ${r.status}`); return `${r.json.items.length}/${r.json.total} rows, ${(r.bytes / 1024).toFixed(1)} KB`;
    });
    await step("GET SKU list", async () => {
      const r = await call("GET", "/api/admin/catalog/skus?limit=50");
      expect(r.status === 200 && r.json.total > 0, `status ${r.status}`); return `${r.json.items.length}/${r.json.total} SKUs, ${(r.bytes / 1024).toFixed(1)} KB`;
    });
    await step("GET editor payload of an imported device", async () => {
      const key = (await q("SELECT p.public_key FROM products p WHERE p.status<>'archived' AND EXISTS (SELECT 1 FROM product_options o WHERE o.product_id=p.id) ORDER BY p.updated_at DESC LIMIT 1")).rows[0]?.public_key;
      expect(key, "no imported product with options");
      const r = await call("GET", `/api/admin/catalog/products/${encodeURIComponent(key)}`);
      expect(r.status === 200 && r.json.product.variants.length > 0, `status ${r.status}`); device = r.json.product;
      return `${device.name}: ${device.options.length} options, ${device.variants.length} variants, ${(r.bytes / 1024).toFixed(1)} KB`;
    });
    await step("POST create accessory (categories, compatibility by option value, stock)", async () => {
      const value = device.options[0].values[0];
      const r = await call("POST", "/api/admin/catalog/products", { name: `Smoke QuickFit band ${n}`, sku: `SMOKE-${n}`, price: "24995", stock: 5, status: "draft", inTheBox: [], categories: [{ key: "bands", primary: true }], compatibility: { devices: [{ productKey: device.id, optionValueKeys: [value.id] }] } });
      expect(r.status === 201, `status ${r.status} ${JSON.stringify(r.json?.error ?? r.json)}`); accessory = r.json.product;
      expect(accessory.stock === 5 && accessory.compatibility.compatibleDevices[0]?.optionValues[0]?.id === value.id, "stock or compatibility missing");
      return `${accessory.id} v${accessory.version}, fits ${device.name} ${value.label}`;
    });
    await step("device side sees the accessory, resolved per variant", async () => {
      const r = await call("GET", `/api/admin/catalog/products/${encodeURIComponent(device.id)}`);
      const link = r.json.product.compatibility.compatibleAccessories.find(item => item.productKey === accessory.id);
      expect(link && link.appliesToVariantIds.length > 0, "link missing"); device = r.json.product;
      return `${link.scope}, applies to ${link.appliesToVariantIds.length}/${device.variants.length} variants`;
    });
    await step("PATCH quick edit (price + stock via ledger)", async () => {
      accessoryVariantId = (await call("GET", `/api/admin/catalog/products/${encodeURIComponent(accessory.id)}/variants`)).json.variants[0].variantId;
      const r = await call("PATCH", `/api/admin/catalog/variants/${accessoryVariantId}`, { version: accessory.version, price: "19990", stock: 7 });
      expect(r.status === 200 && r.json.variant.stock.onHand === 7, `status ${r.status} ${JSON.stringify(r.json?.error ?? "")}`);
      return `v${r.json.product.version}, ${r.json.variant.price} KZT, on hand ${r.json.variant.stock.onHand}`;
    });
    await step("POST restock +3 (ledger receive)", async () => {
      const r = await call("POST", "/api/admin/catalog/restock", { productId: accessory.id, quantity: 3, idempotencyKey: `restock:smoke-${n}` });
      expect(r.status === 200 && r.json.stock.onHand === 10, `status ${r.status} ${JSON.stringify(r.json?.error ?? "")}`); return `on hand ${r.json.stock.onHand}, product v${r.json.product.version}`;
    });
    await step("PUT with the stale version is 409", async () => {
      const r = await call("PUT", `/api/admin/catalog/products/${encodeURIComponent(accessory.id)}`, { ...accessory, name: "stale" });
      expect(r.status === 409, `status ${r.status}`); return `409 ${r.json.error.code}`;
    });
    await step("ledger: opening + adjust + receive, balance 10", async () => {
      const moves = (await q("SELECT reason,delta_on_hand FROM stock_movements WHERE variant_id=$1 ORDER BY created_at,id", [accessoryVariantId])).rows;
      const balance = (await q("SELECT on_hand FROM inventory_balances WHERE variant_id=$1", [accessoryVariantId])).rows[0].on_hand;
      expect(moves.map(m => m.reason).join(",") === "opening,adjust,receive" && balance === 10, JSON.stringify(moves));
      return moves.map(m => `${m.reason} ${m.delta_on_hand > 0 ? "+" : ""}${m.delta_on_hand}`).join(", ");
    });
  } finally {
    if (accessory) {
      const current = (await q("SELECT version FROM products WHERE public_key=$1", [accessory.id])).rows[0];
      const r = await call("DELETE", `/api/admin/products?id=${encodeURIComponent(accessory.id)}&version=${current.version}`);
      rows.push({ name: "cleanup: archive the smoke product (legacy route)", ok: r.status === 200, ms: 0, detail: `status ${r.status}` });
    }
    await q("DELETE FROM staff_session_grants WHERE user_id=$1", [userId]);
    await q("DELETE FROM auth_sessions WHERE user_id=$1", [userId]).catch(() => {});
    await q("DELETE FROM user_roles WHERE user_id=$1", [userId]);
  }
});

const width = Math.max(...rows.map(row => row.name.length));
for (const row of rows) log(`${row.ok ? "PASS" : "FAIL"}  ${row.name.padEnd(width)}  ${String(row.ms).padStart(6)} ms  ${row.detail}`);
const failed = rows.filter(row => !row.ok).length;
log(failed ? `${failed} step(s) failed` : `all ${rows.length} steps passed`);
process.exitCode = failed ? 1 : 0;
