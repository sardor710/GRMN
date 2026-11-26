import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { PricedQuoteDTO, DeliveryAddress, DisplayCurrency, Money, QuoteLineDTO, UsdEquivalentDTO } from "../../contracts/commerce.ts";
import { AuthFailure } from "../auth/config.ts";
import type { PickupSnapshot } from "../../lib/pickup.ts";
import { allocate, percentageHalfUp, percentageOf, usdMinorFromKzt } from "./money.ts";

// Task 13B. Server quotes: every amount is recomputed here from the active KZT prices, admin
// markdown rules, at most one coupon code, and the store's active tax and shipping policy
// versions. Nothing the client sends is a price or a total. A quote is an immutable
// checkout_quotes row that expires; checkout (Task 14A) revalidates it before use. USD is a
// display-only snapshot from the admin rate version; the payable currency is always KZT.

export const QUOTE_TTL_SECONDS = 15 * 60;
const ZERO = BigInt(0);
type Queryable = Pick<PoolClient, "query">;

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const stale = (): never => fail("QUOTE_STALE", 409, "Prices or policies changed; request a new quote");
const kzt = (amount: bigint): Money => ({ amountMinor: amount.toString(), currency: "KZT" });

/** 0033: `pickup` = the customer collects the order at this store (no shipping charge). */
export interface DeliverySnapshot extends DeliveryAddress { addressId?: string; addressVersion?: number; pickup?: PickupSnapshot }
export interface QuoteRequest { market: string; displayCurrency: DisplayCurrency; couponCode: string | null; delivery: DeliverySnapshot }
export interface QuoteCart { cartId: string; cartVersion: number; userId: string | null; /** A checkout attempt whose own coupon hold must not count against it (revalidation on retry). */ checkoutAttemptId?: string }

interface OfferRow { id: string; product_id: string; price_id: string | null; price_version: number | null; amount: string | null; offered: boolean; known: number; free: number; categories: string[] }
interface RuleRow { id: string; version: number; kind: "fixed" | "percentage"; fixed: string | null; bps: number | null; scope: "all" | "categories" | "variants"; stackable: boolean; variants: string[]; categories: string[] }
interface PromotionRow extends RuleRow { code: string; status: string; live: boolean; minimum: string; usage_limit: number | null; per_customer_limit: number | null; legacy_used: number; used_total: number; used_by_user: number }

interface PricedLine {
  variantId: string; productId: string; quantity: number; priceId: string; priceVersion: number;
  baseUnit: bigint; markdownUnit: bigint; unit: bigint; markdownRules: string[];
  discount: bigint; tax: bigint; includedTax: bigint;
}
export interface PricedCart {
  lines: PricedLine[]; subtotal: bigint; discount: bigint; shipping: bigint; tax: bigint; includedTax: bigint; total: bigint;
  coupon: { promotionId: string; code: string; version: number; discountMinor: string } | null;
  policyVersions: { pricing: string; tax: string; shipping: string; promotion: string | null; markdowns: string[]; exchangeRate: string | null };
  /** What the tax and shipping amounts were computed from, so a quote is reproducible on its own. */
  policies: {
    taxPolicy: { id: string; version: number; mode: "inclusive" | "exclusive"; rateBps: number; countryCode: string | null };
    shippingPolicy: { id: string; version: number; rateId: string; rateKey: string; zoneId: string; bandMinor: string; freeFromMinor: string | null };
  };
  usd: { currency: "USD"; amountMinor: string; rateId: string; rateVersion: number; kztPerUsd: string; rateUpdatedAt: string; rounding: "half_up" } | null;
  cartHash: string;
}

const OFFERS_SQL = `SELECT v.id,v.product_id,pr.id AS price_id,pr.version AS price_version,pr.amount_minor::text AS amount,
 (p.status='published' AND v.status='active' AND NOT EXISTS(SELECT 1 FROM product_options po WHERE po.product_id=p.id AND NOT EXISTS(SELECT 1 FROM variant_option_values vo WHERE vo.variant_id=v.id AND vo.option_id=po.id))) AS offered,
 balance.known,balance.free,
 COALESCE((SELECT array_agg(pc.category_id::text ORDER BY pc.category_id) FROM product_categories pc WHERE pc.product_id=p.id),'{}'::text[]) AS categories
 FROM product_variants v JOIN products p ON p.id=v.product_id
 LEFT JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market=$2
 CROSS JOIN LATERAL (SELECT count(*)::int AS known,COALESCE(sum(ib.on_hand-ib.reserved),0)::int AS free FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL WHERE ib.variant_id=v.id) balance
 WHERE v.id=ANY($1::uuid[])`;

