import "server-only";
import { NextResponse } from "next/server";
import { getCurrentAdmin } from "./auth";

import { canUploadMedia } from "./media-permissions.ts";

/** Same-origin request from signed-in staff: returns the admin, or the response to send. */
async function sameOriginAdmin(request: Request) {
  let expected: string | null = null;
  try {
    expected = process.env.AUTH_BASE_URL ? new URL(process.env.AUTH_BASE_URL).origin : null;
  } catch {
    expected = null;
  }
  if (!expected || request.headers.get("origin") !== expected) {
    return { denied: NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 }) };
  }
  const admin = await getCurrentAdmin();
  if (!admin) return { denied: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  return { admin };
}

/**
 * Guard for catalog-editing routes outside the shared admin runtime (garmin.com import):
 * a same-origin request from signed-in staff holding `catalog:write`. Returns a response to send, or null.
 */
export async function requireCatalogWriter(request: Request): Promise<NextResponse | null> {
  const { admin, denied } = await sameOriginAdmin(request);
  if (denied) return denied;
  if (!admin.permissions.includes("catalog:write")) {
    return NextResponse.json({ error: "Your role cannot edit the catalog" }, { status: 403 });
  }
  return null;
}

/** Guard for image uploads: same origin, signed in, and `catalog:write` or `content:write` (owner 2026-11-23). */
export async function requireMediaWriter(request: Request): Promise<NextResponse | null> {
  const { admin, denied } = await sameOriginAdmin(request);
  if (denied) return denied;
  if (!canUploadMedia(admin.permissions)) {
    return NextResponse.json({ error: "Your role cannot upload images" }, { status: 403 });
  }
  return null;
}
