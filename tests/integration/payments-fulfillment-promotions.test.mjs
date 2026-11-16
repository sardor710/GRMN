import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

let temporary, handle;
const product = randomUUID(), variant = randomUUID(), location = randomUUID(), priorOrder = randomUUID();
const hash = value => createHash("sha256").update(value).digest("hex");
const q = (sql, values = []) => handle.pool.query(sql, values);
const reject = (sql, values, code = "23514") => assert.rejects(q(sql, values), e => { assert.equal(e.code, code); return true; });
before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "4" }));
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const root = resolve("temp"), prior = await mkdtemp(join(root, "payments-prior-"));
  assert.ok(prior.startsWith(root + sep));
  try {
    await mkdir(join(prior, "meta"));
    for (const entry of journal.entries.slice(0, 3)) await copyFile(`drizzle/${entry.tag}.sql`, join(prior, `${entry.tag}.sql`));
    await writeFile(join(prior, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 3) }));
    await migrate(handle.db, { migrationsFolder: prior });
  } finally { await rm(prior, { recursive: true, force: true }); }
  await q("INSERT INTO orders(id,order_number,contact_name,data_quality,total_minor,payment_mode) VALUES($1,'preserved-before-04b','Historical synthetic','legacy_incomplete',12345,'legacy_unknown')", [priorOrder]);
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  await q("INSERT INTO products(id,public_key,name) VALUES($1,'payments-synthetic','Қазақша / Русский / English')", [product]);
  await q("INSERT INTO product_variants(id,product_id,sku,status,is_default) VALUES($1,$2,'Payments-SKU','active',true)", [variant, product]);
  await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'payments-test','Private synthetic location')", [location]);
  await q("INSERT INTO inventory_balances(variant_id,location_id,on_hand) VALUES($1,$2,100)", [variant, location]);
}, { timeout: 120000 });
after(async () => { try { await handle?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

async function fixture(mode = "live") {
  const cart = randomUUID(), quote = randomUUID(), checkout = randomUUID(), order = randomUUID(), item = randomUUID();
  await q("INSERT INTO carts(id,guest_token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')", [cart, hash(cart)]);
  await q("INSERT INTO checkout_quotes(id,cart_id,cart_version,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES($1,$2,1,100,0,0,0,100,now()+interval '10 minutes')", [quote, cart]);
  await q("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,$4,$1::uuid::text,$5)", [checkout, cart, quote, hash(cart), hash(checkout)]);
  const client = await handle.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO orders(id,checkout_attempt_id,contact_name,contact_phone,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,placed_at,payment_mode) VALUES($1,$2,'Synthetic buyer','+77000000000',100,0,0,0,100,now(),$3)", [order, checkout, mode]);
    await client.query("INSERT INTO order_addresses(id,order_id,kind,recipient_name,phone,country_code,city,line1) VALUES($1,$2,'structured','Synthetic','+77000000000','KZ','Алматы','Synthetic address')", [randomUUID(), order]);
    await client.query("INSERT INTO order_items(id,order_id,product_id,variant_id,sku,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor) VALUES($1,$2,$3,$4,'Payments-SKU','Original item',2,50,0,0,100)", [item, order, product, variant]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  return { order, item, checkout };
}
async function attempt(f, { provider = "kaspi", environment = "sandbox", session = null } = {}) {
  const id = randomUUID();
  await q("INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,amount_minor,provider_session_id) VALUES($1,$2,$3,$4,'synthetic-merchant',$1::uuid::text,$1::uuid::text,$5,100,$6)", [id, f.order, provider, environment, hash(id), session]);
  return id;
}
async function capture(f, a) {
  const id = randomUUID();
  await q("INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,dedupe_key) SELECT $1,id,$3::uuid,provider,environment,merchant_account,$1::uuid::text,'capture',100,$1::uuid::text FROM payment_attempts WHERE id=$2", [id, a, f.order]);
  return id;
}
async function allocated(f) {
  const reservation = randomUUID(), line = randomUUID(), allocation = randomUUID();
  await q("INSERT INTO inventory_reservations(id,checkout_attempt_id,order_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [reservation, f.checkout, f.order]);
  await q("INSERT INTO reservation_lines(id,reservation_id,variant_id,location_id,quantity) VALUES($1,$2,$3,$4,2)", [line, reservation, variant, location]);
  await q("UPDATE inventory_reservations SET status='consumed',ended_at=now() WHERE id=$1", [reservation]);
  await q("INSERT INTO inventory_allocations(id,order_item_id,variant_id,location_id,quantity,reservation_line_id) VALUES($1,$2,$3,$4,2,$5)", [allocation, f.item, variant, location, line]);
  return allocation;
}
async function refund(f, tx, amount = 60) {
  const id = randomUUID();
  await q("INSERT INTO refunds(id,transaction_id,order_id,provider,environment,merchant_account,amount_minor,idempotency_key,request_hash) VALUES($1,$2,$3,'kaspi','sandbox','synthetic-merchant',$4,$1::uuid::text,$5)", [id, tx, f.order, amount, hash(id)]);
  return id;
}

test("payment schema upgrades existing orders and replays without rewriting history", async () => {
  assert.equal((await q("SELECT to_regclass('payment_attempts') AS name")).rows[0].name, "payment_attempts");
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  const row = (await q("SELECT order_number,total_minor,snapshot_sealed FROM orders WHERE id=$1", [priorOrder])).rows[0];
  assert.deepEqual(row, { order_number: "preserved-before-04b", total_minor: "12345", snapshot_sealed: true });
  const count = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries.length;
  assert.equal(Number((await q("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count), count);
});

test("only one active payable attempt wins and provider session references are scoped and unique", async () => {
  const f = await fixture();
  const result = await Promise.allSettled([attempt(f), attempt(f)]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(result.find(r => r.status === "rejected").reason.code, "23505");
  const a = result.find(r => r.status === "fulfilled").value;
  await q("UPDATE payment_attempts SET status='unknown' WHERE id=$1", [a]);
  await assert.rejects(attempt(f), e => e.code === "23505");
  await q("UPDATE payment_attempts SET status='failed' WHERE id=$1", [a]);
  await attempt(f, { session: "unique-session" });
  await assert.rejects(attempt(await fixture(), { session: "unique-session" }), e => e.code === "23505");
});

test("demo cannot record captured cash, KZT is required and financial facts are immutable", async () => {
  const demo = await fixture("demo"), d = await attempt(demo, { provider: "demo", environment: "demo" });
  await assert.rejects(capture(demo, d), e => e.code === "23514");
  const f = await fixture(), a = await attempt(f), tx = await capture(f, a);
  await reject("UPDATE payment_transactions SET amount_minor=1 WHERE id=$1", [tx]);
  await reject("DELETE FROM payment_transactions WHERE id=$1", [tx]);
  await reject("INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,currency,dedupe_key) VALUES($1,$2,$3,'kaspi','sandbox','synthetic-merchant','usd','capture',100,'USD','usd')", [randomUUID(), a, f.order]);
  await reject("INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,dedupe_key) SELECT $1,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,$1::uuid::text FROM payment_transactions WHERE id=$2", [randomUUID(), tx], "23505");
});

test("concurrent refund reservations include unresolved outcomes and cannot exceed captured cash", async () => {
  const f = await fixture(), a = await attempt(f), tx = await capture(f, a);
  const outcomes = await Promise.allSettled([refund(f, tx), refund(f, tx)]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(r => r.status === "rejected").reason.code, "23514");
  const r = outcomes.find(r => r.status === "fulfilled").value;
  await q("UPDATE refunds SET status='unknown' WHERE id=$1", [r]);
  await assert.rejects(refund(f, tx), e => e.code === "23514");
  await q("UPDATE refunds SET status='failed' WHERE id=$1", [r]);
  const replacement = await refund(f, tx, 100);
  await q("UPDATE refunds SET status='succeeded' WHERE id=$1", [replacement]);
  await reject("UPDATE refunds SET status='failed' WHERE id=$1", [replacement]);
});

test("refund item ownership and immutable allocations keep amounts attached to their order", async () => {
  const f = await fixture(), other = await fixture(), a = await attempt(f), tx = await capture(f, a), r = await refund(f, tx, 50), row = randomUUID();
  await reject("INSERT INTO refund_items(id,refund_id,order_id,order_item_id,kind,quantity,net_minor,discount_minor,tax_minor,amount_minor) VALUES($1,$2,$3,$4,'item',1,50,0,0,50)", [randomUUID(), r, f.order, other.item], "23503");
  await q("INSERT INTO refund_items(id,refund_id,order_id,order_item_id,kind,quantity,net_minor,discount_minor,tax_minor,amount_minor) VALUES($1,$2,$3,$4,'item',1,50,0,0,50)", [row, r, f.order, f.item]);
  await reject("UPDATE refund_items SET amount_minor=1 WHERE id=$1", [row]);
});

test("shipment claims serialize at allocation quantity and cannot overlap restored units", async () => {
  const f = await fixture(), allocation = await allocated(f), shipments = [randomUUID(), randomUUID()];
  for (const s of shipments) await q("INSERT INTO shipments(id,order_id) VALUES($1,$2)", [s, f.order]);
  const results = await Promise.allSettled(shipments.map(s => q("INSERT INTO shipment_items(id,shipment_id,order_id,order_item_id,allocation_id,quantity) VALUES($1,$2,$3,$4,$5,2)", [randomUUID(), s, f.order, f.item, allocation])));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "23514");
  await reject("UPDATE inventory_allocations SET restored_quantity=1 WHERE id=$1", [allocation]);
  const winner = (await q("SELECT shipment_id FROM shipment_items WHERE allocation_id=$1", [allocation])).rows[0].shipment_id;
  await q("UPDATE shipments SET status='cancelled' WHERE id=$1", [winner]);
  await q("UPDATE inventory_allocations SET restored_quantity=1 WHERE id=$1", [allocation]);
});

test("manual fulfillment keeps event evidence deduplicated and return claims bounded by shipped quantities", async () => {
  const f = await fixture(), allocation = await allocated(f), shipment = randomUUID(), line = randomUUID(), event = randomUUID();
  await q("INSERT INTO shipments(id,order_id) VALUES($1,$2)", [shipment, f.order]);
  await q("INSERT INTO shipment_items(id,shipment_id,order_id,order_item_id,allocation_id,quantity) VALUES($1,$2,$3,$4,$5,2)", [line, shipment, f.order, f.item, allocation]);
  await q("UPDATE shipments SET status='ready' WHERE id=$1", [shipment]);
  await q("UPDATE shipments SET status='dispatched',dispatched_at=now() WHERE id=$1", [shipment]);
  await reject("UPDATE shipments SET status='cancelled' WHERE id=$1", [shipment]);
  await q("INSERT INTO shipment_events(id,shipment_id,type,source,dedupe_key) VALUES($1,$2,'staff-dispatched','manual','event-one')", [event, shipment]);
  await reject("DELETE FROM shipment_events WHERE id=$1", [event]);
  await reject("INSERT INTO shipment_events(id,shipment_id,type,source,dedupe_key) VALUES($1,$2,'staff-dispatched','manual','event-one')", [randomUUID(), shipment], "23505");
  const returns = [randomUUID(), randomUUID()];
  for (const r of returns) await q("INSERT INTO returns(id,order_id,reason,idempotency_key) VALUES($1,$2,'Synthetic return',$1::uuid::text)", [r, f.order]);
  const outcomes = await Promise.allSettled(returns.map(r => q("INSERT INTO return_items(id,return_id,order_id,order_item_id,shipment_item_id,quantity) VALUES($1,$2,$3,$4,$5,2)", [randomUUID(), r, f.order, f.item, line])));
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(o => o.status === "rejected").reason.code, "23514");
  const returned = (await q("SELECT id,return_id FROM return_items WHERE shipment_item_id=$1", [line])).rows[0];
  await reject("UPDATE return_items SET received_quantity=1,accepted_quantity=1,restocked_quantity=1,restock_decision='restock',restock_location_id=$1,inspected_at=now() WHERE id=$2", [location, returned.id]);
  await q("UPDATE returns SET status='authorized' WHERE id=$1", [returned.return_id]);
  await q("UPDATE returns SET status='received',received_at=now() WHERE id=$1", [returned.return_id]);
  await q("UPDATE returns SET status='inspected',inspected_at=now() WHERE id=$1", [returned.return_id]);
  await q("UPDATE return_items SET received_quantity=1,accepted_quantity=1,restocked_quantity=1,restock_decision='restock',restock_location_id=$1,inspected_at=now() WHERE id=$2", [location, returned.id]);
  await q("UPDATE inventory_allocations SET restored_quantity=1 WHERE id=$1", [allocation]);
  await reject("UPDATE inventory_allocations SET restored_quantity=2 WHERE id=$1", [allocation]);
  assert.equal((await q("SELECT on_hand FROM inventory_balances WHERE variant_id=$1 AND location_id=$2", [variant, location])).rows[0].on_hand, 100);
});

test("coupons preserve legacy usage and serialize the final available redemption", async () => {
  const p = randomUUID(), fixtures = [await fixture(), await fixture()];
  await q("INSERT INTO promotions(id,code,name,kind,fixed_minor,usage_limit,legacy_used_count,status) VALUES($1,'summer','Synthetic coupon','fixed',10,2,1,'active')", [p]);
  await reject("INSERT INTO promotions(id,code,name,kind,fixed_minor) VALUES($1,'summer','Duplicate','fixed',10)", [randomUUID()], "23505");
  await reject("INSERT INTO promotions(id,code,name,kind,percentage_bps) VALUES($1,'INVALID','Invalid','percentage',10001)", [randomUUID()]);
  const outcomes = await Promise.allSettled(fixtures.map(f => q("INSERT INTO promotion_redemptions(id,promotion_id,checkout_attempt_id,order_id,amount_minor,expires_at) VALUES($1,$2,$3,$4,10,now()+interval '10 minutes')", [randomUUID(), p, f.checkout, f.order])));
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(r => r.status === "rejected").reason.code, "23514");
  assert.equal((await q("SELECT legacy_used_count FROM promotions WHERE id=$1", [p])).rows[0].legacy_used_count, 1);
});

test("coupon subject limits and markdown scope remain separate from public catalog prices", async () => {
  const p = randomUUID(), rule = randomUUID(), f = await fixture();
  await q("INSERT INTO promotions(id,code,name,kind,percentage_bps,per_customer_limit,status) VALUES($1,'subject','Subject coupon','percentage',1000,1,'active')", [p]);
  await reject("INSERT INTO promotion_redemptions(id,promotion_id,checkout_attempt_id,amount_minor,expires_at) VALUES($1,$2,$3,1,now()+interval '10 minutes')", [randomUUID(), p, f.checkout]);
  await q("INSERT INTO promotion_redemptions(id,promotion_id,checkout_attempt_id,subject_hash,amount_minor,expires_at) VALUES($1,$2,$3,$4,1,now()+interval '10 minutes')", [randomUUID(), p, f.checkout, hash("verified-subject")]);
  await reject("INSERT INTO price_adjustment_rules(id,name,kind,percentage_bps) VALUES($1,'Invalid markdown','percentage',10001)", [rule]);
  await q("INSERT INTO price_adjustment_rules(id,name,kind,fixed_minor) VALUES($1,'Admin markdown','fixed',10)", [rule]);
  await q("INSERT INTO price_adjustment_variants(rule_id,variant_id) VALUES($1,$2)", [rule, variant]);
  await reject("INSERT INTO price_adjustment_variants(rule_id,variant_id) VALUES($1,$2)", [rule, variant], "23505");
  await reject("INSERT INTO promotion_variants(promotion_id,variant_id) VALUES($1,$2)", [p, randomUUID()], "23503");
  const other = await fixture();
  await reject("INSERT INTO promotion_redemptions(id,promotion_id,checkout_attempt_id,subject_hash,amount_minor,expires_at) VALUES($1,$2,$3,$4,1,now()+interval '10 minutes')", [randomUUID(), p, other.checkout, hash("verified-subject")]);
});

test("repeatable-read stale refund writers serialize instead of oversubscribing the capture", async () => {
  const f = await fixture(), a = await attempt(f), tx = await capture(f, a);
  const clients = await Promise.all([handle.pool.connect(), handle.pool.connect()]);
  try {
    for (const client of clients) {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await client.query("SELECT refund_epoch FROM payment_transactions WHERE id=$1", [tx]);
    }
    const outcomes = await Promise.allSettled(clients.map(async client => {
      const id = randomUUID();
      try {
        await client.query("INSERT INTO refunds(id,transaction_id,order_id,provider,environment,merchant_account,amount_minor,idempotency_key,request_hash) VALUES($1,$2,$3,'kaspi','sandbox','synthetic-merchant',60,$1::uuid::text,$4)", [id, tx, f.order, hash(id)]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }));
    assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1);
    assert.equal(outcomes.find(o => o.status === "rejected").reason.code, "40001");
  } finally { for (const client of clients) client.release(); }
});

test("an inspected partial return does not block shipment of an untouched allocated unit", async () => {
  for (const restoreFirst of [true, false]) {
    const f = await fixture(), allocation = await allocated(f), first = randomUUID(), line = randomUUID(), r = randomUUID(), ri = randomUUID();
    await q("INSERT INTO shipments(id,order_id) VALUES($1,$2)", [first, f.order]);
    await q("INSERT INTO shipment_items(id,shipment_id,order_id,order_item_id,allocation_id,quantity) VALUES($1,$2,$3,$4,$5,1)", [line, first, f.order, f.item, allocation]);
    await q("UPDATE shipments SET status='ready' WHERE id=$1", [first]);
    await q("UPDATE shipments SET status='dispatched',dispatched_at=now() WHERE id=$1", [first]);
    await q("INSERT INTO returns(id,order_id,reason,idempotency_key) VALUES($1,$2,'Synthetic partial return',$1::uuid::text)", [r, f.order]);
    await q("INSERT INTO return_items(id,return_id,order_id,order_item_id,shipment_item_id,quantity) VALUES($1,$2,$3,$4,$5,1)", [ri, r, f.order, f.item, line]);
    await q("UPDATE returns SET status='authorized' WHERE id=$1", [r]);
    await q("UPDATE returns SET status='received',received_at=now() WHERE id=$1", [r]);
    await q("UPDATE returns SET status='inspected',inspected_at=now() WHERE id=$1", [r]);
    await q("UPDATE return_items SET received_quantity=1,accepted_quantity=1,restocked_quantity=1,restock_decision='restock',restock_location_id=$1,inspected_at=now() WHERE id=$2", [location, ri]);
    if (restoreFirst) await q("UPDATE inventory_allocations SET restored_quantity=1 WHERE id=$1", [allocation]);
    const next = randomUUID();
    await q("INSERT INTO shipments(id,order_id) VALUES($1,$2)", [next, f.order]);
    await q("INSERT INTO shipment_items(id,shipment_id,order_id,order_item_id,allocation_id,quantity) VALUES($1,$2,$3,$4,$5,1)", [randomUUID(), next, f.order, f.item, allocation]);
    const extra = randomUUID();
    await q("INSERT INTO shipments(id,order_id) VALUES($1,$2)", [extra, f.order]);
    await reject("INSERT INTO shipment_items(id,shipment_id,order_id,order_item_id,allocation_id,quantity) VALUES($1,$2,$3,$4,$5,1)", [randomUUID(), extra, f.order, f.item, allocation]);
    if (!restoreFirst) await q("UPDATE inventory_allocations SET restored_quantity=1 WHERE id=$1", [allocation]);
  }
});
