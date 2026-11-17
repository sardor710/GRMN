import "server-only";
import type { AdminResource, AdminStore } from "./admin-service.ts";
import { adminMe, adminPermissionMatrix, createAdminHandlers } from "./admin-service.ts";
import { authErrorResponse } from "./http.ts";
import { getAuthRuntime, handleRuntimeAuth } from "./runtime.ts";
import { requirePermission, requireStaffPrincipal } from "./principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { authorizeCMS, getCMSService } from "../cms/runtime.ts";
import { createCMSHTTP } from "../cms/http.ts";
import { AuthFailure } from "./config.ts";

async function handlers(request: Request, resource: AdminResource) {
  const runtime = getAuthRuntime();
  await requireStaffPrincipal(runtime, request.headers);
  await requirePermission(runtime, request.headers, adminPermissionMatrix[resource][request.method === "GET" ? 0 : 1]);
  if(cmsBackend()==="postgres"){
    if(["products","blogs","banners","clients","homepage"].includes(resource)){
      const schema=await import("../../lib/cms/homepage-schema");
      const http=createCMSHTTP({cms:getCMSService(),authorize:authorizeCMS,baseURL:new URL(process.env.AUTH_BASE_URL!).origin,dimensionSpecs:schema.IMAGE_DIMENSION_SPECS,defaults:schema.createDefaultHomepageConfig});
      return{handle:(_:AdminResource,next:Request)=>http.handle(resource as "products"|"blogs"|"banners"|"clients"|"homepage",next)};
    }
    throw new AuthFailure("NOT_IMPLEMENTED",501,"This workflow is not available with the selected backend");
  }
  // Lazy import: a disabled deployment never reads the business source to deny
  // access. Every access to this adapter goes through the guarded service.
  const cms = await import("../../lib/cms/store");
  const schema = await import("../../lib/cms/homepage-schema");
  const store: AdminStore = {
    get(resource) {
      switch (resource) {
        case "products": return cms.getProducts();
        case "orders": return cms.getOrders();
        case "clients": return cms.getClients();
        case "banners": return cms.getBanners();
        case "blogs": return cms.getBlogs();
        case "discounts": return cms.getDiscounts();
        case "settings": return cms.getSettings();
        case "homepage": return cms.getHomepageConfig();
      }
    },
    save(resource, value) {
      switch (resource) {
        case "products": return cms.saveProduct(value as Parameters<typeof cms.saveProduct>[0]);
        case "orders": return cms.saveOrder(value as Parameters<typeof cms.saveOrder>[0]);
        case "banners": return cms.saveBanner(value as Parameters<typeof cms.saveBanner>[0]);
        case "blogs": return cms.saveBlog(value as Parameters<typeof cms.saveBlog>[0]);
        case "discounts": return cms.saveDiscount(value as Parameters<typeof cms.saveDiscount>[0]);
        case "settings": return cms.saveSettings(value as Parameters<typeof cms.saveSettings>[0]);
        case "homepage": return cms.saveHomepageConfig(value as Parameters<typeof cms.saveHomepageConfig>[0]);
      }
    },
    remove(resource, id) {
      switch (resource) {
        case "products": return cms.deleteProduct(id);
        case "banners": return cms.deleteBanner(id);
        case "blogs": return cms.deleteBlog(id);
        case "discounts": return cms.deleteDiscount(id);
      }
    },
    homepageDefaults: schema.createDefaultHomepageConfig,
    dimensionSpecs: schema.IMAGE_DIMENSION_SPECS,
  };
  return createAdminHandlers({ runtime, store, baseURL: new URL(process.env.AUTH_BASE_URL!).origin });
}
export async function handleAdminRequest(resource: AdminResource | "order-claims" | "inventory" | "operations", request: Request) {
  // Legacy-order claim approval exists only in PostgreSQL+auth mode; the account service
  // enforces staff MFA admission and customers:write itself.
  if (resource === "order-claims") return (await import("../account/runtime.ts")).handleClaimApprovalRequest(request);
  // Inventory (Task 11A) is PostgreSQL-only; the inventory service checks staff permissions per action.
  if (resource === "inventory") return (await import("../inventory/runtime.ts")).handleInventoryRequest(request);
  // The job queue (Task 12B) is PostgreSQL-only; the operations runtime requires settings:write with fresh MFA.
  if (resource === "operations") return (await import("../operations/runtime.ts")).handleOperationsRequest(request);
  // Orders in PostgreSQL mode are the fulfillment service (Task 16A); the legacy JSON store serves the rest.
  if (resource === "orders" && cmsBackend() === "postgres") return (await import("../fulfillment/runtime.ts")).handleFulfillmentRequest(request);
  try { return await (await handlers(request, resource)).handle(resource, request); }
  catch (error) { return authErrorResponse(error); }
}
export async function handleAdminMe(request: Request) {
  try { return await adminMe(getAuthRuntime(), request); }
  catch (error) { return authErrorResponse(error); }
}
export async function handleAdminAuth(request: Request, operation: "sign-in/email"|"sign-out") {
  const url = new URL(request.url);
  url.pathname = "/api/auth/"+operation;
  const response = await handleRuntimeAuth(new Request(url, request));
  response.headers.append("Set-Cookie", "garmin_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"+(url.protocol==="https:"?"; Secure":""));
  return response;
}
