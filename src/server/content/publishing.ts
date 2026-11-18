import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { appendOutboxEvent } from "../operations/outbox.ts";
import { createCMSService, type CMSItem } from "../cms/service.ts";

// Task 18A. Publishing on top of Task 08's versioned CMS (pages, immutable page_versions and the
// page_publications pointer):
// - versions: a page's history, newest first, with the live pointer marked.
// - publish: points the page at one of its versions, now or at publishAt, optionally until
//   unpublishAt. A page that is live now cannot be replaced by a future publication (it would go
//   offline until then); schedule a new version only for a page that is not live.
// - unpublish, restore (copies an old version into a new one; history is never rewritten),
//   changeSlug (keeps a 308 redirect from the old URL; the proxy serves it via the redirects table).
// - Product-referenced merchandising collections for the homepage; the public read resolves live,
//   published products and skips archived or unpublished references.
// Every write takes the page row lock, checks the page version (CAS), audits, and enqueues the
// cache-invalidation event in the same transaction (content.published / content.unpublished).
// Public reads apply the publication window (published_at <= now < scheduled_until).

import { CONTENT_INVALIDATE_KIND } from "./events.ts";
export { CONTENT_INVALIDATE_KIND };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[\p{L}\p{N}_-]{1,200}$/u;
const KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const notFound = (): never => fail("NOT_FOUND", 404, "Not found");
const conflict = (): never => fail("VERSION_CONFLICT", 409, "Content changed; reload before saving");
const iso = z.string().datetime({ offset: true });
const publishInput = z.strictObject({ pageId: z.string().regex(UUID), versionId: z.string().regex(UUID), expectedPageVersion: z.number().int().min(1), publishAt: iso.optional(), unpublishAt: iso.optional() });
const pageInput = z.strictObject({ pageId: z.string().regex(UUID), expectedPageVersion: z.number().int().min(1) });
const restoreInput = z.strictObject({ pageId: z.string().regex(UUID), versionId: z.string().regex(UUID), expectedPageVersion: z.number().int().min(1), publish: z.boolean().optional() });
const slugInput = z.strictObject({ pageId: z.string().regex(UUID), slug: z.string().regex(SLUG), expectedPageVersion: z.number().int().min(1) });
const collectionInput = z.strictObject({ key: z.string().regex(KEY), name: z.string().trim().min(1).max(200), productKeys: z.array(z.string().trim().min(1).max(128)).max(100).refine(list => new Set(list).size === list.length), expectedVersion: z.number().int().min(0) });
const publishCollectionInput = z.strictObject({ key: z.string().regex(KEY), expectedVersion: z.number().int().min(1) });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

export interface VersionDTO { id: string; version: number; title: string; createdAt: string; published: boolean; publishedAt: string | null; scheduledUntil: string | null }
export interface CollectionDTO { key: string; name: string; status: "draft" | "published" | "archived"; version: number; productKeys: string[] }
interface PageRow { id: string; kind: string; slug: string | null; status: string; version: number }

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}
async function lockPage(client: PoolClient, pageId: string, expected: number): Promise<PageRow> {
  const page = (await client.query<PageRow>("SELECT id,kind,slug,status,version FROM pages WHERE id=$1 FOR UPDATE", [pageId])).rows[0] ?? notFound();
  if (page.status === "archived") fail("CONFLICT", 409, "Archived content cannot change");
  if (page.version !== expected) conflict();
  return page;
}
async function audit(client: PoolClient, actor: string, action: string, pageId: string, changes: Record<string, unknown>): Promise<void> {
  await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,$3,'page',$4,$5,$6)",
    [randomUUID(), actor, action, pageId, `content:${randomUUID()}`, JSON.stringify(changes)]);
}
/** Bumps the page version and enqueues cache invalidation in the caller's transaction. */
async function touched(client: PoolClient, page: PageRow, topic: "content.published" | "content.unpublished", payload: Record<string, unknown>): Promise<number> {
  const next = (await client.query<{ version: number }>("UPDATE pages SET version=version+1 WHERE id=$1 RETURNING version", [page.id])).rows[0].version;
  await appendOutboxEvent(client, { topic, dedupeKey: `${topic}:${page.id}:${next}`, aggregate: { type: "page", id: page.id }, payload: { pageId: page.id, kind: page.kind, slug: page.slug, ...payload }, consumers: [CONTENT_INVALIDATE_KIND] });
  return next;
}
async function publishPointer(client: PoolClient, page: PageRow, versionId: string, publishAt: string | null, unpublishAt: string | null): Promise<void> {
  await client.query(
    `INSERT INTO page_publications(page_id,version_id,published_at,scheduled_until) VALUES($1,$2,COALESCE($3::timestamptz,now()),$4::timestamptz)
     ON CONFLICT(page_id) DO UPDATE SET version_id=excluded.version_id,published_at=excluded.published_at,scheduled_until=excluded.scheduled_until`,
    [page.id, versionId, publishAt, unpublishAt]);
  await client.query("UPDATE pages SET status='published' WHERE id=$1", [page.id]);
}

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }

