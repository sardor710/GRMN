import { handleBeaconRequest } from "../../../server/traffic/beacon-runtime.ts";

// Owner 2026-11-25: storefront page-view beacon (Admin ▸ Traffic). Public, same-origin, rate-limited.
export const runtime = "nodejs";
export const POST = handleBeaconRequest;
