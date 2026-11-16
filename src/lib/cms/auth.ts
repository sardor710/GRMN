import "server-only";
import { headers } from "next/headers";
import { getAuthRuntime } from "@/server/auth/runtime";
import { getSessionIdentity, requireStaffPrincipal } from "@/server/auth/principal";

export interface AdminSessionView {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  permissions: string[];
}
// Compatibility adapter for the layout only. Each page and service performs its
// own authorization. No legacy source account or submitted cookie is authority.
export async function getCurrentAdmin(): Promise<AdminSessionView | null> {
  const requestHeaders = new Headers(await headers());
  try {
    const runtime = getAuthRuntime();
    await requireStaffPrincipal(runtime, requestHeaders);
    const identity = await getSessionIdentity(runtime, requestHeaders);
    if (!identity) return null;
    return { id: identity.id, name: identity.name, email: identity.email, role: identity.roles.join(", "), roles: identity.roles, permissions: identity.permissions };
  } catch { return null; }
}
