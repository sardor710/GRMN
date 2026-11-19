import "server-only";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseCookies } from "better-call";
import type { PoolClient } from "pg";
import type { DatabaseHandle } from "../db/client.ts";
import { buildAuth } from "./factory.ts";
import { AuthFailure } from "./config.ts";
import type { AuthConfig } from "./config.ts";
import { authDigest, consumeAuthBudget, PHONE_PURPOSES } from "./phone-service.ts";
import type { PhoneSender } from "./phone-service.ts";
import { getSessionIdentity, staffMfaRequired } from "./principal.ts";
import { completeProfileInput, emailInput, phoneInput } from "./validation.ts";
import { revokeBrowserAuthentication } from "./lifecycle.ts";
import { requestURL } from "./request-url.ts";

const bodies = {
  "/sign-in/email": z.object({ email: emailInput, password: z.string().min(16).max(128) }).strict(),
  "/sign-out": z.object({}).strict(),
  "/two-factor/enable": z.object({ password: z.string().min(16).max(128) }).strict(),
  "/two-factor/verify-totp": z.object({ code: z.string().regex(/^[0-9]{6}$/) }).strict(),
  "/two-factor/verify-backup-code": z.object({ code: z.string().min(6).max(64) }).strict(),
  "/grmn/phone/send": z.object({ phoneNumber: phoneInput, purpose: z.enum(PHONE_PURPOSES).optional() }).strict(),
  "/grmn/phone/verify": z.object({ phoneNumber: phoneInput, challengeId: z.uuid(), code: z.string().regex(/^[0-9]{6}$/) }).strict(),
  "/grmn/phone/complete": completeProfileInput,
  // Staff credential change through the Better Auth credential service; every session is revoked.
  "/change-password": z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(16).max(128), revokeOtherSessions: z.literal(true).default(true) }).strict(),
};
async function boundedJSON(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length)>4096)) {
    await request.body?.cancel().catch(() => {});
    throw new AuthFailure("INVALID_INPUT", 413, "Auth input is too large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthFailure("INVALID_INPUT", 400, "JSON input is required");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes>4096) { await reader.cancel().catch(() => {}); throw new AuthFailure("INVALID_INPUT", 413, "Auth input is too large"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AuthFailure("INVALID_INPUT", 400, "Invalid JSON input"); }
}
function responseSessionHeaders(request: Request, response: Response) {
  // Better Call verifies the first duplicate cookie. Overlay actual rotations
  // onto that same selection instead of admitting another same-user session.
  const jar = parseCookies(request.headers.get("cookie") ?? "");
  for (const cookie of response.headers.getSetCookie()) {
    for (const [name, value] of parseCookies(cookie.split(";")[0])) {
      if (!value || /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(cookie)) jar.delete(name); else jar.set(name, value);
    }
  }
  const headers = new Headers(request.headers);
  headers.set("cookie", [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; "));
  return headers;
}
function json(body: unknown, status = 200, original?: Headers) {
  const headers = new Headers(original);
  headers.set("Content-Type", "application/json"); headers.set("Cache-Control", "no-store"); headers.set("Vary", "Cookie");
  headers.delete("content-length"); headers.delete("set-auth-token"); headers.delete("authorization");
  return new Response(JSON.stringify(body), { status, headers });
}
export function authErrorResponse(error: unknown) {
  const failure = error instanceof AuthFailure ? error : new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Authentication is unavailable");
  const response = json({ error: { code: failure.code, message: failure.message } }, failure.status);
  if (failure.retryAfter) response.headers.set("Retry-After", String(failure.retryAfter));
  return response;
}
export function createAuthFoundation(input: { database: DatabaseHandle; config: AuthConfig; phoneSender?: PhoneSender }) {
  const auth = buildAuth(input), { database, config } = input;
  const runtime = { auth, database };
  return { ...runtime, async handleRequest(request: Request): Promise<Response> {
    let gate: PoolClient | undefined;
    let locked = false;
    let admissionHeaders: Headers | undefined;
    let previousAdmission = false;
    try {
      if (!config.enabled) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Authentication is not enabled");
      const url = requestURL(request, config.baseURL), path = url.pathname.slice("/api/auth".length);
      if (url.origin!==config.baseURL || !url.pathname.startsWith("/api/auth/")) throw new AuthFailure("INVALID_INPUT", 400, "Invalid auth origin");
      const network = config.trustedIPHeader ? request.headers.get(config.trustedIPHeader) : "unattributed";
      if (config.trustedIPHeader && (!network || !isIP(network))) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Trusted proxy identity is unavailable");
      if (request.method==="GET" && path==="/get-session") {
        await consumeAuthBudget(database, config.secret, "http:"+path, network ?? "unattributed", 100, 60);
        const identity = await getSessionIdentity(runtime, request.headers);
        return json({ user: identity ? { id: identity.id, name: identity.name } : null, staff: !!identity?.staff, mfaEnrolled: !!identity?.mfa_enrolled, mfaRequired: !!identity?.staff && !identity.mfa_at && staffMfaRequired(), mfaRestartRequired: !!identity?.staff && identity.mfa_enrolled && !identity.mfa_at && staffMfaRequired() });
      }
      if (request.method!=="POST" || !(path in bodies)) return json({ error: { code: "NOT_FOUND", message: "Auth operation is unavailable" } }, 404);
      if (request.headers.get("origin")!==config.baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid auth origin");
      if (request.headers.get("content-type")?.split(";")[0].trim()!=="application/json") throw new AuthFailure("INVALID_INPUT", 400, "JSON input is required");
      await consumeAuthBudget(database, config.secret, "http:"+path, network ?? "unattributed", 40, 60);
      const raw = await boundedJSON(request);
      const parsed = bodies[path as keyof typeof bodies].safeParse(raw);
      if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400, "Invalid authentication input");
      if (path==="/sign-in/email") {
        const details = bodies["/sign-in/email"].parse(parsed.data);
        await consumeAuthBudget(database, config.secret, "staff-password", details.email, 10, 300);
      }
      let passwordOwner: string | undefined;
      if (path==="/change-password") {
        // Customers sign in by phone proof and own no password; never report a fake success.
        const identity = await getSessionIdentity(runtime, request.headers);
        if (!identity) throw new AuthFailure("UNAUTHENTICATED", 401, "Sign in is required");
        if (!identity.staff) throw new AuthFailure("FORBIDDEN", 403, "This account signs in with a verified phone; use phone verification instead");
        if (!identity.mfa_at && staffMfaRequired()) throw new AuthFailure("FORBIDDEN", 403, "Staff MFA verification is required");
        await consumeAuthBudget(database, config.secret, "password-change", identity.id, 5, 900);
        passwordOwner = identity.id;
      }
      const verifiesMfa = ["/two-factor/verify-totp", "/two-factor/verify-backup-code"].includes(path);
      if (path.startsWith("/two-factor/") || path==="/sign-out") {
        // Staff-only low-volume verification is serialized across instances to
        // prevent simultaneous backup-code consumption through separate challenges.
        gate = await database.pool.connect();
        locked = !!(await gate.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('grmn-staff-mfa')) AS locked")).rows[0].locked;
        if (!locked) throw new AuthFailure("RATE_LIMITED", 429, "MFA verification is busy; retry", 1);
        if (path==="/sign-out") return json({ success: true }, 200, await revokeBrowserAuthentication(auth, gate, config, request.headers));
        const identity = await getSessionIdentity(runtime, request.headers);
        previousAdmission = !!identity?.mfa_at;
        if (identity) {
          if (!identity.staff) throw new AuthFailure("FORBIDDEN", 403, "Staff sign-in is required");
          if (identity.mfa_enrolled && !identity.mfa_at) throw new AuthFailure("MFA_RESTART_REQUIRED", 409, "This enrolled session has no MFA admission. Sign out and restart password sign-in.");
          await consumeAuthBudget(database, config.secret, "mfa-account", identity.id, 5, 300);
        }
        if (path==="/two-factor/enable" && (!identity?.staff || (identity.mfa_enrolled && (!identity.mfa_at || Date.now()-identity.mfa_at.getTime()>900000)))) {
          throw new AuthFailure("FORBIDDEN", 403, "Staff sign-in and fresh MFA are required");
        }
      }
      const forwardedHeaders = new Headers(request.headers);
      forwardedHeaders.delete("content-length");
      const forwarded = new Request(request.url, { method: "POST", headers: forwardedHeaders, body: JSON.stringify(parsed.data) });
      const response = await auth.handler(forwarded);
      if (!response.ok) {
        const safeStatus = response.status>=400 && response.status<500 ? response.status : 503;
        const payload: unknown = await response.json().catch(() => null);
        const code = payload && typeof payload==="object" && "code" in payload ? payload.code : null;
        const messages: Record<string, string> = { INVALID_INPUT: "Invalid authentication input", VERSION_CONFLICT: "Identity details already exist; sign in or use recovery", RATE_LIMITED: "Too many authentication requests", DEPENDENCY_UNAVAILABLE: "Authentication is unavailable", FORBIDDEN: "Authentication could not be completed", UNAUTHENTICATED: "Authentication could not be completed" };
        const errorCode = path==="/sign-in/email" && safeStatus!==429 && safeStatus!==503 ? "UNAUTHENTICATED" : typeof code==="string" && code in messages ? code : safeStatus===429 ? "RATE_LIMITED" : safeStatus===503 ? "DEPENDENCY_UNAVAILABLE" : safeStatus===400 ? "INVALID_INPUT" : "UNAUTHENTICATED";
        const status = path==="/sign-in/email" && safeStatus!==429 && safeStatus!==503 ? 401 : safeStatus;
        const errorResponse = json({ error: { code: errorCode, message: messages[errorCode] } }, status, response.headers);
        const retry = response.headers.get("retry-after") ?? response.headers.get("x-retry-after");
        if (status===429) errorResponse.headers.set("Retry-After", retry ?? "60");
        return errorResponse;
      }
      const result: unknown = await response.json();
      const data = result && typeof result==="object" ? result as Record<string, unknown> : {};
      if (verifiesMfa) {
        admissionHeaders = response.headers;
        // Enrollment may rotate the session but return the old JSON token.
        // Verify the signed cookie the browser will actually receive instead.
        const identity = await getSessionIdentity(runtime, responseSessionHeaders(request, response));
        const returnedUser = data.user && typeof data.user==="object" && "id" in data.user ? data.user.id : null;
        if (!identity?.staff || !identity.mfa_enrolled || identity.id!==returnedUser || !gate) throw new AuthFailure("UNAUTHENTICATED", 401, "Staff MFA session is unavailable");
        const method = path.endsWith("totp") ? "totp" : "backup_code";
        try {
          await gate.query("BEGIN");
          await gate.query("INSERT INTO staff_session_grants(session_id,user_id,method) VALUES($1,$2,$3) ON CONFLICT(session_id) DO UPDATE SET method=EXCLUDED.method,verified_at=clock_timestamp()", [identity.sessionId, identity.id, method]);
          await gate.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key) VALUES($1,$2,'staff.mfa_verified','session',$3,$4)", [randomUUID(), identity.id, identity.sessionId, authDigest(config.secret, randomUUID())]);
          await gate.query("COMMIT");
        } catch {
          await gate.query("ROLLBACK").catch(() => {});
          throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "MFA admission is unavailable");
        }
      }
      if (passwordOwner) {
        // The credential already changed; a failed audit write must not hide that, so report it as a 503 the caller can see.
        try { await database.pool.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key) VALUES($1,$2,'auth.password_changed','user',$2,$3)", [randomUUID(), passwordOwner, `password-changed:${randomUUID()}`]); }
        catch { return json({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "Password changed, but the audit record failed; contact an administrator" } }, 503, response.headers); }
        return json({ success: true, mfaRequired: true }, 200, response.headers);
      }
      if (path==="/two-factor/enable") return json({ totpURI: data.totpURI, backupCodes: data.backupCodes }, 200, response.headers);
      if (path.startsWith("/grmn/")) return json(data, 200, response.headers);
      return json({ success: true, mfaRequired: data.twoFactorRedirect===true }, 200, response.headers);
    } catch (error) {
      // Library proof consumption/session rotation commits separately. Preserve
      // the signed cookie so sign-out can revoke that actual session, but never
      // treat it as admission. A consumed backup code cannot be retried.
      if (admissionHeaders) return json({ error: { code: previousAdmission ? "MFA_STEP_UP_RETRY" : "MFA_ADMISSION_RETRY", message: previousAdmission ? "Fresh MFA admission failed. The previous admission is unchanged and was not refreshed." : "MFA admission failed. This session cannot retry proof; sign out and restart password sign-in with an authenticator or different backup code." } }, 503, admissionHeaders);
      return authErrorResponse(error);
    }
    finally {
      if (gate) {
        try { await gate.query("SELECT pg_advisory_unlock(hashtext('grmn-staff-mfa'))"); }
        catch { gate.release(true); gate = undefined; }
        finally { gate?.release(); }
      }
    }
  } };
}
