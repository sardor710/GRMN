import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { DatabaseHandle } from "../db/client.ts";
import type { Principal } from "../context.ts";
import type { Availability, CartDTO, CheckoutQuoteDTO, CheckoutResultDTO, CheckoutStatusDTO, CartLineDTO, CartNoticeCode, Money, PaymentMethodCode } from "../../contracts/commerce.ts";
import { AuthFailure } from "../auth/config.ts";
import { publicImage } from "../catalog/service.ts";
import { createQuote, QUOTE_TTL_SECONDS, type DeliverySnapshot } from "../pricing/quote.ts";
import { placeOrder, readCheckoutStatus } from "../checkout/service.ts";
import { captureSandboxOrder } from "../payments/service.ts";
import type { PaymentProviders } from "../payments/provider.ts";
import { checkKzAddress, DELIVERY_COUNTRY } from "../account/address-rules.ts";
import { findKzCityAnywhere, resolveKzRegion } from "../../lib/kz-regions.ts";

// Server carts (Task 13A). A guest cart is opened only by a random capability held in an HttpOnly
// cookie; only its HMAC digest is stored. A signed-in shopper always uses the account cart, and the
// guest cart is folded into it once by merge(). Prices are never taken from the client: every view
// re-reads the active KZT price, and the price the shopper last saw drives price-change notices.

export const CART_COOKIE = "grmn-cart";
export const MAX_LINE_QUANTITY = 99;
export const MAX_CART_LINES = 100;
const GUEST_TTL = "30 days", ACCOUNT_TTL = "90 days";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const PRODUCT_KEY = /^[^\s/?#\\]{1,200}$/u;

const invalid = (message = "Invalid or unknown fields"): never => { throw new AuthFailure("INVALID_INPUT", 400, message); };
const unavailable = (): never => { throw new AuthFailure("NOT_FOUND", 404, "This product is not available"); };
const outOfStock = (): never => { throw new AuthFailure("OUT_OF_STOCK", 409, "Not enough stock for this quantity"); };
const conflict = (): never => { throw new AuthFailure("VERSION_CONFLICT", 409, "Your cart changed; reload and try again"); };

const version = z.number().int().min(0).max(2147483647);
const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY);
const addInput = z.strictObject({ variantId: z.string().regex(UUID).optional(), productKey: z.string().regex(PRODUCT_KEY).optional(), quantity, expectedCartVersion: version })
  .refine(value => (value.variantId === undefined) !== (value.productKey === undefined));
const setInput = z.strictObject({ quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY), expectedCartVersion: version });
const versionInput = z.strictObject({ expectedCartVersion: version });
const importInput = z.strictObject({ items: z.array(z.strictObject({ id: z.string().min(1).max(200), quantity })).max(MAX_CART_LINES) });
const line = (max: number) => z.string().trim().min(1).max(max);
const inlineAddress = z.strictObject({
  recipientName: line(200), phone: z.string().regex(/^[+][1-9][0-9]{7,14}$/), countryCode: z.string().regex(/^[A-Z]{2}$/), city: line(200), line1: line(300),
  line2: z.string().trim().max(300).optional(), region: z.string().trim().max(200).optional(), postalCode: z.string().trim().max(20).optional(),
});
const quoteInput = z.strictObject({
  cartVersion: version, displayCurrency: z.enum(["KZT", "USD"]),
  delivery: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("inline"), address: inlineAddress }),
    z.strictObject({ kind: z.literal("saved"), addressId: z.string().regex(UUID), version: z.number().int().min(1).max(2147483647) }),
  ]),
  couponCode: z.string().trim().regex(/^[\p{L}\p{N}_-]{1,64}$/u).transform(code => code.toLowerCase()).optional(),
  paymentCurrency: z.string().max(16).optional(),
});

