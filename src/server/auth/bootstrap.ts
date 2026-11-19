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
export const staffRoles = Object.keys(defaults) as readonly string[];
export interface InitialStaffAccount { name: string; email: string; password: string; role: string }

export async function bootstrapFirstStaff(database: DatabaseHandle, input: unknown) {
  const parsed = bootstrapInput.safeParse(input);
  if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400, "Bootstrap requires valid name, email and a 16–128 character password");
  const [account] = await createInitialStaff(database, [{ ...parsed.data, role: "super_admin" }]);
  return { userId: account.userId };
}

// Creates the initial staff (one transaction, only while no staff exist): the permission and role
// catalog, then each account with its credential and exactly one role. Used by auth:bootstrap (one
// super_admin) and by ops:staff-setup (the owner's launch accounts, Task 24).
export async function createInitialStaff(database: DatabaseHandle, accounts: readonly InitialStaffAccount[]): Promise<{ userId: string; email: string; role: string }[]> {
  for (const account of accounts) if (!bootstrapInput.safeParse({ name: account.name, email: account.email, password: account.password }).success || !staffRoles.includes(account.role)) throw new AuthFailure("INVALID_INPUT", 400, "Each staff account needs a valid name, email, 16–128 character password and a known role");
  const prepared = await Promise.all(accounts.map(async account => ({ ...account, id: randomUUID(), passwordHash: await hashPassword(account.password) })));
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('grmn-first-staff-bootstrap'))");
    if ((await client.query("SELECT 1 FROM user_roles LIMIT 1")).rowCount) throw new AuthFailure("VERSION_CONFLICT", 409, "Staff bootstrap is already complete");
    for (const permission of allPermissions) await client.query("INSERT INTO permissions(id,code) VALUES($1,$2) ON CONFLICT(code) DO NOTHING", [randomUUID(), permission]);
    for (const [role, permissions] of Object.entries(defaults)) {
      await client.query("INSERT INTO roles(id,code) VALUES($1,$2) ON CONFLICT(code) DO NOTHING", [randomUUID(), role]);
      for (const permission of permissions) await client.query("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING", [role, permission]);
    }
    for (const account of prepared) {
      await client.query("INSERT INTO users(id,name,email) VALUES($1,$2,$3)", [account.id, account.name, account.email]);
      await client.query("INSERT INTO auth_accounts(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2::uuid::text,'credential',$3)", [randomUUID(), account.id, account.passwordHash]);
      await client.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2", [account.id, account.role]);
      await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'staff.bootstrapped','user',$2,$3,$4)", [randomUUID(), account.id, `staff-bootstrap:${account.id}`, JSON.stringify({ role: account.role })]);
    }
    await client.query("COMMIT");
    return prepared.map(account => ({ userId: account.id, email: account.email, role: account.role }));
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
