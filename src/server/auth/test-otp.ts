import "server-only";

// Owner 2026-11-26: until an SMS provider exists, AUTH_TEST_OTP_CODE (4-6 digits, e.g. 1234) makes every phone
// challenge use that fixed code instead of a delivered random one, and enables direct customer signup without
// phone proof. Allowed in production on purpose (the site is not public yet). Unset it once SMS is live.

export const TEST_OTP_FLAG = "AUTH_TEST_OTP_CODE";

export function testOtpCodeFromEnv(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const value = env[TEST_OTP_FLAG];
  if (value === undefined || value === "") return undefined;
  if (!/^[0-9]{4,6}$/.test(value)) throw new Error(`Missing or invalid auth configuration: ${TEST_OTP_FLAG}`);
  return value;
}
