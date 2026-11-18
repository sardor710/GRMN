import { handleAccountRequest } from "../../../../../server/account/runtime.ts";

// Session-owned account API; identity comes only from the auth session cookie.
export const runtime = "nodejs";
export const DELETE = handleAccountRequest;
