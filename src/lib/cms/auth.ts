import { cookies } from "next/headers";
import { getAdminByEmail } from "./store";
import type { AdminUser } from "./types";

export const ADMIN_COOKIE_NAME = "garmin_admin_session";

export interface SessionData {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
}

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);
    if (!sessionCookie?.value) {
      return null;
    }

    const payload: SessionData = JSON.parse(
      Buffer.from(sessionCookie.value, "base64").toString("utf-8")
    );

    if (!payload.email) return null;
    const admin = getAdminByEmail(payload.email);
    if (!admin || admin.status === "inactive") return null;

    return admin;
  } catch {
    return null;
  }
}

export function createSessionToken(admin: AdminUser): string {
  const data: SessionData = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    avatar: admin.avatar,
  };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}
