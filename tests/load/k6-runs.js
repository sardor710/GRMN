// Task 21B Section 3 load runs (k6). Synthetic data only; run against the disposable perf stack.
//   RUN=steady|burst|checkout|lastunit|dupkey|inject  BASE=https://grmn.perf.internal  FIXTURES=/fixtures.json
// Every request carries a synthetic client address (x-perf-client), so each virtual shopper has its
// own rate-limit bucket behind the perf proxy, as distinct real shoppers would.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import exec from "k6/execution";

const BASE = __ENV.BASE || "https://grmn.perf.internal";
const RUN = __ENV.RUN || "steady";
const fixtures = JSON.parse(open(__ENV.FIXTURES || "/fixtures.json"));
const server5xx = new Counter("server_5xx");
const unexpected = new Rate("unexpected_error_rate");
const business = new Counter("business_rejections");
const checkoutDb = new Trend("checkout_ms", true);
const retries = new Counter("checkout_retries");
// Contention outcomes are logged one per line (k6's summary does not split counters by tag); the
// database check after the run is the verdict.
const outcome = value => console.log("OUTCOME " + value);
const dup = RUN === "dupkey" ? JSON.parse(open(__ENV.DUP_FIXTURE || "/dup.json")) : null;

const ENDPOINTS = ["home", "listing_newest", "listing_filtered", "listing_price_asc", "listing_price_desc", "search", "product", "cart_get", "account_orders", "cart_add", "quote", "checkout"];
const thresholds = { unexpected_error_rate: ["rate<0.01"] };
for (const name of ENDPOINTS) thresholds[`unexpected_error_rate{name:${name}}`] = ["rate<0.01"];
for (const name of ENDPOINTS) thresholds[`http_req_duration{name:${name}}`] = [name === "checkout" ? "p(95)<800" : name === "account_orders" || name.startsWith("cart") || name === "quote" ? "p(95)<400" : "p(95)<300"];

const browseAt = rate => ({ executor: "constant-arrival-rate", rate, timeUnit: "1s", duration: __ENV.DURATION || "30m", preAllocatedVUs: Math.max(100, rate * 2), maxVUs: Math.min(2000, Math.max(200, rate * 20)), exec: "browse" });
const scenarios = {
  steady: { browse: browseAt(100) },
  burst: { browse: { ...browseAt(500), duration: __ENV.DURATION || "5m" } },
  // Failure injection: light browsing plus a checkout stream whose clients retry with the same key.
  inject: {
    browse: { ...browseAt(Number(__ENV.RATE || 50)), duration: __ENV.DURATION || "6m" },
    ...(__ENV.CHECKOUT_RATE ? { checkout: { executor: "constant-arrival-rate", rate: Number(__ENV.CHECKOUT_RATE), timeUnit: "1s", duration: __ENV.DURATION || "6m", preAllocatedVUs: 50, maxVUs: 500, exec: "purchase" } } : {}),
  },
  checkout: { checkout: { executor: "constant-arrival-rate", rate: 20, timeUnit: "1s", duration: __ENV.DURATION || "5m", preAllocatedVUs: 100, maxVUs: 1000, exec: "purchase" } },
  lastunit: { lastunit: { executor: "per-vu-iterations", vus: 100, iterations: 1, maxDuration: "3m", exec: "lastUnit" } },
  dupkey: { dupkey: { executor: "per-vu-iterations", vus: 50, iterations: 1, maxDuration: "2m", exec: "duplicateKey" } },
};
export const options = {
  scenarios: scenarios[RUN], thresholds, insecureSkipTLSVerify: true, discardResponseBodies: false,
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)", "max", "count"],
};

const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
const pick = list => list[Math.floor(Math.random() * list.length)];
function record(res, name, { allow = [] } = {}) {
  if (res.status >= 500 || res.status === 0) server5xx.add(1, { name });
  const ok = (res.status >= 200 && res.status < 400) || allow.includes(res.status);
  if (allow.includes(res.status)) business.add(1, { name, status: String(res.status) });
  unexpected.add(!ok, { name });
  return ok;
}
function get(path, name, extra = {}) {
  const res = http.get(BASE + path, { tags: { name }, headers: { "x-perf-client": extra.client || ip(), ...(extra.headers || {}) }, redirects: 0 });
  record(res, name, extra);
  return res;
}
function post(path, name, body, extra = {}) {
  const res = http.post(BASE + path, JSON.stringify(body), { tags: { name }, headers: { "content-type": "application/json", origin: BASE, "x-perf-client": extra.client || ip(), ...(extra.headers || {}) } });
  record(res, name, extra);
  return res;
}

