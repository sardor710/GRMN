import "server-only";
import { NextResponse } from "next/server";
import { getCurrentAdmin } from "./auth";

/**
 * Guard for catalog-editing routes outside the shared admin runtime (garmin.com import, photo uploads):
 * a same-origin request from signed-in staff holding `catalog:write`. Returns a response to send, or null.
 */
export async function requireCatalogWriter(request: Request): Promise<NextResponse | null> {
  let expected: string | null = null;
  try {
    expected = process.env.AUTH_BASE_URL ? new URL(process.env.AUTH_BASE_URL).origin : null;
  } catch {
    expected = null;
  }
  if (!expected || request.headers.get("origin") !== expected) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!admin.permissions.includes("catalog:write")) {
    return NextResponse.json({ error: "Your role cannot edit the catalog" }, { status: 403 });
  }
  return null;
}
