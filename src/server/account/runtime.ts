import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { parseAuthConfig, AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { requireFreshPermission, requirePrincipal } from "../auth/principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { createAccountService } from "./service.ts";
import { createAccountHandler, createClaimApprovalHandler } from "./http.ts";

let handler: ReturnType<typeof createAccountHandler> | undefined;
let approvals: ReturnType<typeof createClaimApprovalHandler> | undefined;

// Account data exists only in PostgreSQL mode with real auth. Legacy mode has no owner
// model, so it stays closed (503) instead of falling back to shared/demo records.
function getAccountHandler() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Account services are not available");
  const runtime = getAuthRuntime();
  if (!handler) {
    const config = parseAuthConfig(process.env);
    const service = createAccountService({ database: getDatabase(), authorize: headers => requirePrincipal(runtime, headers), authorizeFresh: (headers, permission) => requireFreshPermission(runtime, headers, permission), secret: config.secret });
    handler = createAccountHandler({ service, baseURL: config.baseURL });
    approvals = createClaimApprovalHandler({ service, baseURL: config.baseURL });
  }
  return { handler, approvals: approvals as ReturnType<typeof createClaimApprovalHandler> };
}
export async function handleAccountRequest(request: Request): Promise<Response> {
  try { return await getAccountHandler().handler(request); } catch (error) { return authErrorResponse(error); }
}
export async function handleClaimApprovalRequest(request: Request): Promise<Response> {
  try { return await getAccountHandler().approvals(request); } catch (error) { return authErrorResponse(error); }
}
