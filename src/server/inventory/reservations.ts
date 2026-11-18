import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";
import { mainLocation } from "./service.ts";

// Task 11B. Checkout holds on the 11A ledger. A reservation is a header plus immutable lines;
// every hold, consumption and release is one stock_movements row per line, deduplicated by the
// line id, so each business effect happens exactly once. Canonical lock order for every writer
// (later cancellation and fulfillment code included): checkout attempt, order, reservation
// header, then balances in stable (variant_id, location_id) order.
// These functions run inside the caller's transaction (one transaction context for checkout);
// withInventoryTransaction supplies one with bounded deadlock/serialization retries.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_HOLD_SECONDS = 15 * 60;
// O07 (Task 21C): manual-payment orders hold stock for up to 168 hours (settings, default 48).
export const MAX_HOLD_SECONDS = 168 * 60 * 60;
const MAX_LINES = 100;
const MAX_LINE_QUANTITY = 10_000;
const RETRYABLE = new Set(["40P01", "40001"]);

export interface ReservationLineDTO { lineId: string; variantId: string; quantity: number }
export interface ReservationDTO { reservationId: string; checkoutAttemptId: string; status: "active"; replayed: boolean; expiresAt: string; lines: ReservationLineDTO[] }
export interface AllocationDTO { allocationId: string; reservationLineId: string; orderItemId: string; variantId: string; quantity: number }
export interface ConsumeResultDTO { reservationId: string; orderId: string; status: "consumed"; changed: boolean; allocations: AllocationDTO[] }
export interface ReleaseResultDTO { reservationId: string; status: string; changed: boolean }
export interface RetryInfo { attempt: number; code: string }
export interface RetryOptions { maxAttempts?: number; baseDelayMs?: number; onRetry?: (info: RetryInfo) => void }

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");
const insufficient = (): never => fail("INSUFFICIENT_STOCK", 409, "Not enough stock is available");

