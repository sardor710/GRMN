import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { DatabaseHandle } from "../db/client.ts";
import type { Permission } from "../context.ts";
import { AuthFailure } from "./config.ts";
import { bootstrapInput } from "./validation.ts";

export const allPermissions = ["catalog:read", "catalog:write", "inventory:write", "content:write", "customers:read", "customers:write", "orders:read", "orders:fulfill", "payments:refund", "payments:confirm", "staff:manage", "settings:write", "exports:create"] as const satisfies readonly Permission[];
const defaults: Record<string, readonly Permission[]> = {
  super_admin: allPermissions,
  // O07 (Task 21C): the business owner. Holds every permission, including payments:confirm.
  owner: allPermissions,
  product_manager: ["catalog:read", "catalog:write", "inventory:write"],
  editor: ["catalog:read", "content:write"],
  support: ["customers:read", "orders:read"],
};
export async function bootstrapFirstStaff(database: DatabaseHandle, input: unknown) {
  const parsed = bootstrapInput.safeParse(input);
  if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400, "Bootstrap requires valid name, email and a 16–128 character password");
  const passwordHash = await hashPassword(parsed.data.password), id = randomUUID(), client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('grmn-first-staff-bootstrap'))");
    if ((await client.query("SELECT 1 FROM user_roles LIMIT 1")).rowCount) throw new AuthFailure("VERSION_CONFLICT", 409, "Staff bootstrap is already complete");
    await client.query("INSERT INTO users(id,name,email) VALUES($1,$2,$3)", [id, parsed.data.name, parsed.data.email]);
    await client.query("INSERT INTO auth_accounts(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2::uuid::text,'credential',$3)", [randomUUID(), id, passwordHash]);
    for (const permission of allPermissions) await client.query("INSERT INTO permissions(id,code) VALUES($1,$2) ON CONFLICT(code) DO NOTHING", [randomUUID(), permission]);
    for (const [role, permissions] of Object.entries(defaults)) {
      await client.query("INSERT INTO roles(id,code) VALUES($1,$2) ON CONFLICT(code) DO NOTHING", [randomUUID(), role]);
      for (const permission of permissions) await client.query("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING", [role, permission]);
    }
    await client.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin'", [id]);
    await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'staff.bootstrapped','user',$2,$3,'{\"role\":\"super_admin\"}')", [randomUUID(), id, `staff-bootstrap:${id}`]);
    await client.query("COMMIT");
    return { userId: id };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
