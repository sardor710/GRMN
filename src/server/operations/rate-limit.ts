import "server-only";
import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { Pool } from "pg";
import { AuthFailure } from "../auth/config.ts";

// Task 21A. Fixed-window rate limits kept in PostgreSQL (rate_limit_buckets), so every application
// instance draws on one shared budget: one atomic upsert per check, on the database clock.
// - Identity (review C1/C2): the client address from the trusted proxy header only, the same
//   convention as the auth layer (AUTH_TRUSTED_IP_HEADER=x-grmn-client-ip, which the TLS proxy sets
//   and overwrites; required in production). Cookies and client-supplied forwarding headers are never used: a client
//   can rotate or forge them. A missing or invalid trusted header is 503, as in auth. Without a
//   configured trusted proxy (development) there is no per-client identity, and callers skip the
//   limit instead of sharing one global bucket.
// - Keys are HMAC-SHA-256 of scope and address with the auth secret, so no raw address is stored.
// - Redis is not needed at the planned rates (plan Section 8: add it only when measured counters
//   exceed what the database handles economically).

export interface RateLimitRule { scope: string; identifier: string; limit: number; windowMs: number }
export interface RateLimitResult { allowed: boolean; remaining: number; retryAfterSeconds: number }

/** The trusted client address, null when no trusted proxy is configured, 503 when it is configured but missing. */
export function trustedClientAddress(headers: Headers, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (env.AUTH_TRUSTED_IP_HEADER !== "x-grmn-client-ip") return null;
  const value = headers.get("x-grmn-client-ip")?.trim() ?? "";
  if (!isIP(value)) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Trusted proxy identity is unavailable");
  return value;
}

export function bucketKey(scope: string, identifier: string, secret?: string): string {
  const material = `rate:v1:${scope}:${identifier}`;
  return secret ? createHmac("sha256", secret).update(material).digest("hex") : createHash("sha256").update(material).digest("hex");
}

/** Counts one hit against the rule's current window and says whether it is within the limit. */
export async function consumeRateLimit(pool: Pick<Pool, "query">, rule: RateLimitRule, secret?: string): Promise<RateLimitResult> {
  if (!Number.isInteger(rule.limit) || rule.limit < 1 || !Number.isInteger(rule.windowMs) || rule.windowMs < 1000 || rule.windowMs > 86_400_000) throw new Error("Invalid rate limit rule");
  const row = (await pool.query<{ hits: number; retry_ms: string }>(
    `WITH w AS (SELECT to_timestamp(floor(extract(epoch FROM clock_timestamp())*1000/$2)*$2/1000.0) AS start)
     INSERT INTO rate_limit_buckets(bucket_key,window_start,hits) SELECT $1,w.start,1 FROM w
     ON CONFLICT (bucket_key,window_start) DO UPDATE SET hits=rate_limit_buckets.hits+1
     RETURNING hits,ceil(extract(epoch FROM (window_start+($2::bigint*interval '1 millisecond'))-clock_timestamp())*1000)::text AS retry_ms`,
    [bucketKey(rule.scope, rule.identifier, secret), rule.windowMs])).rows[0];
  const retryAfterSeconds = Math.max(1, Math.ceil(Number(row.retry_ms) / 1000));
  return { allowed: row.hits <= rule.limit, remaining: Math.max(rule.limit - row.hits, 0), retryAfterSeconds };
}

/** Throws 429 RATE_LIMITED with Retry-After when the rule's window is used up. */
export async function enforceRateLimit(pool: Pick<Pool, "query">, rule: RateLimitRule, secret?: string): Promise<void> {
  const result = await consumeRateLimit(pool, rule, secret);
  if (!result.allowed) throw new AuthFailure("RATE_LIMITED", 429, "Too many requests; try again shortly", result.retryAfterSeconds);
}

/** Worker: deletes windows that started more than olderThanMs ago (default one hour past the longest window used). */
export async function pruneRateLimits(pool: Pick<Pool, "query">, options: { olderThanMs?: number } = {}): Promise<{ deleted: number }> {
  const result = await pool.query("DELETE FROM rate_limit_buckets WHERE window_start<clock_timestamp()-($1::bigint*interval '1 millisecond')", [options.olderThanMs ?? 2 * 60 * 60 * 1000]);
  return { deleted: result.rowCount ?? 0 };
}
