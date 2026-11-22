import "server-only";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { DatabaseHandle } from "../db/client.ts";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { authDigest, capabilityHash, createPhoneService } from "../auth/phone-service.ts";
import type { CustomerProfileDTO, DeliveryAddress, GeoPrecision, Money, OrderDetailDTO, OrderItemDTO, OrderSummaryDTO, SavedAddressDTO } from "../../contracts/commerce.ts";
import type { Page } from "../../contracts/pagination.ts";
import { checkBirthDate, checkKzAddress } from "./address-rules.ts";

// Every operation derives the owner from the verified session principal. No input field,
// typed email or phone can select another customer's profile, address book or orders.

export const MAX_SAVED_ADDRESSES = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164 = /^[+][1-9][0-9]{7,14}$/;
const TIMESTAMP_KEY = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const invalid = (message = "Invalid or unknown fields"): never => { throw new AuthFailure("INVALID_INPUT", 400, message); };
const notFound = (): never => { throw new AuthFailure("NOT_FOUND", 404, "Not found"); };
const conflict = (message = "This record changed; reload and try again"): never => { throw new AuthFailure("VERSION_CONFLICT", 409, message); };

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform(value => value || undefined);
const phone = z.string().trim().regex(E164);
const profileInput = z.strictObject({
  name: requiredText(200),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  phone,
  // Optional birthday (M8), checked by checkBirthDate; undefined keeps the stored value.
  birthDate: z.union([z.string().max(10), z.null()]).optional(),
  expectedVersion: z.number().int().min(0),
});
const addressInput = z.strictObject({
  id: z.string().regex(UUID).optional(),
  expectedVersion: z.number().int().min(1).optional(),
  label: requiredText(60),
  recipientName: requiredText(200),
  phone,
  // Kazakhstan only (M8): country, region and the optional pin are checked by checkKzAddress first.
  countryCode: z.string().trim().toUpperCase().pipe(z.literal("KZ")),
  city: requiredText(120),
  line1: requiredText(200),
  line2: optionalText(200),
  region: optionalText(120),
  postalCode: optionalText(20),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  geoPrecision: z.enum(["exact", "street", "locality", "manual"]).nullable().optional(),
  isPrimary: z.boolean().default(false),
}).refine(value => (value.id === undefined) === (value.expectedVersion === undefined));
const pageInput = z.strictObject({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().min(1).max(2048).optional() });
const uuid = z.string().regex(UUID);
const otp = z.string().regex(/^[0-9]{6}$/);
const approveClaimInput = z.strictObject({ orderId: uuid, expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(500), phoneNumber: phone.optional() });
const claimInput = z.strictObject({ orderId: uuid, receiptToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), challengeId: uuid, code: otp });
const changePhoneInput = z.strictObject({ phoneNumber: phone, currentChallengeId: uuid, currentCode: otp, challengeId: uuid, code: otp, expectedVersion: z.number().int().min(0) });
export const CLAIM_RECEIPT_HOURS = 72;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

interface AddressRow { id: string; label: string; recipient_name: string; phone: string; country_code: string; city: string; line1: string; line2: string | null; region: string | null; postal_code: string | null; latitude: string | null; longitude: string | null; geo_precision: GeoPrecision | null; is_primary: boolean; version: number }
const ADDRESS_COLUMNS = "id,label,recipient_name,phone,country_code,city,line1,line2,region,postal_code,latitude::text AS latitude,longitude::text AS longitude,geo_precision,is_primary,version";
function addressDTO(row: AddressRow): SavedAddressDTO {
  return {
    id: row.id, label: row.label, recipientName: row.recipient_name, phone: row.phone, countryCode: row.country_code, city: row.city, line1: row.line1,
    ...(row.line2 ? { line2: row.line2 } : {}), ...(row.region ? { region: row.region } : {}), ...(row.postal_code ? { postalCode: row.postal_code } : {}),
    ...(row.latitude !== null && row.longitude !== null ? { lat: Number(row.latitude), lng: Number(row.longitude), ...(row.geo_precision ? { geoPrecision: row.geo_precision } : {}) } : {}),
    isPrimary: row.is_primary, version: row.version,
  };
}
const money = (amountMinor: string): Money => ({ amountMinor, currency: "KZT" });
const optionalMoney = (amountMinor: string | null) => amountMinor === null ? null : money(amountMinor);
const EVENT_LABELS: Readonly<Record<string, string>> = {
  "order.placed": "Order placed", "order.confirmed": "Order confirmed", "order.cancelled": "Order cancelled",
  "payment.paid": "Payment received", "order.paid": "Payment received", "order.expired": "Order expired", "order.reinstated": "Order reinstated", "refund.succeeded": "Refund issued", "fulfillment.shipped": "Shipped", "fulfillment.delivered": "Delivered",
};

