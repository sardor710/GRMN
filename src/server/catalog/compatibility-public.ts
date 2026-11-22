import "server-only";
// Public reads of product_compatibility (decision D-C1), both directions of the same rows:
// - device page: accessories with the device variants each one fits (whole-device rows fit every variant,
//   option-value rows every current or future variant carrying that value, variant rows one variant);
// - accessory page: the devices it fits, in garmin.com wording "<device> – <option value(s)>".
// Only published products with an eligible (active, priced) variant appear; prices and availability come
// from the same card projection as the catalog.
import type { Pool } from "pg";
import type { ProductCardDTO } from "../../contracts/commerce.ts";
import type { CategoryCrumbDTO, CompatibleAccessoryDTO, CompatibleDeviceDTO } from "../../contracts/catalog-browse.ts";
import { groupResolvable } from "./category-page.ts";

type Query = Pick<Pool, "query">;
type Cards = (keys: string[]) => Promise<ProductCardDTO[]>;

interface AccessoryRow { public_key: string; accessory_sku: string | null; group_slug: string | null; group_name: string | null; variant_ids: string[] | null; position: number }

/** Accessory group = the topmost `accessory` ancestor (or self) of the accessory's primary category, else of any assigned category. */
const accessoryGroupSQL = `(SELECT jsonb_build_object('slug',g.slug,'name',g.name) FROM product_categories pc2
   CROSS JOIN LATERAL (WITH RECURSIVE up AS (
     SELECT c.id,c.parent_id,c.kind,c.slug,c.name,c.archived,0 AS depth FROM categories c WHERE c.id=pc2.category_id
     UNION ALL SELECT c.id,c.parent_id,c.kind,c.slug,c.name,c.archived,up.depth+1 FROM categories c JOIN up ON c.id=up.parent_id WHERE up.depth<20
   ) SELECT slug,name FROM up WHERE kind='accessory' AND slug IS NOT NULL AND NOT archived ORDER BY depth DESC LIMIT 1) g
   WHERE pc2.product_id=a.id ORDER BY pc2.is_primary DESC,pc2.category_id LIMIT 1)`;

// 0028 (owner 2026-11-22): live type links count like whole-device (or option-value) rows. A device linked to an
// accessory category or type fits every product filed under it or below it, now or later; explicit rows sort first.
const TYPE_POSITION = 1_000_000;
const deviceLinksSQL = `SELECT accessory_product_id,accessory_variant_id,device_product_id,device_option_value_id,device_variant_id,position
    FROM product_compatibility WHERE device_product_id=$1
  UNION ALL
  SELECT pc.product_id,NULL::uuid,t.device_product_id,t.device_option_value_id,NULL::uuid,${TYPE_POSITION}+t.position
    FROM product_compatibility_types t
    CROSS JOIN LATERAL (WITH RECURSIVE down AS (
      SELECT c.id,0 AS depth FROM categories c WHERE c.id=t.category_id AND NOT c.archived
      UNION ALL SELECT c.id,down.depth+1 FROM categories c JOIN down ON c.parent_id=down.id WHERE NOT c.archived AND down.depth<20
    ) SELECT id FROM down) under
    JOIN product_categories pc ON pc.category_id=under.id
    WHERE t.device_product_id=$1 AND pc.product_id<>t.device_product_id`;
const accessoryLinksSQL = `SELECT device_product_id,device_option_value_id,device_variant_id,position
    FROM product_compatibility WHERE accessory_product_id=$1
  UNION ALL
  SELECT t.device_product_id,t.device_option_value_id,NULL::uuid,${TYPE_POSITION}+t.position
    FROM product_compatibility_types t
    WHERE t.device_product_id<>$1 AND t.category_id IN (WITH RECURSIVE up AS (
      SELECT c.id,c.parent_id,0 AS depth FROM product_categories x JOIN categories c ON c.id=x.category_id AND NOT c.archived WHERE x.product_id=$1
      UNION ALL SELECT c.id,c.parent_id,up.depth+1 FROM categories c JOIN up ON c.id=up.parent_id WHERE NOT c.archived AND up.depth<20
    ) SELECT id FROM up)`;

