import "server-only";
import { getDatabase } from "../db/client.ts";
import { parseAuthConfig, AuthFailure } from "./config.ts";
import { createAuthFoundation, authErrorResponse } from "./http.ts";
import { devPhoneSenderFromEnv } from "./dev-phone-sender.ts";

let foundation: ReturnType<typeof createAuthFoundation> | undefined;
export function getAuthRuntime() {
  if (process.env.AUTH_ENABLED!=="1") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Authentication is not enabled");
  // No real SMS provider exists yet; AUTH_DEV_OTP_CONSOLE=1 (never in production) prints codes to the console.
  foundation ??= createAuthFoundation({ database: getDatabase(), config: parseAuthConfig(process.env), phoneSender: devPhoneSenderFromEnv(process.env) });
  return foundation;
}
export async function handleRuntimeAuth(request: Request) {
  try {
    return await getAuthRuntime().handleRequest(request);
  } catch (error) { return authErrorResponse(error); }
}
