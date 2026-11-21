import { handleAdminRequest } from "../../../../../server/auth/admin-runtime.ts";

// Admin catalog API (M2): products (grouped list, editor payload, create/update), SKU list, variant quick
// edit, taxonomy, relations picker and dashboard restock. Routing lives in src/server/cms/catalog-http.ts.
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("catalog", request);
}
export async function POST(request: Request) {
  return handleAdminRequest("catalog", request);
}
export async function PUT(request: Request) {
  return handleAdminRequest("catalog", request);
}
export async function PATCH(request: Request) {
  return handleAdminRequest("catalog", request);
}
