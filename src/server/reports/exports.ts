import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { enqueueJob } from "../operations/outbox.ts";

// Task 18B. Asynchronous, filtered, private, expiring CSV exports.
// request (exports:create, fresh MFA) records a pending export_jobs row and enqueues the worker job
// in one transaction. The worker writes the CSV as a private media asset (never served publicly) and
// completes the job. Only the requester can download, only while they still hold exports:create
// (revocation is immediate) and only before expiry (default 24 h). The sweep marks expired jobs,
// archives their file record and deletes the file. Every cell is quoted, and a cell that a
// spreadsheet would read as a formula (= + - @ tab CR) gets a leading apostrophe. Order exports hold
// order facts only: no customer names, phones, e-mails or addresses.

export const EXPORT_GENERATE_KIND = "exports.generate";
export const EXPORT_EXPIRE_KIND = "exports.expire";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 50_000;
const RETRYABLE = new Set(["40P01", "40001", "57P01", "53300"]);
const strictDay = (value: string) => { const date = new Date(value + "T00:00:00Z"); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; };
// Each kind also needs the matching read permission (review I9).
const KIND_PERMISSION: Record<string, Permission> = { orders: "orders:read", catalog: "catalog:read" };
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");
const requestInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("catalog") }),
  z.strictObject({ kind: z.literal("orders"), from: z.string().regex(DATE), to: z.string().regex(DATE), timeZone: z.string().min(1).max(64).optional() }),
]);
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

/** One CSV cell: always quoted; formula-looking text is neutralised with a leading apostrophe. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u00a0]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
const csv = (rows: unknown[][]) => rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
const major = (minor: string) => { const value = BigInt(minor), sign = value < BigInt(0) ? "-" : "", abs = value < BigInt(0) ? -value : value; return `${sign}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, "0")}`; };
const exportsDir = (storageDir: string) => path.join(/*turbopackIgnore: true*/ storageDir, "private", "exports");

export interface ExportDTO { id: string; kind: string; status: "pending" | "running" | "completed" | "failed" | "expired"; createdAt: string; completedAt: string | null; expiresAt: string }
interface JobRow { id: string; requested_by_user_id: string; kind: string; filters: Record<string, string>; status: ExportDTO["status"]; result_media_id: string | null; completed_at: Date | null; expires_at: Date; created_at: Date }
const dto = (row: JobRow): ExportDTO => ({ id: row.id, kind: row.kind, status: row.status, createdAt: row.created_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null, expiresAt: row.expires_at.toISOString() });

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal>; storageDir: string; ttlMs?: number; maxRows?: number }