const RULES_SQL = `SELECT r.id,r.version,r.kind,r.fixed_minor::text AS fixed,r.percentage_bps AS bps,r.scope,r.stackable,
 COALESCE((SELECT array_agg(x.variant_id::text) FROM price_adjustment_variants x WHERE x.rule_id=r.id),'{}'::text[]) AS variants,
 COALESCE((SELECT array_agg(x.category_id::text) FROM price_adjustment_categories x WHERE x.rule_id=r.id),'{}'::text[]) AS categories
 FROM price_adjustment_rules r
 WHERE r.status='active' AND r.currency='KZT' AND (r.starts_at IS NULL OR r.starts_at<=now()) AND (r.ends_at IS NULL OR r.ends_at>now())
 ORDER BY r.id`;

// Usage counts are advisory here (early feedback); the atomic check is the redemption trigger at
// checkout. A reservation past its hold no longer counts, as reserveCouponQuota expires it first.
const PROMOTION_SQL = `SELECT p.id,p.version,p.code,p.kind,p.fixed_minor::text AS fixed,p.percentage_bps AS bps,p.scope,p.stackable,p.status,
 (p.status='active' AND p.currency='KZT' AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now())) AS live,
 p.minimum_spend_minor::text AS minimum,p.usage_limit,p.per_customer_limit,p.legacy_used_count AS legacy_used,
 COALESCE((SELECT array_agg(x.variant_id::text) FROM promotion_variants x WHERE x.promotion_id=p.id),'{}'::text[]) AS variants,
 COALESCE((SELECT array_agg(x.category_id::text) FROM promotion_categories x WHERE x.promotion_id=p.id),'{}'::text[]) AS categories,
 (SELECT count(*)::int FROM promotion_redemptions r WHERE r.promotion_id=p.id AND r.checkout_attempt_id IS DISTINCT FROM $3::uuid AND (r.status='used' OR (r.status='reserved' AND r.expires_at>clock_timestamp()))) AS used_total,
 (SELECT count(*)::int FROM promotion_redemptions r WHERE r.promotion_id=p.id AND $2::uuid IS NOT NULL AND r.user_id=$2::uuid AND r.checkout_attempt_id IS DISTINCT FROM $3::uuid AND (r.status='used' OR (r.status='reserved' AND r.expires_at>clock_timestamp()))) AS used_by_user
 FROM promotions p WHERE p.code=$1`;

function applies(rule: Pick<RuleRow, "scope" | "variants" | "categories">, line: { variantId: string; categories: string[] }): boolean {
  if (rule.scope === "all") return true;
  if (rule.scope === "variants") return rule.variants.includes(line.variantId);
  return line.categories.some(category => rule.categories.includes(category));
}
const unitOff = (rule: Pick<RuleRow, "kind" | "fixed" | "bps">, unit: bigint): bigint => {
  const off = rule.kind === "percentage" ? percentageOf(unit, rule.bps as number) : BigInt(rule.fixed as string);
  return off > unit ? unit : off;
};
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Key-order independent JSON (jsonb does not keep the insertion order of object keys).
const canonical = (value: unknown): string => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]"
  : value !== null && typeof value === "object" ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}"
  : JSON.stringify(value);

