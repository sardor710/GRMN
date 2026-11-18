import { handleCartRequest } from "../../../../../server/cart/runtime.ts";

// Task 14A: order status polling after checkout (owning session or guest status token).
export const runtime = "nodejs";
export const POST = handleCartRequest;
