import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import { createCMSService } from "./service.ts";

export const authorizeCMS: Parameters<typeof createCMSService>[0]["authorize"] = async (headers,permission) => {
  const runtime=getAuthRuntime();await requireStaffPrincipal(runtime,headers);return requirePermission(runtime,headers,permission);
};
export function getCMSService(){return createCMSService({pool:getDatabase().pool,authorize:authorizeCMS});}
