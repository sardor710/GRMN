// Task 23 G7: a migrated database has no store_settings row, so checkout cannot quote and admin
// settings answer "not set up"; nothing in the app or the importer creates it. The operator's
// store-setup command creates the settings, the first tax configuration and shipping policy (zones,
// rates) from a reviewed JSON file, once, with the store CLOSED (maintenance on) until staff open it.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

let temporary, handle;
const setup = () => import("../../scripts/ops/store-setup.ts");
const config = {
  storeName: "GRMN Kazakhstan",
  tax: { mode: "inclusive", rateBps: 1200, countryCode: "KZ" },
  shipping: { zones: [{ key: "kz", name: "Kazakhstan", countries: ["KZ"], rates: [{ key: "standard", amountMinor: "150000" }] }] },
  freeShippingThresholdMinor: "5000000",
  manualPayment: { instructions: "Pay by Kaspi transfer to the number on the receipt.", holdHours: 48 },
};
before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "2" }));
  await migrate(handle.db, { migrationsFolder: "drizzle" });
}, { timeout: 120000 });
after(async () => { try { await handle?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

test("invalid configuration is refused before anything is written", async () => {
  const { setupStore } = await setup();
  for (const bad of [{ ...config, tax: { ...config.tax, rateBps: 20000 } }, { ...config, shipping: { zones: [] } }, { ...config, unknown: 1 },
    { ...config, shipping: { zones: [{ ...config.shipping.zones[0], rates: [{ key: "standard", amountMinor: "1.5" }] }] } }, { ...config, manualPayment: { holdHours: 0 } }])
    await assert.rejects(setupStore(handle.pool, bad), /Invalid store configuration/);
  assert.equal((await handle.pool.query("SELECT count(*)::int AS n FROM store_settings")).rows[0].n, 0);
});

test("setup creates the settings, tax and shipping once, with the store closed, and refuses a second run", async () => {
  const { setupStore } = await setup();
  const result = await setupStore(handle.pool, config);
  assert.deepEqual(result, { created: true, maintenanceMode: true, zones: 1, rates: 1 });
  const s = (await handle.pool.query(`SELECT s.store_name,s.maintenance_mode,s.payment_mode,s.free_shipping_threshold_minor::text AS free,s.manual_payment_instructions AS instr,s.manual_payment_hold_hours AS hold,
    t.mode,t.rate_bps,t.country_code,(SELECT count(*)::int FROM shipping_rates r WHERE r.policy_id=s.active_shipping_policy_id) AS rates
    FROM store_settings s JOIN tax_configuration t ON t.id=s.active_tax_configuration_id WHERE s.id=1`)).rows[0];
  assert.deepEqual(s, { store_name: "GRMN Kazakhstan", maintenance_mode: true, payment_mode: "demo", free: "5000000", instr: config.manualPayment.instructions, hold: 48, mode: "inclusive", rate_bps: 1200, country_code: "KZ", rates: 1 });
  await assert.rejects(setupStore(handle.pool, config), /already set up/);
});
