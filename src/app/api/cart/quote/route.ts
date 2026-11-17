import { handleCartRequest } from "../../../../server/cart/runtime.ts";

// Task 13B: a server quote (KZT, policy-versioned, expiring) for the caller's own cart revision.
export const runtime = "nodejs";
export const POST = handleCartRequest;