const reserveInput = z.strictObject({
  checkoutAttemptId: z.string().regex(UUID),
  lines: z.array(z.strictObject({ variantId: z.string().regex(UUID), quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) })).min(1).max(MAX_LINES)
    .refine(lines => new Set(lines.map(line => line.variantId.toLowerCase())).size === lines.length),
  holdSeconds: z.number().int().min(60).max(MAX_HOLD_SECONDS).optional(),
});
const consumeInput = z.strictObject({ reservationId: z.string().regex(UUID), orderId: z.string().regex(UUID) });
const releaseInput = z.strictObject({ reservationId: z.string().regex(UUID) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

interface LineRow { id: string; variant_id: string; location_id: string; quantity: number }
interface HeaderRow { id: string; checkout_attempt_id: string; order_id: string | null; status: string; expires_at: Date; due: boolean }

// Locks the balances of the given variants at one location in variant order (the only location
// under owner decision O08) and returns them keyed by variant. Missing balances are absent.
async function lockBalances(client: PoolClient, locationId: string, variantIds: string[]): Promise<Map<string, { on_hand: number; reserved: number }>> {
  const rows = (await client.query<{ variant_id: string; on_hand: number; reserved: number }>(
    "SELECT variant_id,on_hand,reserved FROM inventory_balances WHERE location_id=$1 AND variant_id=ANY($2::uuid[]) ORDER BY variant_id,location_id FOR UPDATE",
    [locationId, variantIds])).rows;
  return new Map(rows.map(row => [row.variant_id, row]));
}

// Every line of a reservation lives at one location today; sorting by (variant, location) keeps
// the order stable if a later owner decision adds locations.
const byStock = (a: LineRow, b: LineRow) => a.variant_id < b.variant_id ? -1 : a.variant_id > b.variant_id ? 1 : a.location_id < b.location_id ? -1 : a.location_id > b.location_id ? 1 : 0;

async function lockLineBalances(client: PoolClient, lines: LineRow[]): Promise<void> {
  for (const line of [...lines].sort(byStock)) {
    await client.query("SELECT 1 FROM inventory_balances WHERE variant_id=$1 AND location_id=$2 FOR UPDATE", [line.variant_id, line.location_id]);
  }
}

async function readLines(client: PoolClient, reservationId: string): Promise<LineRow[]> {
  return (await client.query<LineRow>("SELECT id,variant_id,location_id,quantity FROM reservation_lines WHERE reservation_id=$1 ORDER BY variant_id,location_id", [reservationId])).rows;
}

async function lockHeader(client: PoolClient, reservationId: string, asOf: Date | null = null): Promise<HeaderRow> {
  const header = (await client.query<HeaderRow>(
    "SELECT id,checkout_attempt_id,order_id,status,expires_at,expires_at<=COALESCE($2::timestamptz,now()) AS due FROM inventory_reservations WHERE id=$1 FOR UPDATE",
    [reservationId, asOf])).rows[0];
  return header ?? notFound();
}

/** Holds every line or none. A repeat for the same active checkout attempt replays the hold. */
export async function reserveStock(client: PoolClient, input: unknown): Promise<ReservationDTO> {
  const command = parse(reserveInput, input);
  const attempt = (await client.query<{ status: string }>("SELECT status FROM checkout_attempts WHERE id=$1 FOR UPDATE", [command.checkoutAttemptId])).rows[0] ?? notFound();
  const requested = new Map(command.lines.map(line => [line.variantId.toLowerCase(), line.quantity]));
  const existing = (await client.query<{ id: string; status: string; expires_at: Date }>(
    // FOR UPDATE waits for a concurrent release, expiry or consumption of this attempt's hold; READ
    // COMMITTED then re-checks the status, so a hold that just ended is never replayed (review I1).
    "SELECT id,status,expires_at FROM inventory_reservations WHERE checkout_attempt_id=$1 AND status IN ('active','consumed') ORDER BY status,id FOR UPDATE", [command.checkoutAttemptId])).rows;
  const active = existing.find(row => row.status === "active");
  if (active) {
    const lines = await readLines(client, active.id);
    const same = lines.length === requested.size && lines.every(line => requested.get(line.variant_id) === line.quantity);
    if (!same) fail("RESERVATION_CONFLICT", 409, "This checkout already holds different stock");
    return { reservationId: active.id, checkoutAttemptId: command.checkoutAttemptId, status: "active", replayed: true, expiresAt: active.expires_at.toISOString(), lines: lines.map(line => ({ lineId: line.id, variantId: line.variant_id, quantity: line.quantity })) };
  }
  if (existing.some(row => row.status === "consumed")) fail("RESERVATION_ENDED", 409, "This checkout's stock was already consumed");
  if (attempt.status === "failed") fail("CHECKOUT_FAILED", 409, "This checkout attempt has failed");

  const locationId = await mainLocation(client);
  const variantIds = [...requested.keys()].sort();
  const balances = await lockBalances(client, locationId, variantIds);
  for (const variantId of variantIds) {
    const row = balances.get(variantId);
    if (!row || row.on_hand - row.reserved < requested.get(variantId)!) insufficient();
  }
  const reservationId = randomUUID();
  const expiresAt = (await client.query<{ expires_at: Date }>(
    "INSERT INTO inventory_reservations(id,checkout_attempt_id,expires_at) VALUES($1,$2,now()+make_interval(secs=>$3)) RETURNING expires_at",
    [reservationId, command.checkoutAttemptId, command.holdSeconds ?? DEFAULT_HOLD_SECONDS])).rows[0].expires_at;
  const lines: ReservationLineDTO[] = [];
  for (const variantId of variantIds) {
    const lineId = randomUUID(), quantity = requested.get(variantId)!;
    await client.query("INSERT INTO reservation_lines(id,reservation_id,variant_id,location_id,quantity) VALUES($1,$2,$3,$4,$5)", [lineId, reservationId, variantId, locationId, quantity]);
    await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference,reservation_line_id,occurred_at) VALUES($1,$2,$3,0,$4,'reserve',$5,$6,$7,clock_timestamp())",
      [randomUUID(), variantId, locationId, quantity, `reserve:${lineId}`, `reservation:${reservationId}`, lineId]);
    lines.push({ lineId, variantId, quantity });
  }
  return { reservationId, checkoutAttemptId: command.checkoutAttemptId, status: "active", replayed: false, expiresAt: expiresAt.toISOString(), lines };
}

