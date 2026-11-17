import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";

// Task 11A. Every stock change is an append-only stock_movements row; migration 0008 applies
// each movement to inventory_balances in the same transaction and rejects direct counter
// patches. Owner decision O08 keeps one stock location ("main") until another is approved.

export const MAIN_LOCATION_KEY = "main";
const MAX_DELTA = 1_000_000;
const MAX_ON_HAND = 2_000_000_000;
const RECENT_MOVEMENTS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StockDTO { variantId: string; locationKey: string; onHand: number; reserved: number; available: number; version: number }
export interface StockMovementDTO { id: string; reason: string; deltaOnHand: number; deltaReserved: number; sourceReference: string | null; actorUserId: string | null; createdAt: string }
export interface StockDetailDTO extends StockDTO { movements: StockMovementDTO[] }
export interface AdjustmentResultDTO { movementId: string; replayed: boolean; stock: StockDTO }
export interface StockDriftDTO { variantId: string; locationId: string; onHand: number; reserved: number; ledgerOnHand: number; ledgerReserved: number; activeReserved: number }
export interface ReconciliationDTO { checkedBalances: number; drift: StockDriftDTO[]; checkedAt: string }
export interface OpeningImportReport {
  runId: string; recorded: number; zero: number; alreadyRecorded: number;
  conflicts: { sourceKey: string; variantId: string; reason: string }[];
  issues: { sourceKey: string; reason: string }[];
}

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (message = "Invalid or unknown fields"): never => fail("INVALID_INPUT", 400, message);
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");

const adjustInput = z.strictObject({
  variantId: z.string().regex(UUID),
  delta: z.number().int().refine(value => value !== 0 && Math.abs(value) <= MAX_DELTA),
  // Staff record deliveries ("receive", positive only) and counted corrections ("adjust").
  // Reservation, consumption and opening movements belong to their own workflows.
  reason: z.enum(["receive", "adjust"]),
  note: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_:-]{8,128}$/),
  expectedVersion: z.number().int().min(0).optional(),
}).refine(value => value.reason !== "receive" || value.delta > 0);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}

export async function mainLocation(client: PoolClient): Promise<string> {
  await client.query("INSERT INTO stock_locations(id,key,name) VALUES($1,$2,'Main stock location') ON CONFLICT (key) DO NOTHING", [randomUUID(), MAIN_LOCATION_KEY]);
  return (await client.query<{ id: string }>("SELECT id FROM stock_locations WHERE key=$1", [MAIN_LOCATION_KEY])).rows[0].id;
}

