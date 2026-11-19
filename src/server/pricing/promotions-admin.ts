import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";

// Owner 2026-11-19: discounts and promotions are managed from the admin on PostgreSQL. The Discounts
// screen keeps its legacy shape (code, type, value, minSpend, limits, applyType, targetSkus, dates,
// isStackable, status); this maps it onto the promotions tables that quotes and checkout already
// apply (codes are stored lowercase: customers' codes are lowercased before lookup). Scope "skus"
// links promotion_variants; category scope needs catalog categories, which this store has not set
// up, so it is refused with a clear message. Promotions are commerce history and can never be
// deleted (promotions_no_delete), so "delete" archives the code: checkout refuses it and the list
// hides it. "Expired" means the end date has passed; choosing it ends the code now.

export interface DiscountDTO {
  id: string; version: number; code: string; description: string; type: "percentage" | "fixed"; value: number;
  minSpend: number; usageLimit?: number; perCustomerLimit?: number; usageCount: number; applyType: "all" | "skus";
  targetCategories: string[]; targetSkus: string[]; startDate?: string; expiresAt?: string; isStackable: boolean;
  status: "active" | "disabled" | "expired"; createdAt: string;
}
interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const major = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!/^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$/.test(text)) { ctx.addIssue({ code: "custom", message: "Use an exact amount with at most two decimals" }); return z.NEVER; }
  return text;
});
const minor = (text: string) => { const [whole, cents = ""] = text.split("."); return (BigInt(whole) * BigInt(100) + BigInt(cents.padEnd(2, "0"))).toString(); };
const optionalCount = z.union([z.number().int().positive(), z.literal(0), z.null()]).optional().transform(value => value ? value : null);
const input = z.object({
  id: z.uuid().optional(), version: z.number().int().positive().optional(),
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,64}$/, "Codes use letters, digits, - and _ (2–64 characters)"),
  description: z.string().trim().max(500).optional(), type: z.enum(["percentage", "fixed"]).default("percentage"), value: major,
  minSpend: major.optional(), usageLimit: optionalCount, perCustomerLimit: optionalCount,
  applyType: z.enum(["all", "categories", "skus"]).default("all"), targetCategories: z.array(z.string().max(200)).max(100).optional(), targetSkus: z.array(z.string().trim().min(1).max(128)).max(500).optional(),
  startDate: z.string().max(40).optional(), expiresAt: z.string().max(40).optional(), isStackable: z.boolean().optional(),
  status: z.enum(["active", "disabled", "expired"]).default("active"),
  usageCount: z.number().optional(), createdAt: z.string().optional(),
}).strict();
const STATUS_TO_DB = { active: "active", disabled: "draft", expired: "draft" } as const;
const STATUS_FROM_DB: Record<string, DiscountDTO["status"]> = { active: "active", draft: "disabled", archived: "expired" };
const date = (value: string | undefined, field: string): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fail("INVALID_INPUT", 400, `${field} is not a valid date`);
};

const SELECT = `SELECT p.*,p.fixed_minor::text AS fixed,p.minimum_spend_minor::text AS minimum,
  (p.legacy_used_count+(SELECT count(*) FROM promotion_redemptions r WHERE r.promotion_id=p.id AND r.status='used'))::int AS used,
  COALESCE((SELECT array_agg(v.sku ORDER BY v.sku) FROM promotion_variants x JOIN product_variants v ON v.id=x.variant_id WHERE x.promotion_id=p.id),'{}') AS skus
  FROM promotions p`;
