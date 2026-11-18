import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Permission } from "../context.ts";
import { AuthFailure } from "./config.ts";
import { getAuthRuntime } from "./runtime.ts";
import { requireStaffPrincipal, requirePermission } from "./principal.ts";

export async function authorizeAdminPage(permission?: Permission) {
  const requestHeaders = new Headers(await headers());
  try {
    const runtime = getAuthRuntime();
    const staff = await requireStaffPrincipal(runtime, requestHeaders);
    const principal = permission ? await requirePermission(runtime, requestHeaders, permission) : staff;
    return { allowed: true as const, permissions: principal.permissions };
  } catch (error) {
    if (error instanceof AuthFailure && error.status===401) redirect("/admin/login");
    return { allowed: false as const, message: error instanceof AuthFailure && error.status===403 ? "Your current access does not allow this page. Sensitive operations may require fresh MFA verification." : "Administrator access is currently unavailable." };
  }
}
