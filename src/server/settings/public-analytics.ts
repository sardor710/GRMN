import "server-only";
import { cache } from "react";
import type { AnalyticsConfig } from "../../lib/analytics/config.ts";
import { cmsBackend } from "../cms/source.ts";
import { getDatabase } from "../db/client.ts";
import { readAnalyticsConfig } from "./service.ts";

// Task 5.1: the storefront layout's analytics config (Admin ▸ Settings ▸ Google & analytics). Public, no staff
// session: it holds only tag ids and verification tokens, which every page prints anyway. One read per request
// (generateMetadata and the layout share it); an owner's save shows on the next page load. Legacy CMS mode has
// no store settings, and a database failure never breaks a page: both mean no tags.
export const getPublicAnalyticsConfig = cache(async (): Promise<AnalyticsConfig> => {
  try {
    if (cmsBackend() !== "postgres") return {};
    return await readAnalyticsConfig(getDatabase().pool);
  } catch (error) {
    console.error("analytics: no tags,", error instanceof Error ? error.message : error);
    return {};
  }
});
