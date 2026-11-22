import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import { requestURL } from "../auth/request-url.ts";
import type { CatalogAdminService } from "./catalog-service.ts";
import { SkuConflict } from "./catalog-write.ts";

// /api/admin/catalog/* (M2). Permissions live in the service; this adapter checks origin, method, query
// keys and body size. Routes:
//   GET    products            grouped list   ?limit&cursor&search&status&category&family&stock
//   POST   products            create         body: product command (no id)
//   GET    products/:key       full editor payload
//   PUT    products/:key       update         body: product command (id = :key or omitted, version required)
//   GET    products/:key/variants   expand a grouped row
//   GET    skus                SKU list       same query keys
//   PATCH  variants/:id        quick edit     {version, price?, originalPrice?, stock?, stockBaseline?, status?, imageIds?}
//   DELETE variants/:id        delete one SKU ?version=<product version> (owner 2026-11-22, admin bin)
//   GET    taxonomy            category tree  (ETag = taxonomy epoch, private cache)
//   GET    picker              relations picker ?limit&cursor&search&category&exclude&status
//   POST   restock             {productId, variantId?, quantity, idempotencyKey, note?}

const LIST_KEYS = ["limit", "cursor", "search", "status", "category", "family", "stock"];
const PICKER_KEYS = ["limit", "cursor", "search", "category", "exclude", "status"];
// beta 8c29713: product saves (garmin.com imports with per-variant content and translations) accept 16 MiB, like cms/http.ts.
const PRODUCT_BODY_MAX = 16 * 1024 * 1024;
const bad = (message = "Invalid or unknown fields"): never => { throw new AuthFailure("INVALID_INPUT", 400, message); };
const notFound = (): never => { throw new AuthFailure("NOT_FOUND", 404, "Not found"); };

function query(url: URL, allowed: readonly string[]): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of url.searchParams) { if (!allowed.includes(key) || Object.hasOwn(result, key)) bad(); result[key] = value; }
  return result;
}
function segment(value: string): string {
  let decoded = "";
  try { decoded = decodeURIComponent(value); } catch { bad(); }
  if (!decoded || decoded.length > 128) bad();
  return decoded;
}

export function catalogErrorResponse(error: unknown): Response {
  if (error instanceof SkuConflict) return adminJSON({ error: { code: error.code, message: error.message, conflicts: error.conflicts }, code: error.code, conflicts: error.conflicts }, 409);
  return authErrorResponse(error);
}

export function createCatalogHTTP(input: { service: CatalogAdminService; baseURL: string }) {
  const { service, baseURL } = input;
  return async function handleCatalog(request: Request): Promise<Response> {
    try {
      // Behind the reverse proxy request.url carries the internal host; requestURL rebuilds the public URL (beta ffb8aa9).
      const url = requestURL(request, baseURL);
      if (url.origin !== baseURL || !(url.pathname === "/api/admin/catalog" || url.pathname.startsWith("/api/admin/catalog/"))) bad();
      const parts = url.pathname.slice("/api/admin/catalog/".length).split("/").filter(Boolean);
      const method = request.method;
      if (method !== "GET" && method !== "HEAD" && request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      const [resource, id, sub, extra] = parts;
      if (extra !== undefined) notFound();
      if (resource === "products") {
        if (id === undefined) {
          if (method === "GET") return adminJSON(await service.listProducts(request.headers, query(url, LIST_KEYS)));
          if (method === "POST") {
            query(url, []);
            const body = await readAdminJSON(request, true, PRODUCT_BODY_MAX);
            if (body && typeof body === "object" && "id" in body) bad("A new product gets a server-generated id");
            return adminJSON({ product: await service.saveProduct(request.headers, body) }, 201);
          }
        } else {
          const key = segment(id);
          if (sub === "variants" && method === "GET") { query(url, []); return adminJSON({ variants: await service.productVariants(request.headers, key) }); }
          if (sub === undefined && method === "GET") { query(url, []); return adminJSON({ product: await service.getProduct(request.headers, key) }); }
          if (sub === undefined && method === "PUT") {
            query(url, []);
            const body = await readAdminJSON(request, true, PRODUCT_BODY_MAX);
            if (!body || typeof body !== "object" || Array.isArray(body)) bad();
            const record = body as Record<string, unknown>;
            if (record.id !== undefined && record.id !== key) bad("The body id does not match the URL");
            return adminJSON({ product: await service.saveProduct(request.headers, { ...record, id: key }) });
          }
        }
      } else if (resource === "skus" && id === undefined && method === "GET") return adminJSON(await service.listSkus(request.headers, query(url, LIST_KEYS)));
      else if (resource === "variants" && id !== undefined && sub === undefined && method === "PATCH") {
        query(url, []);
        return adminJSON(await service.quickEditVariant(request.headers, segment(id), await readAdminJSON(request, true)));
      } else if (resource === "variants" && id !== undefined && sub === undefined && method === "DELETE") {
        const { version } = query(url, ["version"]);
        if (!version || !/^[1-9][0-9]{0,9}$/.test(version)) bad();
        return adminJSON(await service.deleteVariant(request.headers, segment(id), Number(version)));
      } else if (resource === "taxonomy" && id === undefined && method === "GET") {
        query(url, []);
        const tree = await service.taxonomy(request.headers);
        const etag = `W/"taxonomy-${tree.epoch}"`;
        const headers = { "Cache-Control": "private, max-age=300, must-revalidate", ETag: etag, Vary: "Cookie" };
        if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
        return Response.json(tree, { headers });
      } else if (resource === "picker" && id === undefined && method === "GET") return adminJSON(await service.picker(request.headers, query(url, PICKER_KEYS)));
      else if (resource === "restock" && id === undefined && method === "POST") { query(url, []); return adminJSON(await service.restock(request.headers, await readAdminJSON(request))); }
      if (["products", "skus", "variants", "taxonomy", "picker", "restock"].includes(resource ?? "")) throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
      return notFound();
    } catch (error) { return catalogErrorResponse(error); }
  };
}
