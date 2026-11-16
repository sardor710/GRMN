import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseHandle } from "../db/client.ts";
import type { Permission, Principal } from "../context.ts";
import type { AuthInstance } from "./factory.ts";
import { AuthFailure } from "./config.ts";
import { allPermissions } from "./bootstrap.ts";

export interface AuthRuntime { auth: AuthInstance; database: DatabaseHandle }
export async function getSessionIdentity(runtime: AuthRuntime, headers: Headers) {
  const result = await runtime.auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!result) return null;
  const current = await runtime.database.pool.query<{ id: string; name: string; email: string; roles: string[]; staff: boolean; mfa_enrolled: boolean; mfa_at: Date | null; permissions: string[] }>("SELECT u.id,u.name,u.email,ARRAY(SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=u.id ORDER BY r.code) AS roles,EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id) AS staff,(u.two_factor_enabled AND EXISTS(SELECT 1 FROM auth_two_factors WHERE user_id=u.id AND verified)) AS mfa_enrolled,CASE WHEN u.two_factor_enabled AND EXISTS(SELECT 1 FROM auth_two_factors WHERE user_id=u.id AND verified) THEN g.verified_at ELSE NULL END AS mfa_at,ARRAY(SELECT DISTINCT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=u.id) AS permissions FROM users u JOIN auth_sessions s ON s.user_id=u.id LEFT JOIN staff_session_grants g ON g.session_id=s.id AND g.user_id=u.id WHERE s.id=$1 AND u.status='active' AND s.expires_at>clock_timestamp()", [result.session.id]);
  return current.rows[0] ? { ...current.rows[0], sessionId: result.session.id } : null;
}
function principalFromIdentity(current: Awaited<ReturnType<typeof getSessionIdentity>>): Principal {
  if (!current) throw new AuthFailure("UNAUTHENTICATED", 401, "Sign in is required");
  if (current.staff && !current.mfa_at) throw new AuthFailure("FORBIDDEN", 403, "Staff MFA verification is required");
  const permissions = current.permissions.filter((code): code is Permission => (allPermissions as readonly string[]).includes(code));
  return { userId: current.id, permissions };
}
export async function requirePrincipal(runtime: AuthRuntime, headers: Headers): Promise<Principal> {
  return principalFromIdentity(await getSessionIdentity(runtime, headers));
}
export async function requireStaffPrincipal(runtime: AuthRuntime, headers: Headers): Promise<Principal> {
  const current = await getSessionIdentity(runtime, headers);
  const principal = principalFromIdentity(current);
  if (!current?.staff) throw new AuthFailure("FORBIDDEN", 403, "Staff access is required");
  return principal;
}
export async function requirePermission(runtime: AuthRuntime, headers: Headers, permission: Permission) {
  const current = await getSessionIdentity(runtime, headers), principal = principalFromIdentity(current);
  if (!principal.permissions.includes(permission)) throw new AuthFailure("FORBIDDEN", 403, "Permission is required");
  if (["staff:manage", "settings:write", "payments:refund", "exports:create"].includes(permission)) {
    if (!current?.mfa_at || Date.now()-current.mfa_at.getTime()>900000) throw new AuthFailure("FORBIDDEN", 403, "Fresh MFA verification is required");
  }
  return principal;
}
export async function revokeUserSessions(runtime: AuthRuntime, headers: Headers, targetUserId: string) {
  const actor = await requirePermission(runtime, headers, "staff:manage");
  const client = await runtime.database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [targetUserId]);
    await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key) VALUES($1,$2,'auth.sessions_revoked','user',$3,$4)", [randomUUID(), actor.userId, targetUserId, `sessions-revoked:${randomUUID()}`]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
