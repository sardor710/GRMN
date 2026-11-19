import type { Pool, PoolClient } from "pg";
import { assertSnapshot } from "./extract.ts";
import type { Snapshot } from "./extract.ts";
import { validateSnapshot } from "./validate.ts";
import type { ValidatedRecord } from "./validate.ts";
import { canonical, compareExact, databaseText, stableId, storedRecordPayload, text } from "./map.ts";
import { advanceSequenceOnClient, archiveRecordId, issueResolution, expectedOrderLines, parseManifest, receiptKey, reconcileOnClient, rollbackSafely, targetFingerprint, verifyCheckpoint } from "./reconcile.ts";
import type { Manifest, Receipt, Reconciliation } from "./reconcile.ts";

export interface ImportOptions {
  offline: true; batchSize?: number;
  onBatchCommitted?: (checkpoint: { cursor: number; total: number }) => void | Promise<void>;
}

async function insertTarget(client: PoolClient, record: ValidatedRecord): Promise<void> {
  const p = record.payload, id = record.targetId, projection = record.projection;
  if (record.entity === "products") {
    const variant = stableId(id, "default-variant"), price = stableId(id, "price");
    await client.query("INSERT INTO products(id,public_key,slug,name,description,family,badge,price_suffix,status,is_featured,specs,features,in_the_box,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",
      [id, p.id, text(p.slug), p.name, text(p.description) ?? "", text(p.family), text(p.badge), text(p.priceSuffix), projection.status, p.isFeatured === true, canonical(p.specs ?? []), canonical(p.features ?? []), canonical(p.inTheBox ?? []), canonical(p), text(p.seoTitle), text(p.seoDescription), canonical(p.focusKeywords ?? []), text(p.canonicalUrl), p.noIndex === true, text(p.ogImage)]);
    await client.query("INSERT INTO product_variants(id,product_id,sku,status,is_default) VALUES($1,$2,$3,$4,true)", [variant, id, p.sku, projection.status === "published" ? "active" : projection.status]);
    await client.query("INSERT INTO prices(id,variant_id,amount_minor,compare_at_minor) VALUES($1,$2,$3,$4)", [price, variant, projection.amountMinor, projection.compareAtMinor]);
  } else if (record.entity === "clients") {
    await client.query("INSERT INTO customer_profiles(id,legacy_client_id,name,email,entered_phone,avatar,status,profile_state,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'provisional',COALESCE($8::timestamptz,now()))", [id, p.id, p.name, projection.email, p.phone, text(p.avatar), p.status, text(p.createdAt)]);
    if (text(p.notes)) await client.query("INSERT INTO customer_private_notes(id,profile_id,legacy_author_label,body) VALUES($1,$2,'legacy source',$3)", [stableId(id, "notes"), id, p.notes]);
  } else if (["blogs", "banners", "homepage"].includes(record.entity)) {
    const version = stableId(id, "version-1"), kind = String(projection.kind);
    await client.query("INSERT INTO pages(id,key,kind,slug) VALUES($1,$2,$3,$4)", [id, record.identity, kind, text(p.slug)]);
    await client.query("INSERT INTO page_versions(id,page_id,page_kind,version,title,subtitle,summary,body,blocks,legacy_content,seo_title,seo_description,focus_keywords) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [version, id, kind, text(p.title) ?? "Homepage", text(p.subtitle), text(p.excerpt) ?? "", text(p.content) ?? "", kind === "homepage" ? canonical([p]) : "[]", canonical(p), text(p.seoTitle), text(p.seoDescription), canonical(p.focusKeywords ?? [])]);
    if (kind === "blog") await client.query("INSERT INTO blog_posts(version_id,page_id,author_label,category,reading_time,source_published_at,cover_source) VALUES($1,$2,$3,$4,$5,$6,$7)", [version, id, text(p.author), text(p.category), p.readingTime == null ? null : String(p.readingTime), text(p.publishedAt), text(p.coverImage)]);
    if (kind === "banner") await client.query("INSERT INTO banners(version_id,page_id,position,sort_order,cta_label,cta_url,image_source) VALUES($1,$2,$3,$4,$5,$6,$7)", [version, id, text(p.position) ?? "legacy", typeof p.order === "number" && Number.isInteger(p.order) && p.order >= 0 ? p.order : 0, text(p.ctaLabel), text(p.ctaUrl), text(p.image)]);
  } else if (record.entity === "orders") {
    const lines = expectedOrderLines(record);
    const summary = { source: p, lines, restriction: "unverified legacy history; no item-level financial allocations" };
    await client.query("INSERT INTO orders(id,order_number,contact_name,contact_phone,contact_email,data_quality,total_minor,legacy_summary,order_status,payment_status,payment_mode,placed_at) VALUES($1,$2,$3,$4,$5,'legacy_incomplete',$6,$7,$8,'unpaid','legacy_unknown',$9)", [id, p.orderNumber, p.clientName, text(p.clientPhone), text(p.clientEmail), projection.totalMinor, canonical(summary), projection.orderStatus, text(p.createdAt)]);
    if (p.shippingAddress !== undefined && p.shippingAddress !== null) await client.query("INSERT INTO order_addresses(id,order_id,kind,legacy_raw) VALUES($1,$2,'legacy_unstructured',$3)", [stableId(id, "address"), id, typeof p.shippingAddress === "string" ? p.shippingAddress : canonical(p.shippingAddress)]);
  } else if (record.entity === "discounts") {
    await client.query("INSERT INTO promotions(id,code,name,kind,percentage_bps,scope,status,stackable,starts_at,ends_at,usage_limit,per_customer_limit,legacy_used_count) VALUES($1,$2,$3,'percentage',$4,'all','draft',$5,$6,$7,$8,$9,$10)", [id, String(p.code).trim().toLowerCase(), text(p.description) ?? String(p.code), projection.percentageBps, projection.stackable, text(p.startDate), text(p.expiresAt), p.usageLimit ?? null, p.perCustomerLimit ?? null, projection.historicalUsage]);
  } else if (record.entity === "activities") {
    await client.query("INSERT INTO audit_events(id,legacy_actor_label,action,target_type,legacy_target_label,dedupe_key,redacted_changes,occurred_at) VALUES($1,$2,$3,'legacy',$4,$5,$6,$7)", [id, text(p.adminName), p.action, text(p.target), `legacy:${id}`, canonical({ source: "legacy", original: p }), text(p.timestamp)]);
  } else throw new Error("UNSUPPORTED_TARGET");
}

export async function importSnapshot(pool: Pool, snapshot: Snapshot, options: ImportOptions): Promise<Reconciliation> {
  if (options.offline !== true) throw new Error("Import requires explicitly offline operation");
  assertSnapshot(snapshot);
  const validation = validateSnapshot(snapshot), batchSize = options.batchSize ?? 50;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Invalid batch size");
  const priority: Record<string, number> = { products: 0, clients: 1, blogs: 2, banners: 2, homepage: 2, orders: 3, discounts: 4, activities: 5 };
  const rank = (entity: string) => Object.hasOwn(priority, entity) ? priority[entity] : 6;
  const records = [...validation.records].sort((a, b) => rank(a.entity) - rank(b.entity) || compareExact(receiptKey(a.entity, a.sourceKey), receiptKey(b.entity, b.sourceKey)));
  const client = await pool.connect();
  const state = { unsafe: false }; let original: unknown;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [`legacy-import:${snapshot.namespace}`]);
    const existing = await client.query("SELECT id,status,source_checksum,manifest FROM migration_runs WHERE source_namespace=$1 ORDER BY created_at,id", [snapshot.namespace]);
    if (existing.rowCount && (existing.rowCount !== 1 || existing.rows[0].source_checksum !== snapshot.sourceChecksum || parseManifest(existing.rows[0].manifest).artifactChecksum !== snapshot.artifactChecksum)) throw new Error("SOURCE_CHANGED: explicit merge/reconciliation mode required");
    const runId = existing.rows[0]?.id ?? stableId(snapshot.namespace, snapshot.artifactChecksum, "run");
    let manifest: Manifest = existing.rows[0] ? parseManifest(existing.rows[0].manifest) : { version: 1, artifactChecksum: snapshot.artifactChecksum, cursor: 0, receipts: {} };
    if (existing.rows[0] && ["completed", "quarantined", "failed"].includes(existing.rows[0].status)) return await reconcileOnClient(client, snapshot);
    if (!existing.rowCount) await client.query("INSERT INTO migration_runs(id,source_namespace,source_version,source_checksum,manifest) VALUES($1,$2,'legacy-v2',$3,$4)", [runId, snapshot.namespace, snapshot.sourceChecksum, canonical(manifest)]);
    await verifyCheckpoint(client, snapshot, runId, records, manifest);
    await client.query("UPDATE migration_runs SET status='running' WHERE id=$1", [runId]);
    // Resume never rewrites existing targets, including edits made after a crash.
    while (manifest.cursor < records.length) {
      const batch = records.slice(manifest.cursor, manifest.cursor + batchSize), next: Manifest = { ...manifest, receipts: { ...manifest.receipts }, cursor: manifest.cursor + batch.length };
      await client.query("BEGIN");
      try {
        for (const record of batch) {
          const archiveId = archiveRecordId(snapshot, record.entity, record.sourceKey);
          await client.query("INSERT INTO legacy_source_records(id,run_id,entity,source_key,record_checksum,payload) VALUES($1,$2,$3,$4,$5,$6)", [archiveId, runId, record.entity, record.sourceKey, record.recordChecksum, canonical(storedRecordPayload(record))]);
          if (record.disposition === "importable") await insertTarget(client, record);
          const targetType = (record.disposition === "importable" ? record.targetType : "legacy_source_records") as Receipt["targetType"];
          const targetId = record.disposition === "importable" ? record.targetId : archiveId;
          await client.query("INSERT INTO legacy_id_map(id,source_namespace,entity,source_key,run_id,record_id,target_type,target_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [stableId(snapshot.namespace, record.entity, record.sourceKey, "map"), snapshot.namespace, record.entity, record.sourceKey, runId, archiveId, targetType, targetId]);
          for (const item of record.issues) {
            const resolution = issueResolution(snapshot, item);
            await client.query("INSERT INTO migration_issues(id,run_id,entity,source_key,field_path,code,severity,safe_message,disposition,resolution,resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$6,$8,$9,CASE WHEN $8='resolved' THEN now() END)", [stableId(runId, record.entity, record.sourceKey, item.code, item.fieldPath), runId, record.entity, record.sourceKey, databaseText(item.fieldPath), item.code, item.severity, resolution ? "resolved" : "open", resolution ? canonical(resolution) : null]);
          }
          next.receipts[receiptKey(record.entity, record.sourceKey)] = { entity: record.entity, sourceKey: record.sourceKey, targetType, targetId, fingerprint: "", disposition: record.disposition };
        }
        // Deferred schema triggers seal order/content snapshots at commit.
        // Run them before hashing, after every child in this batch exists.
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        for (const record of batch) {
          const receipt = next.receipts[receiptKey(record.entity, record.sourceKey)];
          receipt.fingerprint = await targetFingerprint(client, receipt.targetType, receipt.targetId);
        }
        await client.query("UPDATE migration_runs SET manifest=$2,counts=$3 WHERE id=$1", [runId, canonical(next), canonical(validation.counts)]);
        await client.query("COMMIT"); manifest = next;
      } catch (error) { await rollbackSafely(client, state); throw error; }
      await options.onBatchCommitted?.({ cursor: manifest.cursor, total: records.length });
    }
    // setval is deliberately outside a batch: it is nontransactional and must
    // never lower an existing sequence. A failed rehearsal remains resumable.
    await advanceSequenceOnClient(client, state);
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try {
      const result = await reconcileOnClient(client, snapshot);
      const status = result.mismatches.length ? "failed" : result.parityReady ? "completed" : "quarantined";
      await client.query("UPDATE migration_runs SET status=$2,counts=$3,finished_at=now() WHERE id=$1", [runId, status, canonical(result.counts)]);
      await client.query("COMMIT");
      return { ...result, status, ready: status === "completed" };
    } catch (error) { await rollbackSafely(client, state); throw error; }
  } catch (error) { original = error; throw error; } finally {
    try {
      if (!state.unsafe) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [`legacy-import:${snapshot.namespace}`]);
    } catch (error) { state.unsafe = true; if (!original) throw error; }
    finally { client.release(state.unsafe); }
  }
}
