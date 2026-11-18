// Browser client for the server cart (/api/cart) and the account wishlist (Task 13A). The cart owner is
// the session or the HttpOnly guest capability cookie; no call sends an owner, a name or a price.
import type { CartAddCommand, CartDTO, WishlistItemDTO } from "../contracts/commerce.ts";

interface FetchResult { ok: boolean; status: number; json(): Promise<unknown> }
export type CartFetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; cache?: "no-store" }) => Promise<FetchResult>;

export class CartRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CartRequestError";
    this.status = status;
    this.code = code;
  }
}

/** localStorage key of the pre-server browser cart; imported once, then removed. */
export const LEGACY_CART_KEY = "garmin-clone-cart";
const MAX_LINES = 100, MAX_QUANTITY = 99;

/** Reduces the stored local cart to `{ id, quantity }` pairs: no names, prices or images leave the browser. */
export function legacyCartItems(raw: string | null): { id: string; quantity: number }[] {
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, number>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { id, qty } = entry as { id?: unknown; qty?: unknown };
    if (typeof id !== "string" || !id || id.length > 200 || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) continue;
    merged.set(id, Math.min(MAX_QUANTITY, Math.max(merged.get(id) ?? 0, qty)));
  }
  return [...merged].slice(0, MAX_LINES).map(([id, quantity]) => ({ id, quantity }));
}

export function createCartClient(fetcher: CartFetcher) {
  async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
    const init = method === "GET" ? { cache: "no-store" as const } : { method, cache: "no-store" as const, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) };
    const response = await fetcher(url, init);
    const data = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if (!response.ok) throw new CartRequestError(response.status, data?.error?.code ?? "INTERNAL_ERROR", data?.error?.message ?? "The cart could not be updated");
    return data as T;
  }
  const line = (variantId: string) => `/api/cart/lines/${encodeURIComponent(variantId)}`;
  return {
    get: () => call<CartDTO>("/api/cart"),
    add: (command: CartAddCommand) => call<CartDTO>("/api/cart/lines", "POST", command),
    setQuantity: (variantId: string, quantity: number, expectedCartVersion: number) => call<CartDTO>(line(variantId), "PUT", { quantity, expectedCartVersion }),
    remove: (variantId: string, expectedCartVersion: number) => call<CartDTO>(line(variantId), "DELETE", { expectedCartVersion }),
    clear: (expectedCartVersion: number) => call<CartDTO>("/api/cart", "DELETE", { expectedCartVersion }),
    acknowledge: (expectedCartVersion: number) => call<CartDTO>("/api/cart/acknowledge", "POST", { expectedCartVersion }),
    merge: () => call<CartDTO>("/api/cart/merge", "POST", {}),
    importLegacy: (items: { id: string; quantity: number }[]) => call<CartDTO>("/api/cart/import", "POST", { items }),
    wishlist: () => call<{ items: WishlistItemDTO[] }>("/api/account/wishlist"),
    saveToWishlist: (productKey: string) => call<{ items: WishlistItemDTO[] }>("/api/account/wishlist", "POST", { productKey }),
    removeFromWishlist: (productKey: string) => call<{ items: WishlistItemDTO[] }>(`/api/account/wishlist/${encodeURIComponent(productKey)}`, "DELETE", {}),
  };
}

export type CartClient = ReturnType<typeof createCartClient>;

/** Fired on window after the account session changes in-page (sign-in, sign-out), so the cart re-syncs. */
export const CART_SESSION_EVENT = "grmn:session-changed";
export function announceSessionChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_SESSION_EVENT));
}

/** Header badge count. Zero while loading, so the server render and the first client render agree. */
export function cartBadgeCount(state: Pick<CartState, "mode" | "server">, localItems: readonly { qty: number }[]): number {
  if (state.mode === "local") return localItems.reduce((n, item) => n + item.qty, 0);
  if (state.mode === "server") return (state.server?.lines ?? []).reduce((n, line) => n + line.quantity, 0);
  return 0;
}