// Endpoint mix for the steady, burst and injection runs (weights in percent). The public pages are
// all per-request (force-dynamic, no public cache since 21A), so this mix is entirely uncached.
const FILTERS = ["activities=Running", "levels=Advanced", "caseSizes=Large", "activities=Hiking&levels=Premium"];
const TERMS = ["Venu", "fenix", "Forerunner 12", "Instinct", "Edge 40"];
const MIX = [
  [15, () => get("/", "home")],
  [15, () => get("/c/wearables-smartwatches", "listing_newest")],
  [10, () => get("/c/wearables-smartwatches?" + pick(FILTERS), "listing_filtered")],
  // NOPRICE=1 (decision experiment): the same mix with the price sorts replaced by newest listings.
  [__ENV.NOPRICE ? 0 : 8, () => get("/c/wearables-smartwatches?sort=price-asc", "listing_price_asc")],
  [__ENV.NOPRICE ? 0 : 4, () => get("/c/wearables-smartwatches?sort=price-desc", "listing_price_desc")],
  [__ENV.NOPRICE ? 12 : 0, () => get("/c/wearables-smartwatches", "listing_newest")],
  [10, () => get("/c/wearables-smartwatches?search=" + encodeURIComponent(pick(TERMS)), "search")],
  [28, () => get("/p/perf-" + (1 + Math.floor(Math.random() * fixtures.products)), "product")],
  [5, () => get("/api/cart", "cart_get")],
  [5, () => get("/api/account/orders", "account_orders", { headers: { cookie: "__Secure-grmn-auth.session_token=" + pick(fixtures.customerCookies) } })],
];
const TOTAL = MIX.reduce((sum, [weight]) => sum + weight, 0);
export function browse() {
  let roll = Math.random() * TOTAL;
  for (const [weight, action] of MIX) { roll -= weight; if (roll < 0) return action(); }
}

const DELIVERY = { kind: "inline", address: { recipientName: "Perf Buyer", phone: "+77010000001", countryCode: "KZ", city: "Almaty", line1: "Abay 1" } };
const json = res => { try { return res.json(); } catch { return null; } };
/** A guest adds a line and asks for a quote; returns what checkout needs, or null. */
function quoted(variantId, client) {
  http.cookieJar().clear(BASE);
  const cart = json(post("/api/cart/lines", "cart_add", { variantId, quantity: 1, expectedCartVersion: 0 }, { client, allow: [409] }));
  if (!cart || typeof cart.version !== "number") return null;
  const quote = json(post("/api/cart/quote", "quote", { cartVersion: cart.version, displayCurrency: "KZT", delivery: DELIVERY }, { client, allow: [409] }));
  return quote && quote.id ? { quoteId: quote.id, cartVersion: quote.cartVersion } : null;
}
function placeOrder(ready, client, key, allow) {
  const res = post("/api/cart/checkout", "checkout", { quoteId: ready.quoteId, cartVersion: ready.cartVersion, paymentMethod: "manual" }, { client, allow, headers: { "idempotency-key": key } });
  checkoutDb.add(res.timings.duration);
  return res;
}
export function purchase() {
  const client = ip(), ready = quoted(pick(fixtures.checkoutVariants), client);
  if (!ready) return;
  const key = "perf-" + exec.scenario.iterationInTest + "-" + Math.random().toString(36).slice(2, 14);
  let res = placeOrder(ready, client, key, [409]);
  // A real client retries a lost or failed checkout with the SAME key (14A): it must never make a second order.
  for (let attempt = 0; RUN === "inject" && attempt < 5 && (res.status === 0 || res.status >= 500); attempt++) {
    sleep(2);
    res = placeOrder(ready, client, key, [409]);
    retries.add(1);
  }
  check(res, { "order placed": r => r.status === 200 });
}

// Last-unit contention: 100 shoppers quote the final unit, then all check out at the same instant.
export function setup() { return { at: Date.now() + 25000 }; }
export function lastUnit(data) {
  const client = ip(), ready = quoted(fixtures.lastUnitVariant, client);
  if (!ready) { outcome("no_quote"); return; }
  const wait = data.at - Date.now();
  if (wait > 0) sleep(wait / 1000);
  const res = placeOrder(ready, client, "last-unit-" + exec.vu.idInTest + "-" + Math.random().toString(36).slice(2, 10), [409]);
  const body = json(res);
  outcome(res.status === 200 ? "order" : body && body.error ? body.error.code : "status_" + res.status);
}

// Duplicate key: one shopper's checkout is sent 50 times at once with the same key and cart.
export function duplicateKey(data) {
  const shared = dup;
  const wait = data.at - Date.now();
  if (wait > 0) sleep(wait / 1000);
  const res = post("/api/cart/checkout", "checkout", { quoteId: shared.quoteId, cartVersion: shared.cartVersion, paymentMethod: "manual" },
    { client: shared.client, allow: [409], headers: { "idempotency-key": shared.key, cookie: shared.cookie } });
  const body = json(res);
  outcome(res.status === 200 ? "order:" + body.orderId + (body.replayed ? ":replayed" : ":first") : body && body.error ? body.error.code : "status_" + res.status);
}
