// Task 18B (11A M7). Browser helper for the admin stock actions: one prepared action keeps its
// idempotency key, so a retry after a lost response never adjusts stock twice.
export interface StockResult { movementId: string; replayed: boolean; stock: { variantId: string; locationKey: string; onHand: number; reserved: number; available: number; version: number } }
export class StockAdjustmentError extends Error {
  readonly code: string | null;
  readonly status: number;
  constructor(message: string, code: string | null, status: number) { super(message); this.code = code; this.status = status; }
}
type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>;

export function createStockAdjuster(fetcher: Fetcher = (url, init) => fetch(url, init)) {
  return {
    /** A positive delta records a delivery ("receive"); a negative one is a counted correction ("adjust"). */
    prepare(input: { variantId: string; delta: number; note: string; expectedVersion?: number }) {
      if (!Number.isInteger(input.delta) || input.delta === 0) throw new RangeError("Enter a whole, non-zero quantity");
      const body = JSON.stringify({
        variantId: input.variantId, delta: input.delta, reason: input.delta > 0 ? "receive" : "adjust", note: input.note,
        idempotencyKey: `ui-stock-${crypto.randomUUID()}`, ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
      });
      return {
        async send(): Promise<StockResult> {
          const response = await fetcher("/api/admin/inventory", { method: "POST", headers: { "content-type": "application/json" }, body });
          const data = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | StockResult | null;
          if (!response.ok) {
            const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
            throw new StockAdjustmentError(error?.message ?? `Stock update failed (${response.status})`, error?.code ?? null, response.status);
          }
          return data as StockResult;
        },
      };
    },
  };
}

/**
 * Review I8: one pending action per row (for example per variant). A lost response or a server
 * error keeps the action, so the next click retries the same request with the same key; success or
 * a definitive refusal (4xx) clears it, and the next click starts a new action.
 */
export function createPendingActions(adjuster: ReturnType<typeof createStockAdjuster>) {
  const pending = new Map<string, ReturnType<ReturnType<typeof createStockAdjuster>["prepare"]>>();
  return {
    isPending: (key: string) => pending.has(key),
    async run(key: string, input: Parameters<ReturnType<typeof createStockAdjuster>["prepare"]>[0]): Promise<StockResult> {
      let action = pending.get(key);
      if (!action) { action = adjuster.prepare(input); pending.set(key, action); }
      try {
        const result = await action.send();
        pending.delete(key);
        return result;
      } catch (error) {
        if (error instanceof StockAdjustmentError && error.status >= 400 && error.status < 500) pending.delete(key);
        throw error;
      }
    },
  };
}