interface BalanceRow { on_hand: number; reserved: number; version: number }
// Creates the zero balance if needed and locks it; `created` means no balance existed before.
async function lockBalance(client: PoolClient, variantId: string, locationId: string): Promise<BalanceRow & { created: boolean }> {
  const created = (await client.query("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [variantId, locationId])).rowCount === 1;
  const row = (await client.query<BalanceRow>("SELECT on_hand,reserved,version FROM inventory_balances WHERE variant_id=$1 AND location_id=$2 FOR UPDATE", [variantId, locationId])).rows[0];
  return { ...row, created };
}

const stockDTO = (variantId: string, row: BalanceRow | undefined): StockDTO => ({
  variantId, locationKey: MAIN_LOCATION_KEY, onHand: row?.on_hand ?? 0, reserved: row?.reserved ?? 0,
  available: (row?.on_hand ?? 0) - (row?.reserved ?? 0), version: row?.version ?? 0,
});

export function createInventoryService({ pool, authorize }: Options) {
  async function readBalance(client: PoolClient | Pool, variantId: string): Promise<BalanceRow | undefined> {
    return (await client.query<BalanceRow>("SELECT b.on_hand,b.reserved,b.version FROM inventory_balances b JOIN stock_locations l ON l.id=b.location_id WHERE b.variant_id=$1 AND l.key=$2", [variantId, MAIN_LOCATION_KEY])).rows[0];
  }

  return {
    async getStock(headers: Headers, variantId: unknown): Promise<StockDetailDTO> {
      await authorize(headers, "catalog:read");
      const id = parse(z.string().regex(UUID), variantId);
      if (!(await pool.query("SELECT 1 FROM product_variants WHERE id=$1", [id])).rowCount) notFound();
      const movements = await pool.query<{ id: string; reason: string; delta_on_hand: number; delta_reserved: number; source_reference: string | null; actor_user_id: string | null; created_at: Date }>(
        "SELECT m.id,m.reason,m.delta_on_hand,m.delta_reserved,m.source_reference,m.actor_user_id,m.created_at FROM stock_movements m JOIN stock_locations l ON l.id=m.location_id WHERE m.variant_id=$1 AND l.key=$2 ORDER BY m.created_at DESC,m.id DESC LIMIT $3",
        [id, MAIN_LOCATION_KEY, RECENT_MOVEMENTS]);
      return {
        ...stockDTO(id, await readBalance(pool, id)),
        movements: movements.rows.map(row => ({ id: row.id, reason: row.reason, deltaOnHand: row.delta_on_hand, deltaReserved: row.delta_reserved, sourceReference: row.source_reference, actorUserId: row.actor_user_id, createdAt: row.created_at.toISOString() })),
      };
    },

    // Audited staff stock adjustment. The idempotency key is scoped to the acting staff user:
    // a retry with the same request returns the original movement; different content is a 409.
    async adjust(headers: Headers, input: unknown): Promise<AdjustmentResultDTO> {
      const principal = await authorize(headers, "inventory:write");
      const command = parse(adjustInput, input);
      const dedupeKey = `adjust:${principal.userId}:${command.idempotencyKey}`;
      try {
        return await transaction(pool, async client => {
          if (!(await client.query("SELECT 1 FROM product_variants WHERE id=$1", [command.variantId])).rowCount) notFound();
          const locationId = await mainLocation(client);
          const before = await lockBalance(client, command.variantId, locationId);
          const prior = (await client.query<{ id: string; variant_id: string; location_id: string; delta_on_hand: number; reason: string }>("SELECT id,variant_id,location_id,delta_on_hand,reason FROM stock_movements WHERE dedupe_key=$1", [dedupeKey])).rows[0];
          if (prior) {
            const same = prior.variant_id === command.variantId && prior.location_id === locationId && prior.delta_on_hand === command.delta && prior.reason === command.reason;
            if (!same) fail("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was used for a different adjustment");
            return { movementId: prior.id, replayed: true, stock: stockDTO(command.variantId, before) };
          }
          const currentVersion = before.created ? 0 : before.version;
          if (command.expectedVersion !== undefined && command.expectedVersion !== currentVersion) fail("VERSION_CONFLICT", 409, "Stock changed; reload and try again");
          const onHand = before.on_hand + command.delta;
          if (onHand < before.reserved) fail("INSUFFICIENT_STOCK", 409, "Stock cannot go below the reserved quantity");
          if (onHand > MAX_ON_HAND) invalid("Stock exceeds the supported range");
          const movementId = randomUUID();
          await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference,actor_user_id,occurred_at) VALUES($1,$2,$3,$4,0,$5,$6,'staff-adjustment',$7,clock_timestamp())",
            [movementId, command.variantId, locationId, command.delta, command.reason, dedupeKey, principal.userId]);
          const after = (await client.query<BalanceRow>("SELECT on_hand,reserved,version FROM inventory_balances WHERE variant_id=$1 AND location_id=$2", [command.variantId, locationId])).rows[0];
          await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'inventory.adjusted','product_variant',$3,$4,$5)",
            [randomUUID(), principal.userId, command.variantId, `inventory-adjusted:${movementId}`, JSON.stringify({ movementId, locationKey: MAIN_LOCATION_KEY, reason: command.reason, delta: command.delta, note: command.note, beforeOnHand: before.on_hand, afterOnHand: after.on_hand, reserved: after.reserved, version: after.version })]);
          return { movementId, replayed: false, stock: stockDTO(command.variantId, after) };
        });
      } catch (error) {
        // Same key racing on a different variant or location: never a second effect.
        if ((error as { constraint?: string } | null)?.constraint === "stock_movements_dedupe_key_unique") fail("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was used for a different adjustment");
        if ((error as { constraint?: string } | null)?.constraint === "inventory_balances_counts_valid") fail("INSUFFICIENT_STOCK", 409, "Stock cannot go below the reserved quantity");
        throw error;
      }
    },

    // Read-only comparison of each balance with its ledger sums and its active reservation lines.
    async reconcile(headers: Headers): Promise<ReconciliationDTO> {
      await authorize(headers, "inventory:write");
      return reconcileStock(pool);
    },
  };
}
export type InventoryService = ReturnType<typeof createInventoryService>;

