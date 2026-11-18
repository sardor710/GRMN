import "server-only";
import { AuthFailure } from "../auth/config.ts";

/**
 * Task 21B follow-up. A per-process concurrency limit for expensive public reads (catalog listings):
 * at most `max` run at once and the rest wait in arrival order. A task still waiting after `waitMs`
 * is refused with 503 CATALOG_BUSY (Retry-After 1 s) and never runs, so a burst of listings cannot
 * take every pool connection from product pages, the cart and checkout.
 */
export interface ConcurrencyLimit {
  <T>(work: () => Promise<T>): Promise<T>;
  stats(): { running: number; waiting: number };
}

export function createConcurrencyLimit({ max, waitMs }: { max: number; waitMs: number }): ConcurrencyLimit {
  if (!Number.isInteger(max) || max < 1 || !Number.isInteger(waitMs) || waitMs < 1) throw new Error("Invalid concurrency limit");
  let running = 0;
  const queue: Array<{ start: () => void }> = [];
  const next = () => { running--; const waiter = queue.shift(); if (waiter) waiter.start(); };
  const limit = (async <T>(work: () => Promise<T>): Promise<T> => {
    if (running < max) running++;
    else await new Promise<void>((resolve, reject) => {
      const waiter = { start: () => { clearTimeout(timer); running++; resolve(); } };
      const timer = setTimeout(() => {
        const index = queue.indexOf(waiter);
        if (index >= 0) queue.splice(index, 1);
        reject(new AuthFailure("CATALOG_BUSY", 503, "The catalog is busy; try again shortly", 1));
      }, waitMs);
      queue.push(waiter);
    });
    try { return await work(); } finally { next(); }
  }) as ConcurrencyLimit;
  limit.stats = () => ({ running, waiting: queue.length });
  return limit;
}
