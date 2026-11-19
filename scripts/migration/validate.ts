import { assertSnapshot } from "./extract.ts";
import type { Snapshot, SourceRecord } from "./extract.ts";
import { asObject, canonical, compareExact, databaseText, legacyOrderStatus, moneyToMinor, stableId, text } from "./map.ts";
import type { Json, JsonObject } from "./map.ts";

// A blocker with a resolution was decided by the owner (docs/backend/owner-dispositions.json); it is
// persisted as a resolved migration issue and no longer quarantines its record.
export interface Issue { code: string; fieldPath: string; severity: "warning" | "blocker"; resolution?: { rule: string; action: "exclude" | "accept" } }
export interface ValidatedRecord extends SourceRecord {
  targetId: string; targetType: string; disposition: "importable" | "quarantined" | "excluded";
  projection: JsonObject; issues: Issue[];
}
export interface Counts { expected: number; importable: number; quarantined: number; excluded: number }
export interface ValidationReport { snapshot: Snapshot; records: ValidatedRecord[]; counts: Record<string, Counts> }

const fields: Record<string, string[]> = {
  products: ["id", "name", "slug", "sku", "price", "originalPrice", "priceSuffix", "currency", "description", "image", "badge", "family", "category", "subCategory", "activities", "level", "caseSize", "stock", "status", "isFeatured", "specs", "inTheBox", "compatibleAccessories", "features", "createdAt", "updatedAt", "seoTitle", "seoDescription", "focusKeywords", "canonicalUrl", "noIndex", "ogImage"],
  orders: ["id", "orderNumber", "clientName", "clientEmail", "clientPhone", "total", "currency", "itemsCount", "items", "paymentStatus", "paymentMode", "fulfillmentStatus", "status", "shippingAddress", "comments", "notes", "trackingNumber", "carrier", "coordinates", "createdAt", "updatedAt", "timeline"],
  clients: ["id", "name", "email", "phone", "country", "status", "totalSpent", "ordersCount", "avatar", "notes", "createdAt", "updatedAt"],
  blogs: ["id", "slug", "title", "excerpt", "content", "coverImage", "category", "readingTime", "author", "status", "publishedAt", "createdAt", "updatedAt", "seoTitle", "seoDescription", "focusKeywords"],
  banners: ["id", "title", "subtitle", "ctaLabel", "ctaUrl", "image", "position", "active", "order", "createdAt", "updatedAt"],
  discounts: ["id", "code", "description", "type", "value", "minSpend", "usageLimit", "perCustomerLimit", "usageCount", "applyType", "targetCategories", "targetSkus", "startDate", "expiresAt", "isStackable", "status", "createdAt"],
  activities: ["id", "adminName", "action", "target", "timestamp"],
};
const targets: Record<string, string> = { products: "products", clients: "customer_profiles", orders: "orders", blogs: "pages", banners: "pages", homepage: "pages", discounts: "promotions", activities: "audit_events" };

function validTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const date = new Date(value), day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
}