export function createPublishingService({ pool, authorize }: Options) {
  const cms = createCMSService({ pool, authorize });
  return {
    async versions(headers: Headers, pageId: unknown): Promise<{ items: VersionDTO[] }> {
      await authorize(headers, "content:write");
      if (typeof pageId !== "string" || !UUID.test(pageId)) return notFound();
      if (!(await pool.query("SELECT 1 FROM pages WHERE id=$1", [pageId])).rowCount) notFound();
      const rows = (await pool.query<{ id: string; version: number; title: string; created_at: Date; published: boolean; published_at: Date | null; scheduled_until: Date | null }>(
        `SELECT v.id,v.version,v.title,v.created_at,(pub.version_id=v.id) IS TRUE AS published,
           CASE WHEN pub.version_id=v.id THEN pub.published_at END AS published_at,CASE WHEN pub.version_id=v.id THEN pub.scheduled_until END AS scheduled_until
         FROM page_versions v LEFT JOIN page_publications pub ON pub.page_id=v.page_id WHERE v.page_id=$1 ORDER BY v.version DESC LIMIT 200`, [pageId])).rows;
      return { items: rows.map(row => ({ id: row.id, version: row.version, title: row.title, createdAt: row.created_at.toISOString(), published: row.published, publishedAt: row.published_at?.toISOString() ?? null, scheduledUntil: row.scheduled_until?.toISOString() ?? null })) };
    },

    async publish(headers: Headers, input: unknown): Promise<{ pageId: string; version: number; publishedAt: string; scheduledUntil: string | null }> {
      const principal = await authorize(headers, "content:write");
      const command = parse(publishInput, input);
      const start = command.publishAt ? new Date(command.publishAt) : null, end = command.unpublishAt ? new Date(command.unpublishAt) : null;
      if (end && (end.getTime() <= Date.now() || (start && end <= start))) invalid();
      return transaction(pool, async client => {
        const page = await lockPage(client, command.pageId, command.expectedPageVersion);
        // Review I4: the homepage is always live; it cannot be scheduled or given an end time.
        if (page.kind === "homepage" && (end || (start && start.getTime() > Date.now() + 1000))) fail("HOMEPAGE_ALWAYS_LIVE", 409, "The homepage cannot be scheduled or given an end time");
        if (!(await client.query("SELECT 1 FROM page_versions WHERE id=$1 AND page_id=$2", [command.versionId, page.id])).rowCount) notFound();
        if (start && start.getTime() > Date.now() + 1000) {
          const live = (await client.query("SELECT 1 FROM page_publications WHERE page_id=$1 AND published_at<=now() AND (scheduled_until IS NULL OR scheduled_until>now())", [page.id])).rowCount;
          if (live) fail("SCHEDULE_CONFLICT", 409, "This page is live; publish the new version now or unpublish it first");
        }
        await publishPointer(client, page, command.versionId, start?.toISOString() ?? null, end?.toISOString() ?? null);
        const version = await touched(client, page, "content.published", { versionId: command.versionId });
        await audit(client, principal.userId, "content.published", page.id, { versionId: command.versionId, publishAt: command.publishAt ?? null, unpublishAt: command.unpublishAt ?? null });
        const row = (await client.query<{ published_at: Date; scheduled_until: Date | null }>("SELECT published_at,scheduled_until FROM page_publications WHERE page_id=$1", [page.id])).rows[0];
        return { pageId: page.id, version, publishedAt: row.published_at.toISOString(), scheduledUntil: row.scheduled_until?.toISOString() ?? null };
      });
    },

    async unpublish(headers: Headers, input: unknown): Promise<{ pageId: string; version: number }> {
      const principal = await authorize(headers, "content:write");
      const command = parse(pageInput, input);
      return transaction(pool, async client => {
        const page = await lockPage(client, command.pageId, command.expectedPageVersion);
        if (page.kind === "homepage") fail("CONFLICT", 409, "The homepage cannot be unpublished");
        await client.query("UPDATE pages SET status='draft' WHERE id=$1", [page.id]);
        await client.query("DELETE FROM page_publications WHERE page_id=$1", [page.id]);
        const version = await touched(client, page, "content.unpublished", {});
        await audit(client, principal.userId, "content.unpublished", page.id, {});
        return { pageId: page.id, version };
      });
    },

    /** Copies an earlier version into a new version (history is kept) and optionally publishes it. */
    async restore(headers: Headers, input: unknown): Promise<{ pageId: string; versionId: string; version: number; pageVersion: number }> {
      const principal = await authorize(headers, "content:write");
      const command = parse(restoreInput, input);
      return transaction(pool, async client => {
        const page = await lockPage(client, command.pageId, command.expectedPageVersion);
        const source = (await client.query<{ id: string }>("SELECT id FROM page_versions WHERE id=$1 AND page_id=$2", [command.versionId, page.id])).rows[0] ?? notFound();
        const next = (await client.query<{ next: number }>("SELECT COALESCE(max(version),0)+1 AS next FROM page_versions WHERE page_id=$1", [page.id])).rows[0].next;
        const versionId = randomUUID();
        await client.query(
          `INSERT INTO page_versions(id,page_id,page_kind,version,schema_version,title,subtitle,summary,body,blocks,metadata,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source,author_user_id)
           SELECT $1,page_id,page_kind,$2,schema_version,title,subtitle,summary,body,blocks,metadata,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source,$3 FROM page_versions WHERE id=$4`,
          [versionId, next, principal.userId, source.id]);
        await client.query("INSERT INTO blog_posts(version_id,page_id,author_label,category,reading_time,source_published_at,cover_media_id,cover_source) SELECT $1,page_id,author_label,category,reading_time,source_published_at,cover_media_id,cover_source FROM blog_posts WHERE version_id=$2", [versionId, source.id]);
        await client.query("INSERT INTO banners(version_id,page_id,position,sort_order,cta_label,cta_url,image_media_id,image_source) SELECT $1,page_id,position,sort_order,cta_label,cta_url,image_media_id,image_source FROM banners WHERE version_id=$2", [versionId, source.id]);
        await client.query("INSERT INTO page_version_media(version_id,media_id,role,position) SELECT $1,media_id,role,position FROM page_version_media WHERE version_id=$2", [versionId, source.id]);
        await client.query("INSERT INTO page_version_collections(version_id,collection_id) SELECT $1,collection_id FROM page_version_collections WHERE version_id=$2", [versionId, source.id]);
        if (command.publish) await publishPointer(client, page, versionId, null, null);
        // Only a published restore changes what the public sees, so only it invalidates caches.
        const pageVersion = command.publish
          ? await touched(client, page, "content.published", { versionId, restoredFrom: source.id })
          : (await client.query<{ version: number }>("UPDATE pages SET version=version+1 WHERE id=$1 RETURNING version", [page.id])).rows[0].version;
        await audit(client, principal.userId, "content.restored", page.id, { versionId, restoredFrom: source.id, published: command.publish === true });
        return { pageId: page.id, versionId, version: next, pageVersion };
      });
    },

    /** Changes a blog post's URL and keeps a permanent redirect from every earlier URL. */
    async changeSlug(headers: Headers, input: unknown): Promise<{ pageId: string; slug: string; version: number }> {
      const principal = await authorize(headers, "content:write");
      const command = parse(slugInput, input);
      return transaction(pool, async client => {
        const page = await lockPage(client, command.pageId, command.expectedPageVersion);
        if (page.kind !== "blog" || !page.slug) fail("CONFLICT", 409, "Only blog posts have editable URLs");
        if (page.slug === command.slug) return { pageId: page.id, slug: page.slug!, version: page.version };
        if ((await client.query("SELECT 1 FROM pages WHERE kind='blog' AND slug=$1", [command.slug])).rowCount) fail("CONFLICT", 409, "This URL is already used");
        const from = `/blog/${page.slug}`, to = `/blog/${command.slug}`;
        await client.query("UPDATE redirects SET active=false WHERE source_path=$1", [to]);
        await client.query("UPDATE redirects SET target_path=$2 WHERE target_path=$1 AND source_path<>$2", [from, to]);
        await client.query("INSERT INTO redirects(id,source_path,target_path,status_code,active) VALUES($1,$2,$3,308,true) ON CONFLICT(source_path) DO UPDATE SET target_path=excluded.target_path,status_code=308,active=true", [randomUUID(), from, to]);
        await client.query("UPDATE pages SET slug=$2 WHERE id=$1", [page.id, command.slug]);
        const version = await touched(client, { ...page, slug: command.slug }, "content.published", { previousSlug: page.slug });
        await audit(client, principal.userId, "content.slug_changed", page.id, { from, to });
        return { pageId: page.id, slug: command.slug, version };
      });
    },

    async saveCollection(headers: Headers, input: unknown): Promise<CollectionDTO> {
      const principal = await authorize(headers, "content:write");
      const command = parse(collectionInput, input);
      return transaction(pool, async client => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["collection:" + command.key]);
        const current = (await client.query<{ id: string; version: number; status: CollectionDTO["status"] }>("SELECT id,version,status FROM merchandising_collections WHERE key=$1 FOR UPDATE", [command.key])).rows[0];
        if ((current?.version ?? 0) !== command.expectedVersion) conflict();
        const products = command.productKeys.length ? (await client.query<{ id: string; public_key: string }>("SELECT id,public_key FROM products WHERE public_key=ANY($1::text[])", [command.productKeys])).rows : [];
        if (products.length !== command.productKeys.length) notFound();
        const id = current?.id ?? randomUUID();
        if (current) await client.query("UPDATE merchandising_collections SET name=$2,version=version+1 WHERE id=$1", [id, command.name]);
        else await client.query("INSERT INTO merchandising_collections(id,key,name) VALUES($1,$2,$3)", [id, command.key, command.name]);
        await client.query("DELETE FROM collection_products WHERE collection_id=$1", [id]);
        const byKey = new Map(products.map(row => [row.public_key, row.id]));
        for (const [position, key] of command.productKeys.entries())
          await client.query("INSERT INTO collection_products(collection_id,product_id,position) VALUES($1,$2,$3)", [id, byKey.get(key), position]);
        await audit(client, principal.userId, "content.collection_saved", id, { key: command.key, products: command.productKeys.length });
        const saved = (await client.query<{ version: number; status: CollectionDTO["status"] }>("SELECT version,status FROM merchandising_collections WHERE id=$1", [id])).rows[0];
        return { key: command.key, name: command.name, status: saved.status, version: saved.version, productKeys: command.productKeys };
      });
    },

    async publishCollection(headers: Headers, input: unknown): Promise<{ key: string; version: number }> {
      const principal = await authorize(headers, "content:write");
      const command = parse(publishCollectionInput, input);
      return transaction(pool, async client => {
        const current = (await client.query<{ id: string; version: number }>("SELECT id,version FROM merchandising_collections WHERE key=$1 FOR UPDATE", [command.key])).rows[0] ?? notFound();
        if (current.version !== command.expectedVersion) conflict();
        // Draft isolation (18A ruling I6): the public reads only this snapshot, so later saves stay drafts.
        await client.query("DELETE FROM collection_published_products WHERE collection_id=$1", [current.id]);
        await client.query("INSERT INTO collection_published_products(collection_id,product_id,position) SELECT collection_id,product_id,(row_number() OVER (ORDER BY position,product_id))-1 FROM collection_products WHERE collection_id=$1", [current.id]);
        const version = (await client.query<{ version: number }>("UPDATE merchandising_collections SET status='published',published_name=name,published_at=now(),version=version+1 WHERE id=$1 RETURNING version", [current.id])).rows[0].version;
        await appendOutboxEvent(client, { topic: "content.published", dedupeKey: `collection:${current.id}:${version}`, aggregate: { type: "collection", id: current.id }, payload: { collectionKey: command.key }, consumers: [CONTENT_INVALIDATE_KIND] });
        await audit(client, principal.userId, "content.collection_published", current.id, { key: command.key });
        return { key: command.key, version };
      });
    },

    /** Public: the published snapshot of a collection with its live, published products in order; missing ones are skipped. */
    async readCollection(key: string): Promise<{ key: string; name: string; products: CMSItem[] } | null> {
      if (!KEY.test(key)) return null;
      const collection = (await pool.query<{ id: string; published_name: string }>("SELECT id,published_name FROM merchandising_collections WHERE key=$1 AND status='published'", [key])).rows[0];
      if (!collection) return null;
      return { key, name: collection.published_name, products: await cms.publicCollectionProducts(collection.id) };
    },
  };
}
export type PublishingService = ReturnType<typeof createPublishingService>;
