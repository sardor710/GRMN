import { handleCartRequest } from "../../../../../server/cart/runtime.ts";

// Session- or guest-capability-owned cart API; no input can name a cart, owner or price.
export const runtime = "nodejs";
export const PUT = handleCartRequest;
export const DELETE = handleCartRequest;
