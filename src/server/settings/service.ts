import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { demoCheckoutForcedOff } from "../payments/demo-mode.ts";
import { parseAnalyticsConfig, validateAnalyticsInput, type AnalyticsConfig } from "../../lib/analytics/config.ts";

// Task 18B. Typed, versioned store settings and the KZT-per-USD rate editor (settings:write, which
// needs fresh MFA). Settings never return raw legacy settings (they may hold old secrets). The
// payment mode is the "Demo checkout" setting (Task 3.1): 'demo' or 'live'. USD display needs an active
// rate. A rate edit is a new immutable exchange_rate_versions row; it never rewrites quotes, orders
// or refunds (13B snapshots them). Every change checks the settings version and is audited.

// audit_events.target_id is a uuid; the single store_settings row (id 1) is audited under this id.
const SETTINGS_TARGET = "00000000-0000-0000-0000-000000000001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const text = (max: number) => z.string().trim().max(max);
const updateInput = z.strictObject({
  expectedVersion: z.number().int().min(1),
  storeName: text(120).min(1).optional(),
  contactEmail: z.union([z.email().max(254), z.literal("")]).optional(),
  supportPhone: z.union([z.string().regex(/^\+[1-9]\d{6,14}$/), z.literal("")]).optional(),
  usdDisplayEnabled: z.boolean().optional(),
  freeShippingThresholdMinor: z.union([z.string().regex(/^(0|[1-9]\d{0,14})$/), z.null()]).optional(),
  maintenanceMode: z.boolean().optional(),
  seoTitle: text(200).optional(),
  seoDescription: text(500).optional(),
  activeTaxConfigurationId: z.string().regex(UUID).optional(),
  activeShippingPolicyId: z.string().regex(UUID).optional(),
  // O07: the receipt's payment instructions for manual-payment orders ("" clears them) and the hold.
  manualPaymentInstructions: z.union([text(2000).min(1), z.literal("")]).optional(),
  manualPaymentHoldHours: z.number().int().min(1).max(168).optional(),
  // Task 3.1: Settings -> Payments -> "Demo checkout". 'demo' offers only the demo method, 'live' only manual.
  paymentMode: z.enum(["demo", "live"]).optional(),
  // Task 5.1: Settings -> Google & analytics. Replaces the whole stored analytics config (blank = unset);
  // formats are checked by validateAnalyticsInput, which names each invalid field.
  analytics: z.strictObject({ ga4Id: text(200).optional(), gtmId: text(200).optional(), googleVerification: text(200).optional(), yandexVerification: text(200).optional() }).optional(),
}).refine(value => Object.keys(value).length > 1);
const rateInput = z.strictObject({ expectedVersion: z.number().int().min(1), kztPerUsd: z.string().regex(/^\d{1,12}(\.\d{1,8})?$/).refine(value => Number(value) > 0) });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}
const trimDecimal = (value: string) => value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;

export interface SettingsDTO {
  version: number; storeName: string | null; contactEmail: string | null; supportPhone: string | null; baseCurrency: "KZT";
  usdDisplayEnabled: boolean; exchangeRate: { id: string; version: number; kztPerUsd: string; createdAt: string } | null;
  activeTaxConfigurationId: string | null; activeShippingPolicyId: string | null; freeShippingThresholdMinor: string | null;
  maintenanceMode: boolean; paymentMode: "demo" | "live"; seoTitle: string | null; seoDescription: string | null;
  /** O07: what manual-payment customers are told, and how long their order is held. */
  manualPayment: { instructions: string | null; holdHours: number };
  /** Task 3.1: whether checkout is in demo mode now, and whether DEMO_CHECKOUT_DISABLED=1 forces it off. */
  demoCheckout: { enabled: boolean; forcedOff: boolean };
  /** Task 5.1: GA4 / GTM ids and Search Console / Yandex Webmaster tokens (presentation_config.analytics). */
  analytics: AnalyticsConfig;
}
interface Row {
  version: number; store_name: string | null; contact_email: string | null; support_phone: string | null; usd_display_enabled: boolean; active_exchange_rate_id: string | null;
  active_tax_configuration_id: string | null; active_shipping_policy_id: string | null; free_shipping_threshold: string | null; maintenance_mode: boolean; payment_mode: "demo" | "live";
  seo_title: string | null; seo_description: string | null; rate_version: number | null; kzt_per_usd: string | null; rate_created_at: Date | null;
  manual_payment_instructions: string | null; manual_payment_hold_hours: number; analytics: unknown;
}
const SELECT = `SELECT s.version,s.store_name,s.contact_email,s.support_phone,s.usd_display_enabled,s.active_exchange_rate_id,s.active_tax_configuration_id,s.active_shipping_policy_id,
  s.free_shipping_threshold_minor::text AS free_shipping_threshold,s.maintenance_mode,s.payment_mode,s.seo_title,s.seo_description,s.manual_payment_instructions,s.manual_payment_hold_hours,s.presentation_config->'analytics' AS analytics,r.version AS rate_version,r.kzt_per_usd::text AS kzt_per_usd,r.created_at AS rate_created_at
  FROM store_settings s LEFT JOIN exchange_rate_versions r ON r.id=s.active_exchange_rate_id WHERE s.id=1`;