export function createExportService({ pool, authorize, storageDir, ttlMs = 24 * 60 * 60 * 1000, maxRows = MAX_ROWS }: Options) {
  return {
    async request(headers: Headers, input: unknown): Promise<ExportDTO> {
      const principal = await authorize(headers, "exports:create");
      const command = parse(requestInput, input);
      await authorize(headers, KIND_PERMISSION[command.kind]);
      if (command.kind === "orders") {
        if (!strictDay(command.from) || !strictDay(command.to)) invalid();
        const span = (Date.parse(command.to) - Date.parse(command.from)) / 86_400_000;
        if (!(span >= 0 && span <= 366)) invalid();
        if (command.timeZone && !(await pool.query("SELECT 1 FROM pg_timezone_names WHERE name=$1", [command.timeZone])).rowCount) invalid();
      }
      const { kind, ...filters } = command;
      if (await countRows(pool, kind, filters as Record<string, string>) > maxRows) fail("EXPORT_TOO_LARGE", 409, "This export is too large; narrow the date range");
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query("BEGIN");
        const id = randomUUID();
        const row = (await client.query<JobRow>(
          "INSERT INTO export_jobs(id,requested_by_user_id,kind,filters,expires_at) VALUES($1,$2,$3,$4,now()+($5::bigint*interval '1 millisecond')) RETURNING *",
          [id, principal.userId, kind, JSON.stringify(filters), ttlMs])).rows[0];
        await enqueueJob(client, { kind: EXPORT_GENERATE_KIND, dedupeKey: `export:${id}`, payload: { exportId: id, maxRows } });
        await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'export.requested','export',$3,$4,$5)",
          [randomUUID(), principal.userId, id, `export-requested:${id}`, JSON.stringify({ kind, filters })]);
        await client.query("COMMIT");
        return dto(row);
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { broken = true; }
        throw error;
      } finally { client.release(broken); }
    },

    async list(headers: Headers): Promise<{ items: ExportDTO[] }> {
      const principal = await authorize(headers, "exports:create");
      const rows = (await pool.query<JobRow>("SELECT * FROM export_jobs WHERE requested_by_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50", [principal.userId])).rows;
      return { items: rows.map(dto) };
    },

    /** The requester's completed, unexpired file. Permission is checked on every download. */
    async download(headers: Headers, exportId: unknown): Promise<{ filename: string; mimeType: "text/csv"; bytes: Buffer }> {
      const principal = await authorize(headers, "exports:create");
      if (typeof exportId !== "string" || !UUID.test(exportId)) return notFound();
      const row = (await pool.query<JobRow & { storage_key: string | null; expired: boolean }>(
        "SELECT e.*,m.storage_key,e.expires_at<=now() AS expired FROM export_jobs e LEFT JOIN media_assets m ON m.id=e.result_media_id WHERE e.id=$1 AND e.requested_by_user_id=$2",
        [exportId, principal.userId])).rows[0] ?? notFound();
      if (row.expired || row.status === "expired") fail("EXPORT_EXPIRED", 410, "This export has expired; request a new one");
      if (row.status !== "completed" || !row.storage_key) fail("EXPORT_NOT_READY", 409, "This export is not ready");
      await authorize(headers, KIND_PERMISSION[row.kind]);
      const bytes = await readFile(path.join(exportsDir(storageDir), row.storage_key!)).catch((error: { code?: string }) => {
        if (error?.code === "ENOENT") return fail("EXPORT_EXPIRED", 410, "This export is no longer available; request a new one");
        throw error;
      });
      await pool.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'export.downloaded','export',$3,$4,'{}')",
        [randomUUID(), principal.userId, row.id, `export-downloaded:${randomUUID()}`]);
      return { filename: `${row.kind}-${row.created_at.toISOString().slice(0, 10)}-${row.id.slice(0, 8)}.csv`, mimeType: "text/csv", bytes };
    },
  };
}
export type ExportService = ReturnType<typeof createExportService>;

async function countRows(db: Pool | PoolClient, kind: string, filters: Record<string, string>): Promise<number> {
  if (kind === "catalog") return (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM products")).rows[0].n;
  return (await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM orders o WHERE COALESCE(o.placed_at,o.created_at)>=(($1::date)::timestamp AT TIME ZONE $3) AND COALESCE(o.placed_at,o.created_at)<((($2::date)+1)::timestamp AT TIME ZONE $3)",
    [filters.from, filters.to, filters.timeZone ?? "Asia/Almaty"])).rows[0].n;
}

async function rowsFor(client: PoolClient, job: JobRow): Promise<unknown[][]> {
  if (job.kind === "catalog") {
    const rows = (await client.query<{ public_key: string; name: string; sku: string | null; status: string; amount: string | null }>(
      `SELECT p.public_key,p.name,v.sku,p.status,pr.amount_minor::text AS amount FROM products p
       LEFT JOIN LATERAL (SELECT * FROM product_variants WHERE product_id=p.id AND is_default ORDER BY (status='archived'),created_at DESC,id DESC LIMIT 1) v ON true
       LEFT JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market='default'
       ORDER BY p.public_key LIMIT $1`, [MAX_ROWS])).rows;
    return [["product_key", "name", "sku", "status", "price_kzt"], ...rows.map(row => [row.public_key, row.name, row.sku, row.status, row.amount === null ? "" : major(row.amount)])];
  }
  const filters = job.filters, zone = filters.timeZone ?? "Asia/Almaty";
  const rows = (await client.query<{ order_number: string; placed_at: Date | null; order_status: string; payment_status: string; fulfillment_status: string; payment_mode: string; currency: string; total: string; items: number }>(
    `SELECT o.order_number,o.placed_at,o.order_status,o.payment_status,o.fulfillment_status,o.payment_mode,o.currency,o.total_minor::text AS total,
       (SELECT COALESCE(sum(quantity),0)::int FROM order_items WHERE order_id=o.id) AS items
     FROM orders o WHERE COALESCE(o.placed_at,o.created_at)>=(($1::date)::timestamp AT TIME ZONE $3) AND COALESCE(o.placed_at,o.created_at)<((($2::date)+1)::timestamp AT TIME ZONE $3)
     ORDER BY COALESCE(o.placed_at,o.created_at),o.id LIMIT $4`, [filters.from, filters.to, zone, MAX_ROWS])).rows;
  return [["order_number", "placed_at", "order_status", "payment_status", "fulfillment_status", "payment_mode", "currency", "total", "items"],
    ...rows.map(row => [row.order_number, row.placed_at?.toISOString() ?? "", row.order_status, row.payment_status, row.fulfillment_status, row.payment_mode, row.currency, major(row.total), row.items])];
}