export interface CartState { mode: "loading" | "local" | "server"; server: CartDTO | null; error: string | null; busy: boolean }
export interface CartStorage { get(key: string): string | null; remove(key: string): void }
type ControllerClient = Pick<CartClient, "get" | "add" | "setQuantity" | "remove" | "clear" | "acknowledge" | "merge" | "importLegacy">;

const errorText = (error: unknown) => error instanceof Error && error.message ? error.message : "The cart could not be updated";
const isConflict = (error: unknown) => error instanceof CartRequestError && error.code === "VERSION_CONFLICT";

// The server-cart state machine behind CartProvider (Task 13A).
// - Only a closed server cart (503) falls back to the browser-only cart; any other failure stays in
//   server mode with an error, so a server deployment never shows the demo checkout.
// - Writes wait for the initial load, so an early Add to Cart is not lost.
// - A stale version reloads the cart. Only a relative change (add) is retried, and only on the same
//   cart; a different cart (for example after sign-in) is merged if needed and shown instead.
export function createCartController({ client, storage, onChange }: { client: ControllerClient; storage: CartStorage; onChange: (state: CartState) => void }) {
  let state: CartState = { mode: "loading", server: null, error: null, busy: false };
  const set = (patch: Partial<CartState>) => { state = { ...state, ...patch }; onChange(state); };
  let resolveFirst: () => void = () => undefined;
  let current: Promise<void> = new Promise<void>(resolve => { resolveFirst = resolve; });

  async function sync(): Promise<void> {
    let cart: CartDTO;
    try { cart = await client.get(); } catch (error) {
      if (error instanceof CartRequestError && error.status === 503) set({ mode: "local", server: null, error: null });
      else set({ mode: "server", server: null, error: errorText(error) });
      return;
    }
    let error: string | null = null;
    try {
      const pending = cart.pendingMerge;
      const legacy = legacyCartItems(storage.get(LEGACY_CART_KEY));
      if (legacy.length) cart = await client.importLegacy(legacy);
      storage.remove(LEGACY_CART_KEY);
      if (pending || cart.pendingMerge) cart = await client.merge();
    } catch (failure) { error = errorText(failure); }
    set({ mode: "server", server: cart, error });
  }
  // One sync at a time: a second start (a remounted provider) or refresh joins the one in flight, so
  // two cookie-less requests never create two guest carts or import the stored cart twice.
  let inFlight: Promise<void> | null = null;
  function run(): Promise<void> {
    if (inFlight) return inFlight;
    const pending = sync().finally(() => { inFlight = null; resolveFirst(); });
    inFlight = pending;
    current = pending;
    return pending;
  }

  // Resolves false when the browser-only cart is in use; the caller then applies the change locally.
  async function write(operation: (expected: number) => Promise<CartDTO>, relative: boolean): Promise<boolean> {
    await current;
    if (state.mode === "local") return false;
    if (!state.server) await run();
    const shown = state.server;
    if (!shown) throw new CartRequestError(0, "UNAVAILABLE", state.error ?? "The cart is not available");
    set({ busy: true, error: null });
    try {
      try { set({ server: await operation(shown.version), busy: false }); return true; }
      catch (failure) {
        if (!isConflict(failure)) throw failure;
        let fresh = await client.get();
        const same = fresh.id === shown.id && fresh.owner === shown.owner && !fresh.pendingMerge;
        if (fresh.pendingMerge) fresh = await client.merge();
        if (same && relative) { set({ server: await operation(fresh.version), busy: false }); return true; }
        set({ server: fresh });
        throw failure;
      }
    } catch (failure) { set({ busy: false, error: errorText(failure) }); throw failure; }
  }

  return {
    state: () => state,
    start: run,
    refresh: run,
    add: (command: Omit<CartAddCommand, "expectedCartVersion">) => write(expected => client.add({ ...command, expectedCartVersion: expected }), true),
    setQuantity: (variantId: string, quantity: number) => write(expected => quantity <= 0 ? client.remove(variantId, expected) : client.setQuantity(variantId, quantity, expected), false),
    remove: (variantId: string) => write(expected => client.remove(variantId, expected), false),
    clear: () => write(expected => client.clear(expected), false),
    acknowledge: () => write(expected => client.acknowledge(expected), false),
  };
}
