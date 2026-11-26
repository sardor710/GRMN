import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { testOtpCodeFromEnv } from "../../src/server/auth/test-otp.ts";

test("AUTH_TEST_OTP_CODE is off when unset or empty", () => {
  assert.equal(testOtpCodeFromEnv({}), undefined);
  assert.equal(testOtpCodeFromEnv({ AUTH_TEST_OTP_CODE: "" }), undefined);
});

test("AUTH_TEST_OTP_CODE accepts 4-6 digits, also in production (owner 2026-11-26: site not public yet)", () => {
  assert.equal(testOtpCodeFromEnv({ AUTH_TEST_OTP_CODE: "1234", NODE_ENV: "production" }), "1234");
  assert.equal(testOtpCodeFromEnv({ AUTH_TEST_OTP_CODE: "123456" }), "123456");
});

test("an invalid AUTH_TEST_OTP_CODE fails closed", () => {
  for (const value of ["123", "1234567", "12a4", " 1234", "true"]) assert.throws(() => testOtpCodeFromEnv({ AUTH_TEST_OTP_CODE: value }), /AUTH_TEST_OTP_CODE/);
});

test("the runtime and compose pass the test code through", () => {
  assert.match(readFileSync(new URL("../../src/server/auth/runtime.ts", import.meta.url), "utf8"), /testCode: testOtpCodeFromEnv\(process\.env\)/);
  assert.match(readFileSync(new URL("../../deploy/compose.yml", import.meta.url), "utf8"), /AUTH_TEST_OTP_CODE: \$\{AUTH_TEST_OTP_CODE:-\}/);
});
