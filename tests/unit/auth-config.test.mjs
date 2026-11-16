import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { parseAuthConfig } from "../../src/server/auth/config.ts";
import { handleRuntimeAuth } from "../../src/server/auth/runtime.ts";

test("auth config requires explicit secret/origin and does not disclose input values", () => {
  const secret = randomBytes(32).toString("hex");
  const valid = { AUTH_ENABLED: "1", AUTH_SECRET: secret, AUTH_BASE_URL: "http://localhost:3000", NODE_ENV: "test" };
  assert.equal(parseAuthConfig(valid).secureCookies, false);
  assert.throws(() => parseAuthConfig({ ...valid, AUTH_BASE_URL: "http://untrusted.invalid" }), /AUTH_BASE_URL/);
  assert.throws(() => parseAuthConfig({ ...valid, AUTH_BASE_URL: "https://example.invalid/path" }), /AUTH_BASE_URL/);
  assert.throws(() => parseAuthConfig({ ...valid, AUTH_SECRET: "sensitive-invalid-value" }), e => e.message.includes("AUTH_SECRET") && !e.message.includes("sensitive-invalid-value"));
  assert.throws(() => parseAuthConfig({ ...valid, NEXT_PUBLIC_AUTH_SECRET: secret }), /NEXT_PUBLIC_AUTH_SECRET/);
  assert.throws(() => parseAuthConfig({ ...valid, NODE_ENV: "production", AUTH_BASE_URL: "https://example.invalid" }), /AUTH_TRUSTED_IP_HEADER/);
  assert.equal(parseAuthConfig({ ...valid, NODE_ENV: "production", AUTH_BASE_URL: "https://example.invalid", AUTH_TRUSTED_IP_HEADER: "x-grmn-client-ip" }).secureCookies, true);
});
test("runtime auth stays unavailable without explicit activation and does not need DB configuration", async () => {
  const previous = process.env.AUTH_ENABLED;
  try {
    process.env.AUTH_ENABLED = "0";
    const response = await handleRuntimeAuth(new Request("http://localhost:3000/api/auth/get-session"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(JSON.stringify(await response.json()).includes("DATABASE_URL"), false);
  } finally { if (previous===undefined) delete process.env.AUTH_ENABLED; else process.env.AUTH_ENABLED=previous; }
});
