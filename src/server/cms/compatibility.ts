import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AuthFailure } from "../auth/config.ts";

// Decision D-C1: one stored "accessory fits device" fact (product_compatibility, migration 0013), editable
// from either side. Ownership rule (documented in docs/backend/catalog-media-schema.md):
//   - Accessory side (`compatibility.devices` on the accessory's command) owns EVERY row whose
//     accessory_product_id is this product: whole-device, option-value and device-variant scopes, with or
//     without an accessory variant. The read API returns all of them in the same command shape, so an editor
//     that sends back what it read loses nothing.
//   - Device side (`compatibility.accessories` on the device's command) owns only the rows whose
//     device_product_id is this product AND whose device scope is whole-device (no option value, no device
//     variant). Finer rows (51 mm only, one SKU only) can only be written from the accessory side, so a
//     device editor never clobbers them.
//   - Redundant rows are collapsed after every write: a row is deleted when another row for the same
//     accessory/device pair covers it (whole-device ⊇ option value ⊇ variants carrying it; no accessory
//     variant ⊇ any accessory variant). A whole-device row added from the device side therefore replaces a
//     51 mm row for the same pair.
//   - Every product whose visible compatibility changes because of the OTHER side's save gets version+1, so
//     a stale editor for that product receives 409 instead of silently undoing the change.

export interface DeviceLinkInput { productKey: string; optionValueKeys: string[]; variantSkus: string[]; accessoryVariantSku?: string | null }
export interface AccessoryLinkInput { productKey: string; accessoryVariantSku?: string | null }

interface Row { id: string; accessory_product_id: string; accessory_variant_id: string | null; device_product_id: string; device_option_value_id: string | null; device_variant_id: string | null; position: number }
interface Desired { accessoryProductId: string; accessoryVariantId: string | null; deviceProductId: string; optionValueId: string | null; deviceVariantId: string | null; position: number }

const invalid = (message: string): never => { throw new AuthFailure("INVALID_INPUT", 400, message); };
const rowKey = (row: { accessoryVariantId: string | null; deviceProductId: string; optionValueId: string | null; deviceVariantId: string | null; accessoryProductId: string }) =>
  [row.accessoryProductId, row.accessoryVariantId ?? "", row.deviceProductId, row.optionValueId ?? "", row.deviceVariantId ?? ""].join("|");
const fromRow = (row: Row): Desired => ({ accessoryProductId: row.accessory_product_id, accessoryVariantId: row.accessory_variant_id, deviceProductId: row.device_product_id, optionValueId: row.device_option_value_id, deviceVariantId: row.device_variant_id, position: row.position });

async function productIds(client: PoolClient, keys: string[], self: string): Promise<Map<string, string>> {
  const unique = [...new Set(keys)];
  if (!unique.length) return new Map();
  const rows = (await client.query<{ id: string; public_key: string }>("SELECT id,public_key FROM products WHERE public_key=ANY($1::text[])", [unique])).rows;
  const map = new Map(rows.map(row => [row.public_key, row.id]));
  const missing = unique.filter(key => !map.has(key));
  if (missing.length) invalid(`Unknown compatible product: ${missing.slice(0, 5).join(", ")}`);
  if ([...map.values()].includes(self)) invalid("A product cannot be compatible with itself");
  return map;
}

async function variantIdsBySku(client: PoolClient, productIds: string[]): Promise<Map<string, string>> {
  if (!productIds.length) return new Map();
  const rows = (await client.query<{ id: string; product_id: string; sku: string }>("SELECT id,product_id,lower(sku) AS sku FROM product_variants WHERE product_id=ANY($1::uuid[]) AND status<>'archived'", [productIds])).rows;
  return new Map(rows.map(row => [`${row.product_id}|${row.sku}`, row.id]));
}

