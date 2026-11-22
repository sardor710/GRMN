import "server-only";

// Task 14B. The typed payment-provider interface. An adapter turns provider traffic into the
// normalized facts below; it never writes to the database. The payment service decides what a
// verified fact does to an order. Real providers (Kaspi Pay, a second provider) are deferred
// (decision D03): the application registers the simulated demo adapter, the manual adapter (O07),
// whose payments staff confirm from the admin order page, and, only when demo purchases are enabled
// (decision D03a), the sandbox auto-capture adapter.

// "manual" (owner decision O07, Task 21C) is real money that staff confirm by hand: it opens a local
// session, takes no webhooks, has no lookups and its refunds are paid out by staff.
export type ProviderName = "demo" | "kaspi" | "secondary" | "manual" | "sandbox";
export type ProviderEnvironment = "demo" | "sandbox" | "live";
export type PaymentEventKind = "authorized" | "captured" | "failed" | "cancelled";

/** Where a result came from. A simulated result is never money; a sandbox result is never live money. */
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
/** The attempt's payable amount is included so an adapter can report it; the service still checks every reported amount against the attempt. */
export interface LookupRequest { attemptId: string; merchantReference: string; sessionId: string | null; idempotencyKey: string; amountMinor: string }

/** Task 16B. A refund of part or all of one capture. The key is stable per refund: a retry after a timeout must reach the same provider refund. */
export interface RefundRequest { refundId: string; orderId: string; idempotencyKey: string; transactionExternalId: string; amountMinor: string; currency: "KZT" }
/** A definitive or pending provider answer. A thrown error (timeout, lost response) means unknown: the reservation is kept. */
export interface RefundResult { state: "succeeded" | "failed" | "pending"; providerRefundId: string | null }

export interface PaymentProvider {
  readonly name: ProviderName;
  readonly environment: ProviderEnvironment;
  readonly merchantAccount: string;
  /** True for the demo adapter: it has no webhooks, and nothing it returns is captured money. */
  readonly simulated: boolean;
  /** False for an adapter that never receives webhooks (the sandbox adapter): its webhook path answers 404 before a byte is read. */
  readonly webhooks?: boolean;
  /** True when only signed-in staff may check out with this adapter (the D03a sandbox under the production override, M9.3). */
  readonly staffOnly?: boolean;
  startSession(request: SessionRequest): Promise<SessionResult>;
  /** Checks the signature over the exact raw body. */
  verifySignature(rawBody: Uint8Array, headers: Headers): boolean;
  /** Parses a body whose signature was already verified (re-run from the durable inbox). Null when unreadable. */
  parseEvent(rawBody: Uint8Array): PaymentEvent | null;
  /** Authenticated provider state of an attempt, for reconciliation. */
  lookup(request: LookupRequest): Promise<ProviderLookup>;
  /** Task 16B: refunds part of a capture, idempotent on request.idempotencyKey. */
  refund(request: RefundRequest): Promise<RefundResult>;
}

export type PaymentProviders = ReadonlyMap<string, PaymentProvider>;

/** True when the adapter takes provider webhooks at /api/payments/webhooks/<name>. */
export function acceptsWebhooks(provider: PaymentProvider | undefined): provider is PaymentProvider {
  return provider !== undefined && !provider.simulated && provider.webhooks !== false;
}

/**
 * One adapter per provider name. Only the demo adapter is simulated and it runs only in the demo
 * environment. The sandbox adapter runs only in the sandbox environment and is never registered
 * next to a live provider (decision D03a), so demo purchases never share a registry with real money.
 */
export function createPaymentProviders(list: readonly PaymentProvider[]): PaymentProviders {
  const providers = new Map<string, PaymentProvider>();
  for (const provider of list) {
    if (providers.has(provider.name)) throw new Error("Duplicate payment provider: " + provider.name);
    if ((provider.name === "demo") !== (provider.environment === "demo") || (provider.name === "demo") !== provider.simulated)
      throw new Error("Only the demo provider is simulated, and it runs only in the demo environment");
    if (provider.name === "sandbox" && provider.environment !== "sandbox") throw new Error("The sandbox provider runs only in the sandbox environment");
    providers.set(provider.name, provider);
  }
  // The manual adapter (O07) is environment 'live' but takes no automated money (staff confirm it by hand), so it
  // does not block demo purchases; any other live provider does.
  if (providers.has("sandbox") && list.some(provider => provider.environment === "live" && provider.name !== "manual"))
    throw new Error("Demo purchases (the sandbox provider) are refused while a live payment provider is configured");
  return providers;
}
