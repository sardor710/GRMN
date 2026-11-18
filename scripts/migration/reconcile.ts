import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { assertSnapshot } from "./extract.ts";
import type { Snapshot } from "./extract.ts";
import { validateSnapshot } from "./validate.ts";
import { asObject, canonical, compareExact, databaseText, moneyToMinor, sha256, stableId, storedRecordPayload, text } from "./map.ts";
import type { JsonObject } from "./map.ts";
import type { ValidatedRecord } from "./validate.ts";

const receiptSchema = z.object({ entity: z.string(), sourceKey: z.string(), targetType: z.enum(["products", "pages", "customer_profiles", "orders", "promotions", "audit_events", "legacy_source_records"]), targetId: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), disposition: z.enum(["importable", "quarantined", "excluded"]) }).strict();
const manifestSchema = z.object({ version: z.literal(1), artifactChecksum: z.string(), cursor: z.number().int().nonnegative(), receipts: z.record(z.string(), receiptSchema) }).strict();
export type Receipt = z.infer<typeof receiptSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export const parseManifest = (value: unknown): Manifest => manifestSchema.parse(value);
export const archiveRecordId = (snapshot: Snapshot, entity: string, key: string): string => stableId(snapshot.namespace, entity, key, "archive");
export const receiptKey = (entity: string, sourceKey: string): string => JSON.stringify([entity, sourceKey]);

export interface Mismatch { code: string; entity: string }
export interface Reconciliation {
  runId: string | null; status: string; ready: boolean; parityReady: boolean; mismatches: Mismatch[];
  counts: Record<string, { expected: number; imported: number; quarantined: number; excluded: number; missing: number }>;
  fieldCoverage: { compared: number; mismatched: number; normalizedCompared: number; normalizedMismatched: number; archivedOnlyFields: number }; blockers: number;
  financial: { currency: "KZT"; orders: number; sourceTotalMinor: string; targetTotalMinor: string; lineSubtotalMinor: string; quarantinedTotalMinor: string; quarantinedOrders: number; unvaluedOrders: number };
}

// This closed registry is shared by the initial receipt and later reconciliation.
// SQL identifiers never come from archive input.
export async function targetFingerprint(client: PoolClient, type: Receipt["targetType"], id: string): Promise<string> {
  let rows: unknown[];
  if (type === "products") {
    rows = [
      (await client.query("SELECT * FROM products WHERE id=$1", [id])).rows,
      (await client.query("SELECT * FROM product_variants WHERE product_id=$1 ORDER BY id", [id])).rows,
      (await client.query("SELECT p.* FROM prices p JOIN product_variants v ON v.id=p.variant_id WHERE v.product_id=$1 ORDER BY p.id", [id])).rows,
      (await client.query("SELECT * FROM product_categories WHERE product_id=$1 ORDER BY category_id", [id])).rows,
      (await client.query("SELECT * FROM product_activities WHERE product_id=$1 ORDER BY activity_id", [id])).rows,
      (await client.query("SELECT * FROM product_media WHERE product_id=$1 ORDER BY id", [id])).rows,
      (await client.query("SELECT * FROM product_relations WHERE source_product_id=$1 OR target_product_id=$1 ORDER BY source_product_id,target_product_id,relation_type", [id])).rows,
      (await client.query("SELECT * FROM product_attribute_values WHERE product_id=$1 ORDER BY attribute_id", [id])).rows,
      (await client.query("SELECT * FROM product_options WHERE product_id=$1 ORDER BY id", [id])).rows,
      (await client.query("SELECT * FROM option_values WHERE product_id=$1 ORDER BY id", [id])).rows,
      (await client.query("SELECT * FROM variant_option_values WHERE product_id=$1 ORDER BY variant_id,option_id", [id])).rows,
    ];
  } else if (type === "pages") {
    rows = [
      (await client.query("SELECT * FROM pages WHERE id=$1", [id])).rows,
      (await client.query("SELECT * FROM page_versions WHERE page_id=$1 ORDER BY id", [id])).rows,
      (await client.query("SELECT * FROM blog_posts WHERE page_id=$1 ORDER BY version_id", [id])).rows,
      (await client.query("SELECT * FROM banners WHERE page_id=$1 ORDER BY version_id", [id])).rows,
      (await client.query("SELECT * FROM page_publications WHERE page_id=$1", [id])).rows,
      (await client.query("SELECT m.* FROM page_version_media m JOIN page_versions v ON v.id=m.version_id WHERE v.page_id=$1 ORDER BY m.version_id,m.media_id,m.role", [id])).rows,
      (await client.query("SELECT m.* FROM page_version_collections m JOIN page_versions v ON v.id=m.version_id WHERE v.page_id=$1 ORDER BY m.version_id,m.collection_id", [id])).rows,
    ];
  } else if (type === "customer_profiles") {
    rows = [(await client.query("SELECT * FROM customer_profiles WHERE id=$1", [id])).rows, (await client.query("SELECT * FROM customer_private_notes WHERE profile_id=$1 ORDER BY id", [id])).rows];
  } else if (type === "orders") {
    rows = [(await client.query("SELECT * FROM orders WHERE id=$1", [id])).rows, (await client.query("SELECT * FROM order_addresses WHERE order_id=$1 ORDER BY kind", [id])).rows,
      (await client.query("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id", [id])).rows, (await client.query("SELECT * FROM order_events WHERE order_id=$1 ORDER BY id", [id])).rows,
      (await client.query("SELECT * FROM order_adjustments WHERE order_id=$1 ORDER BY id", [id])).rows,
      (await client.query("SELECT * FROM payment_attempts WHERE order_id=$1 ORDER BY id", [id])).rows,
      (await client.query("SELECT * FROM shipments WHERE order_id=$1 ORDER BY id", [id])).rows,
    ];
  } else if (type === "promotions") rows = [(await client.query("SELECT * FROM promotions WHERE id=$1", [id])).rows, (await client.query("SELECT * FROM promotion_categories WHERE promotion_id=$1 ORDER BY category_id", [id])).rows, (await client.query("SELECT * FROM promotion_variants WHERE promotion_id=$1 ORDER BY variant_id", [id])).rows];
  else if (type === "audit_events") rows = [(await client.query("SELECT * FROM audit_events WHERE id=$1", [id])).rows];
  else if (type === "legacy_source_records") rows = [(await client.query("SELECT * FROM legacy_source_records WHERE id=$1", [id])).rows];
  else throw new Error("UNSUPPORTED_TARGET");
  // pg preserves bigint as text; JSON conversion normalizes Date objects only.
  return sha256(canonical(JSON.parse(JSON.stringify(rows))));
}

