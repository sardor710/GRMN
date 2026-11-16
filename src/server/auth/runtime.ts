import "server-only";
import { getDatabase } from "../db/client.ts";
import { parseAuthConfig, AuthFailure } from "./config.ts";
import { createAuthFoundation, authErrorResponse } from "./http.ts";

let foundation: ReturnType<typeof createAuthFoundation> | undefined;
export function getAuthRuntime() {
  if (process.env.AUTH_ENABLED!=="1") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Authentication is not enabled");
  foundation ??= createAuthFoundation({ database: getDatabase(), config: parseAuthConfig(process.env) });
  return foundation;
}
export async function handleRuntimeAuth(request: Request) {
  try {
    return await getAuthRuntime().handleRequest(request);
  } catch (error) { return authErrorResponse(error); }
}
