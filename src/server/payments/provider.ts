import "server-only";

// Task 14B. The typed payment-provider interface. An adapter turns provider traffic into the
// normalized facts below; it never writes to the database. The payment service decides what a
// verified fact does to an order. Real providers (Kaspi Pay, a second provider) are deferred
// (decision D03): the application registers only the explicitly simulated demo adapter.

export type ProviderName = "demo" | "kaspi" | "secondary";
export type ProviderEnvironment = "demo" | "sandbox" | "live";
export type PaymentEventKind = "authorized" | "captured" | "failed" | "cancelled";

/** Where a result came from. A simulated result is never money. */
export interface PaymentProvenance { provider: ProviderName; environment: ProviderEnvironment; merchantAccount: string; simulated: boolean }

export interface SessionRequest {
  attemptId: string; orderId: string;
  /** Stable for the attempt: a retried call after a lost response must not create a second logical charge. */
  idempotencyKey: string;
  merchantReference: string; amountMinor: string; currency: "KZT";
}
export interface SessionResult { sessionId: string; redirectUrl: string | null; provenance: PaymentProvenance }

/** A provider fact after signature verification (webhook) or authenticated lookup (reconciliation). */
export interface PaymentEvent {
  eventId: string; kind: PaymentEventKind;
  merchantAccount: string; environment: ProviderEnvironment; merchantReference: string;
  sessionId: string | null; transactionId: string | null;
  amountMinor: string; currency: string; occurredAt: string | null;
}
export type ProviderLookup = { state: "pending" | "unknown" } | { state: "event"; event: PaymentEvent };
export interface LookupRequest { attemptId: string; merchantReference: string; sessionId: string | null; idempotencyKey: string }

export interface PaymentProvider {
  readonly name: ProviderName;
  readonly environment: ProviderEnvironment;
  readonly merchantAccount: string;
  /** True for the demo adapter: it has no webhooks, and nothing it returns is captured money. */
  readonly simulated: boolean;
  startSession(request: SessionRequest): Promise<SessionResult>;
  /** Checks the signature over the exact raw body. */
  verifySignature(rawBody: Uint8Array, headers: Headers): boolean;
  /** Parses a body whose signature was already verified (re-run from the durable inbox). Null when unreadable. */
  parseEvent(rawBody: Uint8Array): PaymentEvent | null;
  /** Authenticated provider state of an attempt, for reconciliation. */
  lookup(request: LookupRequest): Promise<ProviderLookup>;
}

export type PaymentProviders = ReadonlyMap<string, PaymentProvider>;

/** One adapter per provider name. */
export function createPaymentProviders(list: readonly PaymentProvider[]): PaymentProviders {
  const providers = new Map<string, PaymentProvider>();
  for (const provider of list) {
    if (providers.has(provider.name)) throw new Error("Duplicate payment provider: " + provider.name);
    if ((provider.name === "demo") !== (provider.environment === "demo") || (provider.name === "demo") !== provider.simulated)
      throw new Error("Only the demo provider is simulated, and it runs only in the demo environment");
    providers.set(provider.name, provider);
  }
  return providers;
}