export function expectedOrderLines(record: ValidatedRecord): JsonObject[] {
  return (record.payload.items as JsonObject[]).map((value, index) => { const item = asObject(value); return { productKey: item.productId, name: item.name, quantity: item.quantity, unitPriceMinor: moneyToMinor(record.numberLexemes[`items[${index}].price`] ?? item.price) }; });
}

async function normalizedParity(client: PoolClient, record: ValidatedRecord): Promise<{ compared: number; mismatched: number; archivedOnly: number }> {
  const p = record.payload, v = record.projection, id = record.targetId;
  let compared = 0, mismatched = 0;
  const sourceFields = new Set<string>();
  const check = (actual: Record<string, unknown> | undefined, expected: Record<string, unknown>, fields: string[]) => {
    for (const field of fields) sourceFields.add(field);
    for (const [key, value] of Object.entries(expected)) { compared++; if (!actual || canonical(actual[key]) !== canonical(value)) mismatched++; }
  };
  if (record.entity === "products") {
    check((await client.query("SELECT * FROM products WHERE id=$1", [id])).rows[0], { public_key: p.id, slug: text(p.slug), name: p.name, description: text(p.description) ?? "", family: text(p.family), badge: text(p.badge), price_suffix: text(p.priceSuffix), status: v.status, is_featured: p.isFeatured === true, specs: p.specs ?? [], features: p.features ?? [], in_the_box: p.inTheBox ?? [], legacy_content: p, seo_title: text(p.seoTitle), seo_description: text(p.seoDescription), focus_keywords: p.focusKeywords ?? [], canonical_url: text(p.canonicalUrl), no_index: p.noIndex === true, og_image_source: text(p.ogImage) }, ["id", "slug", "name", "description", "family", "badge", "priceSuffix", "status", "isFeatured", "specs", "features", "inTheBox", "seoTitle", "seoDescription", "focusKeywords", "canonicalUrl", "noIndex", "ogImage"]);
    check((await client.query("SELECT * FROM product_variants WHERE id=$1", [stableId(id, "default-variant")])).rows[0], { product_id: id, sku: p.sku, status: v.status === "published" ? "active" : v.status, is_default: true }, ["sku"]);
    check((await client.query("SELECT * FROM prices WHERE id=$1", [stableId(id, "price")])).rows[0], { amount_minor: v.amountMinor, compare_at_minor: v.compareAtMinor, currency: "KZT" }, ["price", "originalPrice", "currency"]);
  } else if (record.entity === "clients") {
    check((await client.query("SELECT * FROM customer_profiles WHERE id=$1", [id])).rows[0], { legacy_client_id: p.id, name: p.name, email: v.email, entered_phone: p.phone, avatar: text(p.avatar), status: p.status, profile_state: "provisional", user_id: null, normalized_phone: null }, ["id", "name", "email", "phone", "avatar", "status"]);
    if (text(p.notes)) check((await client.query("SELECT * FROM customer_private_notes WHERE profile_id=$1", [id])).rows[0], { body: p.notes, author_user_id: null }, ["notes"]);
    if (text(p.createdAt)) { const actual = (await client.query("SELECT created_at FROM customer_profiles WHERE id=$1", [id])).rows[0]; check(actual ? { created_at: actual.created_at.toISOString() } : undefined, { created_at: new Date(String(p.createdAt)).toISOString() }, ["createdAt"]); }
  } else if (record.targetType === "pages") {
    check((await client.query("SELECT * FROM pages WHERE id=$1", [id])).rows[0], { key: record.identity, kind: v.kind, slug: text(p.slug), status: "draft" }, ["id", "slug"]);
    check((await client.query("SELECT * FROM page_versions WHERE page_id=$1", [id])).rows[0], { title: text(p.title) ?? "Homepage", subtitle: text(p.subtitle), summary: text(p.excerpt) ?? "", body: text(p.content) ?? "", blocks: v.kind === "homepage" ? [p] : [], legacy_content: p, seo_title: text(p.seoTitle), seo_description: text(p.seoDescription), focus_keywords: p.focusKeywords ?? [] }, ["title", "subtitle", "excerpt", "content", "seoTitle", "seoDescription", "focusKeywords"]);
    if (record.entity === "banners") check((await client.query("SELECT * FROM banners WHERE page_id=$1", [id])).rows[0], { position: text(p.position) ?? "legacy", sort_order: p.order ?? 0, cta_label: text(p.ctaLabel), cta_url: text(p.ctaUrl), image_source: text(p.image) }, ["position", "order", "ctaLabel", "ctaUrl", "image"]);
    if (record.entity === "blogs") check((await client.query("SELECT * FROM blog_posts WHERE page_id=$1", [id])).rows[0], { author_label: text(p.author), category: text(p.category), reading_time: p.readingTime == null ? null : String(p.readingTime), cover_source: text(p.coverImage) }, ["author", "category", "readingTime", "coverImage"]);
  } else if (record.entity === "orders") {
    check((await client.query("SELECT * FROM orders WHERE id=$1", [id])).rows[0], { order_number: p.orderNumber, contact_name: p.clientName, contact_phone: text(p.clientPhone), contact_email: text(p.clientEmail), data_quality: "legacy_incomplete", currency: "KZT", total_minor: v.totalMinor, order_status: v.orderStatus, payment_status: "unpaid", payment_mode: "legacy_unknown", fulfillment_status: "unfulfilled", user_id: null, profile_id: null }, ["orderNumber", "clientName", "clientPhone", "clientEmail", "total", "currency"]);
    if (p.shippingAddress != null) check((await client.query("SELECT * FROM order_addresses WHERE order_id=$1", [id])).rows[0], { kind: "legacy_unstructured", legacy_raw: typeof p.shippingAddress === "string" ? p.shippingAddress : canonical(p.shippingAddress) }, ["shippingAddress"]);
  } else if (record.entity === "discounts") {
    check((await client.query("SELECT * FROM promotions WHERE id=$1", [id])).rows[0], { code: String(p.code).trim().toLowerCase(), name: text(p.description) ?? p.code, kind: "percentage", percentage_bps: v.percentageBps, scope: "all", status: "draft", stackable: v.stackable, usage_limit: p.usageLimit ?? null, per_customer_limit: p.perCustomerLimit ?? null, legacy_used_count: v.historicalUsage }, ["code", "description", "type", "value", "applyType", "isStackable", "usageLimit", "perCustomerLimit", "usageCount"]);
  } else if (record.entity === "activities") check((await client.query("SELECT * FROM audit_events WHERE id=$1", [id])).rows[0], { legacy_actor_label: text(p.adminName), action: p.action, target_type: "legacy", legacy_target_label: text(p.target), redacted_changes: { source: "legacy", original: p }, actor_user_id: null }, ["adminName", "action", "target"]);
  return { compared, mismatched, archivedOnly: Object.keys(p).filter(key => !sourceFields.has(key)).length };
}

