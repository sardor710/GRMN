// Server-derived types only: never trust an actor submitted by an HTTP client.
export type Permission =
  | "catalog:read" | "catalog:write" | "inventory:write" | "content:write"
  | "customers:read" | "customers:write" | "orders:read" | "orders:fulfill"
  | "payments:refund" | "payments:confirm" | "staff:manage" | "settings:write" | "exports:create";

export interface Principal {
  userId: string;
  permissions: readonly Permission[];
}

export type CartActor =
  | { kind: "user"; userId: string }
  | { kind: "guest"; tokenHash: string };
