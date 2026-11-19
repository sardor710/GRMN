// Task 23 G7: first-time store configuration. A freshly migrated database has no store_settings row,
// so checkout cannot quote. This creates, once and in one transaction, from a reviewed JSON file:
// the settings row (store CLOSED: maintenance_mode on, payment_mode demo: "Demo checkout" is on by default until launch, Task 3.1;
// staff turn it off in Settings -> Payments to take manual payments),
// tax configuration version 1 and shipping policy version 1 with its zones and rates. Later changes go
// through admin settings (versioned, audited). Money is KZT minor units as decimal strings.
//   DATABASE_URL=… node --conditions=react-server scripts/ops/store-setup.ts <config.json>
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { z } from "zod";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

const minor = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const schema = z.strictObject({
  storeName: z.string().trim().min(1).max(200),
  tax: z.strictObject({ mode: z.enum(["inclusive", "exclusive"]), rateBps: z.number().int().min(0).max(10000), countryCode: z.string().regex(/^[A-Z]{2}$/) }),
  shipping: z.strictObject({ zones: z.array(z.strictObject({ key, name: z.string().trim().min(1).max(200), countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(250), rates: z.array(z.strictObject({ key, amountMinor: minor })).min(1).max(20) })).min(1).max(50) }),
  freeShippingThresholdMinor: minor.optional(),
  manualPayment: z.strictObject({ instructions: z.string().trim().min(1).max(2000).optional(), holdHours: z.number().int().min(1).max(168).optional() }).optional(),
});
export type StoreConfig = z.infer<typeof schema>;

export async function setupStore(pool: Pool, input: unknown): Promise<{ created: true; maintenanceMode: true; zones: number; rates: number }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid store configuration: " + parsed.error.issues.map(i => i.path.join(".") || "(root)").join(", "));
  const c = parsed.data, client = await pool.connect();
  try {
    await client.query("BEGIN");
    if ((await client.query("SELECT 1 FROM store_settings WHERE id=1 FOR UPDATE")).rowCount) throw new Error("The store is already set up; change it in admin settings");
    const tax = randomUUID(), policy = randomUUID();
    await client.query("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,$2,$3,$4)", [tax, c.tax.mode, c.tax.rateBps, c.tax.countryCode]);
    await client.query("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)", [policy]);
    let rates = 0;
    for (const zone of c.shipping.zones) {
      const zoneId = randomUUID();
      await client.query("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,$2,$3,$4,true)", [zoneId, zone.key, zone.name, JSON.stringify(zone.countries)]);
      for (const rate of zone.rates) { await client.query("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,$4,$5)", [randomUUID(), policy, zoneId, rate.key, rate.amountMinor]); rates++; }
    }
    await client.query(
      `INSERT INTO store_settings(id,store_name,active_tax_configuration_id,active_shipping_policy_id,free_shipping_threshold_minor,maintenance_mode,payment_mode,manual_payment_instructions,manual_payment_hold_hours)
       VALUES(1,$1,$2,$3,$4,true,'demo',$5,$6)`,
      [c.storeName, tax, policy, c.freeShippingThresholdMinor ?? null, c.manualPayment?.instructions ?? null, c.manualPayment?.holdHours ?? 48]);
    await client.query("COMMIT");
    return { created: true, maintenanceMode: true, zones: c.shipping.zones.length, rates };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const handle = createDatabase(parseServerEnv({ ...process.env, DATABASE_POOL_MAX: "1" }));
  try {
    if (process.argv.length !== 3) throw new Error("Invalid store configuration: pass exactly one config file");
    process.stdout.write(JSON.stringify(await setupStore(handle.pool, JSON.parse(await readFile(process.argv[2], "utf8")))) + "\n");
  } catch (error) {
    process.stderr.write((error instanceof Error && /^(Invalid store configuration|The store is already set up)/.test(error.message) ? error.message : "Store setup failed") + "\n");
    process.exitCode = 1;
  } finally { await handle.close(); }
}
