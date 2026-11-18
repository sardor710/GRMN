import "server-only";
import { getDatabase } from "../db/client.ts";
import { createCatalogService } from "./service.ts";
export function getCatalogService(){return createCatalogService({pool:getDatabase().pool});}
