import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { expireCookie, setSessionCookie } from "better-auth/cookies";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { z } from "zod";
import type { DatabaseHandle } from "../db/client.ts";
import { authTables } from "../db/auth-tables.ts";
import { AuthFailure } from "./config.ts";
import type { AuthConfig } from "./config.ts";
import { createPhoneService, OTP_PATTERN, PHONE_PURPOSES } from "./phone-service.ts";
import type { PhoneSender } from "./phone-service.ts";
import { completeProfileInput, phoneInput } from "./validation.ts";

async function endpointResult<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof AuthFailure) {
      const status = error.status===400 ? "BAD_REQUEST" : error.status===401 ? "UNAUTHORIZED" : error.status===403 ? "FORBIDDEN" : error.status===409 ? "CONFLICT" : error.status===429 ? "TOO_MANY_REQUESTS" : "SERVICE_UNAVAILABLE";
      const failure = new APIError(status, { code: error.code, message: error.message });
      if (error.retryAfter) failure.headers = new Headers({ "Retry-After": String(error.retryAfter) });
      throw failure;
    }
    throw new APIError("SERVICE_UNAVAILABLE", { code: "DEPENDENCY_UNAVAILABLE", message: "Authentication is unavailable" });
  }
}
export function buildAuth(input: { database: DatabaseHandle; config: AuthConfig; phoneSender?: PhoneSender; testCode?: string }) {
  const { database, config } = input;
  if ((database.pool.options.max ?? 0)<2) throw new Error("Auth database pool requires at least two connections");
  const phones = createPhoneService({ database, secret: config.secret, send: input.phoneSender, testCode: input.testCode });
  const completionCookie = { path: "/api/auth/grmn/phone/complete", maxAge: 600 };
  return betterAuth({
    appName: "Garmin KZ", baseURL: config.baseURL, basePath: "/api/auth", secret: config.secret,
    database: drizzleAdapter(database.db, { provider: "pg", schema: authTables, transaction: true }),
    trustedOrigins: [config.baseURL], logger: { disabled: true },
    advanced: {
      database: { generateId: "uuid" }, cookiePrefix: "grmn-auth", useSecureCookies: config.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: config.secureCookies },
      ipAddress: { ipAddressHeaders: config.trustedIPHeader ? [config.trustedIPHeader] : [] },
    },
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 16, maxPasswordLength: 128, requireEmailVerification: false },
    session: { expiresIn: 28800, updateAge: 900, cookieCache: { enabled: false }, freshAge: 900 },
    user: { additionalFields: { status: { type: ["active", "suspended", "disabled"], required: true, defaultValue: "active", input: false } } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60, customRules: { "/sign-in/email": { window: 60, max: 10 }, "/two-factor/*": { window: 60, max: 10 } } },
    verification: { storeIdentifier: "hashed" },
    databaseHooks: {
      user: { create: { before: async () => false } },
      session: { create: { before: async (session, context) => {
        const result = await database.pool.query<{ status: string; staff: boolean }>("SELECT status,EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id) AS staff FROM users u WHERE id=$1", [session.userId]);
        const current = result.rows[0];
        if (!current || current.status!=="active" || (current.staff && context?.path?.startsWith("/grmn/")) || (context?.path==="/sign-in/email" && !current.staff)) return false;
      } } },
    },
    plugins: [
      phoneNumber({ sendOTP: async () => { throw new Error("Use the application phone challenge service"); }, verifyOTP: async () => false, requireVerification: true, phoneNumberValidator: phone => phoneInput.safeParse(phone).success }),
      twoFactor({ issuer: "Garmin KZ", twoFactorCookieMaxAge: 300, skipVerificationOnEnable: false, backupCodeOptions: { storeBackupCodes: "encrypted" }, accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 } }),
      {
        id: "grmn-phone-flow",
        endpoints: {
          requestPhoneProof: createAuthEndpoint("/grmn/phone/send", { method: "POST", body: z.object({ phoneNumber: phoneInput, purpose: z.enum(PHONE_PURPOSES).default("sign_in") }).strict() }, ctx => endpointResult(async () => ctx.json(await phones.request(ctx.body.phoneNumber, ctx.body.purpose)))),
          verifyPhoneProof: createAuthEndpoint("/grmn/phone/verify", { method: "POST", body: z.object({ challengeId: z.uuid(), phoneNumber: phoneInput, code: z.string().regex(OTP_PATTERN) }).strict() }, ctx => endpointResult(async () => {
            const proof = await phones.consume(ctx.body.challengeId, ctx.body.phoneNumber, ctx.body.code);
            const found = await database.pool.query<{ id: string; status: string; staff: boolean; two_factor_enabled: boolean }>("SELECT id,status,two_factor_enabled,EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id) AS staff FROM users u WHERE phone_number=$1 AND phone_number_verified", [proof.phoneNumber]);
            const current = found.rows[0];
            if (!current) {
              const token = await phones.issueCompletion(proof), cookie = ctx.context.createAuthCookie("profile_completion", completionCookie);
              await ctx.setSignedCookie(cookie.name, token, ctx.context.secret, cookie.attributes);
              return ctx.json({ state: "complete_profile" });
            }
            if (current.status!=="active" || current.staff || current.two_factor_enabled) throw new AuthFailure("FORBIDDEN", 403, "This account requires its separate sign-in flow");
            const user = await ctx.context.internalAdapter.findUserById(current.id), session = await ctx.context.internalAdapter.createSession(current.id);
            if (!user || !session) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Authentication is unavailable");
            // A phone change may have committed (and revoked sessions) between the lookup and this
            // insert. Re-check after the session exists: either the change's session delete or this
            // check removes it, so the old number never keeps a session on the moved account.
            const still = await database.pool.query("SELECT 1 FROM users WHERE id=$1 AND phone_number=$2 AND phone_number_verified AND status='active'", [current.id, proof.phoneNumber]);
            if (!still.rowCount) {
              await database.pool.query("DELETE FROM auth_sessions WHERE id=$1", [session.id]);
              throw new AuthFailure("UNAUTHENTICATED", 401, "Invalid or expired verification");
            }
            await setSessionCookie(ctx, { user, session });
            return ctx.json({ state: "authenticated" });
          })),
          signUpUnverified: createAuthEndpoint("/grmn/signup", { method: "POST", body: completeProfileInput }, ctx => endpointResult(async () => {
            const userId = await phones.signUpUnverified(ctx.body), user = await ctx.context.internalAdapter.findUserById(userId), session = await ctx.context.internalAdapter.createSession(userId);
            if (!user || !session) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Authentication is unavailable");
            await setSessionCookie(ctx, { user, session });
            return ctx.json({ state: "authenticated" });
          })),
          completePhoneProfile: createAuthEndpoint("/grmn/phone/complete", { method: "POST", body: completeProfileInput }, ctx => endpointResult(async () => {
            const cookie = ctx.context.createAuthCookie("profile_completion", completionCookie), token = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
            if (!token) throw new AuthFailure("UNAUTHENTICATED", 401, "Verified phone completion is required");
            const userId = await phones.complete(token, ctx.body), user = await ctx.context.internalAdapter.findUserById(userId), session = await ctx.context.internalAdapter.createSession(userId);
            if (!user || !session) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Authentication is unavailable");
            await setSessionCookie(ctx, { user, session });
            expireCookie(ctx, cookie);
            return ctx.json({ state: "authenticated" });
          })),
        },
      },
    ],
  });
}
export type AuthInstance = ReturnType<typeof buildAuth>;
