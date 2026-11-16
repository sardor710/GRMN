import { AuthFailure } from "./auth/config.ts";

/** Malformed public input (bad filter, stale/tampered cursor, oversized key) — a client error, not an outage. */
export function isInvalidPublicInput(error: unknown): boolean {
  return error instanceof AuthFailure && error.status === 400;
}

/** Await a public read; on invalid input use the fallback (usually notFound), rethrow real failures. */
export async function readOr<T, F>(read: Promise<T>, fallback: () => F): Promise<T | F> {
  try {
    return await read;
  } catch (error) {
    if (isInvalidPublicInput(error)) return fallback();
    throw error;
  }
}
