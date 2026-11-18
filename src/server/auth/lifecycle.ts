import "server-only";
import { createHash } from "node:crypto";
import { createInternalContext, parseCookies } from "better-call";
import type { PoolClient } from "pg";
import type { AuthInstance } from "./factory.ts";
import type { AuthConfig } from "./config.ts";

/** Pinned DB-only library mapping: revoke before expiring any retry cookie.
 * Unlike library sign-out this does not swallow database deletion failures.
 * Caller holds the same advisory lock as MFA consumption, across app instances.
 */
export async function revokeBrowserAuthentication(auth: AuthInstance, client: PoolClient, config: AuthConfig, headers: Headers) {
  const context=await auth.$context;
  const cookies = parseCookies(headers.get("cookie") ?? "");
  const cookieContext = await createInternalContext({ headers }, { options: { method: "POST" }, path: "/sign-out" });
  const signedCookie = async (name: string) => {
    const decoded = cookies.get(name);
    if (!decoded || name.length + 1 + decoded.length > 2048) return null;
    // Share both parsing and byte-level HMAC verification with the handler.
    // Valid Base64 signatures can have more than one textual representation.
    return await cookieContext.getSignedCookie(name, config.secret) || null;
  };
  const challengeCookie=context.createAuthCookie("two_factor");
  const token=await signedCookie(context.authCookies.sessionToken.name);
  const challenge=await signedCookie(challengeCookie.name);
  const identifiers=challenge ? [challenge,"2fa-attempts-"+challenge].flatMap(value=>[value,createHash("sha256").update(value).digest("base64url")]) : [];
  try {
    await client.query("BEGIN");
    if(token) {
      await client.query("DELETE FROM auth_sessions WHERE token=$1",[token]);
      if((await client.query("SELECT 1 FROM auth_sessions WHERE token=$1",[token])).rowCount)throw new Error("Session revocation was not confirmed");
    }
    if(identifiers.length) {
      await client.query("DELETE FROM auth_verifications WHERE identifier=ANY($1::text[])",[identifiers]);
      if((await client.query("SELECT 1 FROM auth_verifications WHERE identifier=ANY($1::text[])",[identifiers])).rowCount)throw new Error("Challenge cancellation was not confirmed");
    }
    await client.query("COMMIT");
  } catch(error) {await client.query("ROLLBACK").catch(()=>{});throw error;}
  const names=new Set([context.authCookies.sessionToken.name,context.authCookies.sessionData.name,context.authCookies.dontRememberToken.name,challengeCookie.name]);
  for(const name of cookies.keys()) {
    if(name.startsWith(context.authCookies.sessionData.name+"."))names.add(name);
  }
  const result=new Headers();
  for(const name of names)result.append("Set-Cookie",name+"=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"+(config.secureCookies?"; Secure":""));
  return result;
}
