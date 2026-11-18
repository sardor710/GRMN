import { handleCartRequest } from "../../../../server/cart/runtime.ts";

// Task 14A: idempotent checkout of the caller's quoted cart revision (Idempotency-Key header).
export const runtime = "nodejs";
export const POST = handleCartRequest;
