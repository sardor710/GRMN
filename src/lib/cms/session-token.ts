import * as js from "./session-token.js";

export interface SessionPayload {
  v: number;
  /** Admin id */
  sub: string;
  email: string;
  /** Issued at, seconds since epoch */
  iat: number;
  /** Expires at, seconds since epoch */
  exp: number;
}

export const SESSION_MAX_AGE_SECONDS: number = js.SESSION_MAX_AGE_SECONDS;

export function resolveSessionSecret(env: Record<string, string | undefined> = process.env): {
  secret: string;
  warning: string | null;
} {
  return js.resolveSessionSecret(env);
}

export function signSessionToken(
  claims: { sub: string; email: string },
  secret: string,
  options?: { now?: number; maxAgeSeconds?: number },
): string {
  return js.signSessionToken(claims, secret, options);
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  options?: { now?: number },
): SessionPayload | null {
  return js.verifySessionToken(token, secret, options) as SessionPayload | null;
}
