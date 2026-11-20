// Browser client for checkout (Task 14A). The server computes every amount; the browser sends only
// the quote reference, the cart version and an idempotency key. One key belongs to one quote and is
// kept in session storage, so a reload or a lost response retries the SAME key and gets the same
// order back instead of placing a second one.
import type { CheckoutCommand, CheckoutQuoteDTO, CheckoutResultDTO, CheckoutStatusDTO, QuoteCommand } from "../contracts/commerce.ts";
import { CartRequestError, type CartFetcher } from "./cart-client.ts";

export function createCheckoutClient(fetcher: CartFetcher) {
  async function post<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetcher(url, { method: "POST", cache: "no-store", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if (!response.ok) throw new CartRequestError(response.status, data?.error?.code ?? "INTERNAL_ERROR", data?.error?.message ?? "Checkout failed");
    return data as T;
  }
  return {
    quote: (command: QuoteCommand) => post<CheckoutQuoteDTO>("/api/cart/quote", command),
    placeOrder: (command: CheckoutCommand, idempotencyKey: string) => post<CheckoutResultDTO>("/api/cart/checkout", command, { "idempotency-key": idempotencyKey }),
    status: (input: { orderId: string; statusToken: string | null }) =>
      post<CheckoutStatusDTO>("/api/cart/checkout/status", input.statusToken ? { orderId: input.orderId, statusToken: input.statusToken } : { orderId: input.orderId }),
  };
}
export type CheckoutClient = ReturnType<typeof createCheckoutClient>;

const REQUOTE = new Set(["QUOTE_STALE", "QUOTE_EXPIRED", "VERSION_CONFLICT", "COUPON_EXHAUSTED", "COUPON_LIMIT_REACHED", "COUPON_INVALID", "INSUFFICIENT_STOCK", "CART_NOT_QUOTABLE", "SHIPPING_UNAVAILABLE", "POLICY_UNAVAILABLE"]);

/**
 * What the checkout UI does after a failed placeOrder:
 * - "retry": the outcome is unknown (network failure, 5xx); resend with the SAME key.
 * - "requote": the quote no longer holds (prices, stock, coupon, cart changed); get a new quote.
 * - "fail": a final answer (invalid input, the cart was already checked out elsewhere).
 */
export function checkoutRecovery(error: unknown): "retry" | "requote" | "fail" {
  if (!(error instanceof CartRequestError)) return "retry";
  if (error.status >= 500 || error.status === 0) return "retry";
  if (error.status === 409 && REQUOTE.has(error.code)) return "requote";
  return "fail";
}

export interface CheckoutStorage { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
const ATTEMPT_KEY = "grmn-checkout-attempt", ORDER_KEY = "grmn-last-order";
const randomId = () => globalThis.crypto.randomUUID();

/** Session storage with an in-memory fallback, so a retry reuses its key even when storage throws (review M1). */
export function createCheckoutStorage(getStorage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">): CheckoutStorage {
  const memory = new Map<string, string>();
  const attempt = <T>(work: (storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) => T): T | undefined => { try { return work(getStorage()); } catch { return undefined; } };
  return {
    get: key => attempt(storage => storage.getItem(key)) ?? memory.get(key) ?? null,
    set: (key, value) => { memory.set(key, value); attempt(storage => storage.setItem(key, value)); },
    remove: key => { memory.delete(key); attempt(storage => storage.removeItem(key)); },
  };
}

/**
 * `orderId` is set only once this key has placed an order that is kept for a payment retry (Task 3.3).
 * Such an order has already been shown on its receipt, so a reload never shows it again.
 */
interface PendingCheckout { command: CheckoutCommand; key: string; orderId?: string }
function readPending(storage: CheckoutStorage): PendingCheckout | null {
  try {
    const saved = JSON.parse(storage.get(ATTEMPT_KEY) ?? "null") as Partial<PendingCheckout> | null;
    if (!saved || typeof saved.key !== "string" || !saved.command || typeof saved.command.quoteId !== "string") return null;
    return { command: saved.command, key: saved.key, ...(typeof saved.orderId === "string" ? { orderId: saved.orderId } : {}) };
  } catch { return null; }
}
const sameCommand = (a: CheckoutCommand, b: CheckoutCommand) =>
  a.quoteId === b.quoteId && a.cartVersion === b.cartVersion && a.paymentMethod === b.paymentMethod && (a.contactEmail ?? null) === (b.contactEmail ?? null);

/**
 * Records the checkout about to be sent and returns its idempotency key. The same command reuses
 * its key (a retry); a different command is a different request with a new key. The command is
 * kept with the key so a reload can resend it (resumePendingCheckout).
 */
export function beginCheckout(storage: CheckoutStorage, command: CheckoutCommand): string {
  const saved = readPending(storage);
  if (saved && sameCommand(saved.command, command)) return saved.key;
  const key = "checkout-" + randomId();
  storage.set(ATTEMPT_KEY, JSON.stringify({ command, key }));
  return key;
}
export function forgetCheckoutKey(storage: CheckoutStorage): void { storage.remove(ATTEMPT_KEY); }

/**
 * Task 3.3: a demo order whose demo capture failed comes back still awaiting payment. Its key is kept,
 * because a same-key retry replays the order and captures it once; any other result is final.
 */
export const needsPaymentRetry = (result: Pick<CheckoutResultDTO, "paymentMode" | "status">) => result.paymentMode === "demo" && result.status === "pending_payment";

/**
 * Forgets the key unless the order still needs a payment retry (needsPaymentRetry). A kept key records
 * the order it placed: the caller shows that order's receipt, so the order counts as shown from here on.
 */
export function settleCheckoutKey(storage: CheckoutStorage, result: Pick<CheckoutResultDTO, "orderId" | "paymentMode" | "status">): void {
  if (!needsPaymentRetry(result)) { forgetCheckoutKey(storage); return; }
  const pending = readPending(storage);
  if (pending) storage.set(ATTEMPT_KEY, JSON.stringify({ command: pending.command, key: pending.key, orderId: result.orderId }));
}

/**
 * Task 3.3 "Try again" on the receipt: resends this order's kept checkout with its original key. The
 * server replays the same order and retries its demo capture. Returns null, sending nothing, when the
 * kept checkout is not this order's; a failed request throws and keeps the key.
 */
export async function retryOrderPayment(client: Pick<CheckoutClient, "placeOrder">, storage: CheckoutStorage, orderId: string): Promise<CheckoutResultDTO | null> {
  const pending = readPending(storage);
  if (!pending || pending.orderId !== orderId) return null;
  const result = await client.placeOrder(pending.command, pending.key);
  if (result.orderId !== orderId) return null;
  settleCheckoutKey(storage, result);
  return result;
}

/**
 * After a reload or a lost response: resends a pending checkout with its original key. The server
 * replays the order if it was placed (or places it now). Returns the order, or null when nothing is
 * pending, the outcome is still unknown (kept for the next try), or the answer was final (dropped).
 * Task 3.3: a kept demo order whose receipt was already shown is resent (a silent same-key capture
 * retry) but never returned again, so the cart page shows the cart rather than the old receipt.
 */
export async function resumePendingCheckout(client: Pick<CheckoutClient, "placeOrder">, storage: CheckoutStorage): Promise<PlacedOrder | null> {
  const pending = readPending(storage);
  if (!pending) return null;
  try {
    const result = await client.placeOrder(pending.command, pending.key);
    const order = { orderId: result.orderId, orderNumber: result.orderNumber, statusToken: result.statusToken };
    settleCheckoutKey(storage, result);
    if (pending.orderId === result.orderId) return null;
    rememberOrder(storage, order);
    return order;
  } catch (error) {
    if (checkoutRecovery(error) !== "retry") forgetCheckoutKey(storage);
    return null;
  }
}

export interface PlacedOrder { orderId: string; orderNumber: string; statusToken: string | null }
export function rememberOrder(storage: CheckoutStorage, order: PlacedOrder): void { storage.set(ORDER_KEY, JSON.stringify(order)); }
export function lastOrder(storage: CheckoutStorage): PlacedOrder | null {
  try {
    const value = JSON.parse(storage.get(ORDER_KEY) ?? "null") as Partial<PlacedOrder> | null;
    return value && typeof value.orderId === "string" && typeof value.orderNumber === "string" ? { orderId: value.orderId, orderNumber: value.orderNumber, statusToken: typeof value.statusToken === "string" ? value.statusToken : null } : null;
  } catch { return null; }
}

export const POLL_INTERVAL_MS = 5000, POLL_LIMIT = 24;
/** Polls the order status until it leaves pending payment, or `limit` reads. Returns the last status read. */
export async function pollOrderStatus<S extends Pick<CheckoutStatusDTO, "status" | "paymentStatus">>(
  client: { status: (input: { orderId: string; statusToken: string | null }) => Promise<S> },
  order: { orderId: string; statusToken: string | null },
  options: { intervalMs?: number; limit?: number; sleep?: (ms: number) => Promise<void>; onUpdate?: (status: S) => void; signal?: { aborted: boolean } } = {},
): Promise<S> {
  const { intervalMs = POLL_INTERVAL_MS, limit = POLL_LIMIT, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onUpdate, signal } = options;
  let last = await client.status(order);
  onUpdate?.(last);
  for (let read = 1; read < limit && !signal?.aborted && last.status === "pending_payment" && last.paymentStatus === "unpaid"; read++) {
    await sleep(intervalMs);
    last = await client.status(order);
    onUpdate?.(last);
  }
  return last;
}