export async function compatibleAccessories(pool: Query, deviceProductId: string, cards: Cards): Promise<CompatibleAccessoryDTO[]> {
  const rows = (await pool.query<AccessoryRow>(`SELECT a.public_key,av.sku AS accessory_sku,pc.position,
      grp->>'slug' AS group_slug,grp->>'name' AS group_name,
      CASE WHEN pc.device_option_value_id IS NOT NULL THEN ARRAY(SELECT vo.variant_id::text FROM variant_option_values vo WHERE vo.option_value_id=pc.device_option_value_id ORDER BY vo.variant_id)
           WHEN pc.device_variant_id IS NOT NULL THEN ARRAY[pc.device_variant_id::text] ELSE NULL END AS variant_ids
    FROM (${deviceLinksSQL}) pc JOIN products a ON a.id=pc.accessory_product_id AND a.status='published'
    LEFT JOIN product_variants av ON av.id=pc.accessory_variant_id AND av.status='active'
    CROSS JOIN LATERAL (SELECT ${accessoryGroupSQL} AS grp) groups
    WHERE (pc.accessory_variant_id IS NULL OR av.id IS NOT NULL)
    ORDER BY pc.position,a.name,a.public_key`, [deviceProductId])).rows;
  if (!rows.length) return [];
  const byKey = new Map((await cards([...new Set(rows.map(r => r.public_key))])).map(card => [card.publicKey, card]));
  // One card per accessory (and narrowed accessory SKU); fitting variants are the union of its rows.
  const merged = new Map<string, CompatibleAccessoryDTO>();
  for (const row of rows) {
    const card = byKey.get(row.public_key);
    if (!card) continue;
    const id = JSON.stringify([row.public_key, row.accessory_sku]);
    const group: CategoryCrumbDTO | null = row.group_slug && row.group_name ? { slug: row.group_slug, name: row.group_name } : null;
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, { publicKey: card.publicKey, name: card.name, image: card.image, price: card.price, availability: card.availability, sku: row.accessory_sku, group, variantIds: row.variant_ids ? [...row.variant_ids] : null });
    } else if (existing.variantIds !== null) {
      existing.variantIds = row.variant_ids === null ? null : [...new Set([...existing.variantIds, ...row.variant_ids])].sort();
    }
  }
  return [...merged.values()];
}

interface DeviceRow { public_key: string; name: string; value_label: string | null; variant_labels: string[] | null; sku: string | null }

const dash = "–";
export function deviceLabel(name: string, scope: readonly string[]): string {
  return scope.length ? `${name} ${dash} ${scope.join(", ")}` : name;
}

export async function compatibleDevices(pool: Query, accessoryProductId: string, cards: Cards): Promise<CompatibleDeviceDTO[]> {
  const rows = (await pool.query<DeviceRow>(`SELECT d.public_key,d.name,ov.label AS value_label,
      CASE WHEN pc.device_variant_id IS NOT NULL THEN ARRAY(SELECT ov2.label FROM variant_option_values vo JOIN option_values ov2 ON ov2.id=vo.option_value_id JOIN product_options po ON po.id=vo.option_id WHERE vo.variant_id=pc.device_variant_id ORDER BY po.position,po.key) END AS variant_labels,
      CASE WHEN pc.device_option_value_id IS NOT NULL THEN (SELECT v.sku FROM variant_option_values vo JOIN product_variants v ON v.id=vo.variant_id AND v.status='active' WHERE vo.option_value_id=pc.device_option_value_id ORDER BY v.is_default DESC,v.sku LIMIT 1)
           WHEN pc.device_variant_id IS NOT NULL THEN dv.sku END AS sku
    FROM (${accessoryLinksSQL}) pc JOIN products d ON d.id=pc.device_product_id AND d.status='published'
    LEFT JOIN option_values ov ON ov.id=pc.device_option_value_id
    LEFT JOIN product_variants dv ON dv.id=pc.device_variant_id AND dv.status='active'
    WHERE (pc.device_variant_id IS NULL OR dv.id IS NOT NULL)
    ORDER BY pc.position`, [accessoryProductId])).rows;
  if (!rows.length) return [];
  const byKey = new Map((await cards([...new Set(rows.map(r => r.public_key))])).map(card => [card.publicKey, card]));
  const seen = new Map<string, CompatibleDeviceDTO>();
  for (const row of rows) {
    const card = byKey.get(row.public_key);
    if (!card) continue;
    const scope = row.value_label ? [row.value_label] : row.variant_labels ?? [];
    const label = deviceLabel(row.name, scope);
    if (!seen.has(label)) seen.set(label, { publicKey: row.public_key, label, image: card.image, sku: scope.length ? row.sku : null });
  }
  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  return [...seen.values()].sort((a, b) => collator.compare(a.label, b.label));
}

/**
 * Primary category path (root first) for breadcrumbs; empty when the product has no primary category.
 * Nodes without a public page (hidden compatibility groups such as "QuickFit 26 mm") are skipped.
 */
export async function primaryCategoryPath(pool: Query, productId: string): Promise<CategoryCrumbDTO[]> {
  const rows = (await pool.query<CategoryCrumbDTO & { archived: boolean; kind: "catalog" | "accessory" | "group"; nav_visible: boolean }>(`WITH RECURSIVE up AS (
      SELECT c.id,c.parent_id,c.name,c.slug,c.archived,c.kind,c.nav_visible,0 AS depth FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=$1 AND pc.is_primary
      UNION ALL SELECT c.id,c.parent_id,c.name,c.slug,c.archived,c.kind,c.nav_visible,up.depth+1 FROM categories c JOIN up ON c.id=up.parent_id WHERE up.depth<20
    ) SELECT name,slug,archived,kind,nav_visible FROM up WHERE slug IS NOT NULL ORDER BY depth DESC`, [productId])).rows;
  return rows.some(r => r.archived) ? [] : rows.filter(r => groupResolvable(r)).map(({ name, slug }) => ({ name, slug }));
}
