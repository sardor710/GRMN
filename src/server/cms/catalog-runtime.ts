import "server-only";
import { getDatabase } from "../db/client.ts";
import { AuthFailure } from "../auth/config.ts";
import { createInventoryService } from "../inventory/service.ts";
import { cmsBackend } from "./source.ts";
import { authorizeCMS } from "./runtime.ts";
import { createCatalogAdminService } from "./catalog-service.ts";
import { catalogErrorResponse, createCatalogHTTP } from "./catalog-http.ts";

let handler: ReturnType<typeof createCatalogHTTP> | undefined;

// The admin catalog API exists only in PostgreSQL mode (decision D-R1); the legacy JSON store is frozen.
function getCatalogHandler() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("NOT_IMPLEMENTED", 501, "The catalog API requires the PostgreSQL backend");
  if (!handler) {
    const pool = getDatabase().pool;
    handler = createCatalogHTTP({
      service: createCatalogAdminService({ pool, authorize: authorizeCMS, inventory: createInventoryService({ pool, authorize: authorizeCMS }) }),
      baseURL: new URL(process.env.AUTH_BASE_URL!).origin,
    });
  }
  return handler;
}
export async function handleCatalogRequest(request: Request): Promise<Response> {
  try { return await getCatalogHandler()(request); } catch (error) { return catalogErrorResponse(error); }
}