function dto(row: Row): SettingsDTO {
  return {
    version: row.version, storeName: row.store_name, contactEmail: row.contact_email, supportPhone: row.support_phone, baseCurrency: "KZT", usdDisplayEnabled: row.usd_display_enabled,
    exchangeRate: row.active_exchange_rate_id && row.kzt_per_usd && row.rate_version && row.rate_created_at ? { id: row.active_exchange_rate_id, version: row.rate_version, kztPerUsd: trimDecimal(row.kzt_per_usd), createdAt: row.rate_created_at.toISOString() } : null,
    activeTaxConfigurationId: row.active_tax_configuration_id, activeShippingPolicyId: row.active_shipping_policy_id, freeShippingThresholdMinor: row.free_shipping_threshold,
    maintenanceMode: row.maintenance_mode, paymentMode: row.payment_mode, seoTitle: row.seo_title, seoDescription: row.seo_description,
    manualPayment: { instructions: row.manual_payment_instructions, holdHours: row.manual_payment_hold_hours },
    demoCheckout: { enabled: row.payment_mode === "demo" && !demoCheckoutForcedOff(), forcedOff: demoCheckoutForcedOff() },
    analytics: parseAnalyticsConfig(row.analytics),
  };
}

/** Task 5.1: the storefront's analytics config (no staff session needed); invalid stored values are dropped. */
export async function readAnalyticsConfig(db: Pick<Pool, "query">): Promise<AnalyticsConfig> {
  const row = (await db.query<{ analytics: unknown }>("SELECT presentation_config->'analytics' AS analytics FROM store_settings WHERE id=1")).rows[0];
  return parseAnalyticsConfig(row?.analytics);
}
/** The normalized analytics config to store, or a 400 naming every invalid field. */
function analyticsCommand(input: Record<string, string | undefined> | undefined): AnalyticsConfig | undefined {
  if (input === undefined) return undefined;
  const { config, errors } = validateAnalyticsInput(input);
  const fields = Object.keys(errors);
  return fields.length ? fail("INVALID_ANALYTICS", 400, `Invalid analytics settings: ${fields.join(", ")}`) : config;
}

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }

