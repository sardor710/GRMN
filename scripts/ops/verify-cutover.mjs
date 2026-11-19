// Task 23/24: cutover verification while the store is still CLOSED (runbook step A5). Talks only to
// the public HTTPS origin, as a customer and as a staff member would; it never touches the database.
//   node scripts/ops/verify-cutover.mjs --base https://<domain> --credentials <operator.json>
//        [--products key1,key2] [--variant <uuid>] [--publish <pageId>:<pageVersion> ...] [--redirect /from=/to ...] [--open] [--insecure-tls] [--out file]
//        [--create-product <product.json>] [--delivery-rule <feeMinor>:<freeFromMinor>]
// operator.json (private, 0600): {"email","password","totpSecret"?}. Without totpSecret the staff
// account is enrolled in TOTP on first use and the secret and backup codes are written back to the
// file (rehearsal only; a production operator enrols in the browser and supplies the secret).
// --variant enables the purchase checks: opening stock (+5 received), a guest manual-payment
// purchase, staff confirmation to "paid", a shipment, and a second order cancelled (stock released).
// --create-product (Task 24: the catalog starts empty) has staff create that product through the
// admin, then uses its default variant for the purchase checks. --delivery-rule checks the quoted
// delivery fee: <feeMinor> below the free-delivery threshold, 0 from <freeFromMinor> upwards.
// Every check prints PASS or FAIL; the exit code is 1 if any failed. Prints no personal data.
import { readFile, writeFile } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const all = name => args.flatMap((a, i) => a === name ? [args[i + 1]] : []);
if (args.includes("--insecure-tls")) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const BASE = opt("--base"), credFile = opt("--credentials");
if (!BASE || !credFile) { console.error("--base and --credentials are required"); process.exit(2); }
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); return Boolean(ok); };

// A tiny cookie jar per actor.
function jar() { const cookies = new Map(); return {
  header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
  take(res) { for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const [k, ...v] = pair.split("="); const value = v.join("="); if (/Max-Age=0/i.test(line) || value === "") cookies.delete(k.trim()); else cookies.set(k.trim(), value); } },
  has: name => cookies.has(name), set: (k, v) => cookies.set(k, v) }; }