/** Prices a cart without writing. Throws 409 for an empty or unquotable cart, an invalid coupon or a missing policy. */
export async function priceCart(db: Queryable, cart: QuoteCart, request: QuoteRequest): Promise<PricedCart> {
  const items = (await db.query<{ variant_id: string; quantity: number }>("SELECT variant_id,quantity FROM cart_items WHERE cart_id=$1 ORDER BY created_at,variant_id", [cart.cartId])).rows;
  if (!items.length) fail("CART_EMPTY", 409, "Your cart is empty");
  const offers = new Map((await db.query<OfferRow>(OFFERS_SQL, [items.map(item => item.variant_id), request.market])).rows.map(row => [row.id, row]));

  // 1. Current KZT prices and admin markdowns (best single rule, or the sum of stackable rules).
  const rules = (await db.query<RuleRow>(RULES_SQL)).rows, usedRules = new Set<string>();
  const lines: (PricedLine & { categories: string[] })[] = items.map(item => {
    const offer = offers.get(item.variant_id);
    if (!offer || !offer.offered || offer.amount === null || offer.price_id === null || offer.known === 0 || offer.free < item.quantity)
      fail("CART_NOT_QUOTABLE", 409, "Some items are unavailable in the requested quantity; review your cart");
    const o = offer as OfferRow, baseUnit = BigInt(o.amount as string), line = { variantId: item.variant_id, categories: o.categories };
    const matching = rules.filter(rule => applies(rule, line));
    let best: RuleRow | null = null, bestOff = ZERO, stackOff = ZERO;
    for (const rule of matching) {
      const off = unitOff(rule, baseUnit);
      if (rule.stackable) stackOff += off; else if (off > bestOff) { best = rule; bestOff = off; }
    }
    const chosen = stackOff > bestOff ? matching.filter(rule => rule.stackable) : best ? [best] : [];
    let markdownUnit = stackOff > bestOff ? stackOff : bestOff;
    if (markdownUnit > baseUnit) markdownUnit = baseUnit;
    const markdownRules = markdownUnit > ZERO ? chosen.map(rule => `${rule.id}:v${rule.version}`).sort() : [];
    markdownRules.forEach(rule => usedRules.add(rule));
    return {
      variantId: item.variant_id, productId: o.product_id, quantity: item.quantity, priceId: o.price_id as string, priceVersion: o.price_version as number,
      baseUnit, markdownUnit, unit: baseUnit - markdownUnit, markdownRules, discount: ZERO, tax: ZERO, includedTax: ZERO, categories: o.categories,
    };
  });
  const net = (line: PricedLine) => line.unit * BigInt(line.quantity) - line.discount;
  const subtotal = lines.reduce((sum, line) => sum + line.unit * BigInt(line.quantity), ZERO);

  // 2. At most one coupon code, kept separate from markdowns. A nonstackable coupon skips marked-down lines.
  let coupon: PricedCart["coupon"] = null, discount = ZERO;
  if (request.couponCode !== null) {
    const promotion = (await db.query<PromotionRow>(PROMOTION_SQL, [request.couponCode, cart.userId, cart.checkoutAttemptId ?? null])).rows[0];
    if (!promotion || !promotion.live) fail("COUPON_INVALID", 409, "This promo code is not valid");
    const p = promotion as PromotionRow;
    if (p.per_customer_limit !== null && !cart.userId) fail("COUPON_SIGN_IN_REQUIRED", 409, "Sign in to use this promo code");
    const eligible = lines.filter(line => applies(p, line) && (p.stackable || line.markdownUnit === ZERO));
    if (!eligible.length) fail("COUPON_NOT_APPLICABLE", 409, "This promo code does not apply to the items in your cart");
    const eligibleSubtotal = eligible.reduce((sum, line) => sum + net(line), ZERO);
    if (eligibleSubtotal < BigInt(p.minimum)) fail("COUPON_MINIMUM_NOT_MET", 409, "Your cart does not reach this promo code's minimum spend");
    if (p.usage_limit !== null && p.legacy_used + p.used_total >= p.usage_limit) fail("COUPON_EXHAUSTED", 409, "This promo code has been fully used");
    if (p.per_customer_limit !== null && p.used_by_user >= p.per_customer_limit) fail("COUPON_LIMIT_REACHED", 409, "You have already used this promo code");
    discount = p.kind === "percentage" ? percentageOf(eligibleSubtotal, p.bps as number) : BigInt(p.fixed as string);
    if (discount > eligibleSubtotal) discount = eligibleSubtotal;
    allocate(discount, eligible.map(net)).forEach((share, index) => { eligible[index].discount = share; });
    coupon = { promotionId: p.id, code: p.code, version: p.version, discountMinor: discount.toString() };
  }
  const goods = subtotal - discount;

  // 3. The store's active, versioned tax and shipping policies. Nothing is assumed when they are missing.
  const settings = (await db.query<{ tax_id: string | null; shipping_id: string | null; free_from: string | null }>(
    "SELECT active_tax_configuration_id AS tax_id,active_shipping_policy_id AS shipping_id,free_shipping_threshold_minor::text AS free_from FROM store_settings WHERE id=1")).rows[0];
  const taxConfig = settings?.tax_id ? (await db.query<{ version: number; mode: "inclusive" | "exclusive"; rate_bps: number; country_code: string | null }>(
    "SELECT version,mode,rate_bps,country_code FROM tax_configuration WHERE id=$1", [settings.tax_id])).rows[0] : undefined;
  const policy = settings?.shipping_id ? (await db.query<{ version: number }>("SELECT version FROM shipping_policy_versions WHERE id=$1", [settings.shipping_id])).rows[0] : undefined;
  if (!taxConfig || !policy) fail("POLICY_UNAVAILABLE", 409, "Online quotes are not available yet");
  const tc = taxConfig as NonNullable<typeof taxConfig>, sp = policy as NonNullable<typeof policy>;

  // 0033: a pickup order has no shipping charge and needs no delivery band; its policy snapshot is fixed so that
  // placement revalidation (canonical policy comparison) reproduces it exactly.
  const pickup = request.delivery.pickup !== undefined;
  const band = pickup ? { id: "pickup", key: "pickup", zone_id: "pickup", amount: "0" } : (await db.query<{ id: string; key: string; zone_id: string; amount: string }>(
    `SELECT r.id,r.key,r.zone_id,r.amount_minor::text AS amount FROM shipping_rates r JOIN shipping_zones z ON z.id=r.zone_id
     WHERE r.policy_id=$1 AND z.active AND z.countries ? $2 AND r.currency='KZT' AND r.minimum_subtotal_minor<=$3::bigint
       AND (r.maximum_subtotal_minor IS NULL OR r.maximum_subtotal_minor>=$3::bigint) AND r.minimum_weight_grams=0
     ORDER BY r.amount_minor,r.key LIMIT 1`, [settings?.shipping_id, request.delivery.countryCode, goods.toString()])).rows[0];
  if (!band) fail("SHIPPING_UNAVAILABLE", 409, "We do not deliver to this address yet");
  // A tax configuration scoped to one country prices only deliveries to that country.
  if (tc.country_code !== null && tc.country_code !== request.delivery.countryCode) fail("POLICY_UNAVAILABLE", 409, "Online quotes are not available yet for this delivery address");
  const shipping = pickup || (settings?.free_from != null && goods >= BigInt(settings.free_from)) ? ZERO : BigInt((band as { amount: string }).amount), b = band as { id: string; key: string; zone_id: string; amount: string };

  const weights = lines.map(net);
  let tax = ZERO, includedTax = ZERO;
  if (tc.mode === "exclusive") {
    tax = percentageHalfUp(goods, tc.rate_bps);
    allocate(tax, weights).forEach((share, index) => { lines[index].tax = share; });
  } else {
    const denominator = BigInt(10000 + tc.rate_bps);
    includedTax = (goods * BigInt(tc.rate_bps) * BigInt(2) + denominator) / (denominator * BigInt(2));
    allocate(includedTax, weights).forEach((share, index) => { lines[index].includedTax = share; });
  }
  const total = goods + shipping + tax;

  // 4. Optional USD display from the active admin rate version only.
  let usd: PricedCart["usd"] = null;
  if (request.displayCurrency === "USD") {
    const rate = (await db.query<{ id: string; version: number; kzt_per_usd: string; created_at: Date }>(
      "SELECT r.id,r.version,r.kzt_per_usd,r.created_at FROM store_settings s JOIN exchange_rate_versions r ON r.id=s.active_exchange_rate_id WHERE s.id=1 AND s.usd_display_enabled")).rows[0];
    if (rate) usd = { currency: "USD", amountMinor: usdMinorFromKzt(total, rate.kzt_per_usd).toString(), rateId: rate.id, rateVersion: rate.version, kztPerUsd: rate.kzt_per_usd, rateUpdatedAt: rate.created_at.toISOString(), rounding: "half_up" };
  }

  const priced: PricedLine[] = lines.map(line => { const { categories, ...rest } = line; void categories; return rest; });
  return {
    lines: priced, subtotal, discount, shipping, tax, includedTax, total, coupon, usd,
    policies: {
      taxPolicy: { id: settings?.tax_id as string, version: tc.version, mode: tc.mode, rateBps: tc.rate_bps, countryCode: tc.country_code },
      shippingPolicy: { id: settings?.shipping_id as string, version: sp.version, rateId: b.id, rateKey: b.key, zoneId: b.zone_id, bandMinor: b.amount, freeFromMinor: settings?.free_from ?? null },
    },
    cartHash: sha256(priced.map(line => [line.variantId, line.quantity])),
    policyVersions: {
      pricing: sha256(priced.map(line => [line.variantId, line.quantity, line.priceId, line.priceVersion, line.markdownRules])),
      tax: `tax:v${tc.version}`, shipping: `shipping:v${sp.version}`,
      promotion: coupon ? `${coupon.promotionId}:v${coupon.version}` : null,
      markdowns: [...usedRules].sort(), exchangeRate: usd ? `rate:v${usd.rateVersion}` : null,
    },
  };
}

