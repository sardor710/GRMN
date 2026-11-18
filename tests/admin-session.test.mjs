import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  resolveSessionSecret,
  signSessionToken,
  verifySessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "../src/lib/cms/session-token.js";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const claims = { sub: "admin-1", email: "admin@garmin.com" };

test("a valid token is accepted and carries its claims", () => {
  const token = signSessionToken(claims, SECRET, { now: NOW });
  const payload = verifySessionToken(token, SECRET, { now: NOW + 1000 });
  assert.ok(payload);
  assert.equal(payload.sub, "admin-1");
  assert.equal(payload.email, "admin@garmin.com");
  assert.equal(payload.exp - payload.iat, SESSION_MAX_AGE_SECONDS);
});

test("the old unsigned base64 JSON cookie is rejected", () => {
  for (const json of ['{"email":"admin"}', '{"email":"admin@garmin.com","id":"admin-1","role":"super_admin"}']) {
    assert.equal(verifySessionToken(Buffer.from(json).toString("base64"), SECRET, { now: NOW }), null);
  }
});

test("a token with a tampered payload is rejected", () => {
  const token = signSessionToken(claims, SECRET, { now: NOW });
  const [, sig] = token.split(".");
  const forgedBody = Buffer.from(
    JSON.stringify({ v: 1, sub: "admin-2", email: "other@garmin.com", iat: NOW / 1000, exp: NOW / 1000 + 999999 }),
  ).toString("base64url");
  assert.equal(verifySessionToken(`${forgedBody}.${sig}`, SECRET, { now: NOW }), null);
});

test("a token with a tampered or missing signature is rejected", () => {
  const token = signSessionToken(claims, SECRET, { now: NOW });
  const [body, sig] = token.split(".");
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(verifySessionToken(`${body}.${flipped}`, SECRET, { now: NOW }), null);
  assert.equal(verifySessionToken(`${body}.`, SECRET, { now: NOW }), null);
  assert.equal(verifySessionToken(body, SECRET, { now: NOW }), null);
  assert.equal(verifySessionToken(`${body}.${sig}.x`, SECRET, { now: NOW }), null);
});

test("a token signed with another secret is rejected", () => {
  const token = signSessionToken(claims, "another-secret-0123456789abcdef0123456789", { now: NOW });
  assert.equal(verifySessionToken(token, SECRET, { now: NOW }), null);
});

test("an expired token is rejected", () => {
  const token = signSessionToken(claims, SECRET, { now: NOW, maxAgeSeconds: 60 });
  assert.ok(verifySessionToken(token, SECRET, { now: NOW + 59_000 }));
  assert.equal(verifySessionToken(token, SECRET, { now: NOW + 60_000 }), null);
  assert.equal(verifySessionToken(token, SECRET, { now: NOW + SESSION_MAX_AGE_SECONDS * 1000 }), null);
});

test("a correctly signed payload missing required claims is rejected", () => {
  const body = Buffer.from(JSON.stringify({ email: "admin@garmin.com" })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  assert.equal(verifySessionToken(`${body}.${sig}`, SECRET, { now: NOW }), null);
});

test("garbage input is rejected without throwing", () => {
  for (const value of [undefined, null, "", ".", "a.b", "%%%.%%%", "x".repeat(5000)]) {
    assert.equal(verifySessionToken(value, SECRET, { now: NOW }), null);
  }
  assert.equal(verifySessionToken(signSessionToken(claims, SECRET), ""), null);
});

test("secret resolution: env secret, dev fallback, random in production", () => {
  const strong = "s".repeat(40);
  assert.deepEqual(resolveSessionSecret({ ADMIN_SESSION_SECRET: strong, NODE_ENV: "production" }), {
    secret: strong,
    warning: null,
  });

  const dev = resolveSessionSecret({ NODE_ENV: "development" });
  assert.ok(dev.secret.length >= 32);
  assert.match(dev.warning, /ADMIN_SESSION_SECRET/);

  const prodA = resolveSessionSecret({ NODE_ENV: "production" });
  const prodB = resolveSessionSecret({ NODE_ENV: "production", ADMIN_SESSION_SECRET: "short" });
  assert.notEqual(prodA.secret, dev.secret);
  assert.notEqual(prodA.secret, prodB.secret);
  assert.match(prodB.warning, /shorter than/);
});
