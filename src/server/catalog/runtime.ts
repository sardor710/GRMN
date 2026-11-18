import "server-only";
import { getDatabase } from "../db/client.ts";
import { parseServerEnv } from "../config/env.ts";
import { createConcurrencyLimit, type ConcurrencyLimit } from "./limit.ts";
import { createCatalogService } from "./service.ts";

// One listing limit per process (module instance), shared by every service built here.
let listingLimit: ConcurrencyLimit | undefined;
export function getCatalogService(){
  if(!listingLimit){const config=parseServerEnv(process.env);listingLimit=createConcurrencyLimit({max:config.listingConcurrency,waitMs:config.listingWaitMs});}
  return createCatalogService({pool:getDatabase().pool,listingLimit});
}