interface QuoteRow {
  id: string; cart_id: string; cart_version: number; display_currency: DisplayCurrency; lines_snapshot: StoredLine[]; policy_versions: StoredPolicies;
  usd_snapshot: PricedCart["usd"]; subtotal_minor: string; discount_minor: string; shipping_minor: string; tax_minor: string; total_minor: string; expires_at: Date;
}
interface StoredLine { variantId: string; productId: string; quantity: number; priceId: string; priceVersion: number; baseUnitMinor: string; markdownUnitMinor: string; unitMinor: string; markdownRules: string[]; discountMinor: string; taxMinor: string; includedTaxMinor: string; totalMinor: string }
type StoredPolicies = PricedCart["policyVersions"] & PricedCart["policies"] & { coupon: PricedCart["coupon"]; request: Omit<QuoteRequest, "delivery"> };

function storedLines(priced: PricedCart): StoredLine[] {
  return priced.lines.map(line => ({
    variantId: line.variantId, productId: line.productId, quantity: line.quantity, priceId: line.priceId, priceVersion: line.priceVersion,
    baseUnitMinor: line.baseUnit.toString(), markdownUnitMinor: line.markdownUnit.toString(), unitMinor: line.unit.toString(), markdownRules: line.markdownRules,
    discountMinor: line.discount.toString(), taxMinor: line.tax.toString(), includedTaxMinor: line.includedTax.toString(),
    totalMinor: (line.unit * BigInt(line.quantity) - line.discount + line.tax).toString(),
  }));
}

