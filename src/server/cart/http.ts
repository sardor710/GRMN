import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import { CART_COOKIE, type CartResult, type CartService } from "./service.ts";

// HTTP mapping for /api/cart/*. The cart owner is the session (or the guest capability cookie);
// no query string or body field can name a cart, an owner or a price.
const bad = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };
const missing = (): never => { throw new AuthFailure("NOT_FOUND", 404, "Not found"); };
const method = (): never => { throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed"); };
const GUEST_COOKIE_SECONDS = 30 * 24 * 60 * 60;

export function createCartHandler(input: { service: CartService; baseURL: string }) {
  const { service, baseURL } = input, secure = baseURL.startsWith("https:") ? "; Secure" : "";
  function respond(result: CartResult): Response {
    const response = adminJSON(result.cart);
    if (result.cookie && "token" in result.cookie) response.headers.append("Set-Cookie", `${CART_COOKIE}=${result.cookie.token}; Path=/api/cart; Max-Age=${GUEST_COOKIE_SECONDS}; HttpOnly; SameSite=Lax${secure}`);
    else if (result.cookie) response.headers.append("Set-Cookie", `${CART_COOKIE}=; Path=/api/cart; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
    return response;
  }
  return async function handleCart(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.origin !== baseURL) bad();
      if (request.method !== "GET" && request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      if ([...url.searchParams.keys()].length) bad();
      const [root, resource, id, ...rest] = url.pathname.split("/").slice(2);
      if (root !== "cart" || rest.length || id === "") missing();
      const h = request.headers;
      if (resource === undefined) {
        if (request.method === "GET") return respond(await service.getCart(h));
        if (request.method === "DELETE") return respond(await service.clear(h, await readAdminJSON(request)));
        return method();
      }
      if (resource === "lines") {
        if (id === undefined) return request.method === "POST" ? respond(await service.addLine(h, await readAdminJSON(request))) : method();
        if (request.method === "PUT") return respond(await service.setLine(h, id, await readAdminJSON(request)));
        if (request.method === "DELETE") {
          const body = await readAdminJSON(request) as Record<string, unknown> | null;
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "expectedCartVersion")) bad();
          return respond(await service.setLine(h, id, { quantity: 0, expectedCartVersion: (body as Record<string, unknown>).expectedCartVersion }));
        }
        return method();
      }
      if (id !== undefined) missing();
      if (resource === "merge") return request.method === "POST" ? respond(await service.merge(h)) : method();
      if (resource === "import") return request.method === "POST" ? respond(await service.importLegacy(h, await readAdminJSON(request))) : method();
      if (resource === "acknowledge") return request.method === "POST" ? respond(await service.acknowledge(h, await readAdminJSON(request))) : method();
      if (resource === "quote") return request.method === "POST" ? adminJSON(await service.quote(h, await readAdminJSON(request))) : method();
      return missing();
    } catch (error) { return authErrorResponse(error); }
  };
}