async function readAllocations(client: PoolClient, reservationId: string): Promise<AllocationDTO[]> {
  return (await client.query<{ id: string; reservation_line_id: string; order_item_id: string; variant_id: string; quantity: number }>(
    "SELECT a.id,a.reservation_line_id,a.order_item_id,a.variant_id,a.quantity FROM inventory_allocations a JOIN reservation_lines l ON l.id=a.reservation_line_id WHERE l.reservation_id=$1 ORDER BY a.variant_id,a.location_id",
    [reservationId])).rows.map(row => ({ allocationId: row.id, reservationLineId: row.reservation_line_id, orderItemId: row.order_item_id, variantId: row.variant_id, quantity: row.quantity }));
}

/**
 * Commits a held reservation to its order: each line becomes a paid allocation for the order item
 * of the same variant and quantity, and on-hand and reserved both drop once. A repeat for the same
 * order has no second effect. Released or expired holds cannot be consumed.
 */
export async function consumeReservation(client: PoolClient, input: unknown): Promise<ConsumeResultDTO> {
  const command = parse(consumeInput, input);
  // Canonical lock order: order, then reservation header, then balances (review I4).
  const order = (await client.query<{ checkout_attempt_id: string | null }>("SELECT checkout_attempt_id FROM orders WHERE id=$1 FOR UPDATE", [command.orderId])).rows[0];
  const header = await lockHeader(client, command.reservationId);
  if (header.status === "consumed") {
    if (header.order_id !== command.orderId) fail("RESERVATION_CONFLICT", 409, "This reservation belongs to another order");
    return { reservationId: header.id, orderId: command.orderId, status: "consumed", changed: false, allocations: await readAllocations(client, header.id) };
  }
  if (header.status !== "active") fail("RESERVATION_ENDED", 409, "This reservation has already ended");
  if (!order) notFound();
  if (order!.checkout_attempt_id !== header.checkout_attempt_id || (header.order_id !== null && header.order_id !== command.orderId)) fail("RESERVATION_CONFLICT", 409, "This reservation belongs to another order");
  const lines = await readLines(client, header.id);
  const items = (await client.query<{ id: string; variant_id: string | null; quantity: number }>("SELECT id,variant_id,quantity FROM order_items WHERE order_id=$1", [command.orderId])).rows;
  // One-to-one: every order item is a reserved line of the same variant and quantity, and every
  // line is an order item. An item without a variant cannot be held, so it cannot be consumed (review I2).
  if (items.length !== lines.length) fail("ALLOCATION_MISMATCH", 409, "The order items do not match the reserved stock");
  const matches = lines.map(line => {
    const candidates = items.filter(item => item.variant_id === line.variant_id);
    if (candidates.length !== 1 || candidates[0].quantity !== line.quantity) fail("ALLOCATION_MISMATCH", 409, "The order items do not match the reserved stock");
    return { line, item: candidates[0] };
  });
  await lockLineBalances(client, lines);
  await client.query("UPDATE inventory_reservations SET order_id=$2,status='consumed',ended_at=now(),version=version+1 WHERE id=$1", [header.id, command.orderId]);
  const allocations: AllocationDTO[] = [];
  for (const { line, item } of matches) {
    const allocationId = randomUUID();
    await client.query("INSERT INTO inventory_allocations(id,order_item_id,variant_id,location_id,reservation_line_id,quantity) VALUES($1,$2,$3,$4,$5,$6)", [allocationId, item.id, line.variant_id, line.location_id, line.id, line.quantity]);
    await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference,reservation_line_id,allocation_id,occurred_at) VALUES($1,$2,$3,$4,$4,'consume',$5,$6,$7,$8,clock_timestamp())",
      [randomUUID(), line.variant_id, line.location_id, -line.quantity, `consume:${line.id}`, `order:${command.orderId}`, line.id, allocationId]);
    allocations.push({ allocationId, reservationLineId: line.id, orderItemId: item.id, variantId: line.variant_id, quantity: line.quantity });
  }
  return { reservationId: header.id, orderId: command.orderId, status: "consumed", changed: true, allocations };
}

// Ends an active hold: reserved drops once per line. A hold that already ended is left alone.
async function endReservation(client: PoolClient, reservationId: string, status: "released" | "expired", asOf: Date | null): Promise<ReleaseResultDTO> {
  const header = await lockHeader(client, reservationId, asOf);
  if (header.status !== "active" || (status === "expired" && !header.due)) return { reservationId, status: header.status, changed: false };
  const lines = await readLines(client, reservationId);
  await lockLineBalances(client, lines);
  await client.query("UPDATE inventory_reservations SET status=$2,ended_at=now(),version=version+1 WHERE id=$1", [reservationId, status]);
  for (const line of lines) {
    await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference,reservation_line_id,occurred_at) VALUES($1,$2,$3,0,$4,'release',$5,$6,$7,clock_timestamp())",
      [randomUUID(), line.variant_id, line.location_id, -line.quantity, `release:${line.id}`, `reservation:${reservationId}:${status}`, line.id]);
  }
  return { reservationId, status, changed: true };
}