async function call(j, method, path, { body, headers = {} } = {}) {
  const res = await fetch(BASE + path, { method, redirect: "manual", headers: { ...(j ? { cookie: j.header() } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(method !== "GET" ? { origin: BASE } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  j?.take(res);
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, text, json, headers: res.headers };
}
function totp(secret, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(counter).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

const products = (opt("--products") ?? "").split(",").filter(Boolean);
const customer = jar(), staff = jar();

// 1. Closed: customers see the maintenance page and cannot write.
const closedHome = await call(customer, "GET", "/");
check("closed: storefront answers 503 maintenance", closedHome.status === 503 && /right back/i.test(closedHome.text), `status ${closedHome.status}`);
const closedWrite = await call(customer, "POST", "/api/cart/lines", { body: {} });
check("closed: cart write refused with MAINTENANCE", closedWrite.status === 503 && closedWrite.json?.error?.code === "MAINTENANCE", `status ${closedWrite.status}`);

// 2. Staff sign-in, MFA (enrolling on first use) and the maintenance bypass.
const cred = JSON.parse(await readFile(credFile, "utf8"));
const signIn = await call(staff, "POST", "/api/auth/sign-in/email", { body: { email: cred.email, password: cred.password } });
check("staff sign-in", signIn.status === 200, `status ${signIn.status}`);
if (!cred.totpSecret) {
  const enable = await call(staff, "POST", "/api/auth/two-factor/enable", { body: { password: cred.password } });
  const secret = enable.json?.totpURI ? new URL(enable.json.totpURI).searchParams.get("secret") : null;
  check("staff TOTP enrolment", enable.status === 200 && secret, `status ${enable.status}`);
  if (secret) { cred.totpSecret = secret; cred.backupCodes = enable.json.backupCodes; await writeFile(credFile, JSON.stringify(cred, null, 2), { mode: 0o600 }); }
}
const mfa = await call(staff, "POST", "/api/auth/two-factor/verify-totp", { body: { code: totp(cred.totpSecret) } });
check("staff MFA verified (TOTP)", mfa.status === 200, `status ${mfa.status}`);
const bypass = await call(staff, "POST", "/api/admin/maintenance-bypass");
check("maintenance bypass issued to staff", bypass.status === 200 && staff.has("grmn-maintenance-bypass"), `status ${bypass.status}`);
const bypassCookie = staff.header().split("; ").find(c => c.startsWith("grmn-maintenance-bypass="))?.split("=").slice(1).join("=");
if (bypassCookie) customer.set("grmn-maintenance-bypass", bypassCookie);

// 2b. Staff publish reviewed imported content (imports are drafts by design):
//     --publish <pageId>:<pageVersion> publishes that page's newest version.
for (const pair of all("--publish")) {
  const [pageId, pageVersion] = pair.split(":");
  const history = await call(staff, "GET", `/api/admin/content?pageId=${pageId}`);
  const latest = (history.json?.items ?? [])[0];
  const pub = latest ? await call(staff, "POST", "/api/admin/content", { body: { action: "publish", pageId, versionId: latest.id, expectedPageVersion: Number(pageVersion) } }) : { status: history.status };
  check(`staff publishes reviewed page ${pageId.slice(0, 8)}`, pub.status === 200, `status ${pub.status}`);
}

// 2c. Staff create a product through the admin (the catalog starts empty at launch).
let createdVariant;
if (opt("--create-product")) {
  const input = JSON.parse(await readFile(opt("--create-product"), "utf8"));
  const created = await call(staff, "POST", "/api/admin/products", { body: input });
  check(`staff create product ${input.sku}`, created.status === 200 && created.json?.success === true, `status ${created.status} ${created.status === 200 ? "" : created.text.slice(0, 160)}`);
  const found = await call(staff, "GET", `/api/admin/products?search=${encodeURIComponent(input.sku)}`);
  const product = (found.json?.products ?? []).find(p => p.sku === input.sku);
  const key = product?.slug ?? product?.id;
  if (key) products.push(key);
  // The admin product DTO carries no variant ids; the storefront page does (as a shopper's browser sees it).
  const page = key ? await call(customer, "GET", `/ru/p/${encodeURIComponent(key)}`) : { text: "" };
  createdVariant = page.text.match(/selectedVariantId\\?":\\?"([0-9a-f-]{36})/)?.[1] ?? page.text.match(/variants\\?":\[\{\\?"id\\?":\\?"([0-9a-f-]{36})/)?.[1];
  check("created product page offers a sellable variant", Boolean(createdVariant), `page ${page.status ?? "-"}`);
}

// 3. Public pages through the bypass.
// Every public page carries a language prefix (en/ru/kk); unprefixed paths redirect (307) to one.
const root = await call(customer, "GET", "/");
check("unprefixed / redirects to a language", root.status === 307 && /^\/(en|ru|kz)(\/|$)/.test(new URL(root.headers.get("location") ?? "/", BASE).pathname), `status ${root.status} → ${root.headers.get("location")}`);
const pages = ["/en", "/ru", "/kz", "/ru/c/wearables-smartwatches", "/kz/c/wearables-smartwatches?sort=price-asc", "/en/c/wearables-smartwatches?sort=price-desc", "/ru/c/wearables-smartwatches?search=a", "/ru/blog", "/ru/cart", "/robots.txt", "/sitemap.xml"];
for (const path of pages) { const r = await call(customer, "GET", path); check(`page ${path}`, r.status === 200, `status ${r.status}`); }
const sitemap = await call(customer, "GET", "/sitemap.xml");
for (const key of products) {
  const r = await call(customer, "GET", `/ru/p/${encodeURIComponent(key)}`);
  check(`product /ru/p/${key}`, r.status === 200, `status ${r.status}`);
  check(`product ${key} has a canonical link`, /<link[^>]+rel="canonical"/.test(r.text));
  check(`product ${key} is in the sitemap`, sitemap.text.includes(`/p/${encodeURIComponent(key)}`));
  const images = [...new Set([...r.text.matchAll(/(?:src|srcSet|srcset)="(\/images\/[^" ?]+)/g)].map(m => m[1]))].slice(0, 5);
  for (const src of images) { const img = await fetch(BASE + src); check(`image ${src}`, img.ok && /^image\//.test(img.headers.get("content-type") ?? ""), `status ${img.status}`); }
}
for (const pair of all("--redirect")) {
  const [from, to] = pair.split("="); const r = await call(customer, "GET", from);
  check(`redirect ${from}`, [301, 308].includes(r.status) && new URL(r.headers.get("location"), BASE).pathname === to, `status ${r.status} → ${r.headers.get("location")}`);
}

// 4. Purchase path (needs a sellable variant).
const variant = opt("--variant") ?? createdVariant;
const deliveryRule = opt("--delivery-rule")?.split(":").map(BigInt);
const delivery = { kind: "inline", address: { recipientName: "Rehearsal Buyer", phone: "+77010000023", countryCode: "KZ", city: "Almaty", line1: "Rehearsal street 23" } };
async function guestOrder() {
  const buyer = jar(); buyer.set("grmn-maintenance-bypass", bypassCookie ?? "");
  const add = await call(buyer, "POST", "/api/cart/lines", { body: { variantId: variant, quantity: 1, expectedCartVersion: 0 } });
  const quote = await call(buyer, "POST", "/api/cart/quote", { body: { cartVersion: add.json?.version, displayCurrency: "KZT", delivery } });
  const order = await call(buyer, "POST", "/api/cart/checkout", { body: { quoteId: quote.json?.id, cartVersion: quote.json?.cartVersion, paymentMethod: "manual" }, headers: { "idempotency-key": "rehearsal-" + randomUUID() } });
  return { buyer, add, quote, order };
}
const stockOf = async () => (await call(staff, "GET", `/api/admin/inventory?variantId=${variant}`)).json;
if (variant) {
  const received = await call(staff, "POST", "/api/admin/inventory", { body: { variantId: variant, delta: 5, reason: "receive", note: "Cutover rehearsal opening stock", idempotencyKey: "rehearsal-open-" + variant } });
  check("opening stock received through admin inventory (+5)", received.status === 200, `status ${received.status}`);
  const before = await stockOf();
  const { buyer, add, quote, order } = await guestOrder();
  check("guest cart add", add.status === 200, `status ${add.status}`);
  check("guest quote in KZT", quote.status === 200 && quote.json?.total?.currency === "KZT", `status ${quote.status}`);
  if (deliveryRule) {
    const [fee, freeFrom] = deliveryRule, goods = BigInt(quote.json?.subtotal?.amountMinor ?? -1), shipping = quote.json?.shipping?.amountMinor;
    check(`delivery fee ${goods < freeFrom ? "charged below" : "free from"} the threshold`, shipping === String(goods < freeFrom ? fee : 0n), `goods ${goods}, delivery ${shipping}`);
    // A quote-only cart just over the threshold (no checkout, so no stock is held).
    const unit = BigInt(quote.json?.lines?.[0]?.unitPrice?.amountMinor ?? quote.json?.subtotal?.amountMinor ?? 0);
    if (unit > 0n && goods < freeFrom) {
      const big = jar(); big.set("grmn-maintenance-bypass", bypassCookie ?? "");
      const quantity = Number((freeFrom + unit - 1n) / unit);
      const bigAdd = await call(big, "POST", "/api/cart/lines", { body: { variantId: variant, quantity, expectedCartVersion: 0 } });
      const bigQuote = await call(big, "POST", "/api/cart/quote", { body: { cartVersion: bigAdd.json?.version, displayCurrency: "KZT", delivery } });
      check("delivery free from the threshold", bigQuote.status === 200 && bigQuote.json?.shipping?.amountMinor === "0" && BigInt(bigQuote.json?.subtotal?.amountMinor ?? 0) >= freeFrom, `status ${bigQuote.status}, ${quantity} × ${unit}: goods ${bigQuote.json?.subtotal?.amountMinor}, delivery ${bigQuote.json?.shipping?.amountMinor}`);
    }
  }
  check("guest manual checkout: order awaiting payment", order.status === 200 && order.json?.status === "pending_payment", `status ${order.status}`);
  const status = await call(buyer, "POST", "/api/cart/checkout/status", { body: { orderId: order.json?.orderId, statusToken: order.json?.statusToken } });
  check("receipt: awaiting payment with instructions and a pay-by time", status.status === 200 && status.json?.paymentMethod === "manual" && status.json?.paymentInstructions && status.json?.payBy, `status ${status.status}`);
  const held = await stockOf();
  check("stock held for the unpaid order", held?.reserved === (before?.reserved ?? 0) + 1, `reserved ${before?.reserved} → ${held?.reserved}`);
  const reference = "REHEARSAL-" + randomUUID().slice(0, 8).toUpperCase();
  const confirm = await call(staff, "POST", "/api/admin/orders", { body: { action: "confirm_payment", orderId: order.json?.orderId, method: "kaspi", reference, amountMinor: order.json?.total?.amountMinor } });
  check("staff confirms the payment: order paid", confirm.status === 200 && confirm.json?.order?.paymentStatus === "paid", `status ${confirm.status}`);
  const detail = (await call(staff, "GET", `/api/admin/orders?id=${order.json?.orderId}`)).json;
  const items = detail?.order?.items ?? detail?.items ?? [];
  const ship = await call(staff, "POST", "/api/admin/orders", { body: { action: "create_shipment", orderId: order.json?.orderId, expectedOrderVersion: detail?.order?.version ?? detail?.version, idempotencyKey: "rehearsal-ship-" + randomUUID(), lines: items.map(i => ({ orderItemId: i.id, quantity: i.quantity })), carrier: "Rehearsal courier" } });
  check("paid order ships (shipment created)", ship.status === 200, `status ${ship.status}`);
  const second = await guestOrder();
  check("second guest order placed", second.order.status === 200, `status ${second.order.status}`);
  const v2 = (await call(staff, "GET", `/api/admin/orders?id=${second.order.json?.orderId}`)).json;
  const cancel = await call(staff, "POST", "/api/admin/orders", { body: { action: "cancel_order", orderId: second.order.json?.orderId, expectedOrderVersion: v2?.order?.version ?? v2?.version, idempotencyKey: "rehearsal-cancel-" + randomUUID(), reason: "Cutover rehearsal test order" } });
  check("staff cancels the unpaid second order", cancel.status === 200, `status ${cancel.status}`);
  const after = await stockOf();
  check("cancelled order released its stock", after?.reserved === held?.reserved - 1 + 0 && after?.onHand === held?.onHand - 1, `onHand ${held?.onHand} → ${after?.onHand}, reserved ${held?.reserved} → ${after?.reserved}`);
  results.push({ name: "test orders", ok: true, detail: `paid+shipped ${order.json?.orderNumber}, cancelled ${second.order.json?.orderNumber}` });
  console.log(`INFO test orders: paid+shipped ${order.json?.orderNumber}, cancelled ${second.order.json?.orderNumber}`);
}
const today = new Date().toISOString().slice(0, 10);
const report = await call(staff, "GET", `/api/admin/reports?view=summary&from=${today}&to=${today}&timeZone=Asia/Almaty`);
check("admin revenue report answers", report.status === 200, `status ${report.status}`);

// 5. --open (step A6, only after every check above passed): staff turn maintenance off in admin
//    settings; customers then reach the store without the bypass (the flag cache is 5 s).
if (args.includes("--open")) {
  if (results.some(r => !r.ok)) check("store reopened", false, "not attempted: earlier checks failed");
  else {
    const settings = await call(staff, "GET", "/api/admin/settings");
    const opened = await call(staff, "PUT", "/api/admin/settings", { body: { expectedVersion: settings.json?.version, maintenanceMode: false } });
    check("staff turn maintenance off", opened.status === 200 && opened.json?.maintenanceMode === false, `status ${opened.status}`);
    await new Promise(r => setTimeout(r, 6000));
    const visitor = jar(), home = await call(visitor, "GET", "/ru"), cart = await call(visitor, "GET", "/api/cart");
    check("reopened: a customer without the bypass gets the store", home.status === 200 && cart.status === 200, `home ${home.status}, cart ${cart.status}`);
  }
}

const failed = results.filter(r => !r.ok);
const out = opt("--out");
if (out) await writeFile(out, JSON.stringify({ at: new Date().toISOString(), base: BASE, passed: results.length - failed.length, failed: failed.length, results }, null, 2), { mode: 0o600 });
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