function databaseFailure(error: unknown): unknown {
  if (error instanceof AuthFailure) return error;
  const constraint = (error as { constraint?: unknown } | null)?.constraint;
  if (constraint === "customer_addresses_limit") return new AuthFailure("ADDRESS_LIMIT_REACHED", 409, `At most ${MAX_SAVED_ADDRESSES} addresses can be saved`);
  if (constraint === "users_phone_number_unique") return new AuthFailure("VERSION_CONFLICT", 409, "This phone number is linked to another account");
  if (constraint === "customer_addresses_primary_unique" || constraint === "customer_addresses_primary_required" || constraint === "customer_profiles_user_unique") {
    return new AuthFailure("VERSION_CONFLICT", 409, "This record changed; reload and try again");
  }
  return error;
}

export interface AccountServiceOptions {
  database: Pick<DatabaseHandle, "pool">;
  authorize: (headers: Headers) => Promise<Principal>;
  // Staff decisions that hand customer data to another person need fresh (15 minute) MFA.
  // Without it, approveLegacyClaim fails closed.
  authorizeFresh?: (headers: Headers, permission: Permission) => Promise<Principal>;
  secret: string;
}

export function createAccountService({ database, authorize, authorizeFresh, secret }: AccountServiceOptions) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Account services require the validated auth secret");
  const cursorKey = createHmac("sha256", secret).update("grmn-account-order-cursor:v1").digest();
  // Only consumes challenges; delivery happens through /api/auth/grmn/phone/send.
  const phones = createPhoneService({ database, secret });

  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await database.pool.connect();
    try {
      // The address limit/primary counts need a fresh snapshot after the owner lock wait.
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw databaseFailure(error);
    } finally { client.release(); }
  }
  // Serializes every address-book/profile write for one owner (the database triggers take the same lock).
  async function lockOwner(client: PoolClient, userId: string) {
    const row = await client.query<{ phone_number: string | null; phone_number_verified: boolean }>("SELECT phone_number,phone_number_verified FROM users WHERE id=$1 AND status='active' FOR NO KEY UPDATE", [userId]);
    return row.rows[0] ?? (() => { throw new AuthFailure("UNAUTHENTICATED", 401, "Sign in is required"); })();
  }

  function signCursor(userId: string, placed: string | null, id: string) {
    const payload = Buffer.from(JSON.stringify({ v: 1, u: userId, t: placed, i: id })).toString("base64url");
    return `${payload}.${createHmac("sha256", cursorKey).update(payload).digest("base64url")}`;
  }
  function readCursor(userId: string, cursor: string): { t: string | null; i: string } {
    const [payload, signature, extra] = cursor.split(".");
    if (!payload || !signature || extra !== undefined) return invalid("Invalid page cursor");
    const expected = createHmac("sha256", cursorKey).update(payload).digest(), actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return invalid("Invalid page cursor");
    let value: unknown;
    try { value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return invalid("Invalid page cursor"); }
    const data = value as { v?: unknown; u?: unknown; t?: unknown; i?: unknown };
    if (data.v !== 1 || data.u !== userId || typeof data.i !== "string" || !UUID.test(data.i) || !(data.t === null || (typeof data.t === "string" && TIMESTAMP_KEY.test(data.t)))) return invalid("Invalid page cursor");
    return { t: data.t, i: data.i };
  }

  return {
    async getProfile(headers: Headers): Promise<CustomerProfileDTO> {
      const principal = await authorize(headers);
      const result = await database.pool.query<{ user_name: string; user_email: string; user_email_verified: boolean; phone_number: string | null; phone_number_verified: boolean; id: string | null; name: string | null; email: string | null; email_verified_at: Date | null; birth_date: string | null; profile_state: "provisional" | "complete" | null; version: number | null }>(
        "SELECT u.name AS user_name,u.email AS user_email,u.email_verified AS user_email_verified,u.phone_number,u.phone_number_verified,p.id,p.name,p.email,p.email_verified_at,to_char(p.birth_date,'YYYY-MM-DD') AS birth_date,p.profile_state,p.version FROM users u LEFT JOIN customer_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.status='active'", [principal.userId]);
      const row = result.rows[0] ?? (() => { throw new AuthFailure("UNAUTHENTICATED", 401, "Sign in is required"); })();
      const profileEmail = row.id !== null && row.email !== null;
      return {
        id: row.id, name: row.name ?? row.user_name, email: profileEmail ? row.email : row.user_email,
        emailVerified: profileEmail ? row.email_verified_at !== null : row.user_email_verified,
        phone: row.phone_number, phoneVerified: Boolean(row.phone_number && row.phone_number_verified), birthDate: row.birth_date,
        profileState: row.profile_state ?? "provisional", version: row.version ?? 0,
      };
    },

    // Saves the customer-facing profile. The email is an unverified contact value stored on the
    // profile; it never replaces the auth login email, never marks anything verified and never
    // links orders. The phone must equal the session owner's verified phone (changes are 10B).
    async saveProfile(headers: Headers, input: unknown): Promise<CustomerProfileDTO> {
      const principal = await authorize(headers), command = parse(profileInput, input);
      const birth = checkBirthDate(command.birthDate);
      if (!birth.ok) return invalid(birth.message);
      // undefined keeps the stored birthday; null clears it.
      const keepBirth = birth.value === undefined, birthDate = birth.value ?? null;
      return transaction(async client => {
        const owner = await lockOwner(client, principal.userId);
        if (!owner.phone_number || !owner.phone_number_verified || owner.phone_number !== command.phone) invalid("Phone must match your verified phone number");
        const values = [principal.userId, command.name, command.email, command.phone];
        type Saved = { id: string; version: number; email_verified_at: Date | null; birth_date: string | null };
        // A new or changed email is stored unverified; only an unchanged email keeps prior verification.
        const saved = command.expectedVersion === 0
          ? await client.query<Saved>("INSERT INTO customer_profiles(id,user_id,name,email,email_verified_at,entered_phone,normalized_phone,birth_date,profile_state,version) VALUES($5,$1,$2,$3,NULL,$4,$4,$6::date,'complete',1) ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING RETURNING id,version,email_verified_at,to_char(birth_date,'YYYY-MM-DD') AS birth_date", [...values, randomUUID(), birthDate])
          : await client.query<Saved>("UPDATE customer_profiles SET name=$2,email_verified_at=CASE WHEN email IS NOT DISTINCT FROM $3 THEN email_verified_at ELSE NULL END,email=$3,entered_phone=$4,normalized_phone=$4,birth_date=CASE WHEN $7::boolean THEN birth_date ELSE $6::date END,profile_state='complete',version=version+1,updated_at=now() WHERE user_id=$1 AND version=$5 RETURNING id,version,email_verified_at,to_char(birth_date,'YYYY-MM-DD') AS birth_date", [...values, command.expectedVersion, birthDate, keepBirth]);
        const row = saved.rows[0] ?? conflict();
        return { id: row.id, name: command.name, email: command.email, emailVerified: row.email_verified_at !== null, phone: command.phone, phoneVerified: true, birthDate: row.birth_date, profileState: "complete" as const, version: row.version };
      });
    },

    async listAddresses(headers: Headers): Promise<Page<SavedAddressDTO>> {
      const principal = await authorize(headers);
      const rows = await database.pool.query<AddressRow>(`SELECT ${ADDRESS_COLUMNS} FROM customer_addresses WHERE user_id=$1 ORDER BY is_primary DESC,created_at,id LIMIT ${MAX_SAVED_ADDRESSES}`, [principal.userId]);
      return { items: rows.rows.map(addressDTO), nextCursor: null };
    },

    // Creates (no id) or edits (id + expectedVersion) a saved address. isPrimary only promotes:
    // the primary moves when another address is selected or the primary is deleted.
    async saveAddress(headers: Headers, input: unknown): Promise<SavedAddressDTO> {
      const principal = await authorize(headers);
      // Clear Kazakhstan-specific reasons first (country, region, pin), then the strict schema.
      const kz = input && typeof input === "object" && !Array.isArray(input) ? checkKzAddress(input as Record<string, unknown>) : { ok: false as const, message: "Invalid or unknown fields" };
      if (!kz.ok) return invalid(kz.message);
      const command = parse(addressInput, input);
      const fields = [command.label, command.recipientName, command.phone, "KZ", command.city, command.line1, command.line2 ?? null, kz.value.region, command.postalCode ?? null, kz.value.lat, kz.value.lng, kz.value.geoPrecision];
      return transaction(async client => {
        await lockOwner(client, principal.userId);
        if (command.id === undefined) {
          const count = (await client.query<{ n: number }>("SELECT count(*)::int AS n FROM customer_addresses WHERE user_id=$1", [principal.userId])).rows[0].n;
          if (count >= MAX_SAVED_ADDRESSES) throw new AuthFailure("ADDRESS_LIMIT_REACHED", 409, `At most ${MAX_SAVED_ADDRESSES} addresses can be saved`);
          const primary = command.isPrimary || count === 0;
          if (primary) await client.query("UPDATE customer_addresses SET is_primary=false,version=version+1,updated_at=now() WHERE user_id=$1 AND is_primary", [principal.userId]);
          const created = await client.query<AddressRow>(`INSERT INTO customer_addresses(id,user_id,label,recipient_name,phone,country_code,city,line1,line2,region,postal_code,latitude,longitude,geo_precision,is_primary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${ADDRESS_COLUMNS}`, [randomUUID(), principal.userId, ...fields, primary]);
          return addressDTO(created.rows[0]);
        }
        const current = (await client.query<{ version: number; is_primary: boolean }>("SELECT version,is_primary FROM customer_addresses WHERE id=$1 AND user_id=$2 FOR UPDATE", [command.id, principal.userId])).rows[0] ?? notFound();
        if (current.version !== command.expectedVersion) conflict();
        const primary = current.is_primary || command.isPrimary;
        if (primary && !current.is_primary) await client.query("UPDATE customer_addresses SET is_primary=false,version=version+1,updated_at=now() WHERE user_id=$1 AND is_primary", [principal.userId]);
        const updated = await client.query<AddressRow>(`UPDATE customer_addresses SET label=$3,recipient_name=$4,phone=$5,country_code=$6,city=$7,line1=$8,line2=$9,region=$10,postal_code=$11,latitude=$12,longitude=$13,geo_precision=$14,is_primary=$15,version=version+1,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING ${ADDRESS_COLUMNS}`, [command.id, principal.userId, ...fields, primary]);
        return addressDTO(updated.rows[0]);
      });
    },

    async deleteAddress(headers: Headers, id: unknown, expectedVersion: unknown): Promise<{ id: string; deleted: true }> {
      const principal = await authorize(headers);
      if (typeof id !== "string" || !UUID.test(id)) return notFound();
      if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) return invalid();
      return transaction(async client => {
        await lockOwner(client, principal.userId);
        const current = (await client.query<{ version: number; is_primary: boolean }>("SELECT version,is_primary FROM customer_addresses WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, principal.userId])).rows[0] ?? notFound();
        if (current.version !== expectedVersion) conflict();
        await client.query("DELETE FROM customer_addresses WHERE id=$1 AND user_id=$2", [id, principal.userId]);
        // The oldest remaining address inherits primary so a nonempty book always has one.
        if (current.is_primary) await client.query("UPDATE customer_addresses SET is_primary=true,version=version+1,updated_at=now() WHERE id=(SELECT id FROM customer_addresses WHERE user_id=$1 ORDER BY created_at,id LIMIT 1)", [principal.userId]);
        return { id, deleted: true as const };
      });
    },

    async getOwnOrders(headers: Headers, input: unknown): Promise<Page<OrderSummaryDTO>> {
      const principal = await authorize(headers), page = parse(pageInput, input ?? {}), limit = page.limit ?? 20;
      const after = page.cursor === undefined ? null : readCursor(principal.userId, page.cursor);
      const args: unknown[] = [principal.userId, limit + 1];
      let where = "";
      if (after) {
        args.push(after.i);
        if (after.t === null) where = " AND o.placed_at IS NULL AND o.id<$3::uuid";
        else { args.push(after.t); where = " AND (o.placed_at<$4::timestamptz OR (o.placed_at=$4::timestamptz AND o.id<$3::uuid) OR o.placed_at IS NULL)"; }
      }
      const rows = (await database.pool.query<{ id: string; order_number: string; placed_key: string | null; shown_at: Date; order_status: OrderSummaryDTO["status"]; payment_status: OrderSummaryDTO["paymentStatus"]; fulfillment_status: OrderSummaryDTO["fulfillmentStatus"]; payment_mode: OrderSummaryDTO["paymentMode"]; total_minor: string; items_count: number }>(
        `SELECT o.id,o.order_number,to_char(o.placed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS placed_key,COALESCE(o.placed_at,o.created_at) AS shown_at,o.order_status,o.payment_status,o.fulfillment_status,o.payment_mode,o.total_minor::text AS total_minor,(SELECT COALESCE(sum(quantity),0)::int FROM order_items WHERE order_id=o.id) AS items_count FROM orders o WHERE o.user_id=$1${where} ORDER BY o.placed_at DESC NULLS LAST,o.id DESC LIMIT $2`, args)).rows;
      const items = rows.slice(0, limit), last = items.at(-1);
      return {
        items: items.map(row => ({ id: row.id, orderNumber: row.order_number, createdAt: row.shown_at.toISOString(), status: row.order_status, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status, paymentMode: row.payment_mode, total: money(row.total_minor), itemsCount: row.items_count })),
        nextCursor: rows.length > limit && last ? signCursor(principal.userId, last.placed_key, last.id) : null,
      };
    },

    async getOwnOrder(headers: Headers, orderId: unknown): Promise<OrderDetailDTO> {
      const principal = await authorize(headers);
      if (typeof orderId !== "string" || !UUID.test(orderId)) return notFound();
      const order = (await database.pool.query<{ id: string; order_number: string; shown_at: Date; order_status: OrderSummaryDTO["status"]; payment_status: OrderSummaryDTO["paymentStatus"]; fulfillment_status: OrderSummaryDTO["fulfillmentStatus"]; payment_mode: OrderSummaryDTO["paymentMode"]; total_minor: string; subtotal_minor: string | null; discount_minor: string | null; shipping_minor: string | null; tax_minor: string | null; contact_name: string; contact_phone: string | null; contact_email: string | null; data_quality: OrderDetailDTO["dataQuality"]; version: number }>(
        "SELECT id,order_number,COALESCE(placed_at,created_at) AS shown_at,order_status,payment_status,fulfillment_status,payment_mode,total_minor::text AS total_minor,subtotal_minor::text AS subtotal_minor,discount_minor::text AS discount_minor,shipping_minor::text AS shipping_minor,tax_minor::text AS tax_minor,contact_name,contact_phone,contact_email,data_quality,version FROM orders WHERE id=$1 AND user_id=$2", [orderId, principal.userId])).rows[0] ?? notFound();
      const [items, address, events, shipments] = await Promise.all([
        database.pool.query<{ id: string; product_key: string | null; sku: string | null; name: string; options: Record<string, unknown>; quantity: number; unit_price_minor: string; discount_minor: string; tax_minor: string; total_minor: string }>("SELECT id,product_key,sku,name,options,quantity,unit_price_minor::text AS unit_price_minor,discount_minor::text AS discount_minor,tax_minor::text AS tax_minor,total_minor::text AS total_minor FROM order_items WHERE order_id=$1 ORDER BY id", [orderId]),
        database.pool.query<{ kind: "structured" | "legacy_unstructured"; recipient_name: string | null; phone: string | null; country_code: string | null; city: string | null; line1: string | null; line2: string | null; region: string | null; postal_code: string | null; legacy_raw: string | null }>("SELECT kind,recipient_name,phone,country_code,city,line1,line2,region,postal_code,legacy_raw FROM order_addresses WHERE order_id=$1", [orderId]),
        database.pool.query<{ id: string; type: string; happened_at: Date }>("SELECT id,type,COALESCE(occurred_at,recorded_at) AS happened_at FROM order_events WHERE order_id=$1 AND visibility='customer' ORDER BY COALESCE(occurred_at,recorded_at),id", [orderId]),
        // Task 16A: only dispatched and delivered shipments, without carrier, tracking or staff notes (D04).
        database.pool.query<{ id: string; status: "dispatched" | "delivered"; dispatched_at: Date; delivered_at: Date | null; items: { orderItemId: string; quantity: number }[] }>("SELECT s.id,s.status,s.dispatched_at,s.delivered_at,(SELECT COALESCE(json_agg(json_build_object('orderItemId',g.order_item_id,'quantity',g.quantity) ORDER BY g.order_item_id),'[]'::json) FROM (SELECT order_item_id,sum(quantity)::int AS quantity FROM shipment_items WHERE shipment_id=s.id GROUP BY order_item_id) g) AS items FROM shipments s WHERE s.order_id=$1 AND s.status IN ('dispatched','delivered') ORDER BY s.dispatched_at,s.id", [orderId]),
      ]);
      const snapshot = address.rows[0];
      let deliveryAddress: OrderDetailDTO["deliveryAddress"] = null;
      if (snapshot?.kind === "legacy_unstructured" && snapshot.legacy_raw) deliveryAddress = { kind: "legacy_unstructured", raw: snapshot.legacy_raw };
      else if (snapshot?.kind === "structured") {
        const value: DeliveryAddress = { recipientName: snapshot.recipient_name ?? "", phone: snapshot.phone ?? "", countryCode: snapshot.country_code ?? "", city: snapshot.city ?? "", line1: snapshot.line1 ?? "",
          ...(snapshot.line2 ? { line2: snapshot.line2 } : {}), ...(snapshot.region ? { region: snapshot.region } : {}), ...(snapshot.postal_code ? { postalCode: snapshot.postal_code } : {}) };
        deliveryAddress = { kind: "structured", address: value };
      }
      const lines: OrderItemDTO[] = items.rows.map(row => ({
        id: row.id, productKey: row.product_key, sku: row.sku, name: row.name,
        // Only flat customer-chosen option strings are shown; nested/provider data stays private.
        options: Object.fromEntries(Object.entries(row.options ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
        quantity: row.quantity, unitPrice: money(row.unit_price_minor), discount: money(row.discount_minor), tax: money(row.tax_minor), total: money(row.total_minor),
      }));
      return {
        id: order.id, orderNumber: order.order_number, createdAt: order.shown_at.toISOString(), status: order.order_status, paymentStatus: order.payment_status, fulfillmentStatus: order.fulfillment_status,
        paymentMode: order.payment_mode, total: money(order.total_minor), itemsCount: lines.reduce((sum, line) => sum + line.quantity, 0), version: order.version,
        contact: { name: order.contact_name, phone: order.contact_phone, email: order.contact_email }, deliveryAddress, dataQuality: order.data_quality, items: lines,
        subtotal: optionalMoney(order.subtotal_minor), discount: optionalMoney(order.discount_minor), shipping: optionalMoney(order.shipping_minor), tax: optionalMoney(order.tax_minor),
        events: events.rows.map(row => ({ id: row.id, type: row.type, occurredAt: row.happened_at.toISOString(), label: EVENT_LABELS[row.type] ?? row.type })),
        shipments: shipments.rows.map(row => ({ id: row.id, status: row.status, dispatchedAt: row.dispatched_at.toISOString(), deliveredAt: row.delivered_at?.toISOString() ?? null, items: row.items })),
        originalUsdEquivalent: null,
      };
    },

    // Staff step of an audited legacy claim: issues a single-use receipt bound to one unowned
    // order and one canonical phone. A newer receipt revokes the previous open one.
    async approveLegacyClaim(headers: Headers, input: unknown): Promise<{ orderId: string; receiptToken: string; expiresAt: string }> {
      if (!authorizeFresh) throw new AuthFailure("FORBIDDEN", 403, "Fresh staff verification is unavailable");
      const principal = await authorizeFresh(headers, "customers:write");
      if (!principal.permissions.includes("customers:write")) throw new AuthFailure("FORBIDDEN", 403, "Permission is required");
      const command = parse(approveClaimInput, input);
      return transaction(async client => {
        const order = (await client.query<{ user_id: string | null; contact_phone: string | null; version: number }>("SELECT user_id,contact_phone,version FROM orders WHERE id=$1 FOR UPDATE", [command.orderId])).rows[0] ?? notFound();
        if (order.user_id !== null) conflict("This order already has an owner");
        if (order.version !== command.expectedVersion) conflict();
        const phoneNumber = command.phoneNumber ?? order.contact_phone?.trim() ?? "";
        if (!E164.test(phoneNumber)) invalid("The order phone is not canonical; supply the confirmed phoneNumber");
        const receiptToken = randomBytes(32).toString("base64url");
        await client.query("UPDATE order_claim_approvals SET revoked_at=now() WHERE order_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL", [command.orderId]);
        const approvalId = randomUUID();
        const created = await client.query<{ expires_at: Date }>(`INSERT INTO order_claim_approvals(id,order_id,token_hash,phone_number,approved_by,reason,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '${CLAIM_RECEIPT_HOURS} hours') RETURNING expires_at`, [approvalId, command.orderId, capabilityHash(receiptToken), phoneNumber, principal.userId, command.reason]);
        await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'staff.legacy_claim_approved','order',$3,$4,$5)", [randomUUID(), principal.userId, command.orderId, `legacy-claim-approved:${randomUUID()}`, JSON.stringify({ approvalId, phoneDigest: authDigest(secret, `claim-phone:${phoneNumber}`), phoneOverride: command.phoneNumber !== undefined, reason: command.reason })]);
        return { orderId: command.orderId, receiptToken, expiresAt: created.rows[0].expires_at.toISOString() };
      });
    },

    // Customer step: the session owner proves fresh possession of their verified phone and
    // redeems a receipt approved for that phone and order. A typed contact match grants nothing.
    async claimLegacyOrder(headers: Headers, input: unknown): Promise<{ id: string; claimed: true }> {
      const principal = await authorize(headers), command = parse(claimInput, input);
      const owner = (await database.pool.query<{ phone_number: string | null; phone_number_verified: boolean; staff: boolean }>("SELECT phone_number,phone_number_verified,EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id) AS staff FROM users u WHERE id=$1 AND status='active'", [principal.userId])).rows[0];
      // Separation of duties: staff (including every possible approver) cannot redeem receipts.
      if (owner?.staff) throw new AuthFailure("FORBIDDEN", 403, "Staff accounts cannot claim customer orders");
      if (!owner?.phone_number || !owner.phone_number_verified) throw new AuthFailure("FORBIDDEN", 403, "A verified phone number is required");
      const proof = await phones.consume(command.challengeId, owner.phone_number, command.code, "order_claim");
      return transaction(async client => {
        const locked = await lockOwner(client, principal.userId);
        if (locked.phone_number !== proof.phoneNumber || !locked.phone_number_verified) throw new AuthFailure("UNAUTHENTICATED", 401, "Invalid or expired verification");
        // Lock order before approval (same order as approveLegacyClaim). Every mismatch is the same 404.
        if (!(await client.query("SELECT 1 FROM orders WHERE id=$1 AND user_id IS NULL FOR UPDATE", [command.orderId])).rowCount) notFound();
        const approval = (await client.query<{ id: string }>("SELECT id FROM order_claim_approvals WHERE token_hash=$1 AND order_id=$2 AND phone_number=$3 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE", [capabilityHash(command.receiptToken), command.orderId, proof.phoneNumber])).rows[0] ?? notFound();
        await client.query("UPDATE orders SET user_id=$2,version=version+1,updated_at=now() WHERE id=$1", [command.orderId, principal.userId]);
        await client.query("UPDATE order_claim_approvals SET consumed_at=now(),consumed_by=$2 WHERE id=$1", [approval.id, principal.userId]);
        await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'customer.legacy_order_claimed','order',$3,$4,$5)", [randomUUID(), principal.userId, command.orderId, `legacy-order-claimed:${command.orderId}`, JSON.stringify({ approvalId: approval.id })]);
        return { id: command.orderId, claimed: true as const };
      });
    },

    // Verified phone change: fresh proof of the current and the new number, unique identity,
    // then every session of the account is revoked so the user signs in again.
    async changePhone(headers: Headers, input: unknown): Promise<{ phone: string; version: number; signedOut: true }> {
      const principal = await authorize(headers), command = parse(changePhoneInput, input);
      const owner = (await database.pool.query<{ phone_number: string | null; phone_number_verified: boolean; staff: boolean }>("SELECT phone_number,phone_number_verified,EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id) AS staff FROM users u WHERE id=$1 AND status='active'", [principal.userId])).rows[0];
      if (!owner) throw new AuthFailure("UNAUTHENTICATED", 401, "Sign in is required");
      if (owner.staff) throw new AuthFailure("FORBIDDEN", 403, "Staff identity changes are managed separately");
      if (!owner.phone_number || !owner.phone_number_verified) invalid("A verified phone number is required");
      const current = owner.phone_number as string;
      if (command.phoneNumber === current) invalid("The new phone number must differ");
      await phones.consume(command.currentChallengeId, current, command.currentCode, "phone_change_current");
      await phones.consume(command.challengeId, command.phoneNumber, command.code, "phone_change_new");
      return transaction(async client => {
        const locked = await lockOwner(client, principal.userId);
        if (locked.phone_number !== current || !locked.phone_number_verified) conflict();
        const profile = (await client.query<{ version: number }>("SELECT version FROM customer_profiles WHERE user_id=$1 FOR UPDATE", [principal.userId])).rows[0];
        if ((profile?.version ?? 0) !== command.expectedVersion) conflict();
        await client.query("UPDATE users SET phone_number=$2,phone_number_verified=true,updated_at=now() WHERE id=$1", [principal.userId, command.phoneNumber]);
        const version = profile ? (await client.query<{ version: number }>("UPDATE customer_profiles SET entered_phone=$2,normalized_phone=$2,version=version+1,updated_at=now() WHERE user_id=$1 RETURNING version", [principal.userId, command.phoneNumber])).rows[0].version : 0;
        // An unfinished signup for the new number can no longer create a second identity for it.
        await client.query("UPDATE customer_completion_sessions SET revoked_at=now() WHERE phone_number=$1 AND consumed_at IS NULL AND revoked_at IS NULL", [command.phoneNumber]);
        await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [principal.userId]);
        await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key) VALUES($1,$2,'customer.phone_changed','user',$2,$3)", [randomUUID(), principal.userId, `phone-changed:${randomUUID()}`]);
        return { phone: command.phoneNumber, version, signedOut: true as const };
      });
    },
  };
}
export type AccountService = ReturnType<typeof createAccountService>;