/** Releases an active hold (checkout abandoned or cancelled before payment). Repeats have no effect. */
export async function releaseReservation(client: PoolClient, input: unknown): Promise<ReleaseResultDTO> {
  const command = parse(releaseInput, input);
  return endReservation(client, command.reservationId, "released", null);
}

const expireOneInput = z.strictObject({ reservationId: z.string().regex(UUID), asOf: z.date().optional() });
/**
 * Expires one hold inside the caller's transaction (Task 14B order-level expiry, which holds the
 * order lock first). Only a due, active hold changes; anything else is a no-op.
 */
export async function expireReservation(client: PoolClient, input: unknown): Promise<ReleaseResultDTO> {
  const command = parse(expireOneInput, input);
  return endReservation(client, command.reservationId, "expired", command.asOf ?? null);
}

/**
 * Expires active holds whose expiry has passed (by the database clock, or `asOf`). Each hold ends in
 * its own short transaction, so concurrent sweeps and checkout traffic never hold balance locks
 * across reservations. Task 12 dispatches this from the durable worker. `after` pages by keyset
 * (expires_at, id) so a caller can move past holds that failed (Task 12B review I2); `cursor` is
 * the last hold checked, or null when none were.
 */
export interface ExpiryCursor { expiresAt: Date; id: string }
export async function expireDueReservations(pool: Pool, options: { asOf?: Date; limit?: number; after?: ExpiryCursor } & RetryOptions = {}): Promise<{ checked: number; expired: number; failed: number; failures: { reservationId: string; code: string }[]; cursor: ExpiryCursor | null }> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 1000);
  const asOf = options.asOf ?? null;
  const due = (await pool.query<{ id: string; expires_at: Date }>(
    "SELECT id,expires_at FROM inventory_reservations WHERE status='active' AND expires_at<=COALESCE($1::timestamptz,now()) AND ($3::timestamptz IS NULL OR (expires_at,id)>($3::timestamptz,$4::uuid)) ORDER BY expires_at,id LIMIT $2",
    [asOf, limit, options.after?.expiresAt ?? null, options.after?.id ?? null])).rows;
  let expired = 0;
  const failures: { reservationId: string; code: string }[] = [];
  for (const { id } of due) {
    // One failing hold (drifted counters, a busy row) is reported and skipped; it must not block
    // the expiry of every hold behind it (review I3). Reconciliation surfaces the drift.
    try {
      const result = await withInventoryTransaction(pool, client => endReservation(client, id, "expired", asOf), options);
      if (result.changed) expired++;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      failures.push({ reservationId: id, code: typeof code === "string" ? code : "UNKNOWN" });
    }
  }
  const last = due[due.length - 1];
  return { checked: due.length, expired, failed: failures.length, failures, cursor: last ? { expiresAt: last.expires_at, id: last.id } : null };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Runs `work` in one READ COMMITTED transaction. A deadlock (40P01) or serialization failure
 * (40001) rolls back and retries with jittered exponential backoff, at most `maxAttempts` runs in
 * total; past the bound the caller gets 503 INVENTORY_BUSY. Every other error is rethrown at once.
 */
export async function withInventoryTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.min(Math.max(Math.trunc(options.maxAttempts ?? 4), 1), 10);
  const baseDelayMs = Math.max(options.baseDelayMs ?? 10, 0);
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    let broken = false, code: string;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      const errorCode = (error as { code?: unknown } | null)?.code;
      if (typeof errorCode !== "string" || !RETRYABLE.has(errorCode)) throw error;
      if (attempt >= maxAttempts) fail("INVENTORY_BUSY", 503, "Stock is busy; try again");
      code = errorCode;
    } finally { client.release(broken); }
    // The connection goes back to the pool before the backoff wait.
    options.onRetry?.({ attempt, code });
    await sleep(baseDelayMs * 2 ** (attempt - 1) * (1 + Math.random()));
  }
}