export function validateSnapshot(snapshot: Snapshot): ValidationReport {
  assertSnapshot(snapshot);
  const assets = new Set(snapshot.assets.map(asset => asset.path));
  const records: ValidatedRecord[] = snapshot.records.map(record => ({ ...record, targetId: stableId(snapshot.namespace, record.entity, record.sourceKey), targetType: Object.hasOwn(targets, record.entity) ? targets[record.entity] : "legacy_source_records", disposition: "importable", projection: {}, issues: [] }));
  const issue = (record: ValidatedRecord, code: string, fieldPath = "", severity: Issue["severity"] = "blocker") => {
    if (!record.issues.some(existing => existing.code === code && existing.fieldPath === fieldPath)) record.issues.push({ code, fieldPath, severity });
  };
  const productRows = records.filter(record => record.entity === "products");
  const products = new Map(productRows.map(record => [record.identity, record]));
  const amount = (record: ValidatedRecord, value: Json | undefined, field: string): string | null => {
    if (snapshot.cmsMoney !== "KZT-major" || (record.payload.currency !== undefined && record.payload.currency !== "KZT")) { issue(record, "MISSING_CURRENCY", field); return null; }
    try { return moneyToMinor(record.numberLexemes[field] ?? value); } catch { issue(record, "INVALID_MONEY", field); return null; }
  };
  const required = (record: ValidatedRecord, field: string, maximum = 1000) => {
    const value = text(record.payload[field]);
    if (!value || value.length > maximum || (["id", "sku", "slug", "orderNumber", "code"].includes(field) && value !== value.trim())) issue(record, "INVALID_FIELD", field);
    return value;
  };
  const integer = (record: ValidatedRecord, value: Json | undefined, field: string, minimum = 0): number | null => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > 2147483647) { issue(record, "INVALID_INTEGER", field); return null; }
    return value;
  };
  for (const record of records) {
    const p = record.payload;
    if (snapshot.classification === "unconfirmed") issue(record, "UNCONFIRMED_PROVENANCE");
    if (snapshot.sources.some(source => source.invalidUtf8 && [record.source.split("#")[0], record.resolvedSource.split("#")[0]].includes(source.path))) issue(record, "INVALID_SOURCE_ENCODING");
    const walk = (value: Json, path: string, key = "") => {
      if (/(?:At|timestamp|startDate)$/.test(key) && value !== null && typeof value !== "string") issue(record, "INVALID_TIMESTAMP", path);
      if (typeof value === "string") {
        if (!value.isWellFormed() || value.includes("\u0000")) issue(record, "INVALID_UNICODE", path);
        if (/(?:At|timestamp|startDate)$/.test(key) && value && !validTimestamp(value)) issue(record, "INVALID_TIMESTAMP", path);
        if (/^\/(?:images|videos|marq)\//.test(value) && /\.(?:jpe?g|png|webp|svg|gif|mp4|webm)(?:[?#].*)?$/i.test(value) && !assets.has(`public${value.split(/[?#]/)[0]}`)) issue(record, "MISSING_ASSET", path);
      } else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      else if (value && typeof value === "object") for (const [childKey, child] of Object.entries(value)) { if (databaseText(childKey) !== childKey) issue(record, "INVALID_UNICODE", path ? `${path}.${childKey}` : childKey); if (childKey === "$unresolved") issue(record, "UNRESOLVED_EXPRESSION", path); walk(child, path ? `${path}.${childKey}` : childKey, childKey); }
    };
    walk(p, "");
    const optionalStrings: Record<string, string[]> = {
      products: ["slug", "description", "family", "badge", "priceSuffix", "seoTitle", "seoDescription", "canonicalUrl", "ogImage"],
      clients: ["avatar", "notes"], blogs: ["excerpt", "author", "category", "coverImage", "seoTitle", "seoDescription"],
      banners: ["subtitle", "position", "ctaLabel", "ctaUrl", "image"], orders: ["clientPhone", "clientEmail"], discounts: ["description"], activities: ["adminName", "target"],
    };
    for (const key of Object.hasOwn(optionalStrings, record.entity) ? optionalStrings[record.entity] : []) if (p[key] != null && typeof p[key] !== "string") issue(record, "INVALID_FIELD", key);
    for (const key of ["isFeatured", "noIndex", "active"]) if (p[key] !== undefined && typeof p[key] !== "boolean") issue(record, "INVALID_FIELD", key);
    if (record.entity === "blogs" && p.readingTime != null && typeof p.readingTime !== "string" && (typeof p.readingTime !== "number" || !Number.isInteger(p.readingTime) || p.readingTime < 1)) issue(record, "INVALID_FIELD", "readingTime");
    for (const key of Object.keys(p)) if (Object.hasOwn(fields, record.entity) && !fields[record.entity].includes(key)) issue(record, "UNKNOWN_FIELD", key, "warning");
    if (record.entity.startsWith("static:")) {
      record.disposition = "excluded";
      issue(record, "VERSION_CONTROLLED_SOURCE", "", "warning");
      if (/AccountDashboard/.test(record.source)) issue(record, "UNVERIFIED_OWNER");
      if (/#(?:products|BASE_PRODUCTS)$/.test(record.source) && !products.has(record.identity)) issue(record, "STATIC_PRODUCT_NOT_PERSISTED");
      if (/#products$/.test(record.source) && products.has(record.identity) && canonical(products.get(record.identity)?.payload) !== canonical(p)) issue(record, "CMS_PRECEDENCE", "", "warning");
      continue;
    }
    if (record.entity === "products") {
      required(record, "id"); required(record, "name"); required(record, "sku");
      const price = amount(record, p.price, "price"), compare = p.originalPrice == null ? null : amount(record, p.originalPrice, "originalPrice");
      if (price && compare && BigInt(compare) < BigInt(price)) issue(record, "INVALID_COMPARE_PRICE", "originalPrice");
      const status = p.status === "active" ? "published" : p.status;
      if (!["draft", "published", "archived"].includes(String(status))) issue(record, "INVALID_STATUS", "status");
      if (p.stock !== undefined) integer(record, p.stock, "stock");
      for (const key of ["specs", "features", "inTheBox", "focusKeywords"]) if (p[key] !== undefined && !Array.isArray(p[key])) issue(record, "INVALID_SHAPE", key);
      for (const key of ["inTheBox", "focusKeywords", "activities"]) if (p[key] !== undefined && (!Array.isArray(p[key]) || (p[key] as Json[]).some(value => typeof value !== "string"))) issue(record, "INVALID_SHAPE", key);
      if (Array.isArray(p.specs) && p.specs.some(value => { const spec = asObject(value); return typeof spec.label !== "string" || typeof spec.value !== "string"; })) issue(record, "INVALID_SHAPE", "specs");
      if (Array.isArray(p.features) && p.features.some(value => { const feature = asObject(value); return typeof feature.title !== "string" || typeof feature.body !== "string" || (feature.image !== undefined && typeof feature.image !== "string"); })) issue(record, "INVALID_SHAPE", "features");
      if (p.compatibleAccessories !== undefined) {
        if (!Array.isArray(p.compatibleAccessories)) issue(record, "INVALID_SHAPE", "compatibleAccessories");
        else if (p.compatibleAccessories.some(reference => typeof reference !== "string")) issue(record, "UNRESOLVED_ACCESSORY", "compatibleAccessories");
      }
      record.projection = { amountMinor: price, compareAtMinor: compare, status: status ?? null };
    } else if (record.entity === "clients") {
      required(record, "id"); required(record, "name", 200); required(record, "phone", 64);
      if (p.email && (typeof p.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))) issue(record, "INVALID_EMAIL", "email");
      if (!["active", "vip", "pending", "suspended"].includes(String(p.status))) issue(record, "INVALID_STATUS", "status");
      record.projection = { email: typeof p.email === "string" ? p.email.trim().toLowerCase() : null, profileState: "provisional" };
      issue(record, "UNVERIFIED_OWNER", "", "warning");
      if (p.totalSpent !== undefined) issue(record, "UNCONFIRMED_LIFETIME_BASELINE", "totalSpent", "warning");
    } else if (record.entity === "orders") {
      required(record, "id"); required(record, "orderNumber"); required(record, "clientName");
      const total = amount(record, p.total, "total");
      let subtotal = BigInt(0), validLines = true;
      if (!Array.isArray(p.items) || !p.items.length) { issue(record, "INCOMPLETE_ORDER", "items"); validLines = false; }
      else for (const [index, value] of p.items.entries()) {
        const item = asObject(value), prefix = `items[${index}]`;
        if (item.currency !== undefined && item.currency !== "KZT") issue(record, "LINE_CURRENCY_CONFLICT", `${prefix}.currency`);
        if (typeof item.productId !== "string" || !products.has(item.productId)) issue(record, "UNRESOLVED_PRODUCT", `${prefix}.productId`);
        const unit = amount(record, item.price, `${prefix}.price`), quantity = integer(record, item.quantity, `${prefix}.quantity`, 1);
        if (!unit || quantity === null) validLines = false; else subtotal += BigInt(unit) * BigInt(quantity);
        if (!text(item.name)) issue(record, "INVALID_FIELD", `${prefix}.name`);
      }
      if (validLines && total && subtotal !== BigInt(total)) issue(record, "ORDER_TOTAL_MISMATCH", "total");
      record.projection = { totalMinor: total, lineSubtotalMinor: validLines ? subtotal.toString() : null, dataQuality: "legacy_incomplete", paymentMode: "legacy_unknown", paymentStatus: "unpaid", orderStatus: legacyOrderStatus(p.status ?? p.fulfillmentStatus) };
      issue(record, "UNVERIFIED_PAYMENT_HISTORY", "paymentStatus", "warning");
      issue(record, "RESTRICTED_LEGACY_SUMMARY", "", "warning");
    } else if (record.entity === "blogs" || record.entity === "banners" || record.entity === "homepage") {
      if (record.entity !== "homepage") { required(record, "id"); required(record, "title"); }
      if (record.entity === "blogs") { required(record, "slug"); if (typeof p.content !== "string") issue(record, "INVALID_FIELD", "content"); }
      if (p.focusKeywords !== undefined && (!Array.isArray(p.focusKeywords) || p.focusKeywords.some(value => typeof value !== "string"))) issue(record, "INVALID_SHAPE", "focusKeywords");
      if (record.entity === "banners" && p.order !== undefined) integer(record, p.order, "order");
      if (record.entity === "homepage") for (const key of ["heroBanners", "carousels", "promoTiles", "storyTiles", "categoryTiles"]) if (!Array.isArray(p[key]) || (p[key] as Json[]).some(value => value === null || typeof value !== "object" || Array.isArray(value))) issue(record, "INVALID_SHAPE", key);
      record.projection = { kind: record.entity === "blogs" ? "blog" : record.entity === "banners" ? "banner" : "homepage", status: "draft" };
      // Imported HTML and legacy active flags are never auto-published.
      issue(record, "PUBLICATION_REVIEW_REQUIRED", "", "warning");
    } else if (record.entity === "discounts") {
      required(record, "id"); required(record, "code");
      const usage = integer(record, p.usageCount, "usageCount");
      for (const key of ["usageLimit", "perCustomerLimit"]) if (p[key] != null) integer(record, p[key], key, 1);
      if (p.usageLimit != null && typeof p.usageLimit === "number" && usage !== null && usage > p.usageLimit) issue(record, "PROMOTION_BASELINE_EXCEEDS_LIMIT", "usageCount");
      if (p.type !== "percentage" || typeof p.value !== "number" || p.value <= 0 || p.value > 100 || !Number.isInteger(p.value * 100)) issue(record, "UNCONFIRMED_PROMOTION_VALUE", "value");
      if (p.minSpend !== undefined && p.minSpend !== 0) issue(record, "UNCONFIRMED_PROMOTION_MONEY", "minSpend");
      if (p.applyType !== "all") issue(record, "UNRESOLVED_PROMOTION_SCOPE", "applyType");
      if (p.isStackable !== undefined && typeof p.isStackable !== "boolean") issue(record, "INVALID_FIELD", "isStackable");
      if (typeof p.startDate === "string" && typeof p.expiresAt === "string" && validTimestamp(p.startDate) && validTimestamp(p.expiresAt) && new Date(p.expiresAt) <= new Date(p.startDate)) issue(record, "INVALID_PROMOTION_WINDOW", "expiresAt");
      record.projection = { historicalUsage: usage, percentageBps: typeof p.value === "number" ? p.value * 100 : null, stackable: p.isStackable ?? false, status: "draft" };
    } else if (record.entity === "activities") {
      required(record, "id"); required(record, "action");
    } else if (record.entity === "admins") issue(record, "STAFF_BOOTSTRAP_REQUIRED");
    else if (record.entity === "settings") { issue(record, "SETTINGS_POLICY_REVIEW"); }
    else issue(record, "UNMAPPED_ENTITY");
  }
  const duplicate = (entity: string, field: string, code: string, fold = false) => {
    const groups = new Map<string, ValidatedRecord[]>();
    for (const row of records.filter(record => record.entity === entity)) {
      const value = field === "identity" ? row.identity : text(row.payload[field]);
      if (!value) continue;
      const key = fold ? value.trim().toLowerCase() : value;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) if (group.length > 1) for (const row of group) issue(row, code, field);
  };
  for (const entity of new Set(records.map(record => record.entity))) duplicate(entity, "identity", "DUPLICATE_IDENTITY");
  for (const [entity, field, code, fold] of [["products", "sku", "DUPLICATE_SKU", true], ["products", "slug", "DUPLICATE_SLUG", false], ["blogs", "slug", "DUPLICATE_SLUG", false], ["orders", "orderNumber", "DUPLICATE_ORDERNUMBER", false], ["discounts", "code", "DUPLICATE_CODE", true]] as const) duplicate(entity, field, code, fold);
  const accessoryTargets = (reference: string) => [...new Set(productRows.filter(product => product.identity === reference || (typeof product.payload.sku === "string" && product.payload.sku.toLowerCase() === reference.toLowerCase())))];
  let changed = true;
  while (changed) {
    changed = false;
    for (const product of productRows) if (Array.isArray(product.payload.compatibleAccessories)) for (const [index, reference] of product.payload.compatibleAccessories.entries()) if (typeof reference === "string") {
      const matches = accessoryTargets(reference), before = product.issues.length;
      if (!matches.length) issue(product, "UNRESOLVED_ACCESSORY", `compatibleAccessories[${index}]`);
      else if (matches.length > 1) issue(product, "AMBIGUOUS_ACCESSORY", `compatibleAccessories[${index}]`);
      else if (matches[0].issues.some(item => item.severity === "blocker")) issue(product, "ACCESSORY_NOT_IMPORTABLE", `compatibleAccessories[${index}]`);
      changed ||= product.issues.length !== before;
    }
  }
  for (const row of records.filter(record => record.entity === "orders")) if (Array.isArray(row.payload.items)) for (const [index, value] of row.payload.items.entries()) {
    const ref = asObject(value).productId;
    if (typeof ref === "string" && products.get(ref)?.issues.some(item => item.severity === "blocker")) issue(row, "PRODUCT_NOT_IMPORTABLE", `items[${index}].productId`);
  }
  applyOwnerDecisions(snapshot, records, issue);
  const counts: Record<string, Counts> = Object.create(null);
  for (const record of records) {
    if (record.issues.some(item => item.severity === "blocker" && !item.resolution)) record.disposition = "quarantined";
    record.issues.sort((a, b) => compareExact(`${a.code}:${a.fieldPath}`, `${b.code}:${b.fieldPath}`));
    const count = counts[record.entity] ??= { expected: 0, importable: 0, quarantined: 0, excluded: 0 };
    count.expected++; count[record.disposition]++;
  }
  return { snapshot, records, counts };
}

// Task 24: an exclude rule archives the record without a live target (and resolves its blockers);
// an accept rule resolves only the named blocker codes. Every rule must still match something, so a
// stale decision cannot silently approve future source changes.
function applyOwnerDecisions(snapshot: Snapshot, records: ValidatedRecord[], issue: (record: ValidatedRecord, code: string, fieldPath?: string, severity?: Issue["severity"]) => void): void {
  for (const rule of snapshot.decisions?.rules ?? []) {
    const entityMatches = (entity: string) => rule.entity.endsWith("*") ? entity.startsWith(rule.entity.slice(0, -1)) : entity === rule.entity;
    const matched = records.filter(record => entityMatches(record.entity) && (!rule.keys || rule.keys.includes(record.identity)));
    if (!matched.length) throw new Error(`Owner decision "${rule.id}" matches no source record`);
    let accepted = 0;
    for (const record of matched) {
      if (rule.action === "exclude") {
        record.disposition = "excluded";
        for (const item of record.issues) if (item.severity === "blocker" && !item.resolution) item.resolution = { rule: rule.id, action: "exclude" };
        issue(record, "OWNER_EXCLUDED", "", "warning");
      } else for (const item of record.issues) if (item.severity === "blocker" && !item.resolution && rule.codes!.includes(item.code)) { item.resolution = { rule: rule.id, action: "accept" }; accepted++; }
    }
    if (rule.action === "accept" && !accepted) throw new Error(`Owner decision "${rule.id}" accepts no open blocker`);
  }
}

export function safeReport(report: ValidationReport): JsonObject {
  const issues: Record<string, number> = Object.create(null);
  for (const row of report.records) for (const item of row.issues) issues[item.code] = (issues[item.code] ?? 0) + 1;
  return { version: 1, artifactChecksum: report.snapshot.artifactChecksum, sourceChecksum: report.snapshot.sourceChecksum,
    counts: JSON.parse(canonical(report.counts)) as JsonObject, issues, redactedFields: report.snapshot.redactions.length,
    ready: report.records.every(record => record.disposition !== "quarantined") };
}
