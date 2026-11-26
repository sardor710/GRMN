import "server-only";
import { getDatabase } from "../db/client.ts";
import { parseAuthConfig, AuthFailure } from "./config.ts";
import { createAuthFoundation, authErrorResponse } from "./http.ts";
import { devPhoneSenderFromEnv } from "./dev-phone-sender.ts";
import { testOtpCodeFromEnv } from "./test-otp.ts";

let foundation: ReturnType<typeof createAuthFoundation> | undefined;
export function getAuthRuntime() {
  if (process.env.AUTH_ENABLED!=="1") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Authentication is not enabled");
  // No real SMS provider exists yet; AUTH_DEV_OTP_CONSOLE=1 (never in production) prints codes to the console,
  // AUTH_TEST_OTP_CODE=1234 (owner 2026-11-26, allowed in production) uses that fixed code and enables direct signup.
  foundation ??= createAuthFoundation({ database: getDatabase(), config: parseAuthConfig(process.env), phoneSender: devPhoneSenderFromEnv(process.env), testCode: testOtpCodeFromEnv(process.env) });
  return foundation;
}
export async function handleRuntimeAuth(request: Request) {
  try {
    return await getAuthRuntime().handleRequest(request);
  } catch (error) { return authErrorResponse(error); }
}
