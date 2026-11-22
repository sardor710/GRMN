// npm run dev:seed — idempotent store configuration for the local PostgreSQL stack, following the
// checkout integration-test recipe (tests/integration/checkout.test.mjs): the `main` stock location,
// an active KZ tax configuration, an active shipping policy with a KZ zone and a flat KZT rate, and
// store_settings row 1 pointing at them. Existing active policies are never replaced, so values an
// owner later sets in the admin survive re-runs; only missing pieces are created.
//
// Dev placeholders (documented in docs/backend/local-development.md):
//   tax: inclusive 16% VAT, KZ only (catalog prices already include VAT; totals equal shelf prices)
//   shipping: one flat "standard" band, 2 000 KZT, KZ only, no free-shipping threshold
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { log, withDevDatabase } from "./lib.mjs";

export const DEV_SEED = { taxMode: "inclusive", taxRateBps: 1600, country: "KZ", shippingMinor: 200000, storeName: "Garmin Kazakhstan (local dev)" };

export async function seedDevDatabase(pool) {
  const { syncId } = await import("../../src/server/catalog/variant-sync.ts");
  const { mainLocation } = await import("../../src/server/inventory/service.ts");
  const client = await pool.connect(), report = { location: "existing", tax: "existing", shipping: "existing", settings: "unchanged" };
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('grmn-dev-seed'))");
    const locations = Number((await client.query("SELECT count(*) AS n FROM stock_locations")).rows[0].n);
    await mainLocation(client);
    if (!locations) report.location = "created";
    const settings = (await client.query("SELECT active_tax_configuration_id AS tax,active_shipping_policy_id AS shipping FROM store_settings WHERE id=1")).rows[0];
    let taxId = settings?.tax ?? null, policyId = settings?.shipping ?? null;
    if (!taxId) {
      taxId = syncId("dev-seed", "tax-configuration", "kz-inclusive");
      const exists = (await client.query("SELECT 1 FROM tax_configuration WHERE id=$1", [taxId])).rowCount;
      if (!exists) await client.query("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) SELECT $1,COALESCE(max(version),0)+1,$2,$3,$4 FROM tax_configuration", [taxId, DEV_SEED.taxMode, DEV_SEED.taxRateBps, DEV_SEED.country]);
      report.tax = "created";
    }
    if (!policyId) {
      // An activated (sealed) policy cannot gain bands, so a sealed leftover gets a fresh draft.
      policyId = syncId("dev-seed", "shipping-policy", "kz-flat");
      const policy = (await client.query("SELECT snapshot_sealed FROM shipping_policy_versions WHERE id=$1", [policyId])).rows[0];
      if (policy?.snapshot_sealed) policyId = syncId("dev-seed", "shipping-policy", "kz-flat", String(Date.now()));
      if (!policy || policy.snapshot_sealed) await client.query("INSERT INTO shipping_policy_versions(id,version,metadata) SELECT $1,COALESCE(max(version),0)+1,$2 FROM shipping_policy_versions", [policyId, JSON.stringify({ source: "dev-seed" })]);
      let zone = (await client.query("SELECT id FROM shipping_zones WHERE key='kz' AND active")).rows[0]?.id;
      if (!zone) {
        zone = syncId("dev-seed", "shipping-zone", "kz", String(Date.now()));
        await client.query("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,$2,'Kazakhstan',$3,true)", [zone, (await client.query("SELECT 1 FROM shipping_zones WHERE key='kz'")).rowCount ? `kz-${zone.slice(0, 8)}` : "kz", JSON.stringify([DEV_SEED.country])]);
      }
      if (!(await client.query("SELECT 1 FROM shipping_rates WHERE policy_id=$1", [policyId])).rowCount)
        await client.query("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',$4)", [syncId("dev-seed", "shipping-rate", policyId), policyId, zone, DEV_SEED.shippingMinor]);
      report.shipping = "created";
    }
    report.taxonomy = await seedTaxonomy(client);
    if (!settings) {
      await client.query("INSERT INTO store_settings(id,store_name,maintenance_mode,payment_mode,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,false,'demo',$2,$3)", [DEV_SEED.storeName, taxId, policyId]);
      report.settings = "created";
    } else if (!settings.tax || !settings.shipping) {
      await client.query("UPDATE store_settings SET active_tax_configuration_id=$1,active_shipping_policy_id=$2,version=version+1 WHERE id=1", [taxId, policyId]);
      report.settings = "updated";
    }
    await client.query("COMMIT");
    return report;
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

// Category tree, RU/KK names and menu placements (src/server/catalog/taxonomy-load.ts, shared with
// scripts/ops/load-taxonomy.mjs). Inserts missing nodes only, so categories an owner renames or moves are kept.
export async function seedTaxonomy(client) {
  const { loadTaxonomy } = await import("../../src/server/catalog/taxonomy-load.ts");
  const report = await loadTaxonomy(client, { assignProducts: false });
  return report.inserted || report.translations || report.placements
    ? `${report.inserted} created, ${report.translations} translations, ${report.placements} placements`
    : "existing";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await withDevDatabase(({ database }) => seedDevDatabase(database.pool));
    log(`seed: stock location ${report.location}, tax ${report.tax}, shipping ${report.shipping}, store settings ${report.settings}, taxonomy ${report.taxonomy}`);
  } catch (error) {
    process.stderr.write(`[dev] seed failed: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