function leafCount(value: unknown): number {
  if (value === null || typeof value !== "object") return 1;
  const values = Object.values(value);
  return values.length ? values.reduce<number>((count, item) => count + leafCount(item), 0) : 1;
}

export async function reconcileOnClient(client: PoolClient, snapshot: Snapshot): Promise<Reconciliation> {
  assertSnapshot(snapshot);
  const validation = validateSnapshot(snapshot);
  const runs = await client.query("SELECT id,status,manifest FROM migration_runs WHERE source_namespace=$1 ORDER BY created_at,id", [snapshot.namespace]);
  const result: Reconciliation = { runId: runs.rows[0]?.id ?? null, status: runs.rows[0]?.status ?? "missing", ready: false, parityReady: false, mismatches: [], counts: Object.create(null), fieldCoverage: { compared: 0, mismatched: 0, normalizedCompared: 0, normalizedMismatched: 0, archivedOnlyFields: 0 }, blockers: 0, financial: { currency: "KZT", orders: 0, sourceTotalMinor: "0", targetTotalMinor: "0", lineSubtotalMinor: "0", quarantinedTotalMinor: "0", quarantinedOrders: 0, unvaluedOrders: 0 } };
  if (runs.rowCount !== 1) { result.mismatches.push({ code: "RUN_MISSING_OR_AMBIGUOUS", entity: "migration" }); return result; }
  const manifest = parseManifest(runs.rows[0].manifest);
  if (manifest.artifactChecksum !== snapshot.artifactChecksum) throw new Error("SOURCE_CHANGED");
  const staged = await client.query("SELECT s.*,m.target_type,m.target_id,m.source_namespace FROM legacy_source_records s LEFT JOIN legacy_id_map m ON m.record_id=s.id WHERE s.run_id=$1", [result.runId]);
  const stagedRows = new Map(staged.rows.map(row => [receiptKey(row.entity, row.source_key), row]));
  if (staged.rowCount !== validation.records.length || Object.keys(manifest.receipts).length !== validation.records.length || manifest.cursor !== validation.records.length) result.mismatches.push({ code: "COUNT_MISMATCH", entity: "migration" });
  const blockers = await client.query("SELECT count(*)::text AS count FROM migration_issues WHERE run_id=$1 AND severity='blocker' AND disposition='open'", [result.runId]);
  result.blockers = Number(blockers.rows[0].count);
  if (!await issueParity(client, result.runId!, validation.records)) result.mismatches.push({ code: "ISSUE_MISMATCH", entity: "migration" });
  let sourceTotal = BigInt(0), targetTotal = BigInt(0), lineTotal = BigInt(0);
  let quarantinedTotal = BigInt(0);
  for (const record of validation.records.filter(record => record.entity === "orders")) {
    if (record.disposition === "quarantined") result.financial.quarantinedOrders++;
    if (record.projection.totalMinor === null) result.financial.unvaluedOrders++;
    else {
      const amount = BigInt(String(record.projection.totalMinor)); sourceTotal += amount;
      if (record.disposition === "quarantined") quarantinedTotal += amount;
    }
  }
  for (const record of validation.records) {
    const key = receiptKey(record.entity, record.sourceKey), row = stagedRows.get(key), receipt = manifest.receipts[key];
    const count = result.counts[record.entity] ??= { expected: 0, imported: 0, quarantined: 0, excluded: 0, missing: 0 };
    count.expected++;
    if (!row || !receipt) { count.missing++; result.mismatches.push({ code: "SOURCE_OR_MAP_MISSING", entity: record.entity }); continue; }
    count[record.disposition === "importable" ? "imported" : record.disposition]++;
    result.fieldCoverage.compared += leafCount(record.payload);
    if (row.record_checksum !== record.recordChecksum || canonical(row.payload) !== canonical(storedRecordPayload(record))) { result.fieldCoverage.mismatched++; result.mismatches.push({ code: "SOURCE_FIELD_MISMATCH", entity: record.entity }); }
    const expectedType = record.disposition === "importable" ? record.targetType : "legacy_source_records";
    const expectedId = record.disposition === "importable" ? record.targetId : archiveRecordId(snapshot, record.entity, record.sourceKey);
    if (row.id !== archiveRecordId(snapshot, record.entity, record.sourceKey) || row.source_namespace !== snapshot.namespace || row.target_type !== expectedType || row.target_id !== expectedId || receipt.targetType !== expectedType || receipt.targetId !== expectedId || receipt.entity !== record.entity || receipt.sourceKey !== record.sourceKey || receipt.disposition !== record.disposition) result.mismatches.push({ code: "MAPPING_MISMATCH", entity: record.entity });
    if (await targetFingerprint(client, receipt.targetType, receipt.targetId) !== receipt.fingerprint) result.mismatches.push({ code: "TARGET_DRIFT", entity: record.entity });
    if (record.disposition === "importable") {
      const parity = await normalizedParity(client, record);
      result.fieldCoverage.normalizedCompared += parity.compared; result.fieldCoverage.normalizedMismatched += parity.mismatched; result.fieldCoverage.mismatched += parity.mismatched; result.fieldCoverage.archivedOnlyFields += parity.archivedOnly;
      if (parity.mismatched) result.mismatches.push({ code: "NORMALIZED_VALUE_MISMATCH", entity: record.entity });
    } else result.fieldCoverage.archivedOnlyFields += Object.keys(record.payload).length;
    if (record.entity === "orders" && record.disposition === "importable") {
      const order = (await client.query("SELECT total_minor,currency,legacy_summary FROM orders WHERE id=$1", [record.targetId])).rows[0];
      if (order) {
        targetTotal += BigInt(order.total_minor); result.financial.orders++;
        if (order.currency !== "KZT" || order.total_minor !== record.projection.totalMinor || canonical(order.legacy_summary.source) !== canonical(record.payload)) result.mismatches.push({ code: "FINANCIAL_MISMATCH", entity: "orders" });
        const lines = Array.isArray(order.legacy_summary.lines) ? order.legacy_summary.lines : [];
        let orderLines = BigInt(0);
        for (const value of lines) {
          const line = asObject(value as JsonObject);
          if (typeof line.unitPriceMinor !== "string" || !/^[0-9]+$/.test(line.unitPriceMinor) || typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1) { result.mismatches.push({ code: "LINE_MISMATCH", entity: "orders" }); continue; }
          orderLines += BigInt(line.unitPriceMinor) * BigInt(line.quantity);
        }
        lineTotal += orderLines;
        if (orderLines.toString() !== record.projection.lineSubtotalMinor || canonical(lines) !== canonical(expectedOrderLines(record))) result.mismatches.push({ code: "LINE_MISMATCH", entity: "orders" });
      }
    }
  }
  result.financial.sourceTotalMinor = sourceTotal.toString(); result.financial.targetTotalMinor = targetTotal.toString(); result.financial.lineSubtotalMinor = lineTotal.toString();
  result.financial.quarantinedTotalMinor = quarantinedTotal.toString();
  if (sourceTotal !== targetTotal + quarantinedTotal) result.mismatches.push({ code: "FINANCIAL_TOTAL_MISMATCH", entity: "orders" });
  for (const code of (await inspectOrderSequence(client)).problems) result.mismatches.push({ code, entity: "orders" });
  result.parityReady = result.blockers === 0 && validation.records.every(record => record.disposition !== "quarantined") && result.mismatches.length === 0;
  result.ready = result.parityReady && result.status === "completed";
  if (result.mismatches.length && ["completed", "quarantined"].includes(result.status)) result.status = "drifted";
  return result;
}

