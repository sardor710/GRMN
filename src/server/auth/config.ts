import "server-only";

export interface AuthConfig {
  enabled: boolean;
  baseURL: string;
  secret: string;
  secureCookies: boolean;
  trustedIPHeader: "x-grmn-client-ip" | null;
}
export class AuthFailure extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;
  constructor(code: string, status: number, message: string, retryAfter?: number) {
    super(message); this.code = code; this.status = status; this.retryAfter = retryAfter;
  }
}
export function parseAuthConfig(source: Readonly<Record<string, string | undefined>>): AuthConfig {
  const invalid = (field: string): never => { throw new Error(`Missing or invalid auth configuration: ${field}`); };
  for (const field of ["NEXT_PUBLIC_AUTH_SECRET", "NEXT_PUBLIC_BETTER_AUTH_SECRET"]) if (source[field] !== undefined) invalid(field);
  const enabled = source.AUTH_ENABLED === "1";
  if (source.AUTH_ENABLED !== undefined && !["0", "1"].includes(source.AUTH_ENABLED)) invalid("AUTH_ENABLED");
  const secret = source.AUTH_SECRET ?? "";
  if (!/^[a-f0-9]{64}$/i.test(secret) || new Set(secret.toLowerCase()).size<8) invalid("AUTH_SECRET");
  let url: URL;
  try { url = new URL(source.AUTH_BASE_URL ?? ""); } catch { return invalid("AUTH_BASE_URL"); }
  const local = source.NODE_ENV!=="production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol!=="https:") || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname!=="/" || url.search || url.hash) invalid("AUTH_BASE_URL");
  if (source.AUTH_TRUSTED_IP_HEADER !== undefined && source.AUTH_TRUSTED_IP_HEADER!=="x-grmn-client-ip") invalid("AUTH_TRUSTED_IP_HEADER");
  if (source.NODE_ENV==="production" && !source.AUTH_TRUSTED_IP_HEADER) invalid("AUTH_TRUSTED_IP_HEADER");
  return { enabled, baseURL: url.origin, secret, secureCookies: url.protocol==="https:", trustedIPHeader: source.AUTH_TRUSTED_IP_HEADER ? "x-grmn-client-ip" : null };
}
