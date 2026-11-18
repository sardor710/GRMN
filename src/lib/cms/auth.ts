import { cookies } from "next/headers";
import { getAdminByEmail } from "./store";
import {
  resolveSessionSecret,
  signSessionToken,
  verifySessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "./session-token";
import type { AdminUser } from "./types";

export const ADMIN_COOKIE_NAME = "garmin_admin_session";

// Cached on globalThis so every server bundle in this process (route handlers, RSC pages)
// shares one secret; otherwise a random production fallback could differ between bundles.
const SECRET_KEY = Symbol.for("garmin.adminSessionSecret");
type SecretHolder = { [SECRET_KEY]?: string };

function getSessionSecret(): string {
  const holder = globalThis as SecretHolder;
  const cached = holder[SECRET_KEY];
  if (cached) return cached;
  const { secret, warning } = resolveSessionSecret();
  if (warning) console.warn(`[admin-auth] ${warning}`);
  holder[SECRET_KEY] = secret;
  return secret;
}

/** Cookie options for the admin session cookie (HttpOnly, Secure in production, SameSite=Lax). */
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Resolve the signed-in admin from the session cookie. Unsigned (legacy base64),
 * tampered or expired cookies yield null, which forces a re-login.
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifySessionToken(token, getSessionSecret());
    if (!payload) return null;

    const admin = getAdminByEmail(payload.email);
    if (!admin || admin.id !== payload.sub || admin.status === "inactive") return null;

    return admin;
  } catch {
    return null;
  }
}

export function createSessionToken(admin: AdminUser): string {
  return signSessionToken({ sub: admin.id, email: admin.email }, getSessionSecret());
}
