import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import type { OperationsService } from "./admin.ts";
import { requestURL } from "../auth/request-url.ts";

// Task 12B. /api/admin/operations. GET (optionally ?kind=) returns the job-lag metrics and the
// open dead letters; POST { jobId, reason } replays one dead letter. Both need operator access,
// which the service checks; POST also needs a same-origin request.
const bad = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };

export function createOperationsHTTP(input: { service: OperationsService; baseURL: string }) {
  const { service, baseURL } = input;
  return async function handleOperations(request: Request): Promise<Response> {
    try {
      const url = requestURL(request, baseURL);
      if (url.origin !== baseURL || url.pathname !== "/api/admin/operations") bad();
      const params = [...url.searchParams];
      if (new Set(params.map(([key]) => key)).size !== params.length) bad();
      if (request.method === "GET") return adminJSON(await service.overview(request.headers, Object.fromEntries(params)));
      if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
      if (request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      if (params.length) bad();
      return adminJSON(await service.replay(request.headers, await readAdminJSON(request)));
    } catch (error) { return authErrorResponse(error); }
  };
}