async function issueParity(client: PoolClient, runId: string, records: ValidatedRecord[]): Promise<boolean> {
  const actual = (await client.query("SELECT id,entity,source_key,field_path,code,severity,safe_message FROM migration_issues WHERE run_id=$1", [runId])).rows;
  const expected = records.flatMap(record => record.issues.map(item => ({ id: stableId(runId, record.entity, record.sourceKey, item.code, item.fieldPath), entity: record.entity, source_key: record.sourceKey, field_path: databaseText(item.fieldPath), code: item.code, severity: item.severity, safe_message: item.code })));
  const sort = (rows: Record<string, unknown>[]) => rows.sort((a, b) => compareExact(String(a.id), String(b.id)));
  return canonical(sort(actual)) === canonical(sort(expected));
}

export async function verifyCheckpoint(client: PoolClient, snapshot: Snapshot, runId: string, records: ValidatedRecord[], manifest: Manifest): Promise<void> {
  if (manifest.cursor > records.length || Object.keys(manifest.receipts).length !== manifest.cursor) throw new Error("CHECKPOINT_INVALID");
  const prefix = records.slice(0, manifest.cursor), staged = (await client.query("SELECT s.*,m.target_id,m.target_type,m.source_namespace FROM legacy_source_records s LEFT JOIN legacy_id_map m ON m.record_id=s.id WHERE s.run_id=$1", [runId])).rows;
  if (staged.length !== prefix.length || !await issueParity(client, runId, prefix)) throw new Error("CHECKPOINT_INVALID");
  const byKey = new Map(staged.map(row => [receiptKey(row.entity, row.source_key), row]));
  for (const record of prefix) {
    const key = receiptKey(record.entity, record.sourceKey), receipt = manifest.receipts[key], row = byKey.get(key);
    const targetType = record.disposition === "importable" ? record.targetType : "legacy_source_records", targetId = record.disposition === "importable" ? record.targetId : archiveRecordId(snapshot, record.entity, record.sourceKey);
    if (!receipt || !row || receipt.targetId !== targetId || receipt.targetType !== targetType || receipt.entity !== record.entity || receipt.sourceKey !== record.sourceKey || receipt.disposition !== record.disposition || row.id !== archiveRecordId(snapshot, record.entity, record.sourceKey) || row.source_namespace !== snapshot.namespace || row.target_id !== targetId || row.target_type !== targetType || row.record_checksum !== record.recordChecksum || canonical(row.payload) !== canonical(storedRecordPayload(record))) throw new Error("CHECKPOINT_INVALID");
    if (await targetFingerprint(client, receipt.targetType, receipt.targetId) !== receipt.fingerprint) throw new Error("TARGET_DRIFT: checkpoint target changed");
  }
}

