// Client-side guard for admin actions that write (plan M9.3): at most one request per scope in flight
// (a double click or a second press while saving does nothing), and one idempotency key per user action.
// After an unknown outcome (network error, 5xx) the key is kept, so retrying the same action sends the same
// key and the server replays the first result instead of applying the change twice. Pure: unit tested in
// tests/unit/action-guard.test.mjs.

export type ActionOutcome = "done" | "unknown";

export interface ActionGuard {
  /** Starts an action in `scope`; null while another one is in flight there. `fingerprint` identifies the action (e.g. the quantity). */
  begin(scope: string, fingerprint: string): { idempotencyKey: string } | null;
  /** Ends the action: "done" when the server answered (success or a definite refusal), "unknown" when it may or may not have applied. */
  settle(scope: string, outcome: ActionOutcome): void;
  busy(scope: string): boolean;
}

export function createActionGuard(makeKey: () => string): ActionGuard {
  const inFlight = new Map<string, { fingerprint: string; idempotencyKey: string }>();
  const unsettled = new Map<string, { fingerprint: string; idempotencyKey: string }>();
  return {
    begin(scope, fingerprint) {
      if (inFlight.has(scope)) return null;
      const previous = unsettled.get(scope);
      const idempotencyKey = previous && previous.fingerprint === fingerprint ? previous.idempotencyKey : makeKey();
      inFlight.set(scope, { fingerprint, idempotencyKey });
      return { idempotencyKey };
    },
    settle(scope, outcome) {
      const action = inFlight.get(scope);
      inFlight.delete(scope);
      if (outcome === "unknown" && action) unsettled.set(scope, action);
      else unsettled.delete(scope);
    },
    busy: scope => inFlight.has(scope),
  };
}

/** A response whose outcome is unknown to the client (the server may have applied the change). */
export const outcomeOf = (status: number): ActionOutcome => (status === 0 || status >= 500 ? "unknown" : "done");
