import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDevConsolePhoneSender, devPhoneSenderFromEnv } from "../../src/server/auth/dev-phone-sender.ts";

test("the dev console sender prints exactly the phone and code with a [dev-otp] prefix", async () => {
  const lines = [];
  await createDevConsolePhoneSender(line => lines.push(line))({ phoneNumber: "+77010000000", code: "012345", purpose: "sign_in" });
  assert.deepEqual(lines, ["[dev-otp] +77010000000 012345"]);
});

test("the sender is enabled only by AUTH_DEV_OTP_CONSOLE=1 outside production", async () => {
  assert.equal(devPhoneSenderFromEnv({}), undefined);
  assert.equal(devPhoneSenderFromEnv({ AUTH_DEV_OTP_CONSOLE: "0", NODE_ENV: "development" }), undefined);
  assert.equal(devPhoneSenderFromEnv({ AUTH_DEV_OTP_CONSOLE: "", NODE_ENV: "production" }), undefined);
  const lines = [];
  const sender = devPhoneSenderFromEnv({ AUTH_DEV_OTP_CONSOLE: "1", NODE_ENV: "development" }, line => lines.push(line));
  assert.equal(typeof sender, "function");
  await sender({ phoneNumber: "+77011112233", code: "654321", purpose: "order_claim" });
  assert.deepEqual(lines, ["[dev-otp] +77011112233 654321"]);
  assert.equal(typeof devPhoneSenderFromEnv({ AUTH_DEV_OTP_CONSOLE: "1", NODE_ENV: "test" }), "function");
});

test("enabling the dev sender in production or with an unexpected value fails closed", () => {
  assert.throws(() => devPhoneSenderFromEnv({ AUTH_DEV_OTP_CONSOLE: "1", NODE_ENV: "production" }), /must not be enabled in production/);
  assert.throws(() => devPhoneSenderFromEnv({ AUTH_DEV_OTP_CONSOLE: "true", NODE_ENV: "development" }), /AUTH_DEV_OTP_CONSOLE/);
});

test("the auth runtime wires the sender only through the env gate", () => {
  const runtime = readFileSync(new URL("../../src/server/auth/runtime.ts", import.meta.url), "utf8");
  assert.match(runtime, /phoneSender: devPhoneSenderFromEnv\(process\.env\)/);
});