export async function reconcileStock(pool: Pool | PoolClient): Promise<ReconciliationDTO> {
  const rows = (await pool.query<{ variant_id: string; location_id: string; on_hand: number; reserved: number; ledger_on_hand: string; ledger_reserved: string; active_reserved: string; checked: string }>(`
    WITH ledger AS (SELECT variant_id,location_id,sum(delta_on_hand) AS on_hand,sum(delta_reserved) AS reserved FROM stock_movements GROUP BY variant_id,location_id),
    holds AS (SELECT l.variant_id,l.location_id,sum(l.quantity) AS reserved FROM reservation_lines l JOIN inventory_reservations r ON r.id=l.reservation_id AND r.status='active' GROUP BY l.variant_id,l.location_id),
    compared AS (SELECT b.variant_id,b.location_id,b.on_hand,b.reserved,COALESCE(m.on_hand,0) AS ledger_on_hand,COALESCE(m.reserved,0) AS ledger_reserved,COALESCE(h.reserved,0) AS active_reserved
      FROM inventory_balances b LEFT JOIN ledger m USING (variant_id,location_id) LEFT JOIN holds h USING (variant_id,location_id))
    SELECT c.*,(SELECT count(*) FROM inventory_balances) AS checked FROM compared c
    WHERE c.on_hand<>c.ledger_on_hand OR c.reserved<>c.ledger_reserved OR c.reserved<>c.active_reserved
    UNION ALL SELECT NULL,NULL,NULL,NULL,NULL,NULL,NULL,(SELECT count(*) FROM inventory_balances)
    ORDER BY 1 NULLS LAST,2`)).rows;
  const checked = Number(rows[rows.length - 1].checked);
  return {
    checkedBalances: checked,
    drift: rows.filter(row => row.variant_id !== null).map(row => ({ variantId: row.variant_id, locationId: row.location_id, onHand: row.on_hand, reserved: row.reserved, ledgerOnHand: Number(row.ledger_on_hand), ledgerReserved: Number(row.ledger_reserved), activeReserved: Number(row.active_reserved) })),
    checkedAt: new Date().toISOString(),
  };
}

// Opening-balance import for one completed legacy migration run (owner decision O08:
// preserve opening stock with provenance). Each importable product's default variant gets
// at most one opening movement naming the source record and checksum. Records with unusable
// stock values or balances that already have ledger history are reported, never guessed.
export async function importOpeningBalances(pool: Pool, input: { runId: string }): Promise<OpeningImportReport> {
  const run = (await pool.query<{ status: string }>("SELECT status FROM migration_runs WHERE id=$1", [input.runId])).rows[0];
  if (run?.status !== "completed") throw new Error("Opening balances require a completed migration run");
  const report: OpeningImportReport = { runId: input.runId, recorded: 0, zero: 0, alreadyRecorded: 0, conflicts: [], issues: [] };
  await transaction(pool, async client => {
    const records = (await client.query<{ source_namespace: string; source_key: string; record_checksum: string; payload: { data?: Record<string, unknown> }; variant_id: string }>(
      "SELECT m.source_namespace,m.source_key,r.record_checksum,r.payload,v.id AS variant_id FROM legacy_id_map m JOIN legacy_source_records r ON r.id=m.record_id AND r.run_id=m.run_id JOIN product_variants v ON v.product_id=m.target_id AND v.is_default AND v.status<>'archived' WHERE m.run_id=$1 AND m.entity='products' AND m.target_type='products' ORDER BY v.id",
      [input.runId])).rows;
    const locationId = await mainLocation(client);
    for (const record of records) {
      const data = record.payload?.data;
      if (!data || typeof data !== "object" || "$encoding" in data) { report.issues.push({ sourceKey: record.source_key, reason: "Encoded or missing source data needs manual review" }); continue; }
      const stock = data.stock;
      if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0 || stock > MAX_ON_HAND) { report.issues.push({ sourceKey: record.source_key, reason: "Stock is missing or not a non-negative integer" }); continue; }
      const sourceReference = `legacy:${record.source_namespace}/products/${record.source_key}@sha256:${record.record_checksum};run:${input.runId}`;
      await lockBalance(client, record.variant_id, locationId);
      const dedupeKey = `opening:${record.variant_id}:${locationId}`;
      const opening = (await client.query<{ delta_on_hand: number; source_reference: string }>("SELECT delta_on_hand,source_reference FROM stock_movements WHERE dedupe_key=$1", [dedupeKey])).rows[0];
      if (opening) {
        if (opening.delta_on_hand === stock && opening.source_reference === sourceReference) report.alreadyRecorded++;
        else report.conflicts.push({ sourceKey: record.source_key, variantId: record.variant_id, reason: "A different opening balance is already recorded" });
        continue;
      }
      if (stock === 0) { report.zero++; continue; }
      if ((await client.query("SELECT 1 FROM stock_movements WHERE variant_id=$1 AND location_id=$2 LIMIT 1", [record.variant_id, locationId])).rowCount) {
        report.conflicts.push({ sourceKey: record.source_key, variantId: record.variant_id, reason: "The balance already has ledger history" });
        continue;
      }
      await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,$6)",
        [randomUUID(), record.variant_id, locationId, stock, dedupeKey, sourceReference]);
      report.recorded++;
    }
  });
  return report;
}
