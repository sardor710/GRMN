import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";
import { normaliseMedium, platformFromUtm } from "./classify.ts";
import { parseRange, STORE_TIME_ZONE, type Authorize } from "./reports.ts";

// Owner 2026-11-25: Admin ▸ Campaign links. A saved link is a store page plus utm_source / utm_medium /
// utm_campaign. Values are stored exactly as the classifier will read them back from the link, so a link's
// clicks are the visits with the same (platform, medium, campaign). Read: orders:read; change: content:write.

const invalid = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };
const createSchema = z.strictObject({
  platform: z.string().min(1).max(40), medium: z.string().min(1).max(40), campaign: z.string().min(1).max(120),
  targetPath: z.string().min(1).max(512), label: z.string().max(120).optional(),
});
const archiveSchema = z.strictObject({ id: z.string().uuid() });

/** lowercase, runs of other characters → "-", trimmed of dashes, at most `max` characters. */
export const slug = (value: string, max: number) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");

function safeTarget(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000- ]/.test(path)) invalid();
  if (/^\/(?:(?:en|ru|kk)\/)?(?:admin|api)(?:[/?#]|$)/i.test(path)) invalid();
  const url = new URL(path, "https://store.invalid");
  if (url.origin !== "https://store.invalid") invalid();
  for (const name of [...url.searchParams.keys()]) if (name.startsWith("utm_")) url.searchParams.delete(name);
  return url.pathname + url.search;
}

export interface LinkDTO { id: string; platform: string; medium: string; campaign: string; targetPath: string; label: string | null; url: string; clicks: number; createdAt: string }
interface LinkRow { id: string; platform: string; medium: string; campaign: string; target_path: string; label: string | null; created_at: Date; clicks?: number }

export function createTrafficLinks({ pool, authorize, origin }: { pool: Pick<Pool, "query">; authorize: Authorize; origin: string }) {
  const toDTO = (row: LinkRow): LinkDTO => {
    const url = new URL(row.target_path, origin);
    url.searchParams.set("utm_source", row.platform.toLowerCase());
    url.searchParams.set("utm_medium", row.medium);
    url.searchParams.set("utm_campaign", row.campaign);
    return { id: row.id, platform: row.platform, medium: row.medium, campaign: row.campaign, targetPath: row.target_path, label: row.label, url: url.toString(), clicks: row.clicks ?? 0, createdAt: row.created_at.toISOString() };
  };

  async function list(headers: Headers, input: unknown): Promise<{ links: LinkDTO[] }> {
    await authorize(headers, "orders:read");
    const range = parseRange(input);
    const rows = (await pool.query<LinkRow>(
      `SELECT l.*, (SELECT count(*)::int FROM traffic_sessions s
                     WHERE s.platform = l.platform AND s.medium = l.medium AND s.campaign = l.campaign
                       AND s.started_at >= ($1::date)::timestamp AT TIME ZONE '${STORE_TIME_ZONE}'
                       AND s.started_at < ($2::date + 1)::timestamp AT TIME ZONE '${STORE_TIME_ZONE}') AS clicks
         FROM traffic_links l WHERE l.archived_at IS NULL ORDER BY l.created_at DESC LIMIT 500`, [range.from, range.to])).rows;
    return { links: rows.map(toDTO) };
  }

  async function create(headers: Headers, input: unknown): Promise<LinkDTO> {
    const principal = await authorize(headers, "content:write");
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return invalid();
    const source = slug(parsed.data.platform, 40), medium = normaliseMedium(slug(parsed.data.medium, 40)), campaign = slug(parsed.data.campaign, 60);
    if (!source || !medium || !campaign) return invalid();
    const platform = platformFromUtm(source), targetPath = safeTarget(parsed.data.targetPath);
    const label = parsed.data.label?.trim() || null;
    const inserted = (await pool.query<LinkRow>(
      `INSERT INTO traffic_links(id, platform, medium, campaign, target_path, label, created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (platform, medium, campaign, target_path) WHERE archived_at IS NULL DO NOTHING RETURNING *`,
      [randomUUID(), platform, medium, campaign, targetPath, label, principal.userId])).rows[0];
    const row = inserted ?? (await pool.query<LinkRow>(
      "SELECT * FROM traffic_links WHERE platform=$1 AND medium=$2 AND campaign=$3 AND target_path=$4 AND archived_at IS NULL",
      [platform, medium, campaign, targetPath])).rows[0];
    return toDTO(row);
  }

  async function archive(headers: Headers, input: unknown): Promise<{ archived: boolean }> {
    await authorize(headers, "content:write");
    const parsed = archiveSchema.safeParse(input);
    if (!parsed.success) return invalid();
    const result = await pool.query("UPDATE traffic_links SET archived_at = now() WHERE id=$1 AND archived_at IS NULL", [parsed.data.id]);
    if (!result.rowCount) throw new AuthFailure("NOT_FOUND", 404, "Link not found");
    return { archived: true };
  }

  return { list, create, archive };
}