/** Worker: builds one pending export into a private file and completes it. Idempotent per job. */
export async function generateExport(pool: Pool, storageDir: string, exportId: string, options: { maxRows?: number } = {}): Promise<{ status: ExportDTO["status"] }> {
  try { return await buildExport(pool, storageDir, exportId, options.maxRows ?? MAX_ROWS); }
  catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "string" && (RETRYABLE.has(code) || code.startsWith("08"))) throw error;
    // A permanent failure (bad filters, too many rows, an unwritable file) is final; the user sees it.
    await pool.query("UPDATE export_jobs SET status='failed' WHERE id=$1 AND status IN ('pending','running')", [exportId]);
    return { status: "failed" };
  }
}

async function buildExport(pool: Pool, storageDir: string, exportId: string, maxRows: number): Promise<{ status: ExportDTO["status"] }> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const job = (await client.query<JobRow & { expired: boolean }>("SELECT *,expires_at<=now() AS expired FROM export_jobs WHERE id=$1 FOR UPDATE", [exportId])).rows[0] ?? notFound();
    if (!["pending", "running"].includes(job.status) || job.expired) { await client.query("COMMIT"); return { status: job.status }; }
    if (await countRows(client, job.kind, job.filters) > maxRows) fail("EXPORT_TOO_LARGE", 409, "This export is too large");
    const body = Buffer.from("﻿" + csv(await rowsFor(client, job)), "utf8");
    const mediaId = randomUUID(), key = `${job.id}.csv`, dir = exportsDir(storageDir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, key), body);
    await client.query(
      "INSERT INTO media_assets(id,storage_namespace,storage_key,kind,visibility,status,mime_type,byte_size,checksum_sha256) VALUES($1,'exports',$2,'document','private','ready','text/csv',$3,$4)",
      [mediaId, key, body.length, createHash("sha256").update(body).digest("hex")]);
    await client.query("UPDATE export_jobs SET status='completed',result_media_id=$2,completed_at=now() WHERE id=$1", [job.id, mediaId]);
    await client.query("COMMIT");
    return { status: "completed" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}

/**
 * Worker sweep: expires due exports, then for every expired job whose file record is still ready
 * (including one a crash left behind) archives the record and deletes the file in one transaction.
 * A failed delete rolls the archive back, so the next sweep tries again.
 */
export async function expireExports(pool: Pool, storageDir: string, limit = 200): Promise<{ expired: number }> {
  const due = (await pool.query<{ id: string }>(
    "UPDATE export_jobs SET status='expired' WHERE id IN (SELECT id FROM export_jobs WHERE status IN ('pending','running','completed') AND expires_at<=now() ORDER BY expires_at,id LIMIT $1) RETURNING id", [limit])).rows;
  const files = (await pool.query<{ media_id: string; storage_key: string }>(
    "SELECT m.id AS media_id,m.storage_key FROM export_jobs e JOIN media_assets m ON m.id=e.result_media_id WHERE e.status='expired' AND m.status='ready' ORDER BY e.expires_at,e.id LIMIT $1", [limit])).rows;
  for (const file of files) {
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      await client.query("UPDATE media_assets SET status='archived',updated_at=now() WHERE id=$1 AND status='ready'", [file.media_id]);
      await unlink(path.join(exportsDir(storageDir), file.storage_key)).catch((error: { code?: string }) => { if (error?.code !== "ENOENT") throw error; });
      await client.query("COMMIT");
    } catch {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
    } finally { client.release(broken); }
  }
  return { expired: due.length };
}