export function createSettingsService({ pool, authorize }: Options) {
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
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
  async function locked(client: PoolClient, expected: number): Promise<Row> {
    await client.query("SELECT 1 FROM store_settings WHERE id=1 FOR UPDATE");
    const row = (await client.query<Row>(SELECT)).rows[0] ?? fail("NOT_FOUND", 404, "Store settings are not set up");
    if (row.version !== expected) fail("VERSION_CONFLICT", 409, "Settings changed; reload and try again");
    return row;
  }
  const audit = (client: PoolClient, actor: string, action: string, changes: Record<string, unknown>) => client.query(
    "INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,$3,'settings',$6,$4,$5)",
    [randomUUID(), actor, action, `settings:${randomUUID()}`, JSON.stringify(changes), SETTINGS_TARGET]);

  return {
    async get(headers: Headers): Promise<SettingsDTO> {
      await authorize(headers, "settings:write");
      return dto((await pool.query<Row>(SELECT)).rows[0] ?? fail("NOT_FOUND", 404, "Store settings are not set up"));
    },

    async update(headers: Headers, input: unknown): Promise<SettingsDTO> {
      const principal = await authorize(headers, "settings:write");
      const command = parse(updateInput, input);
      const analytics = analyticsCommand(command.analytics);
      return transaction(async client => {
        const current = await locked(client, command.expectedVersion);
        const usd = command.usdDisplayEnabled ?? current.usd_display_enabled;
        if (usd && !current.active_exchange_rate_id) fail("INVALID_SETTINGS", 409, "Set a USD exchange rate before showing USD prices");
        if (command.activeTaxConfigurationId && !(await client.query("SELECT 1 FROM tax_configuration WHERE id=$1", [command.activeTaxConfigurationId])).rowCount)
          fail("INVALID_SETTINGS", 409, "Unknown tax configuration version");
        if (command.activeShippingPolicyId && !(await client.query("SELECT 1 FROM shipping_policy_versions WHERE id=$1", [command.activeShippingPolicyId])).rowCount)
          fail("INVALID_SETTINGS", 409, "Unknown shipping policy version");
        // Review I7: the shipping guard trigger refuses a policy with no rate bands; say so as a 409.
        if (command.activeShippingPolicyId && !(await client.query("SELECT 1 FROM shipping_rates WHERE policy_id=$1 LIMIT 1", [command.activeShippingPolicyId])).rowCount)
          fail("INVALID_SETTINGS", 409, "This shipping policy has no rate bands");
        const value = <T,>(next: T | undefined, old: T) => next === undefined ? old : next;
        const blank = (next: string | undefined, old: string | null) => next === undefined ? old : next === "" ? null : next;
        await client.query(
          `UPDATE store_settings SET version=version+1,store_name=$1,contact_email=$2,support_phone=$3,usd_display_enabled=$4,free_shipping_threshold_minor=$5,maintenance_mode=$6,
             seo_title=$7,seo_description=$8,active_tax_configuration_id=$9,active_shipping_policy_id=$10,manual_payment_instructions=$11,manual_payment_hold_hours=$12,payment_mode=$13,
             presentation_config=CASE WHEN $14::jsonb IS NULL THEN presentation_config ELSE presentation_config || jsonb_build_object('analytics',$14::jsonb) END WHERE id=1`,
          [value(command.storeName, current.store_name), blank(command.contactEmail, current.contact_email), blank(command.supportPhone, current.support_phone), usd,
            command.freeShippingThresholdMinor === undefined ? current.free_shipping_threshold : command.freeShippingThresholdMinor, value(command.maintenanceMode, current.maintenance_mode),
            blank(command.seoTitle, current.seo_title), blank(command.seoDescription, current.seo_description),
            value(command.activeTaxConfigurationId, current.active_tax_configuration_id), value(command.activeShippingPolicyId, current.active_shipping_policy_id),
            blank(command.manualPaymentInstructions, current.manual_payment_instructions), value(command.manualPaymentHoldHours, current.manual_payment_hold_hours),
            value(command.paymentMode, current.payment_mode), analytics === undefined ? null : JSON.stringify(analytics)]);
        await audit(client, principal.userId, "settings.updated", { fields: Object.keys(command).filter(name => name !== "expectedVersion"), beforeVersion: current.version,
          ...(command.paymentMode !== undefined && command.paymentMode !== current.payment_mode ? { paymentMode: { from: current.payment_mode, to: command.paymentMode } } : {}) });
        return dto((await client.query<Row>(SELECT)).rows[0]);
      });
    },

    /** Records a new KZT-per-USD rate version and makes it active. */
    async setExchangeRate(headers: Headers, input: unknown): Promise<SettingsDTO> {
      const principal = await authorize(headers, "settings:write");
      const command = parse(rateInput, input);
      return transaction(async client => {
        const current = await locked(client, command.expectedVersion);
        await client.query("LOCK TABLE exchange_rate_versions IN SHARE ROW EXCLUSIVE MODE");
        const id = randomUUID();
        const version = (await client.query<{ version: number }>(
          "INSERT INTO exchange_rate_versions(id,version,kzt_per_usd,editor_user_id) SELECT $1,COALESCE(max(version),0)+1,$2::numeric,$3 FROM exchange_rate_versions RETURNING version",
          [id, command.kztPerUsd, principal.userId])).rows[0].version;
        await client.query("UPDATE store_settings SET version=version+1,active_exchange_rate_id=$1 WHERE id=1", [id]);
        await audit(client, principal.userId, "settings.exchange_rate_set", { rateVersion: version, kztPerUsd: command.kztPerUsd, previousRateId: current.active_exchange_rate_id });
        return dto((await client.query<Row>(SELECT)).rows[0]);
      });
    },
  };
}
export type SettingsService = ReturnType<typeof createSettingsService>;