/** Applies a desired row set to the rows in `scope`, returns the counterpart product ids whose rows changed. */
async function replaceScope(client: PoolClient, existing: Row[], desired: Desired[], counterpart: (row: Desired) => string): Promise<Set<string>> {
  const wanted = new Map<string, Desired>();
  for (const row of desired) if (!wanted.has(rowKey(row))) wanted.set(rowKey(row), row);
  const current = new Map(existing.map(row => [rowKey(fromRow(row)), row]));
  const touched = new Set<string>();
  const removed = existing.filter(row => !wanted.has(rowKey(fromRow(row))));
  if (removed.length) {
    await client.query("DELETE FROM product_compatibility WHERE id=ANY($1::uuid[])", [removed.map(row => row.id)]);
    for (const row of removed) touched.add(counterpart(fromRow(row)));
  }
  for (const [key, row] of wanted) {
    const found = current.get(key);
    if (!found) {
      await client.query("INSERT INTO product_compatibility(id,accessory_product_id,accessory_variant_id,device_product_id,device_option_value_id,device_variant_id,position) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), row.accessoryProductId, row.accessoryVariantId, row.deviceProductId, row.optionValueId, row.deviceVariantId, row.position]);
      touched.add(counterpart(row));
    } else if (found.position !== row.position) await client.query("UPDATE product_compatibility SET position=$2 WHERE id=$1", [found.id, row.position]);
  }
  return touched;
}

/** Accessory side: replaces every row where this product is the accessory. */
export async function writeAccessoryCompatibility(client: PoolClient, productId: string, devices: DeviceLinkInput[]): Promise<Set<string>> {
  const deviceIds = await productIds(client, devices.map(item => item.productKey), productId);
  const ownVariants = await variantIdsBySku(client, [productId]);
  const deviceVariants = await variantIdsBySku(client, [...deviceIds.values()]);
  const values = deviceIds.size ? (await client.query<{ id: string; product_id: string; key: string }>("SELECT id,product_id,key FROM option_values WHERE product_id=ANY($1::uuid[])", [[...deviceIds.values()]])).rows : [];
  const desired: Desired[] = [];
  devices.forEach((item, position) => {
    const deviceProductId = deviceIds.get(item.productKey)!;
    let accessoryVariantId: string | null = null;
    if (item.accessoryVariantSku) accessoryVariantId = ownVariants.get(`${productId}|${item.accessoryVariantSku.toLowerCase()}`) ?? invalid(`Unknown accessory SKU ${item.accessoryVariantSku}`);
    const base = { accessoryProductId: productId, accessoryVariantId, deviceProductId, position };
    if (!item.optionValueKeys.length && !item.variantSkus.length) { desired.push({ ...base, optionValueId: null, deviceVariantId: null }); return; }
    for (const reference of item.optionValueKeys) {
      const own = values.filter(value => value.product_id === deviceProductId);
      const byId = own.find(value => value.id === reference);
      const byKey = own.filter(value => value.key === reference);
      if (!byId && byKey.length > 1) invalid(`Option value "${reference}" is ambiguous on ${item.productKey}; send its id`);
      const value = byId ?? byKey[0] ?? invalid(`Unknown option value "${reference}" on ${item.productKey}`);
      desired.push({ ...base, optionValueId: value.id, deviceVariantId: null });
    }
    for (const sku of item.variantSkus) {
      const variantId = deviceVariants.get(`${deviceProductId}|${sku.toLowerCase()}`) ?? invalid(`Unknown device SKU ${sku} on ${item.productKey}`);
      desired.push({ ...base, optionValueId: null, deviceVariantId: variantId });
    }
  });
  const existing = (await client.query<Row>("SELECT * FROM product_compatibility WHERE accessory_product_id=$1 FOR UPDATE", [productId])).rows;
  return replaceScope(client, existing, desired, row => row.deviceProductId);
}

/** Device side: replaces only this device's whole-device rows. */
export async function writeDeviceCompatibility(client: PoolClient, productId: string, accessories: AccessoryLinkInput[]): Promise<Set<string>> {
  const accessoryIds = await productIds(client, accessories.map(item => item.productKey), productId);
  const variants = await variantIdsBySku(client, [...accessoryIds.values()]);
  const desired: Desired[] = accessories.map((item, position) => {
    const accessoryProductId = accessoryIds.get(item.productKey)!;
    const accessoryVariantId = item.accessoryVariantSku ? variants.get(`${accessoryProductId}|${item.accessoryVariantSku.toLowerCase()}`) ?? invalid(`Unknown accessory SKU ${item.accessoryVariantSku} on ${item.productKey}`) : null;
    return { accessoryProductId, accessoryVariantId, deviceProductId: productId, optionValueId: null, deviceVariantId: null, position };
  });
  const existing = (await client.query<Row>("SELECT * FROM product_compatibility WHERE device_product_id=$1 AND device_option_value_id IS NULL AND device_variant_id IS NULL FOR UPDATE", [productId])).rows;
  return replaceScope(client, existing, desired, row => row.accessoryProductId);
}

/** Deletes rows covered by another row for the same accessory/device pair; returns the products involved. */
export async function collapseRedundantCompatibility(client: PoolClient, productId: string): Promise<Set<string>> {
  const deleted = (await client.query<{ accessory_product_id: string; device_product_id: string }>(`
    DELETE FROM product_compatibility b USING product_compatibility a
    WHERE a.id<>b.id AND a.accessory_product_id=b.accessory_product_id AND a.device_product_id=b.device_product_id
      AND (b.accessory_product_id=$1 OR b.device_product_id=$1)
      AND (a.accessory_variant_id IS NULL OR a.accessory_variant_id=b.accessory_variant_id)
      AND (
        (a.device_option_value_id IS NULL AND a.device_variant_id IS NULL)
        OR (a.device_option_value_id IS NOT NULL AND (b.device_option_value_id=a.device_option_value_id
            OR (b.device_variant_id IS NOT NULL AND EXISTS (SELECT 1 FROM variant_option_values s WHERE s.variant_id=b.device_variant_id AND s.option_value_id=a.device_option_value_id))))
        OR (a.device_variant_id IS NOT NULL AND b.device_variant_id=a.device_variant_id)
      )
      -- Never delete both halves of an identical-coverage pair (cannot happen: the unique index forbids duplicates).
    RETURNING b.accessory_product_id,b.device_product_id`, [productId])).rows;
  return new Set(deleted.flatMap(row => [row.accessory_product_id, row.device_product_id]));
}

export interface CompatibleDeviceView {
  productKey: string; name: string; status: string; thumbnail: string | null; primaryCategoryKey: string | null;
  accessoryVariantSku: string | null; wholeDevice: boolean; deviceVariantCount: number;
  optionValues: { id: string; key: string; label: string; optionKey: string; optionName: string; variantCount: number }[];
  variants: { sku: string; title: string | null }[];
}
export interface CompatibleAccessoryView {
  productKey: string; name: string; status: string; thumbnail: string | null; primaryCategoryKey: string | null; primaryCategoryName: string | null;
  accessoryVariantSku: string | null; scope: "device" | "optionValue" | "variant";
  optionValue: { id: string; key: string; label: string; optionKey: string } | null; variantSku: string | null;
  /** Device variants (stored ids, non-archived) this link applies to. */
  appliesToVariantIds: string[];
}
export interface CompatibilityRead {
  /** Command-shaped echo: send back unchanged to keep every row. */
  command: { devices: DeviceLinkInput[]; accessories: AccessoryLinkInput[] };
  compatibleDevices: CompatibleDeviceView[];
  compatibleAccessories: CompatibleAccessoryView[];
}

const counterpartSQL = (alias: string) => `${alias}.public_key,${alias}.name,${alias}.status,
  COALESCE((SELECT COALESCE(m.source_path,m.storage_key) FROM product_media pm JOIN media_assets m ON m.id=pm.media_id AND m.status='ready' WHERE pm.product_id=${alias}.id AND pm.variant_id IS NULL ORDER BY pm.is_primary DESC,pm.position LIMIT 1),${alias}.thumbnail_source) AS thumbnail,
  (SELECT c.key FROM product_categories x JOIN categories c ON c.id=x.category_id WHERE x.product_id=${alias}.id AND x.is_primary) AS category_key,
  (SELECT c.name FROM product_categories x JOIN categories c ON c.id=x.category_id WHERE x.product_id=${alias}.id AND x.is_primary) AS category_name`;

export async function readCompatibility(client: Pick<PoolClient, "query">, productId: string): Promise<CompatibilityRead> {
  const asAccessory = (await client.query<{ device_id: string; public_key: string; name: string; status: string; thumbnail: string | null; category_key: string | null; accessory_sku: string | null; value_id: string | null; value_key: string | null; value_label: string | null; option_key: string | null; option_name: string | null; value_variants: string; variant_sku: string | null; variant_title: string | null; device_variants: string; position: number }>(`
    SELECT pc.device_product_id AS device_id,${counterpartSQL("d")},av.sku AS accessory_sku,
      ov.id AS value_id,ov.key AS value_key,ov.label AS value_label,o.key AS option_key,o.name AS option_name,
      (SELECT count(*) FROM variant_option_values s JOIN product_variants v ON v.id=s.variant_id AND v.status<>'archived' WHERE s.option_value_id=ov.id) AS value_variants,
      dv.sku AS variant_sku,dv.name AS variant_title,
      (SELECT count(*) FROM product_variants v WHERE v.product_id=d.id AND v.status<>'archived') AS device_variants,pc.position
    FROM product_compatibility pc JOIN products d ON d.id=pc.device_product_id
    LEFT JOIN product_variants av ON av.id=pc.accessory_variant_id
    LEFT JOIN option_values ov ON ov.id=pc.device_option_value_id LEFT JOIN product_options o ON o.id=ov.option_id
    LEFT JOIN product_variants dv ON dv.id=pc.device_variant_id
    WHERE pc.accessory_product_id=$1 ORDER BY pc.position,d.name,pc.id`, [productId])).rows;
  const devices = new Map<string, { command: DeviceLinkInput; view: CompatibleDeviceView }>();
  for (const row of asAccessory) {
    const key = `${row.device_id}|${row.accessory_sku ?? ""}`;
    let entry = devices.get(key);
    if (!entry) {
      entry = {
        command: { productKey: row.public_key, optionValueKeys: [], variantSkus: [], ...(row.accessory_sku ? { accessoryVariantSku: row.accessory_sku } : {}) },
        view: { productKey: row.public_key, name: row.name, status: row.status, thumbnail: row.thumbnail, primaryCategoryKey: row.category_key, accessoryVariantSku: row.accessory_sku, wholeDevice: false, deviceVariantCount: Number(row.device_variants), optionValues: [], variants: [] },
      };
      devices.set(key, entry);
    }
    if (row.value_id) {
      entry.command.optionValueKeys.push(row.value_id);
      entry.view.optionValues.push({ id: row.value_id, key: row.value_key!, label: row.value_label!, optionKey: row.option_key!, optionName: row.option_name!, variantCount: Number(row.value_variants) });
    } else if (row.variant_sku) {
      entry.command.variantSkus.push(row.variant_sku);
      entry.view.variants.push({ sku: row.variant_sku, title: row.variant_title });
    } else entry.view.wholeDevice = true;
  }
  // A whole-device row already covers the pair; never echo finer rows next to it.
  for (const entry of devices.values()) if (entry.view.wholeDevice) { entry.command.optionValueKeys = []; entry.command.variantSkus = []; }

  const asDevice = (await client.query<{ public_key: string; name: string; status: string; thumbnail: string | null; category_key: string | null; category_name: string | null; accessory_sku: string | null; value_id: string | null; value_key: string | null; value_label: string | null; option_key: string | null; variant_id: string | null; variant_sku: string | null; applies: string[] | null }>(`
    SELECT ${counterpartSQL("a")},av.sku AS accessory_sku,ov.id AS value_id,ov.key AS value_key,ov.label AS value_label,o.key AS option_key,pc.device_variant_id AS variant_id,dv.sku AS variant_sku,
      CASE WHEN pc.device_variant_id IS NOT NULL THEN ARRAY[pc.device_variant_id]
           WHEN pc.device_option_value_id IS NOT NULL THEN ARRAY(SELECT s.variant_id FROM variant_option_values s JOIN product_variants v ON v.id=s.variant_id AND v.status<>'archived' WHERE s.option_value_id=pc.device_option_value_id ORDER BY s.variant_id)
           ELSE ARRAY(SELECT v.id FROM product_variants v WHERE v.product_id=pc.device_product_id AND v.status<>'archived' ORDER BY v.id) END AS applies
    FROM product_compatibility pc JOIN products a ON a.id=pc.accessory_product_id
    LEFT JOIN product_variants av ON av.id=pc.accessory_variant_id
    LEFT JOIN option_values ov ON ov.id=pc.device_option_value_id LEFT JOIN product_options o ON o.id=ov.option_id
    LEFT JOIN product_variants dv ON dv.id=pc.device_variant_id
    WHERE pc.device_product_id=$1 ORDER BY pc.position,a.name,pc.id`, [productId])).rows;
  const accessories: AccessoryLinkInput[] = [], compatibleAccessories: CompatibleAccessoryView[] = [];
  for (const row of asDevice) {
    const scope = row.variant_id ? "variant" as const : row.value_id ? "optionValue" as const : "device" as const;
    if (scope === "device") accessories.push({ productKey: row.public_key, ...(row.accessory_sku ? { accessoryVariantSku: row.accessory_sku } : {}) });
    compatibleAccessories.push({
      productKey: row.public_key, name: row.name, status: row.status, thumbnail: row.thumbnail, primaryCategoryKey: row.category_key, primaryCategoryName: row.category_name,
      accessoryVariantSku: row.accessory_sku, scope, optionValue: row.value_id ? { id: row.value_id, key: row.value_key!, label: row.value_label!, optionKey: row.option_key! } : null,
      variantSku: row.variant_sku, appliesToVariantIds: row.applies ?? [],
    });
  }
  return { command: { devices: [...devices.values()].map(entry => entry.command), accessories }, compatibleDevices: [...devices.values()].map(entry => entry.view), compatibleAccessories };
}