function toDTO(row: QuoteRow): PricedQuoteDTO {
  const policies = row.policy_versions, usd = row.usd_snapshot;
  const lines: QuoteLineDTO[] = row.lines_snapshot.map(line => ({
    variantId: line.variantId, quantity: line.quantity, baseUnitPrice: kzt(BigInt(line.baseUnitMinor)), unitPrice: kzt(BigInt(line.unitMinor)),
    discount: kzt(BigInt(line.discountMinor)), tax: kzt(BigInt(line.taxMinor)), includedTax: kzt(BigInt(line.includedTaxMinor)), total: kzt(BigInt(line.totalMinor)),
  }));
  const usdEquivalent: UsdEquivalentDTO | null = usd ? { amountMinor: usd.amountMinor, currency: "USD", exchangeRate: { id: usd.rateId, version: usd.rateVersion, kztPerUsd: usd.kztPerUsd, updatedAt: usd.rateUpdatedAt } } : null;
  return {
    id: row.id, cartId: row.cart_id, cartVersion: row.cart_version, payableCurrency: "KZT", displayCurrency: row.display_currency, lines,
    subtotal: kzt(BigInt(row.subtotal_minor)), discount: kzt(BigInt(row.discount_minor)), shipping: kzt(BigInt(row.shipping_minor)), tax: kzt(BigInt(row.tax_minor)),
    includedTax: kzt(row.lines_snapshot.reduce((sum, line) => sum + BigInt(line.includedTaxMinor), ZERO)), total: kzt(BigInt(row.total_minor)),
    coupon: policies.coupon ? { code: policies.coupon.code, discount: kzt(BigInt(policies.coupon.discountMinor)) } : null,
    usdEquivalent, expiresAt: row.expires_at.toISOString(),
    policyVersions: { pricing: policies.pricing, tax: policies.tax, shipping: policies.shipping, promotion: policies.promotion, markdowns: policies.markdowns, exchangeRate: policies.exchangeRate },
  };
}