export async function reconcileSnapshot(pool: Pool, snapshot: Snapshot): Promise<Reconciliation> {
  assertSnapshot(snapshot);
  const client = await pool.connect();
  const state = { unsafe: false };
  try { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const result = await reconcileOnClient(client, snapshot); await client.query("COMMIT"); return result; }
  catch (error) { await rollbackSafely(client, state); throw error; } finally { client.release(state.unsafe); }
}

export interface SessionState { unsafe: boolean }
export async function rollbackSafely(client: PoolClient, state: SessionState): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { state.unsafe = true; }
}

async function inspectOrderSequence(client: PoolClient): Promise<{ floor: bigint; current: bigint; called: boolean; problems: string[] }> {
  const suffixes = await client.query("SELECT (regexp_match(order_number,'([0-9]+)$'))[1] AS suffix FROM orders");
  const seen = new Set<string>(), problems = new Set<string>(); let floor = BigInt(0);
  for (const row of suffixes.rows) if (row.suffix !== null) {
    const suffix = BigInt(row.suffix), key = suffix.toString();
    if (seen.has(key)) problems.add("SUFFIX_COLLISION");
    seen.add(key); if (suffix > floor) floor = suffix;
  }
  const state = (await client.query("SELECT last_value,is_called FROM order_number_sequence")).rows[0];
  const current = BigInt(state.last_value), maximum = BigInt("9223372036854775807");
  if (floor >= maximum || current >= maximum) problems.add("SEQUENCE_EXHAUSTED");
  if ((state.is_called ? current + BigInt(1) : current) <= floor) problems.add("SEQUENCE_UNSAFE");
  return { floor, current, called: state.is_called, problems: [...problems] };
}

export async function advanceOrderSequence(pool: Pool, options: { offline: true }): Promise<void> {
  if (options.offline !== true) throw new Error("Order sequence adjustment requires offline operation");
  const client = await pool.connect();
  const state = { unsafe: false };
  try { await advanceSequenceOnClient(client, state); } finally { client.release(state.unsafe); }
}

export async function advanceSequenceOnClient(client: PoolClient, state: SessionState): Promise<void> {
  let original: unknown;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('legacy-order-sequence',0))");
    const sequence = await inspectOrderSequence(client);
    const fatal = sequence.problems.find(code => code !== "SEQUENCE_UNSAFE");
    if (fatal) throw new Error(fatal);
    if (sequence.floor > sequence.current || (sequence.floor === sequence.current && !sequence.called)) await client.query("SELECT setval('order_number_sequence',$1::bigint,true)", [sequence.floor.toString()]);
  } catch (error) { original = error; throw error; } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtextextended('legacy-order-sequence',0))"); }
    catch (error) { state.unsafe = true; if (!original) throw error; }
  }
}
