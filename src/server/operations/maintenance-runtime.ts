import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/client.ts";
import { cmsBackend } from "../cms/source.ts";
import { parseAuthConfig } from "../auth/config.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { requirePermission } from "../auth/principal.ts";
import { BYPASS_COOKIE, createBypassHandler, createMaintenanceFlag, maintenanceDecision, maintenanceResponse, verifyBypass } from "./maintenance.ts";

// Task 23 G1 wiring: one cached flag per module instance. In legacy mode only MAINTENANCE_MODE=1
// freezes the site (no database read); in PostgreSQL mode the admin setting also does.
let flag: (() => Promise<boolean>) | undefined;
const maintenanceFlag = () => flag ??= createMaintenanceFlag({
  env: process.env,
  read: async () => cmsBackend() === "postgres"
    && (await getDatabase().pool.query<{ on: boolean }>("SELECT maintenance_mode AS on FROM store_settings WHERE id=1")).rows[0]?.on === true,
});

function authSecret(): string | null {
  try { return parseAuthConfig(process.env).secret; } catch { return null; }
}

function cookie(headers: Headers, name: string): string | null {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

/** The proxy's maintenance gate: a 503 response while frozen, or null to continue. */
export async function maintenanceGate(path: string, method: string, headers: Headers): Promise<Response | null> {
  const active = await maintenanceFlag()();
  if (!active) return null;
  const secret = cmsBackend() === "postgres" ? authSecret() : null;
  const bypass = secret !== null && verifyBypass(secret, cookie(headers, BYPASS_COOKIE));
  const decision = maintenanceDecision({ active, bypass, path, method });
  return decision === "allow" ? null : maintenanceResponse(decision);
}

const SETTINGS_TARGET = "00000000-0000-0000-0000-000000000001";
let bypassHandler: ((request: Request) => Promise<Response>) | undefined;
export function handleMaintenanceBypass(request: Request): Promise<Response> {
  if (!bypassHandler) {
    const enabled = cmsBackend() === "postgres", secret = authSecret();
    const config = secret ? parseAuthConfig(process.env) : null;
    bypassHandler = createBypassHandler({
      secret: secret ?? "", baseURL: config?.baseURL ?? "http://localhost", enabled: enabled && secret !== null,
      authorize: async (headers, permission) => requirePermission(getAuthRuntime(), headers, permission),
      audit: async (userId, action) => { await getDatabase().pool.query(
        "INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,$3,'settings',$4,$5,'{}'::jsonb)",
        [randomUUID(), userId, action, SETTINGS_TARGET, `maintenance:${randomUUID()}`]); },
    });
  }
  return bypassHandler(request);
}