function dto(row: Record<string, unknown>): DiscountDTO {
  const ends = row.ends_at instanceof Date ? row.ends_at : null, status = STATUS_FROM_DB[String(row.status)] ?? "disabled";
  return {
    id: String(row.id), version: Number(row.version), code: String(row.code).toUpperCase(), description: String(row.name ?? ""),
    type: row.kind === "fixed" ? "fixed" : "percentage",
    value: row.kind === "fixed" ? Number(row.fixed) / 100 : Number(row.percentage_bps) / 100,
    minSpend: Number(row.minimum) / 100, ...(row.usage_limit ? { usageLimit: Number(row.usage_limit) } : {}), ...(row.per_customer_limit ? { perCustomerLimit: Number(row.per_customer_limit) } : {}),
    usageCount: Number(row.used), applyType: row.scope === "variants" ? "skus" : "all", targetCategories: [], targetSkus: (row.skus as string[]) ?? [],
    ...(row.starts_at instanceof Date ? { startDate: row.starts_at.toISOString() } : {}), ...(ends ? { expiresAt: ends.toISOString() } : {}),
    isStackable: row.stackable === true,
    // An active code past its end date is shown as expired (checkout already refuses it).
    status: ends && ends.getTime() <= Date.now() ? "expired" : status,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export function createPromotionsAdmin({ pool, authorize }: Options) {
  async function tx<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK").catch(() => {}); if ((error as { code?: string }).code === "23505") return fail("CONFLICT", 409, "This code already exists"); throw error; }
    finally { client.release(); }
  }
  const audit = (client: PoolClient, principal: Principal, action: string, id: string, fields: Record<string, unknown>) =>
    client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,$3,'promotion',$4,$5,$6)", [randomUUID(), principal.userId, action, id, randomUUID(), JSON.stringify(fields)]);
  return {
    async list(headers: Headers): Promise<DiscountDTO[]> {
      await authorize(headers, "catalog:read");
      return (await pool.query(`${SELECT} WHERE p.status<>'archived' ORDER BY p.created_at DESC,p.id`)).rows.map(dto);
    },
    async save(headers: Headers, raw: unknown): Promise<DiscountDTO> {
      const principal = await authorize(headers, "catalog:write");
      const parsed = input.safeParse(raw);
      if (!parsed.success) return fail("INVALID_INPUT", 400, parsed.error.issues.map(i => `${i.path.join(".") || "input"}: ${i.message}`).slice(0, 3).join("; "));
      const d = parsed.data;
      if (d.applyType === "categories") return fail("INVALID_INPUT", 400, "Category-based discounts need catalog categories, which this store does not use yet; apply the code to all products or to selected SKUs");
      if (d.type === "percentage" && !(Number(d.value) > 0 && Number(d.value) <= 100)) return fail("INVALID_INPUT", 400, "A percentage discount must be more than 0 and at most 100");
      if (d.type === "fixed" && !(Number(d.value) > 0)) return fail("INVALID_INPUT", 400, "A fixed discount must be more than 0 KZT");
      let starts = date(d.startDate, "Start date"), ends = date(d.expiresAt, "Expiry date");
      if (d.status === "expired") { const now = new Date().toISOString(); if (!ends || ends > now) ends = now; if (starts && starts >= ends) starts = null; }
      else if (starts && ends && ends <= starts) return fail("INVALID_INPUT", 400, "The expiry date must be after the start date");
      if (d.applyType === "skus" && !d.targetSkus?.length) return fail("INVALID_INPUT", 400, "Choose at least one SKU for a SKU-based discount");
      return tx(async client => {
        const old = d.id ? (await client.query("SELECT * FROM promotions WHERE id=$1 FOR UPDATE", [d.id])).rows[0] : undefined;
        if (d.id && !old) return fail("NOT_FOUND", 404, "Discount was not found");
        if (old && d.version !== Number(old.version)) return fail("VERSION_CONFLICT", 409, "This discount changed; reload before saving");
        const id = old?.id ?? randomUUID();
        const values = [id, d.code.toLowerCase(), d.description || d.code.toUpperCase(), d.type, d.type === "fixed" ? minor(d.value) : null, d.type === "percentage" ? Math.round(Number(d.value) * 100) : null,
          d.minSpend ? minor(d.minSpend) : "0", d.applyType === "skus" ? "variants" : "all", STATUS_TO_DB[d.status], d.isStackable ?? false, starts, ends, d.usageLimit, d.perCustomerLimit];
        if (old) await client.query(`UPDATE promotions SET code=$2,name=$3,kind=$4,fixed_minor=$5,percentage_bps=$6,minimum_spend_minor=$7,scope=$8,status=$9,stackable=$10,starts_at=$11,ends_at=$12,usage_limit=$13,per_customer_limit=$14,version=version+1 WHERE id=$1`, values);
        else await client.query(`INSERT INTO promotions(id,code,name,kind,fixed_minor,percentage_bps,minimum_spend_minor,scope,status,stackable,starts_at,ends_at,usage_limit,per_customer_limit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, values);
        await client.query("DELETE FROM promotion_variants WHERE promotion_id=$1", [id]);
        if (d.applyType === "skus") {
          const wanted = [...new Set(d.targetSkus!.map(s => s.toLowerCase()))];
          const found = (await client.query<{ id: string; sku: string }>("SELECT id,lower(sku) AS sku FROM product_variants WHERE lower(sku)=ANY($1::text[]) AND status<>'archived'", [wanted])).rows;
          const missing = d.targetSkus!.filter(s => !found.some(f => f.sku === s.toLowerCase()));
          if (missing.length) return fail("INVALID_INPUT", 400, `Unknown SKU: ${missing.slice(0, 5).join(", ")}`);
          for (const variant of found) await client.query("INSERT INTO promotion_variants(promotion_id,variant_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, variant.id]);
        }
        await audit(client, principal, old ? "promotion.updated" : "promotion.created", id, { code: d.code.toLowerCase(), status: STATUS_TO_DB[d.status] });
        return dto((await client.query(`${SELECT} WHERE p.id=$1`, [id])).rows[0]);
      });
    },
    /** "Delete": promotions cannot be deleted (commerce history), so the code is archived and hidden. */
    async remove(headers: Headers, id: string): Promise<{ deleted: true; usedBefore: boolean }> {
      const principal = await authorize(headers, "catalog:write");
      if (!z.uuid().safeParse(id).success) return fail("INVALID_INPUT", 400, "Invalid discount id");
      return tx(async client => {
        const row = (await client.query("SELECT id,code,status FROM promotions WHERE id=$1 FOR UPDATE", [id])).rows[0] ?? fail("NOT_FOUND", 404, "Discount was not found");
        const usedBefore = Boolean((await client.query("SELECT 1 FROM promotion_redemptions WHERE promotion_id=$1 LIMIT 1", [id])).rowCount);
        if (row.status !== "archived") await client.query("UPDATE promotions SET status='archived',version=version+1 WHERE id=$1", [id]);
        await audit(client, principal, "promotion.deleted", id, { code: row.code, usedBefore });
        return { deleted: true as const, usedBefore };
      });
    },
  };
}