/** The raw inline delivery address of a quote request, if it has one (checked before the strict schema). */
function inlineAddressOf(input: unknown): Record<string, unknown> | null {
  const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const delivery = record(record(input)?.delivery);
  return delivery?.kind === "inline" ? record(delivery.address) : null;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

export type CartCookie = { token: string } | { clear: true };
export interface CartResult { cart: CartDTO; cookie?: CartCookie }
type Notice = { code: CartNoticeCode; variantId: string };
interface Actor { userId: string | null; staff?: boolean; token: string | null; tokenHash: string | null }
interface CartRow { id: string; version: number; expires_at: Date }
interface Offer { variantId: string; productKey: string; name: string; variantName: string; image: string | null; amount: string | null; availability: Availability; free: number }
type Queryable = Pick<PoolClient, "query">;

const money = (amountMinor: string | bigint): Money => ({ amountMinor: String(amountMinor), currency: "KZT" });

// One bounded read for every variant a cart touches: offer eligibility (published product, active
// complete variant, active KZT price in the market) and free stock across live locations.
const OFFER_SQL = `SELECT v.id,v.name AS variant_name,p.public_key,p.name,
 CASE WHEN p.status='published' AND v.status='active' AND NOT EXISTS(SELECT 1 FROM product_options po WHERE po.product_id=p.id AND NOT EXISTS(SELECT 1 FROM variant_option_values vo WHERE vo.variant_id=v.id AND vo.option_id=po.id)) THEN pr.amount_minor::text END AS amount,
 balance.known,balance.free,
 COALESCE((SELECT COALESCE(m.source_path,m.storage_key) FROM product_media pm JOIN media_assets m ON m.id=pm.media_id WHERE pm.product_id=p.id AND (pm.variant_id=v.id OR pm.variant_id IS NULL) AND m.status='ready' AND m.visibility='public' AND m.kind='image' ORDER BY (pm.variant_id IS NOT NULL) DESC,pm.is_primary DESC,pm.position,pm.id LIMIT 1),p.legacy_content->>'image') AS image
 FROM product_variants v JOIN products p ON p.id=v.product_id
 LEFT JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market=$2
 CROSS JOIN LATERAL (SELECT count(*)::int AS known,COALESCE(sum(ib.on_hand-ib.reserved),0)::int AS free FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL WHERE ib.variant_id=v.id) balance
 WHERE v.id=ANY($1::uuid[])`;

export interface CartServiceOptions {
  database: Pick<DatabaseHandle, "pool">;
  secret: string;
  /** The signed-in principal, or null for a guest. Must throw for a session that is present but not admitted. */
  identify: (headers: Headers) => Promise<Principal | null>;
  market?: string;
  /** Quote lifetime (Task 13B); 15 minutes by default. */
  quoteTtlSeconds?: number;
  /** The registered payment adapters (payments/providers.ts). With the D03a sandbox adapter, checkout is a demo purchase captured at once. */
  payments?: PaymentProviders;
}

export function createCartService({ database, secret, identify, market = "default", quoteTtlSeconds = QUOTE_TTL_SECONDS, payments }: CartServiceOptions) {
  // D03a: the payment method checkout accepts. The sandbox adapter is registered only when demo purchases are enabled.
  const paymentMethod: PaymentMethodCode = payments?.get("sandbox") ? "sandbox" : "demo";
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Cart services require the validated auth secret");
  const digest = (token: string) => createHmac("sha256", secret).update("grmn-cart-capability:v1:" + token).digest("hex");

  function readToken(headers: Headers): string | null {
    for (const part of (headers.get("cookie") ?? "").split(";")) {
      const [name, ...value] = part.trim().split("=");
      if (name === CART_COOKIE) { const token = value.join("="); return TOKEN.test(token) ? token : null; }
    }
    return null;
  }
  async function actor(headers: Headers): Promise<Actor> {
    const principal = await identify(headers), token = readToken(headers);
    // Staff = a signed-in principal holding staff permissions (customers hold none; requirePrincipal already
    // refuses a staff session without MFA admission).
    return { userId: principal?.userId ?? null, staff: (principal?.permissions.length ?? 0) > 0, token, tokenHash: token ? digest(token) : null };
  }

  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: unknown }).code === "23514" && /100 lines/.test(String((error as Error).message))) throw new AuthFailure("CART_LIMIT", 409, `A cart holds at most ${MAX_CART_LINES} products`);
      throw error;
    } finally { client.release(); }
  }

  // The active, unexpired cart for the actor. With `lock`, the row is locked and a lapsed cart is retired.
  async function loadCart(db: Queryable, who: Actor, lock: boolean): Promise<CartRow | null> {
    if (!who.userId && !who.tokenHash) return null;
    const row = (who.userId
      ? await db.query<CartRow>(`SELECT id,version,expires_at FROM carts WHERE user_id=$1 AND market=$2 AND currency='KZT' AND status='active'${lock ? " FOR UPDATE" : ""}`, [who.userId, market])
      : await db.query<CartRow>(`SELECT id,version,expires_at FROM carts WHERE guest_token_hash=$1 AND user_id IS NULL AND status='active'${lock ? " FOR UPDATE" : ""}`, [who.tokenHash])).rows[0];
    if (!row) return null;
    if (row.expires_at.getTime() > Date.now()) return row;
    if (lock) await db.query("UPDATE carts SET status='expired' WHERE id=$1", [row.id]);
    return null;
  }
  // `inserted` is false when a concurrent request created the account cart first; that cart is then locked.
  async function createCart(client: PoolClient, who: Actor): Promise<{ cart: CartRow; token?: string; inserted: boolean }> {
    if (who.userId) {
      const inserted = (await client.query<CartRow>(`INSERT INTO carts(id,user_id,market,expires_at) VALUES(gen_random_uuid(),$1,$2,clock_timestamp()+interval '${ACCOUNT_TTL}') ON CONFLICT DO NOTHING RETURNING id,version,expires_at`, [who.userId, market])).rows[0];
      if (inserted) return { cart: inserted, inserted: true };
      const cart = await loadCart(client, who, true);
      return cart ? { cart, inserted: false } : conflict();
    }
    const token = randomBytes(32).toString("base64url");
    const cart = (await client.query<CartRow>(`INSERT INTO carts(id,guest_token_hash,market,expires_at) VALUES(gen_random_uuid(),$1,$2,clock_timestamp()+interval '${GUEST_TTL}') RETURNING id,version,expires_at`, [digest(token), market])).rows[0];
    return { cart, token, inserted: true };
  }

  async function offers(db: Queryable, variantIds: readonly string[]): Promise<Map<string, Offer>> {
    if (!variantIds.length) return new Map();
    const rows = (await db.query<{ id: string; variant_name: string; public_key: string; name: string; amount: string | null; known: number; free: number; image: string | null }>(OFFER_SQL, [variantIds, market])).rows;
    return new Map(rows.map(row => [row.id, {
      variantId: row.id, productKey: row.public_key, name: row.name, variantName: row.variant_name, image: publicImage(row.image), amount: row.amount, free: row.free,
      availability: row.amount === null || row.known === 0 ? "unavailable" : row.free > 0 ? "available" : "out_of_stock",
    } satisfies Offer]));
  }
  async function offerFor(db: Queryable, variantId: string): Promise<Offer> {
    const offer = (await offers(db, [variantId])).get(variantId);
    return offer && offer.amount !== null ? offer : unavailable();
  }
  async function variantForKey(db: Queryable, productKey: string): Promise<string> {
    const row = (await db.query<{ id: string }>("SELECT v.id FROM products p JOIN product_variants v ON v.product_id=p.id AND v.status='active' WHERE p.public_key=$1 AND p.status='published' ORDER BY v.is_default DESC,v.id LIMIT 1", [productKey])).rows[0];
    return row?.id ?? unavailable();
  }

  async function view(db: Queryable, who: Actor, cart: CartRow | null, notices: Notice[] = [], pendingMerge = false): Promise<CartDTO> {
    const owner = who.userId ? "account" : "guest";
    if (!cart) return { id: null, version: 0, owner, lines: [], subtotal: money("0"), expiresAt: null, pendingMerge, notices };
    const rows = (await db.query<{ variant_id: string; quantity: number; seen: string | null }>("SELECT variant_id,quantity,seen_unit_price_minor::text AS seen FROM cart_items WHERE cart_id=$1 ORDER BY created_at,variant_id", [cart.id])).rows;
    const current = await offers(db, rows.map(row => row.variant_id)), all = [...notices];
    const notice = (code: CartNoticeCode, variantId: string) => { if (!all.some(n => n.code === code && n.variantId === variantId)) all.push({ code, variantId }); };
    let subtotal = BigInt(0);
    const lines = rows.map((row): CartLineDTO => {
      const offer = current.get(row.variant_id), amount = offer?.amount ?? null, availability = offer?.availability ?? "unavailable";
      const changed = amount !== null && row.seen !== null && row.seen !== amount;
      if (availability === "unavailable") notice("item_unavailable", row.variant_id);
      if (changed) notice("price_changed", row.variant_id);
      if (amount !== null && availability === "available") subtotal += BigInt(amount) * BigInt(row.quantity);
      return {
        variantId: row.variant_id, productKey: offer?.productKey ?? "", name: offer?.name ?? "Unavailable product", variantName: offer?.variantName ?? "", image: offer?.image ?? null,
        quantity: row.quantity, unitPrice: amount === null ? null : money(amount), previousUnitPrice: changed ? money(row.seen as string) : null,
        lineTotal: amount === null ? null : money(BigInt(amount) * BigInt(row.quantity)), availability,
      };
    });
    return { id: cart.id, version: cart.version, owner, lines, subtotal: money(subtotal), expiresAt: cart.expires_at.toISOString(), pendingMerge, notices: all };
  }

  // Runs one cart mutation under the cart row lock with an optimistic version check. A cart is only
  // created when `create` is true; creation counts as the first version.
  async function mutate(headers: Headers, expected: number | null, create: boolean, work: (client: PoolClient, cart: CartRow) => Promise<Notice[] | void>): Promise<CartResult> {
    const who = await actor(headers);
    return transaction(async client => {
      let cart = await loadCart(client, who, true), cookie: CartCookie | undefined;
      if (expected !== null && (cart?.version ?? 0) !== expected) conflict();
      let fresh = false;
      if (!cart) {
        if (!create) return { cart: await view(client, who, null) };
        const created = await createCart(client, who);
        if (!created.inserted && expected !== null) conflict();
        cart = created.cart; fresh = created.inserted;
        if (created.token) cookie = { token: created.token };
      }
      const notices = (await work(client, cart)) ?? [];
      const updated = fresh ? cart : (await client.query<CartRow>(`UPDATE carts SET version=version+1,expires_at=clock_timestamp()+interval '${who.userId ? ACCOUNT_TTL : GUEST_TTL}',updated_at=clock_timestamp() WHERE id=$1 RETURNING id,version,expires_at`, [cart.id])).rows[0];
      return { cart: await view(client, who, updated, notices), ...(cookie ? { cookie } : {}) };
    });
  }

  async function lineQuantity(client: Queryable, cartId: string, variantId: string): Promise<number | null> {
    return (await client.query<{ quantity: number }>("SELECT quantity FROM cart_items WHERE cart_id=$1 AND variant_id=$2", [cartId, variantId])).rows[0]?.quantity ?? null;
  }
  async function lineCount(client: Queryable, cartId: string): Promise<number> {
    return (await client.query<{ n: number }>("SELECT count(*)::int AS n FROM cart_items WHERE cart_id=$1", [cartId])).rows[0].n;
  }
  async function writeLine(client: Queryable, cartId: string, variantId: string, quantity: number, seen: string | null) {
    await client.query("INSERT INTO cart_items(cart_id,variant_id,quantity,seen_unit_price_minor) VALUES($1,$2,$3,$4) ON CONFLICT (cart_id,variant_id) DO UPDATE SET quantity=EXCLUDED.quantity,seen_unit_price_minor=EXCLUDED.seen_unit_price_minor,updated_at=clock_timestamp()", [cartId, variantId, quantity, seen]);
  }
  const cartFull = (): never => { throw new AuthFailure("CART_LIMIT", 409, `A cart holds at most ${MAX_CART_LINES} products`); };

  async function getCart(headers: Headers): Promise<CartResult> {
    const who = await actor(headers), pool = database.pool;
    const cart = await loadCart(pool, who, false);
    let pendingMerge = false, cookie: CartCookie | undefined;
    if (who.tokenHash) {
      const guest = who.userId ? await loadCart(pool, { userId: null, token: who.token, tokenHash: who.tokenHash }, false) : cart;
      if (guest && who.userId) pendingMerge = true;
      // A guest cart converted by checkout keeps its capability for a day: a checkout whose response
      // was lost is retried with the same key and must still identify the same guest (14A review I1).
      if (!guest && !(await pool.query("SELECT 1 FROM carts WHERE guest_token_hash=$1 AND status='converted' AND updated_at>clock_timestamp()-interval '1 day'", [who.tokenHash])).rowCount) cookie = { clear: true };
    }
    return { cart: await view(pool, who, cart, [], pendingMerge), ...(cookie ? { cookie } : {}) };
  }

  return {
    getCart,

    async addLine(headers: Headers, input: unknown): Promise<CartResult> {
      const command = parse(addInput, input);
      return mutate(headers, command.expectedCartVersion, true, async (client, cart) => {
        const variantId = command.variantId ?? await variantForKey(client, command.productKey as string);
        const offer = await offerFor(client, variantId), existing = await lineQuantity(client, cart.id, variantId);
        const next = (existing ?? 0) + command.quantity;
        if (next > MAX_LINE_QUANTITY) invalid(`At most ${MAX_LINE_QUANTITY} of one product per cart`);
        if (offer.availability !== "available" || next > offer.free) outOfStock();
        if (existing === null && await lineCount(client, cart.id) >= MAX_CART_LINES) cartFull();
        await writeLine(client, cart.id, variantId, next, offer.amount);
      });
    },

    async setLine(headers: Headers, variantId: string, input: unknown): Promise<CartResult> {
      if (!UUID.test(variantId)) invalid();
      const command = parse(setInput, input);
      return mutate(headers, command.expectedCartVersion, command.quantity > 0, async (client, cart) => {
        if (command.quantity === 0) { await client.query("DELETE FROM cart_items WHERE cart_id=$1 AND variant_id=$2", [cart.id, variantId]); return; }
        const offer = await offerFor(client, variantId), existing = await lineQuantity(client, cart.id, variantId);
        if (command.quantity > (existing ?? 0) && (offer.availability !== "available" || command.quantity > offer.free)) outOfStock();
        if (existing === null && await lineCount(client, cart.id) >= MAX_CART_LINES) cartFull();
        await writeLine(client, cart.id, variantId, command.quantity, offer.amount);
      });
    },

    async clear(headers: Headers, input: unknown): Promise<CartResult> {
      const command = parse(versionInput, input);
      return mutate(headers, command.expectedCartVersion, false, async (client, cart) => { await client.query("DELETE FROM cart_items WHERE cart_id=$1", [cart.id]); });
    },

    // The shopper has seen the current prices; price-change notices stop until a price moves again.
    async acknowledge(headers: Headers, input: unknown): Promise<CartResult> {
      const command = parse(versionInput, input);
      return mutate(headers, command.expectedCartVersion, false, async (client, cart) => {
        const lines = (await client.query<{ variant_id: string }>("SELECT variant_id FROM cart_items WHERE cart_id=$1 ORDER BY variant_id", [cart.id])).rows;
        const current = await offers(client, lines.map(line => line.variant_id));
        for (const line of lines) {
          const amount = current.get(line.variant_id)?.amount;
          if (amount != null) await client.query("UPDATE cart_items SET seen_unit_price_minor=$3 WHERE cart_id=$1 AND variant_id=$2 AND seen_unit_price_minor IS DISTINCT FROM $3::bigint", [cart.id, line.variant_id, amount]);
        }
      });
    },

    // Task 13B: an immutable server quote for the shopper's current cart revision. Only the cart
    // version, delivery address, display currency and an optional coupon code are accepted; every
    // amount is computed on the server and the payable currency is always KZT.
    async quote(headers: Headers, input: unknown): Promise<CheckoutQuoteDTO> {
      const payment = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>).paymentCurrency : undefined;
      if (payment !== undefined && payment !== "KZT") throw new AuthFailure("UNSUPPORTED_CURRENCY", 400, "Payment is accepted in KZT only");
      // M8.5: delivery is Kazakhstan only. A typed address gets the clear country/region reason
      // before the strict schema, and its region is stored as a kz-regions code.
      const inline = inlineAddressOf(input);
      const kz = inline ? checkKzAddress(inline) : null;
      if (kz && !kz.ok) invalid(kz.message);
      const command = parse(quoteInput, input), who = await actor(headers);
      let delivery: DeliverySnapshot;
      if (command.delivery.kind === "inline") delivery = { ...command.delivery.address, countryCode: DELIVERY_COUNTRY, ...(kz?.ok ? { region: kz.value.region } : {}) };
      else {
        if (!who.userId) throw new AuthFailure("UNAUTHENTICATED", 401, "Sign in to use a saved address");
        const saved = (await database.pool.query<{ version: number; recipient_name: string; phone: string; country_code: string; city: string; line1: string; line2: string | null; region: string | null; postal_code: string | null }>(
          "SELECT version,recipient_name,phone,country_code,city,line1,line2,region,postal_code FROM customer_addresses WHERE id=$1 AND user_id=$2", [command.delivery.addressId, who.userId])).rows[0];
        if (!saved) throw new AuthFailure("NOT_FOUND", 404, "Not found");
        if (saved.version !== command.delivery.version) conflict();
        // Older saved addresses may be outside Kazakhstan: they must be edited in the account first.
        if (saved.country_code !== DELIVERY_COUNTRY) throw new AuthFailure("ADDRESS_NOT_DELIVERABLE", 400, "We deliver only within Kazakhstan; edit this saved address in your account to ship in Kazakhstan");
        const region = resolveKzRegion(saved.region)?.code ?? (saved.region || findKzCityAnywhere(saved.city)?.region.code || null);
        delivery = { addressId: command.delivery.addressId, addressVersion: saved.version, recipientName: saved.recipient_name, phone: saved.phone, countryCode: DELIVERY_COUNTRY, city: saved.city, line1: saved.line1,
          ...(saved.line2 ? { line2: saved.line2 } : {}), ...(region ? { region } : {}), ...(saved.postal_code ? { postalCode: saved.postal_code } : {}) };
      }
      return transaction(async client => {
        const cart = await loadCart(client, who, true);
        if ((cart?.version ?? 0) !== command.cartVersion) conflict();
        if (!cart) throw new AuthFailure("CART_EMPTY", 409, "Your cart is empty");
        const quote = await createQuote(client, { cartId: cart.id, cartVersion: cart.version, userId: who.userId },
          { market, displayCurrency: command.displayCurrency, couponCode: command.couponCode ?? null, delivery }, quoteTtlSeconds);
        return { ...quote, paymentMethod };
      });
    },

    // Task 14A: places one order for the actor's quoted cart revision. The idempotency key comes
    // from the Idempotency-Key header; a retried key returns the same order. A demo order stays
    // unpaid (D03). A sandbox order (D03a demo purchase) is captured right after it committed; if
    // that step fails, the error is returned and a retry with the same key captures the same order
    // once (worker reconciliation would also complete it).
    async checkout(headers: Headers, idempotencyKey: string, input: unknown): Promise<CheckoutResultDTO> {
      const who = await actor(headers);
      const placed = await placeOrder(database.pool, secret, { userId: who.userId, guestTokenHash: who.userId ? null : who.tokenHash, staff: who.staff }, idempotencyKey, input, payments ? { payments } : {});
      if (placed.paymentMode !== "sandbox" || !payments) return placed;
      await captureSandboxOrder(database.pool, payments, placed.orderId);
      const now = (await database.pool.query<{ order_status: CheckoutResultDTO["status"]; payment_status: string }>("SELECT order_status,payment_status FROM orders WHERE id=$1", [placed.orderId])).rows[0];
      return now ? { ...placed, status: now.order_status, paymentState: now.payment_status === "paid" ? "captured" : placed.paymentState } : placed;
    },

    // Task 14A: the polling contract after checkout (owning session, or a guest status token).
    async checkoutStatus(headers: Headers, input: unknown): Promise<CheckoutStatusDTO> {
      const who = await actor(headers);
      return readCheckoutStatus(database.pool, { userId: who.userId, guestTokenHash: null }, input);
    },

    // One-time import of a browser-stored cart. Ids are variant ids or product keys; names and prices
    // are not accepted. A repeated import keeps the larger quantity, so a retry never doubles a line.
    async importLegacy(headers: Headers, input: unknown): Promise<CartResult> {
      const command = parse(importInput, input), notices: Notice[] = [], wanted = new Map<string, number>();
      const pool = database.pool;
      for (const item of command.items) {
        let variantId: string | null = null;
        try { variantId = UUID.test(item.id) ? item.id : PRODUCT_KEY.test(item.id) ? await variantForKey(pool, item.id) : null; } catch { variantId = null; }
        const offer = variantId ? (await offers(pool, [variantId])).get(variantId) : undefined;
        if (!variantId || !offer || offer.amount === null) { notices.push({ code: "item_unavailable", variantId: item.id }); continue; }
        wanted.set(variantId, Math.max(wanted.get(variantId) ?? 0, item.quantity));
      }
      if (!wanted.size) { const result = await getCart(headers); return { ...result, cart: { ...result.cart, notices: [...result.cart.notices, ...notices] } }; }
      return mutate(headers, null, true, async (client, cart) => {
        const current = await offers(client, [...wanted.keys()]);
        let count = await lineCount(client, cart.id);
        for (const [variantId, imported] of wanted) {
          const offer = current.get(variantId);
          if (!offer || offer.amount === null) { notices.push({ code: "item_unavailable", variantId }); continue; }
          const existing = await lineQuantity(client, cart.id, variantId);
          if (existing === null && count >= MAX_CART_LINES) { notices.push({ code: "quantity_adjusted", variantId }); continue; }
          if (existing === null) count++;
          if (existing === null || imported > existing) await writeLine(client, cart.id, variantId, imported, offer.amount);
        }
        return notices;
      });
    },

    // Folds the guest cart into the account cart exactly once. The guest row lock serialises retries
    // and concurrent calls; a guest cart that is no longer active (already merged, by anyone) adds
    // nothing. The guest capability is retired either way.
    async merge(headers: Headers): Promise<CartResult> {
      const who = await actor(headers);
      if (!who.userId) throw new AuthFailure("UNAUTHENTICATED", 401, "Sign in is required");
      if (!who.tokenHash) return { cart: await view(database.pool, who, await loadCart(database.pool, who, false)) };
      return transaction(async client => {
        const guest = await loadCart(client, { userId: null, token: who.token, tokenHash: who.tokenHash }, true);
        if (!guest) return { cart: await view(client, who, await loadCart(client, who, false)), cookie: { clear: true } };
        let account = await loadCart(client, who, true), created = false;
        if (!account) { const made = await createCart(client, who); account = made.cart; created = made.inserted; }
        const notices: Notice[] = [];
        const lines = (await client.query<{ variant_id: string; quantity: number }>("SELECT variant_id,quantity FROM cart_items WHERE cart_id=$1 ORDER BY variant_id", [guest.id])).rows;
        const current = await offers(client, lines.map(line => line.variant_id));
        let count = await lineCount(client, account.id);
        for (const line of lines) {
          const offer = current.get(line.variant_id);
          if (!offer || offer.amount === null) { notices.push({ code: "item_unavailable", variantId: line.variant_id }); continue; }
          const existing = await lineQuantity(client, account.id, line.variant_id);
          if (existing === null && count >= MAX_CART_LINES) { notices.push({ code: "quantity_adjusted", variantId: line.variant_id }); continue; }
          if (existing === null) count++;
          const total = (existing ?? 0) + line.quantity, next = Math.min(MAX_LINE_QUANTITY, total);
          if (next < total) notices.push({ code: "quantity_adjusted", variantId: line.variant_id });
          await writeLine(client, account.id, line.variant_id, next, offer.amount);
        }
        await client.query("UPDATE carts SET status='merged',merged_into_cart_id=$2,updated_at=clock_timestamp() WHERE id=$1", [guest.id, account.id]);
        const updated = created ? account : (await client.query<CartRow>(`UPDATE carts SET version=version+1,expires_at=clock_timestamp()+interval '${ACCOUNT_TTL}',updated_at=clock_timestamp() WHERE id=$1 RETURNING id,version,expires_at`, [account.id])).rows[0];
        return { cart: await view(client, who, updated, notices), cookie: { clear: true } };
      });
    },
  };
}

export type CartService = ReturnType<typeof createCartService>;
