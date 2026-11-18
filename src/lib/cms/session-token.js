// Signed admin session tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
// Plain JS so `node --test` can import it directly; `session-token.ts` wraps it with types.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_TOKEN_VERSION = 1;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MIN_SECRET_LENGTH = 32;
const DEV_FALLBACK_SECRET = "garmin-dev-only-admin-session-secret-do-not-use-in-prod";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function hmac(data, secret) {
  return createHmac("sha256", secret).update(data).digest();
}

/**
 * Resolve the signing secret from env. Never returns a guessable secret in production:
 * without ADMIN_SESSION_SECRET there, a random per-process secret is used (sessions end on restart).
 * Returns { secret, warning } so the caller decides how to log.
 */
export function resolveSessionSecret(env = process.env) {
  const configured = env.ADMIN_SESSION_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) {
    return { secret: configured, warning: null };
  }
  const tooShort = configured
    ? `ADMIN_SESSION_SECRET is shorter than ${MIN_SECRET_LENGTH} characters and was ignored.`
    : "ADMIN_SESSION_SECRET is not set.";
  if (env.NODE_ENV === "production") {
    return {
      secret: randomBytes(48).toString("hex"),
      warning: `${tooShort} Using a random per-process secret: admin sessions will not survive a restart. Set ADMIN_SESSION_SECRET (e.g. \`openssl rand -hex 32\`).`,
    };
  }
  return {
    secret: DEV_FALLBACK_SECRET,
    warning: `${tooShort} Using an insecure development fallback secret.`,
  };
}

/** Issue a signed token for { sub, email }. `now` is in milliseconds. */
export function signSessionToken(claims, secret, { now = Date.now(), maxAgeSeconds = SESSION_MAX_AGE_SECONDS } = {}) {
  if (!secret) throw new Error("signSessionToken: secret is required");
  if (!claims || typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new Error("signSessionToken: claims.sub and claims.email are required strings");
  }
  const iat = Math.floor(now / 1000);
  const payload = {
    v: SESSION_TOKEN_VERSION,
    sub: claims.sub,
    email: claims.email,
    iat,
    exp: iat + maxAgeSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(hmac(body, secret))}`;
}

/**
 * Verify a token. Returns the payload, or null when it is malformed, unsigned,
 * signed with another secret, tampered with, or expired.
 */
export function verifySessionToken(token, secret, { now = Date.now() } = {}) {
  if (!secret || typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sig] = parts;

  const expected = hmac(body, secret);
  let given;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (
    !payload ||
    payload.v !== SESSION_TOKEN_VERSION ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp)
  ) {
    return null;
  }
  if (Math.floor(now / 1000) >= payload.exp) return null;
  return payload;
}