const QUOTE_COLUMNS = "id,cart_id,cart_version,display_currency,lines_snapshot,policy_versions,usd_snapshot,subtotal_minor::text,discount_minor::text,shipping_minor::text,tax_minor::text,total_minor::text,expires_at";

/** Prices the cart and stores an immutable quote. Runs inside the caller's transaction with the cart row locked. */
export async function createQuote(client: Queryable, cart: QuoteCart, request: QuoteRequest, ttlSeconds = QUOTE_TTL_SECONDS): Promise<PricedQuoteDTO> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 24 * 60 * 60) throw new RangeError("Quote lifetime must be 1 second to 1 day");
  const priced = await priceCart(client, cart, request);
  const { market, displayCurrency, couponCode } = request;
  const policies: StoredPolicies = { ...priced.policyVersions, ...priced.policies, coupon: priced.coupon, request: { market, displayCurrency, couponCode } };
  const row = (await client.query<QuoteRow>(
    `INSERT INTO checkout_quotes(id,cart_id,cart_version,cart_hash,currency,display_currency,delivery_snapshot,lines_snapshot,policy_versions,usd_snapshot,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at)
     VALUES(gen_random_uuid(),$1,$2,$3,'KZT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,clock_timestamp()+make_interval(secs=>$14)) RETURNING ${QUOTE_COLUMNS}`,
    [cart.cartId, cart.cartVersion, priced.cartHash, priced.usd ? "USD" : "KZT", JSON.stringify(request.delivery), JSON.stringify(storedLines(priced)), JSON.stringify(policies),
      priced.usd ? JSON.stringify(priced.usd) : null, priced.subtotal.toString(), priced.discount.toString(), priced.shipping.toString(), priced.tax.toString(), priced.total.toString(), ttlSeconds])).rows[0];
  return toDTO(row);
}

/**
 * Checkout's guard: the quote must belong to this cart revision, be unexpired, and still match a
 * fresh pricing of the same cart (prices, markdowns, coupon, tax and shipping). USD is display
 * only, so a rate change does not invalidate the KZT amounts.
 */
export async function revalidateQuote(client: Queryable, input: { quoteId: string; cartId: string; cartVersion: number; checkoutAttemptId?: string }): Promise<PricedQuoteDTO> {
  const row = (await client.query<QuoteRow & { expired: boolean }>(`SELECT ${QUOTE_COLUMNS},expires_at<=clock_timestamp() AS expired,delivery_snapshot FROM checkout_quotes WHERE id=$1 AND cart_id=$2 AND cart_version=$3`,
    [input.quoteId, input.cartId, input.cartVersion])).rows[0] as (QuoteRow & { expired: boolean; delivery_snapshot: DeliverySnapshot }) | undefined;
  if (!row) return stale();
  if (row.expired) fail("QUOTE_EXPIRED", 409, "This quote has expired; request a new quote");
  const cart = (await client.query<{ version: number; user_id: string | null; status: string }>("SELECT version,user_id,status FROM carts WHERE id=$1", [input.cartId])).rows[0];
  if (!cart || cart.status !== "active" || cart.version !== input.cartVersion) stale();
  const request = row.policy_versions.request;
  // A 409 from pricing (out of stock, coupon used up, policy withdrawn) keeps its own code.
  const p = await priceCart(client, { cartId: input.cartId, cartVersion: input.cartVersion, userId: cart.user_id, checkoutAttemptId: input.checkoutAttemptId }, { ...request, displayCurrency: "KZT", delivery: row.delivery_snapshot });
  const stored = row.policy_versions;
  const same = p.total.toString() === row.total_minor && p.subtotal.toString() === row.subtotal_minor && p.discount.toString() === row.discount_minor &&
    p.shipping.toString() === row.shipping_minor && p.tax.toString() === row.tax_minor && p.policyVersions.pricing === stored.pricing &&
    p.policyVersions.tax === stored.tax && p.policyVersions.shipping === stored.shipping && p.policyVersions.promotion === stored.promotion &&
    canonical(p.policies) === canonical({ taxPolicy: stored.taxPolicy, shippingPolicy: stored.shippingPolicy }) &&
    canonical(storedLines(p)) === canonical(row.lines_snapshot);
  if (!same) stale();
  return toDTO(row);
}
