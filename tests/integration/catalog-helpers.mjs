// Shared disposable-PostgreSQL setup for the M2 catalog admin integration tests: migrated database,
// real staff sessions (MFA-admitted) and the guarded catalog/CMS services.
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { parseAuthConfig } from "../../src/server/auth/config.ts";
import { createAuthFoundation } from "../../src/server/auth/http.ts";
import { bootstrapFirstStaff } from "../../src/server/auth/bootstrap.ts";
import { requirePermission, requireStaffPrincipal } from "../../src/server/auth/principal.ts";
import { createInventoryService } from "../../src/server/inventory/service.ts";
import { createCatalogAdminService } from "../../src/server/cms/catalog-service.ts";
import { createCMSService } from "../../src/server/cms/service.ts";
import { taxonomySeed } from "../../src/server/catalog/taxonomy-seed.ts";

export const config = parseAuthConfig({ AUTH_ENABLED: "1", AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_BASE_URL: "http://localhost:3000", NODE_ENV: "test" });

export async function startCatalogFixture({ taxonomy = true } = {}) {
  const temporary = await startTemporaryPostgres();
  const migration = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "1", DATABASE_CONNECT_TIMEOUT_MS: "10000", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
  try { await migrate(migration.db, { migrationsFolder: "drizzle" }); } finally { await migration.close(); }
  const database = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "6" }));
  const runtime = createAuthFoundation({ database, config });
  const q = (sql, args = []) => database.pool.query(sql, args);
  async function admitted(id) {
    await q("UPDATE users SET two_factor_enabled=true WHERE id=$1", [id]);
    await q("INSERT INTO auth_two_factors(id,user_id,secret,backup_codes,verified) VALUES($1,$2,'synthetic-proof-fixture','synthetic-proof-fixture',true)", [randomUUID(), id]);
    const session = await (await runtime.auth.$context).internalAdapter.createSession(id);
    await q("INSERT INTO staff_session_grants(session_id,user_id,method) VALUES($1,$2,'totp')", [session.id, id]);
    const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
    return new Headers({ cookie: `grmn-auth.session_token=${encodeURIComponent(session.token + "." + signature)}` });
  }
  // Role codes are a fixed set (roles_code_valid); extra permissions are granted to that role in this database only.
  async function staff(name, role, extraPermissions = []) {
    const id = randomUUID();
    await q("INSERT INTO users(id,name,email) VALUES($1,$2,$3)", [id, `Synthetic ${name}`, `${name}@example.invalid`]);
    for (const permission of extraPermissions) await q("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING", [role, permission]);
    await q("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2", [id, role]);
    return { id, headers: await admitted(id) };
  }
  const bootstrap = await bootstrapFirstStaff(database, { name: "Synthetic catalog admin", email: "catalog-admin@example.invalid", password: randomBytes(24).toString("base64url") });
  const admin = await admitted(bootstrap.userId);
  // catalog:read + catalog:write, no inventory:write.
  const catalogEditor = await staff("catalog_editor", "editor", ["catalog:write"]);
  // No catalog permissions at all.
  const reader = await staff("support_reader", "support");
  const authorize = async (headers, permission) => { await requireStaffPrincipal(runtime, headers); return requirePermission(runtime, headers, permission); };
  const inventory = createInventoryService({ pool: database.pool, authorize });
  const catalog = createCatalogAdminService({ pool: database.pool, authorize, inventory });
  const cms = createCMSService({ pool: database.pool, authorize });
  await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location') ON CONFLICT (key) DO NOTHING", [randomUUID()]);
  if (taxonomy) await seedTaxonomy(q);
  return {
    temporary, database, runtime, q, admin, adminId: bootstrap.userId, catalogEditor, reader, authorize, inventory, catalog, cms,
    async stop() { try { await database.close(); } finally { await temporary.stop(); } },
  };
}

/** Inserts the M1 taxonomy seed (catalog tree, accessory tree, groups) the way dev:seed does. */
export async function seedTaxonomy(q) {
  const ids = new Map();
  const siblings = new Map();
  for (const node of taxonomySeed) ids.set(node.key, randomUUID());
  for (const node of taxonomySeed) {
    const position = siblings.get(node.parentKey) ?? 0; siblings.set(node.parentKey, position + 1);
    await q("INSERT INTO categories(id,key,name,parent_id,position,kind,slug,preset_filters,nav_visible) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (key) DO NOTHING",
      [ids.get(node.key), node.key, node.name, node.parentKey ? ids.get(node.parentKey) : null, position, node.kind, node.slug, JSON.stringify(node.presetFilters ?? {}), node.navVisible ?? true]);
  }
  return ids;
}

let serial = 0;
export const nextSerial = () => ++serial;

/** A watch-like device: Case size (43/47/51 mm) × Color, all active, with stock. */
export function deviceCommand(n, extra = {}) {
  return {
    name: `Synthetic fēnix ${n}`, family: "fēnix", status: "published", description: "Synthetic device",
    options: [
      { id: "size", key: "case-size", name: "Case Size", display: "buttons", values: [{ id: "s43", key: "43 mm", label: "43 mm" }, { id: "s47", key: "47 mm", label: "47 mm" }, { id: "s51", key: "51 mm", label: "51 mm" }] },
      { id: "color", key: "color", name: "Color", display: "swatch", values: [{ id: "black", key: "black", label: "Black", swatchColor: "#000000" }, { id: "gray", key: "gray", label: "Gray", swatchColor: "#888" }] },
    ],
    variants: [
      { id: "v43b", sku: `DEV-${n}-43-B`, title: "43 mm Black", selections: { size: "s43", color: "black" }, price: "349995", stock: 4, status: "active", isDefault: true },
      { id: "v47b", sku: `DEV-${n}-47-B`, title: "47 mm Black", selections: { size: "s47", color: "black" }, price: "379995", stock: 2, status: "active" },
      { id: "v51b", sku: `DEV-${n}-51-B`, title: "51 mm Black", selections: { size: "s51", color: "black" }, price: "399995", originalPrice: "449995", stock: 0, status: "active" },
      { id: "v51g", sku: `DEV-${n}-51-G`, title: "51 mm Gray", selections: { size: "s51", color: "gray" }, price: "399995", stock: 7, status: "active" },
    ],
    ...extra,
  };
}

export function simpleCommand(n, extra = {}) {
  return { name: `Synthetic QuickFit band ${n}`, sku: `BAND-${n}`, price: "24995", stock: 10, status: "published", family: "QuickFit", inTheBox: [], ...extra };
}
